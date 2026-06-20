import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { capturePreConsentScreenshotOnlyFallback } from "./index.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

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
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent");
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
