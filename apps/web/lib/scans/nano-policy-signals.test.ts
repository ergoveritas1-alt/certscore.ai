import assert from "node:assert/strict";
import test from "node:test";
import { buildNanoPolicySignalRows } from "./nano-policy-signals";

test("builds persisted nano policy signal rows from policy enrichment", () => {
  const rows = buildNanoPolicySignalRows({
    policyEnrichments: [
      {
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_actionable_flags: [],
        policy_ambiguity_score: 68,
        policy_children_reference: "children_notice",
        policy_mentions: [{ topic: "gpc_disclosure" }, { topic: "tracking_technologies_disclosure" }],
        policy_rights_signals: ["access_request", "delete_request"],
        policy_semantic_confidence: 0.82
      },
      {
        page_type: "terms_of_service",
        page_url: "https://example.com/terms",
        policy_arbitration_present: true,
        policy_semantic_confidence: 0.77
      }
    ]
  });

  assert.equal(rows.some((row) => row.key === "privacy.gpc_disclosure_present" && row.value === true), true);
  assert.equal(rows.some((row) => row.key === "privacy.tracking_technologies_disclosure_present" && row.value === true), true);
  assert.equal(rows.some((row) => row.key === "policyRightsSignals" && Array.isArray(row.value)), true);
  assert.equal(rows.some((row) => row.key === "policyChildrenReference" && row.value === "children_notice"), true);
  assert.equal(rows.some((row) => row.key === "policyAmbiguityScore" && row.value === 68), true);
  assert.equal(rows.some((row) => row.key === "commerce.arbitration_clause_present" && row.value === true), true);
});

test("only emits low-confidence policy semantic confidence when extraction is weak", () => {
  const rows = buildNanoPolicySignalRows({
    policyEnrichments: [
      {
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_actionable_flags: ["low_confidence"],
        policy_semantic_confidence: 0.42
      }
    ]
  });

  const confidenceRow = rows.find((row) => row.key === "policySemanticConfidence");
  assert.equal(confidenceRow?.value, 0.42);
  assert.equal(confidenceRow?.population_status, "present");
});
