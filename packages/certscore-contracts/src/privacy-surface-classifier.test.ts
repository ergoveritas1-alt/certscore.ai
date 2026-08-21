import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPrivacySurface,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
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
    ["Politică de confidențialitate", "ro"],
    ["Pravilnik o zasebnosti", "sl"],
  ] as const;

  for (const [linkText, locale] of examples) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "privacy_policy", linkText);
    assert.equal(classification.matchedLocale, locale, linkText);
    assert.equal(classification.reasonCodes.includes("matched_privacy_policy"), true, linkText);
  }
});

test("classifies a dedicated GDPR notice as a privacy-policy surface", () => {
  const classification = classifyPrivacySurface({ linkText: "GDPR Notice" });
  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.matchStrength, "direct");
  assert.equal(classification.matchedTerm, "gdpr notice");
});

test("marks explicitly general privacy notices with canonical scope provenance", () => {
  for (const linkText of ["General Privacy Policy", "Privacy Policy Generale", "Informativa generale sulla privacy"]) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "privacy_policy", linkText);
    assert.equal(classification.variant, "general_scope", linkText);
    assert.equal(classification.reasonCodes.includes("variant_general_scope"), true, linkText);
  }
});

test("classifies canonical policy labels and localized paths across all 40 locales", () => {
  assert.equal(PRIVACY_EVIDENCE_LOCALE_REGISTRY.length, 40);
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    const privacyLabel = entry.privacyPolicyLabels[0];
    const cookieLabel = entry.cookiePolicyLabels[0];
    const settingsLabel = entry.cookieSettingsLabels[0];
    const privacySlug = entry.privacyPolicyPathSlugs[0];
    const cookieSlug = entry.cookiePolicyPathSlugs[0];
    assert.ok(privacyLabel && cookieLabel && settingsLabel && privacySlug && cookieSlug, entry.locale);

    for (const [linkText, surfaceType] of [
      [privacyLabel, "privacy_policy"],
      [cookieLabel, "cookie_policy"],
      [settingsLabel, "cookie_settings"],
    ] as const) {
      const classification = classifyPrivacySurface({
        linkText,
        localeHints: [entry.locale],
      });
      assert.equal(classification.surfaceType, surfaceType, `${entry.locale} ${linkText}`);
      assert.equal(classification.matchedLocale, entry.locale, `${entry.locale} ${linkText}`);
    }

    const pathClassification = classifyPrivacySurface({
      linkText: "Legal",
      url: `https://example.test/${privacySlug}`,
      localeHints: [entry.locale],
    });
    assert.equal(pathClassification.surfaceType, "privacy_policy", `${entry.locale} ${privacySlug}`);

    const cookiePathClassification = classifyPrivacySurface({
      linkText: "Legal",
      url: `https://example.test/${cookieSlug}`,
      localeHints: [entry.locale],
    });
    assert.equal(cookiePathClassification.surfaceType, "cookie_policy", `${entry.locale} ${cookieSlug}`);
  }
});

test("classifies the retained Slovenian privacy and combined privacy-cookie labels", () => {
  const privacy = classifyPrivacySurface({
    linkText: "politiko varovanja zasebnosti",
    localeHints: ["sl"],
  });
  assert.equal(privacy.surfaceType, "privacy_policy");
  assert.equal(privacy.matchedLocale, "sl");

  const combined = classifyPrivacySurface({
    linkText: "Varstvo zasebnosti in piškotkov",
    localeHints: ["sl"],
  });
  assert.equal(combined.surfaceType, "cookie_policy");
  assert.equal(combined.matchedLocale, "sl");
  assert.equal(combined.variant, "combined_privacy_cookie_surface");
  assert.equal(
    combined.reasonCodes.includes("variant_combined_privacy_cookie_surface"),
    true,
  );
});

