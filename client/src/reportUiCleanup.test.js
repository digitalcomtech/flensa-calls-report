import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const CLIENT_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(CLIENT_SRC, relativePath), 'utf8');
}

describe('report UI cleanup', () => {
  it('does not show the top subtitle under the Llamadas title', () => {
    const configPanelSource = readSource('src/components/ReportConfigPanel.jsx');
    const reportConfigSource = readSource('src/constants/reportConfig.js');

    assert.doesNotMatch(configPanelSource, /REPORT_PAGE_SUBTITLE/);
    assert.doesNotMatch(configPanelSource, /config-page-subtitle/);
    assert.doesNotMatch(
      reportConfigSource,
      /Muestra las llamadas realizadas por el proveedor/,
    );
  });

  it('removes Rango horario controls from the config form', () => {
    const dateRangeFilterSource = readSource('src/components/DateRangeFilter.jsx');
    const reportConfigSource = readSource('src/constants/reportConfig.js');

    assert.doesNotMatch(dateRangeFilterSource, /Rango horario/);
    assert.doesNotMatch(dateRangeFilterSource, /00:00 - 23:59/);
    assert.doesNotMatch(dateRangeFilterSource, /FASE1_TIME_RANGE/);
    assert.doesNotMatch(reportConfigSource, /FASE1_TIME_RANGE/);
    assert.doesNotMatch(reportConfigSource, /Fase 1: el reporte cubre cada día completo/);
  });

  it('removes the Phase 1 warning banner from results tabs', () => {
    const resumenSource = readSource('src/components/ResumenTab.jsx');
    const detallesSource = readSource('src/components/DetallesTab.jsx');
    const reportConfigSource = readSource('src/constants/reportConfig.js');

    assert.doesNotMatch(resumenSource, /PhaseWarningBanner/);
    assert.doesNotMatch(detallesSource, /PhaseWarningBanner/);
    assert.equal(
      fs.existsSync(path.join(CLIENT_SRC, 'src/components/PhaseWarningBanner.jsx')),
      false,
    );
    assert.doesNotMatch(reportConfigSource, /PHASE_WARNING_TEXT/);
    assert.doesNotMatch(reportConfigSource, /Primera fase: este reporte no relaciona alertas/);
  });

  it('does not show the identity card description paragraph', () => {
    const identityCardSource = readSource('src/components/ReportIdentityCard.jsx');
    const reportConfigSource = readSource('src/constants/reportConfig.js');

    assert.doesNotMatch(identityCardSource, /REPORT_DESCRIPTION/);
    assert.doesNotMatch(identityCardSource, /report-identity-description/);
    assert.doesNotMatch(reportConfigSource, /REPORT_DESCRIPTION/);
    assert.doesNotMatch(reportConfigSource, /Reporte simple de llamadas realizadas/);
  });

  it('starts with empty date inputs and disables generate until both dates are set', () => {
    const reportPageSource = readSource('src/pages/ReportPage.jsx');
    const dateRangeFilterSource = readSource('src/components/DateRangeFilter.jsx');

    assert.match(reportPageSource, /useState\(''\)/);
    assert.doesNotMatch(reportPageSource, /2026-06-20/);
    assert.doesNotMatch(reportPageSource, /2026-06-23/);
    assert.doesNotMatch(reportPageSource, /defaultFrom/);
    assert.doesNotMatch(reportPageSource, /defaultTo/);
    assert.match(dateRangeFilterSource, /placeholder="Desde"/);
    assert.match(dateRangeFilterSource, /placeholder="Hasta"/);
    assert.match(dateRangeFilterSource, /aria-label="Desde"/);
    assert.match(dateRangeFilterSource, /aria-label="Hasta"/);
    assert.match(dateRangeFilterSource, /disabled=\{loading \|\| !canSubmit\}/);
    assert.match(dateRangeFilterSource, /const canSubmit = Boolean\(from && to\)/);
  });
});
