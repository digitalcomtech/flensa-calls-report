import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import {
  env,
  getEnvDiagnostics,
  isProduction,
  validateEnvOnStartup,
} from './env.js';
import authRoutes from './routes/auth.routes.js';
import reportRoutes from './routes/report.routes.js';
import scopeRoutes from './routes/scope.routes.js';
import { sessionMiddleware } from './session.js';
import { configureProductionStatic } from './static.js';

export function createApp() {
  const app = express();

  const corsOrigin = isProduction() ? env.clientUrl : env.clientUrl;
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(sessionMiddleware);

  app.get('/healthz', (_req, res) => {
    return res.json({ ok: true, diagnostics: getEnvDiagnostics() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/report', scopeRoutes);

  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'Not found' });
  });

  if (isProduction()) {
    configureProductionStatic(app);
  }

  app.use((err, _req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    console.error('Unhandled server error');
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  validateEnvOnStartup();
  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Server listening on port ${env.port}`);
  });
}
