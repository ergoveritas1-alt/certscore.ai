import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { derivePolicySurfaceInspectionOutcome } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { policySurfaceScanner, type PolicyNanoAssistProvider } from "./scanners/policy-surface-scanner.js";

// Local deterministic provider: this regression never sends a model request.
const nanoAssistProvider: PolicyNanoAssistProvider = {
  async classifyLinks(input) {
    return { assistId: input.assistId, rankedCandidates: input.candidates.slice(0, 8).map((candidate, index) => ({
      candidateId: candidate.candidateId, likelySurfaceType: candidate.deterministicSurfaceType,
      shouldFetch: candidate.fetchable, priorityRank: index + 1, confidence: 0.95,
      reason: "Fixture uses canonical deterministic candidate types.", uncertaintyNotes: [],
    })) };
  },
};
const body = `<main><h1>Riverside Restaurant</h1><p>${"Visit our family restaurant for lunch and dinner. Explore our seasonal menu, opening hours, reservations and local catering services. ".repeat(12)}</p></main>`;

for (const scenario of ["missing", "seeded_missing", "seeded_observed_but_unfetchable", "observed_but_unfetchable", "blocked", "enumeration_overflow", "uninspected_frame", "uninspected_shadow", "loading_document"] as const) {
  test(`policy negative search: ${scenario}`, { timeout: 25_000 }, async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "text/html");
      if (request.url !== "/" && request.url !== "/pending-script") {
        response.statusCode = 404; response.end("Not found"); return;
      }
      if (request.url === "/pending-script") return;
      if (scenario === "blocked") {
        response.statusCode = 403; response.end("Access denied"); return;
      }
      const extra = (scenario === "observed_but_unfetchable" || scenario === "seeded_observed_but_unfetchable") ? '<footer><a href="/privacy-policy">Privacy policy</a></footer>'
        : scenario === "enumeration_overflow" ? Array.from({ length: 1001 }, (_, i) => `<button>Menu item ${i}</button>`).join("")
        : scenario === "uninspected_frame" ? '<iframe src="about:blank"></iframe>'
        : scenario === "uninspected_shadow" ? '<div id="custom-footer"></div><script>document.querySelector("#custom-footer").attachShadow({mode:"open"}).innerHTML="<span>Footer</span>"</script>'
        : scenario === "loading_document" ? '<script src="/pending-script"></script>' : "";
      response.end(`<html lang="en"><head><title>Riverside Restaurant</title></head><body>${body}${extra}</body></html>`);
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address === "object");
    const normalizedUrl = `http://127.0.0.1:${address.port}/`;
    const root = await mkdtemp(path.join(tmpdir(), "policy-negative-"));
    try {
      const result = await policySurfaceScanner({ url: normalizedUrl, normalizedUrl,
        scanStartedAtMs: Date.now(), internalBudgetMs: 12_000, discoveryMode: "fast",
        artifactWriter: await createArtifactWriter(root), nanoAssistProvider,
        ...(scenario.startsWith("seeded_") ? { policySurfaceSeeds: [{ hintType: "privacy_policy",
          source: "canonical_legal_surface_hint" as const, url: new URL("/privacy-policy", normalizedUrl).href }] } : {}) });
      const inspection = derivePolicySurfaceInspectionOutcome({ modulesRun: [result.moduleRun], normalizedUrl,
        negativeSearchEvidence: result.negativeSearchEvidence, policySurfaceObservations: result.policySurfaceObservations });
      if (scenario === "missing" || scenario === "seeded_missing") {
        assert.equal(result.moduleRun.status, "completed", JSON.stringify(result.moduleRun));
        assert.ok(result.policySurfaceObservations.filter(row => row.status === "failed").length > 0,
          "Guessed URL 404s do not negate the independently completed observed-link search.");
        assert.equal(inspection.outcome, "no_privacy_policy_observed_complete_coverage", JSON.stringify(result));
        assert.ok(inspection.negativeSearchEvidence?.renderedInspectionHash);
      } else if (scenario === "observed_but_unfetchable" || scenario === "seeded_observed_but_unfetchable") {
        assert.equal(inspection.outcome, "privacy_policy_observed");
        assert.equal(inspection.documentRetrievalCoverageStatus, "insufficient");
        assert.equal(result.negativeSearchEvidence, undefined);
      } else {
        assert.equal(inspection.outcome, "indeterminate_limited_coverage", scenario);
        assert.equal(result.negativeSearchEvidence, undefined);
      }
    } finally {
      server.closeAllConnections(); server.close(); await once(server, "close");
      await rm(root, { recursive: true, force: true });
    }
  });
}
