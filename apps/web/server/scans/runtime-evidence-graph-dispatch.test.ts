import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { bindRuntimeGraphDispatchToScan } from "./runtime-evidence-graph-dispatch";
import { buildDurableLocalV2DagLambdaDispatchPayload } from "../../../validation-worker/src/validation/local-v2-dag-lambda-dispatch";

const scanId = "4f75b34a-9755-468d-b8f9-bec6042e94d7";
const fixture = () => ({ hostname: "example.com", normalizedUrl: "https://example.com/", runtimeGraph: { mode: "project" }, execution: { v2DagLambda: {
  awsRegion: "eu-west-1", contractVersion: "certscore.v2.lambda-dag-dispatch.v1", functionName: "certscore-v2-dag-local-lambda",
  orchestrationMode: "sharded", processor: "local-certscore-v2-dag-parallel-v1", resultHandoff: "sqs", resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/results",
  scannerRuntime: "certscore-v2-dag-parallel-path", targetEnvironment: "production", vpcMode: "vpc",
  runtimeGraphSelection: { contractVersion: "certscore.runtime-graph-selection.v1", scanId, dispatch: { contractVersion: "certscore.runtime-graph-dispatch.v1", scanId, mode: "project", profile: "bounded_passive_v1" } },
} } });
const enabled = { CERTSCORE_RUNTIME_GRAPH_MODE: "project", CERTSCORE_RUNTIME_GRAPH_PERCENT: "100" };

test("documented localhost environment enables persisted capture and presentation together", () => {
  const environment = parseEnv(readFileSync(new URL("../../.env.example", import.meta.url), "utf8"));
  const scanConfig = bindRuntimeGraphDispatchToScan({ scanId, scanConfig: fixture(), environment });
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig });
  assert.equal(payload.runtimeGraph?.mode, "project");
  assert.equal(payload.runtimeGraph?.scanId, scanId);
  assert.equal(environment.CERTSCORE_RUNTIME_GRAPH_PRESENTATION, "on");
  assert.equal(payload.postAcceptObservation, undefined);
  assert.equal(payload.postRefusalObservation, undefined);
});

test("canonical scan creation overwrites client graph decisions and commits disabled decisions", () => {
  const input = fixture(); const before = structuredClone(input);
  const scanConfig = bindRuntimeGraphDispatchToScan({ scanId, scanConfig: input, environment: {} });
  assert.deepEqual(input, before);
  assert.equal(buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig }).runtimeGraph, undefined);
  assert.equal((scanConfig.execution as typeof input.execution).v2DagLambda.runtimeGraphSelection.dispatch, null);
});

test("scan-row graph decision survives durable publisher retries without reevaluating rollout", () => {
  const scanConfig = bindRuntimeGraphDispatchToScan({ scanId, scanConfig: fixture(), environment: enabled });
  const first = buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig });
  assert.deepEqual(first.runtimeGraph, { contractVersion: "certscore.runtime-graph-dispatch.v1", scanId, mode: "project", profile: "bounded_passive_v1" });
  assert.deepEqual(buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig }), first);
  assert.equal(first.gpcObservation?.enabled, true);
  assert.equal(first.postAcceptObservation, undefined);
  assert.equal(first.postRefusalObservation, undefined);
  assert.equal(buildDurableLocalV2DagLambdaDispatchPayload({ scanId: "another-scan", scanConfig }).runtimeGraph, undefined);
});

test("historical, invalid and non-sharded rows cannot gain a graph from publisher environment or raw config", () => {
  const variants: unknown[] = [undefined, { contractVersion: "future", scanId, dispatch: fixture().execution.v2DagLambda.runtimeGraphSelection.dispatch }, { contractVersion: "certscore.runtime-graph-selection.v1", scanId, dispatch: { ...fixture().execution.v2DagLambda.runtimeGraphSelection.dispatch, scanId: "other" } }];
  for (const variant of variants) {
    const config: any = fixture(); config.execution.v2DagLambda.runtimeGraphSelection = variant;
    assert.equal(buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig: config }).runtimeGraph, undefined);
  }
  const single = fixture(); single.execution.v2DagLambda.orchestrationMode = "single";
  const scanConfig = bindRuntimeGraphDispatchToScan({ scanId, scanConfig: single, environment: enabled });
  assert.equal(buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig }).runtimeGraph, undefined);
});

test("scan UUID and trusted graph decision are inserted in the same outbox write", () => {
  const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function createQueuedFullScan(");
  const body = source.slice(start, source.indexOf("export async function failInterrupted", start));
  assert.ok(body.indexOf("const scanId = randomUUID()") < body.indexOf("bindRuntimeGraphDispatchToScan("));
  const bindAt = body.indexOf("bindRuntimeGraphDispatchToScan("), insertAt = body.indexOf("const insert = async");
  assert.ok(bindAt >= 0 && insertAt > bindAt);
  assert.match(body, /await withWriteTransaction/);
  assert.match(body, /await insert\(async/);
  assert.match(body, /await insert\(queryOne\)/);
  assert.match(body, /\$10::uuid/);
  assert.match(body, /scanConfig,\s+input.queuePriority/);
  assert.match(body, /input.queueOrigin \?\? "user",\s+scanId/);
  const preview = readFileSync(new URL("../preview-scan/db.ts", import.meta.url), "utf8");
  const previewStart = preview.indexOf("export async function createPreviewScanRecord(");
  const previewBody = preview.slice(previewStart, preview.indexOf("export async function getPreviewScanRecord", previewStart));
  assert.ok(previewBody.indexOf("bindRuntimeGraphDispatchToScan(") < previewBody.indexOf("await queryOne"));
  assert.match(previewBody, /\$5::uuid/);
  assert.match(previewBody, /input.domainId, persistedConfig, queueMetadata.queuePriority, queueMetadata.queueOrigin, scanId/);
});

test("owned exact-target activation binds a new scan at zero customer percentage without changing action permissions", () => {
  const canary = "https://ergoveritas.com/testar1.html";
  const config = { ...fixture(), hostname: "ergoveritas.com", normalizedUrl: canary };
  const scanConfig = bindRuntimeGraphDispatchToScan({ scanId, scanConfig: config, environment: { ...enabled, CERTSCORE_RUNTIME_GRAPH_PERCENT: "0", CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS: JSON.stringify([canary]) } });
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig });
  assert.equal(payload.runtimeGraph?.mode, "project");
  assert.equal(payload.postAcceptObservation, undefined);
  assert.equal(payload.postRefusalObservation, undefined);
});
