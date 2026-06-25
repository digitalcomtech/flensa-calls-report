import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json'
);
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const DEV_SESSION_SECRET = 'dev-secret-change-in-production';

function optional(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export const env = {
  appName: packageJson.name,
  port: Number(optional('PORT', '3001')),
  nodeEnv: optional('NODE_ENV', 'development'),
  clientUrl: optional('CLIENT_URL', 'http://localhost:5173'),
  sessionSecret: optional('SESSION_SECRET', DEV_SESSION_SECRET),
  useMockReport: bool('USE_MOCK_REPORT', true),
  pegasus: {
    apiUrl: optional('PEGASUS_API_URL', ''),
    clientId: optional('PEGASUS_CLIENT_ID'),
    clientSecret: optional('PEGASUS_CLIENT_SECRET'),
    redirectUri: optional('PEGASUS_REDIRECT_URI', 'http://localhost:3001/api/auth/callback'),
  },
  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
  },
};

export function isProduction() {
  return (process.env.NODE_ENV ?? env.nodeEnv) === 'production';
}

export function isPegasusConfigured() {
  return Boolean(env.pegasus.apiUrl && env.pegasus.clientId && env.pegasus.clientSecret);
}

export function isTwilioConfigured() {
  return Boolean(env.twilio.accountSid && env.twilio.authToken);
}

/** Dev sessions are never allowed in production, regardless of ALLOW_DEV_SESSION. */
export function isDevSessionAllowed() {
  if (isProduction()) {
    return false;
  }
  const raw = process.env.ALLOW_DEV_SESSION;
  if (raw === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Safe diagnostics for /healthz — booleans only, no secret values. */
export function getEnvDiagnostics() {
  return {
    app: env.appName,
    nodeEnv: process.env.NODE_ENV ?? env.nodeEnv,
    useMockReport: env.useMockReport,
    allowDevSession: isDevSessionAllowed(),
    pegasusConfigured: isPegasusConfigured(),
    twilioConfigured: isTwilioConfigured(),
  };
}

export function validateEnvOnStartup() {
  if (!isProduction()) {
    return;
  }

  if (!process.env.SESSION_SECRET || env.sessionSecret === DEV_SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set to a strong value when NODE_ENV=production');
  }

  if (env.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters when NODE_ENV=production');
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
  };
}
