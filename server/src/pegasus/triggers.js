import { pegasusGet } from './client.js';
import { normalizePhoneForComparison } from '../utils/phoneMatch.js';

export const PROCESS_TYPE_FIELDS = [
  'type',
  'name',
  'action',
  'key',
  'plugin',
  'service',
  'provider',
  'process_type',
  'processType',
];

const TWILIO_PROVIDER_FIELDS = ['service', 'provider', 'plugin'];
const CALL_LABEL_FIELDS = ['action', 'name', 'type', 'key', 'process_type', 'processType'];
const PHONE_PATTERN = /^\+?\d{7,15}$/;

const DESTINATION_PATHS = [
  ['config', 'destinations'],
  ['config', 'destination'],
  ['destinations'],
  ['destination'],
  ['phones'],
  ['phone'],
  ['numbers'],
  ['number'],
  ['recipients'],
  ['recipient'],
  ['to'],
  ['params', 'to'],
  ['params', 'destinations'],
  ['settings', 'to'],
  ['settings', 'destinations'],
  ['config', 'params', 'to'],
  ['config', 'params', 'destinations'],
  ['config', 'settings', 'to'],
  ['config', 'settings', 'destinations'],
];

function normalizeTriggerArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.triggers)) {
      return payload.triggers;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
  }
  return [];
}

function dedupe(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    const key = normalizePhoneForComparison(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePhone(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.replace(/[\s\-().]/g, '');
    if (!PHONE_PATTERN.test(normalized)) {
      return null;
    }
    return normalized;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizePhone(String(value));
  }

  if (isPlainObject(value)) {
    return normalizePhone(value.number ?? value.phone ?? value.value ?? value.to);
  }

  return null;
}

function destinationsFromValue(value) {
  const found = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const phone = normalizePhone(item);
      if (phone) {
        found.push(phone);
      }
    }
    return found;
  }

  const phone = normalizePhone(value);
  if (phone) {
    found.push(phone);
  }

  return found;
}

function getPathValue(object, path) {
  let current = object;
  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function destinationsFromProcess(process) {
  if (!isPlainObject(process)) {
    return [];
  }

  const found = [];
  for (const path of DESTINATION_PATHS) {
    found.push(...destinationsFromValue(getPathValue(process, path)));
  }
  return found;
}

function normalizeLabel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function readLabels(process, field) {
  const labels = [];
  const value = process?.[field];
  if (typeof value === 'string') {
    labels.push(normalizeLabel(value));
  }
  if (isPlainObject(process?.config) && typeof process.config[field] === 'string') {
    labels.push(normalizeLabel(process.config[field]));
  }
  return labels;
}

function labelsIncludeTwilioCall(labels) {
  return labels.some((label) => label === 'twilio/call');
}

function labelsIncludeTwilioAndCall(process) {
  const twilioLabels = TWILIO_PROVIDER_FIELDS.flatMap((field) => readLabels(process, field));
  const callLabels = CALL_LABEL_FIELDS.flatMap((field) => readLabels(process, field));

  const hasTwilio = twilioLabels.some((label) => label === 'twilio' || label.includes('twilio'));
  const hasCall = callLabels.some((label) => label === 'call' || label.endsWith('/call'));
  return hasTwilio && hasCall;
}

function isTwilioCallProcess(process) {
  if (!isPlainObject(process)) {
    return false;
  }

  const labels = PROCESS_TYPE_FIELDS.flatMap((field) => readLabels(process, field));
  if (labelsIncludeTwilioCall(labels)) {
    return true;
  }

  if (labels.some((label) => label.includes('twilio') && label.includes('call'))) {
    return true;
  }

  return labelsIncludeTwilioAndCall(process);
}

export function collectProcesses(trigger) {
  if (!isPlainObject(trigger)) {
    return [];
  }

  const processes = [];

  const addArray = (items) => {
    if (Array.isArray(items)) {
      processes.push(...items.filter((item) => isPlainObject(item)));
    }
  };

  const addObject = (item) => {
    if (isPlainObject(item)) {
      processes.push(item);
    }
  };

  addArray(trigger.processes);
  addArray(trigger.process);
  addObject(Array.isArray(trigger.process) ? null : trigger.process);
  addArray(trigger.actions);
  addArray(trigger.tasks);
  addArray(trigger.config?.processes);
  addObject(trigger.config?.process);
  addArray(trigger.config?.actions);
  addArray(trigger.config?.tasks);

  return processes;
}

function extractDestinationsFromTrigger(trigger) {
  const numbers = [];

  for (const process of collectProcesses(trigger)) {
    if (!isTwilioCallProcess(process)) {
      continue;
    }

    numbers.push(...destinationsFromProcess(process));
  }

  return dedupe(numbers);
}

function resolveTriggerId(trigger) {
  if (!isPlainObject(trigger)) {
    return null;
  }
  return trigger.id ?? trigger.trigger_id ?? trigger.triggerId ?? null;
}

/**
 * Extract Twilio call destinations from one or more Pegasus triggers.
 */
export function extractTwilioDestinations(triggersInput) {
  const triggers = Array.isArray(triggersInput)
    ? triggersInput
    : triggersInput
      ? [triggersInput]
      : [];

  const byTrigger = [];
  const all = [];

  for (const trigger of triggers) {
    const destinations = extractDestinationsFromTrigger(trigger);
    byTrigger.push({
      triggerId: resolveTriggerId(trigger),
      destinations,
    });
    all.push(...destinations);
  }

  const destinations = dedupe(all);

  return {
    triggerCount: triggers.length,
    destinationCount: destinations.length,
    destinations,
    byTrigger,
  };
}

export function collectTriggersFromResources(resources) {
  const triggers = [];

  for (const resource of resources) {
    if (!isPlainObject(resource)) {
      continue;
    }

    if (resource.resourceType === 'trigger' || resource.type === 'trigger') {
      triggers.push(resource);
      continue;
    }

    if (
      Array.isArray(resource.processes) ||
      Array.isArray(resource.process) ||
      isPlainObject(resource.process) ||
      Array.isArray(resource.actions) ||
      Array.isArray(resource.tasks) ||
      Array.isArray(resource.config?.processes) ||
      Array.isArray(resource.config?.actions) ||
      Array.isArray(resource.config?.tasks)
    ) {
      triggers.push(resource);
      continue;
    }

    if (resource.trigger && typeof resource.trigger === 'object') {
      triggers.push(resource.trigger);
    }

    if (Array.isArray(resource.triggers)) {
      for (const trigger of resource.triggers) {
        if (trigger && typeof trigger === 'object') {
          triggers.push(trigger);
        }
      }
    }
  }

  return triggers;
}

export async function listTriggers({ token, resourceId } = {}) {
  const query = resourceId ? `?resource_id=${encodeURIComponent(resourceId)}` : '';
  const payload = await pegasusGet(`/api/triggers${query}`, { token });
  return normalizeTriggerArray(payload);
}
