import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { boundRuntimeDocumentStatus, domSnapshotArtifactSchema } from "@certscore/contracts";
import { runScan } from "@certscore/scan-core";
import { projectCaliforniaObservedScoreBasis } from "../../web/server/scans/california-observed-score-basis";
import { buildLocalV2DagLambdaLaneRun } from "./handler";
import { assertOriginalRuntimeVisitForReport, buildRuntimeVisitEligibilityDiagnostic } from "./runtime-representative-evidence";

const challenge = "Verifying your browser before proceeding... Incident ID: fixture-1";

for (const mode of ["delayed", "spa", "replacement", "empty", "loading", "challenge", "auth", "missing"] as const) {
  test(`starting-page capture handles a ${mode} document`, async (t) => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      const route = request.url ?? "/";
      if (request.method === "GET" && route !== "/favicon.ico") requests.push(route);
      response.writeHead(mode === "auth" ? 401 : mode === "missing" ? 404 : 200, { "Content-Type": "text/html; charset=utf-8" });
      const text = route === "/replacement" ? "Replacement document" :
        mode === "challenge" ? challenge : mode === "loading" ? "Establishing a secure connection… Please wait." : "";
      response.end(`<!doctype html><html lang="en"><title>Public application</title><body><main>${text}</main></body></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const outDir = await mkdtemp(join(tmpdir(), "certscore-public-runtime-"));
    let finishedMetadata = false;
    const launch = chromium.launch.bind(chromium);
    t.mock.method(chromium, "launch", async (options) => {
      const browser = await launch({ ...options, args: [
        ...(options?.args ?? []), "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      ] });
      const newContext = browser.newContext.bind(browser);
      t.mock.method(browser, "newContext", async (...args) => {
        const context = await newContext(...args);
        const newPage = context.newPage.bind(context);
        t.mock.method(context, "newPage", async () => {
          const page = await newPage();
          const evaluate = page.evaluate.bind(page);
          t.mock.method(page, "evaluate", async (fn, arg) => {
            const value = await evaluate(fn, arg);
            // Deliver the render at the metadata checkpoint so fixture timing
            // cannot accidentally move it into the earlier inventory capture.
            if (!finishedMetadata && arg && typeof arg === "object" && "technologyAssetPatterns" in arg) {
              finishedMetadata = true;
              if (mode === "replacement") await page.goto(url + "replacement");
              if (mode === "delayed" || mode === "spa") await evaluate(changeRoute => {
                if (changeRoute) {
                  history.pushState({}, "", "/map?public=1#view");
                  document.title = "Public map";
                }
                document.querySelector("main")!.textContent = "地図";
              }, mode === "spa");
            }
            return value;
          });
          return page;
        });
        return context;
      });
      return browser;
    });
    try {
      const bundle = await runScan({ url, outDir, evidenceLane: "runtime_evidence",
        browserReuseMode: "single", profile: "tiny", scenarioResourceMode: "lean" });
      const lane = buildLocalV2DagLambdaLaneRun({ bundle, workerLane: "runtime_evidence", region: "local" });
      assert.ok(lane);
      bundle.scanLaneRuns = [lane];
      const snapshot = bundle.domSnapshots.find(value => value.artifactId === "dom_text_pre_consent");
      assert.ok(snapshot?.runtimeDocumentCapture, JSON.stringify(bundle.modulesRun));
      assert.ok(domSnapshotArtifactSchema.safeParse(snapshot).success);
      assert.equal(bundle.screenshots.length, 0);
      assert.equal(finishedMetadata, true);
      assert.equal(lane.firstHttpStatus, mode === "auth" ? 401 : mode === "missing" ? 404 : 200);
      assert.deepEqual(requests, mode === "replacement" ? ["/", "/replacement"] : ["/"]);

      if (mode === "delayed" || mode === "spa") {
        assert.equal(lane.accessOutcome, "representative_page");
        assert.equal(snapshot.url, mode === "spa" ? url + "map?public=1#view" : url);
        assert.equal(snapshot.runtimeDocumentCapture.response?.route, mode === "spa" ? "same_document" : "committed");
        assert.equal(snapshot.runtimeDocumentCapture.response?.origin, new URL(url).origin);
        assert.equal(snapshot.runtimeDocumentCapture.response?.requestUrlSha256, createHash("sha256").update(url).digest("hex"));
        assert.equal(Object.hasOwn(snapshot.runtimeDocumentCapture.response!, "url"), false);
        assert.equal(boundRuntimeDocumentStatus(snapshot), 200);
        assert.equal(snapshot.siteMetadata?.title, mode === "spa" ? "Public map" : "Public application");
        assert.equal(snapshot.textExcerpt, "地図");
        assert.equal((await readFile(snapshot.path, "utf8")).trim(), snapshot.textExcerpt);
        assert.doesNotThrow(() => assertOriginalRuntimeVisitForReport(bundle, bundle));
        assert.equal(buildRuntimeVisitEligibilityDiagnostic(bundle), undefined);
        const reportBundle: typeof bundle = { ...bundle, runtimeMetadataSnapshots: [snapshot], domSnapshots: [] };
        const verifiedSource = { sha256: "a".repeat(64), verificationStatus: "verified" };
        assert.ok(projectCaliforniaObservedScoreBasis(reportBundle, verifiedSource, snapshot.url));
        if (mode === "spa") {
          reportBundle.domSnapshots.push({ ...snapshot, url, documentIdentity: { source: "cdp_loader_id", token: "independent-consent" } });
          assert.ok(projectCaliforniaObservedScoreBasis(reportBundle, verifiedSource, url));
        }
      } else if (mode === "challenge" || mode === "auth" || mode === "missing") {
        const expected = mode === "challenge" ? "captcha_or_challenge" :
          mode === "auth" ? "authentication_required" : "not_found_404";
        assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
        assert.equal(bundle.scanNoGoAssessment?.reasonCodes[0], expected);
        assert.equal(buildRuntimeVisitEligibilityDiagnostic(bundle)?.retainedNoGoReason, expected);
        assert.notEqual(lane.accessOutcome, "representative_page");
      } else {
        assert.equal(lane.accessOutcome, "unknown");
        assert.throws(() => assertOriginalRuntimeVisitForReport(bundle, bundle), /original_runtime_visit_unavailable/);
        const diagnostic = buildRuntimeVisitEligibilityDiagnostic(bundle);
        assert.equal(diagnostic?.reasonCode, mode === "replacement" ? "runtime_document_unverified" : mode === "loading" ? "runtime_loading_placeholder" : "runtime_content_unavailable");
        assert.equal(diagnostic?.retainedNoGoReason, undefined);
        if (mode === "replacement") {
          assert.equal(snapshot.documentIdentity, undefined);
          assert.equal(snapshot.siteMetadata, undefined);
          assert.equal(snapshot.textExcerpt, "");
          assert.equal(boundRuntimeDocumentStatus(snapshot), undefined);
        }
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(outDir, { recursive: true, force: true });
    }
  });
}
