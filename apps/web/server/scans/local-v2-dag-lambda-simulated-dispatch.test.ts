import assert from "node:assert/strict";
import test from "node:test";
import { selectSimulatedLambdaTerminalResultMessages } from "./local-v2-dag-lambda-simulated-dispatch";

const terminalResult = {
  contractVersion: "certscore.v2.lambda-dag-result.v1",
  scanId: "28bbc244-1d11-448c-a936-e4c24a807b2f"
};

test("simulated Lambda routes only the terminal result through terminal ingestion", () => {
  const earlyPolicyEvidence = {
    contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1",
    messageKind: "policy_evidence_ready",
    scanId: terminalResult.scanId
  };

  assert.deepEqual(
    selectSimulatedLambdaTerminalResultMessages([earlyPolicyEvidence, terminalResult]),
    [terminalResult]
  );
});

test("simulated Lambda terminal routing accepts serialized parity messages", () => {
  assert.deepEqual(
    selectSimulatedLambdaTerminalResultMessages([JSON.stringify(terminalResult)]),
    [JSON.stringify(terminalResult)]
  );
});

test("simulated Lambda terminal routing fails closed for missing or duplicate results", () => {
  assert.throws(
    () => selectSimulatedLambdaTerminalResultMessages([]),
    /exactly one terminal result message/
  );
  assert.throws(
    () => selectSimulatedLambdaTerminalResultMessages([terminalResult, terminalResult]),
    /received 2/
  );
});
