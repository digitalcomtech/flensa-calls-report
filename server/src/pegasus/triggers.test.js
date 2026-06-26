import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractTwilioDestinations } from './triggers.js';
import { extractProcessIdFromRef } from './processArrayShape.js';

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

  it('extracts destinations from process object with provider twilio and action call', () => {
    const result = extractTwilioDestinations({
      id: 't6',
      process: {
        provider: 'twilio',
        action: 'call',
        params: { to: '+525577777777' },
      },
    });

    assert.deepEqual(result.destinations, ['+525577777777']);
  });

  it('extracts destinations from actions[] with service twilio and recipients[]', () => {
    const result = extractTwilioDestinations({
      id: 't7',
      actions: [
        {
          service: 'twilio',
          name: 'call',
          recipients: ['+525588888888', '+525588888888'],
        },
      ],
    });

    assert.equal(result.destinationCount, 1);
    assert.deepEqual(result.destinations, ['+525588888888']);
  });

  it('extracts destinations from config.actions[] with plugin twilio and settings.destinations[]', () => {
    const result = extractTwilioDestinations({
      id: 't8',
      config: {
        actions: [
          {
            plugin: 'twilio',
            type: 'call',
            settings: { destinations: ['+525599999999'] },
          },
        ],
      },
    });

    assert.deepEqual(result.destinations, ['+525599999999']);
  });

  it('ignores non-twilio processes', () => {
    const result = extractTwilioDestinations({
      id: 't9',
      actions: [
        {
          service: 'email',
          name: 'send',
          recipients: ['user@example.com'],
        },
        {
          type: 'twilio/call',
          config: { destinations: ['+525500000001'] },
        },
      ],
    });

    assert.deepEqual(result.destinations, ['+525500000001']);
  });

  it('matches twilio/call case-insensitively', () => {
    const result = extractTwilioDestinations({
      id: 't10',
      processes: [
        {
          type: 'Twilio/Call',
          destinations: ['+525511122233'],
        },
      ],
    });

    assert.deepEqual(result.destinations, ['+525511122233']);
  });

  it('extracts destinations from standalone hydrated process records', () => {
    const result = extractTwilioDestinations([
      {
        id: 'process-1',
        type: 'twilio/call',
        config: { destinations: ['+525511111111'] },
      },
      {
        id: 'process-2',
        params: { to: '+525522222222' },
        provider: 'twilio',
        action: 'call',
      },
    ]);

    assert.equal(result.destinationCount, 2);
    assert.deepEqual(result.destinations, ['+525511111111', '+525522222222']);
  });

  it('extracts destinations from array-shaped process entries', () => {
    const result = extractTwilioDestinations({
      id: 't-array',
      processes: [
        ['process-id-1', 'twilio/call', { destinations: ['+525511111111'] }],
        ['twilio/call', { to: '+525522222222' }],
        ['twilio', 'call', { config: { destinations: ['+525533333333'] } }],
      ],
    });

    assert.equal(result.destinationCount, 3);
  });

  it('extracts destinations from single-element process id arrays after hydration shape', () => {
    const result = extractTwilioDestinations({
      id: 't-ref',
      processes: [['process-only-ref']],
    });
    assert.equal(result.destinationCount, 0);
    assert.equal(extractProcessIdFromRef(['process-only-ref']), 'process-only-ref');
  });
});

