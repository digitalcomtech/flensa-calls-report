import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeResourcesPayloadShape,
  normalizeResourceArray,
  normalizeResourcesFromPayload,
} from './resources.js';
import { extractTwilioDestinations } from './triggers.js';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';

const PEGASUS194_FIXTURE = {
  username: 'redacted',
  scopes: {},
  email: 'user@example.com',
  id: 99,
  prefs: {},
  assets: [{ id: 1 }],
  tasks: [{ id: 2 }],
  vehicles: [{ id: 3 }],
  triggers: [{ id: 4, processes: [] }],
};

describe('normalizeResourceArray', () => {
  it('supports raw arrays', () => {
    const resources = normalizeResourceArray([
      { id: '1', name: 'Resource A' },
      { id: '2', name: 'Resource B' },
    ]);

    assert.equal(resources.length, 2);
    assert.equal(resources[0].id, '1');
  });

  it('supports response.data arrays', () => {
    const resources = normalizeResourceArray({
      data: [{ id: '10' }, { id: '11' }],
    });

    assert.equal(resources.length, 2);
    assert.equal(resources[0].id, '10');
  });

  it('supports response.resources arrays', () => {
    const resources = normalizeResourceArray({
      resources: [{ id: '20' }, { id: '21' }],
    });

    assert.equal(resources.length, 2);
  });

  it('supports response.items and response.results arrays', () => {
    assert.equal(normalizeResourceArray({ items: [{ id: '30' }] }).length, 1);
    assert.equal(normalizeResourceArray({ results: [{ id: '31' }] }).length, 1);
  });

  it('supports object maps keyed by resource type', () => {
    const resources = normalizeResourceArray({
      triggers: [{ id: 't1', processes: [] }],
      tasks: [{ id: 'task-1' }],
      vehicles: [{ id: 'veh-1' }],
    });

    assert.equal(resources.length, 3);
    assert.deepEqual(
      resources.map((resource) => resource.id).sort(),
      ['t1', 'task-1', 'veh-1']
    );
  });

  it('supports object maps keyed by IDs', () => {
    const resources = normalizeResourceArray({
      123: { id: 123, name: 'Resource 123' },
      456: { id: 456, name: 'Resource 456' },
    });

    assert.equal(resources.length, 2);
    assert.deepEqual(
      resources.map((resource) => String(resource.id)).sort(),
      ['123', '456']
    );
  });

  it('supports nested entities.triggers arrays', () => {
    const resources = normalizeResourceArray({
      entities: {
        triggers: [{ id: 'nt1' }, { id: 'nt2' }],
      },
    });

    assert.equal(resources.length, 2);
    assert.equal(resources[0].id, 'nt1');
  });

  it('returns empty array for unrecognized or empty responses', () => {
    assert.deepEqual(normalizeResourceArray(null), []);
    assert.deepEqual(normalizeResourceArray({}), []);
    assert.deepEqual(normalizeResourceArray({ meta: { total: 0 } }), []);
    assert.deepEqual(normalizeResourceArray('unexpected'), []);
  });

  it('supports pegasus194 user object with top-level resource arrays', () => {
    const resources = normalizeResourceArray(PEGASUS194_FIXTURE);

    assert.equal(resources.length, 4);
    assert.equal(resources.find((resource) => resource.id === 1)?.resourceType, 'asset');
    assert.equal(resources.find((resource) => resource.id === 2)?.resourceType, 'task');
    assert.equal(resources.find((resource) => resource.id === 3)?.resourceType, 'vehicle');
    assert.equal(resources.find((resource) => resource.id === 4)?.resourceType, 'trigger');
  });
});

describe('normalizeResourcesFromPayload', () => {
  it('normalizes pegasus194 hosted shape counts and triggers', () => {
    const hostedShape = {
      username: 'redacted',
      scopes: {},
      email: 'user@example.com',
      id: 99,
      prefs: {},
      assets: Array.from({ length: 204 }, (_, index) => ({ id: `asset-${index}` })),
      tasks: Array.from({ length: 88 }, (_, index) => ({ id: `task-${index}` })),
      vehicles: Array.from({ length: 3791 }, (_, index) => ({ id: `vehicle-${index}` })),
      triggers: Array.from({ length: 483 }, (_, index) => ({ id: `trigger-${index}` })),
    };

    const result = normalizeResourcesFromPayload(hostedShape);

    assert.equal(result.rawCount, 4566);
    assert.equal(result.triggers.length, 483);
    assert.ok(!result.warnings.includes('resources response shape unrecognized or empty'));
    assert.equal(extractTwilioDestinations(result.triggers).triggerCount, 483);
    assert.equal(containsFullPhoneNumber(result.shape), false);
    assert.ok(!('assets' in result.shape));
  });

  it('collects triggers without a type field and preserves safe diagnostics shape', () => {
    const result = normalizeResourcesFromPayload(PEGASUS194_FIXTURE);

    assert.equal(result.rawCount, 4);
    assert.equal(result.triggers.length, 1);
    assert.equal(result.triggers[0].id, 4);
    assert.equal(result.triggers[0].resourceType, 'trigger');
    assert.ok(!result.warnings.includes('resources response shape unrecognized or empty'));
    assert.equal(extractTwilioDestinations(result.triggers).triggerCount, 1);
    assert.equal(result.shape.resourcesRawType, 'object');
    assert.ok(result.shape.resourcesTopLevelKeys.includes('triggers'));
    assert.ok(result.shape.candidateArrayPaths.some((entry) => entry.path === 'triggers' && entry.count === 1));
  });
});

