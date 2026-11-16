import assert from "node:assert/strict";
import test from "node:test";
import { buildConsentTrackingOverview } from "./consent-tracking-overview";
import { projectActionResourceInventory } from "./action-resource-inventory";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { afterRejectClickProjection } from "./test-fixtures/after-reject-scoring";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { gpcProductFixture } from "./test-fixtures/gpc-product";
import { saleSharingOptOutEvidenceSchema } from "@certscore/contracts";
import type { CaliforniaPrivacyReview } from "@certscore/contracts";

const empty = { nonEssential: 0, review: 0, unclassified: 0, contextual: 0, essential: 0 };
const emptyMetric = {
  label: "Requests", value: 9,
  overview: { identifiedServices: 0, distinctResources: 9, distinctStorage: 0, distinctEmbeds: 0, unattributedResources: 9,
    distinctClassifications: { requests: { ...empty, unclassified: 9 }, storage: empty, embeds: empty } },
};
const { scan } = SHADOW_REPORT;
const input = { pageId: scan.id, assessment: observedControlAssessment };
const formsSummary = {
  contractVersion: "certscore.forms-summary.v1", scope: "starting_page_reportable_observations",
  totalObserved: 0, preConsentObserved: 0, afterAcceptObserved: null, preConsentCapture: "complete",
  afterAcceptCapture: "unavailable", countStatus: "captured",
} as const;

test("GDPR combines mutually exclusive request groups, keeps unknown purpose separate and scopes GPC out", () => {
  const metric = { ...emptyMetric, overview: { ...emptyMetric.overview, distinctResources: 96227, distinctStorage: 4,
    distinctClassifications: { ...emptyMetric.overview.distinctClassifications,
      requests: { ...empty, nonEssential: 84593, review: 11625, unclassified: 9 }, storage: { ...empty, review: 4 } } } };
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [metric] }, "gdpr_eprivacy");
  assert.deepEqual(tiles.map(tile => tile.id), ["before", "accept", "reject", "services", "storage", "forms"]);
  assert.equal(tiles[0]?.count, 96218);
  assert.equal(tiles[0]?.metrics?.[0]?.counts?.unclassified, 9);
  assert.equal(tiles[0]?.metrics?.[1]?.counts?.review, 4);
});

test("verified zero flags can coexist with requests, and complete after-click observation can remain unconfirmed", () => {
  const accept = projectActionResourceInventory({ ...input, action: "accept", projection: completedActionProjection("accept") });
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [emptyMetric], formsSummary,
    actionInventories: { accept } }, "gdpr_eprivacy");
  assert.equal(tiles[0]?.count, 0);
  assert.equal(tiles[0]?.metrics?.[0]?.value, 9);
  assert.equal(tiles[1]?.count, 0);
  assert.deepEqual(tiles[1]?.facts, [{ label: "Choice", value: "Click recorded, choice unconfirmed" }, { label: "Observed duration", value: "1 s" }]);
  assert.equal(tiles[2]?.count, null);
  assert.equal(tiles[4]?.count, null);
  assert.equal(tiles[5]?.count, 0);
  assert.equal(tiles[5]?.facts?.[1]?.value, "NA");
});

test("incomplete capture preserves positive Reject activity but suppresses a misleading empty zero", () => {
  const projection = afterRejectClickProjection("advertising");
  const reject = projectActionResourceInventory({ ...input, action: "reject", projection: {
    ...projection, afterActionCapture: { ...projection.afterActionCapture, stopReason: "target_changed" },
  } });
  const accept = projectActionResourceInventory({ ...input, action: "accept", projection: {
    ...completedActionProjection("accept"), afterActionCapture: { ...completedActionProjection("accept").afterActionCapture, stopReason: "aborted" },
  } });
  const tiles = buildConsentTrackingOverview({ scan, actionInventories: { accept, reject } }, "gdpr_eprivacy");
  assert.equal(tiles[1]?.state, "partial");
  assert.equal(tiles[1]?.count, null);
  assert.equal(tiles[2]?.state, "partial");
  assert.equal(tiles[2]?.count, 1);
  assert.match(tiles[2]?.notes?.join(" ") ?? "", /target changed/);
  assert.equal(tiles[2]?.metrics?.[0]?.counts?.review, undefined);
  assert.equal(tiles[2]?.metrics?.[2]?.value, null);
});

test("California uses dedicated GPC evidence and keeps Reject and site opt-out separate", () => {
  const { assessment } = gpcProductFixture({ scanId: scan.id, urls: ["https://www.google-analytics.com/g/collect?v=2"] });
  const response = { assessment, headline: "", summary: "", comparisonHeadline: "", coverageSummary: "", observedFacts: [], evidenceRefs: [], californiaDeductionPoints: 0 as const };
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [emptyMetric], gpcResponse: response }, "ccpa_cpra");
  assert.deepEqual(tiles.map(tile => tile.id), ["before", "accept", "reject", "opt-out", "gpc", "forms"]);
  assert.equal(tiles[0]?.count, 0);
  assert.equal(tiles[2]?.count, null);
  assert.equal(tiles[3]?.count, null);
  assert.equal(tiles[4]?.count, assessment.observation.requests.classifiedCount);
  const unavailable = buildConsentTrackingOverview({ scan, gpcLaneStatus: "not_requested" }, "ccpa_cpra");
  assert.equal(unavailable[2]?.evidence, undefined);
  assert.equal(unavailable[3]?.evidence, undefined);
  assert.equal(unavailable[3]?.notes, undefined);
  assert.equal(unavailable[4]?.count, null);
  assert.equal(unavailable[4]?.state, "not_tested");
  assert.deepEqual(unavailable[4]?.notes, []);
  assert.equal(unavailable[5]?.evidence, undefined);
});

test("a verified California opt-out reports its own bounded advertising sample, including zero", () => {
  const requests = [{ hostname: "ads.example.test", vendor: "Example Ads", purpose: "advertising", httpStatus: 204, msAfterConfirmation: 300 }];
  for (const rows of [requests, []]) {
    const evidence = saleSharingOptOutEvidenceSchema.parse({
      contractVersion: "certscore.sale-sharing-opt-out-evidence.v1", policyVersion: "bounded_sale_sharing_opt_out.v1",
      scanId: scan.id, parentDispatchSha256: "a".repeat(64), targetUrl: "https://fixture.example/", documentToken: "action-doc",
      startedAt: "2026-10-16T12:00:00.000Z", completedAt: "2026-10-16T12:00:01.500Z", status: "complete",
      recipeVersion: "onetrust.explicit_sale_share.v1", provider: "OneTrust", actionCount: 2, submitted: true,
      registration: "confirmed", confirmedAt: "2026-10-16T12:00:00.500Z",
      before: { sectionId: 8, sale: 2, sharing: 2 }, after: { sectionId: 8, sale: 1, sharing: 1 },
      observationWindowMs: 500, captureComplete: true, truncated: false, requests: rows, limitations: [],
    });
    // The fixture exercises the already-verified observation read by the overview.
    const californiaPrivacyReview = { scanId: scan.id, optOutObservation: { evidence } } as CaliforniaPrivacyReview;
    const tiles = buildConsentTrackingOverview({ scan, californiaPrivacyReview }, "ccpa_cpra");
    assert.equal(tiles[2]?.count, null);
    assert.equal(tiles[3]?.count, rows.length);
    assert.equal(tiles[3]?.evidence, "privacy");
    assert.equal(tiles[3]?.facts?.find(fact => fact.label === "Post-confirmation observation")?.value, "500 ms");
  }
});
