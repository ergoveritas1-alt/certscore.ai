import retainedAccount from "../../../../packages/certscore-contracts/src/test-fixtures/retained-account-retention.json";
import retainedDutchContact from "../../../../packages/certscore-contracts/src/test-fixtures/retained-dutch-privacy-contact.json";
import retainedPolishContact from "../../../../packages/certscore-contracts/src/test-fixtures/retained-polish-controller-contact.json";
import retainedLifecycleRetention from "../../../../packages/certscore-contracts/src/test-fixtures/retained-lifecycle-retention.json";
import retainedPolishPurpose from "../../../../packages/certscore-contracts/src/test-fixtures/retained-polish-correspondence-purpose.json";
import retainedPortugueseDpo from "../../../../packages/certscore-contracts/src/test-fixtures/retained-portuguese-dpo-definition.json";
import test from "node:test";
import assert from "node:assert/strict";
import { INFORMAL_GERMAN_POLICY_CLAUSES, INADEQUATE_PURPOSE_WITNESSES, DATA_BOUND_PURPOSE_TABLE } from "../../../../packages/certscore-contracts/src/test-fixtures/policy-topic-witnesses";
import { extractPolicySections, gdprTransparencyTopicCandidatesFromRetainedPolicySections, gdprTransparencyTopicCandidatesFromText, mergeGdprTransparencyTopicCandidates, retainedArticle13SectionEvidenceFromSections } from "../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import { adaptGdprTransparencyTopicCandidatesForProduction } from "./gdpr-transparency-topic-evidence-adapter";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";

function project(text: string, targetRelevant = true, url = "https://publisher.example/privacy") {
  const sections = extractPolicySections({html: "", sourceUrl: url, visibleText: text});
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, url);
  const candidates = mergeGdprTransparencyTopicCandidates(gdprTransparencyTopicCandidatesFromText(text), gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections));
  const signals = witnesses.filter(w => w.signalObserved === "observed").map(w => ({
    confidence: .9, disclosureType: w.coverageArea, evidenceText: w.selectedPolicySectionExcerpt.slice(0,640),
    status: "observed" as const, source: "deterministic" as const, selectedEvidenceStrength: "strong" as const,
    selectedPolicySectionExcerpt: w.selectedPolicySectionExcerpt, selectedPolicySectionUrl: w.selectedPolicySectionUrl,
  }));
  const adapted = adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy: targetRelevant, targetUrl: new URL(url).origin + "/", pageUrl: url,
    policyTextQuality: {usable: true}, surface: {url, normalizedUrl: url, status: "fetched", surfaceType: "privacy_policy", textExcerpt: text,
      article13DisclosureSignals: signals, gdprTransparencyTopicCandidates: candidates}});
  const runtimeArtifacts = {policyDisclosureSummary: {article13DisclosureSignals: adapted.acceptedProductionSignals, gdprTransparencyEvidenceProfile: adapted.profile, gdprTransparencyProductionEvidenceEnabled: adapted.productionEvidenceEnabled}};
  const concerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited: false, events: [], normalizedConcerns: concerns, runtimeArtifacts, scanCompleted: true, snapshot: {}});
  const rows = deriveGdprEprivacyCoverageChecklist({coverageLimited: false, coverageOutcomes: outcomes, projectedFindings: [], scanCompleted: true, unifiedFindings: []});
  return {adapted, concerns, rows};
}

test("DPO definition credit fails closed through the canonical policy pipeline and retained-witness adapter", () => {
  const f = retainedPortugueseDpo;
  const text = f.historicalSelectedWitness.selectedPolicySectionExcerpt;
  const { adapted, concerns, rows } = project(text, true, f.sourceUrl);
  assert.ok(!adapted.acceptedProductionSignals.some(s => s.disclosureType === "dpo_contact"));
  assert.ok(!concerns.some(c => c.originKey === "gdpr_transparency.article13.dpo_contact"));
  assert.equal(rows.find(r => r.id === "dpo_contact_point_disclosure")?.status, "Not confirmed");
  const retained = adaptGdprTransparencyTopicCandidatesForProduction({ isTargetRelevantPrivacyPolicy: true,
    targetUrl: "https://rdstation.com/", pageUrl: f.sourceUrl, policyTextQuality: { usable: true },
    surface: { url: f.sourceUrl, normalizedUrl: f.sourceUrl, status: "fetched", surfaceType: "privacy_policy", textExcerpt: text,
      article13DisclosureSignals: [f.historicalSignal], gdprTransparencyTopicCandidates: [f.historicalCandidate] } as any,
  });
  assert.ok(!retained.acceptedProductionSignals.some(s => s.disclosureType === "dpo_contact"));
  assert.equal(f.historicalSignal.status, "observed"); // Historical artifact is unchanged.
  // Synthetic independent contact control; no such contact is inferred for the retained site.
  const contact = `${text} ${"General policy information. ".repeat(30)} Our data protection officer can be contacted at dpo@example.test.`;
  assert.equal(project(contact, true, f.sourceUrl).rows.find(r => r.id === "dpo_contact_point_disclosure")?.status, "Observed");
  assert.equal(project(contact, false, f.sourceUrl).adapted.acceptedProductionSignals.length, 0);
});

