import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { prepareConsentActionPage } from "@certscore/scan-core/consent-action-browser";
import { scopedConsentActionWindowMs, type AcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import type { RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { runPostRefusalObserver } from "@certscore/scan-core/post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "../../../packages/certscore-scan-core/src/post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "../../../packages/certscore-scan-core/src/post-refusal-cmp-recipes.js";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "../../../packages/certscore-scan-core/src/post-refusal-target-authorization.js";
import { buildConsentClickCheckpoint, verifyConsentClickCheckpoint } from "./reject-click-checkpoint.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const generic = { name: "generic", url: "https://93.184.215.14/", target: "https://93.184.215.14/", appearsMs: 4_000,
    controls: { accept: { selector: "#choice", label: "Accept all", id: "choice" },
      reject: { selector: "#choice", label: "Reject all", id: "choice" } } } as const;

const fixtures = [
  generic,
  { name: "Casa del Libro", url: "https://casadellibro.com/", target: "https://www.casadellibro.com/", appearsMs: 6_500,
    controls: { accept: { selector: "#onetrust-accept-btn-handler", label: "Aceptar", id: "onetrust-accept-btn-handler" },
      reject: { selector: "#onetrust-reject-all-handler", label: "Rechazar", id: "onetrust-reject-all-handler" } } },
  { name: "FictionZone", url: "https://fictionzone.net/", target: "https://fictionzone.net/", appearsMs: 6_500,
    controls: { accept: { selector: "div.cookieControl__BarButtons > button:nth-of-type(1)", label: "Accept", id: "" },
      reject: { selector: "div.cookieControl__BarButtons > button:nth-of-type(2)", label: "Essential only", id: "" } } },
  { ...generic, name: "late control", appearsMs: 7_500, passiveMs: 5_000, proofFirstMiss: true },
  { ...generic, name: "late proof", appearsMs: 1_000, passiveMs: 22_000, proofFirstMiss: false },
  { ...generic, name: "worker cutoff", appearsMs: 50, passiveMs: 4_500, workerBudgetMs: 2_400 },
] as const;

for (const fixture of fixtures) for (const action of ["accept", "reject"] as const) {
  for (const arm of ["proof_first", "early_navigation", "missing_proof"] as const) {
    if (arm === "missing_proof" && fixture.name !== "generic") continue;
    if ("workerBudgetMs" in fixture && arm !== "early_navigation") continue;
    test(`${fixture.name} ${action} ${arm} preserves the exact click boundary`, { timeout: 34_000 }, async t => {
      const browser = await chromium.launch({ args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
      t.after(() => browser.close());
      const prepared = await prepareConsentActionPage(browser, true, action);
      const { url, target } = fixture;
      const { selector, label, id } = fixture.controls[action];
      const scanId = `early-navigation-${action}-${arm}`;
      let navigationAtMs: number | undefined;
      let clickAtMs: number | undefined;
      await prepared.context.route("**/*", route => {
        const request = route.request().url();
        if (request === url && url !== target) return route.fulfill({
          contentType: "text/html", body: `<script>location.replace(${JSON.stringify(target)})</script>`,
        });
        if (request === target) {
          navigationAtMs = Date.now();
          const button = `<button id="${id}" type="button">${label}</button>`;
          const controls = fixture.name === "FictionZone"
            ? `<div class="cookieControl__BarContainer"><div class="cookieControl__BarButtons">
              ${action === "reject" ? "<button>Accept</button>" : ""}${button}</div></div>`
            : button;
          const banner = fixture.name === "Casa del Libro" ? "onetrust-banner-sdk" : "cookie-banner";
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><body>
            <script src="/late-consent.js"></script>
            <section id="${banner}" role="dialog" aria-label="Cookie consent">
              <p>Choose whether we use optional analytics cookies.</p>${controls}
            </section>
            <script>document.querySelector(${JSON.stringify(selector)}).addEventListener('click', event => {
              if (event.isTrusted) { fetch('/clicked'); document.querySelector('section').hidden = true; }
            });</script></body>` });
        }
        if (request === target + "late-consent.js") {
          return delay(arm === "missing_proof" ? 50 : fixture.appearsMs).then(() =>
            route.fulfill({ contentType: "text/javascript", body: "" }));
        }
        if (request === target + "clicked") {
          assert.equal(clickAtMs, undefined);
          clickAtMs = Date.now();
          return route.fulfill({ body: "" });
        }
        return route.abort();
      });
      const startedAtMs = Date.now();
      const parentDispatchSha256 = hash(scanId);
      const passiveMs = "passiveMs" in fixture ? fixture.passiveMs : 5_000;
      const released = delay(passiveMs).then(() => {
        assert.equal(clickAtMs, undefined, "the visible choice cannot be clicked before release");
        const issuedAtMs = Date.now();
        const source = { parentDispatchSha256, sourceSha256: hash("source"), geometrySha256: hash("geometry"),
          selectorSha256: hash(selector), documentSha256: hash(target), requestedTargetSha256: hash(url), labelSha256: hash(label) };
        const timing = { issuedAtMs, expiresAtMs: issuedAtMs + (scopedConsentActionWindowMs(action, selector, source) ?? 6_000) };
        return {
          accept: { ...source, ...timing, version: "certscore.accept-first-layer-proof.v1",
            exactSelector: selector, scanId } satisfies AcceptFirstLayerProof,
          reject: { ...timing, outcome: "qualified", exactSelector: selector, scanId,
            binding: { ...source, documentTokenSha256: hash("original-loader"), selectorEvidence: "verified_geometry",
              labelMatch: "exact" } } satisfies RejectFirstLayerProof,
        };
      });
      const current = arm === "proof_first" ? await released : undefined;
      if (!current) await delay(action === "accept" ? 1_000 : 500);
      const take = async <A extends "accept" | "reject">(selected: A) => {
        const proof = (await released)[selected];
        assert.ok(navigationAtMs && navigationAtMs < proof.issuedAtMs, "navigation must overlap passive capture");
        if (arm === "missing_proof") throw new Error("fixture_proof_declined");
        return proof;
      };
      let recheckedAtMs: number | undefined;
      let receiptAtMs: number | undefined;
      let reserveMs: number | undefined;
      let verifiedAfterRelease = false;
      const recheck = (outcome: "passed" | "failed") => {
        recheckedAtMs = outcome === "passed" ? Date.now() : undefined;
      };
      const complete = async (event: {control: Parameters<typeof buildConsentClickCheckpoint>[1]; dispatchedAtMs:number; completedAtMs:number}) => {
        const authorized = await released;
        const binding = action === "accept" ? { action, proof: authorized.accept } : { action, proof: authorized.reject };
        if (recheckedAtMs === undefined) return;
        const body = buildConsentClickCheckpoint(binding, event.control, { recheckedAtMs,
          dispatchedAtMs: event.dispatchedAtMs, completedAtMs: event.completedAtMs });
        if (!body) return;
        const verified = verifyConsentClickCheckpoint({ body, binding, metadataSha256: hash(body),
          coordinatorDispatchAtMs: binding.proof.issuedAtMs, verifiedAtMs: Date.now(), deadlineAtMs: binding.proof.expiresAtMs });
        if (!verified) return;
        verifiedAfterRelease = verified.dispatchedAtMs >= binding.proof.issuedAtMs;
        receiptAtMs = verified.completedAtMs;
        reserveMs = binding.proof.expiresAtMs - verified.completedAtMs;
      };
      const workerBudgetMs = "workerBudgetMs" in fixture ? fixture.workerBudgetMs : 30_000;
      const settings = { preparedActionPage: prepared, url, scanId, recipeSetId: "early-navigation-fixture", actionSearchTimeoutMs: 14_000,
        signal: AbortSignal.timeout(workerBudgetMs - (Date.now() - startedAtMs)),
        resultBudgetMs: 20_000, confirmationTimeoutMs: 500, observationWindowMs: 100,
        interactionAuthorization: { kind: "scan_target_resolution" as const, authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
          scanId, requestedUrl: url, maxRedirects: 1, resolutionTimeoutMs: 1_000 } };
      const a = buildCanonicalPostAcceptActionRecipes();
      const r = buildCanonicalPostRefusalActionRecipes();
      const worker = action === "accept"
        ? runPostAcceptObserver({ ...settings, allowCanonicalAcceptDiscovery: true,
            recipe: a[0]!, recipeCandidates: a, ...(current ? { firstLayerProof: current.accept } :
              { deferredProof: { parentDispatchSha256, take: () => take("accept") } }),
            onAcceptGateFinalRecheck: recheck, onExactAcceptClickCompleted: complete })
        : runPostRefusalObserver({ ...settings, allowCanonicalRejectDiscovery: true,
            recipe: r[0]!, recipeCandidates: r, ...(current ? { firstLayerProof: current.reject } :
              { deferredProof: { parentDispatchSha256, take: () => take("reject") } }),
            onRejectGateFinalRecheck: recheck, onExactRejectClickCompleted: complete });
      if (arm === "missing_proof") {
        await assert.rejects(worker, /fixture_proof_declined/);
        assert.equal(clickAtMs, undefined);
        assert.equal(receiptAtMs, undefined);
        return;
      }
      const result = await worker;
      if ("workerBudgetMs" in fixture) {
        assert.ok(Date.now() - startedAtMs < passiveMs);
        assert.notEqual(result.interactionDiagnostics?.click.outcome, "completed");
        await released;
        assert.ok(navigationAtMs);
        assert.equal(clickAtMs, undefined);
        assert.equal(receiptAtMs, undefined);
        return;
      }
      if ("proofFirstMiss" in fixture && fixture.proofFirstMiss && arm === "proof_first") {
        assert.notEqual(result.interactionDiagnostics?.click.outcome, "completed");
        assert.equal(clickAtMs, undefined);
        assert.equal(receiptAtMs, undefined);
        t.diagnostic(JSON.stringify({ fixture: fixture.name, action, arm, detected: result.resolver.found,
          result: result.resolver.reason, totalMs: Date.now() - startedAtMs }));
        return;
      }
      assert.equal(result.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(result.limitations));
      assert.ok(navigationAtMs && receiptAtMs && reserveMs !== undefined && reserveMs >= 200 && verifiedAfterRelease);
      t.diagnostic(JSON.stringify({ fixture: fixture.name, action, arm, detected: result.resolver.found, proofReserveMs: reserveMs,
        navigationMs: navigationAtMs - startedAtMs, receiptMs: receiptAtMs - startedAtMs, totalMs: Date.now() - startedAtMs }));
    });
  }
}
