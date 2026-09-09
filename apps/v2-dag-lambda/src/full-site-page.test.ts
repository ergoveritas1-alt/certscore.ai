import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LambdaClient } from "@aws-sdk/client-lambda";
import {
  dispatchFullSitePage,
  runFullSitePage,
  FULL_SITE_PAGE_DISPATCH,
  fullSitePageCaptureOutcome,
} from "./full-site-page";
import { inventoryConfiguration, inventoryHash, projectFullSiteInventory, runInventoryOnly } from "@certscore/scan-core";

test("Lambda capture outcome preserves rendered HTTP 500 inventory and rejects incomplete captures", { timeout: 45000 }, async () => {
  const { createServer } = await import("node:http");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const server = createServer((_request, response) => {
    response.writeHead(500, { "Content-Type": "text/html" });
    response.end('<main>Swimming holidays and classes. Contact our team for travel details.</main><script>document.cookie="inventory_fixture=observed;path=/"</script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const outDir = await mkdtemp(join(tmpdir(), "certscore-lambda-inventory-"));
  const configurationHash = inventoryHash(inventoryConfiguration("eu-central-1", "tiny"));
  try {
    const visit = await runInventoryOnly({ url, hosts: ["127.0.0.1"], region: "eu-central-1", profile: "tiny", configurationHash, outDir, signal: AbortSignal.timeout(30000) });
    const outcome = fullSitePageCaptureOutcome({ aborted: false, finalUrl: visit.finalUrl, moduleRun: visit.evidence.moduleRun });
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.failureKind, undefined);
    const input = { ...visit, parentScanId: randomUUID(), pageJobId: randomUUID(), attemptId: randomUUID(), configurationHash, requestedUrl: url, profile: "inventory_only" as const, sourceHash: inventoryHash(visit.evidence), limitations: [] };
    const packet = projectFullSiteInventory({ ...input, ...outcome });
    assert.equal(packet.httpStatus, 500);
    assert.equal(packet.status, "partial");
    assert.equal(packet.failureKind, "http_error");
    assert.ok(packet.limitations.includes("http_error_rendered_inventory.v1"));
    assert.ok(packet.occurrences.some(row => row.kind === "cookie" && row.label === "inventory_fixture"));
    for (const candidate of [
      { aborted: true, finalUrl: visit.finalUrl, moduleRun: visit.evidence.moduleRun },
      { aborted: false, finalUrl: null, moduleRun: visit.evidence.moduleRun },
      { aborted: false, finalUrl: visit.finalUrl, moduleRun: { ...visit.evidence.moduleRun, status: "failed" as const } },
    ]) {
      const rejected = projectFullSiteInventory({ ...input, ...fullSitePageCaptureOutcome(candidate) });
      assert.equal(rejected.status, "failed");
      assert.deepEqual(rejected.occurrences, []);
    }
    // A committed navigation timeout remains a real hint even if later capture completes.
    const recovery = structuredClone(visit.evidence.moduleRun);
    recovery.recoveryDiagnostics = { attempted: true, attemptCount: 1, attempts: [{ ...recovery.recoveryDiagnostics!.attempts[0]!, outcome: "committed_timeout" }] };
    const timedOut = fullSitePageCaptureOutcome({ aborted: false, finalUrl: visit.finalUrl, moduleRun: recovery });
    assert.equal(timedOut.failureKind, "navigation_timeout");
    assert.deepEqual(projectFullSiteInventory({ ...input, ...timedOut }).occurrences, []);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(outDir, { recursive: true, force: true });
  }
});

test("queue router delegates once without browser work; malformed input and wrong worker fail closed", async () => {
  const original = LambdaClient.prototype.send;
  const previousName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const previousWorker = process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER;
  const calls: Record<string, unknown>[] = [];
  try {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "fixture-scanner";
    delete process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER;
    LambdaClient.prototype.send = (async (command: {
      input: Record<string, unknown>;
    }) => {
      calls.push(command.input);
      return { StatusCode: 202 };
    }) as typeof original;
    const message = {
      contractVersion: FULL_SITE_PAGE_DISPATCH,
      pageId: randomUUID(),
      attemptId: randomUUID(),
      token: "a".repeat(64),
    };
    assert.deepEqual(await dispatchFullSitePage(message), {
      status: "dispatched",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.FunctionName, "fixture-scanner-inventory");
    assert.equal(calls[0]!.InvocationType, "Event");
    assert.deepEqual(
      JSON.parse(Buffer.from(calls[0]!.Payload as Uint8Array).toString()),
      message,
    );
    await assert.rejects(
      dispatchFullSitePage({ ...message, url: "https://example.test" }),
    );
    await assert.rejects(runFullSitePage(message), /dedicated worker/);
    process.env.AWS_LAMBDA_FUNCTION_NAME = "fixture-scanner-inventory";
    await assert.rejects(dispatchFullSitePage(message), /routing unavailable/);
    assert.equal(calls.length, 1);
  } finally {
    LambdaClient.prototype.send = original;
    if (previousName === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = previousName;
    if (previousWorker === undefined)
      delete process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER;
    else process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER = previousWorker;
  }
});

test("inventory hard timeout fits the lease without changing homepage runtime or reserving capacity", async () => {
  const terraform = await readFile(
    new URL(
      "../../../infra/aws/v2-dag-lambda/modules/regional-scanner/main.tf",
      import.meta.url,
    ),
    "utf8",
  );
  const homepage = terraform
    .split('resource "aws_lambda_function" "scanner" {')[1]!
    .split('resource "aws_cloudwatch_log_group" "inventory"')[0]!;
  const inventory = terraform
    .split('resource "aws_lambda_function" "inventory" {')[1]!
    .split(
      'resource "aws_lambda_function_event_invoke_config" "inventory"',
    )[0]!;
  assert.match(homepage, /timeout\s*= 75/);
  assert.match(inventory, /timeout\s*= 25/);
  assert.doesNotMatch(inventory, /reserved_concurrent_executions/);
  assert.match(inventory, /CERTSCORE_FULL_SITE_INVENTORY_WORKER = "1"/);
  const retryConfig = terraform
    .split(
      'resource "aws_lambda_function_event_invoke_config" "inventory" {',
    )[1]!
    .split('resource "aws_lambda_function_event_invoke_config" "scanner"')[0]!;
  assert.match(retryConfig, /maximum_retry_attempts\s*= 0/);
});


test("inventory admission tolerates a two-second proxy handshake and fails closed without browser work or retry", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const proxy = createServer();
  let target: string | undefined;
  proxy.on("connect", (request, socket) => {
    target = request.url;
    setTimeout(() => socket.end("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n"), 2000);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address === "object");
  const keys = ["CERTSCORE_FULL_SITE_INVENTORY_WORKER", "CERTSCORE_FULL_SITE_CONTROL_ORIGIN", "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER", "SCAN_PROXY_ENABLED", "CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE"];
  const previous = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const diagnostics: string[] = [];
  const message = { contractVersion: FULL_SITE_PAGE_DISPATCH, pageId: randomUUID(), attemptId: randomUUID(), token: "a".repeat(64) };
  try {
    console.error = value => diagnostics.push(String(value));
    process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER = "1";
    process.env.CERTSCORE_FULL_SITE_CONTROL_ORIGIN = "https://example.com";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = `http://127.0.0.1:${address.port}`;
    process.env.SCAN_PROXY_ENABLED = "1";
    process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE = "true";
    globalThis.fetch = async () => { throw new Error("Direct egress must not be used"); };
    await assert.rejects(runFullSitePage(message), /503/);
    assert.equal(target, "example.com:443");
    assert.equal(diagnostics.length, 1);
    const diagnostic = JSON.parse(diagnostics[0]!);
    assert.equal(diagnostic.event, "full_site_control_failed");
    assert.equal(diagnostic.page_id, message.pageId);
    assert.equal(diagnostic.operation, "claim");
    assert.ok(diagnostic.elapsed_ms >= 2000);
    assert.equal(diagnostic.error_name, "Error");
    assert.ok(!diagnostics[0]!.includes(message.token));
    assert.ok(!diagnostics[0]!.includes("example.com"));
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
  }
});
