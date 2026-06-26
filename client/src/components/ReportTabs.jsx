const TABS = [
  { id: 'resumen', label: 'RESUMEN' },
  { id: 'detalles', label: 'DETALLES' },
];

export default function ReportTabs({ activeTab, onTabChange }) {
  return (
    <div className="report-tabs no-print" role="tablist" aria-label="Vistas del reporte">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`report-tab${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
