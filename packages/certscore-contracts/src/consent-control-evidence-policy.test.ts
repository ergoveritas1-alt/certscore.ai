import assert from "node:assert/strict";
import test from "node:test";
import { hasPositiveControlBox, hasUnresolvedConsentDecision, consentSessionAccessLimited } from "./consent-control-evidence-policy";
import { classifyConsentControlLabel } from "./consent-control-label-classifier";

test("new observation vocabulary does not expand automatic action eligibility", () => {
  for (const label of ["Allow", "Agree to all", "Accept additional cookies", "Reject Non-Necessary Cookies", "Reject unnecessary cookies", "Aceitar cookies", "Gerenciar cookies"]) {
    assert.notEqual(classifyConsentControlLabel({ label, hasConsentContext: true }).intent, "unknown", label);
    assert.equal(classifyConsentControlLabel({ label, hasConsentContext: true, usage: "action" }).intent, "unknown", label);
    assert.equal(classifyConsentControlLabel({ label, contextText: "Account checkout and newsletter", hasConsentContext: false }).intent, "unknown", label);
  }
  assert.equal(classifyConsentControlLabel({ label: "Accept all", hasConsentContext: true, usage: "action" }).intent, "accept");
});

test("Cookiebot details is recognized only with the registered passive recipe", () => {
  assert.equal(classifyConsentControlLabel({ label: "Show details", hasConsentContext: true }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Show details", hasConsentContext: true, observationRecipe: "Cookiebot.options.v1" }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Show details", hasConsentContext: true, observationRecipe: "Cookiebot.options.v1", usage: "action" }).intent, "unknown");
});

test("page-wide privacy context does not make padded settings labels into consent Options", () => {
  for (const label of ["AI Settings", "Settings and quick links", "Keep videos secure with privacy settings", "Learn more about our products"]) {
    assert.equal(classifyConsentControlLabel({ label, hasConsentContext: true }).intent, "unknown", label);
  }
  assert.equal(classifyConsentControlLabel({ label: "Settings", hasConsentContext: true }).intent, "options");
});

test("only visible unresolved consent decision controls limit absence", () => {
  const button = { actionType: "other", decisionStatus: "ambiguous", label: "Decide later", tagName: "button", layer: "first_layer", consentContextConfirmed: true, enabled: true, intersectsViewport: true, boundingBox: { width: 40, height: 20 } };
  assert.equal(hasUnresolvedConsentDecision({ candidates: [button] }), true);
  for (const update of [{ label: "Close", classifierReasonCodes: ["matched_dismiss"] }, { layer: "page_body" }, { tagName: "a", label: "Terms of use" }, { enabled: false }, { boundingBox: { width: 0, height: 20 } }, { consentContextConfirmed: false }]) {
    assert.equal(hasUnresolvedConsentDecision({ candidates: [{ ...button, ...update }] }), false);
  }
  assert.equal(hasPositiveControlBox({ width: NaN, height: 20 }), false);
  assert.equal(consentSessionAccessLimited({}, { access: { status: "loaded", httpStatus: 498 } }), true);
  assert.equal(consentSessionAccessLimited({ scanNoGoAssessment: { supportingSignals: { noGoLane: "runtime_evidence", visualHardNoGoPageState: true } } }), false);
});


test("new registry entries require exact labels, including in consent context", () => {
  for (const label of ["Allow notifications", "Agree to all account terms", "Reject unnecessary cookies and subscribe", "Show details about our products"]) {
    assert.equal(classifyConsentControlLabel({ label, hasConsentContext: true, observationRecipe: "Cookiebot.options.v1" }).intent, "unknown", label);
  }
});


test("informational labels never prove Options and ambiguous first-layer links limit absence", () => {
  const classification = classifyConsentControlLabel({ label: "Learn more", hasConsentContext: true, hasPreferenceContext: true });
  assert.equal(classification.intent, "unknown");
  assert.ok(classification.reasonCodes.includes("ambiguous_information_control"));
  const link = { actionType: "other", decisionStatus: "ambiguous", tagName: "a", layer: "first_layer", consentContextConfirmed: true, enabled: true, intersectsViewport: true, boundingBox: { width: 80, height: 20 }, classifierReasonCodes: classification.reasonCodes };
  assert.equal(hasUnresolvedConsentDecision({ candidates: [link] }), true);
  assert.equal(hasUnresolvedConsentDecision({ candidates: [{ ...link, layer: "page_body" }] }), false);
});


test("reviewed localized configure is observation-only and acknowledgments stay neutral", () => {
  assert.equal(classifyConsentControlLabel({ label: "Настроить", hasConsentContext: true }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Настроить", usage: "action", hasConsentContext: true }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Настроить" }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Настроить профиль", hasConsentContext: true }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "close modal", hasConsentContext: true }).semanticRole, "dismiss");
  assert.equal(classifyConsentControlLabel({ label: "Okay", hasConsentContext: true }).intent, "unknown");
});

test("Polish necessary-only refusal is canonical across inventory and action classification", () => {
  for (const usage of ["observation", "action"] as const) {
    const result = classifyConsentControlLabel({
      label: "Zezwól tylko na niezbędne",
      hasConsentContext: true,
      usage,
    });
    assert.equal(result.intent, "reject");
    assert.equal(result.semanticRole, "necessary_only");
    assert.equal(result.matchedLocale, "pl");
    assert.equal(result.variant, "necessary_only");
    assert.equal(result.matchStrength, "equivalent");
    assert.equal(result.confidence, 0.9);
  }
  assert.equal(
    classifyConsentControlLabel({ label: "Zezwól na wszystkie", hasConsentContext: true, usage: "action" }).intent,
    "accept",
  );
});
