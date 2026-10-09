import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

// Exercise recognition, dispatch and semantic registration separately, in fresh
// loopback sessions. A clicked banner disappearing is deliberately insufficient.
for (const scenario of ["late", "rerender", "same_url_reload", "opaque_receipt", "opposite_receipt"] as const) {
  test(`full action chain: ${scenario} preserves independent Accept and Reject decisions`, async () => {
    const clicks: string[] = [];
    const entryCookies: string[] = [];
    const markup = `<section id="CybotCookiebotDialog" role="dialog" aria-label="Evästeet">
      <p>Käytämme evästeitä. Valitse evästeasetukset.</p>
      <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Salli kaikki</button>
      <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll">Kiellä kaikki</button>
      </section>`;
    const server = createServer((request, response) => {
      if (request.url?.startsWith("/clicked/")) {
        clicks.push(request.url.slice("/clicked/".length)); response.writeHead(204).end(); return;
      }
      if (request.url !== "/") { response.writeHead(404).end(); return; }
      entryCookies.push(request.headers.cookie ?? "");
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="fi"><body><h1>Local consent fixture</h1><script>
        function mount() {
          document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(markup)});
          ${scenario === "rerender" ? "for (const button of document.querySelectorAll('button')) button.textContent='OK';" : ""}
          for (const [id, action] of [['CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll','accept'],['CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll','reject']]) {
            document.getElementById(id).onclick = () => {
              const granted = ${scenario === "opposite_receipt" ? "action !== 'accept'" : "action === 'accept'"};
              const receipt = ${scenario === "opaque_receipt" ? "action + '-saved'" : "JSON.stringify({necessary:true,preferences:granted,statistics:granted,marketing:granted})"};
              document.cookie='CookieConsent='+encodeURIComponent(receipt)+'; Path=/; SameSite=Lax';
              fetch('/clicked/'+action); document.getElementById('CybotCookiebotDialog').remove();
            };
          }
          ${scenario === "rerender" ? `setTimeout(() => {
            for (const [id,label] of [['CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll','Salli kaikki'],['CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll','Kiellä kaikki']]) {
              const old=document.getElementById(id), replacement=old.cloneNode(true);
              replacement.textContent=label; replacement.onclick=old.onclick; old.replaceWith(replacement);
            }
          },700);` : ""}
        }
        ${scenario === "same_url_reload" ? `if (!sessionStorage.getItem('reloaded')) {
          sessionStorage.setItem('reloaded','1'); setTimeout(() => location.reload(), 150);
        } else { mount(); }` : scenario === "late" ? "setTimeout(mount,700);" : "mount();"}
      </script></body></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const common = { url: `http://127.0.0.1:${address.port}/`,
      interactionAuthorization: { kind: "loopback" as const, authorizationId: "loopback_local_lab" },
      actionSearchTimeoutMs: 2500, confirmationTimeoutMs: 400, observationWindowMs: 100,
      productionProjectable: true };
    try {
      const accepts = buildCanonicalPostAcceptActionRecipes(), rejects = buildCanonicalPostRefusalActionRecipes();
      const accept = await runPostAcceptObserver({ ...common, scanId: `chain-${scenario}-accept`,
        recipe: accepts[0]!, recipeCandidates: accepts, allowCanonicalAcceptDiscovery: true });
      const reject = await runPostRefusalObserver({ ...common, scanId: `chain-${scenario}-reject`,
        recipe: rejects[0]!, recipeCandidates: rejects, allowCanonicalRejectDiscovery: true,
        recipeSetId: "full-registry-fixture" });
      assert.deepEqual(clicks, ["accept", "reject"], "exactly one correct action per isolated session");
      assert.ok(entryCookies.every(cookie => !cookie.includes("CookieConsent")), "no consent reused across lanes");
      const confirms = scenario !== "opaque_receipt" && scenario !== "opposite_receipt";
      assert.equal(accept.actionControlProof?.classifierIntent, "accept");
      assert.equal(reject.actionControlProof?.classifierIntent, "reject");
      assert.equal(accept.actionControlProof?.matchedLocale, "fi");
      assert.equal(reject.actionControlProof?.matchedLocale, "fi");
      assert.equal(accept.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(reject.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(accept.acceptanceRegistration.status, confirms ? "confirmed" : "unconfirmed");
      assert.equal(reject.refusalRegistration.status, confirms ? "confirmed" : "unconfirmed");
      if (!confirms) {
        assert.equal(accept.productionProjectable, false);
        assert.equal(reject.productionProjectable, false);
        assert.deepEqual(reject.observations, [], "an unreadable or opposite receipt cannot produce refusal findings");
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