describe('analyzeResourcesPayloadShape', () => {
  it('reports structural metadata without raw payload fields', () => {
    const shape = analyzeResourcesPayloadShape({
      data: [{ id: '1', destination: '+525512345678' }],
      resources: [{ id: '2' }],
      entities: {
        triggers: [{ id: '3' }, { id: '4' }],
      },
    });

    assert.equal(shape.resourcesRawType, 'object');
    assert.deepEqual(shape.resourcesTopLevelKeys, ['data', 'resources', 'entities']);
    assert.ok(shape.candidateArrayPaths.some((entry) => entry.path === 'data' && entry.count === 1));
    assert.ok(shape.candidateArrayPaths.some((entry) => entry.path === 'resources' && entry.count === 1));
    assert.ok(
      shape.candidateArrayPaths.some((entry) => entry.path === 'entities.triggers' && entry.count === 2)
    );
    assert.equal(containsFullPhoneNumber(shape), false);
    assert.ok(!('data' in shape));
    assert.ok(!('resources' in shape));
  });

  it('reports array root type', () => {
    const shape = analyzeResourcesPayloadShape([{ id: '1' }, { id: '2' }]);
    assert.equal(shape.resourcesRawType, 'array');
    assert.deepEqual(shape.candidateArrayPaths, [{ path: '(root)', count: 2 }]);
  });
});

describe('scope diagnostics resource shape fields', () => {
  it('includes structural metadata without raw payload or phone numbers', async () => {
    const { buildSafeScopeDiagnostics } = await import('../reports/scopeDiagnostics.js');

    const diagnostics = buildSafeScopeDiagnostics(
      {
        hasPegasusToken: true,
        resourceCount: 2,
        triggerCount: 1,
        destinationCount: 0,
        destinations: ['+525512345678'],
        warnings: ['resources response shape unrecognized or empty'],
        resourceShape: {
          resourcesRawType: 'object',
          resourcesTopLevelKeys: ['triggers', 'meta'],
          candidateArrayPaths: [
            { path: 'triggers', count: 2 },
            { path: 'entities.triggers', count: 1 },
          ],
        },
      },
      {
        mode: 'mock',
        authMode: 'iframe',
        hasSession: true,
        includeResourceShape: true,
      }
    );

    assert.equal(diagnostics.resourcesRawType, 'object');
    assert.deepEqual(diagnostics.resourcesTopLevelKeys, ['triggers', 'meta']);
    assert.deepEqual(diagnostics.candidateArrayPaths, [
      { path: 'triggers', count: 2 },
      { path: 'entities.triggers', count: 1 },
    ]);
    assert.equal(diagnostics.resourceCount, 2);
    assert.equal(diagnostics.triggerCount, 1);
    assert.equal(diagnostics.destinationCount, 0);
    assert.ok(diagnostics.destinationsPreview.every((preview) => preview.startsWith('***')));
    assert.equal(containsFullPhoneNumber(diagnostics), false);
    assert.ok(!('data' in diagnostics));
    assert.ok(!('triggers' in diagnostics));
  });

  it('omits structural metadata when includeResourceShape is false', async () => {
    const { buildSafeScopeDiagnostics } = await import('../reports/scopeDiagnostics.js');

    const diagnostics = buildSafeScopeDiagnostics(
      {
        resourceShape: {
          resourcesRawType: 'object',
          resourcesTopLevelKeys: ['triggers'],
          candidateArrayPaths: [{ path: 'triggers', count: 2 }],
        },
      },
      {
        mode: 'mock',
        authMode: 'iframe',
        hasSession: true,
        includeResourceShape: false,
      }
    );

    assert.ok(!('resourcesRawType' in diagnostics));
    assert.ok(!('resourcesTopLevelKeys' in diagnostics));
    assert.ok(!('candidateArrayPaths' in diagnostics));
  });
});
