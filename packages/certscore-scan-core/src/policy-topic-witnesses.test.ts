import test from "node:test";
import assert from "node:assert/strict";
import retainedAccount from "../../certscore-contracts/src/test-fixtures/retained-account-retention.json";
import retainedCompetition from "../../certscore-contracts/src/test-fixtures/retained-competition-retention.json";
import retainedPostalController from "../../certscore-contracts/src/test-fixtures/retained-polish-postal-controller.json";
import retainedCategoryRetention from "../../certscore-contracts/src/test-fixtures/retained-personal-category-retention.json";
import retainedPrizeRecipients from "../../certscore-contracts/src/test-fixtures/retained-prize-recipient-disclosure.json";
import retainedDutchContact from "../../certscore-contracts/src/test-fixtures/retained-dutch-privacy-contact.json";
import retainedPolishContact from "../../certscore-contracts/src/test-fixtures/retained-polish-controller-contact.json";
import retainedLifecycleRetention from "../../certscore-contracts/src/test-fixtures/retained-lifecycle-retention.json";
import retainedPolishPurpose from "../../certscore-contracts/src/test-fixtures/retained-polish-correspondence-purpose.json";
import retainedPortugueseDpo from "../../certscore-contracts/src/test-fixtures/retained-portuguese-dpo-definition.json";
import { createHash } from "node:crypto";
import { INFORMAL_GERMAN_POLICY_CLAUSES, INADEQUATE_PURPOSE_WITNESSES, DATA_BOUND_PURPOSE_TABLE } from "../../certscore-contracts/src/test-fixtures/policy-topic-witnesses";
import { extractPolicySections, retainedArticle13SectionEvidenceFromSections, gdprTransparencyTopicCandidatesFromText } from "./scanners/policy-surface-scanner";

const sourceUrl = "https://publisher.example/privacy";

