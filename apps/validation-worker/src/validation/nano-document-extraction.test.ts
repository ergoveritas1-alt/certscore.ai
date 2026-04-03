import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNanoDocumentExtraction } from "./nano-document-extraction";

test("normalizeNanoDocumentExtraction maps parsed nano output into policy-style fields", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText: "This privacy policy explains access and deletion rights. Contact privacy@example.com.",
    parsed: {
      policyAmbiguityScore: 61,
      policyCoverageRatio: 0.72,
      policyChildrenReference: "none",
      policyDsarMechanism: "partial",
      policyMentions: [{ topic: "gpc_disclosure" }],
      policyRightsSignals: ["access_request", "delete_request"],
      policySnippetCount: 4,
      policyStructurallyWeak: false,
      policySummaryShort: "Privacy policy discloses access and deletion rights.",
      policyTransferMechanisms: ["sccs"],
      policyRetentionPeriods: [{ period: "30 days", scope: "analytics logs" }],
      privacyContactChannelType: "email",
      semanticConfidence: 0.81
    },
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.equal(result.extractedFields.page_type, "privacy_policy");
  assert.equal(result.extractedFields.page_url, "https://example.com/privacy");
  assert.equal(result.extractedFields.policy_dsar_mechanism, "partial");
  assert.equal(result.extractedFields.policy_ambiguity_score, 61);
  assert.equal(result.extractedFields.policy_coverage_ratio, 0.72);
  assert.deepEqual(result.extractedFields.policy_rights_signals, ["access_request", "delete_request"]);
  assert.equal(result.extractedFields.policy_snippet_count, 4);
  assert.equal(result.extractedFields.policy_structurally_weak, false);
  assert.deepEqual(result.extractedFields.policy_transfer_mechanisms, ["sccs"]);
  assert.equal(result.extractedFields.privacy_contact_channel_type, "email");
  assert.equal(result.semanticConfidence, 0.81);
});

test("normalizeNanoDocumentExtraction backfills strong mention topics and email contact from document text", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "We honor Global Privacy Control (GPC). We may use cookies and pixels for targeted advertising with advertising partners. Contact privacy@example.com for questions.",
    parsed: {
      policyMentions: [],
      policySummaryShort: "Privacy notice."
    },
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Notice"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.equal(result.extractedFields.privacy_contact_channel_type, "email");
  assert.deepEqual(result.extractedFields.policy_mentions, [
    { topic: "gpc_disclosure" },
    { topic: "tracking_technologies_disclosure" },
    { topic: "targeted_advertising_disclosure" },
    { topic: "third_party_advertising_disclosure" }
  ]);
});
