import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { projectPostRefusalEvidenceForReport, assessConsentActionStages, postRefusalEvidencePacketSchema } from "@certscore/contracts";
import { chromium, type Browser } from "playwright";
import { runPostRefusalObserver, type PostRefusalObserverInput } from "./post-refusal-observer.js";
import { priorityEvidenceFromRecord, priorityEvidenceStates } from "../../../scripts/lib/audit-progress-priority-evidence.js";
import { terminalDecisionStatus } from "../../../scripts/lib/audit-progress-registration.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";

const routes = [
  { url: "https://www.mobvista.com/en", domain: "mobvista.com", reload: false, changedCookie: false },
  { url: "https://www.mobvista.com/en", domain: "mobvista.com", reload: true, changedCookie: false },
  { url: "https://trustarc.com/", domain: "trustarc.com", reload: true, changedCookie: false },
  { url: "https://trustarc.com/", domain: "trustarc.com", reload: true, changedCookie: true },
] as const;

test("TrustArc Reject retains exact writes during overflow and before a same-URL reload", { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await Promise.all(routes.map(async ({ url, domain, reload, changedCookie }) => {
      type Archive = Parameters<NonNullable<PostRefusalObserverInput["onTrustArcResponseCapture"]>>[0];
      let capture: Archive | undefined;
      let visits = 0;
      const interceptedBrowser = {
        async newContext(options: Parameters<Browser["newContext"]>[0]) {
          const context = await browser.newContext({ ...options, serviceWorkers: "block" });
          await context.route("**/*", async route => {
            if (route.request().url() !== url) return route.abort();
            visits++;
            return route.fulfill({ contentType: "text/html", body: visits > 1
              ? `<p>Reloaded</p>${changedCookie ? `<script>document.cookie = "cmapi_cookie_privacy=permit_1|2_functional; Domain=.${domain}; Path=/";</script>` : ""}`
              : `
              <section id="truste-consent-track"><p>Choose optional cookies</p>
              <button class="trustarc-declineall-btn" id="reject">Reject All</button></section>
              <script>
                document.getElementById("reject").onclick = () => {
                  document.cookie = "notice_preferences=0:; Domain=.${domain}; Path=/";
                  document.cookie = "notice_gdpr_prefs=0:; Domain=.${domain}; Path=/";
                  document.cookie = "cmapi_cookie_privacy=permit_1_required; Domain=.${domain}; Path=/";
                  for (let i = 0; i < 240; i++) localStorage.setItem("noise_" + i, "fixture");
                  document.querySelector("section").hidden = true;
                  if (${reload}) setTimeout(() => location.reload(), 612);
                };
              </script>` });
          });
          return context;
        },
      } as Browser;
      const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "TrustArc")!;
      const scanId = `trustarc-local-${domain}`;
      const packet = await runPostRefusalObserver({
        scanId, url, browser: interceptedBrowser, recipe, observationWindowMs: 8_000,
        confirmationTimeoutMs: 2_000, actionSearchTimeoutMs: 2_500, resultBudgetMs: 15_000,
        productionProjectable: true, boundControlDispatch: true,
        onTrustArcResponseCapture: value => { capture = value; },
        interactionAuthorization: { kind: "scan_target", normalizedUrl: url, scanId, authorizationId: "sharded_scan_exact_target.v1" },
      });
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(packet.limitations));
      assert.equal(packet.refusalRegistration.status, "confirmed", JSON.stringify(packet.confirmationDiagnostics));
      assert.equal(capture?.rejectReceipt?.writes.length, 3);
      assert.equal(capture?.rejectReceipt?.stateSha256, packet.decisionEvidence?.observedStateSha256);
      assert.equal(packet.observationWindowMs, 8_000);
      if (reload) {
        assert.equal(visits, 2);
        assert.equal(packet.interactionDiagnostics?.postClickNavigation?.outcome, "main_frame_navigated");
        if (changedCookie) assert.equal(packet.terminalDecisionEvidence, undefined);
        else {
          const terminal = packet.terminalDecisionEvidence!;
          assert.equal(terminal.evidence.decision, "denied");
          assert.equal(terminal.evidence.observedStateSha256, packet.decisionEvidence?.observedStateSha256);
          assert(terminal.trustArcReloadReadback);
          assert(terminal.readStartedAtMs >= packet.refusalRegistration.actionDispatchedAtMs! + 7_750);
          assert(terminal.readCompletedAtMs <= packet.refusalRegistration.actionDispatchedAtMs! + 8_000);
          const packetSha256 = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
          const projection = projectPostRefusalEvidenceForReport({ packet, packetSha256 });
          assert.equal(assessConsentActionStages(projection).evidenceStages.terminalChoiceStateVerified, true);
          assert.equal(projection.execution?.observationCompleted, false);
          assert.equal(terminalDecisionStatus(projection, "reject"), "verified");
          const compact = priorityEvidenceFromRecord({ runtimeArtifacts: { postRefusalEvidenceProjection: projection } });
          assert.equal(priorityEvidenceStates(compact, scanId)["sealed.terminal.audit_reject"]?.value, "verified");
          assert.equal(postRefusalEvidencePacketSchema.safeParse({
            ...packet, terminalDecisionEvidence: { ...terminal, readCompletedAtMs: packet.refusalRegistration.actionDispatchedAtMs! + 8_001 },
          }).success, false);
          assert.equal(postRefusalEvidencePacketSchema.safeParse({
            ...packet, targetUrl: "https://www.mobvista.com/en/other",
          }).success, false);
        }
        const readback = capture!.rejectReceipt!;
        assert(readback.readAtEpochMs - readback.dispatchAtEpochMs <
          packet.interactionDiagnostics.postClickNavigation.elapsedAfterClickMs!);
      } else {
        assert.equal(visits, 1);
        assert.equal(packet.terminalDecisionEvidence?.evidence.decision, "denied");
      }
    }));
  } finally {
    await browser.close();
  }
});
