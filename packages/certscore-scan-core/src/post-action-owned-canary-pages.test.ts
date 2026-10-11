import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  projectPostAcceptEvidenceForReport,
  projectPostRefusalEvidenceForReport,
} from "@certscore/contracts";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import { buildCanonicalPostRefusalActionRecipes, CANONICAL_POST_REFUSAL_RECIPE_SET_ID } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

const acceptRecipe = buildCanonicalPostAcceptActionRecipes().find((recipe) => recipe.cmpId === "OneTrust");
const rejectRecipe = buildCanonicalPostRefusalActionRecipes().find((recipe) => recipe.cmpId === "OneTrust");
assert.ok(acceptRecipe);
assert.ok(rejectRecipe);

test("testar1 separates confirmed Accept activity from a clean confirmed Reject outcome", async () => {
  await withCanaryServer(async (origin) => {
    const url = `${origin}/testar1.html`;
    const accepted = await observeAccept(url, "testar1-accept");
    const rejected = await observeReject(url, "testar1-reject");

    assert.equal(accepted.acceptanceRegistration.status, "confirmed");
    assert.equal(accepted.acceptanceRegistration.witnesses[0]?.witnessType, "tcf_user_action_complete");
    assert.equal(accepted.observations.some((row) =>
      row.observationType === "acceptance_signal_contradicts_action"
    ), false);
    assert.equal(accepted.storage.writesAfterAccept.some((write) =>
      write.name === "_ga" && write.nonEssential
    ), true);
    assert.equal(accepted.storage.writesAfterAccept.some((write) =>
      write.name === "_gid" && write.nonEssential
    ), true);
    assert.equal(accepted.network.postAcceptNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);
    assert.equal(accepted.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(accepted.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (accepted.acceptanceRegistration.acceptanceRegisteredAtMs ?? 0)
    ), true);

    assert.equal(rejected.refusalRegistration.status, "confirmed");
    assert.equal(rejected.observedActionSourceProof?.policyVersion, "bounded_observed_action_sources.v1");
    assert.equal(rejected.observedActionSourceProof?.semanticDecisionConfirmed, true);
    assert.equal(rejected.observedActionSourceProof?.requests.handlerReceivedCount,
      rejected.captureCoverage?.postActionRetention?.requestsObserved);
    assert.equal(rejected.observedActionSourceProof?.configuredWindowCompleted, true);
    assert.ok(rejected.observedActionSourceProof?.hookInstalledAtMs);
    assert.equal(rejected.observedActionSourceProof?.actionDocumentStable, true);
    assert.equal(rejected.refusalRegistration.witnesses[0]?.witnessType, "tcf_user_action_complete");
    assert.equal(rejected.network.postRefusalNonEssentialRequests.length, 0);
    assert.equal(rejected.storage.writesAfterRefusal.some((write) => write.nonEssential), false);
    assert.equal(rejected.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(rejected.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (rejected.refusalRegistration.refusalRegisteredAtMs ?? 0)
    ), true);
  });
});

