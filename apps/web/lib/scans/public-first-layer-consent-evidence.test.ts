import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import fixture from "./test-fixtures/dollar-general-consent-assessment.json";
import { projectPublicFirstLayerConsentEvidence } from "./public-first-layer-consent-evidence";

// Retained visible rows from the Hetzner and University of Bologna public exports.
const banners = [
  {
    domain: "hetzner.de",
    scanId: "593c34f9-9ee6-47c3-981a-1900ff2dcddd",
    accept: "Alle Cookies erlauben",
    necessary: "Notwendige Cookies erlauben",
    reject: [],
    options: [],
  },
  {
    domain: "unibo.it",
    scanId: "d9af96c9-1dde-4497-ac5d-f5d93fa25040",
    accept: "ACCETTA TUTTI I COOKIE",
    necessary: "Accetta i cookie necessari e chiudi",
    reject: ["SOLO COOKIE NECESSARI"],
    options: ["PERSONALIZZA COOKIE"],
  },
];

function bannerAssessment(banner: typeof banners[number]) {
  const documentId = `https://${banner.domain}/`;
  const labels = [
    ...banner.reject.map(label => ({ label, intent: "reject" as const })),
    ...banner.options.map(label => ({ label, intent: "options" as const })),
    { label: banner.accept, intent: "accept" as const },
    { label: banner.necessary, intent: "accept" as const },
  ];
  return deriveConsentControlAssessment({
    scan: { scanId: banner.scanId, requestedUrl: documentId, finalUrl: documentId },
    document: { canonicalDocumentId: documentId, identityStatus: "matched" },
    coverage: { status: "complete", completedChannels: ["dom_inventory", "geometry"] },
    observations: [{
      observationId: "banner", observedAtMs: 0, documentId, likelyPresent: true,
      captureStatus: "observed", layerInspected: "first_layer", inventoryOutcome: "complete_with_controls",
      controls: labels.map((row, i) => ({
        ...row, evidenceId: `control-${i}`, layer: "first_layer", visible: true, actionable: true,
      })),
    }],
  });
}

for (const banner of banners) {
  test(`${banner.domain} reports the necessary-only choice separately from the genuine Accept all control`, () => {
    const a = bannerAssessment(banner);
    const original = structuredClone(a);
    const p = projectPublicFirstLayerConsentEvidence(a, banner.scanId)!;
    assert.deepEqual(p.acceptLabels, [banner.accept]);
    assert.deepEqual(p.rejectLabels, [...banner.reject, banner.necessary]);
    assert.deepEqual(p.preferenceLabels, banner.options);
    assert.equal(p.acceptControlObserved, true);
    assert.equal(p.rejectControlObserved, true);
    assert.equal(p.controlInspection.reject?.state, "observed");
    if (!banner.reject.length) {
      assert.ok(p.controlInspection.reject?.evidenceRefs.includes("control-1"));
      assert.ok(!p.controlInspection.reject?.reasonCodes.includes("complete_first_layer_inventory_without_control"));
    }
    assert.deepEqual(a, original);
  });
}

test("a necessary-only label alone supplies no positive Accept all observation", () => {
  const a = bannerAssessment(banners[0]!);
  a.evidence = a.evidence.filter(e => e.label === banners[0]!.necessary);
  const p = projectPublicFirstLayerConsentEvidence(a, a.scan.scanId)!;
  assert.deepEqual(p.acceptLabels, []);
  assert.equal(p.acceptControlObserved, null);
  assert.equal(p.controlInspection.accept?.state, "unknown");
  assert.equal(p.controlInventoryComplete, false);
});

test("the public row limit cannot hide a separately observed Accept all from the summary", () => {
  const a = bannerAssessment(banners[0]!);
  const [accept, necessary] = a.evidence;
  a.evidence = [...Array.from({ length: 12 }, (_, index) => ({
    ...necessary!, evidenceId: `necessary-${index}`,
  })), accept!];
  const p = projectPublicFirstLayerConsentEvidence(a, a.scan.scanId)!;
  assert.equal(p.controls.length, 12);
  assert.deepEqual(p.acceptLabels, []);
  assert.equal(p.acceptControlObserved, true);
  assert.equal(p.rejectControlObserved, true);
});

test("a partial phrase, hidden control or different document cannot establish a necessary-only choice", () => {
  const a = bannerAssessment(banners[0]!);
  const necessary = a.evidence[1]!;
  a.evidence = [
    { ...necessary, label: "Notwendige Cookies erlauben und Analyse aktivieren" },
    { ...necessary, visible: false },
    { ...necessary, documentId: "https://unrelated.example/" },
  ];
  const p = projectPublicFirstLayerConsentEvidence(a, a.scan.scanId)!;
  assert.deepEqual(p.rejectLabels, []);
  assert.equal(p.rejectControlObserved, false);
});

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
