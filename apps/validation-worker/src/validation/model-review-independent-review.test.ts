import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIndependentPolicyReviewPacket,
  independentPolicyReviewResponseSchema,
  mergeIndependentPolicyReviewResponses,
  POLICY_REVIEW_INDEPENDENCE_ATTESTATION
} from "./model-review-independent-review";
import type { PolicyReviewPacket } from "./model-policy-review";
import {
  policyReviewGoldCorpusSchema,
  type PolicyReviewGoldCorpus
} from "./model-review-gold-corpus";

const SCAN_ID = "00000000-0000-4000-8000-000000000000";

function modelPacket(): PolicyReviewPacket {
  return {
    contentHash: "model-packet-hash-must-not-be-trusted-for-human-review",
    documents: [{
      canonicalUrl: "https://example.com/privacy",
      contentCoverage: {
        status: "complete",
        sourceTextChars: 58,
        extractedSectionCount: 1,
        retainedSectionCount: 1,
        retainedStrongSectionCount: 1,
        retainedTableRowCount: 0,
        limitationKeys: [],
        packetTextTruncated: false
      },
      documentEvaluationState: "usable",
      documentFetchState: "fetched",
      documentId: "document-1",
      documentOwnerEntity: "example.com",
      documentType: "privacy_policy",
      extractedCandidates: {
        processing_purposes: "model-derived-candidate-must-not-appear"
      },
      ownershipConfidence: 0.98,
      ownershipReasonCodes: ["same_registrable_domain_as_scan_target"],
      targetRelationship: "target_controller",
      text: "We use account data to provide the requested service."
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: { coverageStatus: "complete" },
      runtimeCoverage: { coverageStatus: "usable" }
    },
    policyCandidates: [{
      policy_summary_short: "model-derived-summary-must-not-appear"
    }],
    runtimeContext: {
      trackerVendors: [{ vendor: "Example Analytics", observedAtMs: 1250 }]
    },
    scanContext: {
      region: "eu-west-1",
      targetUrl: "https://example.com/"
    },
    scanDate: "2026-07-25T12:00:00.000Z",
    scanId: SCAN_ID
  };
}

function corpus(): PolicyReviewGoldCorpus {
  return policyReviewGoldCorpusSchema.parse({
    contractVersion: "policy_review_gold_corpus.v1",
    description: "Independent review test corpus.",
    entries: Array.from({ length: 25 }, (_, index) => ({
      caseId: `case-${index}`,
      scanId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      targetUrl: `https://site-${index}.example/`,
      reviewStatus: index === 0 ? "provisional" : "pending",
      ...(index === 0
        ? {
            reviewer: "calibration-review",
            reviewedAt: "2026-07-24T12:00:00.000Z",
            evidenceNotes: ["Provisional calibration only."],
            expected: {
              processing_purposes: "ambiguous",
              legal_basis: "ambiguous",
              data_retention: "ambiguous",
              international_transfers: "ambiguous",
              vendor_disclosures: "ambiguous",
              data_subject_rights: "ambiguous",
              cookie_inventory: "ambiguous",
              policy_runtime_consistency: "ambiguous"
            }
          }
        : {
            evidenceNotes: [],
            expected: {}
          })
    }))
  });
}

function completedResponse(packet: ReturnType<typeof buildIndependentPolicyReviewPacket>) {
  return independentPolicyReviewResponseSchema.parse({
    contractVersion: "policy_review_independent_response.v1",
    caseId: packet.caseId,
    scanId: packet.scanId,
    targetUrl: packet.targetUrl,
    evidenceHash: packet.evidenceHash,
    reviewer: {
      reviewerId: "human-reviewer-17",
      reviewedAt: "2026-07-25T13:00:00.000Z",
      reviewMethod: "human_evidence_only",
      modelOutputsConsulted: false,
      provisionalLabelsConsulted: false,
      independenceAttestation: POLICY_REVIEW_INDEPENDENCE_ATTESTATION
    },
    decisions: Object.fromEntries([
      "processing_purposes",
      "legal_basis",
      "data_retention",
      "international_transfers",
      "vendor_disclosures",
      "data_subject_rights",
      "cookie_inventory",
      "policy_runtime_consistency"
    ].map((topic) => [
      topic,
      {
        status: "observed",
        rationale: "The retained policy text directly supports this topic-specific decision.",
        evidenceRefs: ["document-1"]
      }
    ]))
  });
}

test("independent packet includes only reviewable retained evidence, not model-derived candidates", () => {
  const packet = buildIndependentPolicyReviewPacket({
    caseId: "case-0",
    modelPacket: modelPacket(),
    targetUrl: "https://site-0.example/",
    generatedAt: "2026-07-25T12:30:00.000Z"
  });
  const serialized = JSON.stringify(packet);

  assert.equal(packet.productionEligible, false);
  assert.equal(packet.evidence.documents[0]?.text, modelPacket().documents[0]?.text);
  assert.doesNotMatch(serialized, /model-derived-candidate/);
  assert.doesNotMatch(serialized, /model-derived-summary/);
  assert.doesNotMatch(serialized, /policyCandidates|extractedCandidates/);
  assert.match(
    packet.instructions.topics.cookie_inventory?.question ?? "",
    /runtime or policy evidence/
  );
  assert.match(
    packet.instructions.topics.cookie_inventory?.observedStandard ?? "",
    /identifier presence, not policy inventory completeness/
  );
});

test("valid independent response replaces provisional labels and preserves them only as baseline", () => {
  const packet = buildIndependentPolicyReviewPacket({
    caseId: "case-0",
    modelPacket: modelPacket(),
    targetUrl: "https://site-0.example/"
  });
  const merged = mergeIndependentPolicyReviewResponses({
    corpus: corpus(),
    packets: [packet],
    responses: [completedResponse(packet)]
  });
  const entry = merged.entries[0];

  assert.equal(entry?.reviewStatus, "independently_reviewed");
  assert.equal(entry?.reviewer, "human-reviewer-17");
  assert.equal(entry?.expected.processing_purposes, "observed");
  assert.equal(entry?.baseline?.processing_purposes, "ambiguous");
  assert.equal(entry?.evidenceNotes.length, 8);
});

test("response ingestion rejects evidence hash drift and model-assisted reviewers", () => {
  const packet = buildIndependentPolicyReviewPacket({
    caseId: "case-0",
    modelPacket: modelPacket(),
    targetUrl: "https://site-0.example/"
  });
  const response = completedResponse(packet);

  assert.throws(
    () =>
      mergeIndependentPolicyReviewResponses({
        corpus: corpus(),
        packets: [packet],
        responses: [{ ...response, evidenceHash: "f".repeat(64) }]
      }),
    /does not match retained evidence/
  );
  assert.equal(
    independentPolicyReviewResponseSchema.safeParse({
      ...response,
      reviewer: {
        ...response.reviewer,
        reviewerId: "mini-assisted-review"
      }
    }).success,
    false
  );
  assert.equal(
    independentPolicyReviewResponseSchema.safeParse({
      ...response,
      reviewer: {
        ...response.reviewer,
        modelOutputsConsulted: true
      }
    }).success,
    false
  );
});