test("testar2 retains unconfirmed Accept facts separately from confirmed Reject activity", async () => {
  await withCanaryServer(async (origin) => {
    const url = `${origin}/testar2.html`;
    const accepted = await observeAccept(url, "testar2-accept");
    const rejected = await observeReject(url, "testar2-reject");

    assert.equal(accepted.acceptanceRegistration.status, "unconfirmed");
    assert.equal(accepted.observedActionSourceProof, undefined);
    assert.deepEqual(accepted.acceptanceRegistration.witnesses, []);
    assert.equal(accepted.acceptanceRegistration.acceptanceRegisteredAtMs, undefined);
    assert.equal(accepted.afterActionCapture?.activationStatus, "completed");
    assert.equal(accepted.afterActionCapture?.stopReason, "window_elapsed");
    assert.equal(accepted.afterActionCapture?.storageSnapshotRetained, true);
    assert.deepEqual(accepted.storage.writesAfterAccept, []);
    assert.deepEqual(accepted.network.postAcceptNonEssentialRequests, []);
    assert.equal(accepted.observations.some((row) =>
      row.observationType === "acceptance_signal_contradicts_action"
    ), false);
    assert.equal(rejected.refusalRegistration.status, "confirmed");
    assert.equal(accepted.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(rejected.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(accepted.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (accepted.afterActionCapture?.actionDispatchedAtMs ?? 0)
    ), true);
    assert.equal(rejected.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (rejected.refusalRegistration.refusalRegisteredAtMs ?? 0)
    ), true);

    const acceptStorage = accepted.storage.postAction.find((write) =>
      write.name === "_ga" && write.nonEssential
    );
    const rejectStorage = rejected.storage.writesAfterRefusal.find((write) =>
      write.name === "_ga" && write.nonEssential
    );
    const acceptAdvertisingStorage = accepted.storage.postAction.find((write) =>
      write.name === "_gid" && write.nonEssential
    );
    const rejectAdvertisingStorage = rejected.storage.writesAfterRefusal.find((write) =>
      write.name === "_gid" && write.nonEssential
    );
    assert.ok(acceptStorage?.identityHash);
    assert.ok(rejectStorage?.storageIdentityHash);
    assert.equal(acceptStorage.identityHash, rejectStorage.storageIdentityHash);
    assert.ok(acceptAdvertisingStorage?.identityHash);
    assert.ok(rejectAdvertisingStorage?.storageIdentityHash);
    assert.equal(
      acceptAdvertisingStorage.identityHash,
      rejectAdvertisingStorage.storageIdentityHash,
    );
    assert.equal(accepted.network.requests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net" &&
      accepted.afterActionCapture?.requestIds.includes(request.requestId)
    ), true);
    assert.equal(accepted.afterActionCapture?.storageWrites.some((write) => write.name === "_ga" && write.nonEssential), true);
    assert.equal(accepted.afterActionCapture?.storageWrites.some((write) => write.name === "_gid" && write.nonEssential), true);
    assert.equal(rejected.network.postRefusalNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);

    const acceptProjection = projectPostAcceptEvidenceForReport({
      packet: accepted,
      packetSha256: createHash("sha256").update(JSON.stringify(accepted)).digest("hex"),
    });
    assert.equal(acceptProjection.execution?.status, "succeeded");
    assert.equal(acceptProjection.execution?.consentConfirmed, false);
    assert.equal(acceptProjection.productionProjectable, false);
    assert.equal(acceptProjection.contradictionObserved, false);
    assert.deepEqual(acceptProjection.postAcceptActivity, []);
    assert.equal(acceptProjection.afterActionRequests?.some(row => row.hostname === "googleads.g.doubleclick.net"), true);
    const acceptProjectedStorage = acceptProjection.afterActionStorage?.find(row => row.name === "_ga");
    const rejectProjectedStorage = projectPostRefusalEvidenceForReport({ packet: rejected })
      .postRefusalActivity.find((row) => row.activityType === "storage_write");
    assert.equal(
      acceptProjectedStorage?.identityHash,
      rejectProjectedStorage?.storageIdentityHash,
    );
  });
});

test("legacy inconsistent Accept receipt does not establish a grant or contradiction", async () => {
  await withCanaryServer(async (origin) => {
    const accepted = await observeAccept(`${origin}/post-accept/accept-inconsistent.html`, "legacy-inconsistent");
    assert.equal(accepted.acceptanceRegistration.status, "unconfirmed");
    assert.deepEqual(accepted.acceptanceRegistration.witnesses, []);
    assert.equal(accepted.afterActionCapture?.activationStatus, "completed");
    assert.equal(accepted.afterActionCapture?.stopReason, "window_elapsed");
    assert.deepEqual(accepted.network.postAcceptNonEssentialRequests, []);
    const projection = projectPostAcceptEvidenceForReport({ packet: accepted });
    assert.equal(projection.productionProjectable, false);
    assert.equal(projection.contradictionObserved, false);
    assert.deepEqual(projection.postAcceptActivity, []);
  });
});

test("quoted privacy opt-out never authorizes a canonical Reject click", async () => {
  await withCanaryServer(async (origin) => {
    const recipes = buildCanonicalPostRefusalActionRecipes();
    const packet = await runPostRefusalObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 100,
      observationWindowMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      recipe: rejectRecipe,
      recipeCandidates: recipes,
      recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
      allowCanonicalRejectDiscovery: true,
      scanId: "privacy-only-no-reject",
      url: `${origin}/privacy-only.html`,
    });
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.equal(packet.afterActionCapture, undefined);
    assert.equal(packet.productionProjectable, false);
  });
});

