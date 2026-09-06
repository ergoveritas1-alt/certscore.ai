import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium, type Browser, type Locator } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";

type Action = "accept" | "reject";
const authorization = { kind: "loopback", authorizationId: "loopback_local_lab" } as const;

async function fixture(action: Action, options: {
  decision?: boolean; cookie?: string; initialCookie?: string; flood?: number; after?: string; emptyNames?: boolean;
  revealDelayMs?: number; customSelector?: boolean;
}, run: (url: string, count: () => number) => Promise<void>) {
  let clicks = 0;
  const server = createServer((request, response) => {
    if (request.url === "/clicked") clicks++;
    if (request.url !== "/") { response.writeHead(204).end(); return; }
    response.setHeader("content-type", "text/html");
    if (options.emptyNames) response.setHeader("set-cookie", "=private-cookie-value; Path=/; SameSite=Lax");
    response.end(`<!doctype html><html><body>
      <section id="consent-banner" class="cky-consent-container" role="dialog" aria-label="Cookie consent">
      <p>Choose whether this site may use analytics and advertising cookies.</p>
      <button id="choice" class="${options.customSelector ? "custom-consent-choice" : `cky-btn-${action}`}" hidden>${action === "accept" ? "Accept all" : "Reject all"}</button></section>
      <script>
        ${options.emptyNames ? `localStorage.setItem('', 'private-local-value'); sessionStorage.setItem('', 'private-session-value');` : ""}
        ${options.initialCookie || options.cookie ? `document.cookie = ${JSON.stringify(options.initialCookie ?? options.cookie!.replace("new", "old"))};` : ""}
        Promise.all(Array.from({length:${options.flood ?? 0}}, (_,i)=>fetch('/noise?i='+i))).then(()=>setTimeout(()=>choice.hidden=false, ${options.revealDelayMs ?? 0}));
        choice.onclick=()=>{
          ${options.decision ? `localStorage.setItem('consent','${action === "accept" ? "granted" : "denied"}');` : ""}
          ${options.cookie ? `document.cookie = ${JSON.stringify(options.cookie)};` : ""}
          document.getElementById('consent-banner').hidden=true;
          fetch('/clicked');
          ${options.after ?? ""}
        };
      </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`, () => clicks); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

async function observe(action: Action, url: string, options: { generic?: boolean; cookieYes?: boolean; browser?: Browser; signal?: AbortSignal; onLifecycleEvent?: () => void; observationWindowMs?: number; confirmationTimeoutMs?: number } = {}) {
  const common = { url, scanId: `reliability-${action}`, interactionAuthorization: authorization,
    actionSearchTimeoutMs: 1500, confirmationTimeoutMs: options.confirmationTimeoutMs ?? 150, observationWindowMs: options.observationWindowMs ?? 300,
    productionProjectable: true, browser: options.browser, signal: options.signal, onLifecycleEvent: options.onLifecycleEvent };
  if (action === "accept") return runPostAcceptObserver({ ...common,
    allowCanonicalAcceptDiscovery: options.generic,
    recipe: options.cookieYes ? buildCanonicalPostAcceptActionRecipes().find((r) => r.cmpId === "CookieYes")! : {
      artifactVersion: "certscore.post_accept_action_recipe.v1", recipeId: "local-accept-proof-v2",
      resolverMethod: "local_fixture_recipe", controlSelector: options.generic ? "#absent" : "#choice", bannerSelector: "#consent-banner",
      confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" },
    },
  });
  return runPostRefusalObserver({ ...common,
    allowCanonicalRejectDiscovery: options.generic,
    recipe: options.cookieYes ? buildCanonicalPostRefusalActionRecipes().find((r) => r.cmpId === "CookieYes")! : {
      artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "local-reject-proof-v2",
      resolverMethod: "local_fixture_recipe", controlSelector: options.generic ? "#absent" : "#choice", bannerSelector: "#consent-banner",
      confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "denied" },
    },
  });
}

test("recognized CMP with a delayed custom control keeps live discovery active within the original budget", async () => {
  await fixture("accept", { customSelector: true, revealDelayMs: 1_500, flood: 1,
    cookie: "cookieyes-consent=consentid:proof,action:accept,necessary:yes,analytics:yes,advertisement:yes; Path=/",
    initialCookie: "cookieyes-consent=consentid:proof,action:,necessary:yes,analytics:no,advertisement:no; Path=/",
  }, async (url, count) => {
    const namedRecipe = buildCanonicalPostAcceptActionRecipes().find((recipe) => recipe.cmpId === "CookieYes")!;
    const packet = await runPostAcceptObserver({ url, scanId: "delayed-custom-control", interactionAuthorization: authorization,
      recipe: { ...namedRecipe, runtimeUrlPatternSources: ["/noise"] }, allowCanonicalAcceptDiscovery: true,
      actionSearchTimeoutMs: 3_000, resultBudgetMs: 5_000, confirmationTimeoutMs: 150, observationWindowMs: 300,
      productionProjectable: true,
    });
    assert.equal(count(), 1, JSON.stringify(packet.resolver));
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.ok(packet.timing.totalMs < 5_000);
    assert.ok(packet.timing.observationMs >= 300, "confirmed capture completes its configured observation window");
  });
});

for (const action of ["accept", "reject"] as const) {
  for (const decision of [true, false]) {
    test(`${action}: empty cookie and web-storage names retain exact evidence (decision verified: ${decision})`, async () => {
      await fixture(action, { decision, emptyNames: true }, async (url, count) => {
        const packet = await observe(action, url);
        assert.equal(count(), 1);
        assert.ok(packet.artifactVersion.endsWith(".v2"));
        assert.equal(packet.productionProjectable, decision);
        assert.equal(packet.decisionEvidence?.decision, decision ? action === "accept" ? "granted" : "denied" : "unknown");
        for (const snapshot of [packet.storage.preAction, packet.storage.postAction]) {
          const unnamed = snapshot.filter((item) => item.name === "");
          assert.deepEqual(unnamed.map((item) => item.storageType).sort(), ["cookie", "local_storage", "session_storage"]);
          assert.equal(new Set(unnamed.map((item) => item.identityHash)).size, 3);
          for (const item of unnamed) {
            assert.match(item.identityHash!, /^[a-f0-9]{64}$/);
            assert.match(item.valueHash, /^[a-f0-9]{64}$/);
            assert.equal(item.hostname, "127.0.0.1");
          }
        }
        assert.equal(packet.observations.length, 0, "unnamed storage does not imply a consent failure or tracking");
        assert.equal(JSON.stringify(packet).includes("private-cookie-value"), false);
        assert.equal(JSON.stringify(packet).includes("private-local-value"), false);
        assert.equal(JSON.stringify(packet).includes("private-session-value"), false);
        const schema = action === "accept" ? postAcceptEvidencePacketSchema : postRefusalEvidencePacketSchema;
        assert.equal(schema.safeParse(packet).success, true);
        assert.equal(schema.safeParse({ ...packet, artifactVersion: packet.artifactVersion.replace(".v2", ".v1") }).success, false);
        const projection = "acceptanceRegistration" in packet
          ? projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) })
          : projectPostRefusalEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
        assert.equal(projection.packetSha256, "a".repeat(64));
        if (!decision) {
          assert.equal(projection.afterActionStorage?.filter((item) => item.name === "").length, 3);
          assert.equal(projection.registrationStatus, "unconfirmed");
        }
      });
    });
  }

  test(`${action}: finalization validation errors are handled before asynchronous browser cleanup`, async (t) => {
    await fixture(action, { decision: true }, async (url) => {
      const browser = await chromium.launch({ headless: true });
      const newContext = browser.newContext.bind(browser);
      let closed = false;
      t.mock.method(browser, "newContext", async (...args: Parameters<Browser["newContext"]>) => {
        const context = await newContext(...args);
        const close = context.close.bind(context);
        t.mock.method(context, "close", async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await close();
          closed = true;
        });
        return context;
      });
      const failure = new Error("fixture evidence validation failure");
      const schema = action === "accept" ? postAcceptEvidencePacketSchema : postRefusalEvidencePacketSchema;
      t.mock.method(schema, "parse", () => { throw failure; });
      try {
        await assert.rejects(observe(action, url, { browser }), (error) => error === failure);
        assert.equal(closed, true);
        assert.equal(browser.contexts().length, 0);
        assert.equal(browser.isConnected(), true, "supplied browser remains caller-owned");
      } finally { await browser.close(); }
    });
  });

  test(`${action}: an unknown decision retains delayed after-click requests and storage through projection`, async () => {
    await fixture(action, { after: "setTimeout(()=>{ localStorage.setItem('custom_state','private-receipt'); fetch('/late'); }, 450);" }, async (url, count) => {
      const packet = await observe(action, url, { generic: true, observationWindowMs: 800, confirmationTimeoutMs: 75 });
      assert.equal(count(), 1);
      assert.equal(packet.decisionEvidence?.decision, "unknown");
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.observations.length, 0);
      assert.equal(packet.afterActionCapture?.activationStatus, "completed");
      assert.equal(packet.afterActionCapture?.stopReason, "window_elapsed");
      assert.ok(packet.afterActionCapture!.captureEndedAtMs - packet.afterActionCapture!.actionDispatchedAtMs >= 800);
      const late = packet.network.requests.find((row) => row.sanitizedUrl.endsWith("/late"));
      assert.ok(late && packet.afterActionCapture!.requestIds.includes(late.requestId));
      const projection = "acceptanceRegistration" in packet
        ? projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) })
        : projectPostRefusalEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
      assert.equal(projection.registrationStatus, "unconfirmed");
      assert.equal(projection.packetSha256, "a".repeat(64));
      assert.ok(projection.afterActionRequests?.some((row) => row.requestId === late.requestId));
      assert.ok(projection.afterActionStorage?.some((row) => row.name === "custom_state"));
      assert.ok(projection.afterActionCapture?.storageWrites.some((row) => row.name === "custom_state"));
      assert.equal(JSON.stringify(projection).includes("private-receipt"), false);
      assert.equal(JSON.stringify(projection.afterActionRequests).includes("msOffsetFromRefusal"), false);
      const schema = "acceptanceRegistration" in packet ? postAcceptEvidencePacketSchema : postRefusalEvidencePacketSchema;
      assert.equal(schema.safeParse({ ...packet, afterActionCapture: { ...packet.afterActionCapture, requestIds: ["invented"] } }).success, false);
      assert.equal(schema.safeParse({ ...packet, actionControlProof: undefined }).success, false);
    });
  });

  test(`${action}: after-click navigation stops unverified capture at the exact-target boundary`, async () => {
    await fixture(action, { after: "setTimeout(()=>history.replaceState(null,'','/outside-authorization'),200);" }, async (url, count) => {
      const packet = await observe(action, url, { generic: true, observationWindowMs: 2000, confirmationTimeoutMs: 75 });
      assert.equal(count(), 1);
      assert.equal(packet.afterActionCapture?.stopReason, "target_changed");
      assert.equal(packet.afterActionCapture?.storageSnapshotRetained, false);
      assert.ok(packet.afterActionCapture!.captureEndedAtMs - packet.afterActionCapture!.actionDispatchedAtMs < 1500);
      assert.equal(packet.productionProjectable, false);
    });
  });

  test(`${action}: cancellation bounds an unverified after-click window`, async () => {
    await fixture(action, {}, async (url, count) => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const packet = await observe(action, url, { generic: true, observationWindowMs: 4000, confirmationTimeoutMs: 75,
          signal: controller.signal, onLifecycleEvent: () => { timer = setTimeout(() => controller.abort(), 250); } });
        assert.equal(count(), 1);
        assert.equal(packet.afterActionCapture?.stopReason, "aborted");
        assert.ok(packet.afterActionCapture!.captureEndedAtMs - packet.afterActionCapture!.actionDispatchedAtMs < 2500);
        assert.equal(packet.afterActionCapture?.storageSnapshotRetained, false);
        assert.equal(packet.productionProjectable, false);
      } finally { clearTimeout(timer); }
    });
  });
  test(`${action}: final dispatch guard respects a cancellation from the lifecycle callback`, async () => {
    await fixture(action, { decision: true }, async (url, count) => {
      const controller = new AbortController();
      const packet = await observe(action, url, { signal: controller.signal, onLifecycleEvent: () => controller.abort() });
      assert.equal(count(), 0);
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.observations.length, 0);
    });
  });

  test(`${action}: deleting a non-essential cookie is not retained as active storage use`, async () => {
    await fixture(action, { decision: true, initialCookie: "_ga=prior; Path=/", after: "document.cookie='_ga=deleted; Max-Age=0; Path=/';" }, async (url) => {
      const packet = await observe(action, url);
      assert.equal(packet.productionProjectable, true);
      const writes = "writesAfterAccept" in packet.storage ? packet.storage.writesAfterAccept : packet.storage.writesAfterRefusal;
      assert.equal(writes.some((write) => write.name === "_ga"), false);
      assert.equal(packet.observations.length, 0);
    });
  });
  test(`${action}: UI-only disappearance cannot register a decision`, async () => {
    await fixture(action, {}, async (url, count) => {
      const packet = await observe(action, url, { generic: true });
      assert.equal(count(), 1);
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.decisionEvidence?.decision, "unknown");
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(packet.observations.length, 0);
    });
  });

  test(`${action}: receipt-ID changes do not reverse the retained category decision`, async () => {
    const flag = action === "accept" ? "no" : "yes";
    await fixture(action, { cookie: `cookieyes-consent=consentid:new,necessary:yes,analytics:${flag},advertisement:${flag}; Path=/` }, async (url, count) => {
      const packet = await observe(action, url, { cookieYes: true });
      assert.equal(count(), 1);
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.decisionEvidence?.decision, action === "accept" ? "denied" : "granted");
      assert.equal(packet.observations.length, 0);
    });
  });

  for (const fault of ["abort", "target", "duplicate", "label"] as const) {
    test(`${action}: ${fault} after the trial cannot reach a real click`, async () => {
      await fixture(action, { decision: true }, async (url, count) => {
        const browser = await chromium.launch({ headless: true });
        const controller = new AbortController();
        const seed = await browser.newPage();
        const prototype = Object.getPrototypeOf(seed.locator("button")) as { click: Locator["click"] };
        const original = prototype.click;
        let injected = false;
        prototype.click = async function(this: Locator, options) {
          const result = await original.call(this, options);
          if (options?.trial && !injected) {
            injected = true;
            if (fault === "abort") controller.abort();
            else await this.page().evaluate((fault) => {
              if (fault === "target") history.replaceState(null, "", "/not-authorized");
              if (fault === "duplicate") document.getElementById("choice")!.after(document.getElementById("choice")!.cloneNode(true));
              if (fault === "label") document.getElementById("choice")!.textContent = "Continue to payment";
            }, fault);
          }
          return result;
        };
        try {
          const packet = await observe(action, url, { browser, signal: controller.signal });
          assert.equal(injected, true);
          assert.equal(count(), 0);
          assert.equal(packet.productionProjectable, false);
          assert.equal(packet.cancellation.outcome, fault === "abort" ? "aborted_before_action" : "not_requested");
          assert.equal(packet.interactionDiagnostics?.click.outcome, "not_attempted");
        } finally { prototype.click = original; await browser.close(); }
      });
    });
  }

  test(`${action}: a synchronous post-decision request retains a state-write anchor`, async () => {
    await fixture(action, { decision: true }, async (url) => {
      const packet = await observe(action, url);
      assert.equal(packet.productionProjectable, true);
      assert.equal(packet.decisionEvidence?.timestampBasis, "instrumented_state_write");
      const request = packet.network.requests.find((row) => row.sanitizedUrl.endsWith("/clicked"));
      assert.ok(request);
      assert.ok(request.startedAtMs >= packet.decisionEvidence!.observedAtMs!);
      assert.equal("inFlightAtAcceptanceRegistration" in request ? request.inFlightAtAcceptanceRegistration : request.inFlightAtRefusalRegistration, false);
      assert.equal(JSON.stringify(packet).includes('"value":"granted"'), false);
    });
  });
}

test("Accept pre-action floods cannot displace post-action requests", async () => {
  await fixture("accept", { decision: true, flood: 110, after: "setTimeout(()=>fetch('/after-consent'),80);" }, async (url) => {
    const packet = await observe("accept", url);
    assert.equal(packet.productionProjectable, true);
    assert.ok(packet.network.requests.some((row) => row.sanitizedUrl.endsWith("/after-consent")));
    assert.ok(packet.network.requests.length <= 96);
    assert.ok(packet.captureCoverage!.requestsDroppedBeforeAction > 0);
    assert.equal(packet.captureCoverage!.requestsDroppedAfterAction, 0);
  });
});

test("A post-action capture overflow is retained as limited coverage", async () => {
  await fixture("accept", { decision: true, after: "for(let i=0;i<110;i++)fetch('/post-noise?i='+i);" }, async (url) => {
    const packet = await observe("accept", url);
    assert.equal(packet.productionProjectable, false);
    assert.ok(packet.captureCoverage!.requestsDroppedAfterAction > 0);
    assert.ok(packet.limitations.includes("post_action_network_capture_truncated"));
  });
});
