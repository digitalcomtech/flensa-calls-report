const PHASE_WARNING_TEXT =
  'Primera fase: este reporte no relaciona alertas. El universo del reporte son únicamente las llamadas realizadas en el rango de fechas y horario seleccionado. En una segunda fase se podría agregar la relación llamada-alerta.';

export default function PhaseWarningBanner() {
  return (
    <div className="phase-warning no-print" role="status">
      <p>{PHASE_WARNING_TEXT}</p>
    </div>
  );
}
