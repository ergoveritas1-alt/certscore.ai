import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { consentReceiptAvailabilitySchema } from './consent-receipt-availability';
const fixture = JSON.parse(readFileSync(__dirname + '/../fixtures/retained-confirmation-availability-20261114.json', 'utf8'));

test('post-deploy unconfirmed fixture retains eighteen distinct action/source references', () => {
  assert.equal(fixture.rows.length, 18);
  assert.equal(new Set(fixture.rows.map((r: any) => r.sourcePacketSha256)).size, 18);
});
for (const row of fixture.rows) test(`retained ${row.domain} ${row.action}: receipt availability cannot supply decision proof`, () => {
  const parsed = consentReceiptAvailabilitySchema.parse(row.availability);
  assert.equal(parsed.sourcePacketSha256, row.sourcePacketSha256);
  assert.equal(parsed.action, row.action);
  assert.equal(parsed.diagnosticOnly, true);
  assert.equal(parsed.coverage, 'retained_observations_only');
  assert.equal(consentReceiptAvailabilitySchema.safeParse({...parsed, consentConfirmed: true}).success, false);
});
test('Care value proofs preserve truncation; Bologna zero observations do not assert unavailable receipts', () => {
  const care = fixture.rows.find((r: any) => r.domain === 'care.com' && r.action === 'reject');
  assert.equal(care.availability.observationsTruncated, true);
  assert.ok(care.availability.phases.initial.receipts.valueProof > 0);
  assert.ok(care.diagnosticReasons.includes('configuration_malformed'));
  const bologna = fixture.rows.find((r: any) => r.domain === 'unibo.it');
  assert.equal(bologna.availability.phases.initial.receipts.retained, 0);
  assert.equal(bologna.availability.phases.initial.receipts.unavailable, 0);
});
