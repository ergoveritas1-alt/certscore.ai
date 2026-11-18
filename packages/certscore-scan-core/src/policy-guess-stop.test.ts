import assert from "node:assert/strict";
import test from "node:test";
import { safeResponseHeadersSchema } from "@certscore/contracts";
import { PolicyGuessStop } from "./policy-guess-stop.js";
import { assessPolicyHomepageAccess, fetchText } from "./scanners/policy-surface-scanner.js";
import { safeResponseHeaders } from "./scanners/pre-consent-runtime-scanner.js";

test("a homepage and a guessed document must both return 403 from the same origin", () => {
  const stop = new PolicyGuessStop();
  const policy = "https://www.example.test/privacy";
  stop.recordHomepage(403, "https://www.example.test/");
  for (const [status, url] of [[403, "https://other.test/"], [200, policy], [429, policy]] as const) {
    stop.recordGuess(status, url);
    assert.equal(stop.shouldSkipNewGuess(policy), false);
  }
  stop.recordGuess(403, policy);
  assert.equal(stop.shouldSkipNewGuess("https://www.example.test/privacy-policy"), true);
  for (const url of ["http://www.example.test/", "https://example.test/", "https://www.example.test:8443/"]) {
    assert.equal(stop.shouldSkipNewGuess(url), false);
  }
  const otherScan = new PolicyGuessStop();
  otherScan.recordHomepage(200, "https://www.example.test/");
  otherScan.recordGuess(403, policy);
  assert.equal(otherScan.shouldSkipNewGuess(policy), false);
});

test("a policy fetch retains an explicit challenge on its terminal response", async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    if (url === "https://example.test/") return new Response(null, {
      status: 301, headers: { location: "https://example.test/policy" },
    });
    return new Response("Privacy Policy", { headers: { "cf-mitigated": "challenge", "content-type": "text/html" } });
  });
  const result = await fetchText("https://example.test/", 2000);
  assert.deepEqual(calls, ["https://example.test/", "https://example.test/policy"]);
  assert.equal(result.attempts?.[0]?.firstResponseStatus, 301);
  assert.equal(result.attempts?.[0]?.finalUrl, calls[1]);
  assert.equal(result.attempts?.[0]?.cfMitigated, "challenge");
  assert.equal(result.status, 200);
  assert.equal(result.ok, false);
  assert.equal(assessPolicyHomepageAccess(result), "bot_challenge");
});

test("Cloudflare presence on an adjacent browser response supplies no challenge marker", () => {
  const headers = (value: Record<string, string>) => safeResponseHeadersSchema.parse(safeResponseHeaders(value));
  assert.equal(headers({ "cf-mitigated": "challenge" }).cfMitigated, "challenge");
  assert.equal(headers({ server: "cloudflare", "cf-ray": "sample" }).cfMitigated, undefined);
  assert.equal(headers({ "cf-mitigated": "unexpected" }).cfMitigated, undefined);
});
