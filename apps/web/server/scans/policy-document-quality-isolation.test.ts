import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import test from "node:test";
import type {PolicySurfaceObservation} from "@certscore/contracts";
import {buildNormalizedConcerns} from "../../lib/scans/normalized-concerns";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

const require = createRequire(import.meta.url);
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = {exports: {}} as NodeModule;
type Signal = PolicySurfaceObservation["article13DisclosureSignals"][number];
const disclosures: Pick<Signal, "disclosureType" | "evidenceText">[] = [
  {disclosureType: "data_retention", evidenceText: "We retain personal information for as long as necessary to provide our services and comply with legal obligations."},
  {disclosureType: "processing_purposes", evidenceText: "We collect and process your personal information to provide our services, manage your account and respond to your requests."},
  {disclosureType: "data_subject_rights", evidenceText: "You have the right to access, correct and delete your personal data, and to object to processing of your personal information."},
];
const goodText = "Privacy Policy. Example Test is the controller of your personal data. We collect account and usage information to provide and secure our services. You may request access, correction and deletion of your personal data. Contact privacy@example.test for assistance. ".repeat(12);
const challenge = "Client challenge. A required part of this site could not load. Please check your connection and disable any ad blockers. Captcha required.";
function surface(id: string, text: string, withSignals = false) {
  const url = `https://example.test/${id}`;
  return {
    observationId: id, surfaceType: "privacy_policy", url, normalizedUrl: url,
    confidence: 0.99, status: "fetched", documentFetchState: "fetched",
    documentEvaluationState: "usable", documentRole: "policy_document", targetRelationship: "target_controller",
    textExcerpt: text,
    article13DisclosureSignals: withSignals ? disclosures.map((d): Signal => ({...d,
      status: "observed", confidence: 0.95, source: "deterministic",
      selectedEvidenceStrength: "strong", selectedPolicySectionExcerpt: d.evidenceText,
      selectedPolicySectionUrl: url,
    } as Signal)) : [],
    artifactRefs: [{artifactId: `policy_surface_text_${id}`, path: `/unavailable/${id}.txt`, label: "policy_surface_text"}],
    documentTextCoverage: {status: "complete", sourceTextChars: text.length, retainedTextChars: text.length, limitationKeys: []},
  };
}
async function summarize(surfaces: ReturnType<typeof surface>[], profile: string, omitText = false) {
  const {dedupePolicySurfaces, summarizePolicySurfaces} = await import("./local-v2-dag-report");
  const artifactsById = new Map(surfaces.map(s => [`policy_surface_text_${s.observationId}`, {
    artifactId: `policy_surface_text_${s.observationId}`, fileName: `${s.observationId}.txt`, text: s.textExcerpt,
    sha256: createHash("sha256").update(s.textExcerpt).digest("hex"),
    sizeBytes: Buffer.byteLength(s.textExcerpt), verificationStatus: "verified" as const,
  }]));
  return summarizePolicySurfaces(dedupePolicySurfaces(surfaces as never, "https://example.test/"), "example.test", {
    primaryLanguage: "en", targetUrl: "https://example.test/", gdprTransparencyEvidenceProfile: profile,
    policyTextEvidenceContext: {scanId: "quality-isolation", generatedAt: "2026-10-31T21:00:00Z",
      sourceBundle: {verificationStatus: "verified", schemaVersion: "certscore.v2.canonical-evidence-bundle.v1", sha256: "a".repeat(64)},
      artifactsById: omitText ? new Map() : artifactsById},
  });
}

