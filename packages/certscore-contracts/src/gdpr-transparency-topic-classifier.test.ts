import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGdprSupplementLink,
  classifyGdprTransparencyTopics,
  GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
  SUPPORTED_GDPR_TRANSPARENCY_LOCALES,
  type GdprTransparencyTopic,
} from "./index.js";

test("canonical English policy variants cover a complete GDPR transparency notice", () => {
  const text = [
    "Privacy notice describing how personal data is processed.",
    "Controller and contact. Example Publisher Ltd. is the controller. Contact privacy@example.test or the data protection officer at dpo@example.test.",
    "Purposes and legal-basis language. The service processes account data to provide a requested service under a contract and uses security logs for a stated legitimate-interest purpose.",
    "Recipients. Named vendors include Example Hosting Ltd. and Example Analytics Ltd.; professional advisers may receive data when necessary.",
    "Retention. Account records are retained for 24 months after closure.",
    "International transfers. Transfers outside the EEA use current European Commission standard contractual clauses and supplementary safeguards.",
    "Individual rights. Individuals may request access, correction, deletion, restriction, portability, or objection.",
    "Individuals may complain to the Irish Data Protection Commission.",
    "Automated decisions. The service does not make decisions producing legal or similarly significant effects solely by automated means.",
  ].join(" ");

  const matches = classifyGdprTransparencyTopics({ text, localeHints: ["en"] }).matches;
  assert.deepEqual(
    new Set(matches.map((match) => match.topic)),
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
  assert.equal(matches.every((match) =>
    match.matchStrength === "direct" || match.matchStrength === "equivalent"
  ), true);
});

test("canonical English policy variants require row-specific substantive context", () => {
  const text = [
    "Privacy Policy. Controller and contact.",
    "Purposes and legal basis.",
    "Records are retained for.",
    "Our vendors include.",
    "We collaborate with the Data Protection Commission.",
    "The service may operate solely by automated means.",
  ].join(" ");

  assert.deepEqual(classifyGdprTransparencyTopics({ text, localeHints: ["en"] }).matches, []);
});

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

test("classifies common practical English policy headings and clauses", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "We use the information for the purposes for which it was collected.",
      "The legal basis on which we hold and use your data varies by activity.",
      "Our lawful bases include consent, contract, and compliance with our legal obligations.",
      "International transfers of data may occur outside your jurisdiction.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  assert.equal(topics.has("processing_purposes"), true);
  assert.equal(topics.has("legal_basis"), true);
  assert.equal(topics.has("international_transfers"), true);
});

test("classifies practical purpose and service-provider clauses from a compact privacy notice", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Our hosting and content-delivery providers may process ordinary request information to deliver and protect the site.",
      "We use this information to understand site usage, verify changes, and diagnose usability issues."
    ].join(" ")
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  assert.equal(topics.has("processing_purposes"), true);
  assert.equal(topics.has("recipients_or_vendor_categories"), true);
});

test("classifies evidence-bound onward-recipient and negative profiling disclosures", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "When you order images, we pass on your data to the shipping provider so it can deliver the order.",
      "We do not use your data for profiling for advertising or eligibility decisions.",
    ].join(" "),
  });
  const byTopic = new Map(classification.matches.map((match) => [match.topic, match]));

  assert.match(
    byTopic.get("recipients_or_vendor_categories")?.evidenceExcerpt ?? "",
    /shipping provider/i,
  );
  assert.match(
    byTopic.get("automated_decision_making_or_profiling")?.evidenceExcerpt ?? "",
    /do not use your data for profiling/i,
  );
});

test("does not promote generic passing-on or profile language without personal-data context", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "We pass on savings to customers and do not use public user profiles for advertising creative.",
  });
  assert.equal(
    classification.matches.some((match) =>
      match.topic === "recipients_or_vendor_categories" ||
      match.topic === "automated_decision_making_or_profiling"
    ),
    false,
  );
});

test("retention criteria do not become processing-purpose evidence", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text:
      "We retain personal data only as long as necessary for the purpose for which it was collected."
  });

  assert.equal(
    classification.matches.some((match) => match.topic === "processing_purposes"),
    false
  );
});

test("classifies a large retained policy once while preserving bounded topic excerpts", () => {
  const text = [
    "navigation and service copy ".repeat(12_000),
    "The data controller can be contacted through our privacy form.",
    "Our data protection officer may be reached through the DPO contact channel.",
    "The retention period for personal data is described below.",
    "additional policy provisions ".repeat(6_000),
  ].join(" ");
  const startedAt = Date.now();
  const classification = classifyGdprTransparencyTopics({ text });
  const durationMs = Date.now() - startedAt;
  const byTopic = new Map(classification.matches.map((match) => [match.topic, match]));

  assert.ok(byTopic.has("controller_contact"));
  assert.ok(byTopic.has("dpo_contact"));
  assert.ok(byTopic.has("data_retention"));
  assert.match(byTopic.get("dpo_contact")?.evidenceExcerpt ?? "", /data protection officer/i);
  assert.ok(classification.matches.every((match) => match.evidenceExcerpt.length <= 360));
  assert.ok(durationMs < 2_000, `large policy classification took ${durationMs}ms`);
});

test("classifies Article 13 wording from controller/operator and processor-focused privacy notices", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Controller (operator) of data is ISPsystem LTD, and questions related to data processing can be sent to privacy@example.test.",
      "ISPsystem uses personal data for the following goals: provide service, support users, and improve products.",
      "The company proceeds from presence of the relevant legitimate interest for some processing.",
      "Data transfer. ISPsystem can transfer data to processors located outside ISPsystem location.",
      "Processors receive only the data needed to perform services.",
      "Subcontractors and service providers may assist with hosting and support.",
      "RIGHTS OF DATA SUBJECT include access, correction, deletion, objection, and restriction."
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  for (const topic of [
    "controller_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_subject_rights",
    "international_transfers",
  ] satisfies GdprTransparencyTopic[]) {
    const match = classification.matches.find((candidate) => candidate.topic === topic);
    assert.ok(match, `ISPsystem-style retained text should classify ${topic}`);
    assert.equal(match.matchedLocale, "en");
    assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
  assert.equal(topics.has("dpo_contact"), false);
});

test("classifies retained recipients headings with concrete affiliate and provider categories", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Recipients.",
      "Our affiliates, service providers, and third parties may receive personal data where needed to provide and support services."
    ].join(" "),
  });
  const match = classification.matches.find((candidate) => candidate.topic === "recipients_or_vendor_categories");

  assert.ok(match);
  assert.equal(match.matchedLocale, "en");
  assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
  assert.match(match.evidenceExcerpt, /affiliates, service providers, and third parties/i);
});

test("classifies direct US-policy transfer, recipient, and privacy-contact wording", () => {
  const classification = classifyGdprTransparencyTopics({
    text: [
      "We share personal information with service providers, analytics providers, advertising networks, social networks, and governmental authorities.",
      "Personal Information may be transferred to and processed in the United States or other jurisdictions.",
      "Questions about this Privacy Policy may be submitted to the address below, Attention Privacy Officer."
    ].join(" ")
  });
  const byTopic = new Map(classification.matches.map((match) => [match.topic, match]));

  assert.match(
    byTopic.get("recipients_or_vendor_categories")?.evidenceExcerpt ?? "",
    /share personal information with service providers/i
  );
  assert.match(
    byTopic.get("international_transfers")?.evidenceExcerpt ?? "",
    /transferred to and processed in the United States or other jurisdictions/i
  );
  assert.match(
    byTopic.get("controller_contact")?.evidenceExcerpt ?? "",
    /Privacy Policy|Privacy Officer/i
  );
  assert.equal(byTopic.has("dpo_contact"), false);
});

test("does not treat a generic privacy contact channel as controller or DPO evidence", () => {
  const retainedPolicy = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Policy.",
      "Contact. If you email us, we receive the information you choose to include and use it to respond to your message.",
      "You can contact us at ergoveritas1@gmail.com."
    ].join(" ")
  });
  const policyTopics = new Map(retainedPolicy.matches.map((match) => [match.topic, match]));

  assert.equal(policyTopics.has("controller_contact"), false);
  assert.equal(policyTopics.has("dpo_contact"), false);

  const controllerBoundContact = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "Example Ltd. is the data controller. Questions about this privacy policy can be sent to privacy@example.test."
  });
  assert.equal(
    controllerBoundContact.matches.some((match) => match.topic === "controller_contact"),
    true
  );

  const genericBusinessContact = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "For product pricing and account support, you can contact us at support@example.test."
  });
  assert.equal(
    genericBusinessContact.matches.some((match) =>
      match.topic === "controller_contact" || match.topic === "dpo_contact"
    ),
    false
  );
});

test("requires processing context for legal-obligation legal-basis language", () => {
  const bareCompliance = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "We preserve records and respond to lawful requests to comply with our legal obligations."
  });
  assert.equal(bareCompliance.matches.some((match) => match.topic === "legal_basis"), false);

  const processingBasis = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "We process your personal data to comply with our legal obligations."
  });
  assert.equal(processingBasis.matches.some((match) => match.topic === "legal_basis"), true);
});

test("requires personal-data or recipient context for generic third-party sharing language", () => {
  const genericSharing = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "Our editorial team may share information with third parties when discussing industry news."
  });
  assert.equal(
    genericSharing.matches.some((match) => match.topic === "recipients_or_vendor_categories"),
    false
  );

  const recipientDisclosure = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "We share information with third parties that act as service providers processing your personal data."
  });
  assert.equal(
    recipientDisclosure.matches.some((match) => match.topic === "recipients_or_vendor_categories"),
    true
  );
});

