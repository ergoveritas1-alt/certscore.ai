import test from "node:test";
import assert from "node:assert/strict";
import { INFORMAL_GERMAN_POLICY_CLAUSES, INADEQUATE_PURPOSE_WITNESSES, DATA_BOUND_PURPOSE_TABLE } from "../../../../packages/certscore-contracts/src/test-fixtures/policy-topic-witnesses";
import { extractPolicySections, gdprTransparencyTopicCandidatesFromRetainedPolicySections, gdprTransparencyTopicCandidatesFromText, mergeGdprTransparencyTopicCandidates, retainedArticle13SectionEvidenceFromSections } from "../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import { adaptGdprTransparencyTopicCandidatesForProduction } from "./gdpr-transparency-topic-evidence-adapter";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";

function project(text: string, targetRelevant = true) {
  const url = "https://publisher.example/privacy";
  const sections = extractPolicySections({html: "", sourceUrl: url, visibleText: text});
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, url);
  const candidates = mergeGdprTransparencyTopicCandidates(gdprTransparencyTopicCandidatesFromText(text), gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections));
  const signals = witnesses.filter(w => w.signalObserved === "observed").map(w => ({
    confidence: .9, disclosureType: w.coverageArea, evidenceText: w.selectedPolicySectionExcerpt.slice(0,640),
    status: "observed" as const, source: "deterministic" as const, selectedEvidenceStrength: "strong" as const,
    selectedPolicySectionExcerpt: w.selectedPolicySectionExcerpt, selectedPolicySectionUrl: w.selectedPolicySectionUrl,
  }));
  const adapted = adaptGdprTransparencyTopicCandidatesForProduction({isTargetRelevantPrivacyPolicy: targetRelevant, targetUrl: "https://publisher.example/", pageUrl: url,
    policyTextQuality: {usable: true}, surface: {url, normalizedUrl: url, status: "fetched", surfaceType: "privacy_policy", textExcerpt: text,
      article13DisclosureSignals: signals, gdprTransparencyTopicCandidates: candidates}});
  const runtimeArtifacts = {policyDisclosureSummary: {article13DisclosureSignals: adapted.acceptedProductionSignals, gdprTransparencyEvidenceProfile: adapted.profile, gdprTransparencyProductionEvidenceEnabled: adapted.productionEvidenceEnabled}};
  const concerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited: false, events: [], normalizedConcerns: concerns, runtimeArtifacts, scanCompleted: true, snapshot: {}});
  const rows = deriveGdprEprivacyCoverageChecklist({coverageLimited: false, coverageOutcomes: outcomes, projectedFindings: [], scanCompleted: true, unifiedFindings: []});
  return {adapted, concerns, rows};
}

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
