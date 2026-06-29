export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function clampPage(page, totalPages) {
  if (totalPages <= 0) {
    return 1;
  }

  const normalized = Math.max(1, Math.floor(page) || 1);
  return Math.min(normalized, totalPages);
}

export function paginateRows(rows = [], { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const total = rows.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);
  const currentPage = totalPages === 0 ? 1 : clampPage(page, totalPages);
  const sliceStart = total === 0 ? 0 : (currentPage - 1) * safePageSize;
  const sliceEnd = total === 0 ? 0 : Math.min(sliceStart + safePageSize, total);
  const paginatedRows = total === 0 ? [] : rows.slice(sliceStart, sliceEnd);

  return {
    rows: paginatedRows,
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    rangeStart: total === 0 ? 0 : sliceStart + 1,
    rangeEnd: sliceEnd,
  };
}

export function formatPaginationLabel({ rangeStart, rangeEnd, total }) {
  return `Mostrando ${rangeStart} a ${rangeEnd} de ${total} registros`;
}
