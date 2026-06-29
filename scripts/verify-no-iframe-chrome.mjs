#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist/client');
const FORBIDDEN_UI_STRINGS = [
  'Cerrar sesión',
  'Pegasus User',
  'Sin sesión',
  'header-inner',
  'header-actions',
  'user-name',
];
const FORBIDDEN_CSS_MARKERS = ['.header {', '.header-inner', '.header-actions', '.user-name'];

function readDistBundlePaths() {
  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const jsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  const cssMatch = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/);
  if (!jsMatch) {
    throw new Error('dist/client/index.html does not reference a JS bundle');
  }
  return {
    jsPath: path.join(DIST, jsMatch[1].replace(/^\//, '')),
    cssPath: cssMatch ? path.join(DIST, cssMatch[1].replace(/^\//, '')) : null,
  };
}

function assertNoMarkers(label, source, markers) {
  const hits = markers.filter((marker) => source.includes(marker));
  if (hits.length > 0) {
    throw new Error(`${label} still contains iframe chrome markers: ${hits.join(', ')}`);
  }
}

if (!fs.existsSync(DIST)) {
  console.error('dist/client missing — run npm run build first');
  process.exit(1);
}

const { jsPath, cssPath } = readDistBundlePaths();
const jsSource = fs.readFileSync(jsPath, 'utf8');
assertNoMarkers(path.basename(jsPath), jsSource, FORBIDDEN_UI_STRINGS);

if (cssPath && fs.existsSync(cssPath)) {
  const cssSource = fs.readFileSync(cssPath, 'utf8');
  assertNoMarkers(path.basename(cssPath), cssSource, FORBIDDEN_CSS_MARKERS);
}

console.log('ok  built client has no iframe session chrome markers');
