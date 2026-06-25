import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyConsentControlLabel,
  consentActionCandidateSchema,
  consentUiObservationSchema,
} from "./index.js";

test("classifies direct consent controls across English, German, and French", () => {
  assert.equal(classifyConsentControlLabel({ label: "Accept all" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Alle akzeptieren" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Tout accepter" }).intent, "accept");

  assert.equal(classifyConsentControlLabel({ label: "Reject all" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Alle ablehnen" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Tout refuser" }).intent, "reject");

  assert.equal(classifyConsentControlLabel({ label: "Cookie settings" }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Cookie-Einstellungen" }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Paramètres des cookies" }).intent, "options");
});

test("classifies direct accept controls across English, German, and French", () => {
  const examples = [
    ["Accept", "en"],
    ["Accept all", "en"],
    ["Allow all", "en"],
    ["I agree", "en"],
    ["Akzeptieren", "de"],
    ["Alle akzeptieren", "de"],
    ["Zustimmen", "de"],
    ["Ich stimme zu", "de"],
    ["Accepter", "fr"],
    ["Tout accepter", "fr"],
    ["J’accepte", "fr"],
    ["Autoriser", "fr"]
  ] as const;

  for (const [label, locale] of examples) {
    const classification = classifyConsentControlLabel({ label });
    assert.equal(classification.intent, "accept", label);
    assert.equal(classification.matchedLocale, locale, label);
  }
});

test("classifies necessary-only labels as reject-equivalent", () => {
  for (const label of [
    "Use necessary cookies only",
    "Nur notwendige Cookies",
    "Cookies nécessaires uniquement",
  ]) {
    const classification = classifyConsentControlLabel({ label });
    assert.equal(classification.intent, "reject");
    assert.equal(classification.matchStrength, "equivalent");
    assert.equal(classification.variant, "necessary_only");
  }
});

test("keeps privacy opt-out distinct from cookie reject", () => {
  for (const label of [
    "Do not sell or share",
    "Berechtigtem Interesse widersprechen",
    "S’opposer à tout",
  ]) {
    const classification = classifyConsentControlLabel({ label });
    assert.equal(classification.intent, "privacy_opt_out");
    assert.notEqual(classification.intent, "reject");
  }
});

test("handles contextual and weak terms without turning them into reject proof", () => {
  assert.notEqual(classifyConsentControlLabel({ label: "Continue" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Continue", hasConsentContext: true }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Continue without cookies" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Continuer sans accepter les cookies" }).intent, "reject");

  const okWithoutContext = classifyConsentControlLabel({ label: "OK" });
  assert.equal(okWithoutContext.intent, "accept");
  assert.equal(okWithoutContext.matchStrength, "weak");
  assert.ok(okWithoutContext.confidence < 0.6);

  assert.equal(classifyConsentControlLabel({ label: "Save choices" }).intent, "unknown");
  const saveWithPreferenceContext = classifyConsentControlLabel({
    label: "Save choices",
    contextText: "Cookie preference center",
    hasPreferenceContext: true,
  });
  assert.equal(saveWithPreferenceContext.intent, "options");
  assert.equal(saveWithPreferenceContext.variant, "save_preferences");
});

test("rejects common false-positive labels", () => {
  for (const label of [
    "Subscribe",
    "Sign in",
    "Stream",
    "Save article",
    "Continue reading",
    "Account settings",
  ]) {
    assert.equal(classifyConsentControlLabel({ label }).intent, "unknown", label);
  }
});

test("normalizes punctuation, whitespace, and apostrophe variants", () => {
  assert.equal(classifyConsentControlLabel({ label: "  J’ACCEPTE! " }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "s'opposer" }).intent, "privacy_opt_out");
  assert.equal(classifyConsentControlLabel({ label: "D’accord" }).intent, "accept");
});

test("schemas accept bounded classifier metadata", () => {
  const candidate = consentActionCandidateSchema.parse({
    actionId: "a1",
    actionType: "reject_all",
    labelText: "Nur notwendige Cookies",
    normalizedLabel: "nur notwendige cookies",
    confidence: 0.9,
    detectionMethod: "deterministic_text",
    matchedTerm: "nur notwendige cookies",
    matchedLocale: "de",
    matchStrength: "equivalent",
    classifierReasonCodes: ["matched_reject", "variant_necessary_only"],
    classifierVariant: "necessary_only",
  });
  assert.equal(candidate.classifierVariant, "necessary_only");

  const observation = consentUiObservationSchema.parse({
    observationId: "obs",
    observedAtMs: 0,
    likelyPresent: true,
    basis: ["control:reject_all:Nur notwendige Cookies"],
    controls: [{
      label: "Nur notwendige Cookies",
      actionType: "reject_all",
      visible: true,
      matchedTerm: "nur notwendige cookies",
      matchedLocale: "de",
      matchStrength: "equivalent",
      classifierReasonCodes: ["matched_reject"],
      classifierVariant: "necessary_only",
    }],
    confidence: 0.9,
  });
  assert.equal(observation.controls[0]?.matchedLocale, "de");
});
