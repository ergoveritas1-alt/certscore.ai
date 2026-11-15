import assert from "node:assert/strict";
import test from "node:test";
import { afterRejectClickProjection, afterRejectProjection, highRiskAfterRejectAssessment } from "./test-fixtures/after-reject-scoring";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { preserveRetainedRejectClickCapture, retainedRejectClickCapture } from "./retained-reject-click-capture";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

test("confirmed Reject presence reviews preserve legacy registered timing through canonical policy and historical read", () => {
  const projection=afterRejectProjection("advertising");
  assert.equal(projection.afterActionCapture,undefined);
  const runtimeArtifacts=buildPostRefusalRuntimeProjection(projection);
  const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:false});
  const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,projectedFindings:[],unifiedFindings:[],scanCompleted:true,coverageLimited:false});
  const row=rows.find(row=>row.id==="post_reject_tracking_reduction")!;
  assert.equal(row.criticalEvidence.retainedEvidence.observationWindowMs,500);
  const historical=structuredClone(row);
  for(const key of ['observationWindowMs','registeredObservationCompletion','execution','resolverMethod','sourcePacketSha256','reportEvidenceProjectionPolicy'])delete historical.criticalEvidence.retainedEvidence[key];
  const before=structuredClone(historical);
  const repaired=preserveRetainedRejectClickCapture([historical],projection)[0]!;
  assert.equal(repaired.criticalEvidence.retainedEvidence.observationWindowMs,500);
  assert.equal((repaired.criticalEvidence.retainedEvidence.execution as any)?.consentConfirmed,true);
  assert.deepEqual({...repaired,criticalEvidence:historical.criticalEvidence},historical);
  assert.deepEqual(historical,before);
  const assessment=row.criticalEvidence.retainedEvidence.afterRejectScoringAssessment;
  assert.equal(retainedRejectClickCapture(assessment,{...projection,packetSha256:'f'.repeat(64)}),null);
  assert.equal(retainedRejectClickCapture(assessment,{...projection,registeredObservationCompletion:undefined}),null);
  assert.equal(retainedRejectClickCapture({...assessment as object,deductionPoints:(assessment as {deductionPoints:number}).deductionPoints === 0 ? 15 : 0},projection),null);
});

test("a legacy confirmed Reject gap reads only the timing from its assessed packet", () => {
  const original = afterRejectProjection();
  const completion = { ...original.registeredObservationCompletion!, requiredWindowMs: 8000, termination: "evidence_satisfied" };
  const projection = { ...original, observationWindowMs: 8000, registeredObservationCompletion: completion };
  const row = {
    id: "post_reject_tracking_reduction", status: "Gap observed",
    criticalEvidence: { retainedEvidence: {
      rejectInteractionConfirmed: true, observationWindowMs: 8000, afterRejectScoringAssessment: highRiskAfterRejectAssessment(),
    } },
  } as Pick<GdprEprivacyCoverageChecklistItem, "id" | "status"> & {
    criticalEvidence: Pick<GdprEprivacyCoverageChecklistItem["criticalEvidence"], "retainedEvidence">;
  };
  const before = structuredClone(row);
  const rows = [row as GdprEprivacyCoverageChecklistItem];
  assert.deepEqual(preserveRetainedRejectClickCapture(rows, projection)[0], {
    ...row, criticalEvidence: { retainedEvidence: { ...row.criticalEvidence.retainedEvidence, registeredObservationCompletion: completion } },
  });
  assert.equal(preserveRetainedRejectClickCapture(rows, { ...projection, packetSha256: "f".repeat(64) })[0], row);
  assert.equal(preserveRetainedRejectClickCapture(rows, afterRejectClickProjection())[0], row);
  assert.deepEqual(row, before);
});
