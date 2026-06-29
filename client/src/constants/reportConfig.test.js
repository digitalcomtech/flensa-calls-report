import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REPORT_TITLE } from './reportConfig.js';

describe('reportConfig', () => {
  it('defines the report title', () => {
    assert.equal(REPORT_TITLE, 'Llamadas');
  });
});
