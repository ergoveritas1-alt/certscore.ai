import assert from "node:assert/strict";
import test from "node:test";
import { assessGoogleConsentModeRequest, readGoogleConsentModeAssessment } from "./google-consent-mode";
import { networkEventSchema } from "./index";
import { postRefusalNetworkRequestSchema } from "./post-refusal-observation";
import { postAcceptNetworkRequestSchema } from "./post-accept-observation";

const observation = {
  version: "google-consent-mode-request.v1", source: "request_query", requestId: "req_1", timestampMs: 4929,
  requestOrigin: "https://www.google-analytics.com", requestPath: "/g/collect", gcs: "G100",
  gcdPresent: true, nonPersonalizedAds: "declared",
};
const binding = { observation, requestId: "req_1", timestampMs: 4929, requestUrl: "https://www.google-analytics.com/g/collect?redacted=1" };

test("consent-mode evidence fails closed on request drift, malformed proof and missing producer metadata", () => {
  assert.equal(assessGoogleConsentModeRequest(binding)?.storageDeclaration, "denied");
  for (const change of [{ requestId: "other" }, { timestampMs: 4930 }, { requestUrl: "https://other.test/g/collect" },
    { requestUrl: "https://www.google-analytics.com/collect" }, { observation: undefined },
    { observation: { ...observation, version: "future" } }, { observation: { ...observation, rawCookie: "secret" } }]) {
    assert.equal(assessGoogleConsentModeRequest({ ...binding, ...change }), undefined);
  }
  const assessment = assessGoogleConsentModeRequest(binding)!;
  assert.equal(assessment.scoreEffect, "none");
  assert.equal(readGoogleConsentModeAssessment({ ...assessment, storageDeclaration: "granted" }, binding), undefined);
  assert.equal(assessGoogleConsentModeRequest({ ...binding, observation: undefined, requestUrl: `${binding.requestUrl}&gcs=G100` }), undefined);
});

test("network and action contracts preserve optional metadata while legacy records remain unchanged", () => {
  const request = { requestId: "req_1", sanitizedUrl: binding.requestUrl, resourceType: "fetch", startedAtMs: 4929, nonEssential: true };
  for (const [schema, extra] of [
    [postRefusalNetworkRequestSchema, { inFlightAtRefusalRegistration: false }],
    [postAcceptNetworkRequestSchema, { inFlightAtAcceptanceRegistration: false }],
  ] as const) {
    const legacy = schema.parse({ ...request, ...extra });
    assert.equal(Object.hasOwn(legacy, "googleConsentMode"), false);
    const enriched = schema.parse({ ...request, ...extra, googleConsentMode: observation });
    const { googleConsentMode, ...rest } = enriched;
    assert.deepEqual(googleConsentMode, observation);
    assert.deepEqual(rest, legacy);
  }
  assert.ok(networkEventSchema.shape.googleConsentMode.safeParse(observation).success);
});
