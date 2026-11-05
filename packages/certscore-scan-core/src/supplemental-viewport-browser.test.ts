import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { restoreSupplementalViewport } from "./supplemental-viewport-restore.js";
import { captureScaledFullPageScreenshotWithCdp } from "./scanners/pre-consent-runtime-scanner.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";

test("owned page reproduces cached restoration failure and explicit reset repairs it", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const directory = await mkdtemp(join(tmpdir(), "viewport-pairing-owned-"));
  try {
    await page.setContent('<html><body style="margin:0;height:12000px"><div style="position:fixed;bottom:0">Cookie preferences <button>Accept All</button><button>Reject All</button></div><script>window.fixtureClicks=0;document.addEventListener("click",()=>window.fixtureClicks++)</script></body></html>');
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setDeviceMetricsOverride", { width: 1025, height: 8987, deviceScaleFactor: 1, mobile: false });
    await session.detach();
    const dimensions = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.deepEqual(await dimensions(), { width: 1025, height: 8987 });
    await page.setViewportSize({ width: 1366, height: 900 });
    assert.deepEqual(await dimensions(), { width: 1025, height: 8987 }, "same-size setter is cached in the installed Playwright");
    assert.deepEqual(await restoreSupplementalViewport(page, {}), { attempted: true, completed: true });
    assert.deepEqual(await dimensions(), { width: 1366, height: 900 });
    let diagnostic: any;
    const file = join(directory, "full.jpg");
    await captureScaledFullPageScreenshotWithCdp(page, file, 3000, value => { diagnostic = value; });
    assert.equal(diagnostic.restoreAttempted, true);
    assert.equal(diagnostic.restored, true);
    assert.deepEqual(await dimensions(), { width: 1366, height: 900 });
    const image = await sharp(await readFile(file)).metadata();
    assert.ok(image.height! > 900, "full-page pixels remain retained, not replaced with a viewport");
    const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
    assert.deepEqual(geometry.viewport, { width: 1366, height: 900 });
    for (const timeoutMs of [20, 80]) {
      // Exercise deadline-edge capture as well as success; either screenshot
      // outcome is allowed, but cleanup must leave the owned viewport intact.
      await captureScaledFullPageScreenshotWithCdp(page, join(directory, `edge-${timeoutMs}.jpg`), timeoutMs).catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.deepEqual(await dimensions(), { width: 1366, height: 900 });
    }
    assert.equal(await page.evaluate(() => (window as any).fixtureClicks), 0);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
