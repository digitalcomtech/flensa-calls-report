import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  callMatchesSearch,
  DETALLE_COLUMNS,
  mapCallToDetailRow,
  mapCallsToDetailRows,
} from './callDetails.js';

const sampleCall = {
  dateTime: 'Mon, 22 Jun 2026 23:41:50 +0000',
  destination: '+524613461359',
  duration: 15,
  status: 'completed',
};

describe('callDetails', () => {
  it('maps a call to visible detail columns', () => {
    const row = mapCallToDetailRow(sampleCall);

    assert.equal(row.destination, '+524613461359');
    assert.equal(row.duration, '15');
    assert.equal(row.answered, 'Sí');
    assert.equal(row.providerStatus, 'Completada');
    assert.match(row.dateTime, /2026/);
  });

  it('uses the same column order for export mapping', () => {
    const [row] = mapCallsToDetailRows([sampleCall]);
    const headers = DETALLE_COLUMNS.map((column) => column.header);

    assert.deepEqual(headers, [
      'Fecha/hora llamada',
      'Teléfono llamado',
      'Duración llamada (seg)',
      'Contestada',
      'Estado proveedor',
    ]);
    assert.equal(row.answered, 'Sí');
    assert.equal(row.providerStatus, 'Completada');
  });

  it('searches using visible Spanish labels', () => {
    assert.equal(callMatchesSearch(sampleCall, 'completada'), true);
    assert.equal(callMatchesSearch(sampleCall, 'sí'), true);
    assert.equal(callMatchesSearch(sampleCall, 'missing'), false);
  });

  it('handles empty calls safely', () => {
    assert.deepEqual(mapCallsToDetailRows([]), []);
  });
});
