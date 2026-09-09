import assert from "node:assert/strict";
import test from "node:test";
import { handleFullSiteStop } from "./full-site-stop";
const scanId = "a94a2c37-408b-4627-aa56-9c89f6ecf779";
function request(origin = "https://certscore.ai", header = "stop") {
  return new Request(`https://certscore.ai/api/scans/${scanId}/full-site/stop`, {
    method: "POST", headers: { origin, "x-certscore-full-site-action": header },
  });
}
test("stop is a session-only, same-origin mutation bound to the authenticated user and organization", async () => {
  const calls: unknown[] = [];
  const deps = {
    appUrl: "https://certscore.ai",
    currentUser: async () => ({ id: "user" }), organization: async () => ({ id: "org" }),
    cancel: async (input: unknown) => { calls.push(input); return { status: "cancelled" }; },
  };
  for (const req of [request("https://attacker.test"), request("null"), request(""), request("https://certscore.ai", "")])
    assert.equal((await handleFullSiteStop(req, scanId, deps)).status, 403);
  assert.equal((await handleFullSiteStop(request(), "invalid", deps)).status, 400);
  assert.equal((await handleFullSiteStop(request(), scanId, { ...deps, currentUser: async () => null })).status, 401);
  assert.equal((await handleFullSiteStop(request(), scanId, { ...deps, organization: async () => null })).status, 404);
  assert.deepEqual(calls, []);
  assert.equal((await handleFullSiteStop(request(), scanId, { ...deps, cancel: async () => null })).status, 404);
  const result = await handleFullSiteStop(request(), scanId, deps);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: "cancelled" });
  assert.deepEqual(calls, [{ scanId, organizationId: "org", userId: "user" }]);
});
