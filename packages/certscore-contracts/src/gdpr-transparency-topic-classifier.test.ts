import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGdprTransparencyTopics,
  GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY,
  SUPPORTED_PRIVACY_EVIDENCE_LOCALES,
  type GdprTransparencyTopic,
} from "./index.js";

test("classifies canonical GDPR Transparency topics with bounded provenance", () => {
  const classification = classifyGdprTransparencyTopics({
    text: [
      "The data controller can be contacted by using the contact us form.",
      "Our data protection officer may be reached at dpo@example.test.",
      "We describe the purposes of processing personal data and why we process personal data.",
      "The legal basis for processing personal data includes consent, contract, and legitimate interests for processing personal data.",
      "Recipients of personal data include service providers that process personal data.",
      "The retention period for personal data depends on the service, and we retain personal data only as long as necessary for processing.",
      "You have the right to access your personal data, the right to erasure of personal data, and the right to object to processing.",
      "International transfers of personal data may occur under standard contractual clauses for personal data transfers.",
      "You may lodge a complaint with a supervisory authority.",
      "We do not use automated decision-making using personal data or profiling of personal data for eligibility decisions.",
    ].join(" "),
  });
  const byTopic = new Map(classification.matches.map((match) => [match.topic, match]));
  const topics: GdprTransparencyTopic[] = [
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  assert.equal(classification.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
  for (const topic of topics) {
    const match = byTopic.get(topic);
    assert.ok(match, `${topic} should be classified`);
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.equal(match.matchedLocale, "en");
    assert.ok(match.matchedTerm.length > 0);
    assert.ok(match.evidenceExcerpt.length <= 360);
    assert.equal(match.reasonCodes.includes(`matched_${topic}`), true);
  }
});

test("classifies representative GDPR Transparency snippets across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "The data controller explains the legal basis for processing personal data and categories of recipients of personal data. You may lodge a complaint with a supervisory authority.",
      topics: ["controller_contact", "legal_basis", "recipients_or_vendor_categories", "supervisory_authority"],
    },
    {
      locale: "de",
      text: "Der Verantwortlicher für die Datenverarbeitung nennt die Zwecke der Verarbeitung personenbezogener Daten, die Rechtsgrundlage für die Verarbeitung personenbezogener Daten, die Empfänger personenbezogener Daten und das Recht auf Beschwerde bei einer Aufsichtsbehörde.",
      topics: ["controller_contact", "processing_purposes", "legal_basis", "supervisory_authority"],
    },
    {
      locale: "fr",
      text: "Le responsable du traitement indique les finalités du traitement des données personnelles, la base juridique du traitement des données personnelles et les destinataires des données personnelles.",
      topics: ["controller_contact", "processing_purposes", "legal_basis", "recipients_or_vendor_categories"],
    },
    {
      locale: "es",
      text: "El responsable del tratamiento describe las finalidades del tratamiento de datos personales, la base jurídica del tratamiento de datos personales y los destinatarios de datos personales.",
      topics: ["controller_contact", "processing_purposes", "legal_basis", "recipients_or_vendor_categories"],
    },
    {
      locale: "it",
      text: "Il titolare del trattamento spiega la base giuridica del trattamento dei dati personali, il periodo di conservazione dei dati personali e i destinatari dei dati personali.",
      topics: ["controller_contact", "legal_basis", "data_retention", "recipients_or_vendor_categories"],
    },
    {
      locale: "nl",
      text: "De verwerkingsverantwoordelijke noemt de rechtsgrondslag voor de verwerking van persoonsgegevens, de bewaartermijn van persoonsgegevens en internationale doorgiften van persoonsgegevens.",
      topics: ["controller_contact", "legal_basis", "data_retention", "international_transfers"],
    },
    {
      locale: "pl",
      text: "Administrator danych opisuje cele przetwarzania danych osobowych, podstawa prawna przetwarzania danych osobowych, odbiorcy danych osobowych oraz profilowanie danych osobowych.",
      topics: ["controller_contact", "processing_purposes", "legal_basis", "recipients_or_vendor_categories", "automated_decision_making_or_profiling"],
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });
    const topics = new Set(classification.matches.map((match) => match.topic));
    for (const topic of example.topics) {
      const match = classification.matches.find((candidate) => candidate.topic === topic);
      assert.ok(match, `${example.locale} should classify ${topic}`);
      assert.equal(match.matchedLocale, example.locale);
      assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.ok(match.evidenceExcerpt.length <= 360);
    }
    assert.equal(topics.size >= example.topics.length, true);
  }
});

