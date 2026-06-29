import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callMatchesSearch } from './callDetails.js';
import { detailRowsToCsv } from './reportExport.js';
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  formatPaginationLabel,
  paginateRows,
} from './tablePagination.js';

const sampleCalls = Array.from({ length: 30 }, (_, index) => ({
  id: `call-${index + 1}`,
  dateTime: `Mon, 22 Jun 2026 23:${String(index).padStart(2, '0')}:00 +0000`,
  destination: `+5246134613${String(index).padStart(2, '0')}`,
  duration: index,
  status: index % 2 === 0 ? 'completed' : 'no-answer',
}));

describe('tablePagination', () => {
  it('returns the correct slice and metadata for a page', () => {
    const result = paginateRows(sampleCalls, { page: 2, pageSize: 10 });

    assert.equal(result.rows.length, 10);
    assert.equal(result.rows[0].id, 'call-11');
    assert.equal(result.total, 30);
    assert.equal(result.page, 2);
    assert.equal(result.pageSize, 10);
    assert.equal(result.totalPages, 3);
    assert.equal(result.rangeStart, 11);
    assert.equal(result.rangeEnd, 20);
  });

  it('uses the default page size of 25', () => {
    const result = paginateRows(sampleCalls);

    assert.equal(result.pageSize, DEFAULT_PAGE_SIZE);
    assert.equal(result.rows.length, 25);
    assert.equal(result.rangeStart, 1);
    assert.equal(result.rangeEnd, 25);
  });

  it('clamps the requested page when it exceeds the available pages', () => {
    const result = paginateRows(sampleCalls, { page: 99, pageSize: 25 });

    assert.equal(result.page, 2);
    assert.equal(result.rangeStart, 26);
    assert.equal(result.rangeEnd, 30);
    assert.equal(result.rows.length, 5);
  });

  it('returns empty metadata when there are no rows', () => {
    const result = paginateRows([], { page: 3, pageSize: 25 });

    assert.deepEqual(result.rows, []);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
    assert.equal(result.rangeStart, 0);
    assert.equal(result.rangeEnd, 0);
  });

  it('formats the Spanish pagination label', () => {
    const label = formatPaginationLabel({ rangeStart: 1, rangeEnd: 25, total: 30 });

    assert.equal(label, 'Mostrando 1 a 25 de 30 registros');
  });

  it('applies search before pagination', () => {
    const filtered = sampleCalls.filter((call) => callMatchesSearch(call, 'completada'));
    const result = paginateRows(filtered, { page: 1, pageSize: 5 });

    assert.equal(filtered.length, 15);
    assert.equal(result.rows.length, 5);
    assert.equal(result.total, 15);
    assert.equal(result.rangeEnd, 5);
  });

  it('clamps page values through clampPage', () => {
    assert.equal(clampPage(0, 3), 1);
    assert.equal(clampPage(2, 3), 2);
    assert.equal(clampPage(9, 3), 3);
    assert.equal(clampPage(2, 0), 1);
  });
});

describe('reportExport with filtered rows', () => {
  it('exports all filtered rows, not only the current page', () => {
    const filtered = sampleCalls.filter((call) => callMatchesSearch(call, 'completada'));
    const page = paginateRows(filtered, { page: 1, pageSize: 5 });
    const csv = detailRowsToCsv(filtered);

    assert.equal(page.rows.length, 5);
    assert.equal(csv.trim().split('\n').length, filtered.length + 1);
  });
});