test("Polish purpose projection uses the actual clause and rejects the historical heading-only witness", () => {
  const f = retainedPolishPurpose;
  const { adapted, concerns, rows } = project(f.section.textExcerpt, true, f.sourceUrl);
  const purpose = adapted.acceptedProductionSignals.find(s => s.disclosureType === "processing_purposes");
  assert.ok(purpose, JSON.stringify(adapted.dispositions));
  assert.equal(purpose.evidenceText, f.clause);
  assert.equal(purpose.selectedPolicySectionUrl, f.sourceUrl);
  assert.ok(purpose.classifierReasonCodes.includes("article13_disclosure_eligibility.v12"));
  const basis = adapted.acceptedProductionSignals.find(s => s.disclosureType === "legal_basis");
  assert.equal(basis?.evidenceText, f.legalBasisClause);
  assert.ok(concerns.some(c => c.originKey === "gdpr_transparency.article13.processing_purposes"));
  assert.equal(rows.find(r => r.id === "processing_purposes_disclosure")?.status, "Observed");
  assert.equal(rows.find(r => r.id === "legal_basis_disclosure_observed")?.status, "Observed");
  const headingOnly = project(f.historicalSelectedWitness.selectedPolicySectionExcerpt, true, f.sourceUrl);
  assert.ok(!headingOnly.adapted.acceptedProductionSignals.some(s => ["processing_purposes", "legal_basis"].includes(s.disclosureType)));
  assert.notEqual(headingOnly.rows.find(r => r.id === "processing_purposes_disclosure")?.status, "Observed");
  assert.equal(project(f.section.textExcerpt, false, f.sourceUrl).adapted.acceptedProductionSignals.length, 0);
});

test("retained native lifecycle criteria reach the retention checklist only for their governing policies", () => {
  for (const f of retainedLifecycleRetention) {
    const { adapted, concerns, rows } = project(f.section.textExcerpt, true, f.sourceUrl);
    const retention = adapted.acceptedProductionSignals.find(s => s.disclosureType === "data_retention");
    assert.ok(retention, `${f.site}: ${JSON.stringify(adapted.dispositions)}`);
    assert.ok(f.section.textExcerpt.includes(retention.evidenceText));
    assert.ok(retention.evidenceText.includes(f.clause));
    assert.equal(retention.selectedPolicySectionUrl, f.sourceUrl);
    assert.ok(retention.classifierReasonCodes.includes("article13_disclosure_eligibility.v12"));
    assert.ok(concerns.some(c => c.originKey === "gdpr_transparency.article13.data_retention"));
    assert.equal(rows.find(r => r.id === "retention_disclosure_observed")?.status, "Observed", f.site);
    assert.equal(project(f.section.textExcerpt, false, f.sourceUrl).adapted.acceptedProductionSignals.length, 0);
  }
});

test("retained Polish controller enquiry evidence reaches the canonical checklist only for its target policy", () => {
  const f = retainedPolishContact;
  const { adapted, concerns, rows } = project(f.contactSection.textExcerpt, true, f.sourceUrl);
  const contact = adapted.acceptedProductionSignals.find(s => s.disclosureType === "controller_contact");
  assert.ok(contact, JSON.stringify(adapted.dispositions));
  assert.ok(f.contactSection.textExcerpt.includes(contact.evidenceText));
  assert.equal(contact.selectedPolicySectionUrl, f.sourceUrl);
  assert.ok(contact.classifierReasonCodes.includes("article13_disclosure_eligibility.v12"));
  assert.ok(concerns.some(c => c.originKey === "gdpr_transparency.article13.controller_contact"));
  assert.equal(rows.find(r => r.id === "controller_contact_disclosure")?.status, "Observed");
  assert.notEqual(rows.find(r => r.id === "dpo_contact_point_disclosure")?.status, "Observed");
  assert.equal(project(f.contactSection.textExcerpt, false, f.sourceUrl).adapted.acceptedProductionSignals.length, 0);
});

