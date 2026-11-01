import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {chromium} from "playwright";

test("production-minified frame binding preserves fragments and invalidates document replacement", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-ar-binding-bundle-"));
  const output = path.join(directory, "binding.cjs");
  await build({entryPoints: [fileURLToPath(new URL("../../../packages/certscore-scan-core/src/consent-action-frame-binding.ts", import.meta.url))],
    outfile: output, bundle: true, platform: "node", target: "node22", format: "cjs", minify: true});
  const {createConsentActionFrameBinding} = createRequire(import.meta.url)(output) as typeof import("../../../packages/certscore-scan-core/src/consent-action-frame-binding");
  const server = createServer((_request, response) => {response.setHeader("content-type", "text/html");response.end("<button>Accept all</button>");});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({headless: true});
  const binding = createConsentActionFrameBinding();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as {port: number}).port}/`);
    const element = await page.locator("button").elementHandle();assert.ok(element);
    binding.bind(page, page);binding.setElement(element);
    await page.evaluate(() => {location.hash = "choice";});
    await page.waitForURL(/#choice$/);
    assert.equal(await binding.read(100, async () => "same-document"), "same-document");
    assert.equal(binding.signal.aborted, false);
    await page.reload();
    assert.equal(binding.signal.aborted, true);
    assert.equal(await binding.read(100, async () => "must-not-run"), undefined);
    await element.dispose();
  } finally {binding.dispose();await browser.close();await new Promise<void>(resolve => server.close(()=>resolve()));await rm(directory, {recursive: true, force: true});}
});
