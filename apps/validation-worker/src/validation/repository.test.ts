import assert from "node:assert/strict";
import test from "node:test";
import { extractFallbackFinancialEvidenceFromRuntimeArtifacts } from "./repository";

test("extractFallbackFinancialEvidenceFromRuntimeArtifacts returns embedded financial evidence", () => {
  const result = extractFallbackFinancialEvidenceFromRuntimeArtifacts({
    key_page_discovery_summary: {
      financialValidationEvidence: {
        pageEvidence: [
          {
            evidenceId: "ev-1",
            matchedText: "Annual fee may apply",
            metadata: { matchedTerm: "annual fee" },
            pageRole: "pricing",
            pageType: "pricing",
            pageUrl: "https://example.com/pricing"
          }
        ],
        signalHits: [
          {
            evidenceRefs: ["ev-1"],
            id: "hit-1",
            pageRole: "pricing",
            pageType: "pricing",
            pageUrl: "https://example.com/pricing",
            payload: { matchedPercentage: "3.50%" },
            signalKey: "financial.apr_or_interest_rate_disclosure_text_present"
          }
        ]
      }
    }
  });

  assert.equal(result.pageEvidence.length, 1);
  assert.equal(result.signalHits.length, 1);
  assert.equal(result.signalHits[0]?.signal_key, "financial.apr_or_interest_rate_disclosure_text_present");
  assert.equal(result.pageEvidence[0]?.evidence_id, "ev-1");
});

test("extractFallbackFinancialEvidenceFromRuntimeArtifacts returns empty arrays when absent", () => {
  const result = extractFallbackFinancialEvidenceFromRuntimeArtifacts({
    key_page_discovery_summary: {
      candidates: []
    }
  });

  assert.deepEqual(result, {
    pageEvidence: [],
    signalHits: []
  });
});
