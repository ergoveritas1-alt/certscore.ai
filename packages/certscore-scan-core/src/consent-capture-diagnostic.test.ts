import assert from "node:assert/strict";
import test from "node:test";
import {consentCaptureDiagnosticSchema, consentUiObservationSchema} from "@certscore/contracts";
import {buildConsentCaptureDiagnostic, type ConsentRefreshDiagnosticOutcome} from "./consent-capture-diagnostic";
import type {ConsentControlGeometryArtifact} from "./consent-control-geometry";

const observation = consentUiObservationSchema.parse({observationId: "o", observedAtMs: 400,
  likelyPresent: true, confidence: 1, basis: [], documentUrl: "https://fixture.test/", documentIdentity: {source: "cdp_loader_id", token: "loader"}});
const geometry = {capturedAt: new Date(1000 + 200).toISOString(), pageUrl: observation.documentUrl,
  documentIdentity: observation.documentIdentity} as ConsentControlGeometryArtifact;
const refresh: ConsentRefreshDiagnosticOutcome = {observationId: "o", documentToken: "loader", inventoryObservedAtMs: observation.observedAtMs,
  outcome: "skipped", skipReason: "screenshots_disabled", attempted: false, elapsedMs: 0};

test("stale, current and missing checkpoints remain distinct without changing retained observations", () => {
  const original = JSON.stringify(observation);
  const stale = buildConsentCaptureDiagnostic({observation, geometry, scanStartedAtMs: 1000, refresh});
  assert.equal(stale.geometryMinusInventoryMs, -200);
  assert.deepEqual(consentCaptureDiagnosticSchema.parse(stale), stale);
  const fresh = buildConsentCaptureDiagnostic({observation, geometry: {...geometry, capturedAt: new Date(1600).toISOString()}, scanStartedAtMs: 1000});
  assert.equal(fresh.geometryMinusInventoryMs, 200);
  assert.equal(fresh.skipReason, "stage_not_reached");
  const missing = buildConsentCaptureDiagnostic({observation, scanStartedAtMs: 1000});
  assert.equal(missing.geometryMinusInventoryMs, null);
  assert.equal(missing.geometryBinding, "unavailable");
  assert.equal(JSON.stringify(observation), original);
});

test("same-URL loader changes never acquire another document's refresh result or comparable timing", () => {
  const result = buildConsentCaptureDiagnostic({observation: {...observation, documentIdentity: {source: "cdp_loader_id", token: "new"}}, geometry, scanStartedAtMs: 1000, refresh});
  assert.equal(result.geometryBinding, "mismatched");
  assert.equal(result.geometryMinusInventoryMs, null);
  assert.equal(result.skipReason, "observation_changed");
  assert.equal(result.attempted, false);
});

test("diagnostic schema rejects fabricated attempts, deltas, versions and unbounded metadata", () => {
  const result = buildConsentCaptureDiagnostic({observation, geometry, scanStartedAtMs: 1000, refresh});
  for (const patch of [{attempted: true}, {geometryMinusInventoryMs: 0}, {version: "future"},
    {outcome: "retained", skipReason: null}, {observationId: "x".repeat(241)}, {extra: "unreviewed"}])
    assert.equal(consentCaptureDiagnosticSchema.safeParse({...result, ...patch}).success, false);
});

test("every refresh outcome survives with explicit attempt status", () => {
  for (const outcome of ["retained", "already_considered", "ineligible", "budget_unavailable", "cancelled", "timed_out", "invalid_capture", "no_positive_control", "document_changed", "retention_failed"] as const) {
    const attempted = !["already_considered", "ineligible", "budget_unavailable", "cancelled"].includes(outcome);
    const result = buildConsentCaptureDiagnostic({observation, geometry, scanStartedAtMs: 1000,
      refresh: {...refresh, outcome, skipReason: null, attempted, elapsedMs: 25}});
    assert.equal(consentCaptureDiagnosticSchema.parse(result).outcome, outcome);
  }
});

test("eligibility blockers retain their observation binding and remain optional on older diagnostics", () => {
  const outcome: ConsentRefreshDiagnosticOutcome = {...refresh, outcome: "skipped",
    skipReason: "not_refresh_candidate", eligibilityBlocker: "geometry_frame_cap_exceeded"};
  const current = buildConsentCaptureDiagnostic({observation, scanStartedAtMs: 1000, refresh: outcome});
  assert.equal(consentCaptureDiagnosticSchema.parse(current).eligibilityBlocker, "geometry_frame_cap_exceeded");
  const other = buildConsentCaptureDiagnostic({observation: {...observation, observationId: "other"},
    scanStartedAtMs: 1000, refresh: outcome});
  assert.equal(consentCaptureDiagnosticSchema.parse(other).eligibilityBlocker, undefined);
  const newerInventory = buildConsentCaptureDiagnostic({observation: {...observation, observedAtMs: observation.observedAtMs + 1},
    scanStartedAtMs: 1000, refresh: outcome});
  assert.equal(consentCaptureDiagnosticSchema.parse(newerInventory).skipReason, "observation_changed");
  assert.equal(newerInventory.eligibilityBlocker, undefined);
  assert.equal(consentCaptureDiagnosticSchema.safeParse({...current, skipReason: "screenshots_disabled"}).success, false);
});
