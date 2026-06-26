import { useState } from 'react';
import { getCallsReport } from '../api/reportClient.js';
import DateRangeFilter from '../components/DateRangeFilter.jsx';
import DetallesTab from '../components/DetallesTab.jsx';
import Header from '../components/Header.jsx';
import IframeAuthBootstrap from '../components/IframeAuthBootstrap.jsx';
import ReportTabs from '../components/ReportTabs.jsx';
import ResumenTab from '../components/ResumenTab.jsx';

function defaultFrom() {
  return '2026-06-20';
}

function defaultTo() {
  return '2026-06-23';
}

function ReportContent({ user }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runReport(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await getCallsReport({ from, to });
      setReport(data);
      setActiveTab('resumen');
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Header user={user} />
      <main className="main">
        <section className="panel no-print">
          <DateRangeFilter
            from={from}
            to={to}
            loading={loading}
            onChange={({ from: nextFrom, to: nextTo }) => {
              setFrom(nextFrom);
              setTo(nextTo);
            }}
            onSubmit={runReport}
          />
        </section>

        {error && <p className="error">{error}</p>}

        {report && (
          <section className="report-shell">
            <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === 'resumen' ? (
              <ResumenTab report={report} from={from} to={to} />
            ) : (
              <DetallesTab calls={report.calls} from={from} to={to} />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function ReportPage() {
  return <IframeAuthBootstrap>{({ user }) => <ReportContent user={user} />}</IframeAuthBootstrap>;
}
