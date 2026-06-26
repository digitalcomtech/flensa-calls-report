import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { extractTwilioDestinations } from './triggers.js';
import {
  convertArrayProcessEntry,
  createArrayProcessDiagnosticsState,
  extractProcessIdFromRef,
  finalizeArrayProcessDiagnostics,
  inspectArrayProcessEntry,
  isProcessRef,
} from './processArrayShape.js';
import { extractProcessIdsFromRefs } from './processDetails.js';

describe('convertArrayProcessEntry', () => {
  it('converts [id, type, configObject] tuples', () => {
    const converted = convertArrayProcessEntry([
      'process-abc-123',
      'twilio/call',
      { destinations: ['+525511111111'] },
    ]);

    assert.equal(converted.id, 'process-abc-123');
    assert.equal(converted.type, 'twilio/call');
    assert.deepEqual(converted.config, { destinations: ['+525511111111'] });
    assert.equal(extractTwilioDestinations({ processes: [converted] }).destinationCount, 1);
  });

  it('converts [type, configObject] tuples', () => {
    const converted = convertArrayProcessEntry(['twilio/call', { to: '+525522222222' }]);
    assert.equal(converted.type, 'twilio/call');
    assert.equal(extractTwilioDestinations({ processes: [converted] }).destinationCount, 1);
  });

  it('converts [twilio, call, configObject] tuples', () => {
    const converted = convertArrayProcessEntry([
      'twilio',
      'call',
      { config: { destinations: ['+525533333333'] } },
    ]);
    assert.equal(converted.type, 'twilio');
    assert.equal(converted.action, 'call');
    assert.equal(extractTwilioDestinations({ processes: [converted] }).destinationCount, 1);
  });

  it('treats single-element id arrays as process refs', () => {
    assert.equal(isProcessRef(['process-only-ref']), true);
    assert.deepEqual(extractProcessIdsFromRefs([['process-only-ref']]), ['process-only-ref']);
  });
});

describe('array process diagnostics', () => {
  it('reports array item shapes without leaking values', () => {
    const state = createArrayProcessDiagnosticsState();
    inspectArrayProcessEntry(
      ['process-secret-id', 'twilio/call', { destinations: ['+525512345678'], token: 'secret-token' }],
      state
    );

    const diagnostics = finalizeArrayProcessDiagnostics(state);
    const serialized = JSON.stringify(diagnostics);

    assert.ok(diagnostics.processArrayItemShapes.length >= 1);
    assert.equal(diagnostics.processArrayItemShapes[0].length, 3);
    assert.ok(diagnostics.processArrayNestedObjectKeysSeen.some((entry) => entry.index === 2));
    assert.ok(
      diagnostics.processArrayStringClassifications.some(
        (entry) => entry.index === 1 && entry.looksLikeTwilioCount > 0
      )
    );
    assert.equal(containsFullPhoneNumber(diagnostics), false);
    assert.ok(!serialized.includes('process-secret-id'));
    assert.ok(!serialized.includes('+525512345678'));
    assert.ok(!serialized.includes('secret-token'));
    assert.ok(!serialized.includes('https://'));
    assert.ok(!serialized.includes('@'));
  });
});
