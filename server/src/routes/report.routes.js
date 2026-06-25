import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildCallsReport } from '../reports/callsReport.js';
import { buildExportFilename, callsToCsv } from '../reports/export.js';

const router = Router();

router.get('/calls', requireAuth, async (req, res) => {
  try {
    const report = await buildCallsReport({
      from: req.query.from,
      to: req.query.to,
      user: req.session.user,
    });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/calls/export', requireAuth, async (req, res) => {
  try {
    const report = await buildCallsReport({
      from: req.query.from,
      to: req.query.to,
      user: req.session.user,
    });

    const csv = callsToCsv(report.calls);
    const filename = buildExportFilename({ from: req.query.from, to: req.query.to });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
