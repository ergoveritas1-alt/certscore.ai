import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { consentActionControlProofSchema } from "@certscore/contracts";
import { buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

test("action proof uses the discovery language profile for labels, conflicts and uniqueness", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const cases = [
      { html: '<button>Akkoord</button>', action: "accept", verified: true },
      { html: '<button>Weigeren</button>', action: "reject", verified: true },
      { html: '<button value="all_optional_categories">Akkoord</button>', action: "accept", verified: true },
      { html: '<button aria-label="Akkoord" title="Accept all" value="accept_payload">Akkoord</button>', action: "accept", verified: true },
      { html: '<button aria-label="Cookie choice">Akkoord</button>', action: "accept", verified: false },
      { html: '<button aria-label="Accept all">Weigeren</button>', action: "accept", verified: false },
      { html: '<button>Akkoord</button><button>Accept all</button>', action: "accept", verified: false },
      { html: '<button>OK</button>', action: "accept", verified: false },
      { html: '<button>Do not sell or share my personal information</button>', action: "reject", verified: false },
      { html: '<section inert><button>Akkoord</button></section>', action: "accept", verified: false },
      { html: '<section style="opacity:0"><button>Akkoord</button></section>', action: "accept", verified: false },
    ] as const;
    for (const fixture of cases) {
      await page.setContent(fixture.html);
      const result = await buildConsentActionControlProof({ action: fixture.action,
        control: page.locator("button").first(), page, observedAtMs: 1,
        recipeId: "fixture:multilingual", selectorHint: "button" });
      assert.equal(result.status === "verified", fixture.verified, JSON.stringify({ fixture, result }));
      if (result.status === "verified") {
        assert.equal(result.proof.matchedLocale, "nl");
        assert.equal(result.proof.actionSemantics, "direct_label");
        assert.equal(consentActionControlProofSchema.safeParse(result.proof).success, true);
      }
    }
  } finally { await browser.close(); }
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: Dutch discovery reaches one click and retains unconfirmed after-click facts`, async () => {
    let clicks = 0;
    const server = createServer((request, response) => {
      if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
      response.setHeader("content-type", "text/html");
      response.end(`<section class="cookie-banner"><p>We use optional cookies. Choose your cookie preferences.</p>
        <button value="${action === "accept" ? "all_optional_categories" : "necessary_categories"}">${action === "accept" ? "Akkoord" : "Weigeren"}</button></section>
        <script>document.querySelector('button').onclick=()=>{fetch('/click');document.querySelector('section').hidden=true}</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const common = { url: `http://127.0.0.1:${address.port}/`, scanId: `dutch-${action}`,
      recipeSetId: "multilingual-fixture", actionSearchTimeoutMs: 1600, confirmationTimeoutMs: 50,
      observationWindowMs: 50, interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const } };
    const recipe = { recipeId: "unmatched-fixture", controlSelector: "#absent", resolverMethod: "local_fixture_recipe" as const,
      confirmation: { kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied" } };
    try {
      const packet = action === "accept"
        ? await runPostAcceptObserver({ ...common, allowCanonicalAcceptDiscovery: true,
          recipe: { ...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1" } })
        : await runPostRefusalObserver({ ...common, allowCanonicalRejectDiscovery: true,
          recipe: { ...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1" } });
      assert.equal(clicks, 1, JSON.stringify(packet.interactionDiagnostics));
      assert.equal(packet.actionControlProof?.matchedLocale, "nl");
      assert.notEqual("acceptanceRegistration" in packet ? packet.acceptanceRegistration.status : packet.refusalRegistration.status, "confirmed");
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
