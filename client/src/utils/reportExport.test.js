import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detailRowsToCsv, detailRowsToText, summaryTableToCsv } from './reportExport.js';

const sampleCall = {
  dateTime: 'Mon, 22 Jun 2026 23:41:50 +0000',
  destination: '+524613461359',
  duration: 15,
  status: 'completed',
};

describe('reportExport', () => {
  it('exports summary table as CSV', () => {
    const csv = summaryTableToCsv({
      totalCalls: 23,
      answered: { count: 23, percentage: 100 },
      notAnswered: { count: 0, percentage: 0 },
    });

    assert.match(csv, /^Concepto,Cantidad,Porcentaje/);
    assert.match(csv, /Contestadas,23,100%/);
    assert.match(csv, /Llamadas totales,23,100\.0%/);
    assert.match(csv, /No contestadas,0,0%/);
  });

  it('exports visible detail rows as CSV', () => {
    const csv = detailRowsToCsv([sampleCall]);

    assert.match(
      csv,
      /^Fecha\/hora llamada,Teléfono llamado,Duración llamada \(seg\),Contestada,Estado proveedor/
    );
    assert.match(csv, /\+524613461359,15,Sí,Completada/);
  });

  it('exports visible detail rows as tabular copy text', () => {
    const text = detailRowsToText([sampleCall]);

    assert.match(text, /^Fecha\/hora llamada\tTeléfono llamado\tDuración llamada \(seg\)\tContestada\tEstado proveedor/);
    assert.match(text, /\+524613461359\t15\tSí\tCompletada/);
  });

  it('does not crash when exporting empty detail rows', () => {
    const csv = detailRowsToCsv([]);
    const text = detailRowsToText([]);

    assert.match(csv, /^Fecha\/hora llamada,Teléfono llamado/);
    assert.equal(text.split('\n').length, 1);
  });
});
