import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractPolicySections, gdprTransparencyTopicCandidatesFromRetainedPolicySections } from "../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import { adaptGdprTransparencyTopicCandidatesForProduction } from "./gdpr-transparency-topic-evidence-adapter";
import { GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE } from "./gdpr-transparency-production-profile";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";

test("test1's actual policy text supports six topic disclosures plus policy availability without display overrides", () => {
  const html = readFileSync(new URL("../../../../infra/aws/ergoveritas-canary/test1-privacy-policy.html", import.meta.url), "utf8");
  const text = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const sourceUrl = "https://ergoveritas.com/test1-privacy-policy.html";
  const sections = extractPolicySections({ html, sourceUrl, visibleText: text });
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
  const adaptation = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true, pageUrl: sourceUrl, targetUrl: "https://ergoveritas.com/test1.html",
    policyTextQuality: { usable: true }, profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: { gdprTransparencyTopicCandidates: candidates, normalizedUrl: sourceUrl, url: sourceUrl,
      surfaceType: "privacy_policy", status: "fetched", textExcerpt: text },
  });
  const runtimeArtifacts = { policyDisclosureSummary: {
    article13DisclosureSignals: adaptation.acceptedProductionSignals,
    gdprTransparencyEvidenceProfile: adaptation.profile,
    gdprTransparencyProductionEvidenceEnabled: adaptation.productionEvidenceEnabled,
  } };
  const concerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false, events: [], normalizedConcerns: concerns, runtimeArtifacts, scanCompleted: true, snapshot: {},
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false, coverageOutcomes: outcomes, projectedFindings: [], scanCompleted: true, unifiedFindings: [],
  });
  const required = ["controller_contact_disclosure", "processing_purposes_disclosure", "legal_basis_disclosure_observed",
    "recipients_vendor_categories_disclosure", "retention_disclosure_observed", "data_subject_rights_disclosure"];
  for (const rowId of required) {
    assert.equal(checklist.find(row => row.id === rowId)?.status, "Observed", `${rowId}: ${JSON.stringify(adaptation.dispositions)}`);
  }
  assert.equal(concerns.filter(row => row.originKey.startsWith("gdpr_transparency.article13.")).length, required.length);
  for (const rowId of ["international_transfers_disclosure", "supervisory_authority_complaint_disclosure", "automated_decision_making_profiling_disclosure", "dpo_contact_point_disclosure"]) {
    assert.notEqual(checklist.find(row => row.id === rowId)?.status, "Observed", rowId);
  }
  const normalizedText = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
  for (const signal of adaptation.acceptedProductionSignals) {
    assert.ok(normalizedText(text).includes(normalizedText(signal.evidenceText)), `Source-bound section for ${signal.disclosureType}`);
  }
});
