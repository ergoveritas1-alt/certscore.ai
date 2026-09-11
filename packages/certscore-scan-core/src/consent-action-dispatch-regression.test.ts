import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { runPostAcceptObserver, type PostAcceptActionRecipe } from "./post-accept-observer.js";
import { runPostRefusalObserver, type PostRefusalActionRecipe } from "./post-refusal-observer.js";

for (const action of ["accept", "reject"] as const) {
  for (const variant of ["aliases", "distinct", "conflicting", "nested", "heading_tab", "frame", "duplicate_frame", "unrelated_frames", "text_scope", "text_scope_distinct", "label_only", "article_scope", "hidden_scope", "text_frame"] as const) {
    test(`${action}: ${variant} resolves only one proven action without promoting opaque consent`, async () => {
      let clicks = 0;
      const label = action === "accept" ? "Accept all" : "Reject all";
      const server = createServer((request, response) => {
        if (request.url === "/click") { clicks += 1; response.writeHead(204).end(); return; }
        response.setHeader("content-type", "text/html");
        if (request.url === "/frame") {
          response.end(`${variant === "text_frame" ? '<section class="message-component message-row"><p>We use optional cookies and similar technologies to personalize advertising. Choose your cookie preferences.</p>' : ""}<button id="choice" class="action">${label}</button><script>document.querySelector('button').onclick=()=>fetch('/click')</script>${variant === "text_frame" ? '</section>' : ''}`);
          return;
        }
        if (variant === "frame" || variant === "duplicate_frame" || variant === "text_frame") {
          response.end(`<iframe src="/frame"></iframe>${variant === "duplicate_frame" ? '<iframe src="/frame"></iframe>' : ''}`);
          return;
        }
        const textScope = ["text_scope", "text_scope_distinct", "label_only", "article_scope", "hidden_scope", "text_frame"].includes(variant);
        const wrapper = variant === "article_scope" ? "article" : "section";
        response.end(`<!doctype html><html><body><${wrapper} ${textScope ? `class="message-component message-row" ${variant === "hidden_scope" ? 'aria-hidden="true"' : ''}` : 'class="cookie-banner" role="dialog" aria-label="Cookie consent"'}>
          ${variant === "heading_tab" ? `<h1>${label}</h1><button role="tab">Consent</button>` : ""}
          ${variant === "label_only" ? "" : "<p>We use optional cookies and similar technologies to personalize advertising. Choose your cookie preferences.</p>"}
          <div><div><button id="choice" class="action">${label}</button>${["distinct", "text_scope_distinct"].includes(variant) ? `<button id="other">${label}</button>` : ""}</div></div>
          </${wrapper}>${variant === "unrelated_frames" ? '<iframe srcdoc=""></iframe><iframe srcdoc=""></iframe>' : ''}<script>document.querySelectorAll('button').forEach(b => b.onclick = () => { fetch('/click'); document.querySelector('section,article').hidden = true; });</script></body></html>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/`;
      const common = { recipeId: "fixture-v1", resolverMethod: "local_fixture_recipe" as const,
        controlSelector: ["nested", "heading_tab", "text_scope", "text_scope_distinct", "label_only", "article_scope", "hidden_scope", "text_frame"].includes(variant) ? "#absent" : "#choice", bannerSelector: ".cookie-banner",
        confirmation: { kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied" } };
      const alias = { ...common, recipeId: "alias-v1", controlSelector: variant === "distinct" ? "#other" : common.controlSelector === "#absent" ? "#also-absent" : ".action",
        ...(variant === "conflicting" ? { confirmation: { ...common.confirmation, key: "other-consent" } } : {}) };
      const input = { recipeSetId: "dispatch-regression-v1", scanId: `${action}-${variant}`, url, actionSearchTimeoutMs: 1600, confirmationTimeoutMs: 50,
        observationWindowMs: 50, interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const } };
      try {
        const packet = action === "accept"
          ? await runPostAcceptObserver({ ...input, allowCanonicalAcceptDiscovery: ["nested", "heading_tab", "text_scope", "text_scope_distinct", "label_only", "article_scope", "hidden_scope", "text_frame"].includes(variant),
            recipe: { ...common, artifactVersion: "certscore.post_accept_action_recipe.v1" },
            recipeCandidates: [common, alias].map(r => ({ ...r, artifactVersion: "certscore.post_accept_action_recipe.v1" })) as PostAcceptActionRecipe[] })
          : await runPostRefusalObserver({ ...input, allowCanonicalRejectDiscovery: ["nested", "heading_tab", "text_scope", "text_scope_distinct", "label_only", "article_scope", "hidden_scope", "text_frame"].includes(variant),
            recipe: { ...common, artifactVersion: "certscore.post_refusal_action_recipe.v1" },
            recipeCandidates: [common, alias].map(r => ({ ...r, artifactVersion: "certscore.post_refusal_action_recipe.v1" })) as PostRefusalActionRecipe[] });
        const expectedClick = variant === "aliases" || ["nested", "heading_tab", "frame", "unrelated_frames", "text_scope", "text_frame"].includes(variant);
        assert.equal(clicks, expectedClick ? 1 : 0, JSON.stringify({ resolver: packet.resolver, limitations: packet.limitations }));
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        assert.notEqual(registration.status, "confirmed");
        if (expectedClick) assert.ok(packet.actionControlProof);
      } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    });
  }
}
