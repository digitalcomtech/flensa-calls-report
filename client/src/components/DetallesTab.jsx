import { useEffect, useMemo, useState } from 'react';
import { callMatchesSearch, DETALLE_COLUMNS, mapCallToDetailRow } from '../utils/callDetails.js';
import { detailRowsToCsv, detailRowsToText } from '../utils/reportExport.js';
import {
  DEFAULT_PAGE_SIZE,
  formatPaginationLabel,
  PAGE_SIZE_OPTIONS,
  paginateRows,
} from '../utils/tablePagination.js';
import PhaseWarningBanner from './PhaseWarningBanner.jsx';
import ReportHeader from './ReportHeader.jsx';
import ReportToolbar from './ReportToolbar.jsx';

const EMPTY_RANGE_MESSAGE = 'No se encontraron llamadas para el rango seleccionado.';
const EMPTY_SEARCH_MESSAGE = 'No hay resultados para la búsqueda.';

export default function DetallesTab({ calls = [], from, to }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return calls;
    }
    return calls.filter((call) => callMatchesSearch(call, query));
  }, [calls, search]);

  const pagination = useMemo(
    () => paginateRows(filteredCalls, { page, pageSize }),
    [filteredCalls, page, pageSize]
  );

  useEffect(() => {
    if (pagination.page !== page) {
      setPage(pagination.page);
    }
  }, [pagination.page, page]);

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setPage(1);
  }

  function handlePageSizeChange(event) {
    setPageSize(Number(event.target.value));
    setPage(1);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(detailRowsToText(filteredCalls));
  }

  function handleCsv() {
    return detailRowsToCsv(filteredCalls);
  }

  return (
    <section className="report-view">
      <ReportHeader from={from} to={to} />
      <PhaseWarningBanner />

      <div className="report-section-head">
        <h3>Detalle de llamadas</h3>
        <ReportToolbar
          activeTab="detalles"
          from={from}
          to={to}
          onCopy={handleCopy}
          onCsvContent={handleCsv}
          csvFilename={`detalle-llamadas-${from}-${to}.csv`}
        />
      </div>

      <div className="table-toolbar no-print">
        <label className="table-search">
          Buscar
          <input
            type="search"
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar en la tabla…"
          />
        </label>
      </div>

      {!calls.length ? (
        <p className="empty">{EMPTY_RANGE_MESSAGE}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {DETALLE_COLUMNS.map((column) => (
                  <th key={column.key}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length ? (
                pagination.rows.map((call) => {
                  const row = mapCallToDetailRow(call);
                  return (
                    <tr key={call.id ?? `${call.dateTime}-${call.destination}`}>
                      {DETALLE_COLUMNS.map((column) => (
                        <td key={column.key}>{row[column.key]}</td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={DETALLE_COLUMNS.length} className="empty-cell">
                    {EMPTY_SEARCH_MESSAGE}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {filteredCalls.length > 0 ? (
            <div className="table-pagination no-print">
              <p className="table-pagination-info">
                {formatPaginationLabel({
                  rangeStart: pagination.rangeStart,
                  rangeEnd: pagination.rangeEnd,
                  total: pagination.total,
                })}
              </p>
              <div className="table-pagination-controls">
                <label className="table-pagination-size">
                  Filas por página
                  <select value={pageSize} onChange={handlePageSizeChange}>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="table-pagination-button"
                  onClick={() => setPage((current) => current - 1)}
                  disabled={pagination.page <= 1}
                >
                  Anterior
                </button>
                <span className="table-pagination-page" aria-current="page">
                  {pagination.page}
                </span>
                <button
                  type="button"
                  className="table-pagination-button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
