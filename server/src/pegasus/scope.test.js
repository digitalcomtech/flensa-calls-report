import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEV_FALLBACK_DESTINATIONS, resolveUserScope } from './scope.js';

describe('resolveUserScope', () => {
  it('returns dev fallback destinations only when ALLOW_DEV_SESSION is enabled', async () => {
    const previous = process.env.ALLOW_DEV_SESSION;
    process.env.ALLOW_DEV_SESSION = 'true';

    try {
      const scope = await resolveUserScope({ id: 'dev', isDevSession: true });
      assert.equal(scope.isDevSession, true);
      assert.deepEqual(scope.destinations, DEV_FALLBACK_DESTINATIONS);
      assert.equal(scope.destinationCount, DEV_FALLBACK_DESTINATIONS.length);
    } finally {
      process.env.ALLOW_DEV_SESSION = previous;
    }
  });

  it('returns empty scope for dev session when ALLOW_DEV_SESSION is disabled', async () => {
    const previous = process.env.ALLOW_DEV_SESSION;
    process.env.ALLOW_DEV_SESSION = 'false';

    try {
      const scope = await resolveUserScope({ id: 'dev', isDevSession: true });
      assert.equal(scope.destinationCount, 0);
      assert.deepEqual(scope.destinations, []);
    } finally {
      process.env.ALLOW_DEV_SESSION = previous;
    }
  });

  it('returns empty scope for authenticated user without pegasus token', async () => {
    const scope = await resolveUserScope({ id: 'user-1', email: 'a@example.com' });
    assert.equal(scope.hasPegasusToken, false);
    assert.equal(scope.destinationCount, 0);
    assert.deepEqual(scope.destinations, []);
  });
});
