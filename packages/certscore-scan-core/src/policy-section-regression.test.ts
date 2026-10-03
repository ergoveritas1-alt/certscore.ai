import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { article13DisclosureRejectReason, gdprTransparencyTopicCoverageDiagnosticSchema } from "@certscore/contracts";
import { extractPolicySections, retainedPolicySectionsForObservation, retainedArticle13SectionEvidenceFromSections, buildGdprTransparencyTopicCoverageDiagnostics } from "./scanners/policy-surface-scanner.js";

const sourceUrl = "https://example.test/privacy";

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
