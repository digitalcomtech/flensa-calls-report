import { pegasusGet } from './client.js';

const TWILIO_CALL_IDENTIFIERS = new Set(['twilio/call']);

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
  return [...new Set(values)];
}

function normalizePhone(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === 'object') {
    return normalizePhone(value.number ?? value.phone ?? value.value);
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

function destinationsFromConfig(config) {
  if (!config || typeof config !== 'object') {
    return [];
  }

  return [
    ...destinationsFromValue(config.destinations),
    ...destinationsFromValue(config.destination),
  ];
}

function isTwilioCallProcess(process) {
  if (!process || typeof process !== 'object') {
    return false;
  }

  const identifiers = [process.type, process.name, process.action];
  return identifiers.some((value) => TWILIO_CALL_IDENTIFIERS.has(value));
}

function collectProcesses(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    return [];
  }

  const processes = [];

  if (Array.isArray(trigger.processes)) {
    processes.push(...trigger.processes);
  }
  if (Array.isArray(trigger.process)) {
    processes.push(...trigger.process);
  } else if (trigger.process && typeof trigger.process === 'object') {
    processes.push(trigger.process);
  }
  if (Array.isArray(trigger.config?.processes)) {
    processes.push(...trigger.config.processes);
  }

  return processes.filter((process) => process && typeof process === 'object');
}

function extractDestinationsFromTrigger(trigger) {
  const numbers = [];

  for (const process of collectProcesses(trigger)) {
    if (!isTwilioCallProcess(process)) {
      continue;
    }

    numbers.push(...destinationsFromConfig(process.config));
    numbers.push(...destinationsFromConfig(process));
    numbers.push(...destinationsFromValue(process.destinations));
  }

  return dedupe(numbers);
}

function resolveTriggerId(trigger) {
  if (!trigger || typeof trigger !== 'object') {
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
    if (!resource || typeof resource !== 'object') {
      continue;
    }

    if (
      resource.resourceType === 'trigger' ||
      resource.type === 'trigger'
    ) {
      triggers.push(resource);
      continue;
    }

    if (
      Array.isArray(resource.processes) ||
      Array.isArray(resource.process) ||
      (resource.process && typeof resource.process === 'object') ||
      Array.isArray(resource.config?.processes)
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
