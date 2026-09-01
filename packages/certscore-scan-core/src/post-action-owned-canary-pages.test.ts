import assert from "node:assert/strict";
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
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
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

test("testar2 confirms the Accept contradiction and gives both choices one exact storage identity", async () => {
  await withCanaryServer(async (origin) => {
    const url = `${origin}/testar2.html`;
    const accepted = await observeAccept(url, "testar2-accept");
    const rejected = await observeReject(url, "testar2-reject");

    assert.equal(accepted.acceptanceRegistration.status, "confirmed");
    assert.equal(accepted.acceptanceRegistration.witnesses[0]?.witnessType, "cmp_cookie_state");
    assert.equal(accepted.observations.some((row) =>
      row.observationType === "acceptance_signal_contradicts_action"
    ), true);
    assert.equal(rejected.refusalRegistration.status, "confirmed");
    assert.equal(accepted.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(rejected.storage.preAction.some((item) => item.name === "_ga"), true);
    assert.equal(accepted.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (accepted.acceptanceRegistration.acceptanceRegisteredAtMs ?? 0)
    ), true);
    assert.equal(rejected.network.requests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.startedAtMs < (rejected.refusalRegistration.refusalRegisteredAtMs ?? 0)
    ), true);

    const acceptStorage = accepted.storage.writesAfterAccept.find((write) =>
      write.name === "_ga" && write.nonEssential
    );
    const rejectStorage = rejected.storage.writesAfterRefusal.find((write) =>
      write.name === "_ga" && write.nonEssential
    );
    const acceptAdvertisingStorage = accepted.storage.writesAfterAccept.find((write) =>
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
    assert.equal(accepted.network.postAcceptNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);
    assert.equal(rejected.network.postRefusalNonEssentialRequests.some((request) =>
      request.hostname === "googleads.g.doubleclick.net"
    ), true);

    const acceptProjectedStorage = projectPostAcceptEvidenceForReport({ packet: accepted })
      .postAcceptActivity.find((row) => row.activityType === "storage_write");
    const rejectProjectedStorage = projectPostRefusalEvidenceForReport({ packet: rejected })
      .postRefusalActivity.find((row) => row.activityType === "storage_write");
    assert.equal(
      acceptProjectedStorage?.storageIdentityHash,
      rejectProjectedStorage?.storageIdentityHash,
    );
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
      for (const pathname of ["testar1.html", "testar2.html"]) {
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
  assert.match(contradictory, /data-accept-path-scenario="contradictory-receipt-and-indistinguishable-outcomes"/);
  assert.match(contradictory, /balanced-looking-controls-with-ineffective-rejection/);
  assert.match(contradictory, /must test behavior and retained consent state/i);
  assert.match(contradictory, /same exact <code>_ga<\/code> and <code>_gid<\/code> identities/i);
  assert.doesNotMatch(`${divergent}\n${contradictory}`, /score-neutral|scoring effect/i);
});

async function observeAccept(url: string, scanId: string) {
  return runPostAcceptObserver({
    actionSearchTimeoutMs: 800,
    confirmationTimeoutMs: 600,
    interactionAuthorization: {
      authorizationId: "loopback_local_lab",
      kind: "loopback",
    },
    observationWindowMs: 350,
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
  for (const name of ["testar1.html", "testar2.html"]) {
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
    response.setHeader("content-type", "text/html; charset=utf-8");
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
