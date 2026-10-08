import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { article13DisclosureRejectReason, gdprTransparencyTopicCoverageDiagnosticSchema } from "@certscore/contracts";
import { extractPolicySections, retainedPolicySectionsForObservation, retainedArticle13SectionEvidenceFromSections, buildGdprTransparencyTopicCoverageDiagnostics } from "./scanners/policy-surface-scanner.js";
import { assessPolicyDocumentSubstance, extractPolicyFacts, policyFactsForFetchedDocument, boundedPrefetchedPolicyAnalysisText, gdprTransparencyTopicCandidatesFromRetainedPolicySections } from "./scanners/policy-surface-scanner.js";

const sourceUrl = "https://example.test/privacy";

test("consent shell rejection preserves its existing length boundary and localized controls", () => {
  for (const text of [
    "Privacy settings. Accept all. Reject all. Cookie preferences.",
    "Cookie-Einstellungen. Alle akzeptieren. Alle ablehnen.",
    "Paramètres des cookies. Tout accepter. Tout refuser.",
    "Accept all. Reject all. ".padEnd(119, "x"),
  ]) {
    assert.deepEqual(assessPolicyDocumentSubstance({ surfaceType: "privacy_policy", text }), {
      matchesExpectedSurface: false, reasonCode: "consent_settings_shell",
    });
  }
  for (const length of [120, 121]) {
    assert.deepEqual(assessPolicyDocumentSubstance({
      surfaceType: "privacy_policy", text: "Accept all. Reject all. ".padEnd(length, "x"),
    }), { matchesExpectedSurface: true, reasonCode: "multilingual_policy_reviewable" });
  }
});

test("HTML section formats share source-bound offsets after page chrome removal", () => {
  const contact = "The controller is Example Group. Contact privacy@example.test for information about our processing of your personal data and to exercise your data protection rights.";
  const retention = "We retain your personal data for six months after your account is closed. You may request deletion by contacting privacy@example.test and we will respond to your request.";
  const rights = "You have the right to access, correct and delete your personal data. Contact privacy@example.test to exercise these rights or to receive a portable copy of your personal data.";
  const body = `<h2>Controller contact</h2><p>${contact}</p><dl><dt>Data retention</dt><dd>${retention}</dd></dl><p><strong>Data subject rights</strong>${rights}</p><table><tr><th>Purpose</th><th>Retention</th></tr><tr><td>Account data</td><td>${retention}</td></tr></table>`;
  const visibleText = `${contact} ${retention} ${rights}`;
  const withChrome = extractPolicySections({
    html: `<header>Unrelated navigation</header>${body}<footer>Unrelated footer</footer>`,
    sourceUrl,
    visibleText,
  });
  const withoutChrome = extractPolicySections({ html: ` ${body} `, sourceUrl, visibleText });
  assert.deepEqual(withChrome, withoutChrome);
  for (const method of ["html_heading_hierarchy", "html_definition_pair", "html_table_row"]) {
    const section = withChrome.find((row) => row.extractionMethod === method);
    assert.ok(section, `${method}: ${withChrome.map((row) => row.extractionMethod).join(", ")}`);
    assert.equal(section.sourceOffsetBasis, "sanitized_html");
    assert.equal(section.documentTextSha256, createHash("sha256").update(` ${body} `).digest("hex"));
    assert.ok(section.charStart! >= 0 && section.charEnd! <= body.length + 2);
  }
  assert.ok(withChrome.every((row) => !/Unrelated navigation|Unrelated footer/.test(row.textExcerpt)));
});

test("Russian controller contact remains source-bound without an English privacy heading", () => {
  const textExcerpt = "Оператор персональных данных указывает контакт ответственного по защите данных.";
  const evidence = retainedArticle13SectionEvidenceFromSections([{
    sourceUrl, heading: "Privacy", textExcerpt, charStart: 0,
    charEnd: textExcerpt.length, quality: "strong",
  }], sourceUrl);
  const controller = evidence.find(row => row.coverageArea === "controller_contact");
  assert.equal(controller?.signalObserved, "observed");
  assert.equal(controller?.selectedPolicySectionExcerpt, textExcerpt);
  const roleOnly = "Оператор персональных данных обрабатывает данные.";
  assert.notEqual(article13DisclosureRejectReason(roleOnly, "controller_contact", { mode: "multilingual_classifier" }), null);
});

