import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { projectPostAcceptEvidenceForReport, runtimeGraphDispatchSchema } from "@certscore/contracts";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { RuntimeEvidenceGraphBuilder } from "./runtime-evidence-graph.js";
import { chromium } from "playwright";
import {
  buildCanonicalPostAcceptActionRecipes,
  CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
} from "./post-accept-cmp-recipes.js";

test("graph action capture preserves a single confirmed Accept and its registration anchor", async () => {
  await withFixture({ ambiguous: false }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500, confirmationTimeoutMs: 500,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 500, productionProjectable: true, recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "graph-parent:accept_observation", parentScanId: "graph-parent", url,
      runtimeGraph: runtimeGraphDispatchSchema.parse({ contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "graph-parent", mode: "project", profile: "bounded_passive_v1" }),
    });
    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.runtimeEvidenceGraph?.scanId, "graph-parent");
    assert.equal(packet.runtimeEvidenceGraph?.scenario, "post_accept");
    assert.equal(packet.runtimeEvidenceGraph?.action?.status, "confirmed");
    assert.ok(packet.runtimeEvidenceGraph!.nodes.some(node => node.observedAtMs < packet.runtimeEvidenceGraph!.action!.registeredAtMs!));
  });
});

test("post-Accept observer confirms one deterministic action and retains bounded activity", async () => {
  await withFixture({ ambiguous: false }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 2_000,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-confirmed",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, true);
    assert.equal(packet.actionControlProof?.action, "accept");
    assert.equal(packet.actionControlProof?.accessibleLabel, "Accept");
    assert.equal(packet.actionControlProof?.actionSemantics, "direct_label");
    assert.equal(packet.actionControlProof?.classifierIntent, "accept");
    assert.equal(packet.actionControlProof?.visible, true);
    assert.equal(packet.actionControlProof?.enabled, true);
    assert.equal(packet.actionControlProof?.uniquelyActionable, true);
    assert.equal(packet.productionProjectable, true);
    assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType, "cmp_storage_state");
    assert.ok(packet.storage.writesAfterAccept.some((write) =>
      write.storageType === "cookie" && write.name === "_ga" && write.nonEssential
    ));
    assert.ok(packet.observations.some((observation) =>
      observation.observationType === "post_accept_non_essential_activity"
    ));
    assert.equal(packet.timing.observationExitReason, "non_essential_storage_write_observed");
    assert.ok(packet.timing.observationMs < 1_000);
    assert.ok(packet.limitations.includes(
      "observation_early_exit:non_essential_storage_write_observed",
    ));
    const serialized = JSON.stringify(packet);
    assert.equal(serialized.includes("GA1.1.CERTSCORE_ACCEPT_RAW"), false);
  });
});

test("optional graph primary and fallback failure preserves Accept evidence and browser cleanup", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.mock.method(RuntimeEvidenceGraphBuilder.prototype, "finish", () => { throw new Error("injected graph finalization failure"); });
  try {
    await withFixture({ ambiguous: false }, async ({ url, actionCount }) => {
      const packet = await runPostAcceptObserver({ browser,
        actionSearchTimeoutMs: 500, confirmationTimeoutMs: 500, observationWindowMs: 500,
        interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
        productionProjectable: true, recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        scanId: "graph-parent:accept_observation", parentScanId: "graph-parent", url,
        runtimeGraph: runtimeGraphDispatchSchema.parse({ contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "graph-parent", mode: "project", profile: "bounded_passive_v1" }),
      });
      assert.equal(actionCount(), 1);
      assert.equal(packet.acceptanceRegistration.status, "confirmed");
      assert.equal(packet.productionProjectable, true);
      assert.ok(packet.storage.writesAfterAccept.some(write => write.name === "_ga" && write.nonEssential));
      assert.ok(packet.observations.some(row => row.observationType === "post_accept_non_essential_activity"));
      assert.equal(packet.runtimeEvidenceGraph, undefined);
      assert.deepEqual(packet.runtimeEvidenceGraphDiagnostics, [{ scenario: "post_accept", reason: "unavailable" }]);
      assert.equal(browser.contexts().length, 0);
      assert.equal(browser.isConnected(), true, "supplied browser remains caller-owned");
    });
  } finally { await browser.close(); }
});