test("retained Dutch postal contact reaches the controller checklist without borrowing an English witness", () => {
  const f = retainedDutchContact;
  const text = `${f.otherControllerCandidate.evidenceText} ${f.contactSection.textExcerpt}`;
  const { adapted, concerns, rows } = project(text, true, f.sourceUrl);
  const contact = adapted.acceptedProductionSignals.find(s => s.disclosureType === "controller_contact");
  assert.ok(contact, JSON.stringify(adapted.dispositions));
  assert.match(contact.evidenceText, /Postbus 74888 1070 DN/);
  assert.ok(text.includes(contact.evidenceText));
  assert.equal(contact.selectedPolicySectionUrl, f.sourceUrl);
  assert.ok(contact.classifierReasonCodes.includes("article13_disclosure_eligibility.v12"));
  assert.ok(concerns.some(c => c.originKey === "gdpr_transparency.article13.controller_contact"));
  assert.equal(rows.find(r => r.id === "controller_contact_disclosure")?.status, "Observed");
  assert.notEqual(rows.find(r => r.id === "dpo_contact_point_disclosure")?.status, "Observed");
  assert.notEqual(project(f.englishPartialSignal.evidenceText, true, f.englishPartialSignal.selectedPolicySectionUrl)
    .rows.find(r => r.id === "controller_contact_disclosure")?.status, "Observed");
  assert.notEqual(project(f.otherControllerCandidate.evidenceText, true, f.sourceUrl)
    .rows.find(r => r.id === "controller_contact_disclosure")?.status, "Observed");
  assert.equal(project(text, false, f.sourceUrl).adapted.acceptedProductionSignals.length, 0);
});

test("informal German source evidence traverses normalization, concern policy and canonical checklist", () => {
  const text = "Datenschutzerklärung. " + INFORMAL_GERMAN_POLICY_CLAUSES.map(c => c.text).join(" ");
  const {adapted, concerns, rows} = project(text);
  assert.deepEqual(adapted.acceptedProductionSignals.map(s => s.disclosureType).sort(), [...new Set(INFORMAL_GERMAN_POLICY_CLAUSES.map(c => c.topic))].sort());
  assert.equal(concerns.filter(c => c.originKey.startsWith("gdpr_transparency.article13.")).length, 4);
  for (const id of ["processing_purposes_disclosure", "recipients_vendor_categories_disclosure", "retention_disclosure_observed", "data_subject_rights_disclosure"])
    assert.equal(rows.find(r => r.id === id)?.status, "Observed", id);
  for (const id of ["legal_basis_disclosure_observed", "controller_contact_disclosure", "dpo_contact_point_disclosure", "automated_decision_making_profiling_disclosure"])
    assert.notEqual(rows.find(r => r.id === id)?.status, "Observed", id);
  for (const signal of adapted.acceptedProductionSignals) assert.ok(text.includes(signal.evidenceText));
});

test("unowned German source evidence cannot be rescued by a strong retained witness", () => {
  const text = "Datenschutzerklärung. " + INFORMAL_GERMAN_POLICY_CLAUSES.map(c => c.text).join(" ");
  const {adapted, concerns} = project(text, false);
  assert.equal(adapted.acceptedProductionSignals.length, 0);
  assert.equal(concerns.filter(c => c.originKey.startsWith("gdpr_transparency.article13.")).length, 0);
});

test("a correct purpose quote survives the canonical pipeline after weak quotes are rejected", () => {
  const text = "Privacy policy. " + INADEQUATE_PURPOSE_WITNESSES.join(" ") + " " + DATA_BOUND_PURPOSE_TABLE;
  const {adapted, rows} = project(text);
  const signal = adapted.acceptedProductionSignals.find(s => s.disclosureType === "processing_purposes");
  assert.ok(signal, JSON.stringify(adapted.dispositions));
  assert.match(signal.evidenceText, /To send emails/);
  assert.doesNotMatch(signal.evidenceText, /withdraw your consent/);
  assert.equal(rows.find(r => r.id === "processing_purposes_disclosure")?.status, "Observed");
});

test("a source-bound account-active retention criterion remains Observed after canonical policy review", () => {
  for (const clause of [
    "We retain your data for as long as your account is active, or as long as is needed to provide you with the Service.",
    "We retain your information for as long as we need it for the purposes described in this Privacy Policy, and no longer.",
  ]) {
    const {rows}=project(`Privacy policy. Data retention. ${clause}`);
    assert.equal(rows.find(row=>row.id==="retention_disclosure_observed")?.status,"Observed",clause);
  }
  const {rows}=project("Privacy policy. We rely on compliance with a legal obligation to retain records and to respond to lawful requests.");
  assert.notEqual(rows.find(row=>row.id==="retention_disclosure_observed")?.status,"Observed");
});

test("retained account retention passes the canonical pipeline only for target-relevant policy content", () => {
  const text = retainedAccount.historicalRejectedSignal.evidenceText;
  const { adapted, concerns, rows } = project(text, true, retainedAccount.sourceUrl);
  const signal = adapted.acceptedProductionSignals.find(s => s.disclosureType === "data_retention");
  assert.ok(signal);
  assert.ok(signal.classifierReasonCodes.includes("article13_disclosure_eligibility.v12"));
  assert.ok(text.includes(signal.evidenceText));
  assert.equal(signal.selectedPolicySectionUrl, retainedAccount.sourceUrl);
  assert.ok(concerns.some(c => c.originKey === "gdpr_transparency.article13.data_retention"));
  assert.equal(rows.find(r => r.id === "retention_disclosure_observed")?.status, "Observed");
  const unowned = project(text, false, retainedAccount.sourceUrl);
  assert.equal(unowned.adapted.acceptedProductionSignals.length, 0);
});