test("visible-text topic candidates do not repeat an extracted heading in source quotes", () => {
  const body = "Right to data portability. You have the right to access your personal data and to receive a portable copy. Contact privacy@example.test to exercise these rights.";
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([{
    heading: "Right to data portability",
    textExcerpt: body,
    extractionMethod: "canonical_topic_window",
  }]);
  const rights = candidates.find(candidate => candidate.topic === "data_subject_rights");
  assert.ok(rights);
  assert.ok(body.includes(rights.evidenceText));
});

test("late policy evidence remains source-bound and prefers actual website disclosures", () => {
  const visibleText = [
    "Privacy policy. This notice describes our personal-data processing and your rights. ".repeat(200),
    "Information on the controller pursuant to Art. 4 No. 7 GDPR Example Group AG, Example Street 1. E-Mail: privacy@example.test.",
    "You have the right to receive information about the origin, recipient and purpose of your stored personal data. Our service providers offer useful guidance.",
    "Contact forms. The processing of the data entered in the form is carried out in accordance with Art. 6 (1) lit. f GDPR.",
    "The data you enter in the form will remain with us until you request us to delete it, revoke your consent to store it or the purpose for storing the data no longer applies.",
    "Recipient of the data: HubSpot Germany GmbH, Berlin, Germany.",
    "Analytics. The storage period of the data in Matomo is set at 6 months. The cookies set by Matomo are valid for up to 6 months.",
    "Newsletter. The personal data collected in this way is processed by our service provider named below, including in the USA. The legal basis for the transfer is an order processing contract as well as EU standard contractual clauses pursuant to Art. 46 GDPR.",
    "Fanpages. Data transfers to third countries are secured by an adequacy decision pursuant to Art. 45 GDPR or by appropriate safeguards pursuant to Art. 46 GDPR.",
    "If your personal data is processed for direct marketing, you have the right to object; this also applies to profiling. If you object, your personal data will no longer be used for direct advertising.",
  ].join(" ");
  const sections = extractPolicySections({ html: "", visibleText, sourceUrl });
  const retained = retainedPolicySectionsForObservation(sections);
  const evidence = retainedArticle13SectionEvidenceFromSections(retained, sourceUrl);
  const expected = [
    ["data_retention", /remain with us|set at 6 months/],
    ["recipients_or_vendor_categories", /HubSpot Germany GmbH/],
    ["international_transfers", /including in the USA/],
    ["controller_contact", /Example Group AG/],
    ["legal_basis", /data entered in the form/],
  ] as const;
  const hash = createHash("sha256").update(visibleText.replace(/\s+/g, " ").trim()).digest("hex");
  for (const [topic, pattern] of expected) {
    const row = evidence.find(row => row.coverageArea === topic)!;
    assert.equal(row?.signalObserved, "observed", topic);
    assert.match(row.selectedPolicySectionExcerpt, pattern, topic);
    assert.ok(visibleText.includes(row.selectedPolicySectionExcerpt), `verbatim source: ${topic}`);
    assert.equal(row.sourceDocumentTextSha256, hash);
    assert.equal(row.evidenceTextSha256, createHash("sha256").update(row.selectedPolicySectionExcerpt).digest("hex"));
    assert.doesNotMatch(row.selectedPolicySectionExcerpt, /\[(?:retention|supervisory_authority|controller_contact)\]/);
  }
  assert.ok(retained.length <= 24);
  const facts = policyFactsForFetchedDocument(extractPolicyFacts(boundedPrefetchedPolicyAnalysisText(visibleText)), evidence, { allowLegacyArticle13Extraction: true });
  const recipients = facts.article13DisclosureSignals.find(row => row.disclosureType === "recipients_or_vendor_categories");
  assert.match(recipients!.evidenceText, /HubSpot/);
  assert.ok(!facts.article13DisclosureSignals.some(row => row.disclosureType === "automated_decision_making_or_profiling" && row.status === "observed"));
});

test("cookie-only expiry cannot establish personal-data retention in a policy section", () => {
  const visibleText = "Privacy policy. Analytics cookies are stored for six months. We collect personal data to answer your enquiries. You can contact us about your rights.";
  const rows = retainedArticle13SectionEvidenceFromSections(extractPolicySections({ html: "", visibleText, sourceUrl }), sourceUrl);
  assert.ok(!rows.some(row => row.coverageArea === "data_retention" && row.signalObserved === "observed"));
});

