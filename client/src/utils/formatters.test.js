import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatInteger,
  formatPercentage,
  formatPercentageWithSymbol,
  formatSeconds,
} from './formatters.js';

describe('formatters', () => {
  it('formats integers with thousands separator', () => {
    assert.equal(formatInteger(23), '23');
    assert.equal(formatInteger(1234), '1,234');
  });

  it('formats percentages with one decimal when needed', () => {
    assert.equal(formatPercentage(100), '100');
    assert.equal(formatPercentage(66.7), '66.7');
    assert.equal(formatPercentageWithSymbol(100), '100%');
  });

  it('formats seconds with one decimal max', () => {
    assert.equal(formatSeconds(0), '0s');
    assert.equal(formatSeconds(15), '15s');
    assert.equal(formatSeconds(18.8), '18.8s');
  });

  it('returns em dash for invalid values', () => {
    assert.equal(formatInteger(null), '—');
    assert.equal(formatPercentage(undefined), '—');
    assert.equal(formatSeconds('bad'), '—');
  });
});
