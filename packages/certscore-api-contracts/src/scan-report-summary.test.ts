import assert from "node:assert/strict";
import test from "node:test";
import { scanFormsSummarySchema, scanScoreExplanationSchema } from "./scan-report-summary.js";
import { buildCertScoreApiV2OpenApiDocument } from "./openapi-v2.js";

test("typed form summary preserves unavailable phases and refuses inconsistent counts", () => {
  const value = { contractVersion: "certscore.forms-summary.v1", scope: "starting_page_reportable_observations",
    totalObserved: 2, preConsentObserved: null, afterAcceptObserved: 2, preConsentCapture: "unavailable", afterAcceptCapture: "retained" };
  assert.equal(scanFormsSummarySchema.parse(value).preConsentObserved, null);
  assert.equal(scanFormsSummarySchema.safeParse({ ...value, totalObserved: 3 }).success, false);
  assert.equal(scanFormsSummarySchema.safeParse({ ...value, preConsentObserved: 0 }).success, false);
});

test("typed score explanations reconcile family caps with the returned score", () => {
  const value = { contractVersion: "certscore.score-explanation.v1", scope: "starting_page_canonical_score",
    scoreVersion: "overall-score.v1", policyVersion: "gdpr-eprivacy-posture.v16", baseScore: 100, scoreFloor: 0,
    score: 85, totalPolicyDeductionPoints: 15, deductions: [{ family: "post_refusal_enforcement", label: "Post-refusal",
      deductionPoints: 15, rules: [{ ruleId: "post_reject_tracking_reduction", label: "Post-Reject activity",
        policyDeductionPoints: 15, findingIds: [], decisionVerification: "unconfirmed" }] }] };
  assert.equal(scanScoreExplanationSchema.parse(value).score, 85);
  assert.equal(scanScoreExplanationSchema.safeParse({ ...value, score: 100 }).success, false);
  assert.equal(scanScoreExplanationSchema.safeParse({ ...value, totalPolicyDeductionPoints: 30 }).success, false);
});

test("API documents expose typed form and scoring summaries", () => {
  const document = buildCertScoreApiV2OpenApiDocument() as any;
  for (const name of ["Scan", "ScanJob"]) {
    assert.equal(document.components.schemas[name].properties.formsSummary.$ref, "#/components/schemas/FormsSummary");
    assert.equal(document.components.schemas[name].properties.scoreExplanation.$ref, "#/components/schemas/ScoreExplanation");
  }
  assert.ok(document.components.schemas.FormsSummary.properties.afterAcceptObserved);
  assert.ok(document.components.schemas.ScoreExplanation.properties.deductions);
  const imageRead = document.paths["/api/v2/scans/{scanId}/report-evidence/form-snapshot"].get;
  assert.ok(imageRead.responses["200"].content["image/jpeg"]);
  assert.deepEqual(imageRead.security, [{ bearerAuth: [] }, {}]);
  assert.equal(imageRead.parameters.find((parameter: any) => parameter.name === "formRef").required, true);
});
