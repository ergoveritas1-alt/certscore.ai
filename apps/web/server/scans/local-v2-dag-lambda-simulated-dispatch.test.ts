import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildLocalV2DagSimulatedLambdaArgs,
  selectSimulatedLambdaTerminalResultMessages
} from "./local-v2-dag-lambda-simulated-dispatch";

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

test("simulated Lambda carries the exact typed Reject observation configuration into the parity process", () => {
  const postRefusalObservation = {
    actionSearchTimeoutMs: 1_500,
    confirmationTimeoutMs: 1_500,
    dispatchDelayMs: 500,
    enabled: true as const,
    interactionAuthorization: {
      authorizationId: "ergoveritas_owned_post_refusal_canary.v1" as const,
      kind: "owned_canary" as const
    },
    observationWindowMs: 8_000,
    resolver: {
      kind: "canonical_cmp_registry" as const,
      recipeSetId: "canonical-cmp-registry-reject-v7" as const
    }
  };
  const args = buildLocalV2DagSimulatedLambdaArgs({
    artifactDir: "artifacts/local-v2-dag-lambda-simulated",
    outPath: "artifacts/local-v2-dag-lambda-simulated/scan-canary/summary.json",
    payload: {
      awsRegion: "eu-west-1",
      profile: "standard",
      postRefusalObservation,
      scanId: "scan-canary",
      targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html"
    }
  });
  const configIndex = args.indexOf("--post-refusal-config");

  assert.ok(configIndex > 0);
  assert.deepEqual(JSON.parse(args[configIndex + 1] ?? "null"), postRefusalObservation);
});

test("local Lambda executables exit after their durable handoffs are awaited", async () => {
  for (const path of [
    "scripts/run-local-v2-dag-lambda-parity.ts",
    "scripts/smoke-local-v2-dag-lambda.ts",
  ]) {
    const source = await readFile(path, "utf8");
    const main = source.lastIndexOf("void main().then(");
    const successExit = source.indexOf("process.exit(0)", main);
    const failureExit = source.indexOf("process.exit(1)", main);

    assert.ok(main >= 0, `${path} must terminate from the resolved main promise`);
    assert.ok(successExit > main, `${path} must exit immediately after a successful durable handoff`);
    assert.ok(failureExit > successExit, `${path} must preserve a non-zero failure exit`);
  }
});
