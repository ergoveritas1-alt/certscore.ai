import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNanoDocumentExtraction } from "./nano-document-extraction";

test("normalizeNanoDocumentExtraction maps parsed nano output into policy-style fields", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText: "This privacy policy explains access and deletion rights. Contact privacy@example.com.",
    parsed: {
      policyChildrenReference: "none",
      policyDsarMechanism: "partial",
      policyMentions: [{ topic: "gpc_disclosure" }],
      policyRightsSignals: ["access_request", "delete_request"],
      policySummaryShort: "Privacy policy discloses access and deletion rights.",
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
  assert.deepEqual(result.extractedFields.policy_rights_signals, ["access_request", "delete_request"]);
  assert.equal(result.extractedFields.privacy_contact_channel_type, "email");
  assert.equal(result.semanticConfidence, 0.81);
});
