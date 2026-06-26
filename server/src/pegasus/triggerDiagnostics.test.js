import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTriggerDiagnostics } from './triggerDiagnostics.js';
import { buildSafeScopeDiagnostics, containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';

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
