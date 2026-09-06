import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { runPostRefusalObserver } from "../../../../packages/certscore-scan-core/src/post-refusal-observer";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";

for (const direct of [false, true]) {
  test(`loopback Reject: ${direct ? "new tracking scores" : "pre-click redirect alone stays neutral"} without decision registration`, async () => {
    let pendingRedirect: ServerResponse | undefined;
    const server = createServer((request, response) => {
      if (request.url === "/redirect-source") { pendingRedirect = response; return; }
      if (request.url === "/clicked") {
        pendingRedirect?.writeHead(302, { location: "https://www.google-analytics.com/g/collect?tid=G-REDIRECT" }).end();
        response.writeHead(204).end(); return;
      }
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><section id="consent-banner" role="dialog" aria-label="Cookie consent">
        <p>Choose whether this site may use analytics and advertising cookies.</p>
        <button id="reject" hidden>Reject all</button></section><script>
        fetch('/redirect-source').catch(()=>{});
        setTimeout(()=>document.getElementById('reject').hidden=false,150);
        document.getElementById('reject').onclick=()=>{
          document.getElementById('consent-banner').hidden=true;
          fetch('/clicked');
          ${direct ? "fetch('https://www.google-analytics.com/g/collect?tid=G-DIRECT').catch(()=>{});" : ""}
        };
      </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const browser = await chromium.launch({ headless: true });
    const originalNewContext = browser.newContext.bind(browser);
    // External endpoint shapes are synthetic; no request leaves loopback.
    browser.newContext = async (options) => {
      const context = await originalNewContext(options);
      await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue()
        : route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
      return context;
    };
    try {
      const packet = await runPostRefusalObserver({
        url, scanId: "local-reject-click-policy", browser, productionProjectable: true,
        interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
        allowCanonicalRejectDiscovery: true, actionSearchTimeoutMs: 1500,
        confirmationTimeoutMs: 75, observationWindowMs: 400,
        recipe: { artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "loopback-generic-reject",
          resolverMethod: "local_fixture_recipe", controlSelector: "#absent", bannerSelector: "#consent-banner",
          confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "denied" } },
      });
      assert.equal(packet.refusalRegistration.status, "unconfirmed");
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(packet.afterActionCapture?.policyVersion, "bounded_after_action_capture.v2");
      const analytics = packet.network.requests.filter((row) => row.purpose === "analytics");
      assert.equal(analytics.length, direct ? 2 : 1);
      const capture = packet.afterActionCapture!;
      const ancestry = analytics.map((row) => capture.requestAncestry!.find((entry) => entry.requestId === row.requestId)!);
      assert.equal(ancestry.filter((row) => row.rootStartedAtMs <= capture.actionDispatchedAtMs).length, 1);
      const runtimeArtifacts = buildPostRefusalRuntimeProjection(projectPostRefusalEvidenceForReport({ packet, packetSha256: "b".repeat(64) }));
      const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
      const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns,
        coverageLimited: false, scanCompleted: true, snapshot: {} });
      const rows = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, coverageLimited: false,
        scanCompleted: true, projectedFindings: [], unifiedFindings: [] }).filter((row) => row.id === "post_reject_tracking_reduction");
      assert.equal(normalizedConcerns.length, direct ? 1 : 0, JSON.stringify({ proof: packet.actionControlProof,
        capture, analytics, decision: packet.decisionEvidence, status: packet.refusalRegistration.status, limitations: packet.limitations }));
      const checked = { id: "privacy_notice_availability", assessmentStatus: "checked", status: "Observed", evidenceState: "observed" };
      assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [checked, ...rows] }).score, direct ? 88 : 100);
    } finally {
      pendingRedirect?.end();
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
