import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyConsentLanguage,
  classifyConsentControlLabel,
  classifyConsentSurfaceText,
  consentActionCandidateSchema,
  consentUiObservationSchema,
  isProductionCreditworthySupplementalConsentControlClassification,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
  SUPPORTED_PRIVACY_EVIDENCE_LOCALES,
} from "./index.js";

test("separates explicit consent controls from acknowledgments and refusal equivalents", () => {
  assert.equal(
    classifyConsentControlLabel({
      label: "OK",
      contextText: "By using this site you agree to analytics cookies."
    }).semanticRole,
    "ambiguous_acknowledgment"
  );
  assert.equal(classifyConsentControlLabel({ label: "Accept all" }).semanticRole, "explicit_accept");
  assert.equal(
    classifyConsentControlLabel({
      label: "Only required",
      contextText: "Choose which cookies this site may use."
    }).semanticRole,
    "necessary_only"
  );
  assert.equal(
    classifyConsentControlLabel({
      label: "Close",
      contextText: "This site uses cookies."
    }).semanticRole,
    "dismiss"
  );
});

test("classifies bounded implied-consent language canonically", () => {
  const classification = classifyConsentLanguage({
    text: "We use analytics. By using this site you agree to our use of cookies."
  });
  assert.equal(classification.impliedConsentLanguageObserved, true);
  assert.equal(classification.matches[0]?.classifierId, "implied_consent.by_using_agree");
  assert.match(classification.matches[0]?.excerpt ?? "", /By using this site/i);
  assert.ok((classification.matches[0]?.excerpt.length ?? 0) <= 240);
});

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

test("classifies the retained University of Ljubljana controls only in canonical Slovenian consent context", () => {
  const contextText = "Spletna stran Univerze v Ljubljani uporablja piškotke v skladu z našo politiko varovanja zasebnosti. Nujne smo že naložili, analitične pa lahko dovolite.";
  const accept = classifyConsentControlLabel({
    label: "Naloži vse",
    contextText,
    localeHints: ["sl"],
  });
  const reject = classifyConsentControlLabel({
    label: "Naloži samo nujne",
    contextText,
    localeHints: ["sl"],
  });
  const options = classifyConsentControlLabel({
    label: "Nastavitve",
    contextText,
    localeHints: ["sl"],
  });

  assert.equal(accept.intent, "accept");
  assert.equal(accept.matchedLocale, "sl");
  assert.equal(accept.matchStrength, "contextual");
  assert.equal(accept.contextSatisfied, true);
  assert.equal(reject.intent, "reject");
  assert.equal(reject.semanticRole, "necessary_only");
  assert.equal(reject.matchedLocale, "sl");
  assert.equal(options.intent, "options");
  assert.equal(options.matchedLocale, "sl");

  assert.equal(classifyConsentControlLabel({ label: "Naloži vse", localeHints: ["sl"] }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Nastavitve", localeHints: ["sl"] }).intent, "unknown");
});

test("classifies multilingual consent-surface text from every canonical locale registry entry", () => {
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    const classification = classifyConsentSurfaceText({
      text: [
        entry.contextHints[0],
        entry.consentControls.accept[0],
        entry.consentControls.necessaryOnly[0] ?? entry.consentControls.reject[0],
        entry.consentControls.options[0],
      ].filter(Boolean).join(" "),
      localeHints: [entry.locale],
    });
    assert.equal(classification.likelyPresent, true, `${entry.locale} canonical consent surface`);
    assert.equal(classification.matchedLocales.includes(entry.locale), true, `${entry.locale} locale provenance`);
    assert.equal(
      classification.reasonCodes.includes("multiple_canonical_control_intents_matched"),
      true,
      `${entry.locale} control-intent evidence`,
    );
  }
});

test("does not promote generic localized controls without same-locale consent context", () => {
  const classification = classifyConsentSurfaceText({
    text: "Naloži vse novice. Nastavitve uporabniškega profila.",
    localeHints: ["sl"],
  });
  assert.equal(classification.likelyPresent, false);
  assert.equal(classification.recoveryHintObserved, false);
});

test("uses canonical localized consent context for bounded early recovery without confirming a surface", () => {
  const classification = classifyConsentSurfaceText({
    text: "Spletna stran uporablja piškotke v skladu s politiko zasebnosti.",
    localeHints: ["sl"],
  });
  assert.equal(classification.recoveryHintObserved, true);
  assert.equal(classification.likelyPresent, false);
  assert.equal(classification.reasonCodes.includes("control_intent_not_yet_matched"), true);
});

test("classifies explicit inline consent preference labels without broadening generic manage", () => {
  const consentTool = classifyConsentControlLabel({ label: "Cookie Consent Tool" });
  assert.equal(consentTool.intent, "options");
  assert.equal(consentTool.matchStrength, "direct");
  assert.equal(classifyConsentControlLabel({ label: "Consent Choices" }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Manage" }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({
    label: "Manage",
    contextText: "We use cookies and ask for your consent.",
  }).intent, "options");
});

