import assert from "node:assert/strict";
import test from "node:test";
import {
  runPostRefusalObserver,
  type PostRefusalActionRecipe,
} from "./post-refusal-observer.js";
import { buildPostRefusalCmpActionRecipe } from "./post-refusal-cmp-recipes.js";
import {
  startStaticFixtureServer,
  type StaticFixturePage,
} from "./test-fixtures/static-server.js";

const recipe: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "certscore-local-fixture-direct-reject-v1",
  cmpId: "certscore_local_fixture",
  controlSelector: '[data-certscore-consent-action="reject"]',
  bannerSelector: "#certscore-fixture-consent-banner",
  confirmation: {
    kind: "local_storage_equals",
    key: "certscore_fixture_consent",
    expectedValue: "rejected",
  },
};

test("reject honored confirms registration without post-refusal activity", async () => {
  await withFixture("post-refusal-reject-honored", async (url) => {
    const packet = await observe(url);

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.network.postRefusalNonEssentialRequests.length, 0);
    assert.equal(packet.storage.writesAfterRefusal.filter((write) => write.nonEssential).length, 0);
    assert.equal(packet.storage.nonEssentialItemsPersistingAfterRefusal.length, 0);
    assert.equal(packet.observations.length, 0);
  });
});

test("reject ignored retains post-refusal request, write, and persistence evidence", async () => {
  await withFixture("post-refusal-reject-ignored", async (url) => {
    const packet = await observe(url);

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.network.postRefusalNonEssentialRequests.some((request) =>
      request.hostname === "www.google-analytics.com" &&
      request.vendor === "Google"
    ), true);
    assert.equal(packet.storage.writesAfterRefusal.some((write) =>
      write.name === "_gid" && write.nonEssential
    ), true);
    assert.equal(packet.storage.nonEssentialItemsPersistingAfterRefusal.some((item) => item.name === "_ga"), true);
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "post_refusal_non_essential_activity"
    ), true);
    assert.notEqual(packet.timing.observationExitReason, "window_elapsed");
    assert.equal(packet.timing.observationMs < packet.observationWindowMs, true);
  });
});

test("missing deterministic reject control stays neutral", async () => {
  await withFixture("post-refusal-reject-missing", async (url) => {
    const packet = await observe(url);

    assert.equal(packet.resolver.found, false);
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("banner removal alone does not confirm refusal registration", async () => {
  await withFixture("post-refusal-reject-unconfirmed", async (url) => {
    const packet = await observe(url, { confirmationTimeoutMs: 100 });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
    assert.deepEqual(packet.network.postRefusalNonEssentialRequests, []);
  });
});

test("request already in flight at refusal registration is not post-refusal activity", async () => {
  await withFixture("post-refusal-reject-inflight", async (url) => {
    const packet = await observe(url);
    const inFlight = packet.network.requests.find((request) =>
      request.sanitizedUrl.endsWith("/post-refusal/inflight.gif")
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(inFlight?.inFlightAtRefusalRegistration, true);
    assert.equal(packet.network.postRefusalNonEssentialRequests.some((request) =>
      request.requestId === inFlight?.requestId
    ), false);
  });
});

test("TCF refusal confirms user-action-complete with all configured purposes denied", async () => {
  await withFixture("post-refusal-onetrust-tcf-honored", async (url) => {
    const packet = await observe(url, {
      recipe: cmpRecipe("OneTrust", { kind: "tcf_purposes_denied" }, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.resolver.method, "tcf_api_cmp_registry_recipe");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "tcf_user_action_complete"
    ), true);
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "refusal_signal_contradicts_action"
    ), false);
  });
});

test("confirmed rejection records a contradictory post-refusal TCF purpose grant", async () => {
  await withFixture("post-refusal-onetrust-tcf-contradiction", async (url) => {
    const packet = await observe(url, {
      recipe: cmpRecipe("OneTrust", recipe.confirmation, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.observationExitReason, "refusal_signal_contradiction_observed");
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "refusal_signal_contradicts_action"
    ), true);
  });
});

test("named CMP recipes resolve fast and delayed deterministic controls", async () => {
  await withFixture("post-refusal-cookiebot-fast", async (cookiebotUrl) => {
    const packet = await observe(cookiebotUrl, {
      recipe: cmpRecipe("Cookiebot", recipe.confirmation, "#CybotCookiebotDialog"),
    });
    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "Cookiebot");
  });
  await withFixture("post-refusal-usercentrics-delayed", async (usercentricsUrl) => {
    const packet = await observe(usercentricsUrl, {
      actionSearchTimeoutMs: 1_500,
      recipe: cmpRecipe("Usercentrics", recipe.confirmation, "#usercentrics-root"),
    });
    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "Usercentrics");
    assert.equal(packet.timing.resolverMs >= 1_000, true);
  });
});

test("cooperative cancellation before dispatch records an aborted neutral branch", async () => {
  await withFixture("post-refusal-reject-honored", async (url) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("consent_proof_reported_no_reject")), 20);
    const packet = await observe(url, {
      dispatchDelayMs: 200,
      signal: controller.signal,
    });

    assert.equal(packet.refusalRegistration.status, "aborted");
    assert.equal(packet.cancellation.outcome, "aborted_before_action");
    assert.deepEqual(packet.observations, []);
  });
});

test("observer rejects targets outside the explicit interaction authorization", async () => {
  await assert.rejects(
    runPostRefusalObserver({
      scanId: "scan-public-blocked",
      url: "https://example.com/",
      recipe,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
    }),
    /authorization failed closed/i,
  );
});

async function observe(
  url: string,
  overrides: Partial<Parameters<typeof runPostRefusalObserver>[0]> = {},
) {
  return runPostRefusalObserver({
    scanId: `scan-${Date.now()}`,
    url,
    recipe,
    interactionAuthorization: {
      authorizationId: "loopback_local_lab",
      kind: "loopback",
    },
    fulfillThirdPartyRequestsLocally: true,
    observationWindowMs: 180,
    confirmationTimeoutMs: 250,
    ...overrides,
  });
}

async function withFixture(
  fixture: StaticFixturePage,
  run: (url: string) => Promise<void>,
) {
  const server = await startStaticFixtureServer();
  try {
    await run(server.urlFor(fixture));
  } finally {
    await server.close();
  }
}

function cmpRecipe(
  cmpCanonicalName: string,
  confirmation: PostRefusalActionRecipe["confirmation"],
  bannerSelector: string,
): PostRefusalActionRecipe {
  const cmpRecipe = buildPostRefusalCmpActionRecipe({
    cmpCanonicalName,
    confirmation,
    bannerSelector,
  });
  assert.ok(cmpRecipe);
  return cmpRecipe;
}