test("post-Accept observer waits for a late-identified CSS-visible control to enter the viewport", async () => {
  await withFixture({
    ambiguous: false,
    offscreenUntilMs: 700,
    runtimeScriptDelayMs: 150,
  }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_500,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: {
        ...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        cmpId: "HubSpot Consent Banner",
        recipeId: "canonical-cmp:HubSpot Consent Banner:accept:animated-fixture",
        runtimeUrlPatternSources: ["hs-banner-runtime"],
      },
      scanId: "post-accept-observer-animated-viewport-control",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.interactionDiagnostics.click.outcome, "completed");
    assert.equal(packet.timing.resolverMs >= 500, true);
  });
});

test("post-Accept observer returns a limited confirmed packet before its result budget", async () => {
  await withFixture({ ambiguous: false, activityDelayMs: 5_000 }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 5_000,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      resultBudgetMs: 1_500,
      scanId: "post-accept-observer-result-budget",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.productionProjectable, false);
    assert.equal(packet.cancellation.requested, true);
    assert.ok(packet.timing.totalMs < 2_500);
    assert.ok(packet.limitations.includes(
      "observer_result_budget_exhausted_after_confirmed_acceptance",
    ));
  });
});

test("post-Accept observer fails closed when more than one deterministic control matches", async () => {
  await withFixture({ ambiguous: true }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 100,
      confirmationTimeoutMs: 200,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-ambiguous",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.resolver.reason, "multiple_deterministic_accept_controls_found");
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
    assert.equal(packet.productionProjectable, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("post-Accept observer does not click when the resolved control label is not Accept", async () => {
  await withFixture({ ambiguous: false, controlLabel: "Manage preferences" }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 200,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-label-mismatch",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.resolver.reason, "label_mismatch");
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, false);
    assert.equal(packet.actionControlProof, undefined);
    assert.ok(packet.limitations.includes("label_mismatch"));
    assert.ok(packet.limitations.includes("resolved_control_intent_options"));
  });
});

test("post-Accept observer resolves one exact control inside a child frame", async () => {
  await withFixture({ ambiguous: false, framed: true }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-frame",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType, "cmp_storage_state");
  });
});

test("post-Accept observer confirms the canonical Fides first-layer action", async () => {
  const fidesRecipe = buildCanonicalPostAcceptActionRecipes().find((candidate) =>
    candidate.cmpId === "Fides"
  );
  assert.ok(fidesRecipe);

  await withFidesFixture(async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_000,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 100,
      productionProjectable: true,
      recipe: fidesRecipe,
      scanId: "post-accept-observer-fides",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.resolver.cmpId, "Fides");
    assert.equal(packet.resolver.recipeId, "canonical-cmp:Fides:accept:v1");
    assert.equal(packet.timing.resolverMs >= 500, true);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, true);
    assert.equal(packet.acceptanceRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" &&
      witness.key === "fides_consent" &&
      witness.corroboratingOnly === false
    ), true);
  });
});

test("post-Accept observer confirms a CookieYes cookie-state transition", async () => {
  const recipe = buildCanonicalPostAcceptActionRecipes().find((candidate) =>
    candidate.cmpId === "CookieYes"
  );
  assert.ok(recipe);

  await withCookieYesFixture("accept", async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 100,
      productionProjectable: true,
      recipe,
      scanId: "post-accept-observer-cookieyes",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.witnesses.some((witness) =>
      witness.witnessType === "cmp_cookie_state" && witness.key === "cookieyes-consent"
    ), true);
  });
});

test("post-Accept observer retains an actionable CMP coverage diagnostic instead of a silent miss", async () => {
  await withCookieYesFixture("accept", async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 100,
      confirmationTimeoutMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-cookieyes-coverage",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
    assert.equal(packet.limitations.some((limitation) =>
      limitation.startsWith("cmp_action_coverage:accept:recognized_recipe_not_resolved:CookieYes:")
    ), true, packet.limitations.join("\n"));
  });
});

test("canonical control discovery confirms a non-CMP first-layer Accept action", async () => {
  await withCanonicalAcceptFixture({}, async ({ url, actionCount }) => {
    const recipeCandidates = buildCanonicalPostAcceptActionRecipes();
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 2_000,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 500,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: recipeCandidates[0]!,
      recipeCandidates,
      recipeSetId: "canonical-consent-control-accept-v3",
      scanId: "post-accept-observer-canonical-non-cmp",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.resolver.found, true, JSON.stringify(packet.limitations));
    assert.equal(packet.resolver.method, "canonical_consent_control_registry_recipe");
    assert.match(packet.resolver.recipeId, /^canonical-control:accept:v1:/);
    assert.equal(packet.actionControlProof?.classifierIntent, "accept");
    assert.equal(packet.actionControlProof?.visible, true);
    assert.equal(packet.actionControlProof?.enabled, true);
    assert.equal(packet.actionControlProof?.uniquelyActionable, true);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.witnesses.some((witness) =>
      witness.witnessType === "canonical_acceptance_state" &&
      witness.corroboratingOnly === false
    ), true);
  });
});