for (const profile of ["legacy_only", "gdpr_transparency_multilingual_article13_v1"]) {
  for (const reverse of [false, true]) {
    test(`valid policy disclosures survive an unrelated challenge: ${profile}, reverse=${reverse}`, async () => {
      const good = surface("privacy", goodText + disclosures.map(d => d.evidenceText).join(" "), true);
      const before = JSON.stringify(good);
      const alone = await summarize([good], profile);
      assert.equal(alone.article13DisclosureSignals.length, 3);
      const rows = [good, surface("other", challenge)];
      const result = await summarize(reverse ? rows.reverse() : rows, profile);
      assert.deepEqual(result.article13DisclosureSignals, alone.article13DisclosureSignals);
      assert.equal(result.discardedArticle13DisclosureSignals.length, 0);
      for (const topic of disclosures.map(d => d.disclosureType)) {
        assert.equal(result.article13CoverageAssessments.find(x => x.topic === topic)?.status, "observed");
      }
      assert.equal(result.policyTextExtractionHealth.policyTextExtractionStatus, "low_quality_access_challenge");
      assert.ok(result.article13CoverageAssessments.every(x => x.coverageStatus === "insufficient"));
      assert.ok(result.article13CoverageAssessments.every(x => x.status !== "not_observed_with_sufficient_coverage"));
      const runtimeArtifacts = {policyDisclosureSummary: result};
      const normalizedConcerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
      const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts, normalizedConcerns,
        scanCompleted: true, coverageLimited: true});
      const checklist = deriveGdprEprivacyCoverageChecklist({coverageOutcomes, scanCompleted: true,
        coverageLimited: true, unifiedFindings: []});
      for (const id of ["retention_disclosure_observed", "processing_purposes_disclosure", "data_subject_rights_disclosure"]) {
        assert.equal(checklist.find(x => x.id === id)?.evidenceState, "not_testable", id);
      }
      assert.ok(!normalizedConcerns.some(c => c.originKey.startsWith("gdpr_transparency.article13.")),
        "Retaining a legacy candidate does not grant canonical production approval");
      assert.equal(JSON.stringify(good), before);
    });
  }

  test(`unusable policy cannot borrow a valid neighbor's quality: ${profile}`, async () => {
    const bad = surface("other", challenge, true);
    const alone = await summarize([bad], profile);
    assert.equal(alone.article13DisclosureSignals.length, 0);
    const result = await summarize([surface("privacy", goodText), bad], profile);
    assert.equal(result.article13DisclosureSignals.length, 0);
    assert.equal(result.discardedArticle13DisclosureSignals.length, 3);
    assert.ok(result.discardedArticle13DisclosureSignals.every(x => x.rejectReason === "code_or_non_policy_excerpt"));
  });

  test(`missing full text cannot borrow a valid neighbor's quality: ${profile}`, async () => {
    const bad = surface("other", goodText, true);
    const {artifactRefs: _refs, ...withoutArtifact} = bad;
    const result = await summarize([surface("privacy", goodText), withoutArtifact as typeof bad], profile);
    assert.equal(result.article13DisclosureSignals.length, 0);
    assert.equal(result.discardedArticle13DisclosureSignals.length, 3);
  });

  test(`retained section positives keep their existing profile support without full text: ${profile}`, async () => {
    const retained = {...surface("privacy", goodText, true),
      gdprTransparencyTopicCandidates: disclosures.map(d => ({
        topic: d.disclosureType, evidenceText: d.evidenceText, matchedTerm: d.disclosureType,
        matchedLocale: "en", classifierProvenance: "gdpr_transparency_topic_classifier.v1",
        classifierReasonCodes: [`matched_${d.disclosureType}`], confidence: 0.95,
        matchStrength: "direct", productionCredit: false, status: "diagnostic_only",
      })),
    };
    const result = await summarize([retained], profile, true);
    assert.equal(result.article13DisclosureSignals.length, profile === "legacy_only" ? 0 : 3);
    assert.ok(result.article13CoverageAssessments.every(x => x.coverageStatus === "insufficient"));
    assert.ok(result.policyTextEvidenceProjection.documents.every(x => x.extractionStatus === "unavailable"));
    const runtimeArtifacts = {policyDisclosureSummary: result};
    const normalizedConcerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
    const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts, normalizedConcerns,
      scanCompleted: true, coverageLimited: true});
    const checklist = deriveGdprEprivacyCoverageChecklist({coverageOutcomes, scanCompleted: true,
      coverageLimited: true, unifiedFindings: []});
    for (const id of ["retention_disclosure_observed", "processing_purposes_disclosure", "data_subject_rights_disclosure"]) {
      assert.equal(checklist.find(x => x.id === id)?.evidenceState,
        profile === "legacy_only" ? "not_testable" : "observed", id);
    }
  });
}
