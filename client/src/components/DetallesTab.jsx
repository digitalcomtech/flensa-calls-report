import { useMemo, useState } from 'react';
import { callMatchesSearch, DETALLE_COLUMNS, mapCallToDetailRow } from '../utils/callDetails.js';
import { detailRowsToCsv, detailRowsToText } from '../utils/reportExport.js';
import PhaseWarningBanner from './PhaseWarningBanner.jsx';
import ReportHeader from './ReportHeader.jsx';
import ReportToolbar from './ReportToolbar.jsx';

const EMPTY_RANGE_MESSAGE = 'No se encontraron llamadas para el rango seleccionado.';

export default function DetallesTab({ calls = [], from, to }) {
  const [search, setSearch] = useState('');

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return calls;
    }
    return calls.filter((call) => callMatchesSearch(call, query));
  }, [calls, search]);

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
            onChange={(event) => setSearch(event.target.value)}
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
                filteredCalls.map((call) => {
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
                    No hay resultados para la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