test("profiling witness uses concrete interest tracking rather than generic objection rights", () => {
  const concrete = "As part of website tracking, we use cookies to track which of our pages are visited and of interest to you. The following data is processed: device identifier, IP address and pages viewed.";
  const rights = "If your personal data is processed for direct marketing, you have the right to object; this also applies to profiling.";
  const visibleText = ["Privacy policy. We process personal data for website marketing.", rights, "HubSpot website marketing", concrete].join(" ");
  const sections = extractPolicySections({html: "", visibleText, sourceUrl});
  const retained = retainedPolicySectionsForObservation(sections);
  const witness = retainedArticle13SectionEvidenceFromSections(retained, sourceUrl)
    .find(row => row.coverageArea === "automated_decision_making_or_profiling" && row.signalObserved === "observed");
  assert.ok(witness);
  assert.match(witness.selectedPolicySectionExcerpt, /we use cookies to track/);
  assert.ok(visibleText.includes(witness.selectedPolicySectionExcerpt));
  const facts = policyFactsForFetchedDocument(extractPolicyFacts(boundedPrefetchedPolicyAnalysisText(visibleText)), [witness], {allowLegacyArticle13Extraction: true});
  assert.equal(facts.article13DisclosureSignals.find(row => row.disclosureType === "automated_decision_making_or_profiling")?.status, "observed");
});

test("German transfer proof retains the safeguards after an abbreviated legal citation", () => {
  const visibleText = [
    "Datenschutzerklärung. Allgemeine Informationen zur Verarbeitung personenbezogener Daten. ".repeat(20),
    "Übermittlungen in Drittländer erfolgen nur unter den besonderen Voraussetzungen der Art. 44 ff. DSGVO und mit geeigneten Garantien.",
  ].join(" ");
  const sections = extractPolicySections({ html: `<main>${visibleText}</main>`, visibleText, sourceUrl });
  const witness = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl)
    .find(row => row.coverageArea === "international_transfers");
  assert.equal(witness?.signalObserved, "observed");
  assert.match(witness!.selectedPolicySectionExcerpt, /Art\. 44 ff\. DSGVO und mit geeigneten Garantien/);
});

test("German policy witnesses prefer substantive disclosures over security boilerplate and contents", () => {
  const parts = [
    ["Datenschutz Inhaltsübersicht", "Verantwortlicher Übersicht der Verarbeitungen Zwecke der Verarbeitung Löschung von Daten Sicherheitsmaßnahmen Kontaktaufnahme."],
    ["Sicherheitsmaßnahmen", "Wir berücksichtigen den Stand der Technik, die Implementierungskosten und die Art, den Umfang, die Umstände und die Zwecke der Verarbeitung personenbezogener Daten. Des Weiteren haben wir Verfahren eingerichtet, die eine Wahrnehmung von Betroffenenrechten, die Löschung von Daten und Reaktionen auf die Gefährdung der Daten gewährleisten."],
    ["Verantwortlicher", "Beispiel GmbH, Musterstraße 1, 12345 Berlin. E-Mail: datenschutz@example.test. Telefon: 030 123456."],
    ["Zwecke der Verarbeitung", "Bereitstellung vertraglicher Leistungen und Kundenservice. Kontaktanfragen und Kommunikation. Direktmarketing. Verwaltung und Beantwortung von Anfragen."],
    ["Löschung von Daten", "Die von uns verarbeiteten personenbezogenen Daten werden gelöscht, sobald der Zweck ihrer Verarbeitung entfällt und keine gesetzlichen Aufbewahrungspflichten bestehen."],
  ];
  const html = parts.map(([heading, body]) => `<h2>${heading}</h2><p>${body}</p>`).join("");
  const sections = extractPolicySections({ html, visibleText: html.replace(/<[^>]+>/g, " "), sourceUrl });
  const evidence = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  for (const [topic, expected] of [["controller_contact", /datenschutz@example\.test/], ["processing_purposes", /Kundenservice/], ["data_retention", /sobald/]] as const) {
    const witness = evidence.find(row => row.coverageArea === topic)!;
    assert.equal(witness?.signalObserved, "observed", topic);
    assert.match(witness.selectedPolicySectionExcerpt, expected, topic);
    assert.doesNotMatch(witness.selectedPolicySectionExcerpt, /Implementierungskosten|Inhaltsübersicht/);
    assert.equal(witness.evidenceTextSha256, createHash("sha256").update(witness.selectedPolicySectionExcerpt).digest("hex"));
  }
  for (const [topic, text] of [["controller_contact", parts[0]!.join(". ")], ["processing_purposes", parts[1]!.join(". ")], ["data_retention", parts[1]!.join(". ")]] as const) {
    for (const mode of ["scan_core", "multilingual_classifier", "retained_report"] as const) {
      assert.notEqual(article13DisclosureRejectReason(text, topic, { mode }), null, `${topic}/${mode}`);
    }
  }
});

