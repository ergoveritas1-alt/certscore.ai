import assert from "node:assert/strict";
import test from "node:test";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";
import { buildTimelineReportModel } from "./timeline-report-model";
import { buildTimelineReportModel as buildLegacyTimelineReportModel } from "../../scanso2/report-lab/timeline-report-model";

function emptyAssessment(score: number | null): ScanDetailResponse {
  return {
    scan: { id: "brief-fixture", status: "completed", domainHostname: "example.com",
      scanConfigJson: { normalizedUrl: "https://example.com/" },
      createdAt: "2026-10-12T10:00:00.000Z", completedAt: "2026-10-12T10:00:02.000Z" },
    snapshot: { certscore_overall: score }, runtimeArtifacts: null, domainBenchmark: null,
    signals: [], validationFindings: [], trackerVendors: [], policyEnrichment: [],
    policyReviewQueue: [], preconsentViolations: [], events: [], pageEvidence: [],
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [],
      collectionSurfaceAssessment: null, derivedContext: {}, globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId: "brief-fixture" }, normalizedConcerns: [],
      ownerUnifiedFindings: [], topFindingIds: [],
    },
  } as unknown as ScanDetailResponse;
}

for (const [surface, build] of [["scans", buildTimelineReportModel], ["scanso2", buildLegacyTimelineReportModel]] as const) {
  test(`${surface}: a missing score cannot use display zero to escalate the assessment`, () => {
    const report = build(emptyAssessment(null));
    assert.ok("findings" in report);
    assert.deepEqual(report.findings, []);
    assert.doesNotMatch(report.verdict, /high-priority remediation|needs work|low risk|all clear/);
    assert.equal(report.verdict, "No priority findings are available from this visit.");
  });

  test(`${surface}: a retained zero score does not invent a priority without a finding`, () => {
    const report = build(emptyAssessment(0));
    assert.ok("findings" in report);
    assert.deepEqual(report.findings, []);
    assert.equal(report.verdict, "No priority findings are available from this visit.");
    assert.equal(report.score.value, 0);
  });
}
