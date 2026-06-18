import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePolicyCoverageContext,
  getWeakPolicyEvidenceLimitation
} from "./policy-coverage-context";

test("detects missing retained policy documents from nano enrichment events", () => {
  const context = derivePolicyCoverageContext({
    events: [
      {
        createdAt: "2026-06-07T22:00:00.000Z",
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          documentSourceCount: 0,
          freshExtractionCharacterCount: 0,
          policyDocumentCount: 0,
          policyEnrichmentCount: 0
        }
      }
    ]
  });

  assert.equal(context.weakPolicyEvidence, true);
  assert.equal(context.weakPolicyEvidenceReason, "no_policy_documents");
  assert.match(getWeakPolicyEvidenceLimitation(context) ?? "", /No usable privacy, cookie, or legal policy document/);
});

test("detects thin retained policy extraction from latest enrichment event", () => {
  const context = derivePolicyCoverageContext({
    events: [
      {
        createdAt: "2026-06-07T22:00:00.000Z",
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          freshExtractionCharacterCount: 20_000,
          policyDocumentCount: 1,
          policyEnrichmentCount: 1
        }
      },
      {
        createdAt: "2026-06-07T22:01:00.000Z",
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          freshExtractionCharacterCount: 33,
          policyDocumentCount: 2,
          policyEnrichmentCount: 2
        }
      }
    ]
  });

  assert.equal(context.weakPolicyEvidence, true);
  assert.equal(context.weakPolicyEvidenceReason, "thin_policy_extraction");
  assert.match(getWeakPolicyEvidenceLimitation(context) ?? "", /very small amount of text/);
});

test("canonical policy disclosure summary prevents stale no-document limitation", () => {
  const context = derivePolicyCoverageContext({
    events: [
      {
        createdAt: "2026-06-07T22:00:00.000Z",
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          documentSourceCount: 0,
          freshExtractionCharacterCount: 0,
          policyDocumentCount: 0,
          policyEnrichmentCount: 0
        }
      }
    ],
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://example.test/privacy"]
      }
    }
  });

  assert.equal(context.policyDocumentCount, 1);
  assert.equal(context.policyEnrichmentCount, 1);
  assert.equal(context.extractionCharacterCount, 4200);
  assert.equal(context.weakPolicyEvidence, false);
  assert.equal(getWeakPolicyEvidenceLimitation(context), null);
});
