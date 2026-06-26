import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTriggerDiagnostics } from './triggerDiagnostics.js';
import { buildSafeScopeDiagnostics, containsFullPhoneNumber, normalizeTriggerDiagnosticsForApi } from '../reports/scopeDiagnostics.js';

const SAMPLE_TRIGGERS = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  email: 'hidden@example.com',
  token: 'secret-token',
  processes: index % 2 === 0
    ? [
        {
          type: 'twilio/call',
          config: { destinations: [`+5255000000${String(index).padStart(2, '0')}`] },
        },
      ]
    : [],
  actions: index % 3 === 0
    ? [{ service: 'twilio', name: 'call', recipients: ['+525511111111'] }]
    : [],
}));

describe('buildTriggerDiagnostics', () => {
  it('samples only the first 25 triggers and omits sensitive values', () => {
    const diagnostics = buildTriggerDiagnostics(SAMPLE_TRIGGERS);

    assert.equal(diagnostics.sampledTriggerCount, 25);
    assert.ok(diagnostics.triggerTopLevelKeysSeen.includes('processes'));
    assert.ok(diagnostics.triggerTopLevelKeysSeen.includes('actions'));
    assert.ok(!diagnostics.triggerTopLevelKeysSeen.includes('email'));
    assert.ok(!diagnostics.triggerTopLevelKeysSeen.includes('token'));
    assert.ok(diagnostics.processArrayPaths.some((entry) => entry.path === 'processes' && entry.count > 0));
    assert.ok(diagnostics.processTypeValuesSeen.includes('twilio/call'));
    assert.ok(!diagnostics.processTypeValuesSeen.some((value) => value.includes('@')));
    assert.equal(containsFullPhoneNumber(diagnostics), false);
    assert.ok(!('triggers' in diagnostics));
  });

  it('reports destination field paths without leaking phone numbers', () => {
    const diagnostics = buildTriggerDiagnostics([
      {
        id: 't1',
        processes: [
          {
            type: 'twilio/call',
            config: { destinations: ['+525512345678'] },
            params: { to: '+525587654321' },
          },
        ],
      },
    ]);

    assert.ok(
      diagnostics.destinationFieldPathsSeen.some((entry) => entry.path === 'config.destinations' && entry.count > 0)
    );
    assert.equal(containsFullPhoneNumber(diagnostics), false);
  });

  it('reports hydrated process object shape metadata with keys only', () => {
    const diagnostics = buildTriggerDiagnostics([
      {
        id: 't1',
        processes: [
          {
            command: 'twilio/call',
            method: 'call',
            config: {
              args: { to: '+525512345678' },
              parameters: { phone: '+525587654321' },
              destinations: ['+525599988877'],
            },
            params: { settings: { phones: ['+525511122233'] } },
            payload: { data: ['+525544433322'] },
            data: { phones: ['+525566677788'] },
          },
          {
            handler: 'notify',
            options: { retry: 2 },
            properties: { enabled: true },
          },
        ],
      },
    ]);

    assert.ok(diagnostics.processTopLevelKeysSeen.includes('command'));
    assert.ok(diagnostics.processTopLevelKeysSeen.includes('config'));
    assert.ok(diagnostics.processTypeFieldsSeen.includes('command'));
    assert.ok(diagnostics.processTypeFieldsSeen.includes('handler'));
    assert.ok(
      diagnostics.processNestedObjectPathsSeen.some((entry) => entry.path === 'config' && entry.count > 0)
    );
    assert.ok(
      diagnostics.processNestedObjectPathsSeen.some((entry) => entry.path === 'config.args' && entry.count > 0)
    );
    assert.ok(
      diagnostics.processNestedArrayPathsSeen.some((entry) => entry.path === 'config.destinations' && entry.count > 0)
    );
    assert.ok(diagnostics.processPrimitiveFieldNamesSeen.includes('options.retry'));
    assert.ok(
      diagnostics.processCandidatePhoneFieldNamesSeen.some(
        (entry) => entry.path === 'config.destinations' && entry.count > 0
      )
    );
    assert.ok(diagnostics.processSampleShapes.length >= 1);
    assert.ok(diagnostics.processSampleShapes.length <= 5);
    assert.ok(diagnostics.processSampleShapes[0].topLevelKeys.includes('config'));
    assert.ok(diagnostics.processSampleShapes[0].nestedObjectKeys.config.includes('args'));
    assert.equal(containsFullPhoneNumber(diagnostics), false);
    assert.ok(!JSON.stringify(diagnostics).includes('hidden@example.com'));
    assert.ok(!JSON.stringify(diagnostics).includes('secret-token'));
    assert.ok(!JSON.stringify(diagnostics).includes('https://'));
    assert.ok(!JSON.stringify(diagnostics).includes('+525512345678'));
  });

  it('reports array-shaped process item diagnostics without leaking values', () => {
    const diagnostics = buildTriggerDiagnostics([
      {
        id: 't1',
        processes: [
          ['process-secret-id', 'twilio/call', { destinations: ['+525512345678'], token: 'secret-token' }],
        ],
      },
    ]);

    assert.ok(
      diagnostics.processItemTypesSeen.some((entry) => entry.type === 'array' && entry.count > 0)
    );
    assert.ok(diagnostics.processArrayItemShapes.length >= 1);
    assert.ok(diagnostics.processArrayNestedObjectKeysSeen.length >= 1);
    assert.ok(diagnostics.processArrayStringClassifications.length >= 1);
    assert.ok(diagnostics.processTopLevelKeysSeen.includes('type'));
    assert.equal(containsFullPhoneNumber(diagnostics), false);
    assert.ok(!JSON.stringify(diagnostics).includes('process-secret-id'));
    assert.ok(!JSON.stringify(diagnostics).includes('+525512345678'));
    assert.ok(!JSON.stringify(diagnostics).includes('secret-token'));
  });

  it('reports primitive process item types without leaking process ids', () => {
    const diagnostics = buildTriggerDiagnostics([
      {
        id: 't1',
        processes: [
          'process-abc-123',
          42,
          { id: 'process-def-456' },
          {
            command: 'twilio/call',
            config: { args: { to: '+525512345678' } },
          },
        ],
      },
    ]);

    assert.ok(
      diagnostics.processItemTypesSeen.some((entry) => entry.type === 'string' && entry.count > 0)
    );
    assert.ok(
      diagnostics.processItemTypesSeen.some((entry) => entry.type === 'number' && entry.count > 0)
    );
    assert.ok(
      diagnostics.processItemTypesSeen.some((entry) => entry.type === 'object' && entry.count > 0)
    );
    assert.equal(diagnostics.processRefCount, 3);
    assert.equal(diagnostics.processObjectCount, 2);
    assert.ok(!JSON.stringify(diagnostics).includes('process-abc-123'));
    assert.ok(!JSON.stringify(diagnostics).includes('process-def-456'));
  });

  it('limits process sample shapes to five unique layouts', () => {
    const triggers = Array.from({ length: 8 }, (_, index) => ({
      id: index,
      processes: [{ [`field-${index}`]: true, config: { [`slot-${index}`]: true } }],
    }));

    const diagnostics = buildTriggerDiagnostics(triggers);
    assert.equal(diagnostics.processSampleShapes.length, 5);
    assert.ok(diagnostics.processSampleShapes.every((shape) => Array.isArray(shape.topLevelKeys)));
  });
});

