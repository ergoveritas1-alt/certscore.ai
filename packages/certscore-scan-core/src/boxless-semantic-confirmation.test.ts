import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

for (const action of ["accept", "reject"] as const) {
  for (const shadow of [false, true]) {
    for (const decision of ["granted", "denied", "receipt-only"] as const) {
      test(`${action}: boxless ${shadow ? "shadow" : "light"} scope retains ${decision} semantic decision`, async () => {
        let clicks = 0;
        const server = createServer((request, response) => {
          if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
          response.setHeader("Content-Type", "text/html");
          response.end(`<!doctype html><body>
            <example-cmp role="dialog" aria-label="Cookie consent" style="display:block;height:0">
              We use optional cookies. Choose your cookie preferences.
            </example-cmp><script>
            const host = document.querySelector('example-cmp');
            const root = ${shadow ? "host.attachShadow({mode:'open'})" : "host"};
            root.innerHTML += '<style>.actions{position:fixed;bottom:40px;left:40px;background:white;padding:20px}button{width:100px;height:40px}</style>${shadow ? "<slot></slot>" : ""}<div class="actions"><button>Accept</button><button>Decline</button><button>Preferences</button></div>';
            root.querySelectorAll('button').forEach(button => button.onclick = () => {
              localStorage.setItem('consent', '${decision}');
              fetch('/click'); host.hidden = true;
            });</script>`);
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const input = {
          url: `http://127.0.0.1:${address.port}/`, scanId: `semantic-${action}`,
          actionSearchTimeoutMs: 1600, confirmationTimeoutMs: 100, observationWindowMs: 50,
          interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const },
        };
        const recipe = {
          recipeId: "unmatched-fixture", controlSelector: "#absent", resolverMethod: "local_fixture_recipe" as const,
          confirmation: { kind: "local_storage_equals" as const, key: "consent", expectedValue: action === "accept" ? "granted" : "denied" },
        };
        try {
          const packet = action === "accept"
            ? await runPostAcceptObserver({ ...input, allowCanonicalAcceptDiscovery: true, recipe: { ...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1" } })
            : await runPostRefusalObserver({ ...input, allowCanonicalRejectDiscovery: true, recipe: { ...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1" } });
          assert.equal(clicks, 1);
          assert.ok(packet.actionControlProof?.uniquelyActionable);
          const projection = "acceptanceRegistration" in packet
            ? projectPostAcceptEvidenceForReport({ packet: postAcceptEvidencePacketSchema.parse(packet) })
            : projectPostRefusalEvidenceForReport({ packet: postRefusalEvidencePacketSchema.parse(packet) });
          assert.deepEqual(projection.decisionEvidence, packet.decisionEvidence);
          assert.deepEqual(projection.captureCoverage, packet.captureCoverage);
          const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
          const expected = action === "accept" ? "granted" : "denied";
          assert.equal(registration.status, decision === expected ? "confirmed" : "unconfirmed");
          assert.equal(packet.decisionEvidence?.decision, decision === "receipt-only" ? "unknown" : decision);
          if (decision !== "receipt-only") {
            assert.equal(packet.decisionEvidence?.timestampBasis, "instrumented_state_write");
            assert.match(packet.decisionEvidence?.observedStateSha256 ?? "", /^[a-f0-9]{64}$/);
          }
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      });
    }
  }
}
