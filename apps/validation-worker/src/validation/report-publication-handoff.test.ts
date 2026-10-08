import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { createReportFinalizationScheduler } from "./report-finalization-scheduler";
import { createReportPublicationHandoff, dispatchDurableReportPublication } from "./report-publication-handoff";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("one validation slot processes later scans while two report requests remain blocked", async () => {
  const scheduler = createReportFinalizationScheduler(2);
  const release = deferred();
  const bothStarted = deferred();
  const derived: string[] = [];
  const published: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const handoff = createReportPublicationHandoff<{ scanId: string }>({
    maxPending: 4,
    publish: ({ scanId }) => scheduler.run("publish_report", async () => {
      published.push(scanId);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (published.length === 2) bothStarted.resolve();
      try { await release.promise; } finally { active -= 1; }
    }),
    onError: (error) => assert.fail(String(error)),
  });
  // A single sequential dispatcher persists each derivation before handoff.
  for (const scanId of ["first", "second", "third", "fourth"]) {
    await Promise.resolve().then(() => derived.push(scanId));
    assert.equal(handoff.handoff({ scanId }), "started");
  }
  await bothStarted.promise;
  assert.deepEqual(derived, ["first", "second", "third", "fourth"]);
  assert.deepEqual(published, ["first", "second"]);
  assert.equal(handoff.handoff({ scanId: "third" }), "coalesced");
  assert.equal(handoff.handoff({ scanId: "fifth" }), "deferred");
  release.resolve();
  await handoff.drain();
  assert.deepEqual(published, ["first", "second", "third", "fourth"]);
  assert.equal(maximumActive, 2);
});

test("failed and saturated handoffs leave durable requests for existing recovery", async () => {
  const pendingRequests = new Set(["failed", "deferred"]);
  const errors: unknown[] = [];
  const release = deferred();
  const handoff = createReportPublicationHandoff<{ scanId: string }>({
    maxPending: 1,
    publish: async () => { await release.promise; throw new Error("endpoint unavailable"); },
    onError: (error) => { errors.push(error); },
  });
  assert.equal(handoff.handoff({ scanId: "failed" }), "started");
  assert.equal(handoff.handoff({ scanId: "deferred" }), "deferred");
  release.resolve();
  await handoff.drain();
  assert.equal(errors.length, 1);
  assert.deepEqual([...pendingRequests], ["failed", "deferred"]);

  // A fresh worker can recover the durable entries without the old in-memory map.
  const recovered: string[] = [];
  const restarted = createReportPublicationHandoff<{ scanId: string }>({
    maxPending: 4,
    publish: async ({ scanId }) => {
      if (pendingRequests.delete(scanId)) recovered.push(scanId);
    },
    onError: (error) => assert.fail(String(error)),
  });
  for (const scanId of pendingRequests) restarted.handoff({ scanId });
  await restarted.drain();
  assert.deepEqual(recovered, ["failed", "deferred"]);
  assert.equal(pendingRequests.size, 0);
});

test("synchronous publisher and diagnostic failures release admission without detached rejection", async () => {
  let calls = 0;
  const handoff = createReportPublicationHandoff<{ scanId: string }>({
    maxPending: 1,
    publish: () => { calls += 1; throw new Error("synchronous failure"); },
    onError: () => { throw new Error("logger unavailable"); },
  });
  assert.equal(handoff.handoff({ scanId: "first" }), "started");
  assert.equal(handoff.handoff({ scanId: "first" }), "coalesced");
  await handoff.drain();
  assert.equal(calls, 1);
  assert.equal(handoff.handoff({ scanId: "next" }), "started");
  await handoff.drain();
  assert.equal(calls, 2);
});

test("production handoff follows durable canonical derivation and retains publisher guards", async () => {
  const [pipeline, result, repository] = await Promise.all([
    readFile(path.join(__dirname, "pipeline.ts"), "utf8"),
    readFile(path.join(__dirname, "local-v2-dag-lambda-results.ts"), "utf8"),
    readFile(path.join(__dirname, "repository.ts"), "utf8"),
  ]);
  const start = pipeline.indexOf("const shouldReprojectAfterBrowserExtensionSignals");
  const derivation = pipeline.indexOf("await deriveAndPersistUnifiedFindingsForScan", start);
  const publication = pipeline.indexOf("handoffCompletedScanReportPublication({", derivation);
  assert.ok(derivation > start && publication > derivation);
  assert.doesNotMatch(pipeline, /await ensureCompletedScanScoresPersisted/);
  assert.match(pipeline, /requireDurableCompletionEvent: true/);
  assert.match(repository, /with completed_event as[\s\S]*?insert into public\.scan_score_materialization_requests/);
  assert.match(result, /maxPending: RESULT_FINALIZATION_BACKGROUND_CONCURRENCY \* 2/);
  assert.match(result, /publish: ensureCompletedScanScoresPersisted/);
  assert.match(result, /const existing = scoreMaterializationInFlight\.get\(input\.scanId\)/);
  assert.match(result, /await reportFinalizationScheduler\.run\(mode/);
  assert.match(result, /canonicalReportInputsReady\(input\.scanId\)/);
  assert.match(result, /REPORT_FINALIZATION_DURABLE_RECOVERY_SWEEP_MS = 2_000/);
  const gate = result.slice(result.indexOf("export async function handoffCompletedScanReportPublication"),
    result.indexOf("type LambdaResultConsumerMetadata"));
  assert.match(gate, /request\.status = 'pending'/);
  assert.match(gate, /scan\.status = 'completed'/);
  assert.match(gate, /result\.metadata_json->>'targetEnvironment' = 'production'/);
  assert.match(gate, /\{artifactVerification,verifiedAt\}/);
  assert.match(gate, /row\?\.recoverable === true/);
});

test("only verified durable owners may detach or defer; local/preview publication remains awaited", async () => {
  const release = deferred();
  let handoffs = 0;
  let publications = 0;
  const options = {
    isRecoverable: async (input: { durable: boolean }) => input.durable,
    handoff: () => { handoffs += 1; return "deferred" as const; },
    publish: async () => { publications += 1; await release.promise; },
  };
  assert.equal(await dispatchDurableReportPublication({ durable: true }, options), "deferred");
  let finished = false;
  const fallback = dispatchDurableReportPublication({ durable: false }, options)
    .then((status) => { finished = true; return status; });
  await Promise.resolve();
  assert.equal(publications, 1);
  assert.equal(handoffs, 1);
  assert.equal(finished, false);
  release.resolve();
  assert.equal(await fallback, "awaited");

  await assert.rejects(dispatchDurableReportPublication({ durable: true }, {
    ...options,
    isRecoverable: async () => { throw new Error("durable owner unavailable"); },
  }), /durable owner unavailable/);
  assert.equal(handoffs, 1, "an unverifiable recovery owner cannot admit a detached task");
});

test("invalid handoff capacity fails closed", () => {
  for (const maxPending of [0, -1, 1.5, NaN]) {
    assert.throws(() => createReportPublicationHandoff({
      maxPending,
      publish: async (_input: { scanId: string }) => undefined,
      onError: () => undefined,
    }), /positive integer/);
  }
});
