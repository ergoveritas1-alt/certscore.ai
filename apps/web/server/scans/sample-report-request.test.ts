import assert from "node:assert/strict";
import test from "node:test";
import { handleSampleReportRequest } from "./sample-report-request";
import type { SampleScanFrom } from "../../lib/marketing/homepage-location";

function harness() {
  const regions: SampleScanFrom[] = [];
  return { regions, dependencies: {
    classifyQuotaError: () => null,
    resolve: async (region: SampleScanFrom) => { regions.push(region); return { kind: "recent" as const, scanId: "public-scan" }; },
  } };
}

function request(body: unknown = {}, country?: string) {
  return new Request("https://certscore.ai/api/public/sample-report", {
    method: "POST", headers: { "Content-Type": "application/json", ...(country ? { "cf-ipcountry": country } : {}) },
    body: JSON.stringify(body),
  });
}

test("anonymous sample clicks follow actual country, forced loc, then a manual scan choice", async () => {
  const { regions, dependencies } = harness();
  for (const [body, country, expected] of [
    [{}, "US", "california"], [{}, "GB", "eu_ie"], [{}, undefined, "eu_ie"],
    [{ loc: "EU" }, "US", "eu_ie"], [{ loc: "US" }, "GB", "california"],
    [{ loc: "US", scanFrom: "eu_ie" }, "US", "eu_ie"],
    [{ loc: "EU", scanFrom: "eu_de" }, "US", "eu_de"],
  ] as const) {
    const response = await handleSampleReportRequest(request(body, country), dependencies);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).scanFrom, expected);
    assert.equal(regions.at(-1), expected);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  }
});

test("session cookies do not bypass the regional sample lookup or refresh", async () => {
  for (const [country, scanFrom] of [["US", "california"], ["GB", "eu_ie"]] as const) {
    for (const [kind, status] of [["recent", 200], ["fresh", 202]] as const) {
      const signedInRequest = request({}, country);
      signedInRequest.headers.set("cookie", "certscore.session_token=fixture-session");
      const response = await handleSampleReportRequest(signedInRequest, {
        classifyQuotaError: () => null,
        resolve: async region => {
          assert.equal(region, scanFrom);
          return { kind, scanId: "regional-sample" };
        },
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), {
        scanFrom, resolution: kind, scanId: "regional-sample", scanUrl: "/scan/regional-sample",
      });
    }
  }
});

test("GET, malformed input, arbitrary targets, restricted regions and force-new flags cannot launch scans", async () => {
  const { regions, dependencies } = harness();
  assert.equal((await handleSampleReportRequest(new Request("https://certscore.ai/api/public/sample-report"), dependencies)).status, 405);
  for (const body of [null, [], { domain: "https://other.example/" }, { forceNewScan: true }, { scanFrom: "local_extension" }, { loc: "CA" }]) {
    assert.equal((await handleSampleReportRequest(request(body), dependencies)).status, 400);
  }
  const crossSite = request();
  crossSite.headers.set("sec-fetch-site", "cross-site");
  assert.equal((await handleSampleReportRequest(crossSite, dependencies)).status, 403);
  assert.equal(regions.length, 0);
});

test("in-flight preparation returns a retry hint and accepted fresh work opens the real progress report", async () => {
  const { dependencies } = harness();
  const busy = await handleSampleReportRequest(request(), { ...dependencies, resolve: async () => ({ kind: "busy", retryAfterSeconds: 1 }) });
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get("Retry-After"), "1");
  const fresh = await handleSampleReportRequest(request(), { ...dependencies, resolve: async () => ({ kind: "fresh", scanId: "new-scan" }) });
  assert.equal(fresh.status, 202);
  assert.equal((await fresh.json()).scanUrl, "/scan/new-scan");
});
