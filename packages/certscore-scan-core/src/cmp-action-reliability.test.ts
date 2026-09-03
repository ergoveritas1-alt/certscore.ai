import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

type QualifiedCmp = {
  accept: boolean;
  banner: string;
  canonicalName: string;
  cookieName: string;
  reject: boolean;
  variant?: string;
  apiProvider?: "termly" | "transcend";
  runtimeScriptPath?: string;
};

const QUALIFIED_CMPS: QualifiedCmp[] = [
  {
    accept: true,
    banner: '<div id="cmpbox"><a href="#" class="cmpboxbtn cmpboxbtnno">Reject</a><a href="#" class="cmpboxbtn cmpboxbtnyes">Accept</a></div>',
    canonicalName: "Consentmanager",
    cookieName: "__cmpconsent",
    reject: true,
  },
  {
    accept: true,
    banner: '<div id="qc-cmp2-ui"><button id="qc-reject">Reject All</button><button id="qc-accept">Accept All</button></div>',
    canonicalName: "Quantcast Choice",
    cookieName: "euconsent-v2",
    reject: true,
    runtimeScriptPath: "/qc-cmp/runtime.js",
  },
  {
    accept: true,
    banner: '<div id="hs-eu-cookie-confirmation"><a href="#" id="hs-eu-decline-button" role="button">Decline</a><a href="#" id="hs-eu-confirmation-button" role="button">Accept</a></div>',
    canonicalName: "HubSpot Consent Banner",
    cookieName: "__hs_opt_out",
    reject: true,
    variant: "legacy-opt-in",
  },
  {
    accept: true,
    banner: '<div id="hs-eu-cookie-confirmation"><button id="hs-eu-decline-button">Decline</button><button id="hs-eu-confirmation-button">Accept</button></div>',
    canonicalName: "HubSpot Consent Banner",
    cookieName: "__hs_cookie_cat_pref",
    reject: true,
  },
  {
    accept: true,
    banner: '<div id="ketch-banner"><button id="ketch-banner-button-secondary">Reject all non-essential</button><button id="ketch-banner-button-tertiary">Accept all</button></div>',
    canonicalName: "Ketch",
    cookieName: "ketch_consent",
    reject: true,
  },
  {
    accept: true,
    banner: '<div id="iubenda-cs-banner"><div class="iubenda-cs-opt-group-consent"><button class="iubenda-cs-reject-btn">Reject</button><button class="iubenda-cs-accept-btn">Accept</button></div></div>',
    canonicalName: "Iubenda",
    cookieName: "_iub_cs",
    reject: true,
  },
  {
    accept: true,
    banner: '<div id="coiOverlay"><button class="coi-banner__decline">Decline</button><button class="coi-banner__accept">Accept</button></div>',
    canonicalName: "Cookie Information",
    cookieName: "CookieInformationConsent",
    reject: true,
  },
  {
    accept: true,
    banner: '<div id="qc-cmp2-ui"><button id="inmobi-reject">Reject All</button><button id="inmobi-accept">Accept All</button></div>',
    canonicalName: "InMobi Choice",
    cookieName: "euconsent-v2",
    reject: true,
    runtimeScriptPath: "/cmp.inmobi.com/choice/runtime.js",
  },
  {
    accept: true,
    banner: '<div data-termly-part="consent-banner"><div data-termly-part="banner-actions"><button id="termly-preferences">Preferences</button><button id="termly-reject">Decline</button><button id="termly-accept">Accept</button></div></div>',
    canonicalName: "Termly",
    cookieName: "unused",
    reject: true,
    apiProvider: "termly",
  },
  {
    accept: true,
    banner: '<div id="transcend-shadow-root"></div>',
    canonicalName: "Transcend",
    cookieName: "unused",
    reject: true,
    apiProvider: "transcend",
  },
];

const REPEAT_COUNT = 3;

