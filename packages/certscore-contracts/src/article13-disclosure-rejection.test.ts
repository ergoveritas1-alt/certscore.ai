import assert from "node:assert/strict";
import test from "node:test";

import {
  article13DisclosureRejectReason,
  assessArticle13PolicyTextQuality,
  hasSubstantiveAutomatedDecisionOrProfilingEvidence,
  hasSubstantiveLegalBasisEvidence,
  hasSubstantiveProcessingPurposesEvidence,
  isArticle13DisclosureEvidenceUsable,
  looksLikeArticle13TableOfContents,
  type Article13DisclosureRejectionMode,
} from "./article13-disclosure-rejection";

test("retained-report policy quality accepts canonical Hungarian Russian and Estonian text", () => {
  const policies = [
    [
      "hu",
      "Adatvédelmi tájékoztató. A szolgáltató ismerteti a személyes adatok kezelésének célját, jogalapját és az érintettek jogait.",
    ],
    [
      "ru",
      "Политика обработки персональных данных. Настоящий документ описывает цели обработки персональных данных, правовые основания и права субъекта данных.",
    ],
    [
      "et",
      "Privaatsustingimused. Käesolev dokument selgitab isikuandmete töötlemise eesmärke, õiguslikku alust ja andmesubjekti õigusi.",
    ],
  ] as const;

  for (const [locale, sentence] of policies) {
    const assessment = assessArticle13PolicyTextQuality(sentence.repeat(12), {
      mode: "retained_report",
    });
    assert.equal(assessment.usable, true, locale);
    assert.ok(assessment.policyTermCount >= 1, locale);
  }
});

test("retained-report policy quality rejects mixed-page text with a delayed policy heading", () => {
  const unrelatedOpening =
    "Public profiles advertisements telephone listings navigation and unrelated community content ".repeat(12);
  const delayedPolicy = [
    "Privaatsustingimused. Isikuandmete töötlemisel selgitame eesmärke, õiguslikku alust ja õigusi.",
    "Andmesubjekt võib taotleda juurdepääsu, parandamist ja kustutamist ning võtta ühendust vastutava töötlejaga.",
  ].join(" ").repeat(10);

  const assessment = assessArticle13PolicyTextQuality(`${unrelatedOpening} ${delayedPolicy}`, {
    mode: "retained_report",
  });

  assert.equal(assessment.usable, false);
  assert.equal(assessment.policyTermCount, 0);
  assert.equal(assessment.reason, "low_quality_non_policy_text");
});

const rejectionModes: Article13DisclosureRejectionMode[] = [
  "scan_core",
  "retained_report",
  "multilingual_classifier",
];

test("explicit automated-processing and profiling clauses remain substantive across grammatical forms", () => {
  const disclosures = [
    "Automated decision-making and profiling. This fixture does not use solely automated decision-making or profiling that produces legal effects or similarly significant effects for an individual.",
    "The personal data collected via the Website is subject to automatic processing through profiling if the data subject has consented to such processing. As a result of profiling, a profile is built.",
    "You may opt out from processing of your Personal Information for profiling in furtherance of decisions that produce legal or similarly significant effects. We do not conduct such processing activities.",
  ];

  for (const disclosure of disclosures) {
    assert.equal(hasSubstantiveAutomatedDecisionOrProfilingEvidence(disclosure), true, disclosure);
    for (const mode of rejectionModes) {
      assert.equal(
        article13DisclosureRejectReason(
          disclosure,
          "automated_decision_making_or_profiling",
          { mode },
        ),
        null,
        `${mode}: ${disclosure}`,
      );
    }
  }
});

test("generic automation and personalization remain insufficient profiling evidence", () => {
  const nonDisclosures = [
    "This website does not use automated deployment decisions that affect build availability.",
    "This service uses automated scanner classification only to evaluate synthetic website signals.",
    "We personalize the homepage and recommend popular articles based on the current page.",
  ];

  for (const text of nonDisclosures) {
    assert.equal(hasSubstantiveAutomatedDecisionOrProfilingEvidence(text), false, text);
    assert.equal(
      article13DisclosureRejectReason(
        text,
        "automated_decision_making_or_profiling",
        { mode: "multilingual_classifier" },
      ),
      "insufficient_row_specific_terms",
      text,
    );
  }
});

