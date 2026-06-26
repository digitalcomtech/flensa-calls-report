import {
  FASE1_TIME_RANGE_HELP,
  FASE1_TIME_RANGE_LABEL,
} from '../constants/reportConfig.js';

export default function DateRangeFilter({ from, to, onChange, onSubmit, loading }) {
  return (
    <form className="config-form" onSubmit={onSubmit}>
      <div className="config-fields">
        <label className="config-field">
          <span className="config-label">Fechas</span>
          <div className="date-range-inputs">
            <input
              type="date"
              value={from}
              aria-label="Desde"
              onChange={(e) => onChange({ from: e.target.value, to })}
            />
            <span className="date-range-separator" aria-hidden="true">
              —
            </span>
            <input
              type="date"
              value={to}
              aria-label="Hasta"
              onChange={(e) => onChange({ from, to: e.target.value })}
            />
          </div>
        </label>

        <label className="config-field">
          <span className="config-label">Rango horario</span>
          <select
            className="time-range-select"
            value={FASE1_TIME_RANGE_LABEL}
            disabled
            aria-readonly="true"
            title={FASE1_TIME_RANGE_HELP}
          >
            <option value={FASE1_TIME_RANGE_LABEL}>{FASE1_TIME_RANGE_LABEL}</option>
          </select>
          <span className="field-hint">{FASE1_TIME_RANGE_HELP}</span>
        </label>
      </div>

      <div className="config-actions">
        <button type="submit" className="button-primary" disabled={loading}>
          {loading ? 'Cargando…' : 'Generar reporte'}
        </button>
      </div>
    </form>
  );
}
