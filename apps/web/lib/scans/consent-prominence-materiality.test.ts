import assert from "node:assert/strict";
import test from "node:test";
import { assessConsentProminenceMateriality } from "./consent-prominence-materiality";
function proof(acceptSize = [200, 50], rejectSize = [200, 50]) {
  const metric = { candidateId: "a", bounds: [30, 30, ...acceptSize], fillContrast: 9.462, outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 };
  return { version: "consent_visual_prominence_projection.v1", assessmentSourceHash: "fnv1a-12345678", comparison: {
    version: "consent_control_visual_comparison.v1", documentToken: "d", screenshotArtifactRef: "retained.png", screenshotSha256: "a".repeat(64),
    imageWidth: 1366, imageHeight: 900, captureSkewMs: 137, accept: metric,
    reject: { ...metric, candidateId: "r", bounds: [30, 200, ...rejectSize], fillContrast: 1 } } };
}
test("styling alone stays neutral, including SITS and a larger Reject", () => {
  for (const [a, r] of [[[528,45],[528,49]],[[200,50],[200,50]],[[200,50],[101,50]],[[200,50],[60,60]]]) {
    assert.equal(assessConsentProminenceMateriality(proof(a,r))?.outcome,"styling_only");
  }
});
test("geometry corroboration requires twice the area and no smaller Accept dimension", () => {
  assert.equal(assessConsentProminenceMateriality(proof([200,50],[100,50]))?.outcome,"material");
  assert.equal(assessConsentProminenceMateriality(proof([200,50],[80,40]))?.outcome,"material");
  const equal = proof([200,50],[80,40]); equal.comparison.reject.fillContrast = 9.462;
  assert.equal(assessConsentProminenceMateriality(equal),null,"size alone does not establish this styling finding");
  assert.equal(assessConsentProminenceMateriality({}),null);
});
