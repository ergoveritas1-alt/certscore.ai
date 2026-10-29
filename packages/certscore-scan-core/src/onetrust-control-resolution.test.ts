import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium, type Frame } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";

for (const action of ["accept", "reject"] as const) {
  for (const mode of ["slow_frame", "covered", "delayed"] as const) {
    test(`OneTrust ${action}: ${mode} preserves bounded resolution and truthful diagnostics`, async () => {
      let clicks = 0;
      const server = createServer((request, response) => {
        if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
        response.setHeader("content-type", "text/html");
        if (request.url === "/frame") { response.end("<!doctype html><p>Unrelated frame</p>"); return; }
        response.end(`<!doctype html><style>
          #onetrust-banner-sdk{position:fixed;top:10px;left:10px;padding:20px;background:white;z-index:10}
          button{padding:15px} #cover{position:fixed;inset:0;background:white;z-index:20}
          </style><section id="onetrust-banner-sdk" ${mode === "delayed" ? "hidden" : ""}>
          <p>Choose optional analytics cookies</p><button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button></section>
          ${mode === "covered" ? '<div id="cover">Overlay</div>' : ""}
          ${mode === "slow_frame" ? '<iframe src="/frame"></iframe>' : ""}
          <script>
          window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
          document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
          document.querySelector('button').onclick=()=>{fetch('/click');document.cookie='OptanonConsent=groups=C0001:1,C0002:${action === "accept" ? 1 : 0}&receipt=after;path=/';document.querySelector('section').hidden=true;};
          ${mode === "delayed" ? "setTimeout(()=>document.querySelector('section').hidden=false,150);" : ""}
          </script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const browser = await chromium.launch({ headless: true });
      if (mode === "slow_frame") {
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async options => {
          const context = await newContext(options), newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            const patch = (scope: Frame) => {
              const locator = scope.locator.bind(scope);
              scope.locator = (...args: Parameters<typeof locator>) => {
                const result = locator(...args), count = result.count.bind(result);
                result.count = async () => { await new Promise(resolve => setTimeout(resolve, 350)); return count(); };
                return result;
              };
            };
            page.on("frameattached", patch);
            return page;
          };
          return context;
        };
      }
      try {
        const common = { browser, url: `http://127.0.0.1:${address.port}/`, scanId: `onetrust-${action}-${mode}`,
          interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" } as const,
          actionSearchTimeoutMs: mode === "delayed" ? 2000 : 250, confirmationTimeoutMs: 150, observationWindowMs: 100 };
        const packet = action === "accept"
          ? await runPostAcceptObserver({ ...common, recipe: buildCanonicalPostAcceptActionRecipes().find(row => row.cmpId === "OneTrust")! })
          : await runPostRefusalObserver({ ...common, recipe: buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "OneTrust")! });
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        assert.equal(clicks, mode === "delayed" ? 1 : 0, JSON.stringify(packet.interactionDiagnostics));
        if (mode === "delayed") assert.equal(registration.status, "confirmed");
        else {
          assert.notEqual(registration.status, "confirmed");
          const state = mode === "slow_frame" ? "binding_budget_exhausted" : "control_not_hit_target";
          const diagnostic = packet.interactionDiagnostics?.resolver?.snapshots.find(row => row.state === state);
          assert.ok(diagnostic, JSON.stringify(packet.interactionDiagnostics));
          assert.equal(diagnostic.actionableCount, 0);
          assert.ok(diagnostic.cmpIds.includes("OneTrust"));
          assert.equal(packet.decisionEvidence?.decision, "unknown");
          assert.equal(packet.decisionEvidence?.basis, "unverified");
        }
      } finally {
        await browser.close(); server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }
}

for (const action of ["accept", "reject"] as const) {
 for (const mode of ["visible", "covered", "duplicate"] as const) {
  test(`OneTrust ${action}: runtime-bound named ${mode} control preserves verification before busy geometry`, async () => {
    let clicks = 0, geometryReads = 0;
    const server = createServer((request, response) => {
      if (request.url === "/otSDKStub.js") { response.setHeader("content-type", "application/javascript"); response.end(""); return; }
      if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><script src="/otSDKStub.js"></script><section id="onetrust-banner-sdk" style="position:fixed;top:10px;padding:20px;background:white">
        <p>Choose optional analytics cookies</p>${Array.from({length: mode === 'duplicate' ? 2 : 1}, () => `<button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button>`).join('')}</section>${mode === 'covered' ? '<div style="position:fixed;inset:0;background:white;z-index:9999">Overlay</div>' : ''}
        <script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
        document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
        document.querySelector('button').onclick=()=>{fetch('/click');document.cookie='OptanonConsent=groups=C0001:1,C0002:${action === "accept" ? 1 : 0}&receipt=after;path=/';document.querySelector('section').hidden=true;};</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const browser = await chromium.launch({headless:true}), newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext(options), newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage(), frame = page.mainFrame(), evaluate = frame.evaluate.bind(frame);
        frame.evaluate = (async (...args: Parameters<typeof evaluate>) => {
          if (String(args[0]).includes("registrySelectors")) {
            geometryReads++;
            await new Promise(resolve => setTimeout(resolve, 900));
          }
          return evaluate(...args);
        }) as typeof frame.evaluate;
        return page;
      };
      return context;
    };
    try {
      const common = {browser,url:`http://127.0.0.1:${address.port}/`,scanId:`onetrust-runtime-first-${action}`,
        interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"} as const,
        actionSearchTimeoutMs:600,confirmationTimeoutMs:200,observationWindowMs:100};
      const accept = buildCanonicalPostAcceptActionRecipes(), reject = buildCanonicalPostRefusalActionRecipes();
      const packet = action === "accept"
        ? await runPostAcceptObserver({...common,recipe:accept[0]!,recipeCandidates:accept,allowCanonicalAcceptDiscovery:true})
        : await runPostRefusalObserver({...common,recipe:reject[0]!,recipeCandidates:reject,recipeSetId:"one-trust-runtime-first",allowCanonicalRejectDiscovery:true});
      assert.equal(clicks,mode === "visible" ? 1 : 0,JSON.stringify(packet.interactionDiagnostics));
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      if (mode === "visible") {
        assert.equal(geometryReads,0,"A live unique registered control needs no broad geometry read");
        assert.equal(packet.resolver.cmpId,"OneTrust");
        assert.equal(registration.status,"confirmed");
      } else {
        assert.notEqual(registration.status,"confirmed");
        assert.equal(packet.decisionEvidence?.decision,"unknown");
      }
    } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
}
