import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE } from "./post-accept-cmp-recipes.js";

test("post-Accept observer confirms one deterministic action and retains bounded activity", async () => {
  await withFixture({ ambiguous: false }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 2_000,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-confirmed",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, true);
    assert.equal(packet.productionProjectable, true);
    assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType, "cmp_storage_state");
    assert.ok(packet.storage.writesAfterAccept.some((write) =>
      write.storageType === "cookie" && write.name === "_ga" && write.nonEssential
    ));
    assert.ok(packet.observations.some((observation) =>
      observation.observationType === "post_accept_non_essential_activity"
    ));
    assert.equal(packet.timing.observationExitReason, "non_essential_storage_write_observed");
    assert.ok(packet.timing.observationMs < 1_000);
    assert.ok(packet.limitations.includes(
      "observation_early_exit:non_essential_storage_write_observed",
    ));
    const serialized = JSON.stringify(packet);
    assert.equal(serialized.includes("GA1.1.CERTSCORE_ACCEPT_RAW"), false);
  });
});

test("post-Accept observer returns a limited confirmed packet before its result budget", async () => {
  await withFixture({ ambiguous: false, activityDelayMs: 5_000 }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 1_000,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 5_000,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      resultBudgetMs: 1_500,
      scanId: "post-accept-observer-result-budget",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.productionProjectable, false);
    assert.equal(packet.cancellation.requested, true);
    assert.ok(packet.timing.totalMs < 2_500);
    assert.ok(packet.limitations.includes(
      "observer_result_budget_exhausted_after_confirmed_acceptance",
    ));
  });
});

test("post-Accept observer fails closed when more than one deterministic control matches", async () => {
  await withFixture({ ambiguous: true }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 100,
      confirmationTimeoutMs: 200,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      productionProjectable: true,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-ambiguous",
      url,
    });

    assert.equal(actionCount(), 0);
    assert.equal(packet.resolver.found, false);
    assert.equal(packet.resolver.reason, "multiple_deterministic_accept_controls_found");
    assert.equal(packet.acceptanceRegistration.status, "not_attempted");
    assert.equal(packet.productionProjectable, false);
    assert.deepEqual(packet.observations, []);
  });
});

test("post-Accept observer resolves one exact control inside a child frame", async () => {
  await withFixture({ ambiguous: false, framed: true }, async ({ url, actionCount }) => {
    const packet = await runPostAcceptObserver({
      actionSearchTimeoutMs: 500,
      confirmationTimeoutMs: 500,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      observationWindowMs: 50,
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      scanId: "post-accept-observer-frame",
      url,
    });

    assert.equal(actionCount(), 1);
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType, "cmp_storage_state");
  });
});

async function withFixture(
  options: { activityDelayMs?: number; ambiguous: boolean; framed?: boolean },
  run: (fixture: { actionCount: () => number; url: string }) => Promise<void>,
) {
  let acceptActions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/accept-action") {
      acceptActions += 1;
      response.writeHead(204).end();
      return;
    }
    const controls = `<section aria-label="Cookie and analytics preferences">
        <button data-certscore-consent-action="accept">Accept</button>
        ${options.ambiguous
          ? '<button data-certscore-consent-action="accept">Accept all</button>'
          : ""}
      </section>
      <script>
        for (const button of document.querySelectorAll('[data-certscore-consent-action="accept"]')) {
          button.addEventListener("click", () => {
            fetch("/accept-action", { method: "POST" });
            localStorage.setItem("certscore:analytics-consent:v1", "granted");
            document.querySelector("section").hidden = true;
            setTimeout(() => {
              document.cookie = "_ga=GA1.1.CERTSCORE_ACCEPT_RAW; Path=/; SameSite=Lax";
            }, ${options.activityDelayMs ?? 60});
          });
        }
      </script>`;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/frame") {
      response.end(`<!doctype html><html><body>${controls}</body></html>`);
      return;
    }
    response.end(`<!doctype html>
      <html><body>
        ${options.framed ? '<iframe src="/frame" title="Consent"></iframe>' : controls}
      </body></html>`);
  });
  const url = await listen(server);
  try {
    await run({ actionCount: () => acceptActions, url });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind a TCP port.");
  return `http://127.0.0.1:${address.port}/`;
}
