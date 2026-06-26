import { PHASE_WARNING_TEXT } from '../constants/reportConfig.js';

export default function PhaseWarningBanner() {
  return (
    <div className="phase-warning no-print" role="status">
      <p>{PHASE_WARNING_TEXT}</p>
    </div>
  );
}
