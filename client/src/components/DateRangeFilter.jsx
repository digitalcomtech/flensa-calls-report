export default function DateRangeFilter({ from, to, onChange, onSubmit, loading }) {
  const canSubmit = Boolean(from && to);

  return (
    <form className="config-form" onSubmit={onSubmit}>
      <label className="config-field config-field-dates">
        <span className="config-label">Fechas</span>
        <div className="date-range-row">
          <div className="date-range-inputs">
            <input
              type="date"
              value={from}
              aria-label="Desde"
              placeholder="Desde"
              onChange={(e) => onChange({ from: e.target.value, to })}
            />
            <span className="date-range-separator" aria-hidden="true">
              —
            </span>
            <input
              type="date"
              value={to}
              aria-label="Hasta"
              placeholder="Hasta"
              onChange={(e) => onChange({ from, to: e.target.value })}
            />
          </div>
          <button type="submit" className="button-primary" disabled={loading || !canSubmit}>
            {loading ? 'Cargando…' : 'Generar reporte'}
          </button>
        </div>
      </label>
    </form>
  );
}