test("classifies French Article 13 wording for retention, recipients, purposes, and legal basis", () => {
  const classification = classifyGdprTransparencyTopics({
    text: [
      "Les finalités du traitement comprennent la gestion de votre compte et la fourniture des services demandés.",
      "La base légale du traitement des données personnelles comprend le consentement, le contrat et l'intérêt légitime.",
      "Les données personnelles sont conservées pendant la durée nécessaire aux finalités du traitement.",
      "Nous pouvons communiquer vos données personnelles à nos prestataires et sous-traitants qui agissent pour notre compte.",
    ].join(" "),
    localeHints: ["fr"],
  });
  const topics = classification.matches.map((match) => match.topic);

  assert.equal(topics.includes("processing_purposes"), true);
  assert.equal(topics.includes("legal_basis"), true);
  assert.equal(topics.includes("data_retention"), true);
  assert.equal(topics.includes("recipients_or_vendor_categories"), true);
  assert.equal(
    classification.matches
      .filter((match) => [
        "processing_purposes",
        "legal_basis",
        "data_retention",
        "recipients_or_vendor_categories",
      ].includes(match.topic))
      .every((match) => match.matchedLocale === "fr" && match.confidence >= 0.8),
    true,
  );
});

test("classifies encoded fetched policy text without display-layer fallbacks", () => {
  const examples = [
    {
      locale: "it",
      text: [
        "RCS MediaGroup S.p.A. e CairoRCS Media S.p.A. sono autonomi Titolari del trattamento dei dati personali raccolti su questo sito.",
        "Conformemente all'impegno dei Titolari, ti informiamo sulle modalit&agrave;, finalit&agrave; e ambito di comunicazione dei tuoi dati personali.",
        "RCS tratta i tuoi dati per le seguenti finalit&agrave;.",
        "L'elenco aggiornato dei soggetti che sono stati destinatari dei tuoi dati pu&ograve; essere richiesto al Titolare del trattamento.",
      ].join(" "),
      topics: ["controller_contact", "processing_purposes", "recipients_or_vendor_categories"],
    },
    {
      locale: "es",
      text: [
        "El Delegado de Protecci&oacute;n de Datos atiende las consultas relativas al tratamiento de sus datos personales.",
        "Puede ejercer sus derechos y presentar una reclamaci&oacute;n ante la Agencia Espa&ntilde;ola de Protecci&oacute;n de Datos.",
      ].join(" "),
      topics: ["dpo_contact", "supervisory_authority"],
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });
    for (const topic of example.topics) {
      const match = classification.matches.find((candidate) => candidate.topic === topic && candidate.matchedLocale === example.locale);
      assert.ok(
        match,
        `${example.locale} encoded policy text should classify ${topic}`,
      );
      assert.equal(match.evidenceExcerpt.includes("&agrave;"), false);
      assert.equal(match.evidenceExcerpt.includes("&ndash;"), false);
      if (example.locale === "it" && topic === "processing_purposes") {
        assert.match(match.evidenceExcerpt, /tratta i tuoi dati per le seguenti finalità/i);
      }
      if (example.locale === "it" && topic === "recipients_or_vendor_categories") {
        assert.match(match.evidenceExcerpt, /destinatari dei tuoi dati/i);
      }
    }
  }
});

test("classifies German GDPR notice intro phrasing from retained policy text", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["de"],
    text: [
      "Beim Aufruf einer Website werden personenbezogene Daten verarbeitet.",
      "Die Datenschutz-Grundverordnung verpflichtet uns dazu, Sie über diese Verarbeitung zu informieren.",
      "Sie sollen wissen, welche Zwecke wir verfolgen, wie lange Ihre Informationen gespeichert werden,",
      "auf welcher Rechtsgrundlage die Verarbeitung basiert und welche Empfänger von Daten es geben kann.",
      "Verantwortlich für die Datenverarbeitung ist die Zeitverlag Gerd Bucerius GmbH & Co. KG.",
    ].join(" "),
  });

  const topics = new Set(classification.matches.map((match) => match.topic));
  for (const topic of [
    "controller_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
  ] satisfies GdprTransparencyTopic[]) {
    const match = classification.matches.find((candidate) => candidate.topic === topic);
    assert.ok(match, `German retained policy intro should classify ${topic}`);
    assert.equal(match.matchedLocale, "de");
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
  assert.equal(topics.size >= 5, true);
});

test("classifies Polish Article 13 policy wording with explicit processing context", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["pl"],
    text: [
      "Polityka prywatności. Administratorem danych osobowych Użytkowników jest spółka.",
      "Cele oraz podstawy prawne przetwarzania danych w serwisie obejmują świadczenie usług oraz marketing.",
      "Przetwarzanie odbywa się na podstawie art 6 ust 1 lit b RODO oraz prawnie uzasadnionych interesów.",
      "Odbiorcy danych i zaufani partnerzy obejmują podmioty świadczące usługi IT.",
      "Dane osobowe Użytkownika mogą być przekazywane do państw poza Europejski Obszar Gospodarczy.",
      "Administrator wyznaczył inspektora ochrony danych.",
      "Użytkownik może złożyć skargę dotyczącą przetwarzania danych osobowych do organu nadzorczego.",
      "Administrator w niektórych przypadkach wykorzystuje profilowanie dzięki automatycznemu przetwarzaniu danych.",
    ].join(" "),
  });

  for (const topic of [
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] satisfies GdprTransparencyTopic[]) {
    const match = classification.matches.find((candidate) => candidate.topic === topic);
    assert.ok(match, `Polish policy wording should classify ${topic}`);
    assert.equal(match.matchedLocale, "pl");
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
});

