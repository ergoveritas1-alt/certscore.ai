import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LambdaClient } from "@aws-sdk/client-lambda";
import {
  dispatchFullSitePage,
  runFullSitePage,
  FULL_SITE_PAGE_DISPATCH,
} from "./full-site-page";

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


test("inventory admission uses the configured egress proxy and fails closed without browser work", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const proxy = createServer();
  let target: string | undefined;
  proxy.on("connect", (request, socket) => {
    target = request.url;
    socket.end("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address === "object");
  const keys = ["CERTSCORE_FULL_SITE_INVENTORY_WORKER", "CERTSCORE_FULL_SITE_CONTROL_ORIGIN", "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER", "SCAN_PROXY_ENABLED", "CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE"];
  const previous = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  try {
    process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER = "1";
    process.env.CERTSCORE_FULL_SITE_CONTROL_ORIGIN = "https://example.com";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = `http://127.0.0.1:${address.port}`;
    process.env.SCAN_PROXY_ENABLED = "1";
    process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE = "true";
    globalThis.fetch = async () => { throw new Error("Direct egress must not be used"); };
    await assert.rejects(runFullSitePage({ contractVersion: FULL_SITE_PAGE_DISPATCH, pageId: randomUUID(), attemptId: randomUUID(), token: "a".repeat(64) }), /503/);
    assert.equal(target, "example.com:443");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
  }
});