test("does not treat a Japanese privacy-policy heading as controller-contact evidence", () => {
  const headingOnly = classifyGdprTransparencyTopics({
    localeHints: ["ja"],
    text: "個人情報保護方針"
  });
  assert.equal(headingOnly.matches.some((match) => match.topic === "controller_contact"), false);
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
      text: "El responsable del tratamiento describe la base jurídica del tratamiento de datos personales y los destinatarios de datos personales. Utilizamos sus datos personales para procesar sus donaciones y emitir recibos.",
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

test("classifies Wave 1-3 native Article 13 variants without English anchors", () => {
  const examples = [
    {
      locale: "de",
      text: "Kontaktdaten des Verantwortlichen. Wofür wir Ihre personenbezogenen Daten verwenden. Die Datenverarbeitung erfolgt auf Grundlage von Art. 6. Empfänger der personenbezogenen Daten. Personenbezogene Daten werden nur so lange gespeichert, wie dies für die Zwecke erforderlich ist. Sie haben das Recht auf Datenübertragbarkeit und das Recht auf Einschränkung der Verarbeitung. Die Übermittlung personenbezogener Daten in Drittländer erfolgt mit geeigneten Garantien.",
    },
    {
      locale: "ru",
      text: "Контактные данные оператора персональных данных. Для чего мы используем ваши персональные данные. Обработка данных осуществляется на основании статьи 6. Получатель персональных данных. Персональные данные хранятся только столько, сколько необходимо для целей. Вы имеете право на переносимость данных и право на ограничение обработки. Передача персональных данных в третьи страны осуществляется с гарантиями.",
    },
    {
      locale: "pt",
      text: "Dados de contacto do responsável pelo tratamento. Para que usamos os seus dados pessoais. O tratamento de dados baseia-se no artigo 6. Destinatário dos dados pessoais. Os dados pessoais são conservados apenas enquanto forem necessários para as finalidades. Tem direito à portabilidade dos dados e direito à limitação do tratamento. A transferência de dados pessoais para países terceiros utiliza garantias adequadas.",
    },
    {
      locale: "es",
      text: "Datos de contacto del responsable del tratamiento. Para qué utilizamos sus datos personales. El tratamiento de datos se basa en el artículo 6. Destinatario de los datos personales. Los datos personales se conservan solo mientras sean necesarios para las finalidades. Tiene derecho a la portabilidad de los datos y derecho a la limitación del tratamiento. La transferencia de datos personales a terceros países se realiza con garantías adecuadas.",
    },
    {
      locale: "fr",
      text: "Coordonnées du responsable du traitement. À quelles fins nous utilisons vos données personnelles. Le traitement des données est fondé sur l'article 6. Destinataire des données personnelles. Les données personnelles ne sont conservées que pendant la durée nécessaire aux finalités. Vous disposez du droit à la portabilité des données et du droit à la limitation du traitement. Le transfert de données personnelles vers des pays tiers repose sur des garanties appropriées.",
    },
    {
      locale: "it",
      text: "Dati di contatto del titolare del trattamento. Per quali finalità utilizziamo i suoi dati personali. Il trattamento dei dati si basa sull'articolo 6. Destinatario dei dati personali. I dati personali sono conservati solo per il tempo necessario alle finalità. Ha diritto alla portabilità dei dati e diritto alla limitazione del trattamento. Il trasferimento dei dati personali verso paesi terzi avviene con garanzie adeguate.",
    },
    {
      locale: "nl",
      text: "Contactgegevens van de verwerkingsverantwoordelijke. Waarvoor wij uw persoonsgegevens gebruiken. De gegevensverwerking is gebaseerd op artikel 6. Ontvanger van persoonsgegevens. Persoonsgegevens worden slechts bewaard zolang dat nodig is voor de doeleinden. U heeft recht op overdraagbaarheid van gegevens en recht op beperking van de verwerking. Doorgifte van persoonsgegevens aan derde landen gebeurt met passende waarborgen.",
    },
    {
      locale: "pl",
      text: "Dane kontaktowe administratora danych osobowych. W jakich celach wykorzystujemy dane osobowe. Przetwarzanie danych odbywa się na podstawie art. 6. Odbiorca danych osobowych. Dane osobowe są przechowywane tylko tak długo, jak jest to konieczne do celów. Masz prawo do przenoszenia danych i prawo do ograniczenia przetwarzania. Przekazywanie danych osobowych do państw trzecich odbywa się z odpowiednimi zabezpieczeniami.",
    },
    {
      locale: "ja",
      text: "個人情報取扱事業者の連絡先。個人情報を何のために利用するか。GDPR第6条に基づく個人データ処理。個人データの提供先。利用目的に必要な期間に限り個人データを保存します。データポータビリティの権利および個人データの処理を制限する権利があります。第三国への個人データの移転には適切な保護措置を講じます。",
    },
    {
      locale: "zh",
      text: "个人信息处理者的联系方式。我们为何使用您的个人信息。根据GDPR第6条处理个人数据。个人信息接收方。仅在实现处理目的所必需的期限内保留个人信息。您享有数据可携权以及限制处理个人数据的权利。向第三国传输个人数据时采用适当保障。",
    },
    {
      locale: "ar",
      text: "بيانات الاتصال بالمتحكم في البيانات الشخصية. لماذا نستخدم بياناتك الشخصية. تستند معالجة البيانات إلى المادة 6. مستلم البيانات الشخصية. لا نحتفظ بالبيانات الشخصية إلا طالما كان ذلك ضروريا للأغراض. لك الحق في نقل البيانات والحق في تقييد المعالجة. يتم نقل البيانات الشخصية إلى دول ثالثة بضمانات مناسبة.",
    },
    {
      locale: "tr",
      text: "Kişisel veri sorumlusunun iletişim bilgileri. Kişisel verilerinizi hangi amaçlarla kullanıyoruz. Veri işleme GDPR Madde 6 uyarınca gerçekleştirilir. Kişisel verilerin alıcısı. Kişisel veriler amaçlar için gerekli olduğu sürece saklanır. Veri taşınabilirliği hakkı ve işlemenin kısıtlanmasını talep etme hakkı vardır. Kişisel verilerin üçüncü ülkelere aktarılması uygun güvencelere tabidir.",
    },
  ] as const;
  const expectedTopics = [
    "controller_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
  ] satisfies GdprTransparencyTopic[];

  for (const example of examples) {
    const classification = classifyGdprTransparencyTopics({
      localeHints: [example.locale],
      text: example.text,
    });
    for (const topic of expectedTopics) {
      const match = classification.matches.find((candidate) =>
        candidate.topic === topic && candidate.matchedLocale === example.locale
      );
      assert.ok(match, `${example.locale} should classify ${topic}`);
      assert.equal(match.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.ok(match.evidenceExcerpt.length <= 360);
    }
  }
});

test("Wave 1-3 expansion does not promote generic localized Article 6, transfer, or storage copy", () => {
  const examples = [
    ["de", "Artikel 6 der Satzung behandelt internationale Überweisungen und die Speicherung von Waren."],
    ["ru", "Статья 6 договора регулирует международные переводы и хранение товаров."],
    ["pt", "O artigo 6 do contrato trata de transferências bancárias e armazenamento de mercadorias."],
    ["es", "El artículo 6 del contrato regula transferencias bancarias y almacenamiento de mercancías."],
    ["fr", "L'article 6 du contrat concerne les virements bancaires et le stockage des marchandises."],
    ["it", "L'articolo 6 del contratto disciplina i bonifici internazionali e lo stoccaggio delle merci."],
    ["nl", "Artikel 6 van het contract gaat over bankoverschrijvingen en goederenopslag."],
    ["pl", "Artykuł 6 umowy dotyczy przelewów bankowych i magazynowania towarów."],
    ["ja", "契約第6条は国際送金と商品の保管について定めます。"],
    ["zh", "合同第6条规定国际汇款和货物仓储。"],
    ["ar", "تنظم المادة 6 من العقد التحويلات المصرفية الدولية وتخزين البضائع."],
    ["tr", "Sözleşmenin 6. maddesi uluslararası banka havalelerini ve ürün depolamayı düzenler."],
  ] as const;

  for (const [locale, text] of examples) {
    const topics = classifyGdprTransparencyTopics({
      localeHints: [locale],
      text,
    }).matches.map((match) => match.topic);
    assert.equal(topics.includes("legal_basis"), false, locale);
    assert.equal(topics.includes("data_retention"), false, locale);
    assert.equal(topics.includes("international_transfers"), false, locale);
  }
});

test("classifies structured Italian Article 13 table headings and scope language", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["it"],
    text: [
      "Finalità del trattamento: gestione del rapporto contrattuale.",
      "Base giuridica: articolo 6, paragrafo 1, lettera b.",
      "Destinatari e responsabili del trattamento: fornitori di servizi informatici.",
      "Periodo di conservazione: due anni.",
      "Diritti degli interessati: accesso, rettifica, cancellazione, limitazione, portabilità e opposizione.",
      "Trasferimenti extra UE: garanzie previste dagli articoli 44 e seguenti."
    ].join(" ")
  });

  assert.deepEqual(
    new Set(classification.matches.map((match) => match.topic)),
    new Set([
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers"
    ])
  );
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

test("classifies Jonneke-shaped German policy sections without relying on English anchors", () => {
  const text = [
    "Datenschutzerklärung. Verantwortlicher: Pferdeklinik Beispiel GmbH, Musterstraße 1, 12345 Musterstadt, E-Mail datenschutz@example.de.",
    "Datenschutzbeauftragter. Unser Datenschutzbeauftragter ist unter datenschutzbeauftragter@example.de erreichbar.",
    "Zwecke der Verarbeitung. Wir verarbeiten personenbezogene Daten zur Bereitstellung der Website, zur Bearbeitung von Anfragen und zur Erfüllung vertraglicher Pflichten.",
    "Maßgebliche Rechtsgrundlagen. Die Verarbeitung erfolgt auf Grundlage einer Einwilligung, zur Vertragserfüllung, zur Erfüllung rechtlicher Verpflichtungen oder aufgrund berechtigter Interessen.",
    "Offenlegung und Übermittlung von Daten. Daten können gegenüber Auftragsverarbeitern oder Dritten offengelegt oder an sie übermittelt werden.",
    "Löschung von Daten. Die von uns verarbeiteten und gespeicherten Daten werden gelöscht, sobald der Zweck ihrer Verarbeitung entfällt und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.",
    "Rechte der betroffenen Personen. Betroffene Personen haben insbesondere das Recht auf Auskunft über diese Daten, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit.",
    "Übermittlungen in Drittländer erfolgen nur unter den besonderen Voraussetzungen der Art. 44 ff. DSGVO und mit geeigneten Garantien.",
    "Betroffene Personen haben außerdem das Recht auf Beschwerde bei einer Aufsichtsbehörde.",
  ].join(" ");

  const topics = new Set(classifyGdprTransparencyTopics({
    text,
    localeHints: ["de"],
  }).matches.map((match) => match.topic));

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
  ] as const) {
    assert.equal(topics.has(topic), true, `${topic}; retained topics: ${[...topics].join(", ")}`);
  }
});

test("classifies natural German transparency clauses without requiring formal headings", () => {
  const examples = [
    ["processing_purposes", "Datenschutzerklärung. Ihre personenbezogenen Daten werden verwendet, um Termine zu verwalten und Anfragen zu beantworten."],
    ["legal_basis", "Datenschutzerklärung. Wir verarbeiten Ihre personenbezogenen Daten auf Grundlage Ihrer Einwilligung und zur Erfüllung gesetzlicher Verpflichtungen."],
    ["recipients_or_vendor_categories", "Datenschutzerklärung. Personenbezogene Daten werden an unseren Hosting-Dienstleister übermittelt, der sie in unserem Auftrag verarbeitet."],
    ["data_retention", "Datenschutzerklärung. Wir speichern Ihre personenbezogenen Daten solange dies erforderlich ist und gesetzliche Aufbewahrungsfristen bestehen."],
    ["supervisory_authority", "Datenschutzerklärung. Sie können sich bei einer Datenschutzaufsichtsbehörde beschweren, wenn Sie die Verarbeitung für rechtswidrig halten."],
    ["automated_decision_making_or_profiling", "Datenschutzerklärung. Eine automatisierte Entscheidungsfindung einschließlich Profiling findet nicht statt."],
  ] as const satisfies ReadonlyArray<readonly [GdprTransparencyTopic, string]>;

  for (const [topic, text] of examples) {
    const match = classifyGdprTransparencyTopics({ localeHints: ["de"], text }).matches.find(
      (candidate) => candidate.topic === topic,
    );
    assert.ok(match, `German natural clause should classify ${topic}`);
    assert.equal(match.matchedLocale, "de");
    assert.equal(match.matchStrength, "equivalent");
    assert.ok(match.evidenceExcerpt.length > 0 && match.evidenceExcerpt.length <= 360);
  }
});