test("Privacy Shield transfer wording does not qualify as processing-purposes evidence", () => {
  const text = "Our payment provider is certified under the EU-US Privacy Shield.";

  assert.equal(hasSubstantiveProcessingPurposesEvidence(text), false);
  assert.equal(
    article13DisclosureRejectReason(text, "processing_purposes", { mode: "retained_report" }),
    "insufficient_row_specific_terms",
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "We process your email address to process your donation and send a receipt.",
      "processing_purposes",
      { mode: "retained_report" },
    ),
    true,
  );
});

test("passive purpose disclosures for enquiries and applications qualify as processing-purpose evidence", () => {
  for (const text of [
    "Your details from the form, including the contact details you provide, will be stored by us for the purpose of processing the enquiry and follow-up questions.",
    "Application documents are stored in our recruiting system to process your application and contact you about the role.",
    "Part of the data is collected to ensure error-free provision of the website. Other data may be used to analyse your user behaviour.",
  ]) {
    assert.equal(hasSubstantiveProcessingPurposesEvidence(text), true, text);
    assert.equal(
      article13DisclosureRejectReason(text, "processing_purposes", { mode: "retained_report" }),
      null,
      text,
    );
  }
});

test("retention-purpose wording does not qualify as processing-purposes evidence", () => {
  const retentionText =
    "How long do we keep your data? We retain it as long as necessary for the purpose for which it was collected.";

  assert.equal(hasSubstantiveProcessingPurposesEvidence(retentionText), false);
  assert.equal(
    article13DisclosureRejectReason(retentionText, "processing_purposes", {
      mode: "retained_report",
    }),
    "insufficient_row_specific_terms",
  );
});

test("retention legal-obligation wording does not qualify as legal-basis evidence", () => {
  const retentionText =
    "Additional Information About Data Retention. After you close your account, we will delete your personal information, except if we need it to comply with our legal obligations and defend our rights. We retain such information for as long as required by law.";

  assert.equal(hasSubstantiveLegalBasisEvidence(retentionText), false);
  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(retentionText, "legal_basis", { mode }),
      "insufficient_row_specific_terms",
      `${mode} should reject retention-only legal-obligation wording as legal-basis evidence`,
    );
  }
});

test("processing-linked legal obligations qualify as legal-basis evidence", () => {
  const legalBasisText =
    "We process your personal data to perform our contract, comply with our legal obligations, and pursue our legitimate interests.";

  assert.equal(hasSubstantiveLegalBasisEvidence(legalBasisText), true);
  assert.equal(
    isArticle13DisclosureEvidenceUsable(legalBasisText, "legal_basis", {
      mode: "retained_report",
    }),
    true,
  );
});

test("processing framed on the basis of legitimate interests qualifies in singular and plural form", () => {
  for (const legalBasisText of [
    "You may object to the processing of your information on the basis of our legitimate interest in service security.",
    "You may object to the processing of your information on the basis of our legitimate interests, including direct marketing.",
  ]) {
    assert.equal(hasSubstantiveLegalBasisEvidence(legalBasisText), true, legalBasisText);
    assert.equal(
      article13DisclosureRejectReason(legalBasisText, "legal_basis", { mode: "retained_report" }),
      null,
      legalBasisText,
    );
  }

  assert.equal(
    hasSubstantiveLegalBasisEvidence("Our legitimate interests include improving our products."),
    false,
  );
});

test("purpose-bound keep-for-as-long-as-needed wording qualifies as retention evidence", () => {
  const retentionText =
    "We only keep Information for as long as we need it to fulfil the purpose we are using it for, as permitted by law.";

  for (const mode of ["scan_core", "retained_report"] as const) {
    assert.equal(article13DisclosureRejectReason(retentionText, "data_retention", { mode }), null);
  }

  assert.equal(
    article13DisclosureRejectReason(
      "We keep information in secure databases and use storage services around the world.",
      "data_retention",
      { mode: "retained_report" },
    ),
    "generic_storage_not_retention",
  );
});