test("runtime-identified CMP resolves its canonical live Accept control before a stale selector", async () => {
  await withCanonicalAcceptFixture({ confirmationCookieName: "runtime_cmp_consent" }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_500,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 500,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: {
        artifactVersion: "certscore.post_accept_action_recipe.v1",
        recipeId: "canonical-cmp:Runtime Fixture CMP:accept:stale-selector",
        cmpId: "Runtime Fixture CMP",
        resolverMethod: "cmp_registry_recipe",
        controlSelector: "#stale-registered-accept-selector",
        runtimeUrlPatternSources: ["127\\.0\\.0\\.1"],
        bannerSelector: "#privacy-consent",
        confirmation: {
          kind: "cmp_cookie_changed",
          cookieName: "runtime_cmp_consent",
        },
      },
      scanId: "post-accept-observer-runtime-primary-canonical-control",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.resolver.cmpId, "Runtime Fixture CMP");
    assert.equal(packet.resolver.method, "cmp_registry_recipe");
    assert.match(packet.resolver.recipeId, /^canonical-control:accept:v1:/);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
  });
});

test("runtime-identified CMP does not use its selector while the Accept control is off-screen", async () => {
  await withFixture({
    ambiguous: false,
    offscreenUntilMs: 5_000,
    runtimeScriptDelayMs: 25,
  }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 400,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      recipe: {
        ...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        cmpId: "Runtime Fixture CMP",
        recipeId: "canonical-cmp:Runtime Fixture CMP:accept:offscreen",
        runtimeUrlPatternSources: ["hs-banner-runtime"],
      },
      scanId: "post-accept-observer-runtime-offscreen-control",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
    assert.equal(packet.interactionDiagnostics.click.outcome, "not_attempted");
  });
});

test("canonical Accept discovery does not click generic page choices without consent context", async () => {
  await withCanonicalAcceptFixture({ consentContext: false }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 800,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: {
        ...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        controlSelector: "#registered-accept-not-present",
        recipeId: "missing-registered-accept-recipe",
      },
      scanId: "post-accept-observer-canonical-no-context",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
  });
});

test("canonical Accept discovery fails closed on multiple first-layer Accept controls", async () => {
  await withCanonicalAcceptFixture({ ambiguous: true }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_000,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: {
        ...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        controlSelector: "#registered-accept-not-present",
        recipeId: "missing-registered-accept-recipe",
      },
      scanId: "post-accept-observer-canonical-ambiguous",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
  });
});

test("canonical Accept discovery reports an unconfirmed click as indeterminate evidence", async () => {
  await withCanonicalAcceptFixture({ confirm: false }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_000,
      allowCanonicalAcceptDiscovery: true,
      confirmationTimeoutMs: 100,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: {
        ...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        controlSelector: "#registered-accept-not-present",
        recipeId: "missing-registered-accept-recipe",
      },
      scanId: "post-accept-observer-canonical-unconfirmed",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "unconfirmed");
    assert.equal(
      projectPostAcceptEvidenceForReport({ packet }).evidenceDisposition,
      "indeterminate",
    );
    assert.equal(packet.productionProjectable, false);
  });
});

