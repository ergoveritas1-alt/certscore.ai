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
    ["Datenschutzhinweise", "de"],
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

test("classifies German Datenschutzhinweise labels and paths as canonical privacy policies", () => {
  const linkedPolicy = classifyPrivacySurface({
    linkText: "Datenschutzhinweise ↗ Datenschutzhinweise auf psh-con.de (öffnet in neuem Tab)",
    url: "https://www.psh-con.de/datenschutzhinweise",
    localeHints: ["de"],
  });
  assert.equal(linkedPolicy.surfaceType, "privacy_policy");
  assert.equal(linkedPolicy.matchStrength, "direct");
  assert.equal(linkedPolicy.matchedLocale, "de");
  assert.equal(linkedPolicy.matchedTerm, "datenschutzhinweise");

  for (const slug of ["datenschutzhinweis", "datenschutzhinweise"]) {
    const pathPolicy = classifyPrivacySurface({
      linkText: "Rechtliches",
      url: `https://www.psh-con.de/${slug}`,
      localeHints: ["de"],
    });
    assert.equal(pathPolicy.surfaceType, "privacy_policy", slug);
  }

  const germanRegistry = PRIVACY_EVIDENCE_LOCALE_REGISTRY.find((entry) => entry.locale === "de");
  assert.ok(germanRegistry?.privacyPolicyLabels.includes("datenschutzhinweise"));
  assert.ok(germanRegistry?.privacyPolicyPathSlugs.includes("datenschutzhinweise"));
});

test("classifies a dedicated GDPR notice as a privacy-policy surface", () => {
  const classification = classifyPrivacySurface({ linkText: "GDPR Notice" });
  assert.equal(classification.surfaceType, "privacy_policy");
  assert.equal(classification.matchStrength, "direct");
  assert.equal(classification.matchedTerm, "gdpr notice");
});

test("product and privacy-request pages cannot displace the governing privacy document", () => {
  for (const [linkText, path] of [
    ["Privacy policy risk scanner", "/solutions/privacy-policy-risk-scanner"],
    ["Cookie consent scanner", "/solutions/cookie-consent-scanner"],
    ["Privacy request", "/privacy-request"],
  ]) {
    assert.equal(classifyPrivacySurface({ linkText, url: `https://example.test${path}`, surroundingText: "Privacy policy personal data GDPR" }).surfaceType, "unknown");
  }
  assert.equal(classifyPrivacySurface({ linkText: "Privacy policy", url: "https://example.test/privacy" }).surfaceType, "privacy_policy");
  assert.equal(classifyPrivacySurface({ linkText: "Privacy policy", url: "https://example.test/products/privacy-policy" }).surfaceType, "privacy_policy");
});

test("marks explicitly general privacy notices with canonical scope provenance", () => {
  for (const linkText of ["General Privacy Policy", "Privacy Policy Generale", "Informativa generale sulla privacy"]) {
    const classification = classifyPrivacySurface({ linkText });
    assert.equal(classification.surfaceType, "privacy_policy", linkText);
    assert.equal(classification.variant, "general_scope", linkText);
    assert.equal(classification.reasonCodes.includes("variant_general_scope"), true, linkText);
  }
});

