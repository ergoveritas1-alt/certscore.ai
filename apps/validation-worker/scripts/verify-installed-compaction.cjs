// Run inside the final image, resolving dependencies from the worker entrypoint.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const workerRequire = createRequire(resolve('apps/validation-worker/dist/apps/validation-worker/src/index.js'));
const { compactCrawlObservation } = workerRequire('@website-signal-risk-scanner/shared');
const rows = ['GET', 'POST', undefined].map((method, index) => ({
  id: `event-${index}`, kind: 'request', identity: `identity-${index}`,
  label: 'https://fixture.invalid/collect', purpose: 'unknown',
  relationship: 'unknown', assessment: 'Not assessed', confidence: 'unknown',
  eventCount: 1, evidenceRefs: [`event-${index}`],
  details: method ? { method, initiator: 'omit-from-summary' } : {},
}));
const compact = compactCrawlObservation({ occurrences: rows });
assert.deepEqual(compact.occurrences.map(row => row.details), [{ method: 'GET' }, { method: 'POST' }, {}]);
assert.equal(compact.occurrences.length, 3);
console.log('Installed validation compaction verified: GET/POST preserved; missing methods remain unknown.');
