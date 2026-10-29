import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { scanModuleRunSchema } from "@certscore/contracts";
import { captureConsentControlGeometry } from "./consent-control-geometry";
import { consentGeometryCheckpoint, CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES } from "./consent-geometry-checkpoint";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";

test("completed geometry checkpoint preserves source/time and bounded counts without retaining text or becoming proof", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<section class="ch2-dialog" role="dialog"><p>Choose optional cookies. private-marker</p><button>Accept all</button><button>Reject all</button></section>');
    const geometry = await captureConsentControlGeometry(page, {documentIdentity: {source: "cdp_loader_id", token: "original-loader"}});
    const original = structuredClone(geometry);
    const serialized = consentGeometryCheckpoint(geometry), checkpoint = JSON.parse(serialized);
    assert.equal(checkpoint.version, "consent_geometry_checkpoint.v1");
    assert.equal(checkpoint.diagnosticOnly, true);
    assert.equal(checkpoint.loader, geometry.documentIdentity!.token);
    assert.equal(checkpoint.at, Date.parse(geometry.capturedAt));
    assert.ok(checkpoint.cmp.includes("CookieHub"));
    assert.equal(checkpoint.counts[3], 1); assert.equal(checkpoint.counts[4], 1);
    assert.ok(Buffer.byteLength(serialized) <= CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES);
    assert.doesNotMatch(serialized, /private-marker|htmlExcerpt|selectorHint|visualComparison|screenshotArtifactRef/);
    assert.deepEqual(geometry, original);
    geometry.cmp.detections = [{...geometry.cmp.detections[0]!, canonicalName: "🙂".repeat(60)}];
    const oversizedName = JSON.parse(consentGeometryCheckpoint(geometry));
    assert.deepEqual(oversizedName.cmp, []);
    assert.equal(oversizedName.limited, true);
    assert.ok(Buffer.byteLength(consentGeometryCheckpoint(geometry)) <= CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES);
    geometry.capturedAt = "🙂".repeat(3000);
    const bounded = JSON.parse(consentGeometryCheckpoint(geometry));
    assert.equal(bounded.limited, true);
    assert.ok(Buffer.byteLength(consentGeometryCheckpoint(geometry)) <= CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES);
  } finally { await browser.close(); }
});

test("an exhausted later capture retains its completed early checkpoint without promoting an Okay control", {timeout: 20000}, async () => {
  let clicks = 0;
  const server = createServer((request, response) => {
    if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><main>Ordinary local public content for evidence capture.</main><section role="dialog" class="ch2-dialog"><p>We value your privacy.</p><button onclick="fetch(\'/click\')">Okay</button></section>');
  });
  const directory = await mkdtemp(path.join(tmpdir(), "consent-checkpoint-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const result = await preConsentRuntimeScanner({url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 1500,
      artifactWriter: await createArtifactWriter(directory), captureScope: "consent_proof", screenshotMode: "always", screenshotCaptureMode: "viewport_first"});
    const entry = result.moduleRun.timingBreakdown?.find(row => row.label === "early consent control geometry");
    assert.ok(entry?.detail, JSON.stringify(result.moduleRun));
    const checkpoint = JSON.parse(entry.detail);
    assert.equal(checkpoint.version, "consent_geometry_checkpoint.v1");
    assert.equal(checkpoint.diagnosticOnly, true); assert.equal(checkpoint.counts[3], 0); assert.equal(checkpoint.counts[4], 0);
    assert.ok(checkpoint.loader);
    assert.ok(scanModuleRunSchema.safeParse({...result.moduleRun, timingBreakdown: [entry]}).success);
    assert.equal(clicks, 0);
    assert.equal(result.consentUiObservations[0]?.acceptControlObserved, false);
    assert.equal(result.consentUiObservations[0]?.rejectControlObserved, false);
    assert.ok(!result.consentUiObservations[0]?.captureDiagnostics?.completedChannels.includes("geometry"));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
