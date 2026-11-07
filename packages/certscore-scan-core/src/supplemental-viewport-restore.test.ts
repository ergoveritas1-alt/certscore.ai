import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { restoreSupplementalViewport } from "./supplemental-viewport-restore.js";
import { captureScaledFullPageScreenshotWithCdp } from "./scanners/pre-consent-runtime-scanner.js";

function fixture() {
  const calls: Array<{ method: string; params: any }> = [];
  let live = { width: 1025, height: 8987 };
  let detached = 0;
  const client = {
    send: async (method: string, params: any) => {
      calls.push({ method, params });
      if (method === "Emulation.setDeviceMetricsOverride") live = { width: params.width, height: params.height };
      if (method === "Page.getLayoutMetrics") return { cssContentSize: { width: 1366, height: 12000 } };
      return { data: Buffer.from("fixture screenshot").toString("base64") };
    },
    detach: async () => { detached++; },
  };
  const page = {
    viewportSize: () => ({ width: 1366, height: 900 }),
    context: () => ({ newCDPSession: async () => client }),
    evaluate: async () => ({ innerWidth: live.width, innerHeight: live.height }),
    setViewportSize: async () => { throw new Error("must not use the cached Playwright setter"); },
  } as unknown as Page;
  return { page, client, calls, live: () => live, detached: () => detached };
}

test("explicit reset bypasses the same-size Playwright cache", async () => {
  const f = fixture();
  assert.deepEqual(await restoreSupplementalViewport(f.page, {}), { attempted: true, completed: true });
  assert.deepEqual(f.live(), { width: 1366, height: 900 });
  assert.equal(f.detached(), 1);
  assert.deepEqual(f.calls.map(x => x.method), ["Emulation.setDeviceMetricsOverride"]);
});

test("restoration preserves configured device scale and mobile screen orientation", async () => {
  const f = fixture();
  await restoreSupplementalViewport(f.page, { deviceScaleFactor: 2, isMobile: true, screen: { width: 800, height: 1200 } });
  assert.equal(f.calls[0]!.params.deviceScaleFactor, 2);
  assert.equal(f.calls[0]!.params.mobile, true);
  assert.deepEqual(f.calls[0]!.params.screenOrientation, { angle: 0, type: "portraitPrimary" });
  assert.equal(f.calls[0]!.params.screenWidth, 800);
});

test("late session acquisition only detaches; it cannot mutate a later viewport", async () => {
  const f = fixture();
  let release!: (client: any) => void;
  f.page.context = () => ({ newCDPSession: () => new Promise(resolve => { release = resolve; }) }) as any;
  assert.deepEqual(await restoreSupplementalViewport(f.page, {}, 15), { attempted: false, completed: false });
  release(f.client);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 0);
  assert.equal(f.detached(), 1);
});

test("a failed or stalled reset never reports completion or starts a retry", async () => {
  for (const stalled of [false, true]) {
    const f = fixture();
    f.client.send = async (method, params) => {
      f.calls.push({ method, params });
      if (stalled) return new Promise(() => {});
      throw new Error("target closed");
    };
    assert.deepEqual(await restoreSupplementalViewport(f.page, {}, 15), { attempted: true, completed: false });
    assert.equal(f.calls.length, 1);
    assert.equal(f.detached(), 1);
  }
});

test("absent viewport and exhausted allowance perform no browser work", async () => {
  const f = fixture();
  assert.deepEqual(await restoreSupplementalViewport(f.page, {}, 0), { attempted: false, completed: false });
  f.page.viewportSize = () => null;
  assert.deepEqual(await restoreSupplementalViewport(f.page, {}), { attempted: false, completed: false });
  assert.equal(f.calls.length, 0);
});

test("full-page path resets even when its first post-capture diagnostic appears unchanged", async () => {
  const f = fixture();
  let reads = 0;
  f.page.evaluate = (async () => {
    reads++;
    return reads <= 2 ? { innerWidth: 1366, innerHeight: 900 } : { innerWidth: f.live().width, innerHeight: f.live().height };
  }) as any;
  const dir = await mkdtemp(join(tmpdir(), "supplemental-delayed-viewport-"));
  let diagnostic: any;
  try {
    await captureScaledFullPageScreenshotWithCdp(f.page, join(dir, "full.jpg"), 500, value => { diagnostic = value; });
    assert.equal(diagnostic.after.innerWidth, 1366);
    assert.equal(diagnostic.restoreAttempted, true);
    assert.equal(diagnostic.restored, true);
    assert.deepEqual(f.live(), { width: 1366, height: 900 });
    assert.equal(f.calls.filter(x => x.method === "Page.captureScreenshot").length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a layout read finishing after capture timeout cannot dispatch a late screenshot", async () => {
  const f = fixture();
  const send = f.client.send;
  let release!: (value: any) => void;
  f.client.send = async (method, params) => method === "Page.getLayoutMetrics"
    ? new Promise(resolve => { release = resolve; }) : send(method, params);
  const dir = await mkdtemp(join(tmpdir(), "supplemental-late-layout-"));
  const file = join(dir, "late.jpg");
  try {
    await assert.rejects(captureScaledFullPageScreenshotWithCdp(f.page, file, 20), /timed out/);
    release({ cssContentSize: { width: 1366, height: 12000 } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(x => x.method === "Page.captureScreenshot").length, 0);
    assert.equal(f.calls.filter(x => x.method === "Emulation.setDeviceMetricsOverride").length, 1);
    await assert.rejects(access(file));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
