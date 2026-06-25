import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractPegasusTokenFromUrl,
  normalizePegasusToken,
  stripPegasusTokenFromUrl,
} from './pegasusIframeAuth.js';

describe('pegasusIframeAuth URL token extraction', () => {
  it('reads #token=<token> with highest priority', () => {
    assert.equal(extractPegasusTokenFromUrl('https://preview.example.com/#token=abc123'), 'abc123');
    assert.equal(
      extractPegasusTokenFromUrl('https://preview.example.com/report#token=hashToken&foo=bar'),
      'hashToken'
    );
    assert.equal(
      extractPegasusTokenFromUrl('https://preview.example.com/#token=preferred&auth=ignored'),
      'preferred'
    );
  });

  it('reads ?auth=<token>', () => {
    assert.equal(extractPegasusTokenFromUrl('https://preview.example.com/?auth=abc123'), 'abc123');
    assert.equal(
      extractPegasusTokenFromUrl('https://preview.example.com/report?auth=queryToken'),
      'queryToken'
    );
  });

  it('reads ?access_token=<token>', () => {
    assert.equal(
      extractPegasusTokenFromUrl('https://preview.example.com/?access_token=legacy123'),
      'legacy123'
    );
  });

  it('URL-decodes token values', () => {
    assert.equal(extractPegasusTokenFromUrl('https://preview.example.com/#token=abc%2D123'), 'abc-123');
  });

  it('returns null when token is missing or invalid', () => {
    assert.equal(extractPegasusTokenFromUrl('https://preview.example.com/'), null);
    assert.equal(extractPegasusTokenFromUrl('https://preview.example.com/?foo=bar'), null);
    assert.equal(normalizePegasusToken('bad token!'), null);
  });
});

describe('pegasusIframeAuth URL cleanup', () => {
  it('removes hash token while preserving path', () => {
    assert.equal(
      stripPegasusTokenFromUrl('https://preview.example.com/report#token=abc123'),
      '/report'
    );
  });

  it('removes query tokens while preserving other params', () => {
    assert.equal(
      stripPegasusTokenFromUrl('https://preview.example.com/report?auth=abc123&foo=bar'),
      '/report?foo=bar'
    );
    assert.equal(
      stripPegasusTokenFromUrl('https://preview.example.com/?access_token=abc123'),
      '/'
    );
  });

  it('removes hash token and keeps remaining hash params', () => {
    assert.equal(
      stripPegasusTokenFromUrl('https://preview.example.com/#token=abc123&view=table'),
      '/#view=table'
    );
  });
});
