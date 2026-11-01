import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./test-fixtures/dollar-general-consent-assessment.json";
import { projectPublicFirstLayerConsentEvidence } from "./public-first-layer-consent-evidence";

test("retained Dollar General complete control inspection survives limited overall coverage", () => {
  const a = fixture.assessment;
  assert.equal(a.coverage.status, "limited");
  const p = projectPublicFirstLayerConsentEvidence(a, fixture.provenance.scanId)!;
  assert.equal(p.acceptControlObserved, true);
  assert.equal(p.rejectControlObserved, false);
  assert.equal(p.managePreferencesControlObserved, false);
  assert.equal(p.privacyOptOutControlObserved, false);
  assert.equal(p.privacyOptOutControlInventoryComplete, true);
  assert.equal(p.controlInventoryComplete, true);
  assert.equal(p.assessmentSourceHash, a.provenance.sourceHash);
  assert.equal(p.controlInspection.reject?.status, "complete");
});

test("opt-out presence and absence use their own first-layer inspection without changing A/R/O completeness", () => {
  for (const state of ["observed", "unknown"] as const) {
    const a = structuredClone(fixture.assessment);
    a.controls.privacyOptOut.state = state;
    a.controls.privacyOptOut.inspection.status = "limited";
    a.controls.privacyOptOut.inspection.evidenceRefs = [];
    const p = projectPublicFirstLayerConsentEvidence(a, fixture.provenance.scanId)!;
    assert.equal(p.privacyOptOutControlObserved, state === "observed" ? true : null);
    assert.equal(p.privacyOptOutControlInventoryComplete, false);
    assert.equal(p.controlInventoryComplete, true, "opt-out coverage cannot alter A/R/O completeness");
    assert.equal(p.controlInspection.privacyOptOut?.status, "limited");
  }
  const deeper: any = structuredClone(fixture.assessment);
  deeper.controls.privacyOptOut.state = "observed";
  deeper.controls.privacyOptOut.layer = "deeper_layer";
  assert.equal(projectPublicFirstLayerConsentEvidence(deeper, fixture.provenance.scanId)?.privacyOptOutControlObserved, null);
});

test("incomplete and unknown controls stay unknown independently of other controls", () => {
  for (const state of ["unknown", "not_observed"] as const) {
    const a = structuredClone(fixture.assessment);
    a.controls.reject.state = state;
    a.controls.reject.inspection.status = "limited";
    a.controls.reject.inspection.evidenceRefs = [];
    const p = projectPublicFirstLayerConsentEvidence(a, fixture.provenance.scanId);
    if (state === "not_observed") {
      assert.equal(p, null, "negative state without inspection proof is malformed");
      continue;
    }
    assert.ok(p);
    assert.equal(p.rejectControlObserved, null);
    assert.equal(p.acceptControlObserved, true);
    assert.equal(p.controlInventoryComplete, false);
  }
});

test("malformed, wrong-scan, no-go and unbound assessments cannot supply public capture evidence", () => {
  assert.equal(projectPublicFirstLayerConsentEvidence({}, fixture.provenance.scanId), null);
  assert.equal(projectPublicFirstLayerConsentEvidence(fixture.assessment, "different-scan"), null);
  const noGo = structuredClone(fixture.assessment);
  noGo.scan.noGo = true;
  assert.equal(projectPublicFirstLayerConsentEvidence(noGo, fixture.provenance.scanId), null);
  const unbound = structuredClone(fixture.assessment);
  unbound.document.identityStatus = "mismatched";
  assert.equal(projectPublicFirstLayerConsentEvidence(unbound, fixture.provenance.scanId), null);
});