test("classifies Wyborcza-style Polish GDPR Transparency disclosures from retained policy text", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["pl"],
    maxMatches: 20,
    text: [
      "Administratorem danych osobowych przetwarzanych w związku z korzystaniem z Serwisów jest Wyborcza sp. z o.o.",
      "W każdej sprawie dotyczącej danych osobowych można się skontaktować z naszym Inspektorem Ochrony Danych Osobowych na adres e-mail iod@example.test z dopiskiem IOD.",
      "W jakim celu i na jakiej podstawie prawnej przetwarzamy Twoje dane? Dane osobowe przetwarzamy w następujących celach.",
      "Podstawą prawną przetwarzania jest uzasadniony interes Administratora oraz art. 6 ust. 1 lit. f RODO.",
      "Dane możemy przekazywać podmiotom przetwarzającym dane osobowe, partnerom biznesowym i dostawcom usług.",
      "Dane przechowujemy nie dłużej niż jest to niezbędne, do czasu cofnięcia zgody albo do czasu przedawnienia roszczeń.",
      "Przysługuje Ci prawo dostępu, sprostowania, usunięcia, ograniczenia, wniesienia sprzeciwu oraz przenoszenia danych.",
      "Dane mogą być przekazywane poza Europejskim Obszarem Gospodarczym na podstawie standardowych klauzul umownych.",
      "Masz prawo wnieść skargę do organu nadzorczego, którym jest Prezes Urzędu Ochrony Danych Osobowych.",
      "W niektórych przypadkach wykorzystujemy profilowanie dla celów marketingowych.",
    ].join(" "),
  });

  for (const topic of [
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] satisfies GdprTransparencyTopic[]) {
    const match = classification.matches.find((candidate) => candidate.topic === topic);
    assert.ok(match, `Wyborcza-style Polish policy text should classify ${topic}`);
    assert.equal(match.matchedLocale, "pl");
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
});

