import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hasMaterialAcceptVisualProminence } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("scanner measures the authoritative pair once and defers interim decoding", { timeout: 30_000 }, async () => {
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/" ? 200 : 204, { "content-type": "text/html" });
    response.end(request.url === "/" ? `<!doctype html><html><head><title>Local consent capture fixture</title><style>
      body{background:#1e293b;color:white;font:16px Arial}section{position:fixed;bottom:20px;left:20px;width:640px;padding:24px;background:#1e293b}
      .choices{display:flex;gap:24px}button{width:180px;height:50px;border:0;background:#1e293b;color:white}#accept{background:#22ddc0}
      </style></head><body><main><h1>Local capture retention fixture</h1><p>Ordinary visible content on an owned deterministic page.</p></main>
      <section id="truste-consent-track" role="dialog" aria-label="Cookie choices"><p>We use optional cookies. Choose your preferences.</p>
      <div class="choices"><button id="accept">Accept all cookies</button><button id="reject">Reject non-functional cookies</button><button>Manage cookies</button></div></section>
      <script>window.truste={};</script></body></html>` : undefined);
  });
  const directory = await mkdtemp(join(tmpdir(), "consent-visual-retention-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const writer = await createArtifactWriter(directory), writes: ConsentControlGeometryArtifact[] = [];
    const result = await preConsentRuntimeScanner({ url: `http://127.0.0.1:${address.port}/`, normalizedUrl: `http://127.0.0.1:${address.port}/`,
      scanStartedAtMs: Date.now(), internalBudgetMs: 20_000, captureScope: "consent_proof", screenshotMode: "always",
      screenshotCaptureMode: "viewport_first", waitMode: "fast", artifactWriter: { ...writer,
        async writeJsonArtifact(name, value) {
          if (name === "ConsentControlGeometryEvidence.json") writes.push(structuredClone(value) as ConsentControlGeometryArtifact);
          return writer.writeJsonArtifact(name, value);
        } } });
    assert.equal(result.moduleRun.status, "completed");
    const paired = writes.find(row => row.visualComparison && row.screenshotArtifactRef);
    assert.ok(paired, "the authoritative capture must produce valid pixel measurements");
    const final = JSON.parse(await readFile(join(directory, "ConsentControlGeometryEvidence.json"), "utf8"));
    assert.deepEqual(final.visualComparison, paired.visualComparison);
    assert.equal(final.capturedAt, paired.capturedAt, "keep the measured geometry timestamp");
    assert.equal(final.screenshotArtifactRef, paired.screenshotArtifactRef);
    assert.ok(hasMaterialAcceptVisualProminence(final.visualComparison));
    assert.ok(result.screenshots.some(row => row.path === paired.screenshotArtifactRef), "the measured image remains retained");
    assert.ok(paired.visualComparison!.captureSkewMs <= 500, "retain the original image pairing bound");
    assert.equal(paired.captureTiming?.mainFrameCompletedAt, paired.capturedAt);
    assert.ok(result.moduleRun.timingBreakdown?.some(row =>
      row.label === "consent geometry DOM capture" || row.label === "paired settled-frame consent geometry"));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
