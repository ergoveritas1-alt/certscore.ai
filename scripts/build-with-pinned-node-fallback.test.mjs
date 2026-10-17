import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildWithPinnedNodeFallback } from "./build-with-pinned-node-fallback.mjs";

const policy = JSON.parse(await readFile(new URL("./docker-source-policy.json", import.meta.url), "utf8"));
const digest = policy.rules[0].updates.identifier.split("@")[1];
const rateLimit = { code: 1, stderr: `GET https://public.ecr.aws/v2/docker/library/node/manifests/${digest}: 429 Too Many Requests` };
const verified = { code: 0, stdout: JSON.stringify({ digest, mediaType: "application/vnd.oci.image.index.v1+json" }) };
const args = ["docker", "buildx", "build", "--provenance=false", "--target", "validation-worker-runtime-base", "--push", "."];

function harness(results) {
  const calls = [], written = []; let cleaned = 0;
  return { calls, written, cleaned: () => cleaned, input: { args, policy, env: { EXPERIMENTAL_BUILDKIT_SOURCE_POLICY: "original.json" },
    run: async (command, options) => { calls.push({ command, options }); assert.ok(results.length, "no unbounded retries"); return results.shift(); },
    writePolicy: async document => { written.push(document); return { path: "temporary.json", cleanup: async () => { cleaned++; } }; } } };
}

test("a successful build makes no extra registry request", async () => {
  const h = harness([{ code: 0 }]); assert.equal(await buildWithPinnedNodeFallback(h.input), 0);
  assert.equal(h.calls.length, 1); assert.equal(h.written.length, 0);
});

test("only the exact mirror 429 uses one verified same-digest fallback and preserves all build arguments", async () => {
  const before = structuredClone(policy), h = harness([rateLimit, verified, { code: 0 }]);
  assert.equal(await buildWithPinnedNodeFallback(h.input), 0);
  assert.deepEqual(h.calls[0].command, args); assert.deepEqual(h.calls[2].command, args);
  assert.deepEqual(h.calls[1].command, ["docker", "buildx", "imagetools", "inspect", `docker.io/library/node@${digest}`, "--format", "{{json .Manifest}}"]);
  assert.equal(h.calls[1].options.timeoutMs, 30000);
  assert.equal(h.written[0].rules[0].updates.identifier, `docker-image://docker.io/library/node@${digest}`);
  assert.equal(h.calls[2].options.env.EXPERIMENTAL_BUILDKIT_SOURCE_POLICY, "temporary.json");
  assert.equal(h.cleaned(), 1); assert.deepEqual(policy, before);
  assert.equal(h.input.env.EXPERIMENTAL_BUILDKIT_SOURCE_POLICY, "original.json");
});

test("other registries, pins, response codes and cancellation do not trigger fallback", async () => {
  for (const first of [{ code: 1, stderr: "npm registry returned 429 Too Many Requests" },
    { code: 1, stderr: rateLimit.stderr.replace(digest, `sha256:${"a".repeat(64)}`) },
    { code: 1, stderr: rateLimit.stderr.replace("429 Too Many Requests", "503 Service Unavailable") },
    { ...rateLimit, cancelled: true }]) {
    const h = harness([first]); assert.equal(await buildWithPinnedNodeFallback(h.input), 1); assert.equal(h.calls.length, 1);
  }
});

test("failed, malformed or mismatched upstream proof blocks the second build", async () => {
  for (const proof of [{ code: 1 }, { code: 0, stdout: "not JSON" },
    { code: 0, stdout: JSON.stringify({ digest: `sha256:${"a".repeat(64)}`, mediaType: "application/vnd.oci.image.index.v1+json" }) }]) {
    const h = harness([rateLimit, proof]); await assert.rejects(buildWithPinnedNodeFallback(h.input));
    assert.equal(h.calls.length, 2); assert.equal(h.written.length, 0);
  }
});

test("a failed fallback build cannot start a third build and still removes its temporary policy", async () => {
  const h = harness([rateLimit, verified, { code: 7 }]); assert.equal(await buildWithPinnedNodeFallback(h.input), 7);
  assert.equal(h.calls.length, 3); assert.equal(h.cleaned(), 1);
});

test("abort after verification cannot write a policy or start another build", async () => {
  const controller = new AbortController(), h = harness([rateLimit, verified]);
  const run = h.input.run; h.input.run = async (...input) => { const result = await run(...input); if (h.calls.length === 2) controller.abort(); return result; };
  await assert.rejects(buildWithPinnedNodeFallback({ ...h.input, signal: controller.signal }));
  assert.equal(h.calls.length, 2); assert.equal(h.written.length, 0);
});

test("unknown source policies fail closed, and both validation builds retain the wrapper", async () => {
  const h = harness([]); await assert.rejects(buildWithPinnedNodeFallback({ ...h.input, policy: { rules: [] } }));
  assert.equal(h.calls.length, 0);
  const workflow = await readFile(new URL("../.github/workflows/validation-aws-deploy.yml", import.meta.url), "utf8");
  assert.equal((workflow.match(/node scripts\/build-with-pinned-node-fallback\.mjs -- docker buildx build/g) ?? []).length, 2);
  assert.match(workflow, /node --test scripts\/build-with-pinned-node-fallback\.test\.mjs/);
});