test("classifies an English website-and-cookies notice as a combined privacy-cookie surface", () => {
  const combined = classifyPrivacySurface({
    linkText: "Website and Cookies",
    localeHints: ["en"],
  });

  assert.equal(combined.surfaceType, "cookie_policy");
  assert.equal(combined.matchedLocale, "en");
  assert.equal(combined.variant, "combined_privacy_cookie_surface");
  assert.equal(
    combined.reasonCodes.includes("variant_combined_privacy_cookie_surface"),
    true,
  );
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

test("requires policy context for an ambiguous French privacy label", () => {
  assert.equal(classifyPrivacySurface({ linkText: "Confidentialité", url: "https://example.test/news" }).surfaceType, "unknown");
  const classification = classifyPrivacySurface({
    linkText: "Confidentialité",
    url: "https://example.test/politique-de-confidentialite",
    surroundingText: "Politique de protection des données personnelles"
  });
  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.reasonCodes.includes("policy_context_satisfied"), true);
});

test("does not classify generic data-protection marketing or customer stories as privacy policies", () => {
  for (const input of [
    {
      linkText: "Efficient Data Protection Management at finstreet",
      url: "https://example.test/customer-stories/finstreet/",
      surroundingText: "Customer story about building a data protection program from scratch.",
    },
    {
      linkText: "Data Protection",
      url: "https://example.test/security-advisory/dataprivacy/",
      surroundingText: "Explore our consulting and managed security services.",
    },
  ]) {
    assert.equal(classifyPrivacySurface(input).surfaceType, "unknown", input.url);
  }

  const policy = classifyPrivacySurface({
    linkText: "Data Protection",
    url: "https://example.test/legal/data-protection",
    surroundingText: "Legal policy notice for processing personal data.",
  });
  assert.equal(policy.surfaceType, "privacy_policy");
  assert.equal(policy.reasonCodes.includes("policy_context_satisfied"), true);
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

test("classifies English data-protection privacy surfaces", () => {
  const labelClassification = classifyPrivacySurface({
    linkText: "Data Protection & Privacy"
  });
  assert.equal(labelClassification.surfaceType, "privacy_policy");
  assert.equal(labelClassification.matchedLocale, "en");

  const pathClassification = classifyPrivacySurface({
    linkText: "Legal",
    url: "https://www.loopia.com/about-loopia/data-protection/"
  });
  assert.equal(pathClassification.surfaceType, "privacy_policy");
  assert.equal(pathClassification.reasonCodes.includes("matched_url_pattern"), true);
});

test("classifies slash-separated combined privacy and terms labels as privacy documents", () => {
  const classification = classifyPrivacySurface({
    linkText: "Privacy / Terms",
    url: "https://example.test/rechtliches.php",
  });

  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.variant, "combined_privacy_terms_surface");
});

test("uses localized URL patterns as canonical surface hints", () => {
  const examples = [
    ["https://example.test/datenschutz", "privacy_policy"],
    ["https://example.test/politique-de-confidentialite", "privacy_policy"],
    ["https://example.test/politica-de-privacidad", "privacy_policy"],
    ["https://example.test/informativa-privacy", "privacy_policy"],
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

test("classifies common localized data-protection paths through the locale registry", () => {
  const paths = [
    "https://example.test/data-protection",
    "https://example.test/proteccion-de-datos",
    "https://example.test/protezione-dei-dati",
    "https://example.test/gegevensbescherming",
    "https://example.test/ochrona-danych",
    "https://example.test/protecao-de-dados",
    "https://example.test/dataskydd",
    "https://example.test/dataskyddsinformation",
    "https://example.test/adatvedelem",
    "https://example.test/privacypolicy",
    "https://example.test/politic",
    "https://example.test/databeskyttelse",
    "https://example.test/tietosuoja",
    "https://example.test/andmekaitse",
    "https://example.test/datu-aizsardziba",
    "https://example.test/duomenu-apsauga",
  ];

  for (const url of paths) {
    const classification = classifyPrivacySurface({ linkText: "Legal", url });
    assert.equal(classification.surfaceType, "privacy_policy", url);
  }
});

test("classifies Russian personal-data labels and fragment policy URLs", () => {
  for (const input of [
    { linkText: "Обработка персональных данных", url: "https://example.ru/legacy#persondata" },
    { linkText: "Защита персональных данных", url: "https://example.ru/legacy" },
    { linkText: "Правовая информация", url: "https://example.ru/legacy#persondata" },
  ]) {
    const classification = classifyPrivacySurface(input);
    assert.equal(classification.surfaceType, "privacy_policy");
    assert.equal(classification.matchedLocale, "ru");
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

  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
  }
});
