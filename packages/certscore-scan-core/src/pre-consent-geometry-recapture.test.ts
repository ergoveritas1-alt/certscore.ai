import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("pre-consent scanner recaptures below-fold consent geometry before proof screenshot", async () => {
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 2200px; font-family: sans-serif; }
          main { height: 1100px; padding: 32px; }
          .cookie-banner {
            position: absolute;
            top: 1220px;
            left: 120px;
            width: 900px;
            padding: 24px;
            background: #fff;
            border: 1px solid #333;
          }
          .cookie-banner button { margin-right: 12px; padding: 12px 18px; }
        </style>
      </head>
      <body>
        <main><h1>Below fold consent fixture</h1></main>
        <section class="cookie-banner" role="dialog" aria-label="Cookie consent">
          <p>We use cookies for analytics and advertising. Manage your privacy preferences.</p>
          <button>Manage Preferences</button>
          <button>Reject All Non-Required</button>
          <button>Accept All</button>
        </section>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-below-fold-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.ok(result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_geometry_proof"));

    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    assert.equal(
      geometry.summary.limitations.includes("recapture:bounded_scroll_to_below_fold_first_layer_controls"),
      true,
    );
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent scanner retains a proof screenshot for deeply nested animated Borlabs controls", async () => {
  const wrappers = Array.from({ length: 12 }, () => "<div class=\"brlbs-wrapper\">").join("");
  const closers = "</div>".repeat(12);
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 1200px; font-family: sans-serif; }
          #BorlabsCookieBox .overlay { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.5); }
          #BorlabsCookieBox .dialog { position: absolute; left: 360px; top: 160px; width: 620px; padding: 24px; background: white; }
          #BorlabsCookieBox button { display: block; width: 100%; margin-top: 12px; padding: 12px; }
        </style>
      </head>
      <body>
        <main><h1>SITS-style fixture</h1></main>
        <div id="BorlabsCookieBox" data-borlabs-cookie-consent-required="true">
          ${wrappers}
            <div class="overlay">
              <section class="dialog" role="alertdialog" aria-modal="true" aria-label="Data protection preference">
                <p>We need your consent before you can continue. We use cookies for analytics and advertising.</p>
                <button>Accept all</button>
                <button>Save consent</button>
                <button>Accept essential cookies</button>
                <button>Individual preferences</button>
              </section>
            </div>
          ${closers}
        </div>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-borlabs-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.ok(result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_geometry_proof"));

    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    const acceptControl = geometry.candidates.find((candidate) => candidate.actionType === "accept_all");
    assert.match(acceptControl?.screenshotArtifactRef ?? "", /screenshot-pre-consent-geometry-proof\.png$/);
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function startServer(body: string): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
