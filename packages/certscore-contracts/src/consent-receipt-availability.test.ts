import assert from "node:assert/strict";
import test from "node:test";
import { consentReceiptCaptureSchema } from "./consent-receipt-capture";
import { consentReceiptAvailabilitySchema, summarizeConsentReceiptAvailability } from "./consent-receipt-availability";

const sha = "a".repeat(64);
const observation = {phase: "initial", source: "api", keySha256: "b".repeat(64),
  readAtEpochMs: 15, available: true, format: "api", facts: [], factsLimited: false, omittedFields: 0};
function capture(observations: unknown[] = []) {
  return consentReceiptCaptureSchema.parse({policyVersion: "consent_receipt_capture.v1", diagnosticOnly: true,
    scanId: "owned-unit", action: "accept", authorizedTargetSha256: "c".repeat(64),
    clockOriginAtEpochMs: 0, actionDispatchedAtEpochMs: 10, frozenAtEpochMs: 30,
    documentStable: true, cancelled: false, observationsTruncated: false, processingLimited: false, observations});
}

test("phase availability preserves missing, limited and value proof without leaking receipt facts", () => {
  const summary = summarizeConsentReceiptAvailability(capture([
    {...observation, phase: "baseline", readAtEpochMs: 5, available: false},
    {...observation, factsLimited: true, omittedFields: 1},
    {...observation, phase: "terminal", readAtEpochMs: 25, valueSha256: "d".repeat(64)},
    {...observation, source: "configuration", format: "configuration", valueSha256: "e".repeat(64)},
  ]), sha)!;
  assert.deepEqual(summary.phases.baseline.receipts, {retained: 1, available: 0, unavailable: 1, limited: 0, valueProof: 0});
  assert.deepEqual(summary.phases.initial.receipts, {retained: 1, available: 1, unavailable: 0, limited: 1, valueProof: 0});
  assert.deepEqual(summary.phases.terminal.receipts, {retained: 1, available: 1, unavailable: 0, limited: 0, valueProof: 1});
  assert.equal(summary.phases.initial.configuration.valueProof, 1);
  assert.equal(summary.coverage, "retained_observations_only");
  const json = JSON.stringify(summary);
  assert.doesNotMatch(json, /keySha256|valueSha256|facts|decision|owned-unit/);
  assert.ok(Buffer.byteLength(json) < 2048);
});

test("no capture/source stays unavailable, while retained zero rows and invalidation stay explicit", () => {
  assert.equal(summarizeConsentReceiptAvailability(undefined, sha), undefined);
  assert.equal(summarizeConsentReceiptAvailability(capture()), undefined);
  const empty = summarizeConsentReceiptAvailability(capture(), sha)!;
  assert.equal(empty.phases.terminal.receipts.retained, 0);
  assert.equal(empty.phases.terminal.receipts.unavailable, 0);
  assert.equal(empty.coverage, "retained_observations_only");
  const cancelled = summarizeConsentReceiptAvailability({...capture(), cancelled: true, documentStable: false,
    processingLimited: true, observationsTruncated: true}, sha)!;
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.documentStable, false);
  assert.equal(cancelled.processingLimited, true);
  assert.equal(cancelled.observationsTruncated, true);
});

test("summary rejects contradictory counts, invalidated rows, overflow and extra data", () => {
  const valid = summarizeConsentReceiptAvailability(capture([observation]), sha)!;
  for (const counts of [
    {...valid.phases.initial.receipts, unavailable: 1},
    {...valid.phases.initial.receipts, limited: 2},
    {...valid.phases.initial.receipts, valueProof: 2},
    {retained: 8, available: 8, unavailable: 0, limited: 0, valueProof: 0},
  ]) {
    const invalid = {...valid, phases: {...valid.phases, baseline: valid.phases.initial,
      initial: {...valid.phases.initial, receipts: counts}}};
    assert.equal(consentReceiptAvailabilitySchema.safeParse(invalid).success, false);
  }
  assert.equal(consentReceiptAvailabilitySchema.safeParse({...valid, cancelled: true}).success, false);
  assert.equal(consentReceiptAvailabilitySchema.safeParse({...valid, documentStable: false}).success, false);
  assert.equal(consentReceiptAvailabilitySchema.safeParse({...valid, rawValue: "do-not-export"}).success, false);
});