test("launch sample confirms both choices and retains post-refusal activity", async () => {
  await withCanaryServer(async (origin) => {
    const url = `${origin}/sample_09_03_26_01.html`;
    const accepted = await observeAccept(url, "launch-sample-accept");
    const rejected = await observeReject(url, "launch-sample-reject");

    assert.equal(accepted.acceptanceRegistration.status, "confirmed");
    assert.equal(rejected.refusalRegistration.status, "confirmed");
    assert.equal(accepted.observations.some((row) =>
      row.observationType === "acceptance_signal_contradicts_action"
    ), false);
    assert.equal(accepted.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(rejected.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(accepted.network.postAcceptNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);
    assert.equal(rejected.network.postRefusalNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);
    assert.equal(rejected.storage.writesAfterRefusal.some((write) =>
      write.name === "_ga" && write.nonEssential
    ), true);
  });
});

test("testar canaries expose working first-layer Accept, Reject, and Options controls", async () => {
  await withCanaryServer(async (origin) => {
    const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    const context = await browser.newContext(chromiumContextOptions());
    const page = await context.newPage();
    await page.route("https://www.google-analytics.com/**", (route) =>
      route.fulfill({ status: 204, body: "" })
    );

    try {
      for (const pathname of ["testar1.html", "testar2.html", "sample_09_03_26_01.html"]) {
        await page.goto(`${origin}/${pathname}`);
        await assert.doesNotReject(page.getByRole("button", { name: "Accept all", exact: true }).waitFor());
        await assert.doesNotReject(page.getByRole("button", { name: "Reject all", exact: true }).waitFor());
        await page.getByRole("button", { name: "Manage options", exact: true }).click();
        await assert.doesNotReject(page.getByRole("heading", { name: "Cookie options", exact: true }).waitFor());
        assert.match(await page.getByRole("status").innerText(), /opened without recording a consent choice/i);
        assert.equal((await context.cookies()).some((cookie) => cookie.name === "OptanonConsent"), false);
        await page.getByRole("button", { name: "Close options", exact: true }).click();
        assert.equal(await page.getByRole("heading", { name: "Cookie options", exact: true }).isVisible(), false);
      }
    } finally {
      await context.close();
      await browser.close();
    }
  });
});

test("testar canaries document distinct production highlighting boundaries", async () => {
  const divergent = await readFile(
    new URL("../../../infra/aws/ergoveritas-canary/testar1.html", import.meta.url),
    "utf8",
  );
  const contradictory = await readFile(
    new URL("../../../infra/aws/ergoveritas-canary/testar2.html", import.meta.url),
    "utf8",
  );

  assert.match(divergent, /data-accept-path-scenario="affirmative-consent-dependent-activation"/);
  assert.match(divergent, /pre-consent-leakage-with-effective-choice-enforcement/);
  assert.match(divergent, /later clean Reject does not cure earlier pre-consent activity/i);
  assert.match(divergent, /_gid/);
  assert.match(contradictory, /data-accept-path-scenario="unconfirmed-accept-with-denied-state"/);
  assert.match(contradictory, /data-certscore-canary="post-action-unconfirmed-accept"/);
  assert.match(contradictory, /data-expected-acceptance-registration="unconfirmed"/);
  assert.match(contradictory, /data-expected-acceptance-contradiction="false"/);
  assert.match(contradictory, /balanced-looking-controls-with-ineffective-rejection/);
  assert.match(contradictory, /must test behavior and retained consent state/i);
  assert.match(contradictory, /same exact <code>_ga<\/code> and <code>_gid<\/code> identities/i);
  assert.doesNotMatch(`${divergent}\n${contradictory}`, /score-neutral|scoring effect/i);
});

async function observeAccept(url: string, scanId: string, options: { requireFullConfiguredWindow?: boolean; observationWindowMs?: number; resultBudgetMs?: number } = {}) {
  return runPostAcceptObserver({
    actionSearchTimeoutMs: 800,
    confirmationTimeoutMs: 600,
    interactionAuthorization: {
      authorizationId: "loopback_local_lab",
      kind: "loopback",
    },
    observationWindowMs: 350,
    ...options,
    productionProjectable: true,
    recipe: acceptRecipe,
    scanId,
    url,
  });
}

async function observeReject(url: string, scanId: string) {
  return runPostRefusalObserver({
    actionSearchTimeoutMs: 800,
    confirmationTimeoutMs: 600,
    fulfillThirdPartyRequestsLocally: true,
    interactionAuthorization: {
      authorizationId: "loopback_local_lab",
      kind: "loopback",
    },
    observationWindowMs: 350,
    productionProjectable: true,
    recipe: rejectRecipe,
    scanId,
    url,
  });
}

async function withCanaryServer(run: (origin: string) => Promise<void>) {
  const pages = new Map<string, string>();
  pages.set("/full-window-accept.html", `<!doctype html><html><body>
    <div id="onetrust-banner-sdk"><button id="onetrust-accept-btn-handler">Accept all</button>
    <button id="onetrust-reject-all-handler">Reject all</button></div>
    <script>
      let granted = false;
      window.__tcfapi = function(command, version, callback) {
        if (command === 'getTCData') callback({cmpId: 28, cmpVersion: 1, gdprApplies: true,
          tcfPolicyVersion: 2, cmpStatus: 'loaded', eventStatus: granted ? 'useractioncomplete' : 'tcloaded',
          purpose: {consents: {1: granted, 2: granted, 3: granted, 4: granted, 7: granted, 9: granted, 10: granted}},
          tcString: granted ? 'OWNED_GRANTED' : 'OWNED_DENIED'}, true);
      };
      document.getElementById('onetrust-accept-btn-handler').onclick = function() {
        granted = true;
        document.cookie = 'OptanonConsent=groups=C0001:1,C0002:1,C0003:1,C0004:1; Path=/; SameSite=Lax';
        document.getElementById('onetrust-banner-sdk').remove();
        setTimeout(function() { document.cookie = '_ga=owned-early; Path=/; SameSite=Lax'; }, 50);
        setTimeout(function() { document.cookie = '_gid=owned-late; Path=/; SameSite=Lax'; }, 800);
      };
    </script></body></html>`);

  pages.set("/privacy-only.html", `<!doctype html><section id="truste-consent-track" role="dialog" aria-label="Cookie choices">
    <p>We use cookies and similar technologies. Choose your preferences.</p>
    <button id="truste-show-consent">&quot;Do Not Sell My Personal Information&quot;</button></section>`);
  for (const name of ["testar1.html", "testar2.html", "sample_09_03_26_01.html", "post-accept/accept-inconsistent.html", "post-accept/post-accept-runtime.js"]) {
    const source = await readFile(
      new URL(`../../../infra/aws/ergoveritas-canary/${name}`, import.meta.url),
      "utf8",
    );
    // The production canaries correctly use Secure cookies. The loopback-only
    // test transport removes that attribute without changing page behavior.
    pages.set(`/${name}`, source.replaceAll("; Secure", ""));
  }
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://fixture.local").pathname;
    const page = pages.get(pathname);
    if (!page) {
      response.writeHead(204).end();
      return;
    }
    response.setHeader("content-type", pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
    response.end(page);
  });
  const origin = await listen(server);
  try {
    await run(origin);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Canary fixture server did not bind.");
  return `http://127.0.0.1:${address.port}`;
}


test("artifact-only full-window opt-in preserves positive evidence and finishes the same configured Accept window", async () => {
  await withCanaryServer(async origin => {
    const url = `${origin}/full-window-accept.html`;
    const options = { observationWindowMs: 1500, resultBudgetMs: 30000 };
    const ordinary = await observeAccept(url, "full-window-default", options);
    const complete = await observeAccept(url, "full-window-opt-in", { ...options, requireFullConfiguredWindow: true });
    assert.equal(ordinary.acceptanceRegistration.status, "confirmed");
    assert.equal(complete.acceptanceRegistration.status, "confirmed");
    assert.equal(ordinary.timing.observationExitReason, "non_essential_storage_write_observed");
    assert.equal(ordinary.observedActionSourceProof?.configuredWindowCompleted, false);
    assert.equal(complete.timing.observationExitReason, "window_elapsed");
    assert.equal(complete.observedActionSourceProof?.configuredWindowCompleted, true);
    assert.equal(complete.observedActionSourceProof?.semanticDecisionConfirmed, true);
    assert.equal(ordinary.observationWindowMs, complete.observationWindowMs);
    assert.ok(ordinary.storage.writesAfterAccept.some(write => write.name === "_ga" && write.nonEssential));
    assert.ok(complete.storage.writesAfterAccept.some(write => write.name === "_ga" && write.nonEssential));
    assert.ok(complete.storage.writesAfterAccept.some(write => write.name === "_gid" && write.nonEssential));
    const proof = complete.observedActionSourceProof!;
    assert.ok(proof.windowEndedAtMs - proof.windowStartedAtMs >= complete.observationWindowMs);
    assert.ok(ordinary.timing.observationMs < ordinary.observationWindowMs);
  });
});
