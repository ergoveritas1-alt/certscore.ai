import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthorizedRuntimeGraphReport, runtimeGraphQuotaRequest } from "./runtime-evidence-graph-access";
import type { ScanDetailResponse } from "./get-scan-by-id";

const report = { scan: { id: "scan" } } as ScanDetailResponse;
test("anonymous, own-organization and administrator graph reads follow their existing scopes", async () => {
  for (const scope of ["anonymous", "own", "admin"] as const) {
    const calls: string[] = [];
    const result = await loadAuthorizedRuntimeGraphReport("scan", {
      anonymous: async () => scope === "anonymous" ? report : null,
      user: async () => { calls.push("user"); return { id: "user", email: "fixture@example.test" }; },
      admin: () => scope === "admin",
      membership: async userId => { assert.equal(userId, "user"); return { organization_id: "owned" }; },
      status: async (organizationId, scanId) => { calls.push("ownership"); assert.equal(organizationId, "owned"); assert.equal(scanId, "scan"); return { reportReady: true, reportGeneration: "generation" }; },
      report: async input => { calls.push("report"); assert.deepEqual(input, scope === "admin" ? { scanId: "scan" } : { scanId: "scan", organizationId: "owned", generation: "generation" }); return report; },
    });
    assert.equal(result, report);
    assert.deepEqual(calls, scope === "anonymous" ? [] : scope === "admin" ? ["user", "report"] : ["user", "ownership", "report"]);
  }
});

test("foreign organization, unready scan, absent membership and no session cannot reach report cache", async () => {
  for (const scope of ["foreign", "unready", "no_membership", "no_session"] as const) {
    const result = await loadAuthorizedRuntimeGraphReport("scan", {
      anonymous: async () => null,
      user: async () => scope === "no_session" ? null : { id: "user", email: "fixture@example.test" },
      admin: () => false,
      membership: async () => scope === "no_membership" ? null : { organization_id: "owned" },
      status: async () => scope === "foreign" ? null : { reportReady: false, reportGeneration: null },
      report: async () => { assert.fail("authorization must precede general cached report lookup"); },
    });
    assert.equal(result, null);
  }
});

test("arbitrary Bearer strings cannot rotate caller identity on the session-only graph route", () => {
  const request = new Request("https://certscore.ai/api/scans/scan/runtime-evidence-graph", { headers: { Authorization: "Bearer unverified", Cookie: "session=fixture", "x-forwarded-for": "192.0.2.1" } });
  const normalized = runtimeGraphQuotaRequest(request);
  assert.equal(normalized.headers.get("authorization"), null);
  assert.equal(normalized.headers.get("x-forwarded-for"), "192.0.2.1");
  assert.equal(normalized.headers.get("cookie"), "session=fixture");
  assert.equal(request.headers.get("authorization"), "Bearer unverified");
});
