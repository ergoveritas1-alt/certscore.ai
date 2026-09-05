import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { runScan } from "./index.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

test("tiny scans close owned Chromium even when rendered policy links were discovered", async context => {
  const server = await startStaticFixtureServer();
  const root = await mkdtemp(path.join(tmpdir(), "certscore-browser-cleanup-"));
  const browsers: Browser[] = [];
  const launch = chromium.launch.bind(chromium);
  context.mock.method(chromium, "launch", async (...args: Parameters<typeof chromium.launch>) => {
    const browser = await launch(...args); browsers.push(browser); return browser;
  });
  try {
    const url = new URL("/browser-visible-policy-homepage", server.urlFor("generic-cdn-noise")).href;
    const result = await runScan({ url, profile: "tiny", outDir: root, preConsentScreenshotMode: "never" });
    assert.ok(browsers.length > 0);
    assert.equal(result.modulesRun.some(module => module.moduleName === "policySurfaceScanner" && module.status === "completed"), false);
    assert.ok(browsers.every(browser => !browser.isConnected()), "a disabled policy lane cannot own an open browser after scan completion");
  } finally {
    context.mock.restoreAll();
    await Promise.all(browsers.map(browser => browser.close()));
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
