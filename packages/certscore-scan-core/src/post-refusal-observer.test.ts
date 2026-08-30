import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  decodeTcfV2PurposeConsents,
  classifyNavigationFailure,
  inspectRecoverableCommittedDocument,
  persistedNonEssentialStorage,
  POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS,
  postRefusalStorageIdentityHash,
  responseCookieNamesFromHeaders,
  runPostRefusalObserver,
  selectExactResponseCookieWriteAnchor,
  type PostRefusalActionRecipe,
} from "./post-refusal-observer.js";
import {
  buildCanonicalPostRefusalActionRecipes,
  buildPostRefusalCmpActionRecipe,
  CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
} from "./post-refusal-cmp-recipes.js";
import { postRefusalLabRecipe } from "./post-refusal-lab-cases.js";
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
    assert.ok(packet.storage.preActionCapturedAtMs !== undefined);
    assert.ok(packet.refusalRegistration.actionDispatchedAtMs !== undefined);
    assert.ok(
      packet.refusalRegistration.actionDispatchedAtMs - packet.storage.preActionCapturedAtMs <=
        POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS,
    );
  });
});

test("does not click a deterministic Reject control before its document handler is ready", async () => {
  await withFixture("post-refusal-reject-handler-after-dom-ready", async (url) => {
    const packet = await observe(url, { actionSearchTimeoutMs: 1_000 });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics.click.outcome, "completed");
  });
});

test("confirms the canonical OpenAI refusal cookie bundle only after a fresh Reject action", async () => {
  const openAiRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OpenAI first-party consent controls"
  );
  assert.ok(openAiRecipe);
  await withFixture("post-refusal-openai-cookie-confirmed", async (url) => {
    const packet = await observe(url, { recipe: openAiRecipe });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(
      packet.refusalRegistration.witnesses.some((witness) =>
        witness.witnessType === "cmp_cookie_state" && witness.corroboratingOnly === false
      ),
      true,
    );
  });
});

test("does not confirm an unchanged pre-existing OpenAI refusal cookie bundle", async () => {
  const openAiRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OpenAI first-party consent controls"
  );
  assert.ok(openAiRecipe);
  await withFixture("post-refusal-openai-cookie-stale", async (url) => {
    const packet = await observe(url, { recipe: openAiRecipe });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.refusalRegistration.witnesses, []);
  });
});

test("does not confirm a partial OpenAI refusal cookie bundle", async () => {
  const openAiRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OpenAI first-party consent controls"
  );
  assert.ok(openAiRecipe);
  await withFixture("post-refusal-openai-cookie-partial", async (url) => {
    const packet = await observe(url, { recipe: openAiRecipe });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.refusalRegistration.witnesses, []);
  });
});

test("re-resolves a rerendered OpenAI Reject control through canonical geometry", async () => {
  const recipeCandidates = buildCanonicalPostRefusalActionRecipes();
  await withFixture("post-refusal-openai-rerendered-control", async (url) => {
    const packet = await observe(url, {
      actionSearchTimeoutMs: 1_000,
      allowCanonicalRejectDiscovery: true,
      recipe: recipeCandidates[0],
      recipeCandidates,
      recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
    });

    assert.equal(packet.resolver.found, true);
    assert.match(packet.resolver.recipeId ?? "", /^canonical-control:reject:v2:/);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
  });
});

test("retained packets redact target query values and bind the exact target by hash", async () => {
  await withFixture("post-refusal-reject-honored", async (url) => {
    const exactTargetUrl = `${url}?session_token=sensitive-value#fragment`;
    const packet = await observe(exactTargetUrl);
    const expectedRetainedUrl = new URL(exactTargetUrl);
    expectedRetainedUrl.search = "";
    expectedRetainedUrl.hash = "";
    const expectedHashedUrl = new URL(exactTargetUrl);
    expectedHashedUrl.hash = "";

    assert.equal(packet.targetUrl, expectedRetainedUrl.toString());
    assert.equal(packet.normalizedUrl, expectedRetainedUrl.toString());
    assert.equal(packet.targetUrl.includes("sensitive-value"), false);
    assert.equal(
      packet.exactTargetSha256,
      createHash("sha256").update(expectedHashedUrl.toString()).digest("hex"),
    );
  });
});

