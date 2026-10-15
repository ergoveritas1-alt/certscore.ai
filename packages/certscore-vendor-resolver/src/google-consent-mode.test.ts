import assert from "node:assert/strict";
import test from "node:test";
import { captureGoogleConsentModeRequest } from "./index";
import { assessGoogleConsentModeRequest } from "@certscore/contracts";

const base = "https://www.google-analytics.com/g/collect";
const capture = (query: string, url = base) => captureGoogleConsentModeRequest({ url: `${url}?${query}`, requestId: "req_1", timestampMs: 4929 });

test("captures only allowlisted Google request declarations without identifiers or detailed gcd values", () => {
  const observation = capture("gcs=G100&gcd=13p3p3p2p5l1&npa=1&cid=private&dl=private");
  assert.ok(observation);
  assert.equal(observation.gcs, "G100");
  assert.equal(observation.gcdPresent, true);
  assert.equal(observation.nonPersonalizedAds, "declared");
  assert.doesNotMatch(JSON.stringify(observation), /private|13p3p3p2p5l1|cid|dl/);
  assert.equal(assessGoogleConsentModeRequest({ observation, requestId: "req_1", timestampMs: 4929, requestUrl: base })?.storageDeclaration, "denied");
});

test("storage declarations remain separate from detailed consent and non-personalized ads flags", () => {
  for (const [query, expected] of [
    ["gcs=G111", "granted"], ["gcs=G101", "mixed"], ["gcs=G110", "mixed"],
    ["gcs=G100&gcs=G111", "unknown"], ["gcs=G100&gcs=G100", "unknown"],
    ["gcs=G999", "unknown"], ["gcs=", "unknown"], ["gcs=g100", "unknown"],
    ["gcd=13p3p3p2p5l1", "unknown"], ["npa=1", "unknown"],
  ]) {
    const observation = capture(query!);
    assert.equal(assessGoogleConsentModeRequest({ observation, requestId: "req_1", timestampMs: 4929, requestUrl: base })?.storageDeclaration, expected, query);
  }
  assert.equal(capture("npa=1&npa=0")?.nonPersonalizedAds, "unknown");
});

test("Google ownership, library loads, lookalikes and invalid bindings cannot establish measurement consent context", () => {
  for (const url of ["https://evil.test/g/collect", "https://www.google-analytics.com.evil.test/g/collect",
    "https://www.google.com/g/collect", "https://www.google-analytics.com/analytics.js",
    "https://www.google-analytics.com/g/collect/extra", "http://www.google-analytics.com/g/collect",
    "https://user@www.google-analytics.com/g/collect", "https://www.google-analytics.com:444/g/collect"]) {
    assert.equal(capture("gcs=G100", url), undefined, url);
  }
  assert.equal(capture("cid=private"), undefined);
  assert.equal(captureGoogleConsentModeRequest({ url: `${base}?gcs=G100`, requestId: "", timestampMs: 0 }), undefined);
  assert.equal(captureGoogleConsentModeRequest({ url: `${base}?gcs=G100`, requestId: "req", timestampMs: NaN }), undefined);
  assert.equal(capture("gcs=G100", "https://region1.google-analytics.com/g/collect")?.gcs, "G100");
  assert.equal(capture("gcs=G100", "https://analytics.google.com/g/collect")?.gcs, "G100");
});