test("classifies DPO, rights, transfers, and automated-decision topics in non-English locales", () => {
  const examples = [
    {
      locale: "de",
      text: "Sie können unseren Datenschutzbeauftragten erreichen. Sie haben ein Recht auf Auskunft über personenbezogene Daten. Eine Übermittlung personenbezogener Daten in ein Drittland beruht auf Standardvertragsklauseln für die Übermittlung personenbezogener Daten. Eine automatisierte Entscheidungsfindung mit personenbezogenen Daten findet nicht statt.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
    {
      locale: "fr",
      text: "Le délégué à la protection des données répond aux demandes. Vous disposez d'un droit d'accès aux données personnelles. Les transferts internationaux de données personnelles peuvent avoir lieu avec des données personnelles hors de l'Espace économique européen. Aucun profilage des données personnelles n'est utilisé.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
    {
      locale: "es",
      text: "El delegado de protección de datos atiende solicitudes. Usted tiene derecho de acceso a datos personales. Las transferencias internacionales de datos personales pueden realizarse con datos personales fuera del Espacio Económico Europeo. No usamos decisiones automatizadas con datos personales.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
    {
      locale: "it",
      text: "Il responsabile della protezione dei dati risponde. Hai diritto di accesso ai dati personali. I trasferimenti internazionali di dati personali possono avvenire con dati personali fuori dallo Spazio economico europeo. Non usiamo profilazione dei dati personali.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
    {
      locale: "nl",
      text: "De functionaris voor gegevensbescherming helpt u. U hebt recht op inzage in persoonsgegevens. Internationale doorgiften van persoonsgegevens kunnen persoonsgegevens buiten de Europese Economische Ruimte betreffen. Wij gebruiken geen geautomatiseerde besluitvorming met persoonsgegevens.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
    {
      locale: "pl",
      text: "Inspektor ochrony danych odpowiada na pytania. Masz prawo dostępu do danych osobowych. Transfery międzynarodowe danych osobowych mogą obejmować dane osobowe poza Europejski Obszar Gospodarczy. Nie stosujemy zautomatyzowane podejmowanie decyzji z użyciem danych osobowych.",
      topics: ["dpo_contact", "data_subject_rights", "international_transfers", "automated_decision_making_or_profiling"],
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });
    for (const topic of example.topics) {
      assert.ok(
        classification.matches.some((match) => match.topic === topic && match.matchedLocale === example.locale),
        `${example.locale} should classify ${topic}`,
      );
    }
  }
});

test("keeps unrelated or vague privacy snippets unknown", () => {
  for (const text of [
    "",
    "Privacy matters to us. This page contains news, account links, and marketing content.",
    "Cookies help us improve the site. Subscribe to our newsletter for updates.",
    "Contact our sales team for product pricing and account support.",
  ]) {
    const classification = classifyGdprTransparencyTopics({ text });
    assert.deepEqual(classification.matches, []);
  }
});

test("does not classify generic localized sales or support contact snippets as controller contact", () => {
  const examples = [
    {
      locale: "en",
      text: "Contact us for product pricing, account support, and sales questions.",
    },
    {
      locale: "de",
      text: "Kontakt zu unserem Vertriebsteam erhalten Sie über das Formular für Preise und Produktsupport.",
    },
    {
      locale: "fr",
      text: "Nous contacter pour les tarifs, le support produit et les questions de compte.",
    },
    {
      locale: "es",
      text: "Contacto con ventas para precios, soporte de producto y consultas de cuenta.",
    },
    {
      locale: "it",
      text: "Contattarci per prezzi, supporto prodotto e assistenza account.",
    },
    {
      locale: "nl",
      text: "Contact opnemen met support voor prijzen, productvragen en accountondersteuning.",
    },
    {
      locale: "pl",
      text: "Kontakt z działem sprzedaży w sprawie cen, pomocy technicznej i obsługi konta.",
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    assert.equal(
      classification.matches.some((match) => match.topic === "controller_contact"),
      false,
      `${example.locale} generic contact text should not classify controller_contact`,
    );
  }
});

test("does not classify generic business text as recipients, complaint, or profiling transparency evidence", () => {
  const examples = [
    {
      locale: "en",
      text: "Our recipients list supports team notifications. Third-party integrations, service providers, customer complaints, and product profiling help sales operations.",
    },
    {
      locale: "de",
      text: "Unsere Empfänger-Liste unterstützt Benachrichtigungen. Dienstleister, Beschwerden und Profiling helfen dem Vertrieb.",
    },
    {
      locale: "fr",
      text: "La liste des destinataires sert aux notifications. Les prestataires, les réclamations et le profilage produit aident les ventes.",
    },
    {
      locale: "es",
      text: "La lista de destinatarios admite notificaciones. Los proveedores de servicios, reclamaciones y elaboración de perfiles de producto ayudan a ventas.",
    },
    {
      locale: "it",
      text: "L'elenco dei destinatari supporta le notifiche. Fornitori di servizi, reclami e profilazione prodotto aiutano le vendite.",
    },
    {
      locale: "nl",
      text: "De lijst met ontvangers ondersteunt meldingen. Dienstverleners, klachten en productprofilering helpen verkoopteams.",
    },
    {
      locale: "pl",
      text: "Lista odbiorcy obsługuje powiadomienia. Dostawcy usług, skargi i profilowanie produktu pomagają sprzedaży.",
    },
  ] as const;

  const guardedTopics: GdprTransparencyTopic[] = [
    "recipients_or_vendor_categories",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${example.locale} generic business text should not classify ${topic}`,
      );
    }
  }
});

test("does not classify generic acronyms, transfer, or necessity text as DPO, transfer, or retention evidence", () => {
  const examples = [
    {
      locale: "en",
      text: "The DPO metric appears in dashboards. International transfers between bank accounts continue as long as necessary for support.",
    },
    {
      locale: "de",
      text: "Die DPO Kennzahl steht im Bericht. Drittland Versand und internationale Überweisungen laufen solange dies erforderlich ist.",
    },
    {
      locale: "fr",
      text: "Le code DPO apparaît dans le tableau. Les transferts internationaux de colis continuent aussi longtemps que nécessaire.",
    },
    {
      locale: "es",
      text: "El código DPO aparece en el informe. Las transferencias internacionales bancarias siguen mientras sea necesario.",
    },
    {
      locale: "it",
      text: "Il codice DPO appare nel report. I trasferimenti internazionali di spedizioni continuano finché necessario.",
    },
    {
      locale: "nl",
      text: "De FG-code staat in het dashboard. Internationale doorgiften van pakketten blijven zo lang als nodig actief.",
    },
    {
      locale: "pl",
      text: "Kod IOD pojawia się w raporcie. Transfery międzynarodowe płatności działają tak długo, jak to konieczne.",
    },
  ] as const;

  const guardedTopics: GdprTransparencyTopic[] = [
    "dpo_contact",
    "data_retention",
    "international_transfers",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${example.locale} generic acronym/transfer/necessity text should not classify ${topic}`,
      );
    }
  }
});

test("does not classify generic German data-protection commissioner article text as DPO contact evidence", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["de"],
    text: "Die Behörde der Datenschutzbeauftragten beaufsichtigt bisher den Nachrichtendienst. Die Datenschutzbeauftragte wehrt sich gegen den Entzug der Kontrolle.",
  });

  assert.equal(
    classification.matches.some((match) => match.topic === "dpo_contact"),
    false,
    "German public-commissioner/news text should not classify as a site DPO contact",
  );
});

test("classifies Dutch retained policy wording without broad generic data-transfer drift", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["nl"],
    text: [
      "U kunt een klacht indienen bij de Autoriteit Persoonsgegevens.",
      "In bepaalde omstandigheden heeft u het recht om bezwaar te maken tegen het verwerken van uw persoonsgegevens.",
      "In geval van internationale doorgifte van gegevens worden er maatregelen genomen om een adequaat beschermingsniveau te waarborgen.",
    ].join(" "),
  });

  for (const topic of [
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
  ] satisfies GdprTransparencyTopic[]) {
    assert.ok(
      classification.matches.some((match) => match.topic === topic && match.matchedLocale === "nl"),
      `Dutch NOS-style policy wording should classify ${topic}`,
    );
  }

  const generic = classifyGdprTransparencyTopics({
    localeHints: ["nl"],
    text: "Internationale doorgifte van gegevens tussen interne dashboards is een technische productfunctie.",
  });

  assert.equal(
    generic.matches.some((match) => match.topic === "international_transfers"),
    false,
    "Generic Dutch data-transfer product text should not classify as Article 13 international transfer evidence",
  );
});

