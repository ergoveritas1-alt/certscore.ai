import assert from "node:assert/strict";
import test from "node:test";
import {
  awaitAbortablePolicyOperation,
  readBoundedResponseBody,
} from "./scanners/policy-surface-scanner.js";

test("policy operations stop when transport work ignores abort before response headers", async () => {
  const controller = new AbortController();
  const startedAtMs = Date.now();
  const pending = awaitAbortablePolicyOperation(
    new Promise<Response>(() => undefined),
    controller.signal,
    "policy fetch deadline reached",
  );

  setTimeout(() => controller.abort(new Error("policy fetch deadline reached")), 20);

  await assert.rejects(pending, /policy fetch deadline reached/);
  assert.ok(Date.now() - startedAtMs < 250);
});

test("policy response reads retain a bounded prefix and cancel the remaining stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    start(controller) {
      controller.enqueue(new Uint8Array(80).fill(1));
      controller.enqueue(new Uint8Array(80).fill(2));
      controller.enqueue(new Uint8Array(80).fill(3));
    },
  });
  const response = new Response(stream, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  const result = await readBoundedResponseBody(response, 100);

  assert.equal(result.body.byteLength, 100);
  assert.equal(result.truncated, true);
  assert.equal(cancelled, true);
  assert.deepEqual([...result.body.slice(0, 80)], new Array(80).fill(1));
  assert.deepEqual([...result.body.slice(80)], new Array(20).fill(2));
});

test("policy response reads preserve complete bodies below the cap", async () => {
  const body = new TextEncoder().encode("bounded policy text");
  const result = await readBoundedResponseBody(new Response(body), 100);

  assert.equal(result.truncated, false);
  assert.equal(new TextDecoder().decode(result.body), "bounded policy text");
});

test("policy response reads stop when a pending stream read ignores transport cancellation", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    pull() {
      return new Promise(() => undefined);
    },
  });
  const controller = new AbortController();
  const startedAtMs = Date.now();
  const pending = readBoundedResponseBody(new Response(stream), 100, controller.signal);

  setTimeout(() => controller.abort(new Error("policy deadline reached")), 20);

  await assert.rejects(pending, /policy deadline reached/);
  assert.equal(cancelled, true);
  assert.ok(Date.now() - startedAtMs < 250);
});
