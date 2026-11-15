import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Locator, type Page } from "playwright";
import { projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { runPostAcceptObserver } from "./post-accept-observer";
import { runPostRefusalObserver } from "./post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "./post-refusal-target-authorization";

// Chromium intercepts every request. A public IP literal passes the existing
// exact-HTTPS target validator without a DNS lookup or an external connection.
const url = "https://93.184.215.14/";
const target = `${url}en/`;
const bootstrap = "https://js-eu1.hsforms.net/forms/embed/v2.js";
const html = `<!doctype html><body style="min-height:2000px">
<style>form { width: 360px; padding: 16px; margin: 20px; border: 1px solid #555 } label { display: block }</style>
<script src="/borlabs-cookie.js"></script></body>`;
const cmp = (withFormFollowup: boolean) => `
  window.grants = {essential:false,analytics:false};
  window.borlabsCookieConfig = {settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true},
    services:{essential:{id:'essential',serviceGroupId:'essential'},analytics:{id:'analytics',serviceGroupId:'statistics'}}};
  window.BorlabsCookie = {Consents:{hasConsent:id=>window.grants[id]}};
  document.body.insertAdjacentHTML('beforeend','<section id="BorlabsCookieBox" class="brlbs-cmpnt-dialog-box-entrance" role="dialog" hidden><p>Choose cookies for analytics</p><button id="accept">Accept all</button><button id="reject">Accept essential cookies</button></section>');
  const banner = document.getElementById('BorlabsCookieBox');
  addEventListener('scroll', () => { banner.hidden = false; }, {once:true});
  dispatchEvent(new Event('borlabs-cookie-after-init'));
  for (const action of ['accept','reject']) document.getElementById(action).onclick = () => {
    window.grants = {essential:true,analytics:action==='accept'};
    dispatchEvent(new Event('borlabs-cookie-consent-saved'));
    banner.hidden = true;
    fetch('/clicked/'+action);
    if (action==='accept' && ${withFormFollowup}) {
      const script=document.createElement('script');
      script.src='${bootstrap}';
      document.head.append(script);
    }
  };
`;
const formScript = `
  setTimeout(() => {
    for (const count of [6,3]) {
      const form=document.createElement('form');
      form.setAttribute('aria-label','Example form '+count);
      form.innerHTML=Array.from({length:count},(_,i)=>'<label>Field '+i+'<input name="field'+i+'" value="fixture-private-value"></label>').join('');
      document.body.append(form);
    }
  }, 2300);
`;

for (const action of ["accept", "reject"] as const) {
  test(`redirected deferred Borlabs ${action} keeps the original action and result budgets`, { timeout: 30_000 }, async t => {
    const browser = await chromium.launch({ headless: true });
    const newContext = browser.newContext.bind(browser);
    const clicks: string[] = [];
    let dispatched = false;
    let storageReads = 0;
    let earlyExitWriteReads = 0;
    t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
      // The production worker spent about 3.7 seconds before document commit.
      if (action === "accept") await delay(3500);
      const context = await newContext(...args);
      const newPage = context.newPage.bind(context);
      await context.route("**/*", async route => {
        switch (route.request().url()) {
          case url: return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(target)})</script>` });
          case target: return route.fulfill({ contentType: "text/html", body: html });
          case `${url}borlabs-cookie.js`:
            if (action === "accept") await delay(11_000);
            return route.fulfill({ contentType: "text/javascript", body: cmp(true) });
          case bootstrap: return route.fulfill({ contentType: "text/javascript", body: formScript });
          case `${url}clicked/accept`:
          case `${url}clicked/reject`:
            clicks.push(route.request().url().split("/").at(-1)!);
            return route.fulfill({ body: "ok" });
          default: return route.abort();
        }
      });
      context.newPage = async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        page.evaluate = (async (fn: unknown, arg: unknown) => {
          if (action === "accept" && dispatched && String(fn).includes("Object.entries(window.localStorage)")) {
            storageReads++;
            // Simulate a terminal renderer reply that arrives beyond the
            // original result deadline. It must not displace form evidence.
            await delay(21_000, undefined, { ref: false });
          }
          if (action === "accept" && dispatched && String(fn).includes(".__certscoreReadPostAcceptWrites")) earlyExitWriteReads++;
          return evaluate(fn as never, arg as never);
        }) as Page["evaluate"];
        return page;
      };
      return context;
    });
    const scanId = `redirected-budget-${action}`;
    const common = {
      browser, url, scanId, recipeSetId: "redirect-budget-fixture", productionProjectable: true,
      resultBudgetMs: action === "accept" ? 20_000 : 7000,
      actionSearchTimeoutMs: action === "accept" ? 13_000 : 3000,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        kind: "scan_target_resolution" as const, authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
        requestedUrl: url, scanId, maxRedirects: 1, resolutionTimeoutMs: 1000,
      },
      onActionDispatchCommitted: () => { dispatched = true; },
    };
    try {
      if (action === "reject") {
        const recipes = buildCanonicalPostRefusalActionRecipes();
        const packet = await runPostRefusalObserver({
          ...common, recipe: recipes[0]!, recipeCandidates: recipes,
          allowCanonicalRejectDiscovery: true, observationWindowMs: 350,
        });
        assert.equal(packet.refusalRegistration.status, "confirmed", JSON.stringify({ limitations: packet.limitations, timing: packet.timing, navigation: packet.interactionDiagnostics?.navigation }));
        assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      } else {
        const recipes = buildCanonicalPostAcceptActionRecipes();
        const packet = await runPostAcceptObserver({
          ...common, recipe: recipes[0]!, recipeCandidates: recipes,
          allowCanonicalAcceptDiscovery: true, observationWindowMs: 3000,
          formSnapshotReviewer: async () => ({ safeForDisplay: true }),
        });
        assert.equal(packet.acceptanceRegistration.status, "confirmed", JSON.stringify({ limitations: packet.limitations, timing: packet.timing, navigation: packet.interactionDiagnostics?.navigation }));
        assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
        assert.equal(packet.timing.observationExitReason, "window_elapsed");
        assert.ok(packet.timing.observationMs! >= 3000);
        assert.ok(packet.acceptanceRegistration.acceptanceRegisteredAtMs! >= 14_500);
        assert.ok(packet.timing.totalMs < common.resultBudgetMs, JSON.stringify(packet.timing));
        assert.equal(packet.productionProjectable, true);
        assert.equal(storageReads, 1);
        assert.equal(earlyExitWriteReads, 1, "only the existing terminal decision read may inspect writes");
        assert.equal(packet.storage.collectionDiagnostics?.postAction?.localStorage.status, "failed");
        assert.deepEqual(packet.formCapture?.frames.flatMap(frame => frame.forms.map(form => form.fields.length)), [6, 3]);
        assert.equal(packet.formImageDiagnostics?.availableImages, 2);
        assert.ok(!JSON.stringify(packet).includes("fixture-private-value"));
        const report = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
        assert.equal(report.formSnapshotCapture?.snapshots.filter(image => image.status === "available").length, 2);
        t.diagnostic(JSON.stringify({ timing: packet.timing, registeredAtMs: packet.acceptanceRegistration.acceptanceRegisteredAtMs }));
      }
      assert.deepEqual(clicks, [action]);
    } finally {
      await browser.close();
    }
  });
}

const scopedButtonScenarios = {
  recover: "recovers after a disappearing button",
  deadline: "stops at the deadline with an incomplete inventory",
  duplicate: "stops with duplicate eligible buttons",
  canonicalDuplicate: "stops with duplicate eligible buttons during canonical discovery",
} as const;
for (const [scenario, description] of Object.entries(scopedButtonScenarios)) {
  for (const action of ["accept", "reject"] as const) {
    test(`Borlabs ${action} ${description}`, { timeout: 10_000 }, async t => {
      const browser = await chromium.launch({ headless: true });
      const newContext = browser.newContext.bind(browser);
      const clicks: string[] = [];
      let removedButtons = 0;
      let dispatches = 0;
      const canonicalDiscovery = scenario === "canonicalDuplicate";
      const duplicate = scenario === "duplicate" || canonicalDiscovery ? `
        const original = document.getElementById(${JSON.stringify(action)});
        const duplicate = original.cloneNode(true);
        duplicate.removeAttribute('id');
        duplicate.onclick = original.onclick;
        original.after(duplicate);
      ` : "";
      t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
        const context = await newContext(...args);
        await context.route("**/*", route => {
          switch (route.request().url()) {
            case url: return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(target)})</script>` });
            case target: return route.fulfill({ contentType: "text/html", body: html });
            case `${url}borlabs-cookie.js`: return route.fulfill({ contentType: "text/javascript", body: cmp(false) + duplicate });
            case `${url}clicked/accept`:
            case `${url}clicked/reject`:
              clicks.push(route.request().url().split("/").at(-1)!);
              return route.fulfill({ body: "ok" });
            default: return route.abort();
          }
        });
        const newPage = context.newPage.bind(context);
        t.mock.method(context, "newPage", async () => {
          const page = await newPage();
          const prototype = Object.getPrototypeOf(page.locator("button"));
          const count = prototype.count;
          t.mock.method(prototype, "count", async function (this: Locator) {
            const scopedButtons = this.toString().includes("brlbs-cmpnt-dialog-box-entrance") &&
              this.toString().includes("getByRole('button')");
            const competitor = action === "accept" ? "reject" : "accept";
            if (scopedButtons && scenario === "deadline" && removedButtons > 0) {
              await page.evaluate(id => {
                const missing = document.querySelector(`template#removed-${id}`);
                if (missing instanceof HTMLTemplateElement) missing.replaceWith(missing.content);
              }, competitor);
            }
            const result = await count.call(this);
            if (scopedButtons && result === 2 && (scenario === "deadline" || scenario === "recover" && removedButtons === 0)) {
              await page.locator(`#${competitor}`).evaluate(button => {
                const marker = document.createElement("template");
                marker.id = `removed-${button.id}`;
                button.replaceWith(marker);
                marker.content.append(button);
              });
              removedButtons++;
            }
            return result;
          });
          return page;
        });
        return context;
      });
      const scanId = `borlabs-scoped-buttons-${scenario}-${action}`;
      const common = {
        browser, url, scanId, recipeSetId: "redirect-budget-fixture",
        resultBudgetMs: 7000, actionSearchTimeoutMs: 3000, confirmationTimeoutMs: 500, observationWindowMs: 350,
        interactionAuthorization: {
          kind: "scan_target_resolution" as const, authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
          requestedUrl: url, scanId, maxRedirects: 1, resolutionTimeoutMs: 1000,
        },
        onActionDispatchCommitted: () => { dispatches++; },
      };
      try {
        const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
        const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
        const packet = action === "accept"
          ? await runPostAcceptObserver({
              ...common, recipe: acceptRecipes.find(recipe => recipe.cmpId === "Borlabs Cookie")!,
              ...(canonicalDiscovery ? { recipeCandidates: acceptRecipes, allowCanonicalAcceptDiscovery: true } : {}),
            })
          : await runPostRefusalObserver({
              ...common, recipe: rejectRecipes.find(recipe => recipe.cmpId === "Borlabs Cookie")!,
              ...(canonicalDiscovery ? { recipeCandidates: rejectRecipes, allowCanonicalRejectDiscovery: true } : {}),
            });
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        const snapshots = packet.interactionDiagnostics?.resolver?.snapshots ?? [];
        if (scenario === "recover") {
          assert.equal(removedButtons, 1);
          const incomplete = snapshots.findIndex(snapshot => snapshot.state === "binding_budget_exhausted");
          assert.ok(incomplete >= 0 && snapshots[incomplete]?.actionableCount === 0);
          assert.ok(snapshots.slice(incomplete + 1).some(snapshot => snapshot.state === "single_actionable"));
          assert.equal(registration.status, "confirmed", JSON.stringify(packet.limitations));
          assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
          assert.equal(dispatches, 1);
          assert.deepEqual(clicks, [action]);
        } else {
          assert.equal(dispatches, 0);
          assert.deepEqual(clicks, []);
          assert.equal(packet.interactionDiagnostics?.click.outcome, "not_attempted");
          assert.equal(registration.status, "not_attempted");
          assert.ok(!snapshots.some(snapshot => snapshot.state === "single_actionable"));
          if (scenario === "deadline") {
            assert.ok(removedButtons > 1);
            assert.ok(snapshots.some(snapshot => snapshot.state === "binding_budget_exhausted" && snapshot.actionableCount === 0));
          } else {
            assert.ok(snapshots.some(snapshot => snapshot.state === "scope_ambiguous" && snapshot.actionableCount === 0 ||
              canonicalDiscovery && snapshot.state === "multiple_actionable"), JSON.stringify(snapshots));
          }
        }
        assert.ok(packet.timing.totalMs < common.resultBudgetMs);
      } finally {
        t.mock.restoreAll();
        await browser.close();
      }
    });
  }
}
