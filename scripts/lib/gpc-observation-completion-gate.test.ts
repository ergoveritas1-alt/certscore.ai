import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGpcObservationCompletionGate, type GpcObservationCompletionRow } from "./gpc-observation-completion-gate.js";

const base = (scanId: string, patch: Partial<GpcObservationCompletionRow> = {}): GpcObservationCompletionRow => ({
  scanId, observationScope: "main_document_and_retained_http_requests", manifestEligible: true,
  representativeAccess: "representative", cohortSourceVerified: true, canary: false,
  retainedArtifactVerified: true, mainDocumentBindingVerified: true,
  delivery: { httpHeaderRetained: true, mainNavigatorReadbackRetained: true, fullContextVerified: true },
  semanticProbe: { terminalStatus: "observed", started: true, ended: true },
  requestCapture: { started: true, ended: true, noDrops: true }, observedFactsDirect: true,
  ...patch,
});

test("requires strict greater than 95% with a confidence bound and reports all-attempt separately", () => {
  const rows = Array.from({ length: 100 }, (_, i) => base(`scan-${i}`));
  rows[0] = base("scan-0", { semanticProbe: { terminalStatus: "not_ready", started: true, ended: true } });
  const result = evaluateGpcObservationCompletionGate(rows, { minimumRepresentativeRows: 10 });
  assert.equal(result.representativeDenominator, 100);
  assert.equal(result.completedRepresentativeCount, 99);
  assert.equal(result.pointEstimateAboveTarget, true);
  assert.equal(result.confidenceBoundAboveTarget, false);
  assert.equal(result.targetAchieved, false);
  assert.equal(result.allAttemptCompletionRate, 0.99);
});

test("observed, unsupported, and unavailable are terminal; unready and incomplete are not", () => {
  const statuses = ["observed", "unsupported", "unavailable"] as const;
  for (const [i, status] of statuses.entries()) {
    const result = evaluateGpcObservationCompletionGate([base(`terminal-${i}`, { semanticProbe: { terminalStatus: status, started: true, ended: true } })], { minimumRepresentativeRows: 1 });
    assert.equal(result.completedRepresentativeCount, 1);
  }
  for (const [i, status] of (["not_ready", "incomplete"] as const).entries()) {
    const result = evaluateGpcObservationCompletionGate([base(`nonterminal-${i}`, { semanticProbe: { terminalStatus: status, started: true, ended: true } })], { minimumRepresentativeRows: 1 });
    assert.equal(result.completedRepresentativeCount, 0);
    assert.ok(result.failedRepresentativeRows[0]?.reasons.includes(`semantic_probe_${status}`));
  }
});

test("does not award header-only, worker/incomplete, dropped, or indirect observations", () => {
  const rows = [
    base("header-only", { delivery: { httpHeaderRetained: true, mainNavigatorReadbackRetained: false, fullContextVerified: false } }),
    base("dropped", { requestCapture: { started: true, ended: true, noDrops: false } }),
    base("indirect", { observedFactsDirect: false }),
  ];
  const result = evaluateGpcObservationCompletionGate(rows, { minimumRepresentativeRows: 1 });
  assert.equal(result.completedRepresentativeCount, 0);
  assert.ok(result.failedRepresentativeRows.every(row => row.reasons.length > 0));
});

test("full-context worker coverage is reported separately and does not veto the approved scope", () => {
  const result = evaluateGpcObservationCompletionGate([
    base("worker-unknown", { delivery: { httpHeaderRetained: true, mainNavigatorReadbackRetained: true, fullContextVerified: false } }),
  ], { minimumRepresentativeRows: 1 });
  assert.equal(result.completedRepresentativeCount, 1);
  assert.equal(result.fullContextVerifiedCount, 0);
  assert.equal(result.fullContextRate, 0);
});

test("a complete no-response capture needs no positive classified request", () => {
  const result = evaluateGpcObservationCompletionGate([base("bounded-empty", {
    delivery: { httpHeaderRetained: true, mainNavigatorReadbackRetained: true, fullContextVerified: false },
    observedFactsDirect: true,
  })], { minimumRepresentativeRows: 1 });
  assert.equal(result.completedRepresentativeCount, 1);
});

test("excludes non-representative and canary rows, rejects unverified cohort provenance, and rejects duplicates", () => {
  const rows = [
    base("good"),
    base("blocked", { representativeAccess: "non_representative" }),
    base("canary", { manifestEligible: false, canary: true }),
    base("unverified", { cohortSourceVerified: false }),
    base("good"),
  ];
  const result = evaluateGpcObservationCompletionGate(rows, { minimumRepresentativeRows: 1 });
  assert.deepEqual(result.duplicateScanIds, ["good"]);
  assert.equal(result.allSubmittedCount, 5);
  assert.equal(result.uniqueSubmittedCount, 3);
  assert.equal(result.representativeDenominator, 1);
  assert.equal(result.excludedNonRepresentativeCount, 1);
  assert.equal(result.excludedCanaryCount, 1);
  assert.equal(result.excludedUnverifiedCohortCount, 0);
  assert.ok(result.gateReasons.includes("duplicate_scan_ids"));
});

test("unknown access remains in the denominator, while verified non-representative no-go is excluded", () => {
  const verifiedNoGo = base("verified-no-go", { representativeAccess: "non_representative" });
  const unknown = base("unknown-access", { representativeAccess: "unknown" });
  const unverifiedNoGo = base("unverified-no-go", { representativeAccess: "non_representative", retainedArtifactVerified: false });
  const result = evaluateGpcObservationCompletionGate([verifiedNoGo, unknown, unverifiedNoGo], { minimumRepresentativeRows: 1 });
  assert.deepEqual(result.accessCounts, { representative: 0, nonRepresentative: 2, unknown: 1 });
  assert.equal(result.excludedNonRepresentativeCount, 1);
  assert.equal(result.includedNonRepresentativeFailureCount, 1);
  assert.equal(result.representativeDenominator, 2);
  assert.equal(result.completedRepresentativeCount, 0);
  assert.equal(result.failedRepresentativeRows.length, 2);
});

test("no positive tracker or opt-out result is required for a complete bounded observation", () => {
  const result = evaluateGpcObservationCompletionGate([base("empty-capture")], { minimumRepresentativeRows: 1 });
  assert.equal(result.targetAchieved, false, "one row cannot establish the calibration target");
  assert.equal(result.completedRepresentativeCount, 1);
  assert.equal(result.failedRepresentativeRows.length, 0);
});
