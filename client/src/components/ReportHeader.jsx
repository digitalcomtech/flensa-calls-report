function formatReportDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ReportHeader({ from, to }) {
  return (
    <header className="report-header">
      <div className="report-brand">
        <div className="report-logo" aria-hidden="true">
          FM
        </div>
        <div>
          <p className="report-brand-name">FleetMetriks</p>
          <h2 className="report-title">Reporte de llamadas</h2>
        </div>
      </div>
      <p className="report-period">
        Periodo: {formatReportDate(from)} — {formatReportDate(to)}
      </p>
    </header>
  );
}
