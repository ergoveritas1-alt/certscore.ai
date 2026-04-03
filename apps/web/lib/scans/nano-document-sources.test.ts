import test from "node:test";
import assert from "node:assert/strict";
import { buildNanoPolicyInputsFromDocumentSources } from "./nano-document-sources";

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
