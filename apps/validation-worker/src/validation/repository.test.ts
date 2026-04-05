import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFallbackFinancialEvidenceFromRuntimeArtifacts,
  prepareScanDocumentSourceRows,
  sanitizeJsonPersistenceValue
} from "./repository";

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

test("sanitizeJsonPersistenceValue repairs lone surrogates recursively", () => {
  const sanitized = sanitizeJsonPersistenceValue({
    content: "\u0000\uD800",
    nested: {
      items: ["ok", "\u0000\uD800"]
    }
  });

  assert.deepEqual(sanitized, {
    content: "\uFFFD\uFFFD",
    nested: {
      items: ["ok", "\uFFFD\uFFFD"]
    }
  });
});

test("prepareScanDocumentSourceRows sanitizes persisted document source payloads", () => {
  const [row] = prepareScanDocumentSourceRows(
    [
      {
        canonical_url: "https://example.com/privacy",
        content_markdown: "\u0000\uD800",
        metadata_json: {
          excerpt: "\u0000\uD800"
        },
        source: "nano_doc_retrieval"
      }
    ],
    "scan-1"
  ) as Array<Record<string, unknown>>;

  assert.equal(row?.content_markdown, "\uFFFD\uFFFD");
  assert.deepEqual(row?.metadata_json, { excerpt: "\uFFFD\uFFFD" });
});