test("mixed broad policy context cannot combine unrelated paragraphs into legal-basis evidence", () => {
  const broadContext = [
    "Communications. We use your personal information to communicate with you by email, telephone, or customer-service channels.",
    "Purposes for which we seek your consent include sending optional marketing messages.",
    "Comply with legal obligations. We retain transaction records for as long as required by law."
  ].join(" ");

  assert.equal(hasSubstantiveLegalBasisEvidence(broadContext), false);
  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(broadContext, "legal_basis", { mode }),
      "insufficient_row_specific_terms",
    );
  }
});

test("consent-request language does not substitute for a directly framed legal basis", () => {
  const consentRequestText =
    "We use your personal information to communicate with you in relation to our services via phone, email, or chat. Purposes for which we seek your consent. We may also ask for your consent to use your personal information for a specific purpose that we communicate to you.";

  assert.equal(hasSubstantiveLegalBasisEvidence(consentRequestText), false);
  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(consentRequestText, "legal_basis", { mode }),
      "insufficient_row_specific_terms",
    );
  }
});

test("explicit consent reliance remains usable legal-basis evidence", () => {
  const directConsentBasis =
    "We process your personal data with your consent when you request optional personalized services.";

  assert.equal(hasSubstantiveLegalBasisEvidence(directConsentBasis), true);
  assert.equal(
    article13DisclosureRejectReason(directConsentBasis, "legal_basis", { mode: "retained_report" }),
    null,
  );
});

test("abbreviated Article 6 framing remains substantive legal-basis evidence", () => {
  const text =
    "Privacy Policy. Data processing is based on Art. 6 (1) lit. f GDPR because the controller has a legitimate interest in securing the website.";

  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const) {
    assert.equal(article13DisclosureRejectReason(text, "legal_basis", { mode }), null, mode);
  }
});

test("bounded German section clauses retain multilingual legal-basis evidence", () => {
  const text =
    "Maßgebliche Rechtsgrundlagen. Die Verarbeitung erfolgt auf Grundlage einer Einwilligung, zur Vertragserfüllung, zur Erfüllung rechtlicher Verpflichtungen oder aufgrund berechtigter Interessen.";

  assert.equal(
    article13DisclosureRejectReason(text, "legal_basis", { mode: "multilingual_classifier" }),
    null,
  );
});

test("named-controller purpose statements qualify as processing-purposes evidence", () => {
  assert.equal(
    hasSubstantiveProcessingPurposesEvidence(
      "Aruba processes personal data to handle contact requests, provide contracted services, protect network security, and prevent fraud.",
    ),
    true,
  );
});

test("Article 13 rejection contract rejects navigation chrome consistently across modes", () => {
  const navigation =
    "Skip to main content Privacy Policy Overview Terms of Service Technologies FAQ Privacy Terms Search Menu";

  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(navigation, "controller_contact", { mode }),
      "page_chrome_or_navigation",
      `${mode} should reject navigation chrome`,
    );
  }
});

test("Article 13 rejection contract rejects table-of-contents snippets consistently across modes", () => {
  const tableOfContents =
    "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints";

  assert.equal(
    article13DisclosureRejectReason(tableOfContents, "legal_basis", { mode: "multilingual_classifier" }),
    "table_of_contents_only",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Introduction Information Google collects Why Google collects Your privacy controls Sharing your information Keeping your information FAQ",
      "legal_basis",
      { mode: "scan_core" },
    ),
    "table_of_contents_only",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Introduction Information Google collects Why Google collects Your privacy controls Sharing your information Keeping your information FAQ",
      "legal_basis",
      { mode: "retained_report" },
    ),
    "table_of_contents_only",
  );
});

test("Article 13 rejection contract does not mistake third-person factual policy prose for a table of contents", () => {
  const completeNotice =
    "Controller contact. Calibration Publisher Ltd. is the controller. Purposes and legal basis. Calibration Publisher Ltd. processes account data to provide a requested service under a contract. Recipients. Named vendors include Example Hosting Ltd. Retention. Account records are retained for 24 months after closure. Rights. Individuals may request access, correction, deletion, restriction, portability, or objection.";

  assert.equal(looksLikeArticle13TableOfContents(completeNotice, { mode: "multilingual_classifier" }), false);
});

