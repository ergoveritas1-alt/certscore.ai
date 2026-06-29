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
    ["Agree and close", "en"],
    ["Akzeptieren", "de"],
    ["Alle akzeptieren", "de"],
    ["Zustimmen", "de"],
    ["Annehmen", "de"],
    ["Alle zulassen", "de"],
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

test("classifies German Microsoft-style consent controls", () => {
  assert.equal(classifyConsentControlLabel({ label: "Annehmen" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Ablehnen" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Cookies verwalten" }).intent, "options");
});

test("classifies British spelling choice controls as options", () => {
  const classification = classifyConsentControlLabel({ label: "Customise my choices" });
  assert.equal(classification.intent, "options");
  assert.equal(classification.matchedTerm, "customise my choices");
});

test("classifies observed English options labels", () => {
  assert.equal(classifyConsentControlLabel({ label: "I Accept" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Accept", ariaLabel: "Accept" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Deny", ariaLabel: "Deny" }).intent, "reject");
  const subscribeReject = classifyConsentControlLabel({ label: "Decline and subscribe" });
  assert.equal(subscribeReject.intent, "reject");
  assert.equal(subscribeReject.variant, "reject_with_subscription");
  const reversedSubscribeReject = classifyConsentControlLabel({ label: "Subscribe and decline" });
  assert.equal(reversedSubscribeReject.intent, "reject");
  assert.equal(reversedSubscribeReject.variant, "reject_with_subscription");
  assert.equal(classifyConsentControlLabel({
    label: "Customise",
    contextText: "We use cookies and partners for personalised advertising.",
  }).intent, "options");
  assert.equal(classifyConsentControlLabel({
    label: "Show Purposes",
    contextText: "We use cookies and partners for advertising purposes.",
  }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Manage cookies" }).intent, "options");
  assert.equal(classifyConsentControlLabel({
    label: "Personalise",
    contextText: "Data privacy at Dailymotion. We use cookies and partners for advertising measurement.",
  }).intent, "options");
});

test("classifies observed Spanish and Italian consent labels", () => {
  assert.equal(classifyConsentControlLabel({ label: "Aceptar" }).matchedLocale, "es");
  assert.equal(classifyConsentControlLabel({ label: "Aceptar y continuar" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Rechazar todo" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({
    label: "Configurar",
    contextText: "Usamos cookies para publicidad y medicion.",
  }).intent, "options");

  assert.equal(classifyConsentControlLabel({ label: "Accetta" }).matchedLocale, "it");
  assert.equal(classifyConsentControlLabel({ label: "Accetto" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Rifiuta" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Rifiuta e abbonati" }).variant, "reject_with_subscription");
  assert.equal(classifyConsentControlLabel({ label: "Continua senza accettare" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({
    label: "Gestisci preferenze",
    contextText: "Usiamo cookie e tecnologie simili per finalita pubblicitarie.",
  }).intent, "options");
  assert.equal(classifyConsentControlLabel({
    label: "pannello delle preferenze pubblicitarie",
    contextText: "Usiamo cookie e tecnologie simili per finalita pubblicitarie.",
  }).intent, "unknown");
});

test("classifies observed French reject-all cookie labels", () => {
  const classification = classifyConsentControlLabel({ label: "Refuser tous les cookies" });
  assert.equal(classification.intent, "reject");
  assert.equal(classification.matchStrength, "direct");
  assert.equal(classification.matchedLocale, "fr");
});

test("classifies necessary-only labels as reject-equivalent", () => {
  for (const label of [
    "Use necessary cookies only",
    "Only technically required",
    "Nur notwendige Cookies",
    "Cookies nécessaires uniquement",
  ]) {
    const classification = classifyConsentControlLabel({ label });
    assert.equal(classification.intent, "reject");
    assert.equal(classification.matchStrength, "equivalent");
    assert.equal(classification.variant, "necessary_only");
  }
});

test("classifies decline non-essential cookies as reject", () => {
  const classification = classifyConsentControlLabel({ label: "Decline Non-Essential Cookies" });
  assert.equal(classification.intent, "reject");
  assert.equal(classification.matchedTerm, "decline non-essential cookies");
  assert.equal(classification.matchStrength, "direct");
});

test("classifies category-scoped analytics controls without broadening plain category labels", () => {
  const allowAnalytics = classifyConsentControlLabel({ label: "Allow analytics" });
  assert.equal(allowAnalytics.intent, "accept");
  assert.equal(allowAnalytics.matchStrength, "equivalent");
  assert.equal(allowAnalytics.variant, "category_analytics");

  const rejectAnalytics = classifyConsentControlLabel({ label: "Reject analytics" });
  assert.equal(rejectAnalytics.intent, "reject");
  assert.equal(rejectAnalytics.matchStrength, "equivalent");
  assert.equal(rejectAnalytics.variant, "category_analytics");

  assert.equal(classifyConsentControlLabel({ label: "Analytics" }).intent, "unknown");
});

test("classifies observed EU banner labels from AWS Lambda cohort", () => {
  assert.equal(classifyConsentControlLabel({ label: "Yes, I agree" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Reject Cookies" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Set preferences" }).intent, "options");

  const technicallyRequired = classifyConsentControlLabel({ label: "Only technically required" });
  assert.equal(technicallyRequired.intent, "reject");
  assert.equal(technicallyRequired.variant, "necessary_only");
});

test("classifies Continue as accept only when consent-by-using context is retained", () => {
  assert.equal(classifyConsentControlLabel({ label: "Continue" }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Continue", hasConsentContext: true }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Continue reading", contextText: "We use cookies." }).intent, "unknown");

  const classification = classifyConsentControlLabel({
    label: "Continue",
    contextText: "We and our partners use cookies on this site. By using the site, you consent to these cookies.",
  });
  assert.equal(classification.intent, "accept");
  assert.equal(classification.matchStrength, "contextual");
  assert.equal(classification.variant, "continue_as_accept");
  assert.equal(classification.reasonCodes.includes("requires_continue_consent_context"), true);
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
