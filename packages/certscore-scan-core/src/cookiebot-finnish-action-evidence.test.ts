import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

// Reproduce Aalto's Finnish first layer without contacting a public site.
// A fresh receipt must confirm exactly one action; an invisible banner must
// never become actionable solely because its buttons retain layout boxes.
for (const invisible of [false, true]) {
  test(`Finnish Cookiebot full registry ${invisible ? "withholds invisible controls" : "confirms both choices"}`, async () => {
    let clicks = 0;
    const server = createServer((request, response) => {
      if (request.url === "/action") { clicks++; response.writeHead(204).end(); return; }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="fi"><body>
        <section id="CybotCookiebotDialog" role="dialog" aria-label="Evästeet" style="opacity:${invisible ? 0 : 1}">
          <p>Käytämme evästeitä. Valitse evästeasetukset.</p>
          <button type="button" id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Salli kaikki</button>
          <button type="button" id="CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll">Kiellä kaikki</button>
        </section><script>
        for (const [id, granted] of [['CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',true],['CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',false]]) {
          document.getElementById(id).onclick=()=>{
            document.cookie='CookieConsent='+encodeURIComponent(JSON.stringify({necessary:true,preferences:granted,statistics:granted,marketing:granted}))+'; Path=/; SameSite=Lax';
            fetch('/action'); document.getElementById('CybotCookiebotDialog').remove();
          };
        }
        </script></body></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const common = { url: `http://127.0.0.1:${address.port}/`,
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const },
      actionSearchTimeoutMs: 500, confirmationTimeoutMs: 500, observationWindowMs: 50 };
    try {
      const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
      const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
      const accept = await runPostAcceptObserver({ ...common, scanId: "finnish-cookiebot-accept", recipe: acceptRecipes[0]!,
        recipeCandidates: acceptRecipes, allowCanonicalAcceptDiscovery: true });
      const reject = await runPostRefusalObserver({ ...common, scanId: "finnish-cookiebot-reject", recipe: rejectRecipes[0]!,
        recipeCandidates: rejectRecipes, allowCanonicalRejectDiscovery: true, recipeSetId: "full-registry-fixture" });
      assert.equal(accept.acceptanceRegistration.status, invisible ? "not_attempted" : "confirmed");
      assert.equal(reject.refusalRegistration.status, invisible ? "not_attempted" : "confirmed");
      assert.equal(clicks, invisible ? 0 : 2);
      if (!invisible) {
        assert.equal(accept.actionControlProof?.matchedLocale, "fi");
        assert.equal(reject.actionControlProof?.matchedLocale, "fi");
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