test("classifies every canonical privacy-policy label and path across all 40 locales", () => {
  assert.equal(PRIVACY_EVIDENCE_LOCALE_REGISTRY.length, 40);
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    assert.ok(entry.privacyPolicyLabels.length > 0, `${entry.locale} privacy-policy labels`);
    for (const linkText of entry.privacyPolicyLabels) {
      const classification = classifyPrivacySurface({
        linkText,
        localeHints: [entry.locale],
        surroundingText: "Official policy notice",
      });
      assert.equal(classification.surfaceType, "privacy_policy", `${entry.locale} label: ${linkText}`);
      assert.equal(classification.matchedLocale, entry.locale, `${entry.locale} label: ${linkText}`);
    }

    assert.ok(entry.privacyPolicyPathSlugs.length > 0, `${entry.locale} privacy-policy paths`);
    for (const slug of entry.privacyPolicyPathSlugs) {
      const classification = classifyPrivacySurface({
        linkText: "Legal",
        url: `https://example.test/${slug}`,
        localeHints: [entry.locale],
      });
      assert.equal(classification.surfaceType, "privacy_policy", `${entry.locale} path: ${slug}`);
    }
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

test("classifies every combined privacy-cookie policy label across all 40 primary locales", () => {
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    const labels = entry.combinedPrivacyCookieLabels;
    assert.ok(labels && labels.length > 0, `${entry.locale} combined policy labels`);
    for (const label of labels) {
      const classification = classifyPrivacySurface({
        linkText: label,
        localeHints: [entry.locale],
      });
      assert.equal(classification.surfaceType, "cookie_policy", `${entry.locale} ${label}`);
      assert.equal(classification.matchedLocale, entry.locale, `${entry.locale} ${label}`);
      assert.equal(classification.variant, "combined_privacy_cookie_surface", `${entry.locale} ${label}`);
      assert.equal(
        classification.reasonCodes.includes("variant_combined_privacy_cookie_surface"),
        true,
        `${entry.locale} ${label}`,
      );
    }
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

test("classifies concise French and Italian first-party data-protection policy labels", () => {
  const french = classifyPrivacySurface({
    linkText: "Données personnelles",
    url: "https://example.test/fr/donnees-personnelles",
    localeHints: ["fr"],
  });
  assert.equal(french.surfaceType, "privacy_policy");
  assert.equal(french.matchedLocale, "fr");
  assert.equal(french.variant, "personal_data_policy_label");

  const italian = classifyPrivacySurface({
    linkText: "Informativa protezione dati",
    url: "https://example.test/informativa-protezione-dati",
    localeHints: ["it"],
  });
  assert.equal(italian.surfaceType, "privacy_policy");
  assert.equal(italian.matchedLocale, "it");
  assert.equal(italian.variant, "data_protection_notice_label");
});

test("does not classify Italian privacy news and media titles as policy documents", () => {
  for (const linkText of [
    "Comunicato stampa - Garante privacy: nuova iniziativa",
    "Podcast del Garante privacy",
  ]) {
    const classification = classifyPrivacySurface({
      linkText,
      url: "https://example.test/home/docweb/-/docweb-display/docweb/1234",
      localeHints: ["it"],
    });
    assert.equal(classification.surfaceType, "unknown", linkText);
    assert.equal(
      classification.reasonCodes.includes("editorial_or_reference_resource_not_policy_document"),
      true,
      linkText,
    );
  }
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

test("does not promote localized news or editorial links that merely mention data protection", () => {
  for (const input of [
    {
      linkText: "Leer más sobre protección de datos en el entorno digital",
      surroundingText: "Noticias Política de privacidad y aviso legal",
      url: "https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/proteccion-de-datos-entorno-digital",
    },
    {
      linkText: "Actualités sur la protection des données",
      surroundingText: "Actualités Données personnelles et sécurité",
      url: "https://example.fr/actualites/protection-des-donnees",
    },
    {
      linkText: "Leer más sobre recomendaciones para proteger la privacidad al usar IA",
      surroundingText: "Noticias Política de privacidad y aviso legal",
      url: "https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/recomendaciones-proteger-privacidad-ia",
    },
    {
      linkText: "Mettre en place un délégué (DPO)",
      surroundingText: "Protection des données",
      url: "https://www.cnil.fr/fr/passer-laction/le-delegue-la-protection-des-donnees-dpo",
    },
  ]) {
    assert.equal(classifyPrivacySurface(input).surfaceType, "unknown", input.linkText);
  }
});

test("retains exact localized policy-document labels while rejecting embedded generic mentions", () => {
  for (const linkText of [
    "Política de privacidad y aviso legal",
    "Données personnelles et sécurité",
    "Protección de datos",
  ]) {
    assert.equal(classifyPrivacySurface({ linkText }).surfaceType, "privacy_policy", linkText);
  }
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

test("combined privacy and cookie statements retain their shared canonical scope", () => {
  for (const linkText of ["Privacy and cookie statement", "Privacy & Cookie statement", "Read our privacy and cookie statement, opens in a new tab"]) {
    const result = classifyPrivacySurface({ linkText, url: "https://example.test/privacy-cookies/" });
    assert.equal(result.surfaceType, "cookie_policy");
    assert.equal(result.variant, "combined_privacy_cookie_surface");
  }
  assert.notEqual(classifyPrivacySurface({ linkText: "Cookie statement", url: "https://example.test/cookies" }).variant, "combined_privacy_cookie_surface");
});

test("policy generators and templates cannot masquerade as governing notices",()=>{
 for(const path of ["/products/privacy-policy-generator/","/resources/templates/privacy-policy-template/","/privacy-policy-generator","/cookie-policy-template"]){
  const c=classifyPrivacySurface({url:`https://example.test${path}`,linkText:"Privacy Policy",surroundingText:"GDPR privacy policy personal data"});
  assert.equal(c.surfaceType,"unknown",path);assert.ok(c.reasonCodes.includes("product_or_template_not_policy_document"));
 }
 for(const path of ["/our-privacy-policy/","/privacy-policy-generator/privacy-policy","/products/privacy-policy"])
  assert.equal(classifyPrivacySurface({url:`https://example.test${path}`,linkText:"Our Privacy Policy"}).surfaceType,"privacy_policy",path);
});

test('CA Notice needs independent privacy context',()=>{
 assert.equal(classifyPrivacySurface({linkText:'CA Notice'}).surfaceType,'unknown');
 assert.equal(classifyPrivacySurface({linkText:'CA Notice',surroundingText:'Privacy Policy Your Privacy Choices'}).surfaceType,'california_notice');
});

test('privacy rights application forms do not masquerade as governing policy supplements',()=>{
 assert.equal(classifyPrivacySurface({linkText:'online form',url:'https://publisher.example/privacy/app-form'}).surfaceType,'unknown');
 assert.equal(classifyPrivacySurface({linkText:'California Notice',url:'https://publisher.example/privacy/california'}).surfaceType,'california_notice');
});
test("static notice and hub destinations are fetched even when labels describe choices",()=>{
 for(const [linkText,url]of [["Privacy Center","https://about.brand.test/privacy.html"],["Advertising choices","https://about.brand.test/privacy/privacy-notice.html#choice"]]) {
  const result=classifyPrivacySurface({linkText,url});assert.equal(result.surfaceType,"privacy_policy");if(linkText==="Privacy Center")assert.equal(result.reasonCodes.includes("static_governing_notice_destination"),true);
 }
 assert.equal(classifyPrivacySurface({linkText:"Privacy Center",url:"https://site.test/#preferences"}).surfaceType,"consent_preferences");
 assert.equal(classifyPrivacySurface({linkText:"Your Privacy Choices",url:"https://privacyportal.test/choice"}).surfaceType,"your_privacy_choices");
});
