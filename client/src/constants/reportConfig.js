export const REPORT_TITLE = 'Llamadas';

export const REPORT_PAGE_SUBTITLE =
  'Muestra las llamadas realizadas por el proveedor en el rango de fechas y horario seleccionado.';

export const REPORT_DESCRIPTION =
  'Reporte simple de llamadas realizadas. Esta primera fase no relaciona alertas; sólo muestra el volumen de llamadas, contestadas, no contestadas y el detalle completo del rango consultado.';

/** Fase 1 always queries full UTC days; hour-level filtering is deferred. */
export const FASE1_TIME_RANGE_LABEL = '00:00 - 23:59';

export const FASE1_TIME_RANGE_HELP =
  'Fase 1: el reporte cubre cada día completo en UTC (00:00–23:59). La selección de horario parcial queda para una fase posterior.';

export const PHASE_WARNING_TEXT =
  'Primera fase: este reporte no relaciona alertas. El universo del reporte son únicamente las llamadas realizadas en el rango de fechas seleccionado, cubriendo cada día completo (00:00–23:59 UTC). En una segunda fase se podría agregar la relación llamada-alerta y filtros por horario.';
