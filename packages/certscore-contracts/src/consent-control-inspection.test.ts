import assert from "node:assert/strict";
import test from "node:test";
import { classifyConsentInspectionRole, isControlInspectionComplete, isInitialNecessaryOnlySelection, isInitialSelectionSubmit, verifyConsentControlInspection, CONTROL_INSPECTION_POLICY, LEGACY_CONTROL_INSPECTION_POLICY, isRelevantConsentInspectionCandidate } from "./consent-control-inspection";

test("Close requires the complete registered Axeptio optional-off proof", () => {
  const proof = { recipe: "axeptio.initial_optional_off_close.v1", scopeSelector: "open_shadow_root:axeptio",
    submitSelector: '#axeptio_btn_close[aria-label="Close cookie settings"]', complete: true,
    categories: ["all", "ga", "hubspot"].map(id => ({ id, checked: false, disabled: false, inputType: "checkbox" })) };
  assert.equal(isInitialSelectionSubmit("Close", [], proof), true);
  assert.equal(isInitialSelectionSubmit("Close"), false);
  for (const invalid of [{ ...proof, complete: false }, { ...proof, categories: [] },
    { ...proof, categories: [...proof.categories, proof.categories[0]] },
    { ...proof, categories: proof.categories.map(c => ({ ...c, checked: true })) },
    { ...proof, categories: proof.categories.map(c => ({ ...c, disabled: true })) },
    { ...proof, submitSelector: "#generic_close" }]) {
    assert.equal(isInitialNecessaryOnlySelection(invalid), false);
    assert.equal(isInitialSelectionSubmit("Close", [], invalid), false);
  }
  assert.equal(isInitialSelectionSubmit("Close", ["conflicting_consent_decisions"], proof), false);
});

test("information can leave Options limited while Reject inspection is complete", () => {
  const role = classifyConsentInspectionRole({ label: "More information", actionType: "other", tagName: "button", consentContextConfirmed: true });
  const proof = { version: CONTROL_INSPECTION_POLICY, structuralCoverage: "complete" as const, retainedCandidateCount: 1, captureCoverage: { inventoryTruncated: false, documentReadyState: "complete" as const, mainFrameAvailable: true, documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 }, reasonCodes: [], candidates: [{ candidateId: "details", ...role }] };
  assert.equal(isControlInspectionComplete(proof, "reject"), true);
  assert.equal(isControlInspectionComplete(proof, "options"), false);
  assert.equal(isControlInspectionComplete({ ...proof, structuralCoverage: "limited" }, "reject"), false);
});

test("inspection proof rejects missing, duplicated and reclassified retained candidates", () => {
  const candidate = { candidateId: "unknown", label: "Untranslated", actionType: "other", consentContextConfirmed: true,
    layer: "first_layer", enabled: true, intersectsViewport: true, boundingBox: { width: 100, height: 30 }, decisionStatus: "ambiguous" };
  const proof = { version: CONTROL_INSPECTION_POLICY, structuralCoverage: "complete", retainedCandidateCount: 1, captureCoverage: { inventoryTruncated: false, documentReadyState: "complete" as const, mainFrameAvailable: true, documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 }, reasonCodes: [],
    candidates: [{ candidateId: candidate.candidateId, ...classifyConsentInspectionRole(candidate) }] };
  assert.ok(verifyConsentControlInspection(proof, [candidate]));
  assert.equal(verifyConsentControlInspection(proof, undefined), null);
  assert.equal(verifyConsentControlInspection({ ...proof, candidates: [] }, [candidate]), null);
  assert.equal(verifyConsentControlInspection({ ...proof, candidates: [proof.candidates[0], proof.candidates[0]] }, [candidate]), null);
  assert.equal(verifyConsentControlInspection({ ...proof, candidates: [{ candidateId: "unknown", role: "information", unresolvedIntents: [] }] }, [candidate]), null);
  const empty = { ...proof, retainedCandidateCount: 0, candidates: [] };
  assert.ok(verifyConsentControlInspection(empty, []));
  assert.equal(verifyConsentControlInspection(empty, [candidate]), null);
});
test("vendor information requires registered structural context; arbitrary partner buttons stay unresolved", () => {
  for (const [label, selectorHint] of [["partners", "div.qc-cmp2-summary-info button"], ["nasi partnerzy (1100)", "div.didomi-popup-notice-text a"]]) {
    assert.equal(classifyConsentInspectionRole({ label, selectorHint, consentContextConfirmed: true }).role, "vendor_list");
    assert.equal(classifyConsentInspectionRole({ label, selectorHint: "#unrelated", consentContextConfirmed: true }).role, "unknown");
  }
});
test("initial necessary-only recipe requires complete, unique optional-off state", () => {
  const proof = { recipe: "drupal_eu_cookie_compliance.initial_selection.v1", scopeSelector: "#sliding-popup .eu-cookie-compliance-banner",
    submitSelector: ".eu-cookie-compliance-categories-buttons .eu-cookie-compliance-save-preferences-button", complete: true,
    categories: [{ id: "mandatory", checked: true, disabled: true, inputType: "checkbox" }, { id: "statistics", checked: false, disabled: false, inputType: "checkbox" }] };
  assert.equal(isInitialNecessaryOnlySelection(proof), true);
  assert.equal(isInitialNecessaryOnlySelection({ ...proof, complete: false }), false);
  assert.equal(isInitialNecessaryOnlySelection({ ...proof, categories: [...proof.categories, proof.categories[1]] }), false);
  assert.equal(isInitialNecessaryOnlySelection({ ...proof, categories: proof.categories.map(c => ({ ...c, checked: true })) }), false);
});

