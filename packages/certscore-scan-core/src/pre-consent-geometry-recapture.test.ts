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

test("pre-consent scanner captures transient first-layer geometry before risky screenshot capture", async () => {
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 1400px; font-family: sans-serif; }
          main { padding: 180px 32px 32px; }
          .cookie-modal {
            position: absolute;
            top: 24px;
            left: calc(50% - 300px);
            width: 600px;
            padding: 24px;
            background: #fff;
            border: 1px solid #333;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
          }
          .cookie-modal button, .cookie-modal a { margin-right: 12px; padding: 12px 18px; }
        </style>
      </head>
      <body>
        <section class="cookie-modal" role="dialog" aria-label="Cookie consent">
          <p>We and our partners use cookies for advertising and audience measurement.</p>
          <a href="#continue">Continue without accepting</a>
          <button>Set up</button>
          <button>Accept all</button>
        </section>
        <main><h1>Transient consent fixture</h1></main>
        <script>
          setTimeout(() => document.querySelector(".cookie-modal")?.remove(), 900);
        </script>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-transient-top-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      screenshotCaptureMode: "full_page_first",
      screenshotMode: "always",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.ok(
      result.moduleRun.timingBreakdown?.some((entry) => entry.label === "consent control geometry diagnostic pre-screenshot"),
      "expected pre-screenshot geometry pass before early screenshot capture",
    );

    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
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
