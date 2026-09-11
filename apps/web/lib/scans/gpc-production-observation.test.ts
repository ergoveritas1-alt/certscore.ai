import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcProductionRuntimeFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import { gpcRuntimeFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import { buildGpcResponseAssessment } from "../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import { buildGpcProductionAssessment } from "../../../../packages/certscore-scan-core/src/gpc-production-observation";
import { gpcResponseAssessmentSchema } from "@certscore/contracts";
import { apiV2GpcResponseSchema } from "../../../../packages/certscore-api-contracts/src/scan-observation-results";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { buildCanonicalGpcResponseProjection } from "./gpc-response-projection";
import { buildGpcResponseReportProjection } from "../../components/scans/report-lab/gpc-report-projection";

test("verified bytes → typed persisted v3 → normalized concern/policy → unified report/API preserves complete observation with indeterminate comparison and no score", () => {
  const gpc = gpcProductionRuntimeFixture();
  gpc.gpcSignalObservation!.workerCount = 1;
  const bytes = Buffer.from(JSON.stringify(gpc));
  const pointer = { uri: "s3://fixture/gpc.json", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
  const comparison = buildGpcResponseAssessment({ baseline: gpcRuntimeFixture({ enabled: false }), baselineArtifact: { ...pointer, uri: "s3://fixture/base.json" }, gpc, gpcArtifact: pointer });
  const assessment = buildGpcProductionAssessment({ scanId: gpc.scanId, source: { bytes, pointer }, comparison });
  assert.equal(assessment.status, "indeterminate");
  assert.equal(assessment.observation.status, "complete");
  assert.equal(assessment.observation.requests.classifiedCount, 1);
  assert.equal(assessment.observation.registration.sale, "unknown");
  const persisted = gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment)));
  const findings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
    runtimeArtifacts: { gpcResponseAssessment: persisted } });
  const projection = buildCanonicalGpcResponseProjection(findings);
  assert.ok(projection);
  assert.equal(projection.californiaDeductionPoints, 0);
  assert.match(projection.summary, /observation completed/);
  assert.match(projection.summary, /1 classified/);
  assert.doesNotMatch(projection.summary, /honored|compliant|violation/i);
  assert.deepEqual(buildGpcResponseReportProjection(findings)?.assessment, assessment);
  const { baselineArtifact, gpcArtifact, delivery, evidenceRefs, ...c } = assessment.comparison;
  const publicResult = apiV2GpcResponseSchema.parse({ contractVersion: assessment.contractVersion, status: assessment.status,
    findingTitle: assessment.findingTitle, summary: projection.summary, observation: assessment.observation,
    scoreEffect: "none", legalInterpretation: "not_assessed", comparison: { ...c,
      baselineArtifact: { lane: "runtime_evidence", sha256: pointer.sha256, sizeBytes: pointer.sizeBytes },
      gpcArtifact: { lane: "gpc_observation", sha256: pointer.sha256, sizeBytes: pointer.sizeBytes }, delivery: { status: delivery.status } },
    californiaPolicy: { applied: false, deductionPoints: 0 }, evidenceUrl: "https://example.test/evidence" });
  assert.equal(publicResult.observation?.status, "complete");
});
