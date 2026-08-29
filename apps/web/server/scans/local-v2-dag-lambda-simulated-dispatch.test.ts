import assert from "node:assert/strict";
import test from "node:test";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS,
  buildLocalV2DagSimulatedLambdaArgs,
  consumeSimulatedLambdaMessageStream,
  selectSimulatedLambdaRuntimePreviewMessages,
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

test("simulated Lambda selects only the typed early runtime preview message", () => {
  const runtimePreview = {
    contractVersion: "certscore.v2.lambda-runtime-preview-ready.v1",
    messageKind: "runtime_preview_ready",
    scanId: terminalResult.scanId,
  };
  assert.deepEqual(
    selectSimulatedLambdaRuntimePreviewMessages([
      { contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1", messageKind: "policy_evidence_ready" },
      runtimePreview,
      terminalResult,
    ]),
    [runtimePreview],
  );
});

test("simulated Lambda consumes complete NDJSON messages before child completion", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "certscore-local-lambda-message-stream-"));
  const messageStreamPath = path.join(root, "messages.ndjson");
  let settled = false;
  const observed: unknown[] = [];
  let consumption: Promise<{ processedLineCount: number }> | null = null;
  try {
    await writeFile(messageStreamPath, "", "utf8");
    consumption = consumeSimulatedLambdaMessageStream({
      isExecutionSettled: () => settled,
      messageStreamPath,
      onMessage: async (message) => { observed.push(message); },
      pollMs: 5,
    });
    await appendFile(messageStreamPath, `${JSON.stringify({ messageKind: "runtime_preview_ready", scanId: terminalResult.scanId })}\n`, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(observed.length, 1, "the preview must be consumed while the child is still running");
    settled = true;
    await consumption;
  } finally {
    settled = true;
    await consumption;
    await rm(root, { recursive: true, force: true });
  }
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
    rolloutMode: "owned_canary" as const,
    resolver: {
      kind: "canonical_cmp_registry" as const,
      recipeSetId: "canonical-consent-control-reject-v8" as const
    }
  };
  const args = buildLocalV2DagSimulatedLambdaArgs({
    artifactDir: "artifacts/local-v2-dag-lambda-simulated",
    messageStreamPath: "artifacts/local-v2-dag-lambda-simulated/scan-canary/sqs-messages.ndjson",
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
  assert.equal(
    args[args.indexOf("--message-stream") + 1],
    "artifacts/local-v2-dag-lambda-simulated/scan-canary/sqs-messages.ndjson",
  );
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

test("simulated Lambda execution is bounded below the orphan terminal deadline", async () => {
  const source = await readFile("apps/web/server/scans/local-v2-dag-lambda-simulated-dispatch.ts", "utf8");

  assert.equal(LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS, 915_000);
  assert.ok(LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS < 930_000);
  assert.match(source, /timeout: LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS/);
  assert.match(source, /killSignal: "SIGTERM"/);
});
