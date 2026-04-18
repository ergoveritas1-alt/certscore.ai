import assert from "node:assert/strict";
import test from "node:test";
import { buildNanoPolicySignalRows, mergeManagedNanoPolicySignalRows } from "./nano-policy-signals";

test("builds persisted nano policy signal rows from policy enrichment", () => {
  const rows = buildNanoPolicySignalRows({
    policyEnrichments: [
      {
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_actionable_flags: [],
        policy_ambiguity_score: 68,
        policy_children_reference: "children_notice",
        policy_do_not_sell: "present",
        policy_dsar_mechanism: "form",
        policy_mentions: [{ topic: "gpc_disclosure" }, { topic: "tracking_technologies_disclosure" }],
        policy_rights_signals: ["access_request", "delete_request"],
        privacy_contact_channel_type: "email",
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
  assert.equal(rows.some((row) => row.key === "policyDsarMechanism" && row.value === "form"), true);
  assert.equal(rows.some((row) => row.key === "privacyContactChannelType" && row.value === "email"), true);
  assert.equal(rows.some((row) => row.key === "privacy.privacy_contact_path_present" && row.value === true), true);
  assert.equal(rows.some((row) => row.key === "policyDoNotSell" && row.value === "present"), true);
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
  const actionableFlagsRow = rows.find((row) => row.key === "policyActionableFlags");
  assert.equal(confidenceRow?.value, 0.42);
  assert.equal(confidenceRow?.population_status, "present");
  assert.deepEqual(actionableFlagsRow?.value, ["low_confidence"]);
});

test("builds policy-runtime bridge signal rows from review reasons and runtime context", () => {
  const rows = buildNanoPolicySignalRows({
    policyEnrichments: [
      {
        id: "policy-1",
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_actionable_flags: ["low_confidence"],
        policy_coverage_ratio: 0.2,
        policy_mentions: [],
        policy_semantic_confidence: 0.45,
        policy_snippet_count: 0,
        policy_structurally_weak: true
      },
      {
        id: "cookie-1",
        page_type: "cookie_policy",
        page_url: "https://example.com/cookies",
        policy_actionable_flags: [],
        policy_cookie_disclosures: [{ cookie_name: "_ga", provider: "Google", purpose: "analytics" }],
        policy_semantic_confidence: 0.8
      }
    ],
    policyReviewQueue: [{ reason: "policy_behavior_conflict_candidate" }],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        cookieWriteObservations: [{ cookieName: "_fbp" }, { cookieName: "_ga" }]
      }
    },
    snapshot: {
      retargeting_pixel_detected: true,
      user_rights_friction_score: 100
    }
  });

  assert.equal(rows.some((row) => row.key === "policyBehaviorConflictCandidate"), true);
  assert.equal(rows.some((row) => row.key === "privacy.policy_runtime_functional_misalignment_detected"), true);
  assert.equal(rows.some((row) => row.key === "disclosure.policy_runtime_missing_technical_disclosure_detected"), true);
  assert.equal(rows.some((row) => row.key === "disclosure.policy_runtime_disclosure_likely_obstructed"), true);
  assert.equal(rows.some((row) => row.key === "privacy.cookie_runtime_disclosure_gap_detected"), true);
});

test("buildNanoPolicySignalRows discards non-string policy arrays before building persisted rows", () => {
  const rows = buildNanoPolicySignalRows({
    policyEnrichments: [
      {
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_actionable_flags: ["low_confidence", { bad: true }, false],
        policy_rights_signals: ["access_request", 12, { bad: true }, "delete_request"],
        policy_semantic_confidence: 0.42
      }
    ]
  });

  const actionableFlagsRow = rows.find((row) => row.key === "policyActionableFlags");
  const rightsSignalsRow = rows.find((row) => row.key === "policyRightsSignals");

  assert.deepEqual(actionableFlagsRow?.value, ["low_confidence"]);
  assert.deepEqual(rightsSignalsRow?.value, ["access_request", "delete_request"]);
});

test("preserves unmanaged nano rows when replacing managed policy-derived rows", () => {
  const merged = mergeManagedNanoPolicySignalRows({
    existingRows: [
      { key: "privacy.gpc_disclosure_present", value: false },
      { key: "custom.nano.signal", value: "keep-me" }
    ],
    nextRows: [
      {
        confidence: 0.9,
        evidence_refs: ["https://example.com/privacy"],
        key: "privacy.gpc_disclosure_present",
        label: "GPC handling disclosed",
        population_status: "present",
        provenance_detail: "policy_enrichment.privacy_policy",
        report_signal_source: "document_semantic_signal",
        value: true
      }
    ]
  });

  assert.equal(merged.some((row) => row.key === "custom.nano.signal"), true);
  assert.equal(merged.filter((row) => row.key === "privacy.gpc_disclosure_present").length, 1);
});
