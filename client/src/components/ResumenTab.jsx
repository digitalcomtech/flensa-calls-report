import { useMemo } from 'react';
import { formatInteger, formatPercentageWithSymbol, formatSeconds } from '../utils/formatters.js';
import { averageDurationSeconds, buildSummaryTableRows } from '../utils/reportMetrics.js';
import ReportHeader from './ReportHeader.jsx';
import ReportToolbar from './ReportToolbar.jsx';

export default function ResumenTab({ report, from, to }) {
  const summary = report?.summary;
  const calls = report?.calls ?? [];
  const avgDuration = useMemo(() => averageDurationSeconds(calls), [calls]);
  const tableRows = useMemo(() => buildSummaryTableRows(summary), [summary]);

  if (!summary) {
    return null;
  }

  return (
    <section className="report-view">
      <ReportHeader from={from} to={to} />

      <div className="report-section-head">
        <h3>Resumen de llamadas</h3>
        <ReportToolbar activeTab="resumen" from={from} to={to} summary={summary} />
      </div>

      <div className="summary summary-metrics">
        <div className="summary-card">
          <span className="summary-label">Llamadas totales</span>
          <strong>{formatInteger(summary.totalCalls)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Llamadas contestadas</span>
          <strong>{formatInteger(summary.answered.count)}</strong>
          <span className="summary-subvalue">
            {formatPercentageWithSymbol(summary.answered.percentage)}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Llamadas no contestadas</span>
          <strong>{formatInteger(summary.notAnswered.count)}</strong>
          <span className="summary-subvalue">
            {formatPercentageWithSymbol(summary.notAnswered.percentage)}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Duración promedio</span>
          <strong>{formatSeconds(avgDuration)}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Cantidad</th>
              <th>Porcentaje</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.concept}>
                <td>{row.concept}</td>
                <td>{formatInteger(row.count)}</td>
                <td>{row.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