describe('normalizeTriggerDiagnosticsForApi', () => {
  it('defaults process-shape fields to empty arrays when missing', () => {
    const normalized = normalizeTriggerDiagnosticsForApi({
      sampledTriggerCount: 2,
      triggerTopLevelKeysSeen: ['processes'],
      processArrayPaths: [{ path: 'processes', count: 2 }],
    });

    assert.deepEqual(normalized.processTopLevelKeysSeen, []);
    assert.deepEqual(normalized.processNestedObjectPathsSeen, []);
    assert.deepEqual(normalized.processNestedArrayPathsSeen, []);
    assert.deepEqual(normalized.processPrimitiveFieldNamesSeen, []);
    assert.deepEqual(normalized.processCandidatePhoneFieldNamesSeen, []);
    assert.deepEqual(normalized.processSampleShapes, []);
    assert.deepEqual(
      normalized.processItemTypesSeen,
      [
        { type: 'object', count: 0 },
        { type: 'string', count: 0 },
        { type: 'number', count: 0 },
        { type: 'array', count: 0 },
        { type: 'null', count: 0 },
        { type: 'other', count: 0 },
      ]
    );
    assert.equal(normalized.processRefCount, 0);
    assert.equal(normalized.processObjectCount, 0);
    assert.deepEqual(normalized.processArrayItemShapes, []);
    assert.deepEqual(normalized.processArrayNestedObjectKeysSeen, []);
    assert.deepEqual(normalized.processArrayCandidateTypeIndexes, []);
    assert.deepEqual(normalized.processArrayCandidatePhoneIndexes, []);
    assert.deepEqual(normalized.processArrayStringClassifications, []);
  });
});

describe('buildSafeScopeDiagnostics trigger diagnostics gate', () => {
  it('includes triggerDiagnostics only when requested', () => {
    const scope = {
      destinationCount: 1,
      destinations: ['+525512345678'],
      warnings: [],
      triggerDiagnostics: buildTriggerDiagnostics([
        {
          id: 't1',
          actions: [{ service: 'twilio', name: 'call', recipients: ['+525512345678'] }],
        },
      ]),
    };

    const compact = buildSafeScopeDiagnostics(scope, {
      mode: 'mock',
      authMode: 'iframe',
      hasSession: true,
      includeTriggerDiagnostics: false,
    });
    const detailed = buildSafeScopeDiagnostics(scope, {
      mode: 'mock',
      authMode: 'iframe',
      hasSession: true,
      includeTriggerDiagnostics: true,
    });

    assert.ok(!('triggerDiagnostics' in compact));
    assert.ok('triggerDiagnostics' in detailed);
    assert.equal(detailed.triggerDiagnostics.sampledTriggerCount, 1);
    assert.ok(Array.isArray(detailed.triggerDiagnostics.processTopLevelKeysSeen));
    assert.ok(Array.isArray(detailed.triggerDiagnostics.processSampleShapes));
    assert.equal(containsFullPhoneNumber(detailed.triggerDiagnostics), false);
  });
});
