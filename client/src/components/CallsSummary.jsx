export default function CallsSummary({ summary }) {
  if (!summary) return null;

  return (
    <section className="summary">
      <div className="summary-card">
        <span className="summary-label">Total calls</span>
        <strong>{summary.totalCalls}</strong>
      </div>
      <div className="summary-card">
        <span className="summary-label">Answered</span>
        <strong>
          {summary.answered.count} ({summary.answered.percentage}%)
        </strong>
      </div>
      <div className="summary-card">
        <span className="summary-label">Not answered</span>
        <strong>
          {summary.notAnswered.count} ({summary.notAnswered.percentage}%)
        </strong>
      </div>
    </section>
  );
}
