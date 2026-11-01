import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: a same-document fragment update preserves the verified choice`, async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "text/html");res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies.</p>
        <button type="button" id="choice">${action === "accept" ? "Accept all" : "Reject all"}</button></section><script>
        document.querySelector('button').onclick=()=>{localStorage.setItem('consent','${action === "accept" ? "granted" : "denied"}');location.hash='choice';};</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const recipe = {recipeId: "same-document-fixture-v1", resolverMethod: "local_fixture_recipe" as const,
        controlSelector: "#choice", bannerSelector: "#banner",
        confirmation: {kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied"}};
      const input = {scanId: `same-document-${action}`, url: `http://127.0.0.1:${(server.address() as {port: number}).port}/`, boundControlDispatch: true,
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 200, observationWindowMs: 250,
        interactionAuthorization: {kind: "loopback" as const, authorizationId: "loopback_local_lab"}};
      const packet = action === "accept"
        ? await runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
        : await runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.equal(registration.status, "confirmed");
      assert.equal(packet.cancellation.requested, false);
    } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
  });
  test(`${action}: a same-URL frame reload cannot supply a new document's decision`, async () => {
    let clicks = 0;
    const expected = action === "accept" ? "granted" : "denied";
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      if (req.url === "/click") {clicks++;res.end("ok");return;}
      res.end(req.url === "/frame" ? `<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies.</p>
        <button type="button" id="choice">${action === "accept" ? "Accept all" : "Reject all"}</button></section><script>
        ${clicks ? `localStorage.setItem('consent','${expected}');` : ""}
        document.querySelector('button').onclick=async()=>{await fetch('/click');location.reload()};</script>`
        : '<iframe src="/frame"></iframe>');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
      const recipe = {recipeId: "document-bound-fixture-v1", resolverMethod: "local_fixture_recipe" as const,
        controlSelector: "#choice", bannerSelector: "#banner", controlFrameUrl: `${base}/frame`,
        confirmation: {kind: "local_storage_equals" as const, key: "consent", expectedValue: expected}};
      const input = {scanId: `frame-document-${action}`, url: `${base}/`, boundControlDispatch: true,
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 700, observationWindowMs: 800,
        interactionAuthorization: {kind: "loopback" as const, authorizationId: "loopback_local_lab"}};
      const packet = action === "accept"
        ? await runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
        : await runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
      assert.equal(clicks, 1);
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.notEqual(registration.status, "confirmed");
      assert.equal(packet.cancellation.requested, true);
    } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
  });
}
