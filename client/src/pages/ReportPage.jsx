import { useState } from 'react';
import { getCallsReport } from '../api/reportClient.js';
import ReportConfigPanel from '../components/ReportConfigPanel.jsx';
import DetallesTab from '../components/DetallesTab.jsx';
import IframeAuthBootstrap from '../components/IframeAuthBootstrap.jsx';
import ReportTabs from '../components/ReportTabs.jsx';
import ResumenTab from '../components/ResumenTab.jsx';

function ReportContent() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runReport(e) {
    e?.preventDefault();
    if (!from || !to) {
      return;
    }
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
      <main className="main">
        <ReportConfigPanel
          from={from}
          to={to}
          loading={loading}
          onChange={({ from: nextFrom, to: nextTo }) => {
            setFrom(nextFrom);
            setTo(nextTo);
          }}
          onSubmit={runReport}
        />

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
  return <IframeAuthBootstrap>{() => <ReportContent />}</IframeAuthBootstrap>;
}