test("classifies calibrated natural transparency clauses across high-coverage European locales", () => {
  const examples = [
    {
      locale: "fr",
      text: "Politique de confidentialité. Vos données personnelles sont utilisées afin de gérer votre compte. Le traitement repose sur votre consentement et une obligation légale. Vos données personnelles sont transmises à un sous-traitant. Les données personnelles sont conservées aussi longtemps que nécessaire. Vous avez le droit de déposer une réclamation auprès de la CNIL. La prise de décision automatisée n'a pas lieu.",
    },
    {
      locale: "es",
      text: "Política de privacidad. Sus datos personales se utilizan para gestionar su cuenta. El tratamiento se basa en su consentimiento y una obligación legal. Sus datos personales se comunican a un encargado del tratamiento. Los datos personales se conservan mientras sea necesario. Tiene derecho a presentar una reclamación ante la autoridad de control. La toma de decisiones automatizada no se utiliza.",
    },
    {
      locale: "it",
      text: "Informativa sulla privacy. I suoi dati personali sono utilizzati per gestire il conto. Il trattamento si basa sul suo consenso e su un obbligo legale. I suoi dati personali sono comunicati a un responsabile del trattamento. I dati personali sono conservati finché necessario. Ha il diritto di presentare un reclamo all'autorità di controllo. Il processo decisionale automatizzato non viene utilizzato.",
    },
    {
      locale: "nl",
      text: "Privacyverklaring. Uw persoonsgegevens worden gebruikt om uw account te beheren. De verwerking berust op uw toestemming en een wettelijke verplichting. Uw persoonsgegevens worden doorgegeven aan een verwerker. Persoonsgegevens worden bewaard zolang dat nodig is. U heeft het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens. Geautomatiseerde besluitvorming vindt niet plaats.",
    },
    {
      locale: "pl",
      text: "Polityka prywatności. Państwa dane osobowe są wykorzystywane w celu zarządzania kontem. Przetwarzanie odbywa się na podstawie Państwa zgody i obowiązku prawnego. Państwa dane osobowe są przekazywane podmiotowi przetwarzającemu. Dane osobowe są przechowywane tak długo jak jest to niezbędne. Mają Państwo prawo wniesienia skargi do organu nadzorczego. Zautomatyzowane podejmowanie decyzji nie jest stosowane.",
    },
    {
      locale: "pt",
      text: "Política de privacidade. Os seus dados pessoais são utilizados para gerir a conta. O tratamento baseia-se no seu consentimento e numa obrigação legal. Os seus dados pessoais são transmitidos a um subcontratante. Os dados pessoais são conservados enquanto necessário. Tem o direito de apresentar uma reclamação à autoridade de controlo. A tomada de decisões automatizada não é utilizada.",
    },
  ] as const;
  const expectedTopics = [
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] as const satisfies readonly GdprTransparencyTopic[];

  for (const example of examples) {
    const topics = new Set(classifyGdprTransparencyTopics({
      localeHints: [example.locale],
      text: example.text,
    }).matches.map((match) => match.topic));
    for (const topic of expectedTopics) {
      assert.equal(topics.has(topic), true, `${example.locale} natural clause should classify ${topic}`);
    }
  }
});