async function withFixture(
  options: {
    activityDelayMs?: number;
    ambiguous: boolean;
    controlLabel?: string;
    framed?: boolean;
    offscreenUntilMs?: number;
    runtimeScriptDelayMs?: number;
  },
  run: (fixture: { actionCount: () => number; url: string }) => Promise<void>,
) {
  let acceptActions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/accept-action") {
      acceptActions += 1;
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/hs-banner-runtime.js") {
      response.setHeader("content-type", "application/javascript; charset=utf-8");
      response.end("window.__hubspotFixtureLoaded = true;");
      return;
    }
    const controls = `${options.offscreenUntilMs && !options.runtimeScriptDelayMs
      ? '<script src="/hs-banner-runtime.js"></script>'
      : ""}
      <section id="fixture-consent" aria-label="Cookie and analytics preferences"
        ${options.offscreenUntilMs
          ? 'style="position:fixed;left:20px;top:20px;transform:translateY(1200px)"'
          : ""}>
        <button data-certscore-consent-action="accept">${options.controlLabel ?? "Accept"}</button>
        ${options.ambiguous
          ? '<button data-certscore-consent-action="accept">Accept all</button>'
          : ""}
      </section>
      <script>
        ${options.offscreenUntilMs && options.runtimeScriptDelayMs
          ? `setTimeout(() => {
              const runtime = document.createElement('script');
              runtime.src = '/hs-banner-runtime.js';
              document.head.appendChild(runtime);
            }, ${options.runtimeScriptDelayMs});`
          : ""}
        ${options.offscreenUntilMs
          ? `setTimeout(() => document.querySelector('#fixture-consent').style.transform = 'none', ${options.offscreenUntilMs});`
          : ""}
        for (const button of document.querySelectorAll('[data-certscore-consent-action="accept"]')) {
          button.addEventListener("click", () => {
            fetch("/accept-action", { method: "POST" });
            localStorage.setItem("certscore:analytics-consent:v1", "granted");
            document.querySelector("section").hidden = true;
            setTimeout(() => {
              localStorage.setItem("cmp_receipt", "accepted");
              document.cookie = "_ga=GA1.1.CERTSCORE_ACCEPT_RAW; Path=/; SameSite=Lax";
            }, ${options.activityDelayMs ?? 60});
          });
        }
      </script>`;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/frame") {
      response.end(`<!doctype html><html><body>${controls}</body></html>`);
      return;
    }
    response.end(`<!doctype html>
      <html><body>
        ${options.framed ? '<iframe src="/frame" title="Consent"></iframe>' : controls}
      </body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: () => acceptActions, url });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withCanonicalAcceptFixture(
  options: {
    ambiguous?: boolean;
    confirm?: boolean;
    confirmationCookieName?: string;
    consentContext?: boolean;
  },
  run: (fixture: { actionCount: () => number; url: string }) => Promise<void>,
) {
  let acceptActions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/accept-action") {
      acceptActions += 1;
      response.writeHead(204).end();
      return;
    }
    const consentContext = options.consentContext !== false;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <section id="${consentContext ? "privacy-consent" : "plan-picker"}"
        role="dialog"
        aria-label="${consentContext ? "Cookie consent choices" : "Plan choices"}">
        <p>${consentContext
          ? "Choose whether this site may use analytics and advertising cookies."
          : "Choose the product plan you want."}</p>
        <button class="choice">Reject all</button>
        <button class="choice">Manage choices</button>
        <button class="choice accept-choice">Accept all</button>
        ${options.ambiguous ? '<button class="choice accept-choice">Accept all</button>' : ""}
      </section>
      <script>
        for (const button of document.querySelectorAll('.accept-choice')) {
          button.addEventListener('click', () => {
            fetch('/accept-action', { method: 'POST' });
            ${options.confirmationCookieName
              ? `document.cookie = '${options.confirmationCookieName}=accepted; Path=/; SameSite=Lax';`
              : ""}
            ${options.confirm === false
              ? ""
              : `document.querySelector('#${consentContext ? "privacy-consent" : "plan-picker"}').hidden = true;`}
          });
        }
      </script>
    </body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: () => acceptActions, url });
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
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind a TCP port.");
  return `http://127.0.0.1:${address.port}/`;
}

async function withFidesFixture(
  run: (fixture: { actionCount: () => number; url: string }) => Promise<void>,
) {
  let acceptActions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/accept-action") {
      acceptActions += 1;
      response.writeHead(204).end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
      <html><body>
        <div id="fixture-root"></div>
        <script>
          setTimeout(() => {
            document.querySelector("#fixture-root").innerHTML =
              '<div id="fides-banner"><div id="fides-banner-inner"><button class="fides-reject-all-button">Reject all</button><button class="fides-accept-all-button">Accept all</button></div></div>';
            document.querySelector("button.fides-accept-all-button").addEventListener("click", () => {
              fetch("/accept-action", { method: "POST" });
              document.cookie = "fides_consent=accepted; Path=/; SameSite=Lax";
              document.querySelector("#fides-banner").hidden = true;
            });
          }, 600);
        </script>
      </body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: () => acceptActions, url });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withCookieYesFixture(
  action: "accept" | "reject",
  run: (fixture: { actionCount: () => number; url: string }) => Promise<void>,
) {
  let actions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/choice-action") {
      actions += 1;
      response.writeHead(204).end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <div class="cky-consent-container">
        <button class="cky-btn-reject">Reject all</button>
        <button class="cky-btn-accept">Accept all</button>
      </div>
      <script>
        document.querySelector('.cky-btn-${action}').addEventListener('click', () => {
          fetch('/choice-action', { method: 'POST' });
          document.cookie = 'cookieyes-consent=consentid:test,action:${action}; Path=/; SameSite=Lax';
          document.querySelector('.cky-consent-container').hidden = true;
        });
      </script>
    </body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: () => actions, url });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
