import { Router } from 'express';
import { validatePegasusToken } from '../auth/pegasusIframeAuth.js';
import {
  getPegasusTokenFromUser,
  isDevSessionAllowed,
  isPegasusApiConfigured,
  isProduction,
  sanitizeUserForClient,
} from '../env.js';

const router = Router();

router.get('/iframe-config', (_req, res) => {
  res.json({
    authMode: 'iframe',
    allowedParentOrigin: process.env.PEGASUS_ALLOWED_PARENT_ORIGIN ?? '',
  });
});

router.post('/iframe', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  if (!isPegasusApiConfigured()) {
    return res.status(503).json({ error: 'Pegasus API is not configured' });
  }

  try {
    const profile = await validatePegasusToken(token);

    req.session.user = {
      ...profile,
      pegasusToken: token,
    };

    res.json({
      ok: true,
      user: sanitizeUserForClient(req.session.user),
    });
  } catch {
    console.error('Iframe auth validation failed');
    res.status(401).json({
      error: isProduction() ? 'Authentication failed' : 'Invalid Pegasus token',
    });
  }
});

router.post('/dev-session', (req, res) => {
  if (!isDevSessionAllowed()) {
    return res.status(404).json({ error: 'Not found' });
  }

  req.session.user = {
    id: 'dev-user',
    name: 'Dev User',
    email: 'dev@example.com',
    isDevSession: true,
  };

  res.json({
    ok: true,
    user: sanitizeUserForClient(req.session.user),
  });
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({ user: sanitizeUserForClient(req.session.user) });
});

router.post('/logout', (req, res) => {
  req.clearSession();
  res.json({ ok: true });
});

export default router;
