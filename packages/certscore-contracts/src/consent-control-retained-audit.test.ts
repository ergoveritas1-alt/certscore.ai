import assert from "node:assert/strict";
import test from "node:test";
import { classifyConsentControlLabel } from "./consent-control-label-classifier.js";
import { consentUiObservationSchema } from "./index.js";

const labels = [
  ["Allow and Continue", "accept"], ["I Consent", "accept"],
  ["Agree & proceed", "accept"], ["I decline", "reject"],
  ["REJECT NON-FUNCTIONAL COOKIES", "reject"], ["Tout interdire", "reject"],
  ["Aceptar y leer GRATIS", "accept"], ["Tillåt alla", "accept"],
  ["Accetto i cookie", "accept"], ["Recusar", "reject"],
  ["Povolit všechny soubory cookie", "accept"], ["Povolit vše", "accept"],
  ["Αποδοχή", "accept"], ["Kabul ediyorum", "accept"],
  ["Alle cookies aanvaarden", "accept"],
] as const;

for (const [label, intent] of labels) {
  test(`retained audit vocabulary: ${label}`, () => {
    const observation = classifyConsentControlLabel({ label, contextText: "Choose your cookie preferences." });
    assert.equal(observation.intent, intent);
    assert.ok(observation.reasonCodes.includes("observation_only_label"));
    assert.ok(!classifyConsentControlLabel({ label, usage: "action", hasConsentContext: true })
      .reasonCodes.includes("observation_only_label"));
    assert.equal(classifyConsentControlLabel({ label, contextText: "Notification preferences" }).intent, "unknown");
    assert.equal(classifyConsentControlLabel({ label: `How to ${label}?`, hasConsentContext: true }).intent, "unknown");
  });
}

test("non-functional refusal is not relabelled necessary-only", () => {
  assert.equal(classifyConsentControlLabel({ label: "Reject non-functional cookies", hasConsentContext: true }).variant, "non_functional_only");
});

test("Portuguese non-essential qualifier does not negate refusal; real negation still vetoes", () => {
  assert.equal(classifyConsentControlLabel({ label: "Rejeitar todos os cookies não essenciais", contextText: "cookies" }).intent, "reject");
  for (const label of ["Não rejeitar todos os cookies não essenciais", "Nunca rejeitar todos os cookies não essenciais"]) {
    assert.equal(classifyConsentControlLabel({ label, contextText: "cookies" }).intent, "unknown");
  }
});

test("Limit Cookies requires an explicit label-bound necessary-only effect", () => {
  const label = "Limit Cookies";
  assert.equal(classifyConsentControlLabel({ label, contextText: "Click ‘Limit Cookies’ to enable only necessary cookies." }).intent, "reject");
  for (const contextText of ["We use necessary cookies and analytics.", "Manage cookies.", "Limit Cookies controls analytics only."]) {
    assert.equal(classifyConsentControlLabel({ label, contextText }).intent, "unknown");
  }
  assert.equal(classifyConsentControlLabel({ label, usage: "action", contextText: "Click ‘Limit Cookies’ to enable only necessary cookies." }).intent, "unknown");
});

test("generic inline link binds only its immediate readable text node", () => {
  const input = { label: "Click Here", adjacentText: " to Reject All non-essential cookies.",
    contextText: "Choose your cookie preferences." };
  assert.equal(classifyConsentControlLabel(input).intent, "reject");
  assert.equal(classifyConsentControlLabel({ ...input, usage: "action" }).intent, "unknown");
  for (const change of [{ adjacentText: undefined }, { ariaLabel: "Accept all" },
    { adjacentText: "Learn how to Reject All non-essential cookies." }, { contextText: "" }]) {
    assert.equal(classifyConsentControlLabel({ ...input, ...change }).intent, "unknown");
  }
});

for (const [label, contextText] of [
  ["STRICTLY NECESSARY", 'By clicking “Strictly Necessary” you only agree to the storing of strictly necessary cookies on your device. No other cookies will be used.'],
  ["Essential Cookies", 'You are free to refuse them by clicking "essential cookies" without consequence on your access to the site.'],
] as const) {
  test(`fresh cohort necessary-only instruction: ${label}`, () => {
    const observed = classifyConsentControlLabel({ label, contextText });
    assert.equal(observed.intent, "reject");
    assert.equal(observed.variant, "necessary_only");
    assert.equal(classifyConsentControlLabel({ label, contextText, usage: "action" }).intent, "unknown");
    for (const contextText of ["We use cookies.", "Essential cookies are always active.", "Notification preferences"]) {
      assert.equal(classifyConsentControlLabel({ label, contextText }).intent, "unknown");
    }
  });
}

test("canonical control schema retains bounded adjacent-text label proof", () => {
  const labelBinding = { version: "adjacent_text_node.v1", text: "Click Here to Reject All non-essential cookies." };
  const input = { observationId: "obs", observedAtMs: 0, likelyPresent: true, basis: [], confidence: 0.9,
    controls: [{ label: "Click Here", actionType: "reject_all", labelBinding }] };
  assert.deepEqual(consentUiObservationSchema.parse(input).controls[0]?.labelBinding, labelBinding);
  assert.equal(consentUiObservationSchema.safeParse({ ...input,
    controls: [{ ...input.controls[0], labelBinding: { ...labelBinding, text: "x".repeat(321) } }] }).success, false);
});
