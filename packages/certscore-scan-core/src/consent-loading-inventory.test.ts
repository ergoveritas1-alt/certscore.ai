import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createArtifactWriter } from "./artifact-writer.js";
import { consentUiObservationSchema } from "@certscore/contracts";
import { canReuseCommittedConsentInventory, preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("loading inventory reuse requires complete positive A/R/O and the same committed document", () => {
  const identity = { source: "cdp_loader_id" as const, token: "loader-1" };
  const observation = consentUiObservationSchema.parse({
    observationId: "early", observedAtMs: 100, documentUrl: "https://example.test/", documentIdentity: identity,
    documentReadyState: "loading", captureStatus: "observed", inventoryOutcome: "complete_with_controls",
    layerInspected: "first_layer", likelyPresent: true, confidence: 1, basis: ["inventory:rapid_dom"], evidenceRefs: [],
    acceptControlObserved: true, rejectControlObserved: true, managePreferencesControlObserved: true,
  });
  assert.equal(canReuseCommittedConsentInventory(observation, observation.documentUrl!, identity), true);
  for (const change of [
    { captureStatus: "incomplete" as const }, { inventoryOutcome: "partial" as const },
    { acceptControlObserved: false }, { rejectControlObserved: false }, { managePreferencesControlObserved: false },
    { layerInspected: "unknown" as const }, { documentIdentity: undefined },
  ]) assert.equal(canReuseCommittedConsentInventory({ ...observation, ...change }, observation.documentUrl!, identity), false);
  assert.equal(canReuseCommittedConsentInventory(observation, "https://example.test/changed", identity), false);
  assert.equal(canReuseCommittedConsentInventory(observation, observation.documentUrl!, { ...identity, token: "loader-2" }), false);
});


test("loading-time consent inventory retains early and parser-delayed controls without clicks", async () => {
  const banner = `<section role="dialog" aria-label="Cookie preferences" style="position:fixed;bottom:0;left:0;background:white;padding:24px">
    <p>We use cookies for analytics. Choose your cookie preferences.</p>
    <button onclick="window.clicked=true">Accept all</button>
    <button onclick="window.clicked=true">Reject all</button>
    <button onclick="window.clicked=true">Cookie settings</button></section>`;
  const scriptCompletedAt = new Map<string, number>();
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/slow.js")) {
      setTimeout(() => {
        scriptCompletedAt.set(request.url!.split("=")[1]!, Date.now());
        response.writeHead(200, { "content-type": "application/javascript" });
        response.end("window.parserFinished=true;");
      }, 1000);
      return;
    }
    const variant = request.url!.slice(1);
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><body><main><h1>Local consent fixture</h1><p>Ordinary public page content.</p></main>
      ${variant === "early" ? banner : ""}<script src="/slow.js?variant=${variant}"></script>
      ${variant === "late" ? banner : ""}</body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const root = await mkdtemp(path.join(tmpdir(), "consent-loading-"));
  try {
    for (const variant of ["early", "late"]) {
      const url = `http://127.0.0.1:${address.port}/${variant}`;
      const startedAtMs = Date.now();
      const result = await preConsentRuntimeScanner({ url, normalizedUrl: url,
        scanStartedAtMs: startedAtMs, internalBudgetMs: 12000, waitMode: "fast",
        captureScope: "consent_proof", screenshotMode: "always", screenshotCaptureMode: "viewport_first",
        artifactWriter: await createArtifactWriter(path.join(root, variant)),
      });
      assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
      const inventory = result.consentUiObservations[0];
      assert.equal(inventory?.acceptControlObserved, true, variant);
      assert.equal(inventory?.rejectControlObserved, true, variant);
      assert.equal(inventory?.managePreferencesControlObserved, true, variant);
      assert.equal(result.consentInteractionEvents?.length ?? 0, 0);
      const timings = result.moduleRun.timingBreakdown ?? [];
      assert.ok(timings.some(entry => entry.label === "consent inventory during document loading"));
      assert.ok(result.screenshots.length > 0);
      assert.ok(result.screenshots.every(image => image.capturedAtMs >= scriptCompletedAt.get(variant)! - startedAtMs),
        "visual proof must wait until the parser has finished");
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
