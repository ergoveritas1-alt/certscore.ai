import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { capturePreConsentScreenshotOnlyFallback } from "./index.js";
import { classifyVisualCaptureFailureReason } from "./scanners/pre-consent-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

test("visual capture distinguishes renderer crashes from browser and page closure", () => {
  assert.equal(
    classifyVisualCaptureFailureReason("page.screenshot: Target crashed while capturing"),
    "renderer_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("browser has disconnected"),
    "browser_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Target page, context or browser has been closed"),
    "page_closed",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Supplemental full-page screenshot timed out"),
    "screenshot_timeout",
  );
});

test("visual fallback retains bounded consent-surface evidence with the screenshot", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent");
    assert.equal(result.screenshot.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.domSnapshot?.artifactId, "dom_text_pre_consent");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
    assert.equal(
      result.consentUiObservation?.visibleChoiceLabels.some((label) => /\breject all\b/i.test(label)),
      true,
    );
    assert.equal(
      result.visualCapture.notes.some((note) => /consent-surface evidence/.test(note)),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("full-page visual fallback preserves late consent surfaces after incomplete inspection", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-full-page-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent_full_page");
    assert.equal(result.screenshot.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.pagePhase, "network_idle");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
