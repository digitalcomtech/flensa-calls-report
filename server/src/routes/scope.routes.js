import { Router } from 'express';
import { env, isProduction } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { resolveUserScope } from '../pegasus/scope.js';
import { maskDestinations } from '../utils/phoneMask.js';

const router = Router();

router.get('/scope', requireAuth, async (req, res) => {
  if (isProduction()) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const scope = await resolveUserScope(req.session.user);

    res.json({
      mode: env.useMockReport ? 'mock' : 'live',
      hasPegasusToken: scope.hasPegasusToken,
      resourceCount: scope.resourceCount,
      triggerCount: scope.triggerCount,
      destinationCount: scope.destinationCount,
      destinationsPreview: maskDestinations(scope.destinations),
      warnings: scope.warnings,
    });
  } catch {
    res.status(500).json({ error: 'Failed to resolve report scope' });
  }
});

export default router;
