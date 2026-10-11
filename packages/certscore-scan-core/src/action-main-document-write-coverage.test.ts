import test from "node:test";
import assert from "node:assert/strict";
import { actionMainDocumentWriteCoverageSchema } from "@certscore/contracts";
import { buildActionWriteCoverage, readActionWriteCapture, type WriteProbeMetadata } from "./action-main-document-write-coverage.js";
const metadata: WriteProbeMetadata = { observedLifetimeCount: 2, ringEvictedCount: 0, readbackOmittedCount: 0,
  cookieHookHealthy: true, storageHookHealthy: true, documentUrl: "https://example.com/", documentTimeOriginMs: 10 };
const input = { metadata, targetUrl: "https://example.com/", windowStartedAtMs: 100, windowEndedAtMs: 200,
  windowCompleted: true, retainedWindowCount: 2, eligibleWindowCount: 1, retainedEligibleCount: 1, unresolvedWindowCount: 0 };
test("write coverage is explicitly bounded to healthy loss-free main-document setter hooks", () => {
  const result = buildActionWriteCoverage(input);
  assert.equal(result.status, "complete_within_scope");
  assert.equal(result.scope, "main_document_setter_hooks");
  assert.equal(actionMainDocumentWriteCoverageSchema.safeParse(result).success, true);
});
test("every loss, unresolved write, unhealthy hook, drift and incomplete window limits coverage", () => {
  for (const patch of [ { metadata: undefined }, { metadata: { ...metadata, observedLifetimeCount: 3, ringEvictedCount: 1 } },
    { metadata: { ...metadata, observedLifetimeCount: 3, readbackOmittedCount: 1 } }, { metadata: { ...metadata, cookieHookHealthy: false } },
    { metadata: { ...metadata, storageHookHealthy: false } }, { metadata: { ...metadata, documentUrl: "https://other.example/" } },
    { metadata: { ...metadata, documentTimeOriginMs: 150 } }, { windowCompleted: false },
    { retainedEligibleCount: 0 }, { unresolvedWindowCount: 1 } ]) {
    const result = buildActionWriteCoverage({ ...input, ...patch });
    assert.equal(result.status, "limited", JSON.stringify(patch));
    assert.equal(actionMainDocumentWriteCoverageSchema.safeParse({ ...result, status: "complete_within_scope" }).success, false);
  }
});
test("counter reconciliation and malformed windows fail validation", () => {
  const result = buildActionWriteCoverage(input);
  for (const patch of [{ retainedEligibleCount: 0 }, { eligibleWindowCount: 3 }, { windowEndedAtMs: 99 }])
    assert.equal(actionMainDocumentWriteCoverageSchema.safeParse({ ...result, ...patch }).success, false);
});
test("terminal read failure is unavailable rather than complete empty", async () => {
  const page = { evaluate: async () => { throw new Error("document destroyed"); } };
  const result = await readActionWriteCapture(page as never, "reader");
  assert.deepEqual(result, { writes: [] });
  assert.equal(buildActionWriteCoverage({ ...input, metadata: result.metadata }).status, "limited");
});

test("both producer probes count writes before ring eviction and terminal readback cap", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  for (const action of ["accept", "refusal"]) {
    const source = readFileSync(new URL(`./post-${action}-observer.ts`, import.meta.url), "utf8");
    const start = source.indexOf("async function installStorageWriteProbe");
    const script = source.slice(start).match(/content: `([\s\S]*?)`/)[1];
    class FakeStorage { setItem(_key: string, _value: string) {} }
    class FakeDocument {}
    Object.defineProperty(FakeDocument.prototype, "cookie", { configurable: true, get() { return ""; }, set(_value) {} });
    const context = { window: {} as Record<string, unknown>, Storage: FakeStorage, Document: FakeDocument,
      location: { href: "https://example.com/" }, performance: { timeOrigin: 10, now: () => 100 } };
    runInNewContext(script, context);
    const storage = new FakeStorage();
    for (let i = 0; i < 200; i++) storage.setItem(`key${i}`, "value");
    const reader = context.window[action === "accept" ? "__certscoreReadPostAcceptWrites" : "__certscoreReadPostRefusalWrites"] as (() => unknown[]) & { coverage: () => WriteProbeMetadata };
    assert.equal(reader().length, 96);
    assert.deepEqual({ ...reader.coverage() }, { observedLifetimeCount: 200, ringEvictedCount: 8, readbackOmittedCount: 96,
      storageHookHealthy: true, cookieHookHealthy: true, documentUrl: "https://example.com/", documentTimeOriginMs: 10, hookInstalledAtMs: 110 });
    FakeStorage.prototype.setItem = () => {};
    assert.equal(reader.coverage().storageHookHealthy, false);
  }
});

test("malformed metadata and forged zero totals stay limited without discarding retained writes", async () => {
  for (const patch of [{ documentUrl: "::invalid" }, { observedLifetimeCount: 0 },
    { observedLifetimeCount: NaN }, { ringEvictedCount: -1 }, { documentTimeOriginMs: Infinity },
    { cookieHookHealthy: undefined }]) {
    const result = buildActionWriteCoverage({ ...input, metadata: { ...metadata, ...patch } as WriteProbeMetadata });
    assert.equal(result.status, "limited");
    assert.equal(result.probeAvailable, false);
    assert.equal(actionMainDocumentWriteCoverageSchema.safeParse(result).success, true);
  }
  const page = { evaluate: async () => ({ writes: [{ name: "retained" }], metadata: { ...metadata, documentUrl: "::invalid" } }) };
  const captured = await readActionWriteCapture<{name:string}>(page as never, "reader");
  assert.deepEqual(captured.writes, [{ name: "retained" }]);
  assert.equal(buildActionWriteCoverage({ ...input, metadata: captured.metadata }).status, "limited");
});
test("forged reconciliations never validate as complete", () => {
  const complete = buildActionWriteCoverage(input);
  for (const patch of [{ observedLifetimeCount: 0 }, { observedLifetimeCount: 1 },
    { ringEvictedCount: 3 }, { readbackOmittedCount: 3 }, { unresolvedWindowCount: 3 },
    { retainedEligibleCount: 2 }]) {
    assert.equal(actionMainDocumentWriteCoverageSchema.safeParse({ ...complete, ...patch }).success, false);
  }
});

test("deduplication is explicit and cannot masquerade as retained event completeness", () => {
  const result = buildActionWriteCoverage({ ...input, eligibleWindowCount: 2, retainedEligibleCount: 1, deduplicatedEligibleCount: 1 });
  assert.equal(result.status, "limited");
  assert.equal(result.deduplicatedEligibleCount, 1);
  assert.equal(result.finalCapOmittedCount, 0);
  assert.equal(actionMainDocumentWriteCoverageSchema.safeParse(result).success, true);
  assert.equal(actionMainDocumentWriteCoverageSchema.safeParse({ ...result, status: "complete_within_scope" }).success, false);
});