test("keeps localized operational retention, complaints, and automation out of transparency topics", () => {
  const examples = [
    ["de", "Der Versand wird solange wie nötig gespeichert. Kundenbeschwerden werden automatisch an den Vertrieb weitergeleitet."],
    ["fr", "Les colis sont conservés aussi longtemps que nécessaire. Les réclamations clients sont triées automatiquement par le support."],
    ["es", "Los paquetes se conservan mientras sea necesario. Las reclamaciones de clientes se clasifican automáticamente para ventas."],
    ["it", "Le spedizioni sono conservate finché necessario. I reclami dei clienti vengono ordinati automaticamente dal supporto."],
    ["nl", "Pakketten worden bewaard zolang dat nodig is. Klachten van klanten worden automatisch naar verkoop gestuurd."],
    ["pl", "Przesyłki są przechowywane tak długo jak potrzeba. Skargi klientów są automatycznie kierowane do sprzedaży."],
    ["pt", "As encomendas são conservadas enquanto necessário. As reclamações de clientes são encaminhadas automaticamente para vendas."],
  ] as const;
  const guardedTopics: GdprTransparencyTopic[] = [
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const [locale, text] of examples) {
    const classification = classifyGdprTransparencyTopics({ localeHints: [locale], text });
    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${locale} operational text should not classify ${topic}`,
      );
    }
  }
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

test("requires a Russian controller identity or contact channel instead of a generic operator role", () => {
  const genericRole = classifyGdprTransparencyTopics({
    localeHints: ["ru"],
    text: "Политика обработки персональных данных. Оператор персональных данных вправе отстаивать свои интересы в суде и обязан предоставлять данные в предусмотренных законом случаях.",
  });
  assert.equal(genericRole.matches.some((match) => match.topic === "controller_contact"), false);

  for (const text of [
    "Политика обработки персональных данных. Оператор персональных данных является ООО «Пример». Адрес электронной почты: privacy@example.test.",
  ]) {
    const identifiedController = classifyGdprTransparencyTopics({ localeHints: ["ru"], text });
    assert.equal(
      identifiedController.matches.some((match) => match.topic === "controller_contact"),
      true,
      text,
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
    {
      locale: "pt",
      text: "O responsável pelo tratamento de dados pessoais fornece o contato do controlador e o contato do encarregado de proteção de dados. Explicamos as finalidades do tratamento de dados pessoais, a base legal para o tratamento de dados pessoais, as categorias de destinatários dos dados pessoais, o prazo de conservação dos dados pessoais, o direito de acesso aos dados pessoais, as transferências internacionais de dados pessoais, o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados e as decisões automatizadas com dados pessoais.",
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

test("Portuguese operational copy does not create GDPR Transparency topic evidence", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["pt"],
    text: "Entre em contato com o suporte para métricas do produto. O prazo de entrega, o processamento do pagamento, as decisões automáticas do fluxo e os destinatários da lista de notícias são configurações operacionais.",
  });

  assert.deepEqual(classification.matches, []);
});

test("classifies all GDPR Transparency topics in the five newly calibrated locales", () => {
  const examples = [
    {
      locale: "ru",
      text: "Политика обработки персональных данных. Оператор персональных данных указывает контакт ответственного по защите данных. Мы описываем цели обработки персональных данных, правовые основания обработки персональных данных, категории получателей персональных данных, срок хранения персональных данных, права субъекта персональных данных, трансграничную передачу персональных данных, право подать жалобу в надзорный орган и автоматизированное принятие решений с использованием персональных данных.",
    },
    {
      locale: "ja",
      text: "個人データの管理者はデータ保護責任者への連絡先を示します。個人データを処理する目的、個人データ処理の法的根拠、個人データの受領者のカテゴリー、個人データの保存期間、データ主体の権利、個人データの国際移転、監督機関に苦情を申し立てる権利、個人データを用いた自動意思決定について説明します。",
    },
    {
      locale: "zh",
      text: "个人数据控制者提供数据保护负责人的联系方式。我们说明处理个人数据的目的、处理个人数据的法律依据、个人数据接收方的类别、个人数据的保存期限、数据主体的权利、个人数据的跨境传输、向监管机构投诉的权利以及使用个人数据进行自动化决策。",
    },
    {
      locale: "ar",
      text: "يقدم مراقب البيانات الشخصية بيانات الاتصال بمسؤول حماية البيانات. نشرح أغراض معالجة البيانات الشخصية والأساس القانوني لمعالجة البيانات الشخصية وفئات مستلمي البيانات الشخصية ومدة الاحتفاظ بالبيانات الشخصية وحقوق صاحب البيانات والنقل الدولي للبيانات الشخصية والحق في تقديم شكوى إلى سلطة رقابية واتخاذ القرارات الآلية باستخدام البيانات الشخصية.",
    },
    {
      locale: "sv",
      text: "Personuppgiftsansvarig anger kontaktuppgifter till dataskyddsombudet. Vi beskriver ändamålen med behandlingen av personuppgifter, rättslig grund för behandling av personuppgifter, kategorier av mottagare av personuppgifter, lagringstid för personuppgifter, den registrerades rättigheter, internationella överföringar av personuppgifter, rätt att lämna in klagomål till en tillsynsmyndighet och automatiserat beslutsfattande med personuppgifter.",
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
    const matches = classifyGdprTransparencyTopics({ text: example.text, localeHints: [example.locale] }).matches;
    for (const topic of expectedTopics) {
      assert.ok(matches.some((match) => match.topic === topic && match.matchedLocale === example.locale), `${example.locale} should classify ${topic}`);
    }
  }
});

test("does not classify generic operational copy in the five newly calibrated locales", () => {
  const examples = [
    { locale: "ru", text: "Свяжитесь со службой поддержки по вопросам доставки. Автоматизация заказов и сроки хранения товаров описаны в каталоге." },
    { locale: "ja", text: "配送についてはサポートにお問い合わせください。商品の保管期間と自動注文処理はカタログに記載されています。" },
    { locale: "zh", text: "如需了解配送信息，请联系客户支持。商品保存时间和自动订单流程属于商城运营设置。" },
    { locale: "ar", text: "تواصل مع دعم العملاء بشأن الشحن. مدة تخزين المنتجات ومعالجة الطلبات الآلية من إعدادات المتجر." },
    { locale: "sv", text: "Kontakta kundsupport om leveranser. Lagring av produkter och automatisering av beställningar är butiksfunktioner." },
  ] as const;

  for (const example of examples) {
    assert.deepEqual(
      classifyGdprTransparencyTopics({ text: example.text, localeHints: [example.locale] }).matches,
      [],
      `${example.locale} operational copy should not classify`,
    );
  }
});

test("matches Japanese and Chinese policy phrases without whitespace and preserves bounded native excerpts", () => {
  const examples = [
    { locale: "ja", text: "当社の方針では、個人データ処理の法的根拠について明確に説明します。" },
    { locale: "zh", text: "本隐私政策详细说明处理个人数据的法律依据以及相关保护措施。" },
  ] as const;

  for (const example of examples) {
    const match = classifyGdprTransparencyTopics({ text: example.text, localeHints: [example.locale] }).matches
      .find((candidate) => candidate.topic === "legal_basis");
    assert.ok(match, `${example.locale} should match an unsegmented phrase`);
    assert.equal(match.matchedLocale, example.locale);
    assert.ok(match.evidenceExcerpt.includes(example.locale === "ja" ? "法的根拠" : "法律依据"));
    assert.ok(match.evidenceExcerpt.length <= 360);
  }
});

test("classifies a possessive data-protection-authority complaint right", () => {
  const result = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "Depending on where you live, you may have the right to complain to your data protection authority.",
  });
  const match = result.matches.find((candidate) => candidate.topic === "supervisory_authority");

  assert.ok(match);
  assert.equal(match.matchedLocale, "en");
  assert.equal(match.matchStrength, "equivalent");
  assert.match(match.evidenceExcerpt, /complain to your data protection authority/i);
});

test("classifies retained publisher privacy-counsel and E.U. complaint contacts", () => {
  const result = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "Email us at privacy@publisher.example or write to Privacy Counsel. In the European Union, you can lodge a complaint with an E.U. data protection authority.",
  });
  const byTopic = new Map(result.matches.map((match) => [match.topic, match]));

  assert.equal(byTopic.get("dpo_contact")?.matchStrength, "equivalent");
  assert.match(byTopic.get("dpo_contact")?.evidenceExcerpt ?? "", /privacy counsel/i);
  assert.equal(byTopic.get("supervisory_authority")?.matchStrength, "equivalent");
  assert.match(byTopic.get("supervisory_authority")?.evidenceExcerpt ?? "", /e\.u\. data protection authority/i);
});

test("classifies national supervisory-authority complaint language", () => {
  const classification = classifyGdprTransparencyTopics({
    text: "You can lodge a complaint with the national supervisory authority.",
  });
  const match = classification.matches.find((candidate) => candidate.topic === "supervisory_authority");
  assert.equal(match?.matchedTerm, "lodge a complaint with the national supervisory authority");
  assert.equal(match?.matchStrength, "equivalent");
  assert.equal(match?.matchedLocale, "en");
});

test("classifies a Japanese publisher privacy policy row by row without inventing GDPR disclosures", () => {
  const result = classifyGdprTransparencyTopics({
    localeHints: ["ja"],
    text: "個人情報保護方針。株式会社デイリースポーツは個人情報取扱事業者です。個人情報の利用目的を定め、利用目的の範囲内で取り扱います。個人情報を委託先へ提供する場合および個人情報の第三者提供について説明します。本人は個人情報の開示、訂正、削除を請求できます。個人情報に関するお問い合わせは当社窓口までご連絡ください。"
  });
  const topics = new Set(result.matches.map((match) => match.topic));

  for (const topic of ["controller_contact", "processing_purposes", "recipients_or_vendor_categories", "data_subject_rights"] as const) {
    assert.equal(topics.has(topic), true, topic);
  }
  for (const topic of ["legal_basis", "data_retention", "international_transfers", "supervisory_authority", "dpo_contact"] as const) {
    assert.equal(topics.has(topic), false, topic);
  }
});

test("classifies reviewed regional, script, inflection, and punctuation variants for the six calibrated locales", () => {
  const cases = [
    {
      locale: "pt",
      text: "O fundamento jurídico para o tratamento de dados pessoais é explicado, incluindo o direito de apresentar reclamação a uma autoridade de controlo.",
      topics: ["legal_basis", "supervisory_authority"],
    },
    {
      locale: "ru",
      text: "В уведомлении сообщается о правовых основаниях обработки персональных данных, сроках хранения персональных данных и правах субъектов персональных данных.",
      topics: ["legal_basis", "data_retention", "data_subject_rights"],
    },
    {
      locale: "ja",
      text: "個人データ処理の法的根拠と個人データの保存期間およびデータ主体の権利を説明します。",
      topics: ["legal_basis", "data_retention", "data_subject_rights"],
    },
    {
      locale: "zh",
      text: "個人資料控制者提供資料保護長的聯絡方式，並說明處理個人資料的目的、處理個人資料的法律依據、個人資料接收者的類別、個人資料的保存期限、資料當事人的權利、個人資料的跨境傳輸、向監管機構投訴的權利及使用個人資料進行自動化決策。",
      topics: [
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
      ],
    },
    {
      locale: "ar",
      text: "وَالْأَسَاسُ الْقَانُونِيُّ لِمُعَالَجَةِ الْبَيَانَاتِ الشَّخْصِيَّةِ يشمل الموافقة والعقد.",
      topics: ["legal_basis"],
    },
    {
      locale: "sv",
      text: "Policyn beskriver personuppgifternas lagringstid och de registrerades rättigheter.",
      topics: ["data_retention", "data_subject_rights"],
    },
  ] as const;

  for (const entry of cases) {
    const matches = classifyGdprTransparencyTopics({ text: entry.text, localeHints: [entry.locale] }).matches;
    for (const topic of entry.topics) {
      assert.equal(matches.some((match) => match.topic === topic && match.matchedLocale === entry.locale), true, `${entry.locale} ${topic}`);
    }
  }
});

test("classifies reviewed inflection and official-vocabulary variants for the five EU expansion locales", () => {
  const cases = [
    {
      locale: "ro",
      text: "Politica explică baza legală pentru prelucrarea datelor cu caracter personal și perioada pentru care vor fi stocate datele cu caracter personal.",
      topics: ["legal_basis", "data_retention"],
    },
    {
      locale: "cs",
      text: "Uvádíme právní titul zpracování osobních údajů a dobu uchovávání osobních údajů.",
      topics: ["legal_basis", "data_retention"],
    },
    {
      locale: "el",
      text: "Αναφέρουμε τη νομική βάση της επεξεργασίας δεδομένων προσωπικού χαρακτήρα και την περίοδο διατήρησης των δεδομένων προσωπικού χαρακτήρα.",
      topics: ["legal_basis", "data_retention"],
    },
    {
      locale: "hu",
      text: "Ismertetjük az érintett jogait, a személyes adatok nemzetközi továbbítását és a panasz benyújtásának jogát valamely felügyeleti hatósághoz.",
      topics: ["data_subject_rights", "international_transfers", "supervisory_authority"],
    },
    {
      locale: "da",
      text: "Vi beskriver opbevaringsperioden for personoplysninger og retten til at indgive en klage til en tilsynsmyndighed.",
      topics: ["data_retention", "supervisory_authority"],
    },
  ] as const;

  for (const entry of cases) {
    const matches = classifyGdprTransparencyTopics({ text: entry.text, localeHints: [entry.locale] }).matches;
    for (const topic of entry.topics) {
      assert.equal(matches.some((match) => match.topic === topic && match.matchedLocale === entry.locale), true, `${entry.locale} ${topic}`);
    }
  }
});

test("classifies natural transparency clauses in the five calibrated EU expansion locales", () => {
  const cases = [
    {
      locale: "ro",
      text: "Politică de confidențialitate. Datele cu caracter personal sunt utilizate pentru a gestiona contul. Prelucrarea se bazează pe consimțământ și pe o obligație legală. Datele personale sunt transmise unei persoane împuternicite. Păstrăm datele personale atât timp cât este necesar. Puteți depune o plângere la autoritatea de supraveghere. Nu folosim un proces decizional automatizat sau profilare.",
    },
    {
      locale: "cs",
      text: "Zásady ochrany osobních údajů. Osobní údaje používáme k vyřízení vašeho účtu. Zpracování je založeno na souhlasu a právní povinnosti. Osobní údaje předáváme poskytovatelům služeb. Uchováváme osobní údaje po dobu nezbytně nutnou. Můžete podat stížnost u dozorového úřadu. Neprovádíme automatizované rozhodování ani profilování.",
    },
    {
      locale: "el",
      text: "Πολιτική απορρήτου. Τα προσωπικά δεδομένα χρησιμοποιούνται για τη διαχείριση του λογαριασμού σας. Η επεξεργασία βασίζεται στη συγκατάθεσή σας και σε νομική υποχρέωση. Τα προσωπικά δεδομένα διαβιβάζονται σε εκτελούντα την επεξεργασία. Διατηρούμε τα προσωπικά δεδομένα για όσο διάστημα είναι αναγκαίο. Μπορείτε να υποβάλετε καταγγελία στην εποπτική αρχή. Δεν χρησιμοποιούμε αυτοματοποιημένη λήψη αποφάσεων ή κατάρτιση προφίλ.",
    },
    {
      locale: "hu",
      text: "Adatvédelmi tájékoztató. Személyes adatait a fiók kezelése céljából használjuk. Az adatkezelés alapja az Ön hozzájárulása és jogi kötelezettség. Személyes adatait adatfeldolgozóknak továbbítjuk. Személyes adatait addig őrizzük meg, ameddig szükséges. Panaszt nyújthat be a felügyeleti hatóságnál. Nem alkalmazunk automatizált döntéshozatalt vagy profilalkotást.",
    },
    {
      locale: "da",
      text: "Privatlivspolitik. Dine personoplysninger bruges til at administrere din konto. Behandlingen er baseret på samtykke og en retlig forpligtelse. Dine personoplysninger videregives til databehandlere. Vi opbevarer personoplysninger så længe som nødvendigt. Du kan indgive en klage til Datatilsynet. Vi anvender ikke automatiserede afgørelser eller profilering.",
    },
  ] as const;
  const expectedTopics = [
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] as const satisfies readonly GdprTransparencyTopic[];

  for (const entry of cases) {
    const classification = classifyGdprTransparencyTopics({
      text: entry.text,
      localeHints: [entry.locale],
    });
    const topics = new Set(classification.matches.map((match) => match.topic));
    for (const topic of expectedTopics) {
      assert.equal(topics.has(topic), true, `${entry.locale} natural clause should classify ${topic}`);
    }
  }
});

test("keeps operational copy out of the new EU natural-clause semantic rules", () => {
  const cases = [
    ["ro", "Păstrăm coletele atât timp cât este necesar. Plângerile clienților sunt procesate automat de echipa de vânzări."],
    ["cs", "Uchováváme zásilky po dobu nezbytně nutnou. Stížnosti zákazníků automaticky vyřizuje prodejní tým."],
    ["el", "Διατηρούμε τα δέματα για όσο διάστημα είναι αναγκαίο. Οι καταγγελίες πελατών ταξινομούνται αυτόματα για τις πωλήσεις."],
    ["hu", "A csomagokat addig őrizzük meg, ameddig szükséges. Az ügyfélpanaszokat automatikusan az értékesítéshez irányítjuk."],
    ["da", "Vi opbevarer pakker så længe som nødvendigt. Kundeklager sendes automatisk til salgsteamet."],
  ] as const;
  const guardedTopics: GdprTransparencyTopic[] = [
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const [locale, text] of cases) {
    const classification = classifyGdprTransparencyTopics({ text, localeHints: [locale] });
    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${locale} operational copy should not classify ${topic}`,
      );
    }
  }
});

test("does not classify generic operational copy in the five EU expansion locales", () => {
  const cases = [
    ["ro", "Perioada de păstrare a coletelor depinde de curier, iar scopul paginii este prezentarea produselor."],
    ["cs", "Doba uložení zásilky závisí na dopravci a automatizované třídění objednávek zrychluje sklad."],
    ["el", "Η περίοδος αποθήκευσης των προϊόντων εξαρτάται από την αποθήκη και η αυτόματη ταξινόμηση αφορά παραγγελίες."],
    ["hu", "A csomagok tárolási ideje a futártól függ, az automatizált raktári döntés pedig a készletet kezeli."],
    ["da", "Opbevaringsperioden for varer afhænger af lageret, og automatiske afgørelser bruges til forsendelser."],
  ] as const;

  for (const [locale, text] of cases) {
    assert.deepEqual(classifyGdprTransparencyTopics({ text, localeHints: [locale] }).matches, [], locale);
  }
});

