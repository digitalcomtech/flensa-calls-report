import { useState } from 'react';
import { exportCallsUrl, getCallsReport } from '../api/reportClient.js';
import CallsSummary from '../components/CallsSummary.jsx';
import CallsTable from '../components/CallsTable.jsx';
import DateRangeFilter from '../components/DateRangeFilter.jsx';
import Header from '../components/Header.jsx';
import IframeAuthBootstrap from '../components/IframeAuthBootstrap.jsx';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runReport(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await getCallsReport({ from, to });
      setReport(data);
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
        <section className="panel">
          <DateRangeFilter
            from={from}
            to={to}
            loading={loading}
            onChange={({ from: f, to: t }) => {
              setFrom(f);
              setTo(t);
            }}
            onSubmit={runReport}
          />
          {report && (
            <a className="button secondary" href={exportCallsUrl({ from, to })} download>
              Export CSV
            </a>
          )}
        </section>

        {error && <p className="error">{error}</p>}

        {report && (
          <>
            <CallsSummary summary={report.summary} />
            <CallsTable calls={report.calls} />
          </>
        )}
      </main>
    </div>
  );
}

export default function ReportPage() {
  return <IframeAuthBootstrap>{({ user }) => <ReportContent user={user} />}</IframeAuthBootstrap>;
}
