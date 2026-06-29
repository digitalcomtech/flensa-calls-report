import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REPORT_DESCRIPTION, REPORT_TITLE } from './reportConfig.js';

describe('reportConfig', () => {
  it('defines report identity copy in Spanish', () => {
    assert.equal(REPORT_TITLE, 'Llamadas');
    assert.match(REPORT_DESCRIPTION, /primera fase/i);
    assert.match(REPORT_DESCRIPTION, /no relaciona alertas/i);
  });
});