test("Article 13 rejection contract preserves substantive German multi-topic prose", () => {
  const completeNotice =
    "Der Verantwortliche für die Datenverarbeitung nennt den Kontakt zum Datenschutz und den Kontakt zum Datenschutzbeauftragten. Wir erklären die Zwecke der Verarbeitung personenbezogener Daten, die Rechtsgrundlage für die Verarbeitung personenbezogener Daten, Kategorien von Empfängern personenbezogener Daten, die Speicherdauer personenbezogener Daten, das Recht auf Auskunft über personenbezogene Daten, die Übermittlung personenbezogener Daten in ein Drittland, das Recht auf Beschwerde bei einer Aufsichtsbehörde und automatisierte Entscheidungsfindung mit personenbezogenen Daten.";

  assert.equal(looksLikeArticle13TableOfContents(completeNotice, { mode: "multilingual_classifier" }), false);
});

test("Article 13 rejection contract preserves accepted legacy and multilingual examples", () => {
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
      "legal_basis",
      { mode: "scan_core" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "We may transfer your personal data to service providers outside the European Economic Area using safeguards.",
      "international_transfers",
      { mode: "retained_report" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "La base legale del trattamento dei dati personali comprende consenso, contratto e interessi legittimi.",
      "legal_basis",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Die Datenschutz-Grundverordnung verpflichtet uns, über personenbezogene Datenverarbeitung zu informieren. Sie sollen wissen, welche Zwecke wir verfolgen.",
      "processing_purposes",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Beim Aufruf der Website werden personenbezogene Daten verarbeitet. Verantwortlich für die Datenverarbeitung ist die Zeitverlag Gerd Bucerius GmbH & Co. KG.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Die Datenschutz-Grundverordnung verpflichtet uns, über die Verarbeitung zu informieren, etwa wie lange Ihre Informationen gespeichert werden.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Les données personnelles sont conservées pendant la durée nécessaire aux finalités du traitement.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "COMBIEN DE TEMPS CES INFORMATIONS SONT-ELLES CONSERVÉES ? D'une manière générale, vos données personnelles sont conservées en base active pour une durée conforme aux dispositions légales et proportionnelles aux finalités pour lesquelles elles ont été collectées.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Unseren Datenschutzbeauftragten erreichen Sie unter datenschutzbeauftragter@example.test oder unserer Postadresse mit dem Zusatz Datenschutzbeauftragter.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Il responsabile della protezione dei dati risponde tramite contatto DPO e può essere contattato all'indirizzo privacy@example.test.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "RCS e CRM sono autonomi Titolari del trattamento dei dati personali raccolti su questo sito ai sensi del GDPR.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Il titolare del trattamento dei suoi dati personali può essere contattato all'indirizzo privacy@example.test.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "RCS tratta i tuoi dati per le seguenti finalità, supportate dalle relative basi giuridiche.",
      "processing_purposes",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "L'elenco aggiornato dei soggetti che sono stati destinatari dei tuoi dati può essere richiesto al Titolare del trattamento.",
      "recipients_or_vendor_categories",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "In bepaalde omstandigheden heeft u het recht om bezwaar te maken tegen het verwerken van uw persoonsgegevens door ons.",
      "data_subject_rights",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
});

test("Article 13 rejection contract rejects DPO nouns without a contact anchor", () => {
  assert.equal(
    article13DisclosureRejectReason(
      "Die Behörde der Datenschutzbeauftragten beaufsichtigt bisher den Nachrichtendienst. Die Datenschutzbeauftragte wehrt sich gegen den Entzug der Kontrolle.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    "insufficient_row_specific_terms",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Responsabile della Protezione dei Dati Rinvio ad altre informative di ANSA Rinvio alla Privacy Policy dell'App ANSA.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    "insufficient_row_specific_terms",
  );
});

test("Article 13 rejection contract accepts calibrated DPO contact evidence in the sixteen expansion locales", () => {
  const examples = [
    "Datele de contact ale responsabilului cu protecția datelor sunt privacy@example.test.",
    "Kontaktní údaje pověřence pro ochranu osobních údajů jsou privacy@example.test.",
    "Τα στοιχεία επικοινωνίας του υπευθύνου προστασίας δεδομένων είναι privacy@example.test.",
    "Az adatvédelmi tisztviselő elérhetőségei: privacy@example.test.",
    "Kontaktoplysninger for databeskyttelsesrådgiveren: privacy@example.test.",
    "Tietosuojavastaavan yhteystiedot ovat privacy@example.test.",
    "Kontaktné údaje zodpovednej osoby pre ochranu osobných údajov sú privacy@example.test.",
    "Данни за контакт на длъжностното лице по защита на данните: privacy@example.test.",
    "Kontaktni podaci službenika za zaštitu podataka su privacy@example.test.",
    "Personvernombudets kontaktopplysninger er privacy@example.test.",
    "Kontaktni podatki pooblaščene osebe za varstvo podatkov so privacy@example.test.",
    "Duomenų apsaugos pareigūno kontaktiniai duomenys: privacy@example.test.",
    "Datu aizsardzības speciālista kontaktinformācija: privacy@example.test.",
    "Andmekaitsespetsialisti kontaktandmed on privacy@example.test.",
    "Контактні дані відповідальної особи із захисту даних: privacy@example.test.",
    "Veri koruma görevlisinin iletişim bilgileri: privacy@example.test.",
  ];

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example, "dpo_contact", { mode: "multilingual_classifier" }),
      true,
      example,
    );
  }
});

