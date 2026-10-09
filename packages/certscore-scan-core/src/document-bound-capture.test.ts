import assert from "node:assert/strict";
import test from "node:test";
import { captureDocumentBoundValue, sameDocumentCaptureBinding, type DocumentCaptureBinding } from "./document-bound-capture.js";

function binding(token = "loader-a", url = "https://fixture.example/"): DocumentCaptureBinding {
  return { url, documentIdentity: { source: "cdp_loader_id", token } };
}

test("capture completion fixes the time and loader even when the caller awaits after navigation", async () => {
  let current = binding(); let now = 120; let calls = 0;
  const pending = captureDocumentBoundValue({
    capture: async () => { calls++; return "original document text"; },
    readBinding: () => current, scanStartedAtMs: 100, now: () => now,
  });
  // The capture's continuation runs before the caller resumes other work.
  await Promise.resolve();
  now = 900; current = binding("loader-b");
  const result = await pending;
  assert.equal(result.capturedAtMs, 20);
  assert.equal(result.documentIdentity?.token, "loader-a");
  assert.equal(result.value, "original document text");
  assert.equal(calls, 1, "binding adds no replacement capture");
  assert.equal(sameDocumentCaptureBinding(result, current), false);
});

for (const [name, next] of [
  ["same-URL reload", binding("loader-b")],
  ["URL change", binding("loader-a", "https://fixture.example/next")],
  ["missing terminal loader", { url: "https://fixture.example/" }],
] as const) {
  test(`capture spanning ${name} cannot claim a verified document`, async () => {
    let current: DocumentCaptureBinding = binding();
    const result = await captureDocumentBoundValue({
      capture: async () => { current = next; return "captured bytes"; },
      readBinding: () => current, scanStartedAtMs: 100, now: () => 120,
    });
    assert.equal(result.documentIdentity, undefined);
    assert.equal(result.url, "https://fixture.example/");
    assert.equal(sameDocumentCaptureBinding(result, current), false);
  });
}

test("mutating the cached identity in place cannot rewrite the capture's starting loader", async () => {
  const current = binding();
  const result = await captureDocumentBoundValue({
    capture: async () => { current.documentIdentity!.token = "loader-b"; return "bytes"; },
    readBinding: () => current, scanStartedAtMs: 100, now: () => 120,
  });
  assert.equal(result.documentIdentity, undefined);
});

test("unknown identities never establish matching proof through URL equality", () => {
  assert.equal(sameDocumentCaptureBinding({ url: "https://fixture.example/" }, { url: "https://fixture.example/" }), false);
});

test("failed reads propagate without capturing a replacement value", async () => {
  let calls = 0;
  await assert.rejects(captureDocumentBoundValue({
    capture: async () => { calls++; throw new Error("read failed"); },
    readBinding: () => binding(), scanStartedAtMs: 100,
  }), /read failed/);
  assert.equal(calls, 1);
});
