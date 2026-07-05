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
    ["Privacy reglement", "nl"],
    ["Polityka prywatności", "pl"],
  ] as const;

  for (const [linkText, locale] of examples) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "privacy_policy", linkText);
    assert.equal(classification.matchedLocale, locale, linkText);
    assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true, linkText);
  }
});

test("classifies Dutch privacy-reglement document links without visible anchor text", () => {
  const classification = classifyPrivacySurface({
    linkText: "https://over.example.test/wp-content/uploads/2026/03/NOS-Privacy-Reglement-Maart-2026.pdf",
    url: "https://over.example.test/wp-content/uploads/2026/03/NOS-Privacy-Reglement-Maart-2026.pdf",
    surroundingText: "Klik op het document hieronder om het te openen en te downloaden. Privacy reglement persoonsgegevens AVG.",
  });

  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true);
  assert.equal(classification.reasonCodes.includes("matched_url_pattern"), true);
});

test("does not classify generic French confidentiality article headlines as privacy policies", () => {
  const classification = classifyPrivacySurface({
    linkText: "Taylor Swift signe des accords de confidentialité",
    surroundingText: "People Musique Culture Dernières actualités",
    url: "https://www.20minutes.fr/arts-stars/people/123456-confidentialite-album",
  });

  assert.equal(classification.surfaceType, "unknown");
  assert.equal(classification.matchedLocale, undefined);
});

test("classifies French data-protection policy surfaces with policy context", () => {
  const classification = classifyPrivacySurface({
    linkText: "Protection des données personnelles",
    surroundingText: "Mentions légales Politique de confidentialité Cookies",
    url: "https://example.test/protection-donnees-personnelles",
  });

  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.matchedLocale, "fr");
  assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true);
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

test("does not classify generic single-word cookie notification labels as policy surfaces", () => {
  const classification = classifyPrivacySurface({
    linkText: "Ga naar cookie melding",
    url: "https://nos.nl/",
  });

  assert.equal(classification.surfaceType, "unknown");
  assert.equal(classification.matchedLocale, undefined);
});

test("classifies canonical terms surfaces across supported locales", () => {
  const examples = [
    ["Terms", "en"],
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

test("classifies canonical AI disclosure surfaces", () => {
  for (const linkText of ["AI disclosure", "AI disclosures"]) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "ai_disclosure", linkText);
    assert.equal(classification.matchedLocale, "en", linkText);
    assert.equal(classification.matchStrength, "direct", linkText);
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

test("uses localized URL patterns as canonical surface hints", () => {
  const examples = [
    ["https://example.test/datenschutz", "privacy_policy"],
    ["https://example.test/privacy-statement", "privacy_policy"],
    ["https://example.test/politique-de-confidentialite", "privacy_policy"],
    ["https://example.test/proteccion-de-datos", "privacy_policy"],
    ["https://example.test/politica-de-privacidad", "privacy_policy"],
    ["https://example.test/politica-privacidad", "privacy_policy"],
    ["https://example.test/informativa-privacy", "privacy_policy"],
    ["https://example.test/trattamento-dati", "privacy_policy"],
    ["https://example.test/privacybeleid", "privacy_policy"],
    ["https://example.test/polityka-prywatnosci", "privacy_policy"],
    ["https://example.test/cookie-richtlinie", "cookie_policy"],
    ["https://example.test/politica-de-cookies", "cookie_policy"],
    ["https://example.test/cookiebeleid", "cookie_policy"],
  ] as const;

  for (const [url, surfaceType] of examples) {
    const classification = classifyPrivacySurface({ linkText: "Legal", url });
    assert.equal(classification.surfaceType, surfaceType, url);
    assert.equal(classification.reasonCodes.includes("matched_url_pattern"), true, url);
  }
});

test("does not use neighboring footer text as the matched surface for unrelated links", () => {
  const surroundingText = "Contacto Aviso legal Politica de privacidad Cookies Accesibilidad";

  assert.equal(
    classifyPrivacySurface({
      linkText: "Contacto",
      surroundingText,
      url: "https://example.test/contacto/contacte.html",
    }).surfaceType,
    "unknown",
  );
  assert.equal(
    classifyPrivacySurface({
      linkText: "Accesibilidad",
      surroundingText,
      url: "https://example.test/accesibilidad.html",
    }).surfaceType,
    "accessibility_statement",
  );
  assert.equal(
    classifyPrivacySurface({
      linkText: "Konto",
      surroundingText: "Regulamin Polityka prywatnosci Kontakt Konto",
      url: "https://example.test/auth/v1/sso/auth?continue_url=https%3A%2F%2Fexample.test",
    }).surfaceType,
    "unknown",
  );
});

test("keeps unrelated labels unknown", () => {
  for (const linkText of ["Home", "Subscribe", "Account settings", "Latest news"]) {
    assert.equal(classifyPrivacySurface({ linkText }).surfaceType, "unknown", linkText);
  }
});

test("classifies French visible policy and cookie control labels", () => {
  assert.equal(classifyPrivacySurface({ linkText: "Données personnelles" }).surfaceType, "privacy_policy");
  assert.equal(classifyPrivacySurface({ linkText: "Politique Cookie" }).surfaceType, "cookie_policy");
  assert.equal(classifyPrivacySurface({ linkText: "Paramétrage des cookies" }).surfaceType, "cookie_settings");
});

test("registry covers every supported locale", () => {
  const registryLocales = new Set(PRIVACY_SURFACE_PHRASE_REGISTRY.map((term) => term.locale));

  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
  }
});
