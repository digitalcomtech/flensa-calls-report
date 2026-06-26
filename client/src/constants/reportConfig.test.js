import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FASE1_TIME_RANGE_LABEL,
  PHASE_WARNING_TEXT,
  REPORT_DESCRIPTION,
  REPORT_TITLE,
} from './reportConfig.js';

describe('reportConfig', () => {
  it('defines Fase 1 report identity copy in Spanish', () => {
    assert.equal(REPORT_TITLE, 'Llamadas');
    assert.match(REPORT_DESCRIPTION, /primera fase/i);
    assert.match(REPORT_DESCRIPTION, /no relaciona alertas/i);
  });

  it('fixes Fase 1 time range to full UTC days', () => {
    assert.equal(FASE1_TIME_RANGE_LABEL, '00:00 - 23:59');
    assert.match(PHASE_WARNING_TEXT, /00:00/);
    assert.match(PHASE_WARNING_TEXT, /23:59/);
  });
});