test("bounded inventories reserve late distinct disclosures rather than repeated topics", () => {
  const repeated = Array.from({ length: 95 }, (_, index) => `<h2>Processing ${index}</h2><p>We process your personal data to provide our services and respond to your requests. Our legal basis for processing personal data is consent and legitimate interests in operating our services.</p>`).join("");
  for (const [heading, body] of [
    ["Retention", "We retain your personal data for three years after your account closes, then delete it unless a legal obligation requires further retention."],
    ["Speicherdauer", "Wir speichern personenbezogene Daten drei Jahre nach dem Ende der Dienstleistungsbeziehung und löschen sie anschließend, sofern keine gesetzliche Aufbewahrungspflicht eine längere Speicherung verlangt."],
  ]) {
    const html = repeated + `<h2>${heading}</h2><p>${body}</p>`;
    const extracted = extractPolicySections({ html, visibleText: html.replace(/<[^>]+>/g, " "), sourceUrl });
    assert.ok(extracted.length <= 80);
    const retained = retainedPolicySectionsForObservation(extracted);
    assert.ok(retained.length <= 24);
    const row = retainedArticle13SectionEvidenceFromSections(retained, sourceUrl).find((row) => row.coverageArea === "data_retention");
    assert.equal(row?.signalObserved, "observed", `${heading}: ${JSON.stringify(extracted.filter((section) => section.textExcerpt.includes("Wir speichern")))}`);
    assert.ok(row?.selectedPolicySectionExcerpt.includes(body));
    for (const section of retained) assert.ok(extracted.includes(section), "source binding must remain intact");
  }
});
const sections = [
  ["1. Data controller and contact", "The controller for personal data processed directly by Example is Example Limited, based in Italy. This policy describes processing by the controller, not independent third-party services. Email: privacy@example.test"],
  ["9. Recipients and service providers", "Personal data may be disclosed only as needed to: website hosting, infrastructure, security, email and support providers; professional advisers, public authorities or courts where disclosure is lawfully required or necessary to establish, exercise or defend legal claims."],
  ["12. Automated analysis and human review", "Example produces analytical indicators and recommendations for human review. It does not currently change advertising campaigns automatically. Example is not intended to make decisions about natural persons based solely on automated processing that produce legal or similarly significant effects within Article 22 GDPR."],
  ["14. Your data-protection rights", "Where the GDPR applies, you may have the right to access, rectify, erase or restrict personal data; object to processing based on legitimate interests. You also have rights concerning qualifying solely automated decisions. You may complain to the Garante per la protezione dei dati personali in Italy or the competent supervisory authority where you live, work or where the alleged issue occurred."],
];
const html = sections.map(([heading, body]) => `<h2>${heading}</h2><p>${body}</p>`).join("") +
  "<h2>11. Retention</h2><table><tr><th>Record</th><th>Typical retention</th></tr><tr><td>Consent choice</td><td>Up to 180 days, plus only what is reasonably necessary to demonstrate compliance</td></tr></table>" +
  "<h2>3. Data, purposes and legal bases</h2><table><tr><th>Data/category</th><th>Purpose</th><th>GDPR legal basis</th></tr><tr><td>Consent record</td><td>Remember and demonstrate your privacy choice</td><td>Legal obligation and legitimate interests in consent management (Art. 6(1)(c) and (f))</td></tr></table>";

test("structural policy evidence retains complete disclosures and source binding", () => {
  const extracted = extractPolicySections({ html, visibleText: html.replace(/<[^>]+>/g, " "), sourceUrl });
  const evidence = retainedArticle13SectionEvidenceFromSections(extracted, sourceUrl);
  for (const topic of ["controller_contact", "recipients_or_vendor_categories", "data_retention", "legal_basis", "supervisory_authority", "automated_decision_making_or_profiling"]) {
    const row = evidence.find((row) => row.coverageArea === topic);
    assert.equal(row?.signalObserved, "observed", `${topic}: ${JSON.stringify(row)}`);
    assert.equal(row?.selectedPolicySectionUrl, sourceUrl);
    assert.equal(row?.evidenceTextSha256, createHash("sha256").update(row!.selectedPolicySectionExcerpt).digest("hex"));
    assert.match(row!.sourceDocumentTextSha256!, /^[a-f0-9]{64}$/);
    for (const mode of ["scan_core", "retained_report"] as const) {
      assert.equal(article13DisclosureRejectReason(row!.selectedPolicySectionExcerpt, topic, { mode }), null, `${topic} ${mode}`);
    }
  }
  assert.match(evidence.find((row) => row.coverageArea === "controller_contact")!.selectedPolicySectionExcerpt, /privacy@example.test/);
  assert.match(evidence.find((row) => row.coverageArea === "legal_basis")!.selectedPolicySectionExcerpt, /Art\. 6\(1\)\(c\) and \(f\)/);
  assert.match(evidence.find((row) => row.coverageArea === "automated_decision_making_or_profiling")!.selectedPolicySectionHeading, /12\./);
  const retention = evidence.find((row) => row.coverageArea === "data_retention")!;
  assert.match(retention.selectedPolicySectionExcerpt, /Typical retention: Up to 180 days/);
});