test("the exact CertScore owned canary recipe confirms its semantic denial state", async () => {
  await withFixture("post-refusal-certscore-owned-analytics", async (url) => {
    const packet = await observe(url, {
      recipe: postRefusalLabRecipe("certscoreOwnedAnalytics"),
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "certscore_owned_analytics_consent");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.deepEqual(packet.observations, []);
  });
});

test("canonical control discovery uniquely resolves Reject among controls sharing generic button classes", async () => {
  await withFixture("post-refusal-certscore-owned-analytics", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 1_000,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.method, "canonical_consent_control_registry_recipe");
    assert.match(packet.resolver.recipeId, /^canonical-control:reject:v2:/);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "canonical_refusal_state" &&
      witness.corroboratingOnly === false
    ), true);
  });
});

test("geometry-resolved OneTrust controls inherit canonical semantic confirmation", async () => {
  const registeredOneTrustRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OneTrust"
  );
  assert.ok(registeredOneTrustRecipe);
  await withFixture("post-refusal-onetrust-cookie-confirmed", async (url) => {
    const packet = await observe(url, {
      actionSearchTimeoutMs: 1_000,
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...registeredOneTrustRecipe,
        controlSelector: "#registered-selector-intentionally-absent",
        recipeId: "canonical-cmp:OneTrust:reject:geometry-confirmation-fixture",
      },
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "OneTrust");
    assert.equal(packet.resolver.method, "tcf_api_cmp_registry_recipe");
    assert.match(packet.resolver.recipeId, /^canonical-control:reject:v2:/);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" && witness.key === "OptanonConsent"
    ), true);
  });
});

test("canonical control discovery does not click generic page choices without consent context", async () => {
  await withFixture("generic-bare-choice-controls", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 700,
    });

    assert.equal(packet.resolver.found, false);
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
  });
});

test("canonical control discovery confirms the completed Reject action from its direct first-layer UI transition", async () => {
  await withFixture("post-refusal-reject-unconfirmed", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 1_000,
      confirmationTimeoutMs: 100,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "canonical_refusal_state" &&
      witness.expectedState === "canonical_first_layer_reject_control_and_consent_surface_hidden_after_completed_action"
    ), true);
  });
});

test("canonical control discovery confirms an exact Reject action when the consent surface becomes an acknowledgement", async () => {
  await withFixture("post-refusal-reject-acknowledgement-transition", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 1_000,
      confirmationTimeoutMs: 100,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "canonical_refusal_state" &&
      witness.expectedState === "canonical_first_layer_reject_control_hidden_and_consent_surface_replaced_after_completed_action"
    ), true);
  });
});

test("canonical control discovery collapses a nested label into its unique interactive Reject ancestor", async () => {
  await withFixture("post-refusal-reject-nested-label", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 1_000,
    });

    assert.equal(packet.resolver.found, true);
    assert.match(packet.resolver.recipeId, /^canonical-control:reject:v2:/);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.interactionDiagnostics.click.outcome, "completed");
  });
});

test("canonical control discovery resolves and clicks one exact Reject control inside a child CMP frame", async () => {
  await withFixture("consent-iframe-reject", async (url) => {
    const packet = await observe(url, {
      allowCanonicalRejectDiscovery: true,
      recipe: {
        ...recipe,
        recipeId: "missing-registered-recipe",
        controlSelector: "#registered-reject-not-present",
      },
      actionSearchTimeoutMs: 1_000,
    });

    assert.equal(packet.resolver.found, true);
    assert.match(packet.resolver.recipeId, /^canonical-control:reject:v2:/);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics.click.outcome, "completed");
  });
});