test("Article 13 rejection contract rejects GamCare-style team and no-sale false positives", () => {
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const) {
    assert.equal(
      article13DisclosureRejectReason(
        "Your personal information will not be shared outside our team unless there is a risk to you or someone else.",
        "international_transfers",
        { mode }
      ),
      "insufficient_row_specific_terms"
    );
    assert.equal(
      article13DisclosureRejectReason(
        "We respect your privacy and do not sell your personal information to any third-party individual or organisation.",
        "recipients_or_vendor_categories",
        { mode }
      ),
      "insufficient_row_specific_terms"
    );
  }
});

test("Article 13 rejection contract rejects generic contact and GDPR page chrome for row-specific disclosures", () => {
  const footerChrome =
    "Parents Teachers Privacy Policy Cookie Policy Terms Contact us Content Removal Upload Home New videos Search Menu";
  const federalRegisterFooter =
    "Home Executive Orders Contact Us Privacy Policy Accessibility FOIA No Fear Act Office of the Federal Register National Archives";

  for (const mode of ["scan_core", "retained_report"] satisfies Article13DisclosureRejectionMode[]) {
    assert.notEqual(
      article13DisclosureRejectReason(footerChrome, "controller_contact", { mode }),
      null,
      `${mode} should reject generic Contact us page chrome`,
    );
    assert.equal(
      article13DisclosureRejectReason(federalRegisterFooter, "controller_contact", { mode }),
      "page_chrome_or_navigation",
      `${mode} should reject Federal Register footer chrome as controller contact evidence`,
    );
    assert.equal(
      article13DisclosureRejectReason(
        "Privacy Policy for Example.com. Introduction. We value privacy and mention GDPR, cookies, terms, and policy updates for visitors.",
        "supervisory_authority",
        { mode },
      ),
      "insufficient_row_specific_terms",
      `${mode} should reject generic GDPR/privacy-policy text as supervisory authority evidence`,
    );
  }
});

test("Article 13 rejection contract accepts complaint-to-authority language", () => {
  for (const mode of ["scan_core", "retained_report"] satisfies Article13DisclosureRejectionMode[]) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(
        "You have the right to lodge a complaint with your local data protection authority about how we process your personal data.",
        "supervisory_authority",
        { mode },
      ),
      true,
      `${mode} should accept row-specific complaint authority wording`,
    );
    assert.equal(
      isArticle13DisclosureEvidenceUsable(
        "If you have unresolved concerns, you may have the right to complain to your data protection authority.",
        "supervisory_authority",
        { mode },
      ),
      true,
      `${mode} should accept possessive complaint-to-authority wording`,
    );
    assert.equal(
      isArticle13DisclosureEvidenceUsable(
        "If you are not happy with how we handled your concern, you may submit a complaint to the Information Commissioner's Office.",
        "supervisory_authority",
        { mode },
      ),
      true,
      `${mode} should accept a complaint route to the UK supervisory authority`,
    );
  }
});

