import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePolicyEvidenceSnippetsRecord,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";

test("normalizePolicySnippet anchors to known policy clauses", () => {
  assert.equal(
    normalizePolicySnippet(
      "tracking technologies such as cookies, pixels, tags. On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements."
    ),
    "On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements."
  );
});

test("normalizePolicySnippet trims clipped leading fragments", () => {
  assert.equal(
    normalizePolicySnippet("ng on where you live, you may have the following rights regarding your personal information."),
    "where you live, you may have the following rights regarding your personal information."
  );
});

test("normalizePolicySnippet collapses escaped newline markers into clean text", () => {
  assert.equal(normalizePolicySnippet("\\n Manage Cookies\\n"), "Manage Cookies");
});

test("normalizePolicySnippetList dedupes cleaned snippets", () => {
  assert.deepEqual(
    normalizePolicySnippetList([
      "tracking technologies. On certain pages we use third-party tools.",
      "On certain pages we use third-party tools."
    ]),
    ["On certain pages we use third-party tools."]
  );
});

test("normalizePolicyEvidenceSnippetsRecord normalizes string and array values", () => {
  const normalized = normalizePolicyEvidenceSnippetsRecord({
    session_replay_disclosure:
      "tracking technologies. On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements.",
    policy_rights_signals: [
      "ng on where you live, you may have the following rights regarding your personal information."
    ],
    non_string_value: 42
  });

  assert.equal(
    normalized.session_replay_disclosure,
    "On certain pages of the Paramount Services, we use third-party tools to help us look at mouse movements."
  );
  assert.deepEqual(normalized.policy_rights_signals, [
    "where you live, you may have the following rights regarding your personal information."
  ]);
  assert.equal(normalized.non_string_value, 42);
});
