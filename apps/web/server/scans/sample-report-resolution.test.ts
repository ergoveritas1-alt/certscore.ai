import assert from "node:assert/strict";
import test from "node:test";
import { resolveSampleReportScan, SAMPLE_REPORT_WINDOW_MS, type SampleReportAttempt, type SampleReportDependencies } from "./sample-report-resolution";

const now = new Date("2026-10-26T12:00:00Z");

function harness() {
  const state = { creates: 0, recent: null as { id: string } | null, previous: null as SampleReportAttempt | null };
  const dependencies: SampleReportDependencies = {
    withRegionLock: async (_region, run) => ({ acquired: true, value: await run() }),
    findRecent: async () => state.recent,
    findAttempt: async () => state.previous,
    createFresh: async () => { state.creates += 1; return { id: "new-scan" }; },
  };
  return { state, dependencies };
}

test("fresh eligible reports open immediately without scanning; stale or missing reports queue once", async () => {
  const { state, dependencies } = harness();
  state.recent = { id: "recent-scan" };
  assert.deepEqual(await resolveSampleReportScan("california", dependencies, now), { kind: "recent", scanId: "recent-scan" });
  assert.equal(state.creates, 0);
  state.recent = null;
  assert.deepEqual(await resolveSampleReportScan("california", dependencies, now), { kind: "fresh", scanId: "new-scan" });
  assert.equal(state.creates, 1);
});

test("in-flight work is shared and a failed attempt cannot exhaust the monthly allowance through retries", async () => {
  const { state, dependencies } = harness();
  state.previous = { id: "existing", status: "running", createdAt: new Date(now.getTime() - 1_000).toISOString() };
  assert.deepEqual(await resolveSampleReportScan("eu_ie", dependencies, now), { kind: "in_progress", scanId: "existing" });
  for (const status of ["failed", "completed", "expired"]) {
    state.previous.status = status;
    assert.deepEqual(await resolveSampleReportScan("eu_ie", dependencies, now), { kind: "cooldown", retryAfterSeconds: 86_399 });
  }
  assert.equal(state.creates, 0);
  state.previous.createdAt = new Date(now.getTime() - SAMPLE_REPORT_WINDOW_MS).toISOString();
  assert.equal((await resolveSampleReportScan("eu_ie", dependencies, now)).kind, "fresh");
  assert.equal(state.creates, 1);
});

test("simultaneous clicks do not create duplicate scans and later clicks join the accepted scan", async () => {
  const { state, dependencies } = harness();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let held = false;
  dependencies.withRegionLock = async (_region, run) => {
    if (held) return { acquired: false };
    held = true;
    try { return { acquired: true, value: await run() }; } finally { held = false; }
  };
  dependencies.createFresh = async () => {
    state.creates += 1;
    entered();
    await gate;
    state.previous = { id: "shared", status: "queued", createdAt: now.toISOString() };
    return { id: "shared" };
  };
  const first = resolveSampleReportScan("eu_de", dependencies, now);
  await started;
  assert.deepEqual(await resolveSampleReportScan("eu_de", dependencies, now), { kind: "busy", retryAfterSeconds: 1 });
  release();
  assert.deepEqual(await first, { kind: "fresh", scanId: "shared" });
  assert.deepEqual(await resolveSampleReportScan("eu_de", dependencies, now), { kind: "in_progress", scanId: "shared" });
  assert.equal(state.creates, 1);
});

test("a failed freshness lookup fails closed instead of starting a paid scan", async () => {
  const { state, dependencies } = harness();
  dependencies.findRecent = async () => { throw new Error("unavailable"); };
  await assert.rejects(resolveSampleReportScan("california", dependencies, now), /unavailable/);
  assert.equal(state.creates, 0);
});

test("a writer clock ahead of the web instance cannot cause duplicate sample scans", async () => {
  const { state, dependencies } = harness();
  state.previous = { id: "accepted", status: "running", createdAt: new Date(now.getTime() + 1_000).toISOString() };
  assert.deepEqual(await resolveSampleReportScan("california", dependencies, now), { kind: "in_progress", scanId: "accepted" });
  state.previous.status = "failed";
  assert.deepEqual(await resolveSampleReportScan("california", dependencies, now), { kind: "cooldown", retryAfterSeconds: 86_400 });
  state.previous.createdAt = "invalid";
  assert.equal((await resolveSampleReportScan("california", dependencies, now)).kind, "cooldown");
  assert.equal(state.creates, 0);
});
