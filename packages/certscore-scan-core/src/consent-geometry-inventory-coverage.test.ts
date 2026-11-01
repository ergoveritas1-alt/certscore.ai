import assert from "node:assert/strict";
import test from "node:test";
import { browserDocumentIdentitySchema, consentUiObservationSchema, type ConsentUiObservation } from "@certscore/contracts";
import retained from "./test-fixtures/retained-consent-checkpoints.json";
import { reconcileConsentGeometryInventoryCoverage, STALE_CONSENT_GEOMETRY_BASIS } from "./consent-geometry-inventory-coverage";

test("retained CyberGhost final inventory cannot inherit its older completed geometry channel", () => {
  const fixture = retained.find(row => row.site === "cyberghostvpn.com")!;
  const observation = consentUiObservationSchema.parse(fixture.observation);
  const geometry = { ...fixture.geometry, documentIdentity: browserDocumentIdentitySchema.parse(fixture.geometry.documentIdentity) };
  const saved = structuredClone(observation);
  assert.equal(Date.parse(geometry.capturedAt) - fixture.scanStartedAtMs, 10_973);
  assert.equal(observation.observedAtMs, 14_919);
  const corrected = reconcileConsentGeometryInventoryCoverage({ ...fixture, geometry, observation });
  assert.equal(corrected.inventoryOutcome, "partial");
  assert.ok(!corrected.captureDiagnostics?.completedChannels.includes("geometry"));
  assert.ok(corrected.captureDiagnostics?.completedChannels.includes("dom_inventory"));
  assert.ok(corrected.basis.includes(STALE_CONSENT_GEOMETRY_BASIS));
  assert.deepEqual(corrected.controls, saved.controls);
  assert.deepEqual(corrected.evidenceRefs, saved.evidenceRefs);
  assert.equal(corrected.observedAtMs, saved.observedAtMs);
  assert.equal(corrected.acceptControlObserved, true);
  assert.deepEqual(observation, saved, "retained source remains immutable");
  consentUiObservationSchema.parse(corrected);
});

test("all twelve retained checkpoint pairs preserve positive controls and distinguish stale coverage", () => {
  let stale = 0;
  for (const fixture of retained) {
    const observation = consentUiObservationSchema.parse(fixture.observation);
    const geometry = { ...fixture.geometry, documentIdentity: browserDocumentIdentitySchema.parse(fixture.geometry.documentIdentity) };
    const corrected = reconcileConsentGeometryInventoryCoverage({ ...fixture, geometry, observation });
    assert.deepEqual(corrected.controls, observation.controls);
    assert.deepEqual(corrected.captureDiagnostics?.timedOutChannels, observation.captureDiagnostics?.timedOutChannels);
    assert.deepEqual(corrected.captureDiagnostics?.failedChannels, observation.captureDiagnostics?.failedChannels);
    if (corrected !== observation) {
      stale++;
      assert.ok(!corrected.captureDiagnostics?.completedChannels.includes("geometry"));
      assert.notEqual(corrected.inventoryOutcome, "complete_with_controls");
      assert.notEqual(corrected.inventoryOutcome, "complete_empty");
    }
    consentUiObservationSchema.parse(corrected);
  }
  assert.equal(stale, 6);
});

test("current, equal-time, missing or differently bound geometry is not reinterpreted", () => {
  const fixture = retained.find(row => row.site === "cyberghostvpn.com")!;
  const observation = consentUiObservationSchema.parse(fixture.observation);
  const geometry = { ...fixture.geometry, documentIdentity: browserDocumentIdentitySchema.parse(fixture.geometry.documentIdentity) };
  for (const replacement of [null,
    { ...geometry, capturedAt: new Date(fixture.scanStartedAtMs + observation.observedAtMs).toISOString() },
    { ...geometry, capturedAt: new Date(fixture.scanStartedAtMs + observation.observedAtMs + 1).toISOString() },
    { ...geometry, pageUrl: "https://other.example/" },
    { ...geometry, documentIdentity: { source: "cdp_loader_id" as const, token: "different-loader" } },
    { ...geometry, capturedAt: "invalid" },
  ]) assert.equal(reconcileConsentGeometryInventoryCoverage({ ...fixture, observation, geometry: replacement }), observation);
  const failed: ConsentUiObservation = { ...observation, inventoryOutcome: "timed_out" };
  assert.equal(reconcileConsentGeometryInventoryCoverage({ ...fixture, observation: failed, geometry }).inventoryOutcome, "timed_out");
  const empty: ConsentUiObservation = { ...observation, inventoryOutcome: "complete_empty", controls: [],
    likelyPresent: false, captureStatus: "no_evidence", acceptControlObserved: false };
  const corrected = reconcileConsentGeometryInventoryCoverage({ ...fixture, observation: empty, geometry });
  assert.equal(corrected.inventoryOutcome, "partial", "a later empty DOM read cannot borrow earlier geometry for absence");
  assert.deepEqual(corrected.controls, []);
  assert.equal(corrected.observedAtMs, empty.observedAtMs);
});