test("does not classify generic EEA shipping, access, legal, processing, or retention text as transparency evidence", () => {
  const examples = [
    {
      locale: "en",
      text: "We ship orders outside the European Economic Area. Account access rights depend on your plan. HR keeps payment records for the retention period and explains the legal basis. Product processing jobs run nightly.",
    },
    {
      locale: "de",
      text: "Wir liefern Waren außerhalb des Europäischen Wirtschaftsraums. Zugriffsrechte hängen vom Konto ab. HR nennt die Rechtsgrundlage und die Speicherdauer für Zahlungsakten. Die Verarbeitung von Produkten läuft nachts.",
    },
    {
      locale: "fr",
      text: "Nous expédions hors de l'Espace économique européen. Les droits d'accès au compte dépendent du forfait. Les RH expliquent la base juridique et la durée de conservation des dossiers de paiement. Le traitement produit se lance la nuit.",
    },
    {
      locale: "es",
      text: "Enviamos pedidos fuera del Espacio Económico Europeo. Los derechos de acceso a la cuenta dependen del plan. RRHH explica la base jurídica y el plazo de conservación de pagos. El tratamiento de producto se ejecuta por la noche.",
    },
    {
      locale: "it",
      text: "Spediamo ordini fuori dallo Spazio economico europeo. I diritti di accesso all'account dipendono dal piano. HR spiega la base giuridica e il periodo di conservazione dei pagamenti. Il trattamento prodotto gira di notte.",
    },
    {
      locale: "nl",
      text: "Wij verzenden buiten de Europese Economische Ruimte. Toegangsrechten voor accounts hangen af van het abonnement. HR noemt de rechtsgrondslag en bewaartermijn voor betalingen. Productverwerking draait 's nachts.",
    },
    {
      locale: "pl",
      text: "Wysyłamy zamówienia poza Europejski Obszar Gospodarczy. Prawo dostępu do konta zależy od planu. HR opisuje podstawa prawna i okres przechowywania płatności. Przetwarzanie produktu działa nocą.",
    },
  ] as const;

  const guardedTopics: GdprTransparencyTopic[] = [
    "processing_purposes",
    "legal_basis",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${example.locale} generic text should not classify ${topic}`,
      );
    }
  }
});

test("does not classify broad personal-data processing statements as processing purposes", () => {
  const examples = [
    {
      locale: "en",
      text: "Personal data is processed when customers use the account service and related support tools.",
    },
    {
      locale: "de",
      text: "Bei der Nutzung der Website werden personenbezogene Daten verarbeitet, etwa bei der IP-Adresse oder bei Bestellungen.",
    },
    {
      locale: "fr",
      text: "Nous traitons vos données personnelles lors de l'utilisation du service et des outils d'assistance.",
    },
    {
      locale: "es",
      text: "Tratamos datos personales cuando se utiliza el servicio y las herramientas de soporte.",
    },
    {
      locale: "it",
      text: "Trattiamo dati personali quando usi il servizio e gli strumenti di assistenza.",
    },
    {
      locale: "nl",
      text: "Wanneer deze partijen persoonsgegevens verwerken buiten de Europese Economische Ruimte, beschermen we de gegevens met standaardclausules.",
    },
    {
      locale: "pl",
      text: "Przetwarzamy dane osobowe podczas korzystania z serwisu i narzędzi wsparcia.",
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    assert.equal(
      classification.matches.some((match) => match.topic === "processing_purposes"),
      false,
      `${example.locale} broad processing statement should not classify processing_purposes`,
    );
  }
});

test("classifies controller or privacy-specific contact snippets across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "The privacy contact for the data controller is privacy@example.test.",
    },
    {
      locale: "de",
      text: "Kontakt zum Verantwortlichen für Datenschutz ist privacy@example.test.",
    },
    {
      locale: "fr",
      text: "Le contact du responsable du traitement pour les questions de confidentialité est privacy@example.test.",
    },
    {
      locale: "es",
      text: "El contacto de protección de datos del responsable del tratamiento es privacidad@example.test.",
    },
    {
      locale: "it",
      text: "Il contatto del titolare del trattamento per la privacy è privacy@example.test.",
    },
    {
      locale: "nl",
      text: "Het privacycontact van de verwerkingsverantwoordelijke is privacy@example.test.",
    },
    {
      locale: "pl",
      text: "Kontakt do administratora danych w sprawie prywatności: prywatnosc@example.test.",
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });
    const match = classification.matches.find((candidate) => candidate.topic === "controller_contact");

    assert.ok(match, `${example.locale} should classify controller_contact`);
    assert.equal(match.matchedLocale, example.locale);
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
});

test("classifies privacy-specific legal basis, purposes, retention, rights, and transfer evidence across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "We explain the purposes of processing personal data, the legal basis for processing personal data, the retention period for personal data, your right to access your personal data, and international transfers of personal data.",
    },
    {
      locale: "de",
      text: "Wir erklären die Zwecke der Verarbeitung personenbezogener Daten, die Rechtsgrundlage für die Verarbeitung personenbezogener Daten, die Speicherdauer personenbezogener Daten, Ihr Recht auf Auskunft über personenbezogene Daten und die Übermittlung personenbezogener Daten in ein Drittland.",
    },
    {
      locale: "fr",
      text: "Nous expliquons les finalités du traitement des données personnelles, la base juridique du traitement des données personnelles, la durée de conservation des données personnelles, le droit d'accès aux données personnelles et les transferts internationaux de données personnelles.",
    },
    {
      locale: "es",
      text: "Explicamos las finalidades del tratamiento de datos personales, la base jurídica del tratamiento de datos personales, el plazo de conservación de datos personales, el derecho de acceso a datos personales y las transferencias internacionales de datos personales.",
    },
    {
      locale: "it",
      text: "Spieghiamo le finalità del trattamento dei dati personali, la base giuridica del trattamento dei dati personali, il periodo di conservazione dei dati personali, il diritto di accesso ai dati personali e i trasferimenti internazionali di dati personali.",
    },
    {
      locale: "nl",
      text: "Wij beschrijven de doeleinden van de verwerking van persoonsgegevens, de rechtsgrondslag voor de verwerking van persoonsgegevens, de bewaartermijn van persoonsgegevens, het recht op inzage in persoonsgegevens en internationale doorgiften van persoonsgegevens.",
    },
    {
      locale: "pl",
      text: "Opisujemy cele przetwarzania danych osobowych, podstawa prawna przetwarzania danych osobowych, okres przechowywania danych osobowych, prawo dostępu do danych osobowych oraz transfery międzynarodowe danych osobowych.",
    },
  ] as const;

  const expectedTopics: GdprTransparencyTopic[] = [
    "processing_purposes",
    "legal_basis",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of expectedTopics) {
      assert.ok(
        classification.matches.some((match) => match.topic === topic && match.matchedLocale === example.locale),
        `${example.locale} should classify ${topic}`,
      );
    }
  }
});

test("classifies privacy-specific DPO, transfer, and retention evidence across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "Our data protection officer is available through the DPO contact. We explain the retention period for personal data and international transfers of personal data.",
    },
    {
      locale: "de",
      text: "Sie können unseren Datenschutzbeauftragten erreichen. Wir erklären die Speicherdauer personenbezogener Daten und die Übermittlung personenbezogener Daten in ein Drittland.",
    },
    {
      locale: "fr",
      text: "Notre délégué à la protection des données est joignable par le contact DPO. Nous expliquons la durée de conservation des données personnelles et les transferts internationaux de données personnelles.",
    },
    {
      locale: "es",
      text: "El delegado de protección de datos atiende el contacto DPO. Explicamos el plazo de conservación de datos personales y las transferencias internacionales de datos personales.",
    },
    {
      locale: "it",
      text: "Il responsabile della protezione dei dati risponde tramite contatto DPO. Spieghiamo il periodo di conservazione dei dati personali e i trasferimenti internazionali di dati personali.",
    },
    {
      locale: "nl",
      text: "De functionaris voor gegevensbescherming is bereikbaar via contact met FG. Wij noemen de bewaartermijn van persoonsgegevens en internationale doorgiften van persoonsgegevens.",
    },
    {
      locale: "pl",
      text: "Inspektor ochrony danych odpowiada przez kontakt z IOD. Opisujemy okres przechowywania danych osobowych oraz transfery międzynarodowe danych osobowych.",
    },
  ] as const;

  const expectedTopics: GdprTransparencyTopic[] = [
    "dpo_contact",
    "data_retention",
    "international_transfers",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of expectedTopics) {
      assert.ok(
        classification.matches.some((match) => match.topic === topic && match.matchedLocale === example.locale),
        `${example.locale} should classify ${topic}`,
      );
    }
  }
});

test("classifies BILD-style German Article 13 policy language", () => {
  const text = [
    "Verantwortlich für die Datenverarbeitung gemäß Art. 4 Nr. 7 DSGVO ist die Axel Springer Deutschland GmbH, Axel-Springer-Str. 65, 10888 Berlin.",
    "Bei Fragen und Anregungen zum Datenschutz können Sie unseren Datenschutzbeauftragten erreichen unter datenschutz@example.test.",
    "Personenbezogene Daten werden unter anderem zu den Zwecken „Verwendung reduzierter Daten zur Auswahl von Werbeanzeigen“ und „Erstellung von Profilen für personalisierte Werbung“ verarbeitet.",
    "Rechtsgrundlage der Datenverarbeitung ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO.",
    "Informationen zu den eingesetzten Drittanbietern finden Sie in der Liste möglicher Drittanbieter.",
    "Wir verarbeiten personenbezogene Daten nur, solange dies für den jeweils genannten Zweck erforderlich ist.",
    "Ihre Rechte als betroffene Person umfassen Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch.",
    "Wir verarbeiten personenbezogene Daten auch in Staaten außerhalb des Europäischen Wirtschaftsraumes und nutzen Standardvertragsklauseln der EU-Kommission.",
    "Ferner haben Sie ein Beschwerderecht bei der zuständigen Aufsichtsbehörde.",
    "Wir verzichten auf eine automatische Entscheidungsfindung oder ein Profiling im Sinne des Art. 22 DSGVO."
  ].join(" ");

  const classification = classifyGdprTransparencyTopics({
    text,
    localeHints: ["de"],
    maxMatches: 20,
  });
  const topics = classification.matches.map((match) => match.topic);

  assert.deepEqual(
    new Set(topics),
    new Set([
      "controller_contact",
      "dpo_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ]),
  );
  assert.equal(classification.matches.every((match) => match.matchedLocale === "de"), true);
  assert.equal(
    classification.matches.every((match) => match.matchStrength === "direct" || match.matchStrength === "equivalent"),
    true,
  );
});

test("classifies privacy-specific recipients, complaint, and profiling evidence across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "We disclose recipients of personal data. You may lodge a complaint with a supervisory authority. We use profiling of personal data for fraud prevention.",
    },
    {
      locale: "de",
      text: "Wir nennen Empfänger personenbezogener Daten. Sie können Beschwerde bei einer Aufsichtsbehörde einlegen. Wir verwenden Profiling personenbezogener Daten.",
    },
    {
      locale: "fr",
      text: "Nous indiquons les destinataires des données personnelles. Vous pouvez introduire une réclamation auprès d'une autorité de contrôle. Nous utilisons le profilage des données personnelles.",
    },
    {
      locale: "es",
      text: "Indicamos los destinatarios de datos personales. Puede presentar una reclamación ante una autoridad de control. Usamos elaboración de perfiles de datos personales.",
    },
    {
      locale: "it",
      text: "Indichiamo i destinatari dei dati personali. Puoi proporre reclamo all'autorità di controllo. Usiamo profilazione dei dati personali.",
    },
    {
      locale: "nl",
      text: "Wij noemen ontvangers van persoonsgegevens. U kunt klacht indienen bij een toezichthoudende autoriteit. Wij gebruiken profilering van persoonsgegevens.",
    },
    {
      locale: "pl",
      text: "Wskazujemy odbiorcy danych osobowych. Możesz wnieść skargę do organu nadzorczego. Stosujemy profilowanie danych osobowych.",
    },
  ] as const;

  const expectedTopics: GdprTransparencyTopic[] = [
    "recipients_or_vendor_categories",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of expectedTopics) {
      assert.ok(
        classification.matches.some((match) => match.topic === topic && match.matchedLocale === example.locale),
        `${example.locale} should classify ${topic}`,
      );
    }
  }
});

test("does not classify broad generic business copy as GDPR Transparency evidence across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "Contact support about DPO dashboard metrics. Notification recipients and categories of recipients are configured in mailing lists. Shipping outside the European Economic Area, product automated decision-making, workflow automation, support automation, HR legal basis, account access rights, payment retention period, customer complaints, and vendor integrations are product operations copy.",
    },
    {
      locale: "de",
      text: "Kontakt zum Support für DPO Kennzahlen. Empfänger und Kategorien von Empfängern werden in Mailinglisten gepflegt. Versand in ein Drittland, automatisierte Entscheidungsfindung im Produkt, Workflow-Automation, Support-Automation, HR Rechtsgrundlage, Kontozugriff, Speicherdauer für Zahlungen, Beschwerden und Dienstleister sind Geschäftstexte.",
    },
    {
      locale: "fr",
      text: "Contacter le support pour les métriques DPO. Les destinataires et catégories de destinataires sont configurés dans les listes d'envoi. Expédition hors de l'Espace économique européen, décision automatisée produit, automatisation de workflow, support automatisé, base juridique RH, accès au compte, durée de conservation des paiements, réclamations et prestataires sont du texte métier.",
    },
    {
      locale: "es",
      text: "Contacto con soporte sobre métricas DPO. Los destinatarios y categorías de destinatarios se configuran en listas de correo. Envíos fuera del Espacio Económico Europeo, decisiones automatizadas de producto, automatización de flujos, soporte automatizado, base jurídica de RRHH, acceso a cuenta, plazo de conservación de pagos, reclamaciones y proveedores de servicios son texto operativo.",
    },
    {
      locale: "it",
      text: "Contattare il supporto per metriche DPO. Destinatari e categorie di destinatari sono configurati nelle liste di invio. Spedizioni fuori dallo Spazio economico europeo, decisioni automatizzate di prodotto, automazione workflow, supporto automatico, base giuridica HR, accesso account, periodo di conservazione pagamenti, reclami e fornitori di servizi sono testo operativo.",
    },
    {
      locale: "nl",
      text: "Contact opnemen met support over FG-statistieken. Ontvangers en categorieën van ontvangers staan in mailinglijsten. Verzending buiten de Europese Economische Ruimte, geautomatiseerde besluitvorming in het product, workflowautomatisering, supportautomatisering, HR rechtsgrondslag, accounttoegang, bewaartermijn voor betalingen, klachten en dienstverleners zijn operationele tekst.",
    },
    {
      locale: "pl",
      text: "Kontakt z pomocą w sprawie metryk IOD. Odbiorcy i kategorie odbiorców są ustawiane na listach mailingowych. Wysyłka poza Europejski Obszar Gospodarczy, zautomatyzowane podejmowanie decyzji w produkcie, automatyzacja procesu, automatyzacja wsparcia, podstawa prawna HR, dostęp do konta, okres przechowywania płatności, skargi i dostawcy usług to tekst operacyjny.",
    },
  ] as const;

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    assert.deepEqual(classification.matches, [], `${example.locale} generic copy should not classify`);
  }
});

test("classifies every GDPR Transparency topic with privacy-specific evidence across supported locales", () => {
  const examples = [
    {
      locale: "en",
      text: "The data controller provides a privacy contact and our data protection officer. We explain the purposes of processing personal data, the legal basis for processing personal data, categories of recipients of personal data, the retention period for personal data, your right to access your personal data, international transfers of personal data, the right to lodge a complaint with a supervisory authority, and automated decision-making using personal data.",
    },
    {
      locale: "de",
      text: "Der Verantwortlicher für die Datenverarbeitung nennt den Kontakt zum Datenschutz und den Kontakt zum Datenschutzbeauftragten. Wir erklären die Zwecke der Verarbeitung personenbezogener Daten, die Rechtsgrundlage für die Verarbeitung personenbezogener Daten, Kategorien von Empfängern personenbezogener Daten, die Speicherdauer personenbezogener Daten, das Recht auf Auskunft über personenbezogene Daten, die Übermittlung personenbezogener Daten in ein Drittland, das Recht auf Beschwerde bei einer Aufsichtsbehörde und automatisierte Entscheidungsfindung mit personenbezogenen Daten.",
    },
    {
      locale: "fr",
      text: "Le responsable du traitement indique le contact protection des données et le délégué à la protection des données. Nous expliquons les finalités du traitement des données personnelles, la base juridique du traitement des données personnelles, les catégories de destinataires des données personnelles, la durée de conservation des données personnelles, le droit d'accès aux données personnelles, les transferts internationaux de données personnelles, le droit d'introduire une réclamation auprès d'une autorité de contrôle et la décision automatisée utilisant des données personnelles.",
    },
    {
      locale: "es",
      text: "El responsable del tratamiento indica el contacto de protección de datos y el delegado de protección de datos. Explicamos las finalidades del tratamiento de datos personales, la base jurídica del tratamiento de datos personales, las categorías de destinatarios de datos personales, el plazo de conservación de datos personales, el derecho de acceso a datos personales, las transferencias internacionales de datos personales, el derecho a presentar una reclamación ante una autoridad de control y decisiones automatizadas con datos personales.",
    },
    {
      locale: "it",
      text: "Il titolare del trattamento indica il contatto protezione dati e il responsabile della protezione dei dati. Spieghiamo le finalità del trattamento dei dati personali, la base giuridica del trattamento dei dati personali, le categorie di destinatari dei dati personali, il periodo di conservazione dei dati personali, il diritto di accesso ai dati personali, i trasferimenti internazionali di dati personali, il diritto di proporre reclamo all'autorità di controllo e decisioni automatizzate con dati personali.",
    },
    {
      locale: "nl",
      text: "De verwerkingsverantwoordelijke noemt het contact gegevensbescherming en de functionaris voor gegevensbescherming. Wij beschrijven de doeleinden van de verwerking van persoonsgegevens, de rechtsgrondslag voor de verwerking van persoonsgegevens, categorieën van ontvangers van persoonsgegevens, de bewaartermijn van persoonsgegevens, het recht op inzage in persoonsgegevens, internationale doorgiften van persoonsgegevens, het recht om klacht in te dienen bij een toezichthoudende autoriteit en geautomatiseerde besluitvorming met persoonsgegevens.",
    },
    {
      locale: "pl",
      text: "Administrator danych podaje kontakt w sprawie ochrony danych oraz inspektor ochrony danych. Opisujemy cele przetwarzania danych osobowych, podstawa prawna przetwarzania danych osobowych, kategorie odbiorców danych osobowych, okres przechowywania danych osobowych, prawo dostępu do danych osobowych, transfery międzynarodowe danych osobowych, prawo do wniesienia skargi do organu nadzorczego oraz zautomatyzowane podejmowanie decyzji z użyciem danych osobowych.",
    },
  ] as const;

  const expectedTopics: GdprTransparencyTopic[] = [
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      text: example.text,
      localeHints: [example.locale],
    });

    for (const topic of expectedTopics) {
      assert.ok(
        classification.matches.some((match) => match.topic === topic && match.matchedLocale === example.locale),
        `${example.locale} should classify ${topic}`,
      );
    }
  }
});

test("registry covers every supported locale", () => {
  const registryLocales = new Set(GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY.map((term) => term.locale));

  for (const locale of SUPPORTED_PRIVACY_EVIDENCE_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
  }
});
