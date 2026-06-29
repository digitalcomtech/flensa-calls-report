import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bucketResultCount,
  getBrowserContextProps,
  sanitizeProperties,
} from './posthogAnalytics.js';

describe('posthogAnalytics', () => {
  it('removes sensitive property keys case-insensitively', () => {
    const safe = sanitizeProperties({
      page: 'detalles',
      Email: 'secret@example.com',
      userName: 'alice',
      TOKEN: 'abc',
      result_count_bucket: '1-10',
    });

    assert.equal(safe.page, 'detalles');
    assert.equal(safe.result_count_bucket, '1-10');
    assert.equal(safe.Email, undefined);
    assert.equal(safe.userName, undefined);
    assert.equal(safe.TOKEN, undefined);
  });

  it('returns safe browser context without query params', () => {
    global.window = {
      location: {
        origin: 'https://example.com',
        pathname: '/report',
        search: '?token=secret',
        hostname: 'example.com',
      },
    };

    const context = getBrowserContextProps();

    assert.equal(context.$current_url, 'https://example.com/report');
    assert.equal(context.$pathname, '/report');
    assert.equal(context.app_host, 'example.com');

    delete global.window;
  });

  it('buckets result counts', () => {
    assert.equal(bucketResultCount(0), '0');
    assert.equal(bucketResultCount(7), '1-10');
    assert.equal(bucketResultCount(42), '11-50');
    assert.equal(bucketResultCount(900), '500+');
  });
});
