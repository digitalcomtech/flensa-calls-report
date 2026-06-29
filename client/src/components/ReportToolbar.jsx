import { analyticsEvents, trackEvent } from '../analytics/posthogAnalytics.js';
import { downloadTextFile, summaryTableToCsv, summaryTableToText } from '../utils/reportExport.js';

export default function ReportToolbar({
  activeTab,
  from,
  to,
  summary,
  onCopy,
  onCsvContent,
  csvFilename,
  copyLabel = 'Copiar',
}) {
  function handleCopy() {
    if (onCopy) {
      onCopy();
      return;
    }

    if (activeTab === 'resumen' && summary) {
      navigator.clipboard?.writeText(summaryTableToText(summary));
    }
  }

  function handleCsv() {
    if (onCsvContent) {
      downloadTextFile({
        content: onCsvContent(),
        filename: csvFilename ?? `reporte-${from}-${to}.csv`,
        mimeType: 'text/csv;charset=utf-8',
      });
      trackEvent(analyticsEvents.EXPORT_CSV_CLICKED, {
        page: activeTab,
        module: 'calls_report',
        tab: activeTab,
      });
      return;
    }

    if (activeTab === 'resumen' && summary) {
      downloadTextFile({
        content: summaryTableToCsv(summary),
        filename: `resumen-llamadas-${from}-${to}.csv`,
        mimeType: 'text/csv;charset=utf-8',
      });
      trackEvent(analyticsEvents.EXPORT_CSV_CLICKED, {
        page: 'resumen',
        module: 'calls_report',
        tab: 'resumen',
      });
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="report-toolbar no-print">
      <button type="button" className="button secondary toolbar-button" onClick={handleCopy}>
        {copyLabel}
      </button>
      <button type="button" className="button secondary toolbar-button" onClick={handleCsv}>
        CSV
      </button>
      <button type="button" className="button secondary toolbar-button" onClick={handlePrint}>
        Imprimir
      </button>
    </div>
  );
}
