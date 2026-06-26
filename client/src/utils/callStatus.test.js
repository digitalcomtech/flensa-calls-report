import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAnsweredLabel, formatProviderStatus } from './callStatus.js';

describe('callStatus', () => {
  it('maps provider statuses to Spanish labels', () => {
    assert.equal(formatProviderStatus('completed'), 'Completada');
    assert.equal(formatProviderStatus('no-answer'), 'Sin respuesta');
    assert.equal(formatProviderStatus('busy'), 'Ocupado');
    assert.equal(formatProviderStatus('failed'), 'Fallida');
    assert.equal(formatProviderStatus('canceled'), 'Cancelada');
    assert.equal(formatProviderStatus('queued'), 'En cola');
    assert.equal(formatProviderStatus('ringing'), 'Timbrando');
    assert.equal(formatProviderStatus('in-progress'), 'En curso');
  });

  it('falls back to the original status when unmapped', () => {
    assert.equal(formatProviderStatus('custom-status'), 'custom-status');
  });

  it('maps answered labels from provider status', () => {
    assert.equal(formatAnsweredLabel('completed'), 'Sí');
    assert.equal(formatAnsweredLabel('no-answer'), 'No');
    assert.equal(formatAnsweredLabel('busy'), 'No');
    assert.equal(formatAnsweredLabel('failed'), 'No');
    assert.equal(formatAnsweredLabel('canceled'), 'No');
    assert.equal(formatAnsweredLabel('ringing'), '—');
    assert.equal(formatAnsweredLabel('queued'), '—');
  });
});