test("the settle window remains bounded when page-context polling is blocked by a long task", async () => {
  await withFixture("post-refusal-reject-observation-long-task", async (url) => {
    const packet = await observe(url, { observationWindowMs: 150 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.observationExitReason, "window_elapsed");
    assert.ok(packet.timing.observationMs >= 140);
    assert.ok(packet.timing.observationMs < 350);
  });
});

test("snapshot cookie deltas require an exact retained Set-Cookie name before receiving a write timestamp", () => {
  const baseRequest = {
    requestId: "request-1",
    sanitizedUrl: "https://example.test/pixel",
    hostname: "example.test",
    resourceType: "image",
    startedAtMs: 120,
    completedAtMs: 140,
    inFlightAtRefusalRegistration: false,
    msOffsetFromRefusal: 20,
    nonEssential: false,
  };

  assert.equal(selectExactResponseCookieWriteAnchor({
    cookieHostname: "example.test",
    cookieName: "s_vi",
    requests: [{ ...baseRequest, responseCookieNamesSet: ["unrelated_cookie"] }],
  }), undefined);
  assert.equal(selectExactResponseCookieWriteAnchor({
    cookieHostname: "example.test",
    cookieName: "s_vi",
    requests: [{ ...baseRequest, responseCookieNamesSet: ["s_vi"] }],
  })?.completedAtMs, 140);
  assert.deepEqual(responseCookieNamesFromHeaders([
    { name: "set-cookie", value: "s_vi=value; Path=/; HttpOnly" },
    { name: "Set-Cookie", value: "other=value; Path=/" },
    { name: "content-type", value: "text/plain" },
  ]), ["s_vi", "other"]);
});

test("persistence requires an unchanged value and exact cookie path identity", () => {
  const rootIdentityHash = postRefusalStorageIdentityHash({
    storageType: "cookie",
    name: "_ga",
    hostname: "example.test",
    cookiePath: "/",
  });
  const accountIdentityHash = postRefusalStorageIdentityHash({
    storageType: "cookie",
    name: "_ga",
    hostname: "example.test",
    cookiePath: "/account",
  });
  const before = [{
    storageType: "cookie" as const,
    name: "_ga",
    hostname: "example.test",
    identityBasis: "cookie_name_domain_path_partition" as const,
    identityHash: rootIdentityHash,
    valueHash: "a".repeat(64),
    vendor: "Google",
    purpose: "analytics" as const,
    nonEssential: true,
  }];

  assert.equal(rootIdentityHash === accountIdentityHash, false);
  assert.equal(persistedNonEssentialStorage(before, [{
    ...before[0],
    valueHash: "b".repeat(64),
  }]).length, 0);
  assert.equal(persistedNonEssentialStorage(before, [{
    ...before[0],
    identityHash: accountIdentityHash,
  }]).length, 0);
  assert.deepEqual(persistedNonEssentialStorage(before, [{ ...before[0] }]), before);
});

test("web-storage identity is exact-origin scoped", () => {
  assert.notEqual(
    postRefusalStorageIdentityHash({
      storageType: "local_storage",
      name: "analytics_id",
      origin: "https://example.test",
    }),
    postRefusalStorageIdentityHash({
      storageType: "local_storage",
      name: "analytics_id",
      origin: "https://sub.example.test",
    }),
  );
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
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "pre_consent_storage_not_cleared"
    ), false);
    assert.equal(packet.limitations.includes("persistence_observation_not_settled_due_to_early_exit"), true);
    assert.notEqual(packet.timing.observationExitReason, "window_elapsed");
    assert.equal(packet.timing.observationMs < packet.observationWindowMs, true);
  });
});

