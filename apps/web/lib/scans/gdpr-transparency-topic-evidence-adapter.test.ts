import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyGdprTransparencyTopics,
  type PolicySurfaceObservation,
} from "@certscore/contracts";

import {
  GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  getGdprTransparencyProductionEvidenceProfileFromEnv,
  normalizeGdprTransparencyProductionEvidenceProfile,
} from "./gdpr-transparency-production-profile";
import {
  adaptGdprTransparencyTopicCandidatesForProduction,
} from "./gdpr-transparency-topic-evidence-adapter";

type Candidate = PolicySurfaceObservation["gdprTransparencyTopicCandidates"][number];
type Topic = Candidate["topic"];
type Locale = Candidate["matchedLocale"];

function candidate(input: Partial<Candidate> & Pick<Candidate, "topic" | "evidenceText" | "matchedLocale" | "matchedTerm">): Candidate {
  return {
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${input.topic}`],
    confidence: 0.91,
    matchStrength: "direct",
    productionCredit: false,
    status: "diagnostic_only",
    ...input,
  };
}

function surface(candidates: Candidate[], input: Partial<Pick<
  PolicySurfaceObservation,
  | "article13DisclosureSignals"
  | "normalizedUrl"
  | "status"
  | "surfaceType"
  | "textExcerpt"
  | "url"
>> = {}) {
  return {
    article13DisclosureSignals: [],
    gdprTransparencyTopicCandidates: candidates,
    normalizedUrl: "https://example.test/privacy",
    status: "fetched" as const,
    surfaceType: "privacy_policy" as const,
    textExcerpt:
      "This privacy policy explains how we process personal data, the legal basis for processing, retention, rights, transfers, and contact details.",
    url: "https://example.test/privacy",
    ...input,
  };
}

test("GDPR Transparency production evidence profile uses multilingual Article 13 evidence by default", () => {
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(undefined),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(""),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile("multilingual_v1"),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(normalizeGdprTransparencyProductionEvidenceProfile("legacy_only"), "legacy_only");
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({}),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({
      CERTSCORE_GDPR_TRANSPARENCY_EVIDENCE_PROFILE: "legacy_only",
    }),
    "legacy_only",
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({
      CERTSCORE_GDPR_TRANSPARENCY_EVIDENCE_PROFILE: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    }),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
});

test("legacy_only accepts no production signals from GDPR Transparency topic candidates", () => {
  const diagnosticCandidate = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    profile: "legacy_only",
    surface: surface([diagnosticCandidate]),
  });

  assert.equal(result.productionEvidenceEnabled, false);
  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.equal(result.dispositions.length, 1);
  assert.equal(result.dispositions[0]?.disposition, "diagnostic_only");
  assert.equal(result.dispositions[0]?.productionCredit, false);
  assert.equal(diagnosticCandidate.productionCredit, false);
});

test("compact purpose and service-provider candidates pass the production evidence adapter", () => {
  const candidates = [
    candidate({
      confidence: 0.82,
      evidenceText:
        "We use this information to understand site usage, verify changes, and diagnose usability issues.",
      matchStrength: "equivalent",
      matchedLocale: "en",
      matchedTerm: "we use this information to",
      topic: "processing_purposes"
    }),
    candidate({
      confidence: 0.82,
      evidenceText:
        "Our hosting and content-delivery service providers may process ordinary request information to deliver and protect the site.",
      matchStrength: "equivalent",
      matchedLocale: "en",
      matchedTerm: "service providers may process",
      topic: "recipients_or_vendor_categories"
    })
  ];
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates)
  });

  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.disclosureType).sort(),
    ["processing_purposes", "recipients_or_vendor_categories"]
  );
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
});

test("onward-recipient and negative-profiling disclosures pass the canonical production adapter", () => {
  const text = [
    "When you order images, we pass on your data to the shipping provider so it can deliver the order.",
    "We do not use your data for profiling for advertising or eligibility decisions.",
  ].join(" ");
  const classified = classifyGdprTransparencyTopics({ text, localeHints: ["en"] });
  const candidates = classified.matches.map((match) => candidate({
    classifierReasonCodes: match.reasonCodes,
    confidence: match.confidence,
    evidenceText: match.evidenceExcerpt,
    matchStrength: match.matchStrength,
    matchedLocale: match.matchedLocale,
    matchedTerm: match.matchedTerm,
    topic: match.topic,
  }));
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, { textExcerpt: text }),
  });

  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.disclosureType).sort(),
    ["automated_decision_making_or_profiling", "recipients_or_vendor_categories"],
    JSON.stringify(result.dispositions),
  );
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
});

test("privacy-context contact channel candidates do not credit controller or DPO without a bound role", () => {
  const text = [
    "Privacy Policy.",
    "Contact. If you email us, we receive the information you choose to include and use it to respond to your message.",
    "You can contact us at ergoveritas1@gmail.com."
  ].join(" ");
  const candidates = [
    candidate({
      classifierReasonCodes: ["matched_controller_contact", "variant_requires_topic_context"],
      evidenceText: text,
      matchStrength: "equivalent",
      matchedLocale: "en",
      matchedTerm: "you can contact us at",
      topic: "controller_contact"
    }),
    candidate({
      classifierReasonCodes: ["matched_dpo_contact", "variant_requires_privacy_context"],
      evidenceText: text,
      matchStrength: "equivalent",
      matchedLocale: "en",
      matchedTerm: "you can contact us at",
      topic: "dpo_contact"
    })
  ];
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, { textExcerpt: text })
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(
    result.dispositions.find((item) => item.candidate.topic === "controller_contact")?.rejectReason,
    "candidate_topic_invariants_failed",
  );
  assert.equal(
    result.dispositions.find((item) => item.candidate.topic === "dpo_contact")?.rejectReason,
    "insufficient_row_specific_terms",
  );
});

test("full-document privacy context remains valid when a multilingual row excerpt retains its canonical matched term", () => {
  const examples = [
    {
      locale: "hu" as const,
      text: [
        "Adatvédelmi tájékoztató.",
        "Adataidat tájékoztatási célból használjuk.",
        "Az adatokat a megőrzési idő lejárta után töröljük."
      ].join(" ")
    },
    {
      locale: "ru" as const,
      text: [
        "Политика конфиденциальности.",
        "Цели обработки данных включают предоставление и защиту сервиса.",
        "Пользователь может отозвать согласие на их обработку."
      ].join(" ")
    },
    {
      locale: "et" as const,
      text: [
        "Privaatsuspoliitika.",
        "Isikuandmeid töötleme teenuse osutamise eesmärgil.",
        "Andmed kustutatakse automaatselt 3 kuu pärast."
      ].join(" ")
    }
  ];

  for (const example of examples) {
    const candidates = classifyGdprTransparencyTopics({
      localeHints: [example.locale],
      text: example.text
    }).matches.map((match) => candidate({
      classifierReasonCodes: match.reasonCodes,
      confidence: match.confidence,
      evidenceText: match.evidenceExcerpt,
      matchStrength: match.matchStrength,
      matchedLocale: match.matchedLocale,
      matchedTerm: match.matchedTerm,
      topic: match.topic
    }));
    const contextBoundCandidates = candidates.filter((item) =>
      item.classifierReasonCodes.includes("variant_requires_privacy_context")
    );
    assert.equal(contextBoundCandidates.length > 0, true, example.locale);

    const result = adaptGdprTransparencyTopicCandidatesForProduction({
      policyTextQuality: { usable: true },
      profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
      surface: surface(contextBoundCandidates, { textExcerpt: example.text })
    });

    assert.equal(
      result.acceptedProductionSignals.length,
      contextBoundCandidates.length,
      example.locale
    );
    assert.deepEqual(result.discardedArticle13DisclosureSignals, [], example.locale);
  }
});

test("privacy-context provenance cannot rescue a row excerpt that omits its matched term", () => {
  const forged = candidate({
    classifierReasonCodes: ["matched_processing_purposes", "variant_requires_privacy_context"],
    evidenceText: "Политика конфиденциальности без сведений о конкретной цели.",
    matchStrength: "equivalent",
    matchedLocale: "ru",
    matchedTerm: "цели обработки данных",
    topic: "processing_purposes"
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([forged])
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions[0]?.rejectReason, "insufficient_row_specific_terms");
});

test("topic-context variants preserve retained evidence through production adapter eligibility", () => {
  const text = [
    "Privacy notice describing how personal data is processed.",
    "Controller and contact. Example Publisher Ltd. is the controller. Contact privacy@example.test or the data protection officer at dpo@example.test.",
    "Purposes and legal-basis language. The service processes account data to provide a requested service under a contract and uses security logs for a stated legitimate-interest purpose.",
    "Recipients. Named vendors include Example Hosting Ltd. and Example Analytics Ltd.; professional advisers may receive data when necessary.",
    "Retention. Account records are retained for 24 months after closure.",
    "International transfers. Transfers outside the EEA use standard contractual clauses and supplementary safeguards.",
    "Individuals may request access, correction, deletion, restriction, portability, or objection, and may complain to the Irish Data Protection Commission.",
    "The service does not make decisions producing legal effects solely by automated means.",
  ].join(" ");
  const candidates = classifyGdprTransparencyTopics({ localeHints: ["en"], text }).matches
    .map((match) => candidate({
      classifierReasonCodes: match.reasonCodes,
      confidence: match.confidence,
      evidenceText: match.evidenceExcerpt,
      matchStrength: match.matchStrength,
      matchedLocale: match.matchedLocale,
      matchedTerm: match.matchedTerm,
      topic: match.topic,
    }));

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, { textExcerpt: text }),
  });

  assert.equal(candidates.length, 10);
  assert.equal(result.acceptedProductionSignals.length, 10);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
});

test("substantive corporate policy observations traverse the canonical production adapter", () => {
  const text = [
    "Privacy Policy.",
    "This Privacy Policy contains: What Information Do We Collect? How Do We Use the Information We Collect? Who Do We Disclose Your Information To? International Transfers.",
    "How Do We Use the Information We Collect? We use this Information to provide, secure, personalize, and improve our services.",
    "Retention. We only keep Information for as long as we need it to fulfil the purpose we are using it for, as permitted by law.",
    "Who Do We Disclose Your Information To? We disclose Information to service providers that host, deliver, secure, and analyze our services.",
    "Individual Rights. You have the Right to access and rectification, erasure, restriction, portability, and objection.",
    "You may object to processing of your Information on the basis of our legitimate interests.",
    "International Transfers. Your Information may be transferred to, and processed in, the United States with appropriate safeguards.",
    "If you have questions about this Privacy Policy, contact us and our Data Protection Officer at privacy@example.test.",
    "You may lodge a complaint before the supervisory authority for data protection in your country.",
  ].join(" ");
  const candidates = classifyGdprTransparencyTopics({ localeHints: ["en"], text }).matches
    .map((match) => candidate({
      classifierReasonCodes: match.reasonCodes,
      confidence: match.confidence,
      evidenceText: match.evidenceExcerpt,
      matchStrength: match.matchStrength,
      matchedLocale: match.matchedLocale,
      matchedTerm: match.matchedTerm,
      topic: match.topic,
    }));

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, { textExcerpt: text }),
  });

  assert.deepEqual(
    new Set(result.acceptedProductionSignals.map((signal) => signal.disclosureType)),
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
    ]),
  );
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.equal(result.dispositions.every((item) => item.disposition === "accepted"), true);
  assert.match(
    result.acceptedProductionSignals.find((signal) =>
      signal.disclosureType === "processing_purposes"
    )?.evidenceText ?? "",
    /provide, secure, personalize, and improve/i,
  );
  assert.match(
    result.acceptedProductionSignals.find((signal) =>
      signal.disclosureType === "recipients_or_vendor_categories"
    )?.evidenceText ?? "",
    /service providers that host, deliver, secure, and analyze/i,
  );
});

test("explicit GDPR Transparency profile accepts strong direct multilingual candidates from usable privacy-policy surfaces", () => {
  const examples: Array<{ locale: Locale; matchedTerm: string; text: string }> = [
    {
      locale: "en",
      matchedTerm: "legal basis",
      text: "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    },
    {
      locale: "de",
      matchedTerm: "Rechtsgrundlage",
      text: "Die Rechtsgrundlage für die Verarbeitung personenbezogene Daten umfasst Einwilligung, Vertrag und berechtigte Interessen.",
    },
    {
      locale: "fr",
      matchedTerm: "base légale",
      text: "La base légale du traitement des données personnelles comprend le consentement, le contrat et nos intérêts légitimes.",
    },
    {
      locale: "es",
      matchedTerm: "base jurídica",
      text: "La base jurídica del tratamiento de datos personales incluye el consentimiento, el contrato y los intereses legítimos.",
    },
    {
      locale: "it",
      matchedTerm: "base giuridica",
      text: "La base giuridica del trattamento dei dati personali include consenso, contratto e interessi legittimi.",
    },
    {
      locale: "nl",
      matchedTerm: "grondslag",
      text: "De grondslag voor de verwerking van persoonsgegevens omvat toestemming, overeenkomst en gerechtvaardigde belangen.",
    },
    {
      locale: "pl",
      matchedTerm: "podstawa prawna",
      text: "Podstawa prawna przetwarzania dane osobowe obejmuje zgodę, umowę oraz uzasadniony interes.",
    },
    {
      locale: "pt",
      matchedTerm: "base legal",
      text: "A base legal para o tratamento de dados pessoais inclui consentimento, contrato e legítimo interesse.",
    },
    {
      locale: "ru",
      matchedTerm: "правовые основания обработки персональных данных",
      text: "Правовые основания обработки персональных данных включают согласие, исполнение договора и законный интерес.",
    },
    {
      locale: "ja",
      matchedTerm: "個人データ処理の法的根拠",
      text: "本ポリシーでは、個人データ処理の法的根拠として同意、契約の履行および正当な利益を説明します。",
    },
    {
      locale: "zh",
      matchedTerm: "处理个人数据的法律依据",
      text: "本隐私政策说明处理个人数据的法律依据，包括同意、履行合同以及合法利益。",
    },
    {
      locale: "ar",
      matchedTerm: "الأساس القانوني لمعالجة البيانات الشخصية",
      text: "يشمل الأساس القانوني لمعالجة البيانات الشخصية الموافقة وتنفيذ العقد والمصلحة المشروعة.",
    },
    {
      locale: "sv",
      matchedTerm: "rättslig grund för behandling av personuppgifter",
      text: "Rättslig grund för behandling av personuppgifter omfattar samtycke, avtal och berättigat intresse.",
    },
  ];
  const candidates = examples.map((example) =>
    candidate({
      evidenceText: example.text,
      matchedLocale: example.locale,
      matchedTerm: example.matchedTerm,
      topic: "legal_basis",
    })
  );

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates),
  });

  assert.equal(result.productionEvidenceEnabled, true);
  assert.equal(result.acceptedProductionSignals.length, examples.length);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.matchedLocale),
    examples.map((example) => example.locale),
  );
  for (const signal of result.acceptedProductionSignals) {
    assert.equal(signal.productionCredit, true);
    assert.equal(signal.productionCreditProfile, GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE);
    assert.equal(signal.sourceCandidateProductionCredit, false);
    assert.equal(signal.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.equal(signal.selectedEvidenceStrength, "strong");
    assert.equal(signal.source, "deterministic");
    assert.equal(signal.evidenceText.length <= 640, true);
  }
  assert.equal(candidates.every((item) => item.productionCredit === false), true);
});

test("Wave 1-3 native classifier variants survive the canonical production adapter", () => {
  const examples: Array<{ locale: Locale; text: string }> = [
    { locale: "de", text: "Datenschutzerklärung. Die Datenverarbeitung erfolgt auf Grundlage von Art. 6. Sie haben das Recht auf Datenübertragbarkeit und das Recht auf Einschränkung der Verarbeitung." },
    { locale: "ru", text: "Политика конфиденциальности. Обработка данных осуществляется на основании статьи 6. Вы имеете право на переносимость данных и право на ограничение обработки." },
    { locale: "pt", text: "Política de privacidade. O tratamento de dados baseia-se no artigo 6. Tem direito à portabilidade dos dados e direito à limitação do tratamento." },
    { locale: "es", text: "Política de privacidad. El tratamiento de datos se basa en el artículo 6. Tiene derecho a la portabilidad de los datos y derecho a la limitación del tratamiento." },
    { locale: "fr", text: "Politique de confidentialité. Le traitement des données est fondé sur l'article 6. Vous disposez du droit à la portabilité des données et du droit à la limitation du traitement." },
    { locale: "it", text: "Informativa sulla privacy. Il trattamento dei dati si basa sull'articolo 6. Ha diritto alla portabilità dei dati e diritto alla limitazione del trattamento." },
    { locale: "nl", text: "Privacybeleid. De gegevensverwerking is gebaseerd op artikel 6. U heeft recht op overdraagbaarheid van gegevens en recht op beperking van de verwerking." },
    { locale: "pl", text: "Polityka prywatności. Przetwarzanie danych odbywa się na podstawie art. 6. Masz prawo do przenoszenia danych i prawo do ograniczenia przetwarzania." },
    { locale: "ja", text: "プライバシーポリシー。GDPR第6条に基づく個人データ処理。データポータビリティの権利および個人データの処理を制限する権利があります。" },
    { locale: "zh", text: "隐私政策。根据GDPR第6条处理个人数据。您享有数据可携权以及限制处理个人数据的权利。" },
    { locale: "ar", text: "سياسة الخصوصية. تستند معالجة البيانات إلى المادة 6. لك الحق في نقل البيانات والحق في تقييد المعالجة." },
    { locale: "tr", text: "Gizlilik politikası. Veri işleme GDPR Madde 6 uyarınca gerçekleştirilir. Veri taşınabilirliği hakkı ve işlemenin kısıtlanmasını talep etme hakkı vardır." },
  ];

  for (const example of examples) {
    const candidates = classifyGdprTransparencyTopics({
      localeHints: [example.locale],
      text: example.text,
    }).matches.map((match) => candidate({
      classifierReasonCodes: match.reasonCodes,
      confidence: match.confidence,
      evidenceText: match.evidenceExcerpt,
      matchStrength: match.matchStrength,
      matchedLocale: match.matchedLocale,
      matchedTerm: match.matchedTerm,
      topic: match.topic,
    }));
    const result = adaptGdprTransparencyTopicCandidatesForProduction({
      isTargetRelevantPrivacyPolicy: true,
      policyTextQuality: { usable: true },
      profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
      surface: surface(candidates, { textExcerpt: example.text }),
    });

    assert.deepEqual(
      new Set(result.acceptedProductionSignals.map((signal) => signal.disclosureType)),
      new Set(["legal_basis", "data_subject_rights"]),
      `${example.locale}: ${JSON.stringify(result.dispositions)}`,
    );
    assert.deepEqual(result.discardedArticle13DisclosureSignals, [], example.locale);
  }
});

test("weak and contextual GDPR Transparency candidates are not production-credit evidence", () => {
  const weak = candidate({
    confidence: 0.93,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchStrength: "weak",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const contextual = candidate({
    confidence: 0.92,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchStrength: "contextual",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const lowConfidence = candidate({
    confidence: 0.79,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([weak, contextual, lowConfidence]),
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions.every((item) => item.productionCredit === false), true);
  assert.deepEqual(
    result.dispositions.map((item) => item.rejectReason),
    [
      "candidate_strength_not_creditworthy",
      "candidate_strength_not_creditworthy",
      "candidate_strength_not_creditworthy",
    ],
  );
});

test("TOC, navigation, and non-policy candidates are rejected or diagnostic, not creditworthy", () => {
  const toc = candidate({
    evidenceText:
      "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const navigation = candidate({
    evidenceText:
      "Skip to main content Privacy Policy Overview Terms of Service Technologies FAQ Privacy Terms Search Menu",
    matchedLocale: "en",
    matchedTerm: "controller",
    topic: "controller_contact",
  });
  const nonPolicy = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const tocResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([toc]),
  });
  const navigationResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([navigation]),
  });
  const nonPolicyResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([nonPolicy], { surfaceType: "terms" }),
  });

  assert.deepEqual(tocResult.acceptedProductionSignals, []);
  assert.deepEqual(navigationResult.acceptedProductionSignals, []);
  assert.deepEqual(nonPolicyResult.acceptedProductionSignals, []);
  assert.equal(tocResult.dispositions[0]?.rejectReason, "table_of_contents_only");
  assert.equal(navigationResult.dispositions[0]?.rejectReason, "page_chrome_or_navigation");
  assert.equal(nonPolicyResult.dispositions[0]?.rejectReason, "non_privacy_policy_surface");
  assert.equal(tocResult.discardedArticle13DisclosureSignals[0]?.productionCredit, false);
  assert.equal(navigationResult.discardedArticle13DisclosureSignals[0]?.productionCredit, false);
});

test("candidate-only diagnostic evidence creates production credit by default when adapter gates pass", () => {
  const diagnosticOnly = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    surface: surface([diagnosticOnly]),
  });

  assert.equal(result.profile, GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE);
  assert.equal(result.productionEvidenceEnabled, true);
  assert.equal(result.acceptedProductionSignals.length, 1);
  assert.equal(result.discardedArticle13DisclosureSignals.length, 0);
  assert.equal(result.dispositions[0]?.disposition, "accepted");
  assert.equal(result.dispositions[0]?.productionCredit, false);
  assert.equal(diagnosticOnly.productionCredit, false);
});

test("productionCredit true appears only on adapter-accepted evidence and never mutates source candidates", () => {
  const sourceCandidate = candidate({
    evidenceText:
      "The controller and privacy contact for personal data processing is Example Ltd, reachable at privacy@example.test.",
    matchedLocale: "en",
    matchedTerm: "controller",
    topic: "controller_contact",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([sourceCandidate]),
  });

  assert.equal(result.acceptedProductionSignals.length, 1);
  assert.equal(result.acceptedProductionSignals[0]?.productionCredit, true);
  assert.equal(result.acceptedProductionSignals[0]?.sourceCandidateProductionCredit, false);
  assert.equal(sourceCandidate.productionCredit, false);
  assert.equal(result.dispositions[0]?.candidate.productionCredit, false);
  assert.equal(result.dispositions[0]?.productionCredit, false);
});

test("production adapter rejects calibrated English false-positive topic evidence", () => {
  const candidates = [
    candidate({
      evidenceText: "Data controller means a natural or legal person that determines the purposes and means of processing personal data.",
      matchedLocale: "en",
      matchedTerm: "data controller",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "If you no longer wish to receive marketing communications, you can contact us at marketing@example.test.",
      matchedLocale: "en",
      matchedTerm: "you can contact us at",
      matchStrength: "equivalent",
      classifierReasonCodes: ["matched_dpo_contact", "variant_requires_privacy_context"],
      topic: "dpo_contact",
    }),
    candidate({
      evidenceText: "Questions about this privacy policy can be submitted through our general contact form.",
      matchedLocale: "en",
      matchedTerm: "questions about this privacy policy",
      matchStrength: "equivalent",
      classifierReasonCodes: ["matched_controller_contact", "variant_requires_topic_context"],
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "Depending on your location, applicable privacy law may mean you have certain rights regarding personal information.",
      matchedLocale: "en",
      matchedTerm: "rights of data subject",
      topic: "data_subject_rights",
    }),
    candidate({
      evidenceText: "Personal data means any information relating to a person and processing means any operation performed on that information.",
      matchedLocale: "en",
      matchedTerm: "purposes of processing personal data",
      topic: "processing_purposes",
    }),
    candidate({
      evidenceText: "We never sell user-provided data for financial gain and take responsibility for protecting it.",
      matchedLocale: "en",
      matchedTerm: "third parties with whom we share personal data",
      topic: "recipients_or_vendor_categories",
    }),
    candidate({
      evidenceText: "You can alter browser settings to erase cookies or preserve your language preferences between visits.",
      matchedLocale: "en",
      matchedTerm: "retention period for personal data",
      topic: "data_retention",
    }),
    candidate({
      evidenceText: "We operate services and servers around the world, but this notice does not describe a transfer of personal data.",
      matchedLocale: "en",
      matchedTerm: "international transfers of personal data",
      topic: "international_transfers",
    }),
  ];

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates),
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions.every((item) => item.productionCredit === false), true);
});

test("production adapter rejects calibrated multilingual role, definition, and cross-topic evidence", () => {
  const candidates = [
    candidate({
      evidenceText: "Оператор персональных данных – государственный орган, муниципальный орган, юридическое или физическое лицо, определяющее цели обработки персональных данных.",
      matchedLocale: "ru",
      matchedTerm: "оператор персональных данных",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "Оператор персональных данных: вправе отстаивать свои интересы в суде; обязан предоставлять персональные данные третьим лицам в предусмотренных законом случаях.",
      matchedLocale: "ru",
      matchedTerm: "оператор персональных данных",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "Le Client porteur du projet, ou à défaut l'Etablissement scolaire, est Responsable du traitement pour les données insérées sur la Plateforme.",
      matchedLocale: "fr",
      matchedTerm: "responsable du traitement",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "個人情報保護方針 | ニュース | ログイン | トップ | 料金 | 事例 | 製品 | サポート --> 個人情報保護方針",
      matchedLocale: "ja",
      matchedTerm: "個人情報保護管理者",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "Ciascuna società ricopre il ruolo di titolare del trattamento secondo la relativa definizione contenuta nell'articolo 4 del GDPR.",
      matchedLocale: "it",
      matchedTerm: "titolare del trattamento",
      topic: "controller_contact",
    }),
    candidate({
      evidenceText: "Il Gruppo opera nel rispetto dei diritti degli interessati. Il trattamento avviene principalmente nell'Unione Europea.",
      matchedLocale: "it",
      matchedTerm: "diritti degli interessati",
      topic: "data_subject_rights",
    }),
    candidate({
      evidenceText: "Оператор осуществляет обработку данных, а также определяет цели обработки персональных данных. Персональные данные – любая информация о лице.",
      matchedLocale: "ru",
      matchedTerm: "цели обработки персональных данных",
      topic: "processing_purposes",
    }),
    candidate({
      evidenceText: "Consultare la privacy policy del singolo social network, dove sono illustrate raccolta, utilizzo e conservazione dei dati.",
      matchedLocale: "it",
      matchedTerm: "conservazione dei dati",
      topic: "data_retention",
    }),
  ];
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates),
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions.every((item) => item.productionCredit === false), true);
});

test("adapter binds a weak candidate to strong same-topic retained policy evidence", () => {
  const weakCandidate = candidate({
    evidenceText: "Data controller means the person who decides why personal data is processed.",
    matchedLocale: "en",
    matchedTerm: "data controller",
    topic: "controller_contact",
  });
  const retainedEvidence =
    "Example Ltd is the controller of your personal data. Contact our privacy team at privacy@example.test.";
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([weakCandidate], {
      article13DisclosureSignals: [{
        confidence: 0.9,
        disclosureType: "controller_contact",
        evidenceText: retainedEvidence,
        selectedEvidenceStrength: "strong",
        selectedPolicySectionExcerpt: retainedEvidence,
        selectedPolicySectionUrl: "https://example.test/privacy",
        source: "deterministic",
        status: "observed",
      }],
    }),
  });

  assert.equal(result.acceptedProductionSignals.length, 1);
  assert.equal(
    result.acceptedProductionSignals[0]?.evidenceSource,
    "canonical_retained_article13_signal",
  );
  assert.equal(result.acceptedProductionSignals[0]?.evidenceText, retainedEvidence);
});

test("adapter does not project retained evidence when target ownership is unverified", () => {
  const controllerCandidate = candidate({
    evidenceText:
      "Example Ltd is the controller of your personal data. Contact privacy@example.test.",
    matchedLocale: "en",
    matchedTerm: "data controller",
    topic: "controller_contact",
  });
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: false,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([controllerCandidate]),
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions[0]?.rejectReason, "non_privacy_policy_surface");
});

test("retained Article 4 and Article 6 variants pass the canonical production evidence adapter", () => {
  const text = [
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
  ].join(" ");
  const classified = classifyGdprTransparencyTopics({ text, localeHints: ["en"] });
  const candidates = classified.matches.map((match) => candidate({
    classifierReasonCodes: match.reasonCodes,
    confidence: match.confidence,
    evidenceText: match.evidenceExcerpt,
    matchStrength: match.matchStrength,
    matchedLocale: match.matchedLocale,
    matchedTerm: match.matchedTerm,
    topic: match.topic,
  }));
  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, { textExcerpt: text }),
  });

  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.disclosureType).sort(),
    [
      "controller_contact",
      "data_retention",
      "data_subject_rights",
      "dpo_contact",
      "international_transfers",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories",
      "supervisory_authority",
    ],
    JSON.stringify(result.dispositions),
  );
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
});