test("newly qualified CMP actions confirm exactly once across repeated fresh browser sessions", async () => {
  const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
  const rejectRecipes = buildCanonicalPostRefusalActionRecipes();

  for (const cmp of QUALIFIED_CMPS) {
    const acceptRecipe = acceptRecipes.find((recipe) => recipe.cmpId === cmp.canonicalName);
    const rejectRecipe = rejectRecipes.find((recipe) => recipe.cmpId === cmp.canonicalName);
    assert.equal(Boolean(acceptRecipe), cmp.accept, `${cmp.canonicalName} Accept recipe availability`);
    assert.equal(Boolean(rejectRecipe), cmp.reject, `${cmp.canonicalName} Reject recipe availability`);

    for (let attempt = 0; attempt < REPEAT_COUNT; attempt += 1) {
      if (acceptRecipe) {
        await withCmpFixture(cmp, async ({ actionCount, url }) => {
          const packet = await runPostAcceptObserver({
            actionSearchTimeoutMs: 500,
            confirmationTimeoutMs: 500,
            interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
            observationWindowMs: 50,
            productionProjectable: true,
            recipe: acceptRecipe,
            scanId: `reliability-${cmp.canonicalName}-${cmp.variant ?? "current"}-accept-${attempt}`,
            url,
          });
          assert.equal(
            packet.acceptanceRegistration.status,
            "confirmed",
            `${cmp.canonicalName} Accept attempt ${attempt}: ${packet.acceptanceRegistration.reason ?? "no reason"}`,
          );
          assert.equal(packet.resolver.cmpId, cmp.canonicalName);
          assert.equal(actionCount("accept"), 1);
        });
      }

      if (rejectRecipe) {
        await withCmpFixture(cmp, async ({ actionCount, url }) => {
          const packet = await runPostRefusalObserver({
            actionSearchTimeoutMs: 500,
            confirmationTimeoutMs: 500,
            interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
            observationWindowMs: 50,
            productionProjectable: true,
            recipe: rejectRecipe,
            scanId: `reliability-${cmp.canonicalName}-${cmp.variant ?? "current"}-reject-${attempt}`,
            url,
          });
          assert.equal(
            packet.refusalRegistration.status,
            "confirmed",
            `${cmp.canonicalName} Reject attempt ${attempt}: ${packet.refusalRegistration.reason ?? "no reason"}`,
          );
          assert.equal(packet.resolver.cmpId, cmp.canonicalName);
          assert.equal(actionCount("reject"), 1);
        });
      }
    }
  }
});

test("all target CMP families expose qualified Accept and Reject recipes", () => {
  const acceptCmpIds = new Set(buildCanonicalPostAcceptActionRecipes().map((recipe) => recipe.cmpId));
  const rejectCmpIds = new Set(buildCanonicalPostRefusalActionRecipes().map((recipe) => recipe.cmpId));
  for (const canonicalName of [
    "Consentmanager",
    "HubSpot Consent Banner",
    "Ketch",
    "Cookie Information",
    "Iubenda",
    "InMobi Choice",
    "Quantcast Choice",
    "Termly",
    "Transcend",
  ]) {
    assert.equal(acceptCmpIds.has(canonicalName), true, `${canonicalName} Accept recipe`);
    assert.equal(rejectCmpIds.has(canonicalName), true, `${canonicalName} Reject recipe`);
  }
});

test("Iubenda consent-or-pay Reject remains actionless while ordinary Reject is qualified", async () => {
  const cmp: QualifiedCmp = {
    accept: true,
    banner: '<div id="iubenda-cs-banner"><div class="iubenda-cs-opt-group-consent"><button class="iubenda-cs-reject-btn">Reject and subscribe</button><button class="iubenda-cs-accept-btn">Accept</button></div></div>',
    canonicalName: "Iubenda",
    cookieName: "_iub_cs",
    reject: true,
    variant: "consent-or-pay",
  };
  const recipe = buildCanonicalPostRefusalActionRecipes().find((candidate) =>
    candidate.cmpId === "Iubenda"
  );
  assert.ok(recipe);
  await withCmpFixture(cmp, async ({ actionCount, url }) => {
    const packet = await runPostRefusalObserver({
      actionSearchTimeoutMs: 250,
      confirmationTimeoutMs: 250,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      observationWindowMs: 25,
      productionProjectable: true,
      recipe,
      scanId: "iubenda-consent-or-pay-safety",
      url,
    });
    assert.equal(packet.refusalRegistration.status, "not_attempted");
    assert.equal(actionCount("reject"), 0);
  });
});

