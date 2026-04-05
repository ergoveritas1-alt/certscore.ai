import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNanoPolicyInputsFromDocumentSources,
  mergeNanoPolicyInputsWithFallback,
  shouldPreferNanoDocumentSources
} from "./nano-document-sources";

test("buildNanoPolicyInputsFromDocumentSources normalizes ready document rows into policy-style inputs", () => {
  const rows = buildNanoPolicyInputsFromDocumentSources([
    {
      canonical_url: "https://www.example.com/privacy",
      document_type: "privacy_policy",
      evidence_refs: ["https://www.example.com/privacy"],
      extracted_fields_json: {
        policy_actionable_flags: ["low_confidence"],
        policy_dsar_mechanism: "partial",
        policy_rights_signals: ["access_request"],
        policy_summary_short: "Privacy disclosure text."
      },
      extraction_status: "ready",
      id: "doc-1",
      semantic_confidence: 0.74,
      source: "nano_doc_retrieval",
      source_status: "ready"
    },
    {
      document_type: "privacy_policy",
      extraction_status: "failed",
      id: "doc-2",
      source_status: "failed"
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.page_type, "privacy_policy");
  assert.equal(rows[0]?.page_url, "https://www.example.com/privacy");
  assert.equal(rows[0]?.policy_dsar_mechanism, "partial");
  assert.equal(rows[0]?.policy_semantic_confidence, 0.74);
  assert.deepEqual(rows[0]?.policy_rights_signals, ["access_request"]);
  assert.equal(rows[0]?.source_document_source, "nano_doc_retrieval");
});

test("shouldPreferNanoDocumentSources prefers document-source ownership once retrieval rows exist", () => {
  assert.equal(
    shouldPreferNanoDocumentSources([
      {
        extraction_status: "ready",
        id: "doc-1",
        source_status: "ready"
      }
    ]),
    true
  );
  assert.equal(shouldPreferNanoDocumentSources([]), false);
});

test("mergeNanoPolicyInputsWithFallback keeps document-backed rows and falls back only for missing page types", () => {
  const rows = mergeNanoPolicyInputsWithFallback({
    documentSources: [
      {
        canonical_url: "https://www.example.com/privacy",
        document_type: "privacy_policy",
        extracted_fields_json: {
          policy_summary_short: "Document privacy row."
        },
        extraction_status: "ready",
        id: "doc-1",
        source_status: "ready"
      }
    ],
    fallbackRows: [
      {
        id: "policy-privacy",
        page_type: "privacy_policy",
        policy_summary_short: "Fallback privacy row."
      },
      {
        id: "policy-terms",
        page_type: "terms_of_service",
        policy_summary_short: "Fallback terms row."
      }
    ]
  });

  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.page_type === "privacy_policy")?.policy_summary_short, "Document privacy row.");
  assert.equal(rows.find((row) => row.page_type === "terms_of_service")?.policy_summary_short, "Fallback terms row.");
});

test("mergeNanoPolicyInputsWithFallback keeps stronger fallback privacy rows over weak document-backed privacy rows", () => {
  const rows = mergeNanoPolicyInputsWithFallback({
    documentSources: [
      {
        canonical_url: "https://www.example.com/gdpr",
        document_type: "privacy_policy",
        extracted_fields_json: {
          policy_summary_short: "GDPR capabilities overview.",
          policy_semantic_confidence: 0.55,
          policy_structurally_weak: true
        },
        extraction_status: "ready",
        id: "doc-1",
        source_status: "ready"
      }
    ],
    fallbackRows: [
      {
        id: "policy-privacy",
        page_type: "privacy_policy",
        policy_field_coverage: {
          retention: {
            found: true
          }
        },
        policy_retention_disclosure: "vague",
        policy_rights_signals: ["access_request"],
        policy_semantic_confidence: 0.72,
        policy_structurally_weak: false,
        policy_summary_short: "Primary privacy statement explains rights, cookies, and retention."
      }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.policy_summary_short, "Primary privacy statement explains rights, cookies, and retention.");
});
