import {
  REPORT_DESCRIPTION,
  REPORT_TITLE,
} from '../constants/reportConfig.js';

export default function ReportIdentityCard() {
  return (
    <div className="report-identity">
      <div className="report-identity-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z" />
        </svg>
      </div>
      <div className="report-identity-copy">
        <h2 className="report-identity-title">{REPORT_TITLE}</h2>
        <p className="report-identity-description">{REPORT_DESCRIPTION}</p>
      </div>
    </div>
  );
}
