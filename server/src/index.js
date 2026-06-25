import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  cookieOptions,
  env,
  getEnvDiagnostics,
  isProduction,
  validateEnvOnStartup,
} from './env.js';
import authRoutes from './routes/auth.routes.js';
import reportRoutes from './routes/report.routes.js';
import scopeRoutes from './routes/scope.routes.js';
import { configureProductionStatic } from './static.js';

const sessions = new Map();

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

  app.use((req, res, next) => {
    const sessionId = req.cookies?.session_id;
    if (sessionId && sessions.has(sessionId)) {
      req.session = sessions.get(sessionId);
      req.sessionId = sessionId;
    } else {
      req.session = { user: null };
    }

    const originalEnd = res.end;
    res.end = function end(...args) {
      if (req.session?.user) {
        const id = req.sessionId || crypto.randomBytes(24).toString('hex');
        sessions.set(id, req.session);
        res.cookie('session_id', id, {
          ...cookieOptions(),
          maxAge: 24 * 60 * 60 * 1000,
        });
      }
      return originalEnd.apply(this, args);
    };

    req.clearSession = () => {
      if (req.sessionId) {
        sessions.delete(req.sessionId);
      }
      res.clearCookie('session_id', cookieOptions());
      req.session = { user: null };
      req.sessionId = undefined;
    };

    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, diagnostics: getEnvDiagnostics() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/report', scopeRoutes);

  if (isProduction()) {
    configureProductionStatic(app);
  }

  app.use((err, _req, res, _next) => {
    console.error('Unhandled server error');
    res.status(500).json({ error: 'Internal server error' });
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
