import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, type CDPSession, type Page } from "playwright";
import { capturePreConsentScreenshot } from "./scanners/pre-consent-runtime-scanner.js";

for (const fallbackMode of ["resilient", "bounded_viewport"] as const) {
  test(`${fallbackMode} reserves a real viewport fallback after both CDP paths stall`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "screenshot-reserve-"));
    const path = join(directory, "viewport.png");
    const calls: boolean[] = [];
    const pending: Array<(value: { data: string }) => void> = [];
    const bytes = Buffer.from("fallback pixels");
    let detaches = 0;
    let fallbackBudget = 0;
    const session = {
      send: (_method: string, params: { fromSurface: boolean }) => {
        calls.push(params.fromSurface);
        return new Promise<{ data: string }>(resolve => pending.push(resolve));
      },
      detach: async () => { detaches++; },
    } as unknown as CDPSession;
    const page = {
      screenshot: async (options: { timeout: number; fullPage: boolean; path?: string }) => {
        assert.equal(options.fullPage, false, "full-page work must not consume the fallback reserve");
        assert.equal(options.path, undefined, "late native completion must not write artifacts");
        fallbackBudget = options.timeout;
        return bytes;
      },
    } as unknown as Page;
    const started = Date.now();
    try {
      const result = await capturePreConsentScreenshot(page, path, {
        captureMode: "viewport_first", fallbackMode, timeoutMs: 400,
        screenshotErrors: [], borrowedCdpSession: session,
      });
      assert.equal(result.status, "available");
      assert.equal(result.captureMethod, "primary_viewport_fallback");
      assert.deepEqual(calls, [false, true]);
      assert.ok(fallbackBudget > 30 && fallbackBudget <= 110, `remaining budget: ${fallbackBudget}`);
      assert.ok(Date.now() - started < 550, "attempts share one deadline");
      assert.deepEqual(await readFile(path), bytes);
      for (const resolve of pending) resolve({ data: Buffer.from("late CDP pixels").toString("base64") });
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.deepEqual(await readFile(path), bytes);
      assert.equal(detaches, 0, "document/network observer session remains attached");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("a timed-out Playwright fallback cannot overwrite the terminal placeholder", async () => {
  const directory = await mkdtemp(join(tmpdir(), "screenshot-late-fallback-"));
  const path = join(directory, "viewport.png");
  let finish: (value: Buffer) => void = () => assert.fail("fallback never started");
  const errors: string[] = [];
  const page = {
    context: () => ({ newCDPSession: async () => ({
      send: async () => { throw new Error("CDP unavailable"); }, detach: async () => {},
    }) }),
    screenshot: (options: { path?: string }) => {
      assert.equal(options.path, undefined);
      return new Promise<Buffer>(resolve => { finish = resolve; });
    },
  } as unknown as Page;
  try {
    const start = Date.now();
    const result = await capturePreConsentScreenshot(page, path, {
      captureMode: "viewport_first", fallbackMode: "bounded_viewport", timeoutMs: 100, screenshotErrors: errors,
    });
    assert.equal(result.status, "placeholder");
    assert.equal(result.failureReason, "screenshot_timeout");
    assert.ok(Date.now() - start < 300);
    const placeholder = await readFile(path);
    assert.equal(placeholder.readUInt32BE(16), 1);
    assert.equal(placeholder.readUInt32BE(20), 1);
    finish(Buffer.from("late Playwright pixels"));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(await readFile(path), placeholder);
    assert.ok(errors.some(error => error.includes("Playwright viewport screenshot timed out")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("terminal CDP failure does not attempt Playwright or promote placeholder evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "screenshot-closed-"));
  let fallbacks = 0;
  const page = {
    context: () => ({ newCDPSession: async () => ({
      send: async () => { throw new Error("Target page, context or browser has been closed"); }, detach: async () => {},
    }) }),
    screenshot: async () => { fallbacks++; return Buffer.from("invalid"); },
  } as unknown as Page;
  try {
    const result = await capturePreConsentScreenshot(page, join(directory, "viewport.png"), {
      captureMode: "viewport_first", timeoutMs: 400, screenshotErrors: [],
    });
    assert.equal(result.status, "placeholder");
    assert.equal(result.failureReason, "page_closed");
    assert.equal(fallbacks, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("real Chromium retains the same-page viewport when both borrowed CDP paths stall", async () => {
  const directory = await mkdtemp(join(tmpdir(), "screenshot-browser-reserve-"));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 640, height: 480 }, serviceWorkers: "block" });
    await context.route("**/*", route => route.abort());
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body style="background:#123456;color:white"><h1>Local capture fixture</h1></body></html>');
    const session = await context.newCDPSession(page);
    const { frameTree: before } = await session.send("Page.getFrameTree");
    const stalledSession = { send: () => new Promise(() => {}) } as unknown as CDPSession;
    const path = join(directory, "viewport.png");
    const started = Date.now();
    const result = await capturePreConsentScreenshot(page, path, {
      borrowedCdpSession: stalledSession, captureMode: "viewport_first", timeoutMs: 3_000, screenshotErrors: [],
    });
    const elapsed = Date.now() - started;
    assert.equal(result.status, "available");
    assert.equal(result.captureMethod, "primary_viewport_fallback");
    assert.ok(elapsed < 3_250, `original 3000ms capture allowance; elapsed=${elapsed}`);
    const png = await readFile(path);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), 640);
    assert.equal(png.readUInt32BE(20), 480);
    const { frameTree: after } = await session.send("Page.getFrameTree");
    assert.equal(after.frame.loaderId, before.frame.loaderId);
    assert.equal(after.frame.url, before.frame.url);
    await session.detach();
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a stalled full-page capture leaves time for a viewport and cannot overwrite it later", async () => {
  const directory = await mkdtemp(join(tmpdir(), "full-page-fallback-"));
  const path = join(directory, "screenshot.png");
  let finishFullPage!: (bytes: Buffer) => void;
  const calls: boolean[] = [];
  const page = { screenshot: ({ fullPage, path: destination }: { fullPage: boolean; path?: string }) => {
    assert.equal(destination, undefined);
    calls.push(fullPage);
    return fullPage ? new Promise<Buffer>(resolve => { finishFullPage = resolve; }) : Promise.resolve(Buffer.from("viewport"));
  } } as unknown as Page;
  try {
    const result = await capturePreConsentScreenshot(page, path, { captureMode: "full_page_first", timeoutMs: 400, screenshotErrors: [] });
    assert.deepEqual(calls, [true, false]);
    assert.equal(result.captureMethod, "primary_viewport_fallback");
    finishFullPage(Buffer.from("late full page"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await readFile(path, "utf8"), "viewport");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
