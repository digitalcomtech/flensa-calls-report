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
    assert.equal(containsFullPhoneNumber(detailed.triggerDiagnostics), false);
  });
});