test("classifies retained Hungarian Russian and Estonian policy wording without formal boilerplate", () => {
  const cases = [
    {
      locale: "hu" as const,
      text: "Adatvédelmi tájékoztató. Hozzájárulásod alapján kezelt adataid vannak. Személyes adataidat tájékoztatási célból használjuk. A megőrzési idő elteltével a személyes adatokat töröljük, és hozzájárulásod bármikor visszavonható. Személyes adataidat csak meghatározott esetekben továbbítjuk harmadik felek részére. Profilalkotáson alapuló közvetlen üzletszerzés is történhet.",
      topics: ["processing_purposes", "legal_basis", "recipients_or_vendor_categories", "data_retention", "data_subject_rights", "automated_decision_making_or_profiling"],
    },
    {
      locale: "ru" as const,
      text: "Политика обработки персональных данных. Цели обработки данных включают обслуживание запросов. Вы даете согласие на их обработку и можете отозвать свое согласие. Администрация может передать данные третьим лицам и хранит журналы в течение 1 (одного) года.",
      topics: ["processing_purposes", "legal_basis", "recipients_or_vendor_categories", "data_retention", "data_subject_rights"],
    },
    {
      locale: "et" as const,
      text: "Privaatsustingimused. Kasutaja annab nõusoleku töödelda isikuandmeid teenuse osutamise eesmärgil. Teavet loovutatakse kolmandatele osapooltele üksnes seaduse alusel. Kasutajal on õigus eemaldada teenusest oma konto, mis kustub automaatselt kolme kuu möödudes.",
      topics: ["processing_purposes", "legal_basis", "recipients_or_vendor_categories", "data_retention", "data_subject_rights"],
    },
  ];

  for (const fixture of cases) {
    const result = classifyGdprTransparencyTopics({
      text: fixture.text,
      localeHints: [fixture.locale],
    });
    const topics = new Set(result.matches.map((match) => match.topic));
    for (const topic of fixture.topics) {
      assert.equal(topics.has(topic as never), true, `${fixture.locale}:${topic}`);
    }
  }
});

test("does not classify generic operational copy in the Nordic, Central European, Baltic, Ukrainian, or Turkish expansion locales", () => {
  const cases = [
    ["fi", "Tuotteiden säilytysaika riippuu varastosta, ja automaattinen lajittelu nopeuttaa toimituksia."],
    ["sk", "Doba uloženia zásielky závisí od dopravcu a automatické triedenie urýchľuje skladové operácie."],
    ["bg", "Срокът за съхранение на стоките зависи от склада, а автоматичното сортиране ускорява доставките."],
    ["hr", "Razdoblje pohrane robe ovisi o skladištu, a automatizirano razvrstavanje ubrzava isporuku."],
    ["nb", "Lagringsperioden for varer avhenger av lageret, og automatisk sortering gjør forsendelsen raskere."],
    ["sl", "Obdobje hrambe blaga je odvisno od skladišča, avtomatizirano razvrščanje pa pospeši dostavo."],
    ["lt", "Prekių saugojimo laikotarpis priklauso nuo sandėlio, o automatinis rūšiavimas pagreitina pristatymą."],
    ["lv", "Preču glabāšanas laikposms ir atkarīgs no noliktavas, un automātiska šķirošana paātrina piegādi."],
    ["et", "Kauba säilitamise aeg sõltub laost ning automaatne sortimine kiirendab tarnimist."],
    ["uk", "Строк зберігання товарів залежить від складу, а автоматичне сортування прискорює доставку."],
    ["tr", "Ürünlerin saklama süresi depoya bağlıdır ve otomatik sıralama teslimatı hızlandırır."],
  ] as const;

  for (const [locale, text] of cases) {
    assert.deepEqual(classifyGdprTransparencyTopics({ text, localeHints: [locale] }).matches, [], locale);
  }
});

test("classifies natural transparency clauses across the Nordic Central European Baltic Ukrainian and Turkish wave", () => {
  const cases = [
    ["fi", "Tietosuojakäytäntö. Henkilötietoja käytetään tilin hallintaan. Käsittely perustuu suostumukseen ja lakisääteiseen velvoitteeseen. Henkilötietoja luovutetaan palveluntarjoajille. Säilytämme henkilötietoja niin kauan kuin tarpeen. Voit tehdä valituksen tietosuojaviranomaiselle. Emme käytä automatisoitua päätöksentekoa tai profilointia."],
    ["sk", "Zásady ochrany osobných údajov. Osobné údaje používame na správu účtu. Spracúvanie je založené na súhlase a zákonnej povinnosti. Osobné údaje poskytujeme sprostredkovateľom. Uchovávame osobné údaje, kým je to potrebné. Môžete podať sťažnosť dozornému orgánu. Nepoužívame automatizované rozhodovanie ani profilovanie."],
    ["bg", "Политика за поверителност. Личните данни се използват за управление на профила. Обработването се основава на съгласие и законово задължение. Личните данни се предоставят на обработващи лични данни. Съхраняваме личните данни, докато е необходимо. Можете да подадете жалба до надзорен орган. Не използваме автоматизирано вземане на решения или профилиране."],
    ["hr", "Pravila privatnosti. Osobne podatke koristimo za upravljanje računom. Obrada se temelji na privoli i zakonskoj obvezi. Osobne podatke prosljeđujemo izvršiteljima obrade. Čuvamo osobne podatke dok god je potrebno. Možete podnijeti pritužbu nadzornom tijelu. Ne koristimo automatizirano donošenje odluka ili profiliranje."],
    ["nb", "Personvernerklæring. Personopplysninger brukes til å administrere kontoen. Behandlingen er basert på samtykke og rettslig forpliktelse. Personopplysninger utleveres til databehandlere. Vi lagrer personopplysninger så lenge som nødvendig. Du kan sende inn en klage til Datatilsynet. Vi bruker ikke automatiserte avgjørelser eller profilering."],
    ["sl", "Pravilnik o zasebnosti. Osebne podatke uporabljamo za upravljanje računa. Obdelava temelji na privolitvi in zakonski obveznosti. Osebne podatke posredujemo obdelovalcem. Hranimo osebne podatke, dokler je potrebno. Lahko vložite pritožbo pri nadzornem organu. Ne uporabljamo avtomatiziranega sprejemanja odločitev ali profiliranja."],
    ["lt", "Privatumo politika. Asmens duomenis naudojame paskyrai tvarkyti. Duomenų tvarkymas grindžiamas sutikimu ir teisine prievole. Asmens duomenis perduodame duomenų tvarkytojams. Saugome asmens duomenis tol, kol tai būtina. Galite pateikti skundą priežiūros institucijai. Nenaudojame automatizuoto sprendimų priėmimo ar profiliavimo."],
    ["lv", "Privātuma politika. Personas datus izmantojam konta pārvaldīšanai. Datu apstrāde balstās uz piekrišanu un juridisku pienākumu. Personas datus nododam apstrādātājiem. Glabājam personas datus tik ilgi, cik nepieciešams. Varat iesniegt sūdzību uzraudzības iestādei. Neizmantojam automatizētu lēmumu pieņemšanu vai profilēšanu."],
    ["et", "Privaatsuspoliitika. Isikuandmeid kasutame konto haldamiseks. Andmetöötlus põhineb nõusolekul ja seaduslikul kohustusel. Isikuandmeid edastame volitatud töötlejatele. Säilitame isikuandmeid nii kaua, kui vajalik. Võite esitada kaebuse järelevalveasutusele. Me ei kasuta automatiseeritud otsuseid ega profiilianalüüsi."],
    ["uk", "Політика конфіденційності. Персональні дані використовуються для керування обліковим записом. Обробка ґрунтується на згоді та юридичному обов'язку. Персональні дані передаються обробникам. Зберігаємо персональні дані, доки це необхідно. Можете подати скаргу наглядовому органу. Ми не використовуємо автоматизоване прийняття рішень або профілювання."],
    ["tr", "Gizlilik politikası. Kişisel verileri işliyoruz hizmet sunmak için. Veri işleme temelinde gerçekleşir açık rıza ve yasal yükümlülük. Kişisel verileri aktarırız veri işleyenlere. Kişisel verileri muhafaza ederiz gerektiği sürece. Şikayette bulunabilirsiniz denetim makamına. Otomatik karar vermeyi veya profillemeyi gerçekleştirmiyoruz."],
  ] as const;
  const expectedTopics = [
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] as const satisfies readonly GdprTransparencyTopic[];

  for (const [locale, text] of cases) {
    const classification = classifyGdprTransparencyTopics({ text, localeHints: [locale] });
    const topics = new Set(classification.matches.map((match) => match.topic));
    for (const topic of expectedTopics) {
      assert.equal(topics.has(topic), true, `${locale} natural clause should classify ${topic}`);
    }
  }
});

test("new Nordic Central European Baltic Ukrainian and Turkish clauses reject operational lookalikes", () => {
  const cases = [
    ["fi", "Säilytämme tuotteita niin kauan kuin tarpeen. Asiakasvalitukset ohjataan automaattisesti myyntiin."],
    ["sk", "Uchovávame zásielky, kým je to potrebné. Sťažnosti zákazníkov sa automaticky posielajú predaju."],
    ["bg", "Съхраняваме пратките, докато е необходимо. Жалбите на клиентите се изпращат автоматично към продажбите."],
    ["hr", "Čuvamo pošiljke dok god je potrebno. Pritužbe kupaca automatski se šalju prodaji."],
    ["nb", "Vi lagrer pakker så lenge som nødvendig. Kundeklager sendes automatisk til salg."],
    ["sl", "Hranimo pakete, dokler je potrebno. Pritožbe strank se samodejno pošljejo prodaji."],
    ["lt", "Saugome siuntas tol, kol būtina. Klientų skundai automatiškai siunčiami pardavimui."],
    ["lv", "Glabājam sūtījumus tik ilgi, cik nepieciešams. Klientu sūdzības automātiski nosūta pārdošanai."],
    ["et", "Säilitame pakke nii kaua, kui vajalik. Klientide kaebused saadetakse automaatselt müüki."],
    ["uk", "Зберігаємо посилки, доки це необхідно. Скарги клієнтів автоматично надсилаються до відділу продажів."],
    ["tr", "Paketleri gerektiği sürece saklarız. Müşteri şikayetleri otomatik olarak satışa yönlendirilir."],
  ] as const;
  const guardedTopics: GdprTransparencyTopic[] = [
    "data_retention",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ];

  for (const [locale, text] of cases) {
    const classification = classifyGdprTransparencyTopics({ text, localeHints: [locale] });
    for (const topic of guardedTopics) {
      assert.equal(
        classification.matches.some((match) => match.topic === topic),
        false,
        `${locale} operational copy should not classify ${topic}`,
      );
    }
  }
});

