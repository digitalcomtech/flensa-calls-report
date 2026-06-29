import { REPORT_TITLE } from '../constants/reportConfig.js';
import DateRangeFilter from './DateRangeFilter.jsx';
import ReportIdentityCard from './ReportIdentityCard.jsx';

export default function ReportConfigPanel({ from, to, loading, onChange, onSubmit }) {
  return (
    <section className="config-panel no-print" aria-labelledby="report-config-title">
      <header className="config-page-header">
        <h2 id="report-config-title" className="config-page-title">
          {REPORT_TITLE}
        </h2>
      </header>

      <div className="config-panel-body">
        <ReportIdentityCard />
        <DateRangeFilter
          from={from}
          to={to}
          loading={loading}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </div>
    </section>
  );
}
