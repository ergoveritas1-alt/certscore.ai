import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {runPostRefusalObserver} from "./post-refusal-observer";

for (const kind of ["tcf_purposes_denied_or_cmp_storage_changed", "tcf_purposes_denied_or_cmp_storage_keys_changed"] as const)
for (const storageType of ["local_storage", "session_storage"] as const)
for (const crossOrigin of [false, true])
for (const variant of ["fresh_denied", "parent_denied_target_granted", "stale_denied"] as const) {
  test(`bound Reject storage branch: ${kind}/${storageType}/${crossOrigin ? "cross-origin" : "same-origin"}/${variant}`, async () => {
    const storage = storageType === "local_storage" ? "localStorage" : "sessionStorage";
    const key = "registered-consent-receipt";let clicks = 0, port = 0;
    const server = createServer((req, res) => {
      if (req.url === "/clicked") {clicks++;res.end("ok");return;}
      res.setHeader("content-type", "text/html");
      if (req.url === "/frame") res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies.</p>
        <button id="choice" type="button">Reject all</button></section><script>
        ${variant === "stale_denied" ? `${storage}.setItem('${key}','denied');` : ""}
        document.querySelector('button').onclick=()=>{
          ${variant === "fresh_denied" ? `${storage}.setItem('${key}','denied');` : ""}
          ${variant === "parent_denied_target_granted" ? `${storage}.setItem('${key}','granted');parent.postMessage('deny-parent','*');` : ""}
          fetch('/clicked');
        };</script>`);
      else res.end(`<script>addEventListener('message',e=>{if(e.data==='deny-parent')${storage}.setItem('${key}','denied')})</script>
        <iframe src="http://${crossOrigin ? "localhost" : "127.0.0.1"}:${port}/frame"></iframe>`);
    });
    await new Promise<void>((resolve,reject) => {server.once("error",reject);server.listen(0,resolve);});
    port = (server.address() as {port: number}).port;
    try {
      const url = `http://127.0.0.1:${port}/`;
      const confirmation = kind === "tcf_purposes_denied_or_cmp_storage_changed"
        ? {kind, storageType, key} : {kind, storageType, keys: [key]};
      const packet = await runPostRefusalObserver({scanId: `storage-branch-${kind}-${storageType}-${crossOrigin}-${variant}`,
        url, boundControlDispatch: true, actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 150, observationWindowMs: 200,
        interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
        recipe: {artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "registered-frame-storage-fixture-v1",
          resolverMethod: "local_fixture_recipe", controlSelector: "#choice", bannerSelector: "#banner",
          controlFrameUrl: `http://${crossOrigin ? "localhost" : "127.0.0.1"}:${port}/frame`, confirmation}});
      assert.equal(clicks, 1);
      assert.equal(packet.refusalRegistration.status === "confirmed", variant === "fresh_denied");
      if (variant === "fresh_denied") assert.ok(packet.refusalRegistration.witnesses.some(w => w.witnessType === "cmp_storage_state"));
    } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
  });
}