test("canonical Bing UET cookie and local-storage writes remain non-essential after refusal", async () => {
  await withFixture("post-refusal-reject-bing-uet-write", async (url) => {
    const packet = await observe(url);
    const uetWrites = packet.storage.writesAfterRefusal.filter((write) =>
      write.name === "_uetsid" || write.name === "_uetvid"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(uetWrites.length, 2);
    assert.ok(uetWrites.every((write) =>
      write.vendor === "Microsoft" &&
      write.purpose === "advertising" &&
      write.nonEssential
    ));
    assert.equal(packet.observations.filter((observation) =>
      observation.observationType === "post_refusal_non_essential_activity" &&
      (observation.storageName === "_uetsid" || observation.storageName === "_uetvid")
    ).length, 2);
  });
});

test("Adobe consent propagation after refusal does not become advertising activity", async () => {
  await withFixture("post-refusal-reject-adobe-consent-propagation", async (url) => {
    const packet = await observe(url, { observationWindowMs: 120 });
    const consentRequest = packet.network.requests.find((request) =>
      request.sanitizedUrl.includes("/ee/v1/privacy/set-consent")
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(consentRequest?.vendor, "Adobe");
    assert.equal(consentRequest?.purpose, "consent_management");
    assert.equal(consentRequest?.nonEssential, false);
    assert.equal(packet.network.postRefusalNonEssentialRequests.some((request) =>
      request.requestId === consentRequest?.requestId
    ), false);
    assert.deepEqual(packet.observations, []);
  });
});

test("lowercase site-local fs state does not become FullStory persistence", async () => {
  await withFixture("post-refusal-reject-lowercase-fs-site-state", async (url) => {
    const packet = await observe(url, { observationWindowMs: 120 });
    const siteState = packet.storage.postAction.find((item) =>
      item.name === "fs_closing_native_notifications_toast_session_count"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(siteState?.vendor, undefined);
    assert.equal(siteState?.nonEssential, false);
    assert.equal(packet.storage.nonEssentialItemsPersistingAfterRefusal.some((item) =>
      item.name === siteState?.name
    ), false);
    assert.deepEqual(packet.observations, []);
  });
});

test("pre-consent non-essential storage is promoted only after the full settle window", async () => {
  await withFixture("post-refusal-reject-persistence-only", async (url) => {
    const packet = await observe(url, { observationWindowMs: 120 });
    const persisted = packet.storage.nonEssentialItemsPersistingAfterRefusal.find((item) =>
      item.name === "_ga"
    );
    const observation = packet.observations.find((candidate) =>
      candidate.observationType === "pre_consent_storage_not_cleared" &&
      candidate.storageName === "_ga"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.observationExitReason, "window_elapsed");
    assert.equal(persisted?.identityBasis, "cookie_name_domain_path_partition");
    assert.match(persisted?.identityHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(observation?.storageIdentityHash, persisted?.identityHash);
    assert.equal(observation?.storageValueHash, persisted?.valueHash);
  });
});

test("a non-essential write during the action transaction is not counted after refusal", async () => {
  await withFixture("post-refusal-reject-action-phase-nonessential", async (url) => {
    const packet = await observe(url, { observationWindowMs: 120 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.observationExitReason, "window_elapsed");
    assert.equal(packet.storage.writesAfterRefusal.some((write) =>
      write.name === "mp_action_phase_mixpanel"
    ), false);
    assert.equal(packet.observations.some((observation) =>
      observation.storageName === "mp_action_phase_mixpanel"
    ), false);
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

test("a deterministic control click failure returns a neutral unconfirmed packet", async () => {
  await withFixture("post-refusal-reject-click-fails", async (url) => {
    const packet = await observe(url, { confirmationTimeoutMs: 100 });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.equal(packet.refusalRegistration.reason, "deterministic_reject_control_click_failed");
    assert.equal(packet.refusalRegistration.actionDispatchedAtMs, undefined);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "failed_before_dispatch");
    assert.equal(packet.interactionDiagnostics?.click.confirmationCheckedAfterError, false);
    assert.equal(packet.interactionDiagnostics?.click.actionability?.controlVisible, true);
    assert.equal(packet.interactionDiagnostics?.click.actionability?.controlEnabled, true);
    assert.equal(
      packet.interactionDiagnostics?.click.actionability?.centerHitTargetRelation,
      "other_element",
    );
    assert.deepEqual(packet.observations, []);
  });
});

test("a pre-dispatch actionability failure is deterministically re-resolved once", async () => {
  await withFixture("post-refusal-reject-reresolved-before-click", async (url) => {
    const packet = await observe(url, { confirmationTimeoutMs: 300 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(packet.interactionDiagnostics?.click.reResolvedBeforeDispatch, true);
    assert.ok(packet.storage.preActionCapturedAtMs !== undefined);
    assert.ok(packet.refusalRegistration.actionDispatchedAtMs !== undefined);
    assert.ok(
      packet.refusalRegistration.actionDispatchedAtMs - packet.storage.preActionCapturedAtMs <=
        POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS,
    );
  });
});

test("semantic confirmation is checked when an ordinary click reports an error", async () => {
  await withFixture("post-refusal-reject-click-confirmed-after-error", async (url) => {
    const packet = await observe(url, { confirmationTimeoutMs: 300 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.interactionDiagnostics?.click.outcome, "confirmed_after_error");
    assert.equal(packet.interactionDiagnostics?.click.confirmationCheckedAfterError, true);
    assert.equal(packet.limitations.some((limitation) =>
      limitation.startsWith("click_error_but_refusal_semantically_confirmed:")
    ), true);
  });
});

test("navigation recovery requires a recoverable error, committed document, and authorized URL", async () => {
  const page = {
    waitForTimeout: async () => undefined,
    url: () => "http://127.0.0.1:4173/fixture",
    evaluate: async () => ({
      hasDocumentElement: true,
      hasBody: true,
      readyState: "interactive",
    }),
  } as never;
  const authorization = {
    authorizationId: "loopback_local_lab",
    kind: "loopback" as const,
  };

  assert.equal(
    classifyNavigationFailure(new Error("Navigation to target is interrupted by another navigation")),
    "navigation_replaced",
  );
  assert.deepEqual(
    await inspectRecoverableCommittedDocument(page, authorization, "navigation_replaced"),
    { recovered: true, documentCommitted: true, finalUrlAuthorized: true },
  );
  assert.deepEqual(
    await inspectRecoverableCommittedDocument(page, authorization, "timeout"),
    { recovered: false, documentCommitted: true, finalUrlAuthorized: true },
  );
  assert.deepEqual(
    await inspectRecoverableCommittedDocument(page, authorization, "http2_protocol"),
    { recovered: true, documentCommitted: true, finalUrlAuthorized: true },
  );
});

test("a stale pre-action storage state cannot confirm the reject click", async () => {
  await withFixture("post-refusal-reject-stale-storage", async (url) => {
    const packet = await observe(url, { confirmationTimeoutMs: 100 });

    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
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

test("a redirected in-flight request stays grace-excluded after pre-action retention is exhausted", async () => {
  await withFixture("post-refusal-reject-inflight-redirect-flood", async (url) => {
    const packet = await observe(url, { observationWindowMs: 500 });
    const redirectedRequest = packet.network.requests.find((request) =>
      request.hostname === "www.google-analytics.com"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(redirectedRequest?.inFlightAtRefusalRegistration, true);
    assert.equal(packet.network.postRefusalNonEssentialRequests.some((request) =>
      request.requestId === redirectedRequest?.requestId
    ), false);
    assert.equal(packet.storage.writesAfterRefusal.some((write) =>
      write.storageType === "cookie" && write.name === "_ga"
    ), false);
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "post_refusal_non_essential_activity"
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

test("canonical reject recipe set selects the one actionable deterministic control", async () => {
  const recipeCandidates = buildCanonicalPostRefusalActionRecipes();
  assert.deepEqual(
    recipeCandidates.map((candidate) => candidate.cmpId),
    [
      "certscore_owned_analytics_consent",
      "OpenAI first-party consent controls",
      "OneTrust",
      "Usercentrics",
      "Cookiebot",
      "Seznam CMP",
      "Google Funding Choices",
    ],
  );
  await withFixture("post-refusal-onetrust-tcf-honored", async (url) => {
    const packet = await observe(url, {
      recipe: recipeCandidates[0],
      recipeCandidates,
      recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "OneTrust");
    assert.equal(packet.resolver.recipeId, "canonical-cmp:OneTrust:reject:v3");
    assert.equal(packet.refusalRegistration.status, "confirmed");
  });
});

test("canonical CMP recipe set fails closed when multiple controls are actionable", async () => {
  const recipeCandidates = buildCanonicalPostRefusalActionRecipes();
  await withFixture("post-refusal-canonical-cmp-ambiguous", async (url) => {
    const packet = await observe(url, {
      recipe: recipeCandidates[0],
      recipeCandidates,
      recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
    });

    assert.equal(packet.resolver.found, false);
    assert.equal(packet.resolver.recipeId, CANONICAL_POST_REFUSAL_RECIPE_SET_ID);
    assert.equal(packet.resolver.cmpId, undefined);
    assert.equal(packet.resolver.reason, "multiple_deterministic_reject_controls_found");
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("OneTrust canonical consent-cookie transition confirms deterministic rejection", async () => {
  const oneTrustRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OneTrust"
  );
  assert.ok(oneTrustRecipe);
  await withFixture("post-refusal-onetrust-cookie-confirmed", async (url) => {
    const packet = await observe(url, { recipe: oneTrustRecipe });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" &&
      witness.key === "OptanonConsent" &&
      witness.expectedState === "canonical_cmp_consent_state_changed_after_reject" &&
      witness.corroboratingOnly === false
    ), true);
  });
});

test("canonical OneTrust recipes resolve the continue-without-accepting variant", async () => {
  const oneTrustRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OneTrust"
  );
  assert.ok(oneTrustRecipe);
  await withFixture("post-refusal-onetrust-continue-without-accepting", async (url) => {
    const packet = await observe(url, { recipe: oneTrustRecipe });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.recipeId, "canonical-cmp:OneTrust:reject:v3");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" && witness.key === "OptanonConsent"
    ), true);
  });
});

test("unchanged OneTrust consent cookie cannot confirm deterministic rejection", async () => {
  const oneTrustRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OneTrust"
  );
  assert.ok(oneTrustRecipe);
  await withFixture("post-refusal-onetrust-cookie-stale", async (url) => {
    const packet = await observe(url, {
      confirmationTimeoutMs: 150,
      recipe: oneTrustRecipe,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("a post-reject navigation cannot crash or invalidate confirmed OneTrust refusal", async () => {
  const oneTrustRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "OneTrust"
  );
  assert.ok(oneTrustRecipe);
  await withFixture("post-refusal-onetrust-cookie-navigation", async (url) => {
    const packet = await observe(url, {
      observationWindowMs: 180,
      recipe: oneTrustRecipe,
    });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.timing.observationExitReason, "window_elapsed");
    assert.deepEqual(packet.observations, []);
  });
});

test("Cookiebot canonical consent-cookie creation confirms deterministic rejection", async () => {
  const cookiebotRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "Cookiebot"
  );
  assert.ok(cookiebotRecipe);
  assert.equal(cookiebotRecipe.recipeId, "canonical-cmp:Cookiebot:reject:v3");
  await withFixture("post-refusal-cookiebot-fast", async (url) => {
    const packet = await observe(url, { recipe: cookiebotRecipe });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" &&
      witness.key === "CookieConsent" &&
      witness.expectedState === "canonical_cmp_consent_state_changed_after_reject" &&
      witness.corroboratingOnly === false
    ), true);
  });
});

test("canonical Cookiebot recipes resolve the level-optin decline-all variant", async () => {
  const cookiebotRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "Cookiebot"
  );
  assert.ok(cookiebotRecipe);
  await withFixture("post-refusal-cookiebot-level-optin-decline-all", async (url) => {
    const packet = await observe(url, { recipe: cookiebotRecipe });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.recipeId, "canonical-cmp:Cookiebot:reject:v3");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" && witness.key === "CookieConsent"
    ), true);
  });
});

test("unchanged Cookiebot consent cookie cannot confirm deterministic rejection", async () => {
  const cookiebotRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "Cookiebot"
  );
  assert.ok(cookiebotRecipe);
  await withFixture("post-refusal-cookiebot-cookie-stale", async (url) => {
    const packet = await observe(url, {
      confirmationTimeoutMs: 150,
      recipe: cookiebotRecipe,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("a stale pre-action TCF denial cannot confirm the reject click", async () => {
  await withFixture("post-refusal-onetrust-tcf-stale", async (url) => {
    const packet = await observe(url, {
      confirmationTimeoutMs: 150,
      recipe: cmpRecipe("OneTrust", { kind: "tcf_purposes_denied" }, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("a delayed post-refusal TCF purpose grant is retained as a contradiction", async () => {
  await withFixture("post-refusal-onetrust-tcf-delayed-contradiction", async (url) => {
    const packet = await observe(url, {
      observationWindowMs: 300,
      recipe: cmpRecipe("OneTrust", { kind: "tcf_purposes_denied" }, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.observationExitReason, "refusal_signal_contradiction_observed");
    assert.deepEqual(packet.tcf?.postRefusalState?.purposeGrantedIds, [1]);
    assert.equal(packet.tcf?.postRefusalState?.purposeGrantSource, "tc_string");
    const contradiction = packet.observations.find((observation) =>
      observation.observationType === "refusal_signal_contradicts_action"
    );
    assert.ok(contradiction);
    assert.equal(contradiction.observedAtMs, packet.tcf?.postRefusalState?.observedAtMs);
    assert.equal(
      contradiction.msOffsetFromRefusal,
      contradiction.observedAtMs - packet.refusalRegistration.refusalRegisteredAtMs!,
    );
    assert.equal(contradiction.msOffsetFromRefusal! > 0, true);
  });
});

test("unavailable browser storage snapshots do not discard confirmed TCF refusal evidence", async () => {
  await withFixture("post-refusal-onetrust-tcf-storage-unavailable", async (url) => {
    const packet = await observe(url, {
      recipe: cmpRecipe("OneTrust", { kind: "tcf_purposes_denied" }, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.limitations.includes("local_storage_snapshot_unavailable"), true);
    assert.equal(packet.limitations.includes("session_storage_snapshot_unavailable"), true);
    assert.deepEqual(packet.storage.preAction, []);
    assert.deepEqual(packet.storage.postAction, []);
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
    const usercentricsRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
      candidate.cmpId === "Usercentrics"
    );
    assert.ok(usercentricsRecipe);
    const packet = await observe(usercentricsUrl, {
      actionSearchTimeoutMs: 1_500,
      recipe: usercentricsRecipe,
    });
    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.cmpId, "Usercentrics");
    assert.equal(packet.timing.resolverMs >= 1_000, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    const semanticWitness = packet.refusalRegistration.witnesses.find((witness) =>
      witness.witnessType === "cmp_storage_state"
    );
    assert.equal(semanticWitness?.observedAtMs, packet.refusalRegistration.refusalRegisteredAtMs);
    assert.equal(semanticWitness?.key, "uc_settings");
    assert.equal(
      semanticWitness?.expectedState,
      "canonical_cmp_consent_state_changed_after_reject",
    );
    assert.match(semanticWitness?.observedStateHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(semanticWitness?.corroboratingOnly, false);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "banner_transition" && witness.corroboratingOnly
    ), true);
  });
});

test("recognized CMP evidence unlocks only the bounded late-control search extension", async () => {
  await withFixture("post-refusal-onetrust-very-late", async (url) => {
    const packet = await observe(url, {
      actionSearchTimeoutMs: 10_000,
      recipe: cmpRecipe("OneTrust", recipe.confirmation, "#onetrust-banner-sdk"),
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.timing.resolverMs >= 8_000, true);
    assert.equal(packet.timing.resolverMs < 10_250, true);
    assert.equal(packet.limitations.includes("adaptive_late_control_extension_applied:2000"), true);
  });
});

test("a fresh Usercentrics write with unchanged canonical state cannot confirm refusal", async () => {
  await withFixture("post-refusal-usercentrics-storage-stale", async (url) => {
    const usercentricsRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
      candidate.cmpId === "Usercentrics"
    );
    assert.ok(usercentricsRecipe);
    const packet = await observe(url, {
      actionSearchTimeoutMs: 1_500,
      confirmationTimeoutMs: 150,
      recipe: usercentricsRecipe,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, false);
    assert.deepEqual(packet.refusalRegistration.witnesses, []);
    assert.deepEqual(packet.observations, []);
  });
});

test("canonical Usercentrics recipes resolve the scoped legacy #deny variant", async () => {
  await withFixture("post-refusal-usercentrics-legacy-deny", async (url) => {
    const usercentricsRecipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
      candidate.cmpId === "Usercentrics"
    );
    assert.ok(usercentricsRecipe);
    const packet = await observe(url, {
      actionSearchTimeoutMs: 1_500,
      recipe: usercentricsRecipe,
    });

    assert.equal(packet.resolver.found, true);
    assert.equal(packet.resolver.recipeId, "canonical-cmp:Usercentrics:reject:v4");
    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.refusalRegistration.refusalExercised, true);
    assert.equal(packet.refusalRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_storage_state" && witness.key === "ucString"
    ), true);
  });
});

test("pre-action request floods cannot exhaust post-refusal request retention", async () => {
  await withFixture("post-refusal-reject-request-flood", async (url) => {
    const packet = await observe(url, { observationWindowMs: 300 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.network.requests.length <= 96, true);
    assert.equal(packet.network.postRefusalNonEssentialRequests.some((request) =>
      request.hostname === "www.google-analytics.com"
    ), true);
  });
});

test("pre-action storage-write floods cannot hide registration or post-refusal writes", async () => {
  await withFixture("post-refusal-reject-storage-write-flood", async (url) => {
    const packet = await observe(url, { observationWindowMs: 300 });

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(packet.storage.writesAfterRefusal.some((write) =>
      write.name === "_gid" && write.nonEssential
    ), true);
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "post_refusal_non_essential_activity" &&
      observation.storageName === "_gid"
    ), true);
  });
});

test("post-refusal HttpOnly response cookies are retained through snapshot deltas", async () => {
  await withFixture("post-refusal-reject-server-cookie", async (url) => {
    const packet = await observe(url, { observationWindowMs: 240 });
    const serverCookieWrite = packet.storage.writesAfterRefusal.find((write) =>
      write.storageType === "cookie" && write.name === "_gid"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(serverCookieWrite?.nonEssential, true);
    assert.equal(serverCookieWrite?.evidenceSource, "post_action_snapshot_delta");
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "post_refusal_non_essential_activity" &&
      observation.storageName === "_gid" &&
      observation.storageType === "cookie" &&
      observation.hostname === serverCookieWrite.hostname &&
      observation.observedAtMs === serverCookieWrite.observedAtMs
    ), true);
  });
});

test("third-party snapshot cookies without an exact response anchor fail closed", async () => {
  await withFixture("post-refusal-reject-third-party-cookie", async (url) => {
    const packet = await observe(url, { observationWindowMs: 240 });
    const retainedCookie = packet.storage.postAction.find((item) =>
      item.storageType === "cookie" &&
      item.name === "_ga" &&
      item.hostname === "cookie-fixture.example"
    );
    const thirdPartyCookieWrite = packet.storage.writesAfterRefusal.find((write) =>
      write.storageType === "cookie" &&
      write.name === "_ga" &&
      write.hostname === "cookie-fixture.example"
    );

    assert.equal(packet.refusalRegistration.status, "confirmed");
    assert.equal(retainedCookie?.nonEssential, true);
    assert.equal(thirdPartyCookieWrite, undefined);
    assert.equal(packet.observations.some((observation) =>
      observation.observationType === "post_refusal_non_essential_activity" &&
      observation.storageName === "_ga"
    ), false);
  });
});

test("TCF v2 decoder rejects malformed strings and retains purpose grants", () => {
  assert.equal(decodeTcfV2PurposeConsents("not-a-tcf-string").status, "invalid");
  const bytes = Buffer.alloc(22);
  bytes[0] = 2 << 2;
  bytes[19] = 0b10000000;
  const decoded = decodeTcfV2PurposeConsents(bytes.toString("base64url"));
  assert.equal(decoded.status, "parsed_v2");
  assert.equal(decoded.purposeConsents["1"], true);
  assert.equal(decoded.purposeConsents["2"], false);
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
