import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPrivacySurface,
  PRIVACY_SURFACE_LOCALE_REGISTRY,
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

test("classifies canonical privacy-policy labels across all supported locales", () => {
  for (const definition of PRIVACY_SURFACE_LOCALE_REGISTRY) {
    const linkText = definition.privacyPolicyPhrases[0];
    assert.ok(linkText, `${definition.locale} should define a privacy policy phrase`);
    const classification = classifyPrivacySurface({
      linkText,
      localeHints: [definition.locale],
    });

    assert.equal(classification.surfaceType, "privacy_policy", definition.locale);
    assert.equal(classification.matchedLocale, definition.locale, linkText);
    assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true, linkText);
  }
});

test("classifies canonical cookie-policy labels across all supported locales", () => {
  for (const definition of PRIVACY_SURFACE_LOCALE_REGISTRY) {
    const linkText = definition.cookiePolicyPhrases[0];
    assert.ok(linkText, `${definition.locale} should define a cookie policy phrase`);
    const classification = classifyPrivacySurface({
      linkText,
      localeHints: [definition.locale],
    });

    assert.equal(classification.surfaceType, "cookie_policy", definition.locale);
    assert.equal(classification.matchedLocale, definition.locale, linkText);
    assert.equal(classification.reasonCodes.includes("matched_cookie_policy"), true, linkText);
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
    ["https://example.test/politique-de-confidentialite", "privacy_policy"],
    ["https://example.test/politica-de-privacidad", "privacy_policy"],
    ["https://example.test/informativa-privacy", "privacy_policy"],
    ["https://example.test/privacybeleid", "privacy_policy"],
    ["https://example.test/polityka-prywatnosci", "privacy_policy"],
    ["https://example.test/politika-privatnosti", "privacy_policy"],
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

test("classifies Croatian privacy-policy URL patterns as supported locale paths", () => {
  const classification = classifyPrivacySurface({
    linkText: "Politika privatnosti",
    url: "https://n1info.hr/politika-privatnosti/",
    localeHints: ["hr"],
  });

  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.matchedLocale, "hr");
  assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true);
});

test("classifies canonical privacy-policy path slugs across all supported locales", () => {
  for (const definition of PRIVACY_SURFACE_LOCALE_REGISTRY) {
    const slug = definition.privacyPolicyPathSlugs[0];
    assert.ok(slug, `${definition.locale} should define a privacy policy path slug`);
    const classification = classifyPrivacySurface({
      linkText: "Legal",
      url: `https://example.test/${encodeURI(slug)}`,
    });

    assert.equal(classification.surfaceType, "privacy_policy", `${definition.locale}:${slug}`);
    assert.equal(classification.reasonCodes.includes("matched_url_pattern"), true, `${definition.locale}:${slug}`);
  }
});

test("classifies expanded English, German, and French policy surface slugs", () => {
  const examples = [
    ["https://example.test/legal/privacy-policy", "privacy_policy"],
    ["https://example.test/policies/privacy", "privacy_policy"],
    ["https://example.test/data-privacy", "privacy_policy"],
    ["https://example.test/legal/cookie-policy", "cookie_policy"],
    ["https://example.test/cookie-declaration", "cookie_policy"],
    ["https://example.test/terms-of-use", "terms"],
    ["https://example.test/legal/terms-of-service", "terms"],
    ["https://example.de/datenschutzerklarung-dsgvo", "privacy_policy"],
    ["https://example.de/rechtliches/datenschutz", "privacy_policy"],
    ["https://example.de/datenschutz/cookies", "cookie_policy"],
    ["https://example.de/cookie-einstellungen", "cookie_policy"],
    ["https://example.de/allgemeine-geschaftsbedingungen", "terms"],
    ["https://example.fr/protection-des-donnees", "privacy_policy"],
    ["https://example.fr/politique-de-vie-privee", "privacy_policy"],
    ["https://example.fr/mentions-legales/cookies", "cookie_policy"],
    ["https://example.fr/declaration-cookies", "cookie_policy"],
    ["https://example.fr/conditions-generales-utilisation", "terms"],
    ["https://example.tr/kvkk", "privacy_policy"],
    ["https://example.fi/evasteet", "cookie_policy"],
    ["https://example.fi/kayttoehdot", "terms"],
    ["https://example.pl/regulamin", "terms"],
    ["https://example.hu/aszf", "terms"],
    ["https://example.fr/mentions-legales", "privacy_policy"],
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

test("registry covers every supported locale", () => {
  const registryLocales = new Set(PRIVACY_SURFACE_PHRASE_REGISTRY.map((term) => term.locale));
  const localeRegistryLocales = new Set(PRIVACY_SURFACE_LOCALE_REGISTRY.map((term) => term.locale));

  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
    assert.equal(localeRegistryLocales.has(locale), true, locale);
  }
  assert.equal(SUPPORTED_PRIVACY_EVIDENCE_LOCALES.length, 40);
  assert.equal(localeRegistryLocales.size, 40);
});
