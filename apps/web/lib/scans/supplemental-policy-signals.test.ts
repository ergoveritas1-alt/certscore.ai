import assert from "node:assert/strict";
import test from "node:test";

import { deriveSupplementalPolicySignals } from "./supplemental-policy-signals";

test("derives policy-backed positive signals from policy enrichment", () => {
  const signals = deriveSupplementalPolicySignals({
    existingSignalKeys: [],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        privacy_contact_channel_type: "email",
        policy_mentions: [
          { topic: "gpc_disclosure", confidence: 0.82 },
          { topic: "targeted_advertising_disclosure", confidence: 0.82 }
        ],
        policy_evidence_snippets: {
          policy_rights_signals: ["access", "delete", "privacy_contact"]
        },
        policy_summary_short: "Privacy choices and GPC options are available."
      }
    ],
    primaryPolicyEnrichment: {
      page_type: "privacy_policy",
      privacy_contact_channel_type: "email",
      policy_mentions: [
        { topic: "gpc_disclosure", confidence: 0.82 },
        { topic: "targeted_advertising_disclosure", confidence: 0.82 }
      ],
      policy_evidence_snippets: {
        policy_rights_signals: ["access", "delete", "privacy_contact"]
      },
      policy_summary_short: "Privacy choices and GPC options are available."
    },
    snapshot: null
  });

  const keys = new Set(signals.map((signal) => signal.key));

  assert.equal(keys.has("privacy.privacy_rights_path_present"), true);
  assert.equal(keys.has("privacy.privacy_contact_path_present"), true);
  assert.equal(keys.has("privacy.gpc_disclosure_present"), true);
  assert.equal(keys.has("privacy.targeted_advertising_disclosure_present"), true);
});

test("falls back to snapshot-backed privacy rights and contact signals when policy enrichment is absent", () => {
  const signals = deriveSupplementalPolicySignals({
    existingSignalKeys: [],
    policyEnrichment: [],
    primaryPolicyEnrichment: null,
    snapshot: {
      dsar_request_mechanism_present: true,
      privacy_contact_method_present: true
    }
  });

  assert.deepEqual(
    signals.map((signal) => signal.key).sort(),
    ["privacy.privacy_contact_path_present", "privacy.privacy_rights_path_present"]
  );
});

test("does not duplicate signals that already exist", () => {
  const signals = deriveSupplementalPolicySignals({
    existingSignalKeys: ["privacy.privacy_rights_path_present", "privacy.privacy_contact_path_present"],
    policyEnrichment: [],
    primaryPolicyEnrichment: null,
    snapshot: {
      dsar_request_mechanism_present: true,
      privacy_contact_method_present: true
    }
  });

  assert.deepEqual(signals, []);
});
