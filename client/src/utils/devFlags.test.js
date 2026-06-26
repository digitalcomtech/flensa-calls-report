import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { showCaBadges } from './devFlags.js';

describe('devFlags', () => {
  it('hides CA badges by default', () => {
    assert.equal(showCaBadges({}), false);
    assert.equal(showCaBadges({ VITE_SHOW_CA_BADGES: 'false' }), false);
    assert.equal(showCaBadges(undefined), false);
  });

  it('shows CA badges only when explicitly enabled', () => {
    assert.equal(showCaBadges({ VITE_SHOW_CA_BADGES: 'true' }), true);
  });
});
