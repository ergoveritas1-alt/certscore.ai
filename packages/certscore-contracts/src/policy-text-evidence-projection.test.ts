import assert from "node:assert/strict";
import test from "node:test";
import { policyTextEvidenceProjectionSchema } from "./index";

const completeProjection = {
  contractVersion: "certscore.policy-text-evidence-projection.v1",
  generatedAt: "2026-07-31T12:00:00.000Z",
  scanId: "scan-policy-projection",
  sourceBundle: {
    schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
    sha256: "a".repeat(64),
    sizeBytes: 42_000,
    uri: "s3://certscore-artifacts/scan/CanonicalEvidenceBundle.json",
    verificationStatus: "verified",
  },
  projectionStatus: "verified_complete",
  documents: [{
    observationId: "privacy-policy",
    artifactId: "policy_surface_text_privacy",
    artifactFileName: "policy_surface_text_privacy.txt",
    artifactSha256: "b".repeat(64),
    artifactSizeBytes: 12_000,
    artifactUri: "s3://certscore-artifacts/scan/auxiliary/policy_surface_text_privacy.txt",
    artifactVerificationStatus: "verified",
    requestedUrl: "https://example.test/privacy",
    finalUrl: "https://example.test/privacy.pdf",
    redirectChain: ["https://example.test/privacy", "https://example.test/privacy.pdf"],
    documentFormat: "pdf",
    contentType: "application/pdf",
    documentFetchState: "fetched",
    documentEvaluationState: "usable",
    documentRole: "policy_document",
    documentOwnerEntity: "Example Test",
    targetRelationship: "target_controller",
    ownershipConfidence: 0.98,
    contentCoverage: {
      status: "complete",
      sourceTextChars: 11_500,
      extractedSectionCount: 8,
      retainedSectionCount: 8,
      retainedTableRowCount: 0,
      limitationKeys: [],
    },
    documentTextCoverage: {
      status: "complete",
      sourceTextChars: 11_500,
      retainedTextChars: 11_500,
      limitationKeys: [],
    },
    retainedTextChars: 11_500,
    retainedTextSha256: "c".repeat(64),
    extractionStatus: "complete",
    limitationKeys: [],
  }],
  limitationKeys: [],
} as const;

test("policy text evidence projection retains verified PDF provenance and completeness", () => {
  const parsed = policyTextEvidenceProjectionSchema.parse(completeProjection);
  assert.equal(parsed.documents[0]?.documentFormat, "pdf");
  assert.equal(parsed.documents[0]?.artifactVerificationStatus, "verified");
  assert.equal(parsed.projectionStatus, "verified_complete");
});

test("policy text evidence projection rejects malformed checksum provenance", () => {
  assert.equal(policyTextEvidenceProjectionSchema.safeParse({
    ...completeProjection,
    sourceBundle: { ...completeProjection.sourceBundle, sha256: "not-a-checksum" },
  }).success, false);
});