test("prize recipient witness selects the explicit contact-data clause instead of aggregate survey results", () => {
  const f = retainedPrizeRecipients;
  const section = {...f.section, extractionState: "complete" as const, quality: "strong" as const,
    extractionMethod: "html_heading_hierarchy" as const, sourceOffsetBasis: "sanitized_html" as const};
  const witness = retainedArticle13SectionEvidenceFromSections([section], f.sourceUrl)
    .find(w => w.coverageArea === "recipients_or_vendor_categories");
  assert.equal(witness?.signalObserved, "observed");
  assert.equal(witness?.selectedPolicySectionExcerpt, f.clause);
  assert.equal(witness?.sourceDocumentTextSha256, f.section.documentTextSha256);
  assert.equal(witness?.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(witness?.evidenceTextSha256, createHash("sha256").update(f.clause).digest("hex"));
});

test("retained markup-bearing policy section yields the exact category retention witness and original source binding", () => {
  const f = retainedCategoryRetention;
  const section = {...f.section, extractionState: "complete" as const, quality: "strong" as const,
    extractionMethod: "canonical_topic_window" as const, sourceOffsetBasis: "normalized_visible_text" as const};
  const witness = retainedArticle13SectionEvidenceFromSections([section], f.sourceUrl)
    .find(w => w.coverageArea === "data_retention");
  assert.equal(witness?.signalObserved, "observed");
  assert.equal(witness?.selectedPolicySectionExcerpt, f.clause);
  assert.equal(witness?.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(witness?.sourceDocumentTextSha256, f.section.documentTextSha256);
  assert.equal(witness?.evidenceTextSha256, createHash("sha256").update(f.clause).digest("hex"));
});

test("controller witness retains the complete postal quote and original truncated-section proof", () => {
  const f = retainedPostalController;
  const section = {...f.section, extractionState: "truncated" as const, quality: "strong" as const,
    extractionMethod: "html_heading_hierarchy" as const, sourceOffsetBasis: "sanitized_html" as const};
  const witness = retainedArticle13SectionEvidenceFromSections([section], f.sourceUrl).find(w => w.coverageArea === "controller_contact");
  assert.ok(witness);
  assert.equal(witness.selectedPolicySectionExcerpt, f.clause);
  assert.equal(witness.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(witness.sourceDocumentTextSha256, f.section.documentTextSha256);
  assert.equal(witness.evidenceTextSha256, createHash("sha256").update(f.clause).digest("hex"));
  assert.equal(witness.sectionExtractionState, "truncated");
  assert.equal(witness.extractionLimitation, "selected_policy_section_truncated_by_retention_limit");
});

test("retained entrant-data lifecycle produces an exact bounded source witness", () => {
  const f = retainedCompetition;
  const sections = extractPolicySections({html: "", visibleText: f.section.textExcerpt, sourceUrl: f.sourceUrl});
  const witness = retainedArticle13SectionEvidenceFromSections(sections, f.sourceUrl)
    .find(w => w.coverageArea === "data_retention" && w.signalObserved === "observed");
  assert.ok(witness);
  assert.equal(witness.selectedPolicySectionExcerpt, f.clause);
  assert.equal(witness.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(witness.evidenceTextSha256, createHash("sha256").update(f.clause).digest("hex"));
});

test("a retained DPO definition cannot remain an observed scanner witness", () => {
  const f = retainedPortugueseDpo;
  const sections = extractPolicySections({ html: "", sourceUrl: f.sourceUrl,
    visibleText: f.historicalSelectedWitness.selectedPolicySectionExcerpt });
  const dpo = retainedArticle13SectionEvidenceFromSections(sections, f.sourceUrl).find(w => w.coverageArea === "dpo_contact");
  assert.equal(f.historicalSignal.status, "observed");
  assert.equal(dpo?.signalObserved, "not_confirmed");
  if (dpo) assert.equal(dpo.selectedPolicySectionUrl, f.sourceUrl);
});

test("retained purpose extraction replaces a numbered heading with its source sentence", () => {
  const f = retainedPolishPurpose;
  const sections = extractPolicySections({ html: "", sourceUrl: f.sourceUrl,
    visibleText: `${f.historicalSelectedWitness.selectedPolicySectionExcerpt} ${f.section.textExcerpt}` });
  const purpose = retainedArticle13SectionEvidenceFromSections(sections, f.sourceUrl).find(w => w.coverageArea === "processing_purposes");
  assert.equal(purpose?.signalObserved, "observed");
  assert.equal(purpose?.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(purpose?.selectedPolicySectionExcerpt, f.clause);
  assert.equal(purpose?.evidenceTextSha256, createHash("sha256").update(f.clause).digest("hex"));
});

test("retained lifecycle criteria produce complete source-bound retention witnesses", () => {
  for (const f of retainedLifecycleRetention) {
    const sections = extractPolicySections({ html: "", visibleText: f.section.textExcerpt, sourceUrl: f.sourceUrl });
    const retention = retainedArticle13SectionEvidenceFromSections(sections, f.sourceUrl).find(w => w.coverageArea === "data_retention");
    assert.equal(retention?.signalObserved, "observed", f.site);
    assert.equal(retention?.selectedPolicySectionUrl, f.sourceUrl);
    assert.ok(f.section.textExcerpt.includes(retention!.selectedPolicySectionExcerpt));
    assert.ok(retention!.selectedPolicySectionExcerpt.includes(f.clause));
    assert.equal(retention?.evidenceTextSha256, createHash("sha256").update(retention!.selectedPolicySectionExcerpt).digest("hex"));
  }
});

test("retained Polish controller enquiries produce a source-bound witness", () => {
  const f = retainedPolishContact;
  const witnesses = retainedArticle13SectionEvidenceFromSections(
    [f.contactSection] as Parameters<typeof retainedArticle13SectionEvidenceFromSections>[0], f.sourceUrl);
  const contact = witnesses.find(w => w.coverageArea === "controller_contact");
  assert.equal(f.historicalSelectedWitness.signalObserved, "not_confirmed");
  assert.equal(contact?.signalObserved, "observed");
  assert.equal(contact?.selectedPolicySectionUrl, f.sourceUrl);
  assert.ok(`${f.contactSection.heading} ${f.contactSection.textExcerpt}`.includes(contact!.selectedPolicySectionExcerpt));
  assert.match(contact!.selectedPolicySectionExcerpt, /rodo@niedziela\.pl/);
  assert.equal(contact?.evidenceTextSha256, createHash("sha256").update(contact!.selectedPolicySectionExcerpt).digest("hex"));
  assert.notEqual(witnesses.find(w => w.coverageArea === "dpo_contact")?.signalObserved, "observed");
});

test("retained Dutch contact witness replaces an unrelated controller portability reference", () => {
  const f = retainedDutchContact;
  const sections = [
    { ...f.contactSection, heading: "Recht op overdraagbaarheid van gegevens", textExcerpt: f.otherControllerCandidate.evidenceText },
    f.contactSection,
  ];
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections as Parameters<typeof retainedArticle13SectionEvidenceFromSections>[0], f.sourceUrl);
  const contact = witnesses.find(w => w.coverageArea === "controller_contact");
  assert.equal(contact?.signalObserved, "observed");
  assert.equal(contact?.selectedPolicySectionUrl, f.sourceUrl);
  assert.equal(contact?.selectedPolicySectionHeading, f.contactSection.heading);
  assert.match(contact!.selectedPolicySectionExcerpt, /Postbus 74888 1070 DN/);
  assert.equal(contact?.evidenceTextSha256, createHash("sha256").update(contact!.selectedPolicySectionExcerpt).digest("hex"));
  assert.notEqual(witnesses.find(w => w.coverageArea === "dpo_contact")?.signalObserved, "observed");
});

test("retained Dolby account lifecycle produces a source-bound retention witness", () => {
  const text = retainedAccount.historicalRejectedSignal.evidenceText;
  const sections = extractPolicySections({ html: "", sourceUrl: retainedAccount.sourceUrl, visibleText: text });
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, retainedAccount.sourceUrl);
  const retention = witnesses.find(w => w.coverageArea === "data_retention" && w.signalObserved === "observed");
  assert.ok(retention);
  assert.ok(text.includes(retention.selectedPolicySectionExcerpt));
  assert.equal(retention.selectedPolicySectionUrl, retainedAccount.sourceUrl);
});
test("source extraction preserves informal German topic witnesses and original offset/hash proof", () => {
  const text = "Datenschutzerklärung. " + INFORMAL_GERMAN_POLICY_CLAUSES.map(c => c.text).join(" ");
  const sections = extractPolicySections({html: "", sourceUrl, visibleText: text});
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const hash = createHash("sha256").update(text).digest("hex");
  for (const {topic} of INFORMAL_GERMAN_POLICY_CLAUSES) {
    const witness = witnesses.find(w => w.coverageArea === topic);
    assert.equal(witness?.signalObserved, "observed", `${topic}: ${JSON.stringify(witness)}`);
    assert.equal(witness?.selectedPolicySectionUrl, sourceUrl);
    assert.equal(witness?.sourceDocumentTextSha256, hash);
    assert.ok(text.includes(witness!.selectedPolicySectionExcerpt), topic);
    assert.equal(witness?.evidenceTextSha256, createHash("sha256").update(witness!.selectedPolicySectionExcerpt).digest("hex"));
  }
  assert.equal(new Set(gdprTransparencyTopicCandidatesFromText(text).map(c => c.topic)).size, 4);
});

test("purpose selection rejects a header/withdrawal witness and uses the actual data-bound purpose", () => {
  const text = "Privacy policy. " + INADEQUATE_PURPOSE_WITNESSES.join(" ") + " " + DATA_BOUND_PURPOSE_TABLE;
  const sections = extractPolicySections({html: `<main><h1>Privacy policy</h1><h2>Data table</h2><p>${INADEQUATE_PURPOSE_WITNESSES[0]}</p><h2>How we use your personal information</h2><p>${DATA_BOUND_PURPOSE_TABLE}</p><h2>Your rights</h2><p>${INADEQUATE_PURPOSE_WITNESSES[1]}</p></main>`, sourceUrl, visibleText: text});
  const witness = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl).find(w => w.coverageArea === "processing_purposes");
  assert.equal(witness?.signalObserved, "observed");
  assert.match(witness!.selectedPolicySectionExcerpt, /To send emails/);
  assert.match(witness!.selectedPolicySectionExcerpt, /Data categories:/);
  assert.doesNotMatch(witness!.selectedPolicySectionExcerpt, /withdraw your consent/);
  assert.ok(witness!.selectedPolicySectionExcerpt.length <= 640);
});

test("a concrete data-category purpose after collection-source sentences survives normalized-text extraction", () => {
  const text = "Privacy policy. Contact information such as name, e-mail address, postal address and phone number. Directly from you when you register for a service. Directly from you when you participate in a survey. Directly from you when you report a problem with our website. To provide you with the product or service for which you registered. To address the service problem you identified.";
  const witness = retainedArticle13SectionEvidenceFromSections(extractPolicySections({html: "", sourceUrl, visibleText: text}), sourceUrl).find(w => w.coverageArea === "processing_purposes");
  assert.equal(witness?.signalObserved, "observed", JSON.stringify(witness));
  assert.match(witness!.selectedPolicySectionExcerpt, /Contact information/);
  assert.match(witness!.selectedPolicySectionExcerpt, /To provide you with/);
  assert.ok(text.includes(witness!.selectedPolicySectionExcerpt));
});

test("topic selection replaces rights/obligation mentions with actual source disclosures", () => {
  const rights = "Conformément à la Réglementation, MGEN informera les destinataires de vos données de tout effacement, rectification de vos données, ou limitation de traitement de vos données.";
  const categories = "Vos données sont destinées aux personnels habilités de MGEN dans le cadre de leurs missions. Elles peuvent également être communiquées lorsque cela est strictement nécessaire aux partenaires, conseillers juridiques et financiers, et prestataires de MGEN.";
  const basis = "We rely on compliance with a legal obligation to retain records and to respond to lawful requests.";
  const retention = "We retain your information for as long as we need it for the purposes described in this Privacy Policy, and no longer.";
  const html = `<h2>Your rights</h2><p>${rights}</p><h2>Qui peut avoir accès à vos données ?</h2><p>${categories}</p><h2>Legal bases</h2><p>${basis}</p><h2>Data retention</h2><p>${retention}</p>`;
  const sections = extractPolicySections({html, sourceUrl, visibleText:[rights,categories,basis,retention].join(" ")});
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const recipients = witnesses.find(w=>w.coverageArea==="recipients_or_vendor_categories")!;
  const retained = witnesses.find(w=>w.coverageArea==="data_retention")!;
  assert.equal(recipients.signalObserved,"observed");
  assert.match(recipients.selectedPolicySectionExcerpt,/aux partenaires/);
  assert.doesNotMatch(recipients.selectedPolicySectionExcerpt,/informera les destinataires/);
  assert.equal(retained.signalObserved,"observed");
  assert.match(retained.selectedPolicySectionExcerpt,/for as long as we need/);
  assert.doesNotMatch(retained.selectedPolicySectionExcerpt,/legal obligation/);
});

test("nested policy tables keep each activity with its own lawful basis", () => {
  const website = "Legitimate interests: we process personal data to operate and secure our public websites and provide relevant product information to visitors.";
  const inquiries = "Contract performance: we need to process your personal data under the terms of a contract we have with you, including your requests before entering into a contract.";
  const html = `<table><tr><td>Access and use of our websites</td><td><table><tr><td>Lawful Basis</td><td>${website}</td></tr></table></td></tr><tr><td>Product inquiries</td><td><table><tr><td>Lawful Basis</td><td>${inquiries}</td></tr></table></td></tr></table>`;
  const tables = extractPolicySections({html,sourceUrl,visibleText:`Access and use of our websites Lawful Basis ${website} Product inquiries Lawful Basis ${inquiries}`}).filter(s=>s.extractionMethod==="html_table_row");
  assert.equal(tables.length,2);
  assert.match(tables[0]!.heading,/Access and use/);
  assert.match(tables[0]!.textExcerpt,/Legitimate interests/);
  assert.doesNotMatch(tables[0]!.textExcerpt,/Contract performance/);
  assert.match(tables[1]!.heading,/Product inquiries/);
  assert.doesNotMatch(tables[1]!.textExcerpt,/Access and use/);
  assert.match(tables[1]!.textExcerpt,/Contract performance/);
  for (const row of tables) assert.ok(html.slice(row.charStart,row.charEnd).includes(row.textExcerpt.split(". ").at(-1)!));
});

test("empty cells and spanning layouts do not shift values into another column", () => {
  const html = '<table><tr><th>Purpose</th><th>Legal basis</th><th>Retention</th></tr><tr><td>Account data</td><td></td><td>We retain your personal data for six months after account closure, then delete the records from our service.</td></tr><tr><td rowspan="2">Other activity</td><td>Consent</td><td>One year</td></tr><tr><td>Contract performance</td><td>Two years</td></tr></table>';
  const rows = extractPolicySections({html,sourceUrl,visibleText:""}).filter(s=>s.extractionMethod==="html_table_row");
  assert.match(rows[0]!.textExcerpt,/Legal basis: \. Retention: We retain/);
  assert.doesNotMatch(rows[0]!.textExcerpt,/Legal basis: We retain/);
  assert.ok(rows.every(row=>!row.textExcerpt.includes("Other activity")));
});

test("late full-text retention criteria survive unrelated earlier legal-basis references", () => {
  const basis="We rely on compliance with a legal obligation to retain records and to respond to lawful requests.";
  const retention="We retain your information for as long as we need it for the purposes described in this Privacy Policy, and no longer.";
  const text=`Privacy policy. ${basis} ${"This privacy notice explains the processing of personal data and the choices available to visitors. ".repeat(500)} Data Retention ${retention} We delete personal data after account closure unless statutory retention periods apply.`;
  const witness=retainedArticle13SectionEvidenceFromSections(extractPolicySections({html:"",sourceUrl,visibleText:text}),sourceUrl).find(w=>w.coverageArea==="data_retention")!;
  assert.equal(witness.signalObserved,"observed");
  assert.match(witness.selectedPolicySectionExcerpt,/for as long as we need|after account closure/);
  assert.doesNotMatch(witness.selectedPolicySectionExcerpt,/legal obligation to retain/);
  assert.ok(text.includes(witness.selectedPolicySectionExcerpt));
});
