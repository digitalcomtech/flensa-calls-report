import { DETALLE_COLUMNS, mapCallsToDetailRows } from './callDetails.js';
import { buildSummaryTableRows } from './reportMetrics.js';

export function detailRowsToCsv(calls = []) {
  const rows = mapCallsToDetailRows(calls);
  const header = DETALLE_COLUMNS.map((column) => column.header).join(',');
  const body = rows.map((row) =>
    DETALLE_COLUMNS.map((column) => csvCell(row[column.key])).join(',')
  );

  return `${[header, ...body].join('\n')}\n`;
}

export function detailRowsToText(calls = []) {
  const rows = mapCallsToDetailRows(calls);
  const header = DETALLE_COLUMNS.map((column) => column.header).join('\t');
  const body = rows.map((row) => DETALLE_COLUMNS.map((column) => row[column.key]).join('\t')).join('\n');
  return body ? `${header}\n${body}` : header;
}

export function summaryTableToCsv(summary) {
  const rows = buildSummaryTableRows(summary);
  const lines = [
    'Concepto,Cantidad,Porcentaje',
    ...rows.map((row) => `${csvCell(row.concept)},${csvCell(row.count)},${csvCell(`${row.percentage}%`)}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function summaryTableToText(summary) {
  const rows = buildSummaryTableRows(summary);
  const header = 'Concepto\tCantidad\tPorcentaje';
  const body = rows.map((row) => `${row.concept}\t${row.count}\t${row.percentage}%`).join('\n');
  return `${header}\n${body}`;
}

export function downloadTextFile({ content, filename, mimeType = 'text/plain;charset=utf-8' }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
