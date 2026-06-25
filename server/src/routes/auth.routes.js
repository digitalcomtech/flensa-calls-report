import { Router } from 'express';
import { cookieOptions, env, isDevSessionAllowed, isPegasusConfigured, isProduction } from '../env.js';
import {
  createOAuthState,
  exchangeCodeForTokens,
  fetchUserProfile,
  getAuthorizationUrl,
  STATE_COOKIE,
} from '../auth/pegasusAuth.js';

const router = Router();

router.get('/login', (req, res) => {
  if (!isPegasusConfigured()) {
    return res.status(503).json({ error: 'Pegasus authentication is not configured' });
  }

  const state = createOAuthState();
  res.cookie(STATE_COOKIE, state, { ...cookieOptions(), maxAge: 10 * 60 * 1000 });
  res.redirect(getAuthorizationUrl(state));
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const savedState = req.cookies?.[STATE_COOKIE];

    if (!code || !state || state !== savedState) {
      return res.status(400).json({ error: 'Invalid OAuth callback' });
    }

    res.clearCookie(STATE_COOKIE);

    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchUserProfile(tokens.access_token);

    req.session.user = {
      id: profile.id ?? profile.sub,
      name: profile.name ?? profile.email,
      email: profile.email,
      accessToken: tokens.access_token,
    };

    res.redirect(env.clientUrl);
  } catch {
    res.status(500).json({
      error: isProduction() ? 'Authentication failed' : 'OAuth callback failed',
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

  res.json({ ok: true, user: { id: 'dev-user', name: 'Dev User', email: 'dev@example.com' } });
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { accessToken, ...user } = req.session.user;
  res.json({ user });
});

router.post('/logout', (req, res) => {
  req.clearSession();
  res.json({ ok: true });
});

export default router;