test("generic rights and navigation do not establish automated decision practices", () => {
  for (const text of [sections[3]![1]!, "You also have rights concerning qualifying solely automated decisions.", "Privacy policy | Recipients | Retention | Automated decisions | Contact us"]) {
    assert.notEqual(article13DisclosureRejectReason(text, "automated_decision_making_or_profiling"), null);
  }
  assert.notEqual(article13DisclosureRejectReason("Warranty information. Typical retention: Up to 180 days of battery power for the device.", "data_retention"), null);
});

test("localized structural evidence keeps complete retention passages", () => {
  for (const [heading, body] of [
    ["Speicherdauer personenbezogener Daten", "Wir speichern personenbezogene Daten drei Jahre nach dem Ende der Dienstleistungsbeziehung und löschen sie anschließend, sofern keine gesetzliche Aufbewahrungspflicht eine längere Speicherung verlangt."],
    ["Durée de conservation", "Nous conservons vos données personnelles pendant trois ans après la fin de notre relation contractuelle, puis nous les supprimons sauf si une obligation légale exige une conservation plus longue."],
  ]) {
    const html = `<h2>${heading}</h2><p>${body}</p>`;
    const extracted = extractPolicySections({ html, visibleText: `${heading} ${body}`, sourceUrl });
    const row = retainedArticle13SectionEvidenceFromSections(extracted, sourceUrl).find((row) => row.coverageArea === "data_retention");
    assert.equal(row?.signalObserved, "observed", heading);
    assert.ok(row?.selectedPolicySectionExcerpt.includes(body!), heading);
  }
});

test("policy coverage separates retained document and section extraction without absence credit", () => {
  const diagnostics = buildGdprTransparencyTopicCoverageDiagnostics({
    documentRole: "policy_document",
    ownership: { targetRelationship: "target_controller" },
    documentTextCoverage: { status: "complete", sourceTextChars: 2000, retainedTextChars: 2000, limitationKeys: [] },
    contentCoverage: { status: "truncated", sourceTextChars: 2000, extractedSectionCount: 30, retainedSectionCount: 24, retainedTableRowCount: 1, limitationKeys: ["policy_section_inventory_bounded"] },
    sectionEvidence: [],
  });
  for (const diagnostic of diagnostics) {
    const row = gdprTransparencyTopicCoverageDiagnosticSchema.parse(diagnostic);
    assert.equal(row.documentRetentionState, "complete");
    assert.equal(row.sectionExtractionState, "truncated");
    assert.equal(row.evaluationState, "unknown");
    assert.equal(row.coverageState, "limited");
  }
});

test("every localized behavioral practice retains its original policy quote and hashes", async () => {
  const {behavioralProfilingFixtures} = await import("../../certscore-contracts/src/test-fixtures/behavioral-profiling");
  for (const [locale, tracking, newsletter] of behavioralProfilingFixtures) {
    for (const body of [tracking, newsletter]) {
      const context = "This privacy policy explains how we process personal data and how you can exercise your choices.";
      const html = `<main><h2>Privacy policy</h2><p>${context} ${body}</p></main>`;
      const sections = extractPolicySections({html, visibleText: `Privacy policy ${context} ${body}`, sourceUrl});
      const evidence = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
      const witness = evidence.find(row => row.coverageArea === "automated_decision_making_or_profiling");
      assert.equal(witness?.signalObserved, "observed", `${locale}: ${body}`);
      assert.ok(witness!.selectedPolicySectionExcerpt.includes(body), "retain verbatim source, including accents and punctuation");
      assert.equal(witness!.selectedPolicySectionUrl, sourceUrl);
      assert.equal(witness!.evidenceTextSha256, createHash("sha256").update(witness!.selectedPolicySectionExcerpt).digest("hex"));
      assert.match(witness!.sourceDocumentTextSha256!, /^[a-f0-9]{64}$/);
    }
  }
});