test("Article 13 rejection contract accepts bounded privacy-counsel and E.U. authority contacts", () => {
  const privacyCounsel = "If you have questions about this privacy policy, email us at privacy@example.test or write to Privacy Counsel at our postal address.";
  const complaint = "In the European Union, you can lodge a complaint with an E.U. data protection authority about our processing of personal data.";

  for (const mode of rejectionModes) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(privacyCounsel, "dpo_contact", { mode }),
      true,
      `${mode} should accept a directly contactable privacy counsel without claiming a formal DPO designation`,
    );
    assert.equal(
      isArticle13DisclosureEvidenceUsable(complaint, "supervisory_authority", { mode }),
      true,
      `${mode} should accept the punctuated E.U. complaint-authority wording`,
    );
  }
});

test("Article 13 rejection contract rejects footer language, generic disclaimers, and cookie definitions", () => {
  for (const mode of ["scan_core", "retained_report"] satisfies Article13DisclosureRejectionMode[]) {
    assert.equal(
      article13DisclosureRejectReason(
        "Donate All languages Language Čeština Deutsch English Español Français Italiano Nederlands Polski Português Русский Privacy Policy Terms Contact",
        "supervisory_authority",
        { mode },
      ),
      "insufficient_row_specific_terms",
      `${mode} should reject footer/language switcher text as supervisory authority evidence`,
    );
    assert.equal(
      article13DisclosureRejectReason(
        "Though all efforts have been made to ensure the accuracy and currency of the content on this website, the same should not be construed as a statement of law or used for any legal purposes.",
        "data_retention",
        { mode },
      ),
      "insufficient_row_specific_terms",
      `${mode} should reject generic site disclaimers as retention evidence`,
    );
    assert.equal(
      article13DisclosureRejectReason(
        "Cookies. A cookie is a piece of software code that an internet web site sends to your browser when you access information at that site.",
        "data_subject_rights",
        { mode },
      ),
      "insufficient_row_specific_terms",
      `${mode} should reject cookie definitions as data-subject-rights evidence`,
    );
  }
});

test("Article 13 rejection contract rejects IMOU 404 and product-footer chrome", () => {
  const imou404 = "Policy body. Products Product categories Cameras Doorbells Smart Locks Support FAQ Downloads Videos Developers Warranty Policy Contact Us. Ops, the page slips away. Please check whether the page address you entered is correct! Back Home Privacy Policy Cookie Policy Terms of Use Cookie Preferences Copyright 2026 IMOU. All Rights Reserved.";
  const imouFooter = "Products Cameras Doorbells Smart Locks Imou Link Imou IoT Imou Robots Accessories Support FAQ Download Videos Product Manual Warranty Policy Contact us Sign Up Privacy Policy Cookie Policy Terms of Use Cookie Preferences All Rights Reserved.";

  for (const mode of ["scan_core", "retained_report"] satisfies Article13DisclosureRejectionMode[]) {
    assert.equal(article13DisclosureRejectReason(imou404, "data_subject_rights", { mode }), "page_chrome_or_navigation");
    assert.equal(article13DisclosureRejectReason(imouFooter, "controller_contact", { mode }), "page_chrome_or_navigation");
  }
});

test("Article 13 rejection contract does not promote an explicitly absent DPO", () => {
  const absentDesignation =
    "Privacy notice. CertScore.ai does not currently appoint or publish a Data Protection Officer for this service.";

  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(absentDesignation, "dpo_contact", { mode }),
      "insufficient_row_specific_terms",
      `${mode} should reject a negated DPO designation`,
    );
  }
});

test("Article 13 rejection contract accepts a substantive privacy contact point without inventing a DPO", () => {
  const contactPoint = [
    "Privacy Contact Point. Email privacy@certscore.ai for privacy questions and data-subject requests.",
    "CertScore.ai has not appointed a Data Protection Officer.",
  ].join(" ");

  for (const mode of rejectionModes) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(contactPoint, "dpo_contact", { mode }),
      true,
      `${mode} should retain the observed privacy contact point`,
    );
  }
});

test("Article 13 rejection contract accepts bounded multi-action rights and negated retention limits", () => {
  const rights = "Exporting and deleting your information. You can export a copy of content in your account, delete your information, remove content, and request that we correct information.";
  const retention = "We do not keep personal data longer than is necessary and follow the retention schedule.";

  for (const mode of rejectionModes) {
    assert.equal(isArticle13DisclosureEvidenceUsable(rights, "data_subject_rights", { mode }), true);
    assert.equal(isArticle13DisclosureEvidenceUsable(retention, "data_retention", { mode }), true);
  }
});
