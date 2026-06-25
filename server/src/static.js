import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const clientDistPath = path.resolve(moduleDir, '../../dist/client');

export function hasClientBuild() {
  return fs.existsSync(path.join(clientDistPath, 'index.html'));
}

/**
 * Serve Vite build output in production. API and /healthz must be registered before this.
 */
export function configureProductionStatic(app) {
  if (!hasClientBuild()) {
    console.warn('Client build not found at dist/client — run npm run build before production start');
    return;
  }

  app.use(
    express.static(clientDistPath, {
      index: false,
      maxAge: '1h',
    })
  );

  app.get(/^(?!\/api|\/healthz).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}
