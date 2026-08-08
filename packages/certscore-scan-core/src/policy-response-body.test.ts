import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  brotliCompressSync,
  deflateSync,
  gzipSync,
} from "node:zlib";
import test from "node:test";
import {
  awaitAbortablePolicyOperation,
  canonicalPolicyUrlIdentity,
  decodeBoundedPolicyResponseBody,
  policyResponseTransportForEnvironment,
  readBoundedResponseBody,
  requestBoundedPolicyResponse,
} from "./scanners/policy-surface-scanner.js";

test("policy response decoding supports bounded gzip, Brotli, and deflate bodies", () => {
  const policy = new TextEncoder().encode(
    "Privacy notice. We process personal data for defined purposes and explain retention, recipients, rights, legal bases, and international transfers.",
  );
  for (const [encoding, body] of [
    ["gzip", gzipSync(policy)],
    ["br", brotliCompressSync(policy)],
    ["deflate", deflateSync(policy)],
  ] as const) {
    const decoded = decodeBoundedPolicyResponseBody(body, encoding);
    assert.equal(decoded.ok, true, encoding);
    assert.equal(new TextDecoder().decode(decoded.body), new TextDecoder().decode(policy));
    assert.equal(decoded.outcome, encoding);
  }
});

test("policy response decoding recognizes gzip bytes without a reliable encoding header", () => {
  const policy = new TextEncoder().encode("Datenschutzhinweis für personenbezogene Daten.");
  const decoded = decodeBoundedPolicyResponseBody(gzipSync(policy), "identity");

  assert.equal(decoded.ok, true);
  assert.equal(decoded.outcome, "gzip");
  assert.equal(new TextDecoder().decode(decoded.body), new TextDecoder().decode(policy));
});

test("policy response decoding ignores an incorrect compression header for plain text", () => {
  const policy = new TextEncoder().encode(
    "<html><body><h1>Privacy Notice</h1><p>We process personal data.</p></body></html>",
  );
  const decoded = decodeBoundedPolicyResponseBody(policy, "gzip");

  assert.equal(decoded.ok, true);
  assert.equal(decoded.outcome, "identity");
  assert.equal(new TextDecoder().decode(decoded.body), new TextDecoder().decode(policy));
});

test("policy response decoding fails closed for malformed and oversized compressed bodies", () => {
  const malformed = decodeBoundedPolicyResponseBody(
    Uint8Array.from([0x1f, 0x8b, 0x08, 0x00, 0x01]),
    "gzip",
  );
  assert.deepEqual(malformed, { ok: false, outcome: "failed" });

  const oversized = decodeBoundedPolicyResponseBody(
    gzipSync(Buffer.alloc(2_600_000, 0x61)),
    "gzip",
  );
  assert.deepEqual(oversized, { ok: false, outcome: "too_large" });
});

test("policy URL identity preserves content parameters and removes tracking parameters", () => {
  assert.equal(
    canonicalPolicyUrlIdentity(
      "https://www.example.test/help/policy?nodeId=201909010&ref_=footer_privacy&utm_source=test",
    ),
    "https://www.example.test/help/policy?nodeId=201909010",
  );
  assert.notEqual(
    canonicalPolicyUrlIdentity("https://www.example.test/help/policy?nodeId=one"),
    canonicalPolicyUrlIdentity("https://www.example.test/help/policy?nodeId=two"),
  );
});

test("policy URL identity removes sensitive query names and values", () => {
  assert.equal(
    canonicalPolicyUrlIdentity(
      "https://www.example.test/help/policy?nodeId=201909010&secret-token=must-not-be-retained",
    ),
    "https://www.example.test/help/policy?nodeId=201909010",
  );
});

test("policy response transport avoids bundled fetch inside AWS Lambda", () => {
  assert.equal(policyResponseTransportForEnvironment({}), "fetch_with_node_fallback");
  assert.equal(
    policyResponseTransportForEnvironment({ AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda" }),
    "node",
  );
  assert.equal(
    policyResponseTransportForEnvironment({ AWS_LAMBDA_RUNTIME_API: "127.0.0.1:9001" }),
    "node",
  );
});

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

test("policy HTTP transport destroys a socket stalled before response headers", async () => {
  const server = createServer(() => undefined);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const controller = new AbortController();
  const startedAtMs = Date.now();
  const pending = requestBoundedPolicyResponse(
    `http://127.0.0.1:${address.port}/stalled-policy`,
    controller.signal,
    5,
    "node",
  );

  setTimeout(() => controller.abort(new Error("policy socket deadline reached")), 20);

  await assert.rejects(pending, /policy socket deadline reached/);
  assert.ok(Date.now() - startedAtMs < 250);
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("policy HTTP transport destroys a response stream stalled after headers", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.write("<html><body>partial policy");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const controller = new AbortController();
  const startedAtMs = Date.now();
  const pending = requestBoundedPolicyResponse(
    `http://127.0.0.1:${address.port}/half-open-policy`,
    controller.signal,
    5,
    "node",
  );

  setTimeout(() => controller.abort(new Error("policy response deadline reached")), 20);

  await assert.rejects(pending, /policy response deadline reached/);
  assert.ok(Date.now() - startedAtMs < 250);
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("Lambda-safe policy transport follows redirects without returning to bundled fetch", async () => {
  const policyText = "Privacy notice with retention, recipient, rights, and transfer disclosures.";
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/policy" });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(policyText);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await requestBoundedPolicyResponse(
      `http://127.0.0.1:${address.port}/redirect`,
      new AbortController().signal,
      5,
      "node",
    );

    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, `http://127.0.0.1:${address.port}/policy`);
    assert.equal(new TextDecoder().decode(result.body), policyText);
    assert.equal(result.truncated, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Lambda-safe policy transport rejects an abruptly closed response", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-length": "1000",
      "content-type": "text/html; charset=utf-8",
    });
    response.write("<html><body>partial privacy notice");
    response.socket?.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    await assert.rejects(
      requestBoundedPolicyResponse(
        `http://127.0.0.1:${address.port}/abrupt-policy`,
        new AbortController().signal,
        5,
        "node",
      ),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
