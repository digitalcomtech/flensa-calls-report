import { Parser } from 'json2csv';

const CALL_FIELDS = [
  { label: 'Date/Time', value: 'dateTime' },
  { label: 'Destination', value: 'destination' },
  { label: 'Duration (s)', value: 'duration' },
  { label: 'Status', value: 'status' },
];

export function callsToCsv(calls) {
  const parser = new Parser({ fields: CALL_FIELDS });
  return parser.parse(calls);
}

export function buildExportFilename({ from, to }) {
  const fromPart = from ? String(from).slice(0, 10) : 'start';
  const toPart = to ? String(to).slice(0, 10) : 'end';
  return `flensa-calls-${fromPart}_${toPart}.csv`;
}
