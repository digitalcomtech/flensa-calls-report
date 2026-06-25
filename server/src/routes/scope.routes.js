import { Router } from 'express';
import { env, isScopeDiagnosticsEnabled } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { resolveUserScope } from '../pegasus/scope.js';
import { buildSafeScopeDiagnostics } from '../reports/scopeDiagnostics.js';

const router = Router();

router.get('/scope', requireAuth, async (req, res) => {
  if (!isScopeDiagnosticsEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const scope = await resolveUserScope(req.session.user);

    res.json(
      buildSafeScopeDiagnostics(scope, {
        mode: env.useMockReport ? 'mock' : 'live',
        authMode: env.pegasus.authMode,
        hasSession: true,
      })
    );
  } catch {
    res.status(500).json({ error: 'Failed to resolve report scope' });
  }
});

export default router;
