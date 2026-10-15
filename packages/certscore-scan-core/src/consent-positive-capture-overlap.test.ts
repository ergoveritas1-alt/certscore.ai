import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("verified positive consent capture overlaps the existing quiet gate without freezing evidence early", async () => {
  let slowEndedAt = 0, pairedCapturedAt = 0;
  const server = createServer((req, res) => {
    if (req.url === "/slow") {
      setTimeout(() => {slowEndedAt = Date.now(); res.end("ready");}, 1_000);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><style>section{position:fixed;bottom:20px;left:20px;padding:30px;background:white}button{width:180px;height:50px}</style>
      <h1>Public page</h1><section role="dialog" aria-label="Cookie choices"><p>We use optional cookies.</p>
      <button>Accept all</button><button>Reject all</button><button>Manage preferences</button></section><script>fetch('/slow')</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const directory = await mkdtemp(join(tmpdir(), "consent-positive-overlap-"));
  try {
    const result = await preConsentRuntimeScanner({url: `http://127.0.0.1:${address.port}/`, normalizedUrl: `http://127.0.0.1:${address.port}/`,
      scanStartedAtMs: Date.now(), internalBudgetMs: 20_000, captureScope: "consent_proof", screenshotMode: "always", waitMode: "fast",
      artifactWriter: await createArtifactWriter(directory), onScreenshotCaptured(image) {
        if (image.artifactId === "screenshot_pre_consent_settled") pairedCapturedAt = Date.now();
      }});
    assert.equal(result.moduleRun.status, "completed");
    assert.ok(pairedCapturedAt > 0 && pairedCapturedAt < slowEndedAt, "paired capture must start review while existing passive work is pending");
    const observation = result.consentUiObservations[0]!;
    assert.ok(observation.acceptControlObserved && observation.rejectControlObserved && observation.managePreferencesControlObserved);
    assert.ok(result.networkResponseEvents.some(row => row.url.endsWith("/slow")), "passive evidence must not be frozen before the quiet gate finishes");
    assert.ok(result.moduleRun.timingBreakdown?.some(row => row.label === "positive consent capture overlapped quiet wait"));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
