import assert from "node:assert/strict";
import test from "node:test";
import { shouldReloadForReportGeneration } from "./scan-report-generation-refresh";

test("report refresh waits for a ready, newer canonical generation", () => {
  assert.equal(shouldReloadForReportGeneration({
    currentGeneration: "generation-a",
    polledGeneration: "generation-b",
    reportReady: true,
  }), true);
  assert.equal(shouldReloadForReportGeneration({
    currentGeneration: "generation-a",
    polledGeneration: "generation-a",
    reportReady: true,
  }), false);
  assert.equal(shouldReloadForReportGeneration({
    currentGeneration: "generation-a",
    polledGeneration: "generation-b",
    reportReady: false,
  }), false);
});
