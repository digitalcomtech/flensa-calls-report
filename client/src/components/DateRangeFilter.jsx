export default function DateRangeFilter({ from, to, onChange, onSubmit, loading }) {
  return (
    <form className="filter-form" onSubmit={onSubmit}>
      <label>
        From
        <input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? 'Loading…' : 'Run report'}
      </button>
    </form>
  );
}