test("Italian discovery registry and classifier retain Personalizza as a contextual first-layer options control", () => {
  const italian = PRIVACY_EVIDENCE_LOCALE_REGISTRY.find((entry) => entry.locale === "it");
  assert.equal(italian?.consentControls.options.includes("personalizza"), true);
  const classification = classifyConsentControlLabel({
    label: "Personalizza",
    contextText: "Questo sito utilizza cookie. Accetta tutti Rifiuta tutti Personalizza"
  });
  assert.equal(classification.intent, "options");
  assert.equal(classification.matchedLocale, "it");
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
  assert.equal(classifyConsentControlLabel({
    label: "Personalisieren",
    contextText: "Cookies und Werbeoptionen",
  }).intent, "options");
});

test("classifies British spelling choice controls as options", () => {
  const classification = classifyConsentControlLabel({ label: "Customise my choices" });
  assert.equal(classification.intent, "options");
  assert.equal(classification.matchedTerm, "customise my choices");
});

test("classifies observed English options labels", () => {
  assert.equal(classifyConsentControlLabel({ label: "I Accept" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Accept", ariaLabel: "Accept" }).intent, "accept");
  const optionalAccept = classifyConsentControlLabel({ label: "Accept Optional Cookies" });
  assert.equal(optionalAccept.intent, "accept");
  assert.equal(optionalAccept.matchedTerm, "accept optional cookies");
  assert.equal(optionalAccept.matchStrength, "direct");
  assert.equal(classifyConsentControlLabel({ label: "Accept Non-Essential Cookies" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Allow Optional Cookies" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Optional Cookies" }).intent, "unknown");
  assert.equal(classifyConsentControlLabel({ label: "Deny", ariaLabel: "Deny" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Deny Non-Essential" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Deny Non-Essential Cookies" }).intent, "reject");
  const subscribeReject = classifyConsentControlLabel({ label: "Decline and subscribe" });
  assert.equal(subscribeReject.intent, "reject");
  assert.equal(subscribeReject.variant, "reject_with_subscription");
  const reversedSubscribeReject = classifyConsentControlLabel({ label: "Subscribe and decline" });
  assert.equal(reversedSubscribeReject.intent, "reject");
  assert.equal(reversedSubscribeReject.variant, "reject_with_subscription");
  const rejectAllSubscribe = classifyConsentControlLabel({ label: "Reject all and subscribe" });
  assert.equal(rejectAllSubscribe.intent, "reject");
  assert.equal(rejectAllSubscribe.variant, "reject_with_subscription");
  assert.equal(rejectAllSubscribe.matchedTerm, "reject all and subscribe");
  const guardianSubscribeReject = classifyConsentControlLabel({
    label: "Reject all and subscribe to Guardian Ad-Lite for €5 per month",
  });
  assert.equal(guardianSubscribeReject.intent, "reject");
  assert.equal(guardianSubscribeReject.variant, "reject_with_subscription");
  assert.equal(guardianSubscribeReject.matchedTerm, "reject all and subscribe");
  assert.equal(classifyConsentControlLabel({
    label: "Customise",
    contextText: "We use cookies and partners for personalised advertising.",
  }).intent, "options");
  assert.equal(classifyConsentControlLabel({
    label: "Show Purposes",
    contextText: "We use cookies and partners for advertising purposes.",
  }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Manage cookies" }).intent, "options");
  assert.equal(classifyConsentControlLabel({ label: "Allow Selection" }).intent, "options");
  const requiredOnly = classifyConsentControlLabel({
    label: "Required Only",
    contextText: "We use cookies and similar technologies. Choose your cookie consent preferences.",
  });
  assert.equal(requiredOnly.intent, "reject");
  assert.equal(requiredOnly.variant, "necessary_only");
  assert.equal(requiredOnly.matchedTerm, "required only");
  assert.equal(
    classifyConsentControlLabel({ label: "Required Only" }).intent,
    "unknown",
    "the compact label must retain consent context before receiving necessary-only credit",
  );
  assert.equal(classifyConsentControlLabel({
    label: "Personalise",
    contextText: "Data privacy at Dailymotion. We use cookies and partners for advertising measurement.",
  }).intent, "options");
});

test("classifies consent-contextual approval wording without broadening generic language", () => {
  const classification = classifyConsentControlLabel({
    label: "I'm happy with that",
    contextText: "This website uses cookies to improve your experience and show relevant ads.",
  });
  assert.equal(classification.intent, "accept");
  assert.equal(classification.semanticRole, "explicit_accept");
  assert.equal(classification.matchStrength, "contextual");
  assert.equal(classification.variant, "approval_acknowledgment");
  assert.equal(classifyConsentControlLabel({ label: "I'm happy with that" }).intent, "unknown");
  assert.equal(
    classifyConsentControlLabel({
      label: "I’m happy with that",
      contextText: "We use cookies and analytics on this site.",
    }).intent,
    "accept",
  );
});

test("classifies observed Spanish and Italian consent labels", () => {
  assert.equal(classifyConsentControlLabel({ label: "Aceptar" }).matchedLocale, "es");
  assert.equal(classifyConsentControlLabel({ label: "Aceptar y continuar" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Rechazar todo" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({
    label: "Configurar",
    contextText: "Usamos cookies para publicidad y medicion.",
  }).intent, "options");
  const frenchConsentOptions = classifyConsentControlLabel({ label: "Gérer mes consentements" });
  assert.equal(frenchConsentOptions.intent, "options");
  assert.equal(frenchConsentOptions.matchedLocale, "fr");

  assert.equal(classifyConsentControlLabel({ label: "Accetta" }).matchedLocale, "it");
  assert.equal(classifyConsentControlLabel({ label: "Accetto" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Accetta tutte le condizioni e le impostazioni sulla privacy" }).intent, "accept");
  assert.equal(classifyConsentControlLabel({ label: "Rifiuta" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Rifiuta tutte le condizioni e le impostazioni sulla privacy" }).intent, "reject");
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
  assert.equal(classifyConsentControlLabel({ label: "Personalizza le mie scelte" }).intent, "options");
});

test("classifies observed German DHL consent settings control", () => {
  const classification = classifyConsentControlLabel({
    label: "Einwilligungs-Einstellungen",
    localeHints: ["de"],
  });
  assert.equal(classification.intent, "options");
  assert.equal(classification.matchedLocale, "de");
});

test("classifies observed Finnish YLE consent controls", () => {
  const necessaryOnly = classifyConsentControlLabel({
    label: "Vain välttämättömät",
    localeHints: ["fi"],
  });
  assert.equal(necessaryOnly.intent, "reject");
  assert.equal(necessaryOnly.variant, "necessary_only");
  assert.equal(necessaryOnly.matchedLocale, "fi");

  const options = classifyConsentControlLabel({
    label: "Muokkaa evästeasetuksia",
    localeHints: ["fi"],
  });
  assert.equal(options.intent, "options");
  assert.equal(options.matchedLocale, "fi");
});

test("classifies canonical accept, reject, options, and necessary-only controls across all 40 locales", () => {
  assert.equal(SUPPORTED_PRIVACY_EVIDENCE_LOCALES.length, 40);
  assert.deepEqual(
    PRIVACY_EVIDENCE_LOCALE_REGISTRY.map((entry) => entry.locale),
    [...SUPPORTED_PRIVACY_EVIDENCE_LOCALES],
  );

  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    for (const [intent, label] of [
      ["accept", entry.consentControls.accept[0]],
      ["reject", entry.consentControls.reject[0]],
      ["options", entry.consentControls.options[0]],
    ] as const) {
      assert.ok(label, `${entry.locale} ${intent} fixture`);
      for (const classifierProfile of ["production_default", "multilingual_v1"] as const) {
        const classification = classifyConsentControlLabel({
          label,
          classifierProfile,
          localeHints: [entry.locale],
        });
        assert.equal(classification.intent, intent, `${entry.locale} ${label} ${classifierProfile}`);
        assert.equal(classification.matchedLocale, entry.locale, `${entry.locale} ${label} ${classifierProfile}`);
      }
    }

    for (const necessaryOnly of entry.consentControls.necessaryOnly) {
      const withContext = classifyConsentControlLabel({
        label: necessaryOnly,
        contextText: entry.contextHints.join(" "),
        localeHints: [entry.locale],
      });
      assert.equal(withContext.intent, "reject", `${entry.locale} ${necessaryOnly}`);
      assert.equal(withContext.variant, "necessary_only", `${entry.locale} ${necessaryOnly}`);
    }
  }
});

test("classifies the compact English essential-only refusal label", () => {
  const classification = classifyConsentControlLabel({
    label: "Essential only",
    contextText: "We use cookies and similar technologies. Choose your cookie consent preferences.",
  });
  assert.equal(classification.intent, "reject");
  assert.equal(classification.variant, "necessary_only");
  assert.equal(classification.matchedTerm, "essential only");
});

test("uses canonical Dutch and Polish controls in the default production classifier", () => {
  assert.equal(classifyConsentControlLabel({ label: "Cookie-instellingen" }).intent, "options");
  const contextualDutchOptions = classifyConsentControlLabel({
    label: "Zelf instellen",
    contextText: "Wij gebruiken cookies. U kunt alles accepteren of uw cookies zelf instellen.",
  });
  assert.equal(contextualDutchOptions.intent, "options");
  assert.equal(contextualDutchOptions.contextSatisfied, true);
  assert.equal(classifyConsentControlLabel({ label: "Ustawienia plików cookie" }).intent, "options");

  const multilingualDutch = classifyConsentControlLabel({
    label: "Settings",
    contextText: "Wij vragen toestemming voor voorkeuren en instellingen.",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(multilingualDutch.intent, "options");

  const multilingualPolish = classifyConsentControlLabel({
    label: "Settings",
    contextText: "Prosimy o zgodę na pliki cookie, preferencje i ustawienia.",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(multilingualPolish.intent, "options");
});

test("classifies observed Danish and Lithuanian consent labels", () => {
  const danishAccept = classifyConsentControlLabel({
    label: "Acceptér alle",
    localeHints: ["da"],
  });
  assert.equal(danishAccept.intent, "accept");
  assert.equal(danishAccept.matchedLocale, "da");

  const danishOptions = classifyConsentControlLabel({
    label: "Indstillinger",
    contextText: "Dine data og cookies samtykke",
    localeHints: ["da"],
  });
  assert.equal(danishOptions.intent, "options");
  assert.equal(danishOptions.matchedLocale, "da");

  const lithuanianOptions = classifyConsentControlLabel({
    label: "Rinktis",
    contextText: "Asmens duomenų naudojimas slapukai sutikimas",
    localeHints: ["lt"],
  });
  assert.equal(lithuanianOptions.intent, "options");
  assert.equal(lithuanianOptions.matchedLocale, "lt");
});

test("does not let generic Dutch or Polish settings labels satisfy multilingual consent context", () => {
  const genericDutch = classifyConsentControlLabel({
    label: "Instellingen",
    contextText: "Zoeken Instellingen Teletekst NPO Start",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(genericDutch.intent, "unknown");
  assert.equal(genericDutch.contextSatisfied, false);

  const genericPolish = classifyConsentControlLabel({
    label: "USTAWIENIA ZAAWANSOWANE",
    contextText: "Menu Program TV Poczta Konto Ustawienia",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(genericPolish.intent, "unknown");
  assert.equal(genericPolish.contextSatisfied, false);

  const consentDutch = classifyConsentControlLabel({
    label: "Instellingen",
    contextText: "Wij vragen toestemming voor cookies en privacy voorkeuren.",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(consentDutch.intent, "options");
  assert.equal(consentDutch.contextSatisfied, true);

  const consentPolish = classifyConsentControlLabel({
    label: "USTAWIENIA ZAAWANSOWANE",
    contextText: "Dbamy o prywatność i używamy plików cookie za zgodą użytkownika.",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(consentPolish.intent, "options");
  assert.equal(consentPolish.contextSatisfied, true);
});

test("uses Dutch and Polish preference context in the default production classifier", () => {
  for (const contextText of [
    "Cookie voorkeuren beheren",
    "Cookie preferencje ustawienia",
  ]) {
    const classification = classifyConsentControlLabel({ label: "Save choices", contextText });
    assert.equal(classification.intent, "options", contextText);
    assert.equal(classification.contextSatisfied, true, contextText);
  }

  const multilingualDutch = classifyConsentControlLabel({
    label: "Save choices",
    contextText: "Cookie voorkeuren beheren",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(multilingualDutch.intent, "options");
  assert.equal(multilingualDutch.variant, "save_preferences");

  const multilingualPolish = classifyConsentControlLabel({
    label: "Save choices",
    contextText: "Cookie preferencje ustawienia",
    classifierProfile: "multilingual_v1",
  });
  assert.equal(multilingualPolish.intent, "options");
  assert.equal(multilingualPolish.variant, "save_preferences");
});

test("classifies Save consent only inside a bounded preference context", () => {
  const preferenceControl = classifyConsentControlLabel({
    label: "Save consent",
    contextText: "Data protection preference. Choose optional cookies and adjust your consent settings.",
  });
  assert.equal(preferenceControl.intent, "options");
  assert.equal(preferenceControl.variant, "save_preferences");
  assert.equal(preferenceControl.contextSatisfied, true);

  const unrelatedSave = classifyConsentControlLabel({
    label: "Save consent",
    contextText: "Save this article to your reading list.",
  });
  assert.equal(unrelatedSave.intent, "unknown");
});

test("supports Dutch and Polish terms in the default profile and honors locale hints", () => {
  const dutchWithHintOnly = classifyConsentControlLabel({
    label: "Alles weigeren",
    localeHints: ["nl"],
  });
  assert.equal(dutchWithHintOnly.intent, "reject");

  const polishWithHintOnly = classifyConsentControlLabel({
    label: "Odrzuć wszystko",
    localeHints: ["pl"],
  });
  assert.equal(polishWithHintOnly.intent, "reject");

  const dutchWithProfile = classifyConsentControlLabel({
    label: "Alles weigeren",
    localeHints: ["nl"],
    classifierProfile: "multilingual_v1",
  });
  assert.equal(dutchWithProfile.intent, "reject");
  assert.equal(dutchWithProfile.matchedLocale, "nl");
});

test("classifies contextual Polish continue-to-service consent labels in the default profile", () => {
  const contextText = "Klikając Przejdź do serwisu udzielasz zgody na przetwarzanie danych osobowych i pliki cookie.";

  assert.equal(classifyConsentControlLabel({
    label: "Przejdź do serwisu",
    contextText,
  }).intent, "accept");

  assert.equal(classifyConsentControlLabel({
    label: "Przejdź do serwisu",
    classifierProfile: "multilingual_v1",
  }).intent, "unknown");

  const classification = classifyConsentControlLabel({
    label: "Przejdź do serwisu",
    contextText,
    classifierProfile: "multilingual_v1",
  });

  assert.equal(classification.intent, "accept");
  assert.equal(classification.matchedLocale, "pl");
  assert.equal(classification.matchStrength, "contextual");
  assert.equal(classification.contextSatisfied, true);
});

test("keeps Dutch and Polish privacy opt-out controls distinct from reject with multilingual profile", () => {
  for (const label of [
    "Bezwaar tegen gerechtvaardigd belang",
    "Sprzeciw wobec uzasadnionego interesu",
  ]) {
    const classification = classifyConsentControlLabel({
      label,
      classifierProfile: "multilingual_v1",
    });
    assert.equal(classification.intent, "privacy_opt_out", label);
    assert.notEqual(classification.intent, "reject", label);
  }
});

test("keeps Utiq-scoped refusal distinct from GDPR/ePrivacy reject", () => {
  const utiqReject = classifyConsentControlLabel({
    label: "für Utiq jetzt ablehnen",
    contextText: "Datenschutz und Nutzungserlebnis. Mit Tracking und Cookies nutzen.",
  });

  assert.equal(utiqReject.intent, "privacy_opt_out");
  assert.equal(utiqReject.variant, "vendor_specific_opt_out");
  assert.notEqual(utiqReject.intent, "reject");

  const broadReject = classifyConsentControlLabel({
    label: "Alle ablehnen",
    contextText: "Utiq wird im Datenschutzhinweis erwähnt. Wir verwenden Cookies.",
  });
  assert.equal(broadReject.intent, "reject");
});

test("classifies observed French reject-all cookie labels", () => {
  const classification = classifyConsentControlLabel({ label: "Refuser tous les cookies" });
  assert.equal(classification.intent, "reject");
  assert.equal(classification.matchStrength, "direct");
  assert.equal(classification.matchedLocale, "fr");

  const subscriptionReject = classifyConsentControlLabel({ label: "Refuser et s'abonner" });
  assert.equal(subscriptionReject.intent, "reject");
  assert.equal(subscriptionReject.variant, "reject_with_subscription");
  assert.equal(subscriptionReject.matchedTerm, "refuser et s'abonner");

  const compositeSubscriptionChoice = classifyConsentControlLabel({
    label: "Accepter les cookies ou Refuser et s'abonner",
  });
  assert.equal(compositeSubscriptionChoice.intent, "reject");
  assert.equal(compositeSubscriptionChoice.variant, "reject_with_subscription");
  assert.equal(compositeSubscriptionChoice.matchedTerm, "refuser et s'abonner");
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

test("classifies Dutch and Polish necessary-only labels in both profiles", () => {
  for (const label of [
    "Alleen noodzakelijke cookies",
    "Tylko niezbędne pliki cookie",
  ]) {
    assert.equal(classifyConsentControlLabel({ label }).intent, "reject", label);
    const classification = classifyConsentControlLabel({
      label,
      classifierProfile: "multilingual_v1",
    });
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

test("classifies optional-cookie refusal variants as reject", () => {
  for (const [label, matchedTerm] of [
    ["Decline optional cookies", "decline optional cookies"],
    ["Refuse optional cookies", "refuse optional cookies"],
    ["Deny optional cookies", "deny optional cookies"],
  ] as const) {
    const classification = classifyConsentControlLabel({ label });
    assert.equal(classification.intent, "reject", label);
    assert.equal(classification.semanticRole, "reject", label);
    assert.equal(classification.matchedTerm, matchedTerm, label);
    assert.equal(classification.matchStrength, "direct", label);
  }
});

test("covers the audited reject, accept, and optional-choice vocabulary", () => {
  const rejectLabels = [
    "Reject Additional Cookies",
    "Decline Cookies",
    "Proceed with Required Cookies only",
    "Refuse Functional Cookies",
    "Refuse Advertising Cookies",
    "Reject the use of cookies and other data for the purposes described",
    "Deny Cookies",
    "I decline optional cookies",
  ];
  for (const label of rejectLabels) {
    const result = classifyConsentControlLabel({ label, contextText: "Choose which cookies this site may use." });
    assert.equal(result.intent, "reject", label);
  }

  const acceptLabels = [
    "Accept Selections",
    "Consent to all",
    "Accept and close",
    "Accept use of cookies",
    "Allow Selected",
    "Accept the use of cookies and other data for the purposes described",
    "Agree & Continue",
  ];
  for (const label of acceptLabels) {
    assert.equal(classifyConsentControlLabel({ label }).intent, "accept", label);
  }

  const optionLabels = [
    "Manage my choices",
    "Set Cookie Options",
    "More choices",
    "Functional Cookies choice",
    "Advertising Cookies choice",
    "Consent Preference",
    "View options",
  ];
  for (const label of optionLabels) {
    assert.equal(
      classifyConsentControlLabel({ label, contextText: "Cookie consent preferences" }).intent,
      "options",
      label,
    );
  }
});

test("keeps the audited vocabulary represented across every supported locale", () => {
  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    const entry = PRIVACY_EVIDENCE_LOCALE_REGISTRY.find((candidate) => candidate.locale === locale);
    assert.ok(entry, locale);
    assert.ok(entry?.consentControls.accept.length, `${locale}: accept coverage`);
    assert.ok(entry?.consentControls.reject.length, `${locale}: reject coverage`);
    assert.ok(entry?.consentControls.options.length, `${locale}: options coverage`);
    assert.ok(entry?.consentControls.necessaryOnly.length, `${locale}: necessary-only coverage`);
  }
});

test("classifies short non-essential reject labels in concatenated banner text", () => {
  const standalone = classifyConsentControlLabel({ label: "Reject Non-Essential" });
  assert.equal(standalone.intent, "reject");
  assert.equal(standalone.matchedTerm, "reject non-essential");
  assert.equal(standalone.matchStrength, "direct");

  const concatenated = classifyConsentControlLabel({ label: "Save Accept All Reject Non-Essential" });
  assert.equal(concatenated.intent, "reject");
  assert.equal(concatenated.matchedTerm, "reject non-essential");
  assert.equal(concatenated.matchStrength, "direct");
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
  assert.equal(classifyConsentControlLabel({
    label: "Set up the collection of your data",
    contextText: "We and our partners use cookies and process your personal data for advertising purposes."
  }).intent, "options");

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

test("recognizes restored German, French, Italian, and Polish consent labels", () => {
  const german = classifyConsentControlLabel({ label: "Nur notwendige", contextText: "Wir verwenden Cookies" });
  assert.equal(german.intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Non merci", contextText: "Nous utilisons des cookies" }).intent, "reject");
  assert.equal(classifyConsentControlLabel({ label: "Solo cookie tecnici" }).intent, "reject");
  const polish = classifyConsentControlLabel({ label: "Dostosuj zgody", classifierProfile: "multilingual_v1" });
  assert.equal(polish.intent, "options");
  assert.equal(isProductionCreditworthySupplementalConsentControlClassification("Dostosuj zgody", polish), true);
});