async function withCmpFixture(
  cmp: QualifiedCmp,
  run: (fixture: { actionCount: (action: "accept" | "reject") => number; url: string }) => Promise<void>,
) {
  const actionCounts = { accept: 0, reject: 0 };
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.invalid");
    if (requestUrl.pathname === "/action") {
      const action = requestUrl.searchParams.get("action");
      if (action === "accept" || action === "reject") actionCounts[action] += 1;
      response.writeHead(204).end();
      return;
    }
    if (requestUrl.pathname.endsWith("runtime.js")) {
      response.setHeader("content-type", "application/javascript");
      response.end("/* retained CMP runtime marker */");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>${cmp.banner}${cmp.runtimeScriptPath ? `<script src="${cmp.runtimeScriptPath}"></script>` : ""}<script>
      const cookieName = ${JSON.stringify(cmp.cookieName)};
      const apiProvider = ${JSON.stringify(cmp.apiProvider ?? null)};
      const termlyHandlers = [];
      const termlyState = { essential: true, performance: false, analytics: false, advertising: false, social_networking: false, unclassified: false };
      if (apiProvider === "termly") {
        window.Termly = {
          getConsentState: () => ({ ...termlyState }),
          on: (event, callback) => { if (event === "consent") termlyHandlers.push(callback); },
        };
      }
      let transcendState = { Essential: true, Functional: false, Analytics: false, Advertising: false };
      let transcendTimestamp = "2026-01-01T00:00:00.000Z";
      if (apiProvider === "transcend") {
        window.airgap = {
          sync: async () => {},
          getConsent: () => ({ purposes: { ...transcendState }, timestamp: transcendTimestamp }),
        };
      }
      const applyAction = (action) => {
        if (apiProvider === "termly") {
          for (const key of Object.keys(termlyState)) if (key !== "essential") termlyState[key] = action === "accept";
          termlyHandlers.forEach((handler) => handler({ consentState: { ...termlyState } }));
        } else if (apiProvider === "transcend") {
          for (const key of Object.keys(transcendState)) if (key !== "Essential") transcendState[key] = action === "accept";
          transcendTimestamp = new Date(Date.now() + 1000).toISOString();
        } else {
          document.cookie = cookieName + "=" + action + "-confirmed; Path=/; SameSite=Lax";
        }
        fetch("/action?action=" + action, { method: "POST" });
        document.querySelector("body > div")?.setAttribute("hidden", "");
      };
      const bind = (selector, action) => document.querySelector(selector)?.addEventListener("click", (event) => {
        event.preventDefault();
        applyAction(action);
      });
      if (apiProvider === "transcend") {
        const shadow = document.querySelector("#transcend-shadow-root").attachShadow({ mode: "closed" });
        shadow.innerHTML = '<section aria-label="Privacy choices"><button id="transcend-reject">Reject All</button><button id="transcend-accept">Accept All</button></section>';
        shadow.querySelector("#transcend-accept").addEventListener("click", () => applyAction("accept"));
        shadow.querySelector("#transcend-reject").addEventListener("click", () => applyAction("reject"));
      } else {
        bind(${JSON.stringify(acceptSelector(cmp.canonicalName))}, "accept");
        bind(${JSON.stringify(rejectSelector(cmp.canonicalName))}, "reject");
      }
    </script></body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: (action) => actionCounts[action], url });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function acceptSelector(canonicalName: string) {
  return {
    Consentmanager: "a.cmpboxbtnyes",
    "Cookie Information": ".coi-banner__accept",
    "HubSpot Consent Banner": "#hs-eu-confirmation-button",
    Iubenda: ".iubenda-cs-accept-btn",
    "InMobi Choice": "#inmobi-accept",
    Ketch: "#ketch-banner-button-tertiary",
    "Quantcast Choice": "#qc-accept",
    Termly: "#termly-accept",
  }[canonicalName] ?? "[data-missing-accept]";
}

function rejectSelector(canonicalName: string) {
  return {
    Consentmanager: "a.cmpboxbtnno",
    "Cookie Information": ".coi-banner__decline",
    "HubSpot Consent Banner": "#hs-eu-decline-button",
    Iubenda: ".iubenda-cs-reject-btn",
    "InMobi Choice": "#inmobi-reject",
    Ketch: "#ketch-banner-button-secondary",
    "Quantcast Choice": "#qc-reject",
    Termly: "#termly-reject",
  }[canonicalName] ?? "[data-missing-reject]";
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("CMP reliability fixture failed to bind.");
  return `http://127.0.0.1:${address.port}/`;
}