test("classifies every GDPR Transparency topic across all 40 primary privacy locales", () => {
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

  for (const locale of SUPPORTED_GDPR_TRANSPARENCY_LOCALES) {
    const representativeTerms = expectedTopics.map((topic) => {
      const term = GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY.find((candidate) =>
        candidate.locale === locale &&
        candidate.topic === topic &&
        candidate.variant === undefined
      );
      assert.ok(term, `${locale}:${topic} canonical term`);
      return term.phrase;
    });
    const classification = classifyGdprTransparencyTopics({
      localeHints: [locale],
      text: representativeTerms.join(". "),
    });
    assert.deepEqual(
      new Set(classification.matches.map((match) => match.topic)),
      new Set(expectedTopics),
      locale,
    );
    assert.equal(
      classification.matches.every((match) =>
        match.matchedLocale === locale &&
        match.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
        match.evidenceExcerpt.length <= 360
      ),
      true,
      locale,
    );
  }
});

test("does not classify generic operational copy in the eleven primary-locale expansion languages", () => {
  const cases = [
    ["fa", "زمان نگهداری کالا به موجودی انبار بستگی دارد و مرتب سازی خودکار تحویل را سریع تر می کند."],
    ["vi", "Thời gian lưu kho của sản phẩm phụ thuộc vào nhà kho và việc phân loại tự động giúp giao hàng nhanh hơn."],
    ["id", "Masa penyimpanan barang bergantung pada gudang dan penyortiran otomatis mempercepat pengiriman."],
    ["ko", "상품 보관 기간은 창고에 따라 달라지며 자동 분류는 배송을 더 빠르게 합니다."],
    ["th", "ระยะเวลาจัดเก็บสินค้าขึ้นอยู่กับคลังสินค้าและการคัดแยกอัตโนมัติช่วยให้จัดส่งเร็วขึ้น"],
    ["he", "תקופת אחסון המוצרים תלויה במחסן ומיון אוטומטי מזרז את המשלוח."],
    ["sr", "Period skladištenja robe zavisi od magacina, a automatizovano sortiranje ubrzava isporuku."],
    ["ca", "El període d'emmagatzematge dels productes depèn del magatzem i la classificació automàtica accelera el lliurament."],
    ["hi", "उत्पादों की भंडारण अवधि गोदाम पर निर्भर करती है और स्वचालित छंटाई वितरण को तेज करती है।"],
    ["az", "Məhsulların anbarda saxlanma müddəti anbardan asılıdır və avtomatik çeşidləmə çatdırılmanı sürətləndirir."],
    ["gl", "O período de almacenamento dos produtos depende do almacén e a clasificación automática acelera a entrega."],
  ] as const;

  for (const [locale, text] of cases) {
    assert.deepEqual(classifyGdprTransparencyTopics({ text, localeHints: [locale] }).matches, [], locale);
  }
});

test("retains locale alternatives for mixed-language policy sections without changing the default projection", () => {
  const text = [
    "Retention period for personal data.",
    "व्यक्तिगत डेटा की अवधारण अवधि। यह नीति बताती है कि Example Services व्यक्तिगत जानकारी को 24 महीने तक रखती है।",
  ].join(" ");
  const defaultClassification = classifyGdprTransparencyTopics({ text });
  const mixedClassification = classifyGdprTransparencyTopics({
    maxMatches: 80,
    retainLocaleAlternatives: true,
    text,
  });

  assert.equal(
    defaultClassification.matches.filter((match) => match.topic === "data_retention").length,
    1,
  );
  assert.deepEqual(
    new Set(mixedClassification.matches
      .filter((match) => match.topic === "data_retention")
      .map((match) => match.matchedLocale)),
    new Set(["en", "hi"]),
  );
});

test("selects substantive repeated topic evidence instead of an earlier contents occurrence in English and French", () => {
  const cases = [
    {
      locale: "en" as const,
      phrase: "legal basis for processing personal data",
      substantive: "The legal basis for processing personal data is Article 6 GDPR: consent, contract, legal obligation, public task, and legitimate interests.",
      expected: /Article 6 GDPR/,
    },
    {
      locale: "fr" as const,
      phrase: "base juridique du traitement des données personnelles",
      substantive: "La base juridique du traitement des données personnelles est l'article 6 du RGPD : consentement, contrat, obligation légale et mission d'intérêt public.",
      expected: /article 6 du RGPD/,
    },
  ];

  for (const entry of cases) {
    const text = [
      `Contents | ${entry.phrase} | Recipients | Retention | Rights`,
      "Navigation item ".repeat(80),
      entry.substantive,
    ].join(" ");
    const match = classifyGdprTransparencyTopics({
      localeHints: [entry.locale],
      text,
    }).matches.find((candidate) => candidate.topic === "legal_basis");

    assert.ok(match, entry.locale);
    assert.match(match.evidenceExcerpt, entry.expected, entry.locale);
  }
});

test("normalizes primary-script punctuation and joiners without losing native evidence", () => {
  const cases = [
    ["hi", "व्यक्तिगत डेटा की अवधारण अवधि।", "data_retention"],
    ["fa", "اهداف پردازش داده‌های شخصی؛", "processing_purposes"],
    ["he", "תקופת שמירת המידע־האישי.", "data_retention"],
  ] as const;

  for (const [locale, text, topic] of cases) {
    const match = classifyGdprTransparencyTopics({
      localeHints: [locale],
      text,
    }).matches.find((candidate) => candidate.topic === topic);
    assert.ok(match, `${locale}:${topic}`);
    assert.equal(match.matchedLocale, locale);
    assert.match(match.evidenceExcerpt, /\p{L}/u);
  }
});

test("registry covers every supported locale", () => {
  const registryLocales = new Set(GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY.map((term) => term.locale));

  for (const locale of SUPPORTED_GDPR_TRANSPARENCY_LOCALES) {
    assert.equal(registryLocales.has(locale), true, locale);
  }
});

test("classifies bounded GDPR supplemental-policy links across every primary locale", () => {
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    const classification = classifyGdprSupplementLink({
      linkText: entry.privacyPolicyLabels[0],
      surroundingText: entry.contextHints.join(" "),
      url: `https://example.test/${entry.locale}/gdpr`,
    });
    assert.equal(classification.likelySupplement, true, entry.locale);
    assert.equal(classification.classifierProvenance, "gdpr_supplement_link_classifier.v1", entry.locale);
    assert.ok(classification.matchedLocale, `${entry.locale} locale provenance`);
    assert.equal(classification.reasonCodes.includes("canonical_gdpr_jurisdiction_marker"), true, entry.locale);
    assert.equal(classification.reasonCodes.includes("canonical_privacy_surface_match"), true, entry.locale);
  }
});

test("does not treat a general GDPR framework explainer as the site's supplemental privacy policy", () => {
  const classification = classifyGdprSupplementLink({
    linkText: "Règlement européen sur la protection des données",
    url: "https://www.cnil.fr/fr/reglement-europeen-protection-donnees",
  });

  assert.equal(classification.likelySupplement, false);
  assert.deepEqual(classification.reasonCodes, ["general_legal_framework_resource_not_policy_supplement"]);
});

test("classifies retained public-policy headings in German, French, Spanish, and Italian", () => {
  const cases = [
    {
      locale: "de" as const,
      text: "Datenschutzerklärung. Dauer der Speicherung: Die Daten werden gelöscht, wenn die Aufgabe erfüllt ist. Rechte der betroffenen Person: Sie können Auskunft, Berichtigung und Löschung verlangen. Name und Anschrift des DSB (Datenschutzbeauftragten): Behördlicher Datenschutzbeauftragter, datenschutz@example.de.",
      topics: ["data_retention", "data_subject_rights", "dpo_contact"] as const,
    },
    {
      locale: "fr" as const,
      text: "Politique de confidentialité. Finalités et bases légales: le service traite vos données pour répondre à votre demande. Catégories de données et durée de conservation: les dossiers sont conservés trois ans. Qui sont les destinataires de vos données ? Nos prestataires techniques. Quels sont vos droits sur vos données et comment les exercer ? Vous pouvez demander l'accès et l'effacement. Transfert des données hors de l'Union européenne: des garanties appropriées sont appliquées. Vous disposez du droit d'introduire une réclamation ou une plainte auprès de la Commission Nationale de l'Informatique et des Libertés.",
      topics: ["processing_purposes", "legal_basis", "data_retention", "recipients_or_vendor_categories", "data_subject_rights", "international_transfers", "supervisory_authority"] as const,
    },
    {
      locale: "es" as const,
      text: "Política de privacidad. Responsable del tratamiento: Agencia pública. Finalidad del tratamiento: prestar el servicio solicitado. Legitimación: artículo 6.1 e del RGPD. Conservación de datos: durante cinco años. Comunicación de datos: proveedores encargados del tratamiento. Derechos de las personas interesadas: acceso, rectificación, supresión y oposición.",
      topics: ["controller_contact", "processing_purposes", "legal_basis", "data_retention", "recipients_or_vendor_categories", "data_subject_rights"] as const,
    },
    {
      locale: "it" as const,
      text: "Informativa sulla privacy. Trasferimento dei dati: i dati personali possono essere trasferiti fuori dallo Spazio economico europeo mediante clausole contrattuali standard.",
      topics: ["international_transfers"] as const,
    },
  ];

  for (const entry of cases) {
    const classification = classifyGdprTransparencyTopics({ text: entry.text, localeHints: [entry.locale] });
    const topics = new Set(classification.matches.map((match) => match.topic));
    for (const topic of entry.topics) {
      assert.equal(topics.has(topic), true, `${entry.locale}:${topic}; got ${[...topics].join(", ")}`);
    }
  }
});

test("recognizes localized GDPR acronyms without promoting unrelated acronym text", () => {
  const positives = [
    ["DSGVO Datenschutzerklärung", "https://example.de/dsgvo"],
    ["Avis de confidentialité RGPD", "https://example.fr/rgpd"],
    ["Polityka prywatności RODO", "https://example.pl/rodo"],
    ["AVG privacyverklaring", "https://example.nl/avg"],
  ] as const;
  for (const [linkText, url] of positives) {
    assert.equal(classifyGdprSupplementLink({ linkText, url }).likelySupplement, true, linkText);
  }

  assert.equal(classifyGdprSupplementLink({
    linkText: "GDPR consulting services",
    url: "https://example.test/services",
  }).likelySupplement, false);
  assert.equal(classifyGdprSupplementLink({
    linkText: "Average delivery performance",
    url: "https://example.test/avg-performance",
  }).likelySupplement, false);
});

test("classifies retained production false-negative wording before projection", () => {
  const cases = [
    {
      topic: "supervisory_authority",
      text: "Complaint. You have the right to make a complaint about our personal data handling practices to your local Supervisory Authority.",
    },
    {
      topic: "controller_contact",
      text: "Who is the controller of Personal Data? Mercado Libre is the controller of the data collected from users and visitors.",
    },
    {
      topic: "recipients_or_vendor_categories",
      text: "Your browser's push subscription endpoint is shared with Google, Mozilla, Apple, or Microsoft to deliver notifications.",
    },
    {
      topic: "international_transfers",
      text: "Cross-Border Transfer. We may transfer, use, and process your personal data in Taiwan or another location where our data-processing centers are located.",
    },
  ] as const;

  for (const fixture of cases) {
    const topics = new Set(classifyGdprTransparencyTopics({
      localeHints: ["en"],
      text: fixture.text,
    }).matches.map((match) => match.topic));
    assert.equal(topics.has(fixture.topic), true, fixture.topic);
  }
});