test("complete structural proof is invalid when retained capture limits contradict it", () => {
  const captureCoverage = { inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
    documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 };
  const proof = { version: CONTROL_INSPECTION_POLICY, structuralCoverage: "complete", retainedCandidateCount: 0, reasonCodes: [], candidates: [], captureCoverage };
  for (const change of [{ inventoryTruncated: true }, { documentReadyState: "loading" }, { mainFrameAvailable: false },
    { documentAndFramesStable: false }, { frameCount: 2 }, { capturedFrameCount: 0 }]) {
    assert.equal(verifyConsentControlInspection({ ...proof, captureCoverage: { ...captureCoverage, ...change } }, []), null);
  }
});


test("v2 identifies OneTrust container and vendor navigation without changing v1", () => {
  const wrapper = { consentContextConfirmed: true, actionType: "other", tagName: "div", ariaLabel: "You must interact with the banner to dismiss it.", selectorHint: "#onetrust-banner-sdk", containerSelectorHint: "#onetrust-banner-sdk" };
  const vendors = { consentContextConfirmed: true, actionType: "other", tagName: "a", label: "List of Partners (vendors)", selectorHint: "p.ot-dpd-desc a", containerSelectorHint: "#onetrust-policy" };
  assert.deepEqual(classifyConsentInspectionRole(wrapper), { role: "information", unresolvedIntents: [] });
  assert.deepEqual(classifyConsentInspectionRole(vendors), { role: "vendor_list", unresolvedIntents: [] });
  for (const candidate of [wrapper, vendors]) {
    assert.equal(classifyConsentInspectionRole(candidate, LEGACY_CONTROL_INSPECTION_POLICY).role, "unknown");
    assert.equal(classifyConsentInspectionRole({ ...candidate, selectorHint: "#unregistered" }).role, "unknown");
  }
  assert.equal(classifyConsentInspectionRole({ ...wrapper, role: "button" }).role, "unknown");
  assert.equal(classifyConsentInspectionRole({ ...wrapper, ariaLabel: undefined }).role, "unknown");
  assert.equal(classifyConsentInspectionRole({ ...vendors, classifierReasonCodes: ["conflicting_consent_decisions"] }).role, "unknown");
});

test("v2 excludes occluded page controls while v1 verification keeps its original relevance", () => {
  const candidate = { consentContextConfirmed: true, candidateId: "covered", layer: "first_layer", enabled: true, intersectsViewport: true, boundingBox: { width: 100, height: 30 }, decisionStatus: "covered" };
  assert.equal(isRelevantConsentInspectionCandidate(candidate), false);
  assert.equal(isRelevantConsentInspectionCandidate(candidate, LEGACY_CONTROL_INSPECTION_POLICY), true);
  assert.equal(isRelevantConsentInspectionCandidate({ ...candidate, decisionStatus: "ambiguous" }), true);
});

test("historical v1 inspection roles verify unchanged and cannot be relabeled as v2", () => {
  const candidate = { candidateId: "wrapper", layer: "first_layer", enabled: true, intersectsViewport: true, boundingBox: { width: 900, height: 200 }, decisionStatus: "ambiguous", consentContextConfirmed: true, actionType: "other", tagName: "div", ariaLabel: "You must interact with the banner to dismiss it.", selectorHint: "#onetrust-banner-sdk", containerSelectorHint: "#onetrust-banner-sdk" };
  const proof = { version: LEGACY_CONTROL_INSPECTION_POLICY, structuralCoverage: "complete", retainedCandidateCount: 1, captureCoverage: { inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true, documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 }, reasonCodes: [], candidates: [{ candidateId: "wrapper", ...classifyConsentInspectionRole(candidate, LEGACY_CONTROL_INSPECTION_POLICY) }] };
  assert.ok(verifyConsentControlInspection(proof, [candidate]));
  assert.equal(verifyConsentControlInspection({ ...proof, version: CONTROL_INSPECTION_POLICY }, [candidate]), null);
  assert.ok(verifyConsentControlInspection({ ...proof, version: CONTROL_INSPECTION_POLICY, candidates: [{ candidateId: "wrapper", ...classifyConsentInspectionRole(candidate) }] }, [candidate]));
});
