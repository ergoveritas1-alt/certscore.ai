import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = {
  exports: {},
  filename: serverOnlyPath,
  id: serverOnlyPath,
  isPreloading: false,
  loaded: true,
  path: serverOnlyPath,
  paths: []
};

async function loadProjection() {
  return import("./local-v2-dag-report");
}

test("typed continue decision outranks retained lane-local visual no-go evidence", async () => {
  const { isMaterializedScanNoGo } = await loadProjection();
  assert.equal(isMaterializedScanNoGo({
    derivedNoGo: false,
    scanNoGoAssessment: { decision: "continue_with_diagnostics" },
    visualAccessReview: { go_no_go: "NO_GO" },
  }), false);
});

test("typed no-go and legacy visual-only no-go remain no-go projections", async () => {
  const { isMaterializedScanNoGo } = await loadProjection();
  assert.equal(isMaterializedScanNoGo({
    derivedNoGo: false,
    scanNoGoAssessment: { decision: "no_go" },
    visualAccessReview: { go_no_go: "GO" },
  }), true);
  assert.equal(isMaterializedScanNoGo({
    derivedNoGo: false,
    scanNoGoAssessment: null,
    visualAccessReview: { go_no_go: "NO_GO" },
  }), true);
});