test("classifies Caltech-shaped main-notice and linked GDPR-supplement disclosures", () => {
  const mainNotice = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Notice. This Notice governs how California Institute of Technology collects, uses, processes, discloses and retains personal information.",
      "How We Use the Information We Collect. We may use information we collect from and about you for the following purposes: operating and improving the sites, providing support, communicating with you, security, analytics, research, and legal compliance.",
      "How We Share Information. Service Providers. We may share or provide access to your information with service providers that use such information to perform services on our behalf.",
      "Affiliates. We may share information with our affiliated entities. Third-party partners. We may share information with third parties that support our promotional efforts.",
      "International Users. Personal data will be transferred from your country of origin to the United States, which may have different data protection laws than your jurisdiction.",
      "Contact Us. If you have questions about this policy, please contact us via email at privacy@example.test.",
    ].join(" "),
  });
  const mainTopics = new Set(mainNotice.matches.map((match) => match.topic));

  assert.equal(
    mainTopics.has("controller_contact"),
    false,
    "generic policy contact without a bound controller identity must not satisfy controller contact",
  );
  assert.equal(mainTopics.has("processing_purposes"), true);
  assert.equal(mainTopics.has("recipients_or_vendor_categories"), true);
  assert.equal(mainTopics.has("international_transfers"), true);
  assert.equal(mainTopics.has("dpo_contact"), false, "generic policy contact must not become a privacy-manager/DPO row");

  const gdprSupplement = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "General Data Protection Regulation Notice.",
      "Legal Basis. Caltech is required to have a legal basis for collecting personally identifiable information. The basis for our processing includes contract, legitimate interests, legal obligations, and consent.",
      "Data Retention. We will retain your PII for as long as necessary for the stated uses and legal document retention obligations.",
      "International Transfers. Data that you provide to us may be transferred to and stored at a destination outside the EU or the EEA.",
      "Your Rights include the right to request the deletion of your personal data and the right to restrict or limit the ways in which we process your personal data.",
      "You have the right to withhold consent to automated individual decision-making processes and the right to complain to a supervisory authority.",
      "To submit a request, please contact Caltech's Privacy Manager at privacy@example.test.",
    ].join(" "),
  });
  const supplementTopics = new Set(gdprSupplement.matches.map((match) => match.topic));

  for (const topic of [
    "legal_basis",
    "data_retention",
    "data_subject_rights",
    "dpo_contact",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(supplementTopics.has(topic), true, topic);
  }
});

test("Caltech-shaped purpose and transfer phrases require privacy disclosure context", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Operations handbook. How we use the information we collect from equipment for the following purposes: maintenance and inventory planning.",
      "Inventory may be transferred to and stored at a destination outside the EU or the EEA.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  assert.equal(topics.has("processing_purposes"), false);
  assert.equal(topics.has("international_transfers"), false);
});

test("classifies retained CertScore policy wording at the observation boundary", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Policy. Service providers that may receive or process information on our behalf include AWS, Stripe, Gmail SMTP, Google Analytics, and Microsoft Clarity.",
      "We retain account data while an account remains active and as needed to provide the service.",
      "You have rights to request access to personal data, deletion, correction, portability, restriction, or objection.",
      "Personal information is transferred across borders when our service providers process it in another country.",
      "CertScore.ai does not use personal data for profiling or make decisions based solely on automated processing that produce legal or similarly significant effects.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  for (const topic of [
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "automated_decision_making_or_profiling",
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(topics.has(topic), true, topic);
  }
});

test("classifies substantive corporate privacy-policy wording before report projection", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Policy.",
      "How Do We Use the Information We Collect? We use this Information to provide, secure, personalize, and improve our services.",
      "Retention. We only keep Information for as long as we need it to fulfil the purpose we are using it for, as permitted by law.",
      "Who Do We Disclose Your Information To? We disclose Information to service providers that host, deliver, secure, and analyze our services.",
      "Individual Rights. You have the Right to access and rectification, erasure, restriction, portability, and objection.",
      "You may object to processing of your Information on the basis of our legitimate interests.",
      "International Transfers. Your Information may be transferred to, and processed in, the United States with appropriate safeguards.",
      "If you have questions about this Privacy Policy, contact us and our Data Protection Officer at privacy@example.test.",
      "You may lodge a complaint before the supervisory authority for data protection in your country.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

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
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(topics.has(topic), true, topic);
  }
  assert.equal(
    classification.matches.every((match) =>
      match.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
      match.matchedLocale === "en" &&
      match.evidenceExcerpt.length <= 360
    ),
    true,
  );
});

test("corporate-policy variants remain unknown without privacy-disclosure context", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Operations handbook.",
      "How do we use the information we collect from warehouse sensors?",
      "Who do we disclose your information to when routing a support ticket?",
      "We only keep information for as long as we need to troubleshoot equipment.",
      "Employees have a right to access and rectification of payroll records.",
      "Shipment information may be transferred to and processed in the United States.",
    ].join(" "),
  });

  assert.deepEqual(classification.matches, []);
});

test("keeps a negated DPO designation separate from an observed privacy contact point", () => {
  const negatedDesignation = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "CertScore.ai does not currently publish or designate a Data Protection Officer.",
  });
  assert.equal(
    negatedDesignation.matches.some((match) => match.topic === "dpo_contact"),
    false,
  );

  const contactPoint = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Contact Point. Email privacy@certscore.ai for privacy questions and data-subject requests.",
      "CertScore.ai has not appointed a Data Protection Officer.",
    ].join(" "),
  });
  const privacyContact = contactPoint.matches.find((match) => match.topic === "dpo_contact");

  assert.ok(privacyContact);
  assert.equal(privacyContact.variant, "privacy_contact_point");
});

test("classifies retained Article 4 and Article 6 policy wording without semantic-review fallback", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Privacy Policy.",
      "Information on the controller pursuant to Art. 4 No. 7 GDPR. Example Group AG, Privacy Street 1. E-mail: privacy@example.test.",
      "Data Protection Officer: Jane Privacy, dpo@example.test.",
      "What do we use your data for? The data will be processed for the following purposes: website delivery, communication, and security.",
      "Data processing is based on Art. 6 (1) lit. f GDPR.",
      "Recipient of the data: Example Services Germany GmbH.",
      "The data is stored for as long as its processing is necessary for these purposes.",
      "You have the right to data portability and the right to request the restriction of the processing of your personal data.",
      "Data transfers to third countries are secured by appropriate safeguards pursuant to Art. 46 GDPR.",
      "You have the right to lodge a complaint with a supervisory authority.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

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
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(topics.has(topic), true, topic);
  }
});

test("classifies retained German clinic policy wording without exact-grammar gaps", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["de"],
    text: [
      "Datenschutzerklärung. Personenbezogene Daten werden nur im Rahmen der Erforderlichkeit sowie zum Zwecke der Bereitstellung eines funktionsfähigen und nutzerfreundlichen Internetauftritts verarbeitet.",
      "Mit der nachfolgenden Datenschutzerklärung informieren wir Sie über Art, Umfang, Zweck, Dauer und Rechtsgrundlage der Verarbeitung personenbezogener Daten.",
      "Verantwortlicher Anbieter ist die Pferdeklinik Beispiel. Telefon: 05266 94940. E-Mail: datenschutz@example.test. Datenschutzbeauftragte/r beim Anbieter ist Dr. Beispiel.",
      "II. Rechte der Nutzer und Betroffenen. Nutzer und Betroffene haben das Recht auf Bestätigung, auf Auskunft über die verarbeiteten Daten, auf Berichtigung, Löschung, Einschränkung der Verarbeitung und Übermittlung der Daten.",
      "Sie haben das Recht auf Beschwerde gegenüber der Aufsichtsbehörde gemäß Art. 77 DSGVO.",
      "Serverdaten werden an uns beziehungsweise an unseren Webspace-Provider übermittelt. Diese Speicherung erfolgt auf der Rechtsgrundlage von Art. 6 Abs. 1 lit. f DSGVO.",
      "Unser berechtigtes Interesse liegt in der Verbesserung, Stabilität, Funktionalität und Sicherheit des Internetauftritts.",
      "Alle Empfänger, denen gegenüber Daten offengelegt wurden, werden über Berichtigung oder Löschung von Daten unterrichtet.",
    ].join(" "),
  });
  const topics = new Set(classification.matches.map((match) => match.topic));

  for (const topic of [
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "supervisory_authority",
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(topics.has(topic), true, topic);
  }
  assert.equal(topics.has("international_transfers"), false);
  assert.equal(topics.has("automated_decision_making_or_profiling"), false);
  assert.equal(
    classification.matches.every((match) =>
      match.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
      match.matchedLocale === "de" &&
      match.evidenceExcerpt.length <= 360
    ),
    true,
  );
});

test("SITS-shaped broad English variants remain unknown in operational copy", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: [
      "Analytics operations handbook.",
      "What do we use your data for? We use warehouse telemetry to schedule maintenance.",
      "Recipient of the data: the next queue consumer.",
      "The data is stored for as long as its processing is necessary for troubleshooting.",
    ].join(" "),
  });

  assert.deepEqual(classification.matches, []);
});

test("Article 4 controller heading alone does not establish controller contact", () => {
  const classification = classifyGdprTransparencyTopics({
    localeHints: ["en"],
    text: "Privacy Policy. Information on the controller pursuant to Art. 4 No. 7 GDPR. See the applicable notice for details.",
  });

  assert.equal(
    classification.matches.some((match) => match.topic === "controller_contact"),
    false,
  );
});

test("canonical semantic clauses recover retained EU-IR topic evidence without generic personalization", () => {
  const cases = [
    ["automated_decision_making_or_profiling", "We do not carry out automated decision-making using personal information which produces legal effects or otherwise significantly affects individuals."],
    ["international_transfers", "Personal data may be transferred to and processed in the United States or other countries using Standard Contractual Clauses and appropriate safeguards."],
    ["legal_basis", "We process your personal data to perform our contract, comply with legal obligations, or pursue our legitimate interests."],
    ["data_retention", "Account information is retained for five years after account closure to resolve disputes and comply with legal obligations."],
    ["recipients_or_vendor_categories", "We share personal information with payment processors, hosting providers, and professional advisers that support the service."],
    ["processing_purposes", "We use personal data to provide the service, process payments, prevent fraud, and respond to support requests."],
  ] as const;

  for (const [topic, text] of cases) {
    const match = classifyGdprTransparencyTopics({ text }).matches.find((row) => row.topic === topic);
    assert.equal(match?.matchStrength, "equivalent", topic);
    assert.equal(match?.reasonCodes.includes("variant_semantic_clause"), true, topic);
  }

  assert.equal(classifyGdprTransparencyTopics({
    text: "We personalize the homepage and recommend popular articles based on the current page.",
  }).matches.some((row) => row.topic === "automated_decision_making_or_profiling"), false);
  assert.equal(classifyGdprTransparencyTopics({
    text: "We may share information with undefined third parties.",
  }).matches.some((row) => row.topic === "recipients_or_vendor_categories"), false);
});

