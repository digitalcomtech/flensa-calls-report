import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const CLIENT_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('iframe UI shell', () => {
  it('does not mount the internal session header bar', () => {
    const reportPageSource = fs.readFileSync(
      path.join(CLIENT_SRC, 'src/pages/ReportPage.jsx'),
      'utf8',
    );

    assert.doesNotMatch(reportPageSource, /Header/);
    assert.doesNotMatch(reportPageSource, /Cerrar sesión/);
    assert.doesNotMatch(reportPageSource, /Pegasus User/);
    assert.equal(
      fs.existsSync(path.join(CLIENT_SRC, 'src/components/Header.jsx')),
      false,
      'Header.jsx should be removed from the iframe UI',
    );
  });

  it('keeps the report config title inside the white card', () => {
    const configPanelSource = fs.readFileSync(
      path.join(CLIENT_SRC, 'src/components/ReportConfigPanel.jsx'),
      'utf8',
    );
    const reportConfigSource = fs.readFileSync(
      path.join(CLIENT_SRC, 'src/constants/reportConfig.js'),
      'utf8',
    );

    assert.match(configPanelSource, /REPORT_TITLE/);
    assert.match(configPanelSource, /REPORT_PAGE_SUBTITLE/);
    assert.match(reportConfigSource, /Llamadas/);
    assert.match(reportConfigSource, /Muestra las llamadas realizadas por el proveedor/);
  });
});
