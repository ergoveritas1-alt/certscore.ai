import assert from "node:assert/strict";
import test from "node:test";
import {FIRST_LAYER_OPT_OUT_GEOMETRY_MAX_BYTES, consentCaptureDiagnosticSchema, consentUiObservationSchema,
  firstLayerOptOutGeometryDiagnosticSchema} from "@certscore/contracts";
import type {Page} from "playwright";
import {buildConsentCaptureDiagnostic, type ConsentRefreshDiagnosticOutcome} from "./consent-capture-diagnostic";
import {captureConsentControlGeometry, type ConsentControlGeometryArtifact} from "./consent-control-geometry";

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

test("existing geometry reads retain bounded frame outcomes and exact opt-out candidate slots", async () => {
  const pageUrl = observation.documentUrl!;
  const box = {x: 1, y: 1, width: 100, height: 40};
  const viewport = {width: 800, height: 600};
  const candidate = {
    frameUrl: pageUrl, label: "Proceed", tagName: "button", layer: "first_layer",
    selectorHint: "button", contextText: "Cookie consent", enabled: true, semanticallyInteractive: true,
    computedStyle: {display: "block", visibility: "visible", opacity: "1"},
    boundingBox: box, viewport, intersectsViewport: true, clippedByScrollableAncestor: false,
    occlusion: {center: true, checkedPoints: 1, hitSelectorHints: []},
  };
  const reads: number[] = [];
  // All frames have the same URL. Slot provenance must come from the exact
  // read, including when candidate sorting changes the inventory order.
  const frames = Array.from({length: 13}, (_, slot) => ({
    url: () => pageUrl,
    evaluate: async () => {
      reads.push(slot);
      if (slot === 2) throw Error("Fixture frame read failed");
      if (slot === 3) return new Promise(() => {});
      return {
        pageUrl, viewport, documentReadyState: "complete", inventoryLimited: slot === 4,
        scripts: [], cookieNames: [], globals: [], domSelectors: [], textSnippets: [], containers: [],
        candidates: slot === 1 ? Array.from({length: 5}, (_, index) => ({...candidate, selectorHint: `#choice-${index}`})) :
          slot === 0 ? [{...candidate, label: "Do Not Sell or Share My Personal Information"}] : [],
      };
    },
  }));
  const page = {
    url: () => pageUrl, mainFrame: () => frames[0], frames: () => frames,
    context: () => ({cookies: async () => []}), on() {}, off() {},
  } as unknown as Page;
  const captured = await captureConsentControlGeometry(page, {documentIdentity: observation.documentIdentity, timeoutMs: 15});
  assert.deepEqual(reads, Array.from({length: 12}, (_, slot) => slot));
  const evidence = captured.firstLayerOptOutGeometry;
  assert.ok(evidence);
  assert.equal(evidence.framesAtStart, 13);
  assert.equal(evidence.captureCoverage.capturedFrameCount, 10);
  assert.equal(evidence.structuralCoverage, "limited");
  assert.deepEqual(evidence.frameOutcomes.slice(0, 5), ["captured", "captured", "failed", "timed_out", "truncated"]);
  assert.equal(evidence.classifiedOptOutCount, 1);
  assert.equal(evidence.unresolvedOptOutCount, 5);
  assert.equal(evidence.candidates.length, 4);
  for (const item of evidence.candidates) {
    assert.equal(item.frameSlot, 1);
    assert.equal(item.coverage, "unresolved_opt_out");
    assert.equal(captured.candidates[item.ordinal]?.label, "Proceed");
  }
  assert.ok(Buffer.byteLength(JSON.stringify(evidence)) <= FIRST_LAYER_OPT_OUT_GEOMETRY_MAX_BYTES);
  assert.doesNotMatch(JSON.stringify(evidence), /Proceed|fixture\.test|choice-0/);

  assert.equal(firstLayerOptOutGeometryDiagnosticSchema.safeParse({
    ...evidence, candidates: evidence.candidates.map(item => ({...item, frameSlot: 2})),
  }).success, false);
});
