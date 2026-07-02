import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPrivacySurface,
  PRIVACY_SURFACE_PHRASE_REGISTRY,
  SUPPORTED_PRIVACY_EVIDENCE_LOCALES,
} from "./index.js";

test("classifies canonical privacy-policy surfaces across supported locales", () => {
  const examples = [
    ["Privacy policy", "en"],
    ["Datenschutzerklärung", "de"],
    ["Politique de confidentialité", "fr"],
    ["Política de privacidad", "es"],
    ["Informativa sulla privacy", "it"],
    ["Privacybeleid", "nl"],
    ["Polityka prywatności", "pl"],
  ] as const;

  for (const [linkText, locale] of examples) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "privacy_policy", linkText);
    assert.equal(classification.matchedLocale, locale, linkText);
    assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true, linkText);
  }
});

test("classifies canonical cookie-policy and cookie-settings surfaces across supported locales", () => {
  const examples = [
    ["Cookie policy", "en", "cookie_policy"],
    ["Cookie-Richtlinie", "de", "cookie_policy"],
    ["Politique relative aux cookies", "fr", "cookie_policy"],
    ["Política de cookies", "es", "cookie_policy"],
    ["Informativa sui cookie", "it", "cookie_policy"],
    ["Cookiebeleid", "nl", "cookie_policy"],
    ["Polityka plików cookie", "pl", "cookie_policy"],
    ["Cookie settings", "en", "cookie_settings"],
    ["Cookie-Einstellungen", "de", "cookie_settings"],
    ["Paramètres des cookies", "fr", "cookie_settings"],
    ["Configuración de cookies", "es", "cookie_settings"],
    ["Impostazioni cookie", "it", "cookie_settings"],
    ["Cookie-instellingen", "nl", "cookie_settings"],
    ["Ustawienia plików cookie", "pl", "cookie_settings"],
  ] as const;

  for (const [linkText, locale, surfaceType] of examples) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, surfaceType, linkText);
    assert.equal(classification.matchedLocale, locale, linkText);
  }
});

test("classifies canonical terms surfaces across supported locales", () => {
  const examples = [
    ["Terms of service", "en"],
    ["Nutzungsbedingungen", "de"],
    ["Conditions d'utilisation", "fr"],
    ["Términos y condiciones", "es"],
    ["Termini e condizioni", "it"],
    ["Algemene voorwaarden", "nl"],
    ["Regulamin", "pl"],
  ] as const;

  for (const [linkText, locale] of examples) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "terms", linkText);
    assert.equal(classification.matchedLocale, locale, linkText);
  }
});

test("uses URL patterns as canonical surface hints without display-layer inference", () => {
  const classification = classifyPrivacySurface({
    linkText: "Legal",
    url: "https://example.test/legal/privacy-policy",
  });

  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.matchedLocale, undefined);
  assert.equal(classification.reasonCodes.includes("matched_url_pattern"), true);
});

test("keeps unrelated labels unknown", () => {
  for (const linkText of ["Home", "Subscribe", "Account settings", "Latest news"]) {
    assert.equal(classifyPrivacySurface({ linkText }).surfaceType, "unknown", linkText);
  }
});

test("registry covers every supported locale", () => {
  const registryLocales = new Set(PRIVACY_SURFACE_PHRASE_REGISTRY.map((term) => term.locale));

  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
  }
});
