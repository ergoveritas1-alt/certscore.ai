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
      policy_rights_signals: ["access", "delete"],
      policy_mentions: [
        { topic: "gpc_disclosure" },
        { topic: "tracking_technologies_disclosure" },
        { topic: "targeted_advertising_disclosure" },
        { topic: "session_replay_disclosure" }
      ]
    }
  });

  assert.equal(signalMap.get("privacy.privacy_rights_path_present"), true);
  assert.equal(signalMap.get("privacy.gpc_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.tracking_technologies_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.targeted_advertising_disclosure_present"), true);
  assert.equal(signalMap.get("privacy.behavioral_analytics_disclosure_present"), true);
  assert.equal(signalMap.get("commerce.arbitration_clause_present"), true);
});
