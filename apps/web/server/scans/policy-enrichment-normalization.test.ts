import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPolicyEvidenceHashes,
  dereferencePolicyEvidenceSnippets,
  derivePositivePolicySignalMap
} from "./policy-enrichment-normalization";

test("collectPolicyEvidenceHashes finds string and array-backed evidence hashes", () => {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);

  assert.deepEqual(
    collectPolicyEvidenceHashes([
      {
        policy_evidence_snippets: {
          targeted_advertising_disclosure: hashA,
          policy_rights_signals: [hashB]
        }
      }
    ]).sort(),
    [hashA, hashB].sort()
  );
});

test("dereferencePolicyEvidenceSnippets resolves and normalizes stored snippet hashes", () => {
  const hash = "a".repeat(64);
  const [row] = dereferencePolicyEvidenceSnippets({
    evidenceByHash: new Map([
      [
        hash,
        "tracking technologies. On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements."
      ]
    ]),
    rows: [
      {
        policy_evidence_snippets: {
          session_replay_disclosure: hash
        }
      }
    ]
  });

  assert.equal(
    (row?.policy_evidence_snippets as Record<string, unknown>)?.session_replay_disclosure,
    "On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements."
  );
});

test("derivePositivePolicySignalMap derives positive policy findings from the primary policy row", () => {
  const signalMap = derivePositivePolicySignalMap({
    policyEnrichment: [
      {
        policy_arbitration_present: true
      }
    ],
    primaryPolicyEnrichment: {
      privacy_contact_channel_type: "email",
      policy_children_reference: "under_13",
      policy_rights_signals: ["access", "delete"],
      policy_mentions: [
        { topic: "gpc_disclosure" },
        { topic: "tracking_technologies_disclosure" },
        { topic: "targeted_advertising_disclosure" },
        { topic: "third_party_advertising_disclosure" },
        { topic: "session_replay_disclosure" }
      ]
    }
  });

  assert.equal(signalMap.get("privacy.privacy_rights_path_present"), true);
  assert.equal(signalMap.get("privacy.privacy_contact_path_present"), true);
  assert.equal(signalMap.get("privacy.gpc_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.tracking_technologies_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.targeted_advertising_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.third_party_advertising_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.behavioral_analytics_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.children_privacy_disclosure_present"), true);
  assert.equal(signalMap.get("commerce.arbitration_clause_present"), true);
});

test("derivePositivePolicySignalMap falls back to snippet-backed policy evidence for positive findings", () => {
  const signalMap = derivePositivePolicySignalMap({
    policyEnrichment: [],
    primaryPolicyEnrichment: {
      policy_evidence_snippets: {
        dsar: "If you have privacy questions, contact us at privacy@example.com.",
        "topic:third_party_advertising_disclosure":
          "Advertising partners may use cookies, JavaScript, or web beacons in their ads and links.",
        children: "We do not knowingly collect personal information from children under 13."
      },
      policy_summary_short:
        "Advertising partners may use cookies, and if you have privacy questions contact us at privacy@example.com."
    }
  });

  assert.equal(signalMap.get("privacy.privacy_contact_path_present"), true);
  assert.equal(signalMap.get("privacy.third_party_advertising_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.children_privacy_disclosure_present"), true);
});
