import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {runPostRefusalObserver} from "./post-refusal-observer";

for (const variant of ["target_denied", "parent_denied_target_granted", "stale_target_denied", "disabled_gate"] as const) {
  test(`Reject storage confirmation stays in the clicked frame: ${variant}`, async () => {
    let clicks = 0;
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      if (req.url === "/click") {clicks++;res.end("ok");return;}
      if (req.url === "/frame") {
        res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional analytics cookies.</p>
          <button type="button" id="reject">Reject all</button></section><script>
          ${variant === "stale_target_denied" ? "localStorage.setItem('consent','denied');" : ""}
          document.querySelector('button').onclick=()=>{
            ${variant === "target_denied" || variant === "disabled_gate" ? "localStorage.setItem('consent','denied');" : ""}
            ${variant === "parent_denied_target_granted" ? "localStorage.setItem('consent','granted');parent.postMessage('write-parent-denied','*');" : ""}
            fetch('/click');
          };</script>`);
      } else {
        res.end(`<script>addEventListener('message',e=>{if(e.data==='write-parent-denied')localStorage.setItem('consent','denied')})</script><iframe src="/frame"></iframe>`);
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
      const packet = await runPostRefusalObserver({scanId: `frame-${variant}`, url: `${url}/`, boundControlDispatch: variant !== "disabled_gate",
        actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 100, observationWindowMs: 150,
        interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
        recipe: {artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "frame-storage-fixture-v1",
          resolverMethod: "local_fixture_recipe", controlSelector: "#reject", bannerSelector: "#banner", controlFrameUrl: `${url}/frame`,
          confirmation: {kind: "local_storage_equals", key: "consent", expectedValue: "denied"}}});
      assert.equal(clicks, 1);
      assert.equal(packet.refusalRegistration.status === "confirmed", variant === "target_denied");
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
  });
}
