import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractTwilioDestinations } from './triggers.js';

describe('extractTwilioDestinations', () => {
  it('extracts multiple destinations from process.config.destinations', () => {
    const result = extractTwilioDestinations({
      id: 't1',
      processes: [
        {
          type: 'twilio/call',
          config: {
            destinations: ['+525511111111', '+525522222222'],
          },
        },
      ],
    });

    assert.equal(result.triggerCount, 1);
    assert.equal(result.destinationCount, 2);
    assert.deepEqual(result.destinations, ['+525511111111', '+525522222222']);
    assert.equal(result.byTrigger[0].destinations.length, 2);
  });

  it('dedupes destinations across processes and triggers', () => {
    const result = extractTwilioDestinations([
      {
        id: 't1',
        process: {
          name: 'twilio/call',
          config: { destinations: ['+525533333333'] },
        },
      },
      {
        id: 't2',
        processes: [
          {
            action: 'twilio/call',
            destinations: ['+525533333333', '+525544444444'],
          },
        ],
      },
    ]);

    assert.equal(result.destinationCount, 2);
    assert.deepEqual(result.destinations, ['+525533333333', '+525544444444']);
  });

  it('supports config.processes[] and single destination fields', () => {
    const result = extractTwilioDestinations({
      id: 't3',
      config: {
        processes: [
          {
            type: 'twilio/call',
            config: { destination: '+525555555555' },
          },
        ],
      },
    });

    assert.deepEqual(result.destinations, ['+525555555555']);
  });

  it('returns empty result when config is missing', () => {
    const result = extractTwilioDestinations({ id: 't4', processes: [{ type: 'email/send' }] });

    assert.equal(result.destinationCount, 0);
    assert.deepEqual(result.destinations, []);
    assert.deepEqual(result.byTrigger[0].destinations, []);
  });

  it('ignores empty and null destination values', () => {
    const result = extractTwilioDestinations({
      id: 't5',
      processes: [
        {
          type: 'twilio/call',
          config: { destinations: ['', null, '  ', '+525566666666'] },
        },
      ],
    });

    assert.deepEqual(result.destinations, ['+525566666666']);
  });
});