test("retained automated-decision misses classify across explicit negative and passive profiling forms", () => {
  const disclosures = [
    "Automated decision-making and profiling. This fixture does not use solely automated decision-making or profiling that produces legal effects or similarly significant effects for an individual.",
    "The personal data collected via the Website is subject to automatic processing through profiling if the data subject has consented to such processing. As a result of profiling, a profile is built.",
    "You may opt out from processing of your Personal Information for profiling in furtherance of decisions that produce legal or similarly significant effects. We do not conduct such processing activities.",
  ];

  for (const text of disclosures) {
    const match = classifyGdprTransparencyTopics({ text }).matches.find(
      (row) => row.topic === "automated_decision_making_or_profiling",
    );
    assert.ok(match, text);
    assert.equal(match.reasonCodes.includes("variant_semantic_clause"), true, text);
  }

  for (const text of [
    "This website does not use automated deployment decisions that affect build availability.",
    "This service uses automated scanner classification only to evaluate synthetic website signals.",
    "We personalize the homepage and recommend popular articles based on the current page.",
  ]) {
    assert.equal(
      classifyGdprTransparencyTopics({ text }).matches.some(
        (row) => row.topic === "automated_decision_making_or_profiling",
      ),
      false,
      text,
    );
  }
});

test("section-aware classification binds verified headings to substantive bodies", () => {
  const cases = [
    ["processing_purposes", "How we use the information we collect", "We operate the service, answer support requests, prevent fraud, and improve account security."],
    ["legal_basis", "Purposes and legal bases", "Account delivery depends on our contract; fraud prevention relies on legitimate interests; tax records satisfy legal obligations."],
    ["recipients_or_vendor_categories", "Sharing and recipients", "Payment processors, hosting providers, analytics partners, and professional advisers support delivery of the service."],
    ["data_retention", "How long we retain your data", "Call recordings are kept for two months, while account records are retained until account closure."],
    ["automated_decision_making_or_profiling", "Automated decision-making and profiling", "We do not perform profiling or make decisions that produce legal effects for an individual."],
  ] as const;

  for (const [topic, heading, body] of cases) {
    const match = classifyGdprTransparencyTopics({
      section: { body, heading },
    }).matches.find((row) => row.topic === topic);
    assert.ok(match, topic);
    assert.equal(match.reasonCodes.includes(`matched_${topic}`), true, topic);
    assert.match(match.evidenceExcerpt, new RegExp(heading.split(" ")[0] ?? "", "i"));
  }

  assert.equal(classifyGdprTransparencyTopics({
    section: {
      heading: "Automated tools",
      body: "A scanner classifies synthetic website signals for internal test reporting.",
    },
  }).matches.some((row) => row.topic === "automated_decision_making_or_profiling"), false);
  assert.equal(classifyGdprTransparencyTopics({
    section: {
      heading: "Sharing",
      body: "Information may be shared with undefined third parties.",
    },
  }).matches.some((row) => row.topic === "recipients_or_vendor_categories"), false);
});

test("canonical retained miss variants cover transfer and contact wording across locales", () => {
  const cases = [
    ["international_transfers", "fr", "En cas d’absence de décision d’adéquation, les transferts sont encadrés par des clauses contractuelles types pour protéger les Données Personnelles."],
    ["international_transfers", "de", "Übermittlungen an ein Drittland erfolgen mit geeigneten Garantien und einer Zertifizierung zum Data Privacy Framework für personenbezogene Daten."],
    ["international_transfers", "ru", "Передача персональных данных осуществляется на основании решения Европейской комиссии об адекватности или стандартных договорных условий."],
    ["recipients_or_vendor_categories", "nl", "Persoonsgegevens worden verstrekt aan externe beheerders van software platformen en betalingssystemen die onze diensten ondersteunen."],
    ["dpo_contact", "zh", "本公司個人資料保護員資訊如下：電子信箱 DPO@example.tw。"],
  ] as const;

  for (const [topic, locale, text] of cases) {
    const match = classifyGdprTransparencyTopics({
      localeHints: [locale],
      text,
    }).matches.find((row) => row.topic === topic);
    assert.ok(match, `${locale}:${topic}`);
  }
});

test("canonical multilingual transfer clauses recover retained safeguard wording", () => {
  const cases = [
    ["en", "Whenever we transfer your personal data outside the EEA, we use Standard Contractual Clauses issued by the European Commission."],
    ["es", "Los datos personales se transfieren con cláusulas tipo de la Comisión Europea para mantener las garantías adecuadas."],
    ["de", "Für personenbezogene Daten ist der Anbieter unter dem Privacy Shield zertifiziert und verpflichtet sich zur Einhaltung europäischer Datenschutzstandards."],
    ["pl", "Przekazywanie danych osobowych poza EOG odbywa się przy zastosowaniu standardowych klauzul umownych wydanych przez Komisję Europejską."],
    ["ro", "Datele cu caracter personal pot fi transferate în state din afara Spațiului Economic European pe baza unor Clauze Contractuale Standard."],
  ] as const;

  for (const [locale, text] of cases) {
    const match = classifyGdprTransparencyTopics({
      localeHints: [locale],
      text,
    }).matches.find((row) => row.topic === "international_transfers");
    assert.ok(match, `${locale}: ${text}`);
  }

  for (const text of [
    "The legal team reviews standard contractual clauses issued by the European Commission for procurement templates.",
    "International transfer of data between internal build systems is described in the engineering runbook.",
    "Das Unternehmen ist für seinen internationalen Handel nach einer allgemeinen Qualitätsnorm zertifiziert.",
  ]) {
    assert.equal(
      classifyGdprTransparencyTopics({ text }).matches.some(
        (row) => row.topic === "international_transfers",
      ),
      false,
      text,
    );
  }
});

test("classifies retained German clinic purpose, contract, recipient, and US-transfer clauses", () => {
  const text = [
    "Datenschutzerklärung.",
    "Wir verarbeiten jene Daten, die Sie uns als Kunde zur Durchführung vorvertraglicher Maßnahmen und bei Abschluss des Vertrages zur Verfügung stellen.",
    "Die Datenverarbeitung erfolgt zu folgenden Zwecken: Im Rahmen unserer Geschäftsbeziehung werden die von Ihnen angegebenen Daten verarbeitet, um vorvertragliche Maßnahmen durchzuführen und Verträge abzuwickeln.",
    "Auf unseren Seiten sind Plugins eines sozialen Netzwerks mit Sitz in Palo Alto, CA 94304, USA integriert.",
    "Wenn Sie unsere Seiten besuchen, wird über das Plugin eine direkte Verbindung zwischen Ihrem Browser und dem Server des sozialen Netzwerks hergestellt.",
    "Das soziale Netzwerk erhält dadurch die Information, dass Sie mit Ihrer IP-Adresse unsere Seite besucht haben.",
  ].join(" ");
  const matches = classifyGdprTransparencyTopics({ localeHints: ["de"], text }).matches;
  const topics = new Set(matches.map((match) => match.topic));

  for (const topic of [
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "international_transfers",
  ] satisfies GdprTransparencyTopic[]) {
    assert.equal(topics.has(topic), true, topic);
    const match = matches.find((candidate) => candidate.topic === topic);
    assert.equal(match?.matchStrength, "equivalent", topic);
    assert.equal(match?.reasonCodes.includes("variant_semantic_clause"), true, topic);
  }
});

test("recovers natural Article 13 clauses across calibrated European languages", () => {
  const cases = [
    ["fr", "Politique de confidentialité. Nous traitons vos données personnelles pour fournir le service. Le traitement est nécessaire à l’exécution du contrat. Un prestataire reçoit vos données personnelles. Le transfert des données personnelles vers les États-Unis est encadré par des garanties."],
    ["es", "Política de privacidad. Tratamos sus datos personales para prestar el servicio. El tratamiento es necesario para la ejecución del contrato. Un proveedor recibe sus datos personales. La transferencia de datos personales a Estados Unidos utiliza garantías adecuadas."],
    ["it", "Informativa sulla privacy. Trattiamo i suoi dati personali per fornire il servizio. Il trattamento è necessario per l’esecuzione del contratto. Un fornitore riceve i dati personali. Il trasferimento dei dati personali negli Stati Uniti usa garanzie adeguate."],
    ["nl", "Privacyverklaring. Wij verwerken uw persoonsgegevens om de dienst te leveren. De verwerking is nodig voor de uitvoering van de overeenkomst. Een dienstverlener ontvangt uw persoonsgegevens. De overdracht van persoonsgegevens naar de Verenigde Staten gebruikt passende waarborgen."],
    ["pl", "Polityka prywatności. Przetwarzamy dane osobowe w celu świadczenia usługi. Przetwarzanie jest niezbędne do wykonania umowy. Usługodawca otrzymuje dane osobowe. Przekazywanie danych osobowych do Stanów Zjednoczonych odbywa się z odpowiednimi zabezpieczeniami."],
    ["pt", "Política de privacidade. Tratamos os seus dados pessoais para prestar o serviço. O tratamento é necessário para a execução do contrato. Um prestador de serviços recebe dados pessoais. A transferência de dados pessoais para os Estados Unidos utiliza garantias adequadas."],
  ] as const;

  for (const [locale, text] of cases) {
    const topics = new Set(classifyGdprTransparencyTopics({
      localeHints: [locale],
      text,
    }).matches.map((match) => match.topic));
    for (const topic of [
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "international_transfers",
    ] satisfies GdprTransparencyTopic[]) {
      assert.equal(topics.has(topic), true, `${locale}:${topic}; got ${[...topics].join(", ")}`);
    }
  }
});

test("natural-clause expansion does not promote operational contract, vendor, or hosting copy", () => {
  const cases = [
    ["de", "Der Vertrag mit dem Lieferanten wurde in den USA unterzeichnet. Der Server verarbeitet nur synthetische Testdaten."],
    ["fr", "Le prestataire exécute le contrat de maintenance du serveur aux États-Unis."],
    ["es", "El proveedor ejecuta el contrato de mantenimiento del servidor en Estados Unidos."],
    ["it", "Il fornitore esegue il contratto di manutenzione del server negli Stati Uniti."],
    ["nl", "De dienstverlener voert de onderhoudsovereenkomst voor de server in de Verenigde Staten uit."],
    ["pl", "Usługodawca wykonuje umowę dotyczącą utrzymania serwera w Stanach Zjednoczonych."],
    ["pt", "O prestador executa o contrato de manutenção do servidor nos Estados Unidos."],
  ] as const;

  for (const [locale, text] of cases) {
    assert.deepEqual(classifyGdprTransparencyTopics({ localeHints: [locale], text }).matches, [], locale);
  }
});

test("canonical evidence excerpts retain complete bounded sentence edges", () => {
  const text = `${"Background context without a topic. ".repeat(7)}Data controller. Example Services Ltd acts as the data controller. Contact us at privacy@example.test for privacy questions. A final unrelated sentence follows.`;
  const match = classifyGdprTransparencyTopics({ text }).matches.find((row) => row.topic === "controller_contact");
  assert.ok(match);
  assert.ok(match.evidenceExcerpt.length <= 360);
  assert.doesNotMatch(match.evidenceExcerpt, /^ground\b/i);
  assert.match(match.evidenceExcerpt, /acts as the data controller\./);
  assert.match(match.evidenceExcerpt, /privacy@example\.test/);
});
