import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getEnvDiagnostics, isDevSessionAllowed } from './env.js';

describe('production safety', () => {
  it('blocks dev session when NODE_ENV=production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowDev = process.env.ALLOW_DEV_SESSION;

    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_SESSION = 'true';

    try {
      assert.equal(isDevSessionAllowed(), false);
      assert.equal(getEnvDiagnostics().allowDevSession, false);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.ALLOW_DEV_SESSION = previousAllowDev;
    }
  });

  it('health diagnostics expose safe iframe auth fields only', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const diagnostics = getEnvDiagnostics();

      assert.equal(typeof diagnostics.app, 'string');
      assert.equal(diagnostics.authMode, 'iframe');
      assert.equal(typeof diagnostics.useMockReport, 'boolean');
      assert.equal(typeof diagnostics.allowDevSession, 'boolean');
      assert.equal(typeof diagnostics.pegasusApiConfigured, 'boolean');
      assert.equal(typeof diagnostics.twilioConfigured, 'boolean');
      assert.ok(!('sessionSecret' in diagnostics));
      assert.ok(!('pegasusToken' in diagnostics));
      assert.ok(!('allowedParentOrigin' in diagnostics));
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
