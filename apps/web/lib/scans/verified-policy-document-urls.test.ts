import assert from "node:assert/strict";
import test from "node:test";
import { verifiedPolicyDocumentUrls } from "./verified-policy-document-urls";

const primary = {
  requestedUrl: "https://privacy.example.test/policy/en-us",
  finalUrl: "https://privacy.example.test/policy/en-us/",
  extractionStatus: "complete",
  artifactVerificationStatus: "verified",
  documentRole: "policy_document",
  targetRelationship: "first_party_brand",
};

test("policy snapshot counts a retained verified governing document without a checklist row", () => {
  assert.deepEqual(verifiedPolicyDocumentUrls({
    policyDisclosureSummary: {
      policyTextEvidenceProjection: {
        documents: [primary, { ...primary }],
      },
    },
  }), ["https://privacy.example.test/policy/en-us/"]);
});

test("policy snapshot does not promote indexes, unverified text, or unrelated documents", () => {
  assert.deepEqual(verifiedPolicyDocumentUrls({
    policyDisclosureSummary: {
      policyTextEvidenceProjection: {
        documents: [
          { ...primary, documentRole: "policy_index" },
          { ...primary, artifactVerificationStatus: "missing_reference" },
          { ...primary, extractionStatus: "thin" },
          { ...primary, targetRelationship: "service_provider" },
        ],
      },
    },
  }), []);
  assert.equal(verifiedPolicyDocumentUrls(null), null);
});
