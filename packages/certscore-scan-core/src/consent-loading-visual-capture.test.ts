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

for (const { completes, deferred } of [{completes: true, deferred: false}, {completes: false, deferred: false}, {completes: true, deferred: true}]) test(`loading Borlabs capture ${deferred ? "after deferred reveal " : ""}${completes ? "pairs fresh proof after load" : "stays unassessed when load never finishes"}`, { timeout: 30_000 }, async () => {
  const server = createServer((request, response) => {
    if (request.url === "/slow-image") {
      if (completes) setTimeout(() => { if (!response.destroyed) { response.writeHead(204); response.end(); } }, 3500);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head><title>Loading Borlabs capture fixture</title><style>
      body{background:white;font:16px Arial;min-height:2000px}.brlbs-cmpnt-dialog{position:fixed;top:100px;left:100px;width:520px;padding:24px;background:white}
      button{display:block;width:300px;height:50px;margin:18px;border:0;background:white;color:black}#accept{background:#2054db;color:white}
      </style></head><body><main><h1>Loading resource fixture</h1><p>Consent controls appear before an unrelated image finishes loading.</p><img src="/slow-image"></main>
      <div style="display:${deferred ? "none" : "block"}" class="brlbs-cmpnt-dialog" role="dialog" aria-label="Cookie choices"><div class="brlbs-cmpnt-dialog-box-entrance"><p>We use optional cookies. Choose your preferences.</p>
      <button id="accept">Accept all cookies</button><button id="reject">Accept essential cookies</button><button>Individual preferences</button></div></div>
      <script>window.BorlabsCookie={};
      ${deferred ? `window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true}};
      setTimeout(()=>{window.BorlabsCookie={Consents:{hasConsent:()=>false}};
        window.dispatchEvent(new Event('borlabs-cookie-after-init'));
        window.addEventListener('scroll',()=>document.querySelector('.brlbs-cmpnt-dialog').style.display='block',{once:true});
      },1800);` : ""}
      </script></body></html>`);
  });
  const directory = await mkdtemp(join(tmpdir(), "consent-loading-visual-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const writer = await createArtifactWriter(directory), writes: ConsentControlGeometryArtifact[] = [];
    const url = `http://127.0.0.1:${address.port}/`;
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url,
      scanStartedAtMs: Date.now(), internalBudgetMs: 20_000, captureScope: "consent_proof", screenshotMode: "always",
      screenshotCaptureMode: "viewport_first", waitMode: "fast", artifactWriter: { ...writer,
        async writeJsonArtifact(name, value) {
          if (name === "ConsentControlGeometryEvidence.json") writes.push(structuredClone(value) as ConsentControlGeometryArtifact);
          return writer.writeJsonArtifact(name, value);
        } } });
    assert.equal(result.moduleRun.status, "completed");
    const final = JSON.parse(await readFile(join(directory, "ConsentControlGeometryEvidence.json"), "utf8"));
    const settle = result.moduleRun.timingBreakdown?.find(row => row.label === "consent prominence document settle");
    assert.ok(settle);
    assert.equal(result.moduleRun.timingBreakdown?.filter(row => row.label === "consent prominence document settle").length, 1);
    assert.ok(settle.durationMs > 500, "fixture must exercise an unfinished page load");
    assert.ok(settle.durationMs <= 3200, "settle must respect the three-second cap");
    assert.equal(settle.outcome, completes ? "completed" : "timed_out");
    if (!completes) {
      assert.equal(final.controlInspection.captureCoverage.documentReadyState, "interactive");
      assert.equal(final.controlInspection.structuralCoverage, "limited");
      assert.equal(final.visualComparison, undefined);
      return;
    }
    assert.equal(final.controlInspection.captureCoverage.documentReadyState, "complete");
    assert.ok(final.visualComparison, "fresh complete geometry and pixels must be paired");
    assert.ok(final.visualComparison.captureSkewMs <= 500);
    assert.ok(hasMaterialAcceptVisualProminence(final.visualComparison));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
