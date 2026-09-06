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
