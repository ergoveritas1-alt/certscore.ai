import assert from "node:assert/strict";
import test from "node:test";
import { buildConsentTrackingOverview } from "./consent-tracking-overview";
import { projectActionResourceInventory } from "./action-resource-inventory";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { afterRejectClickProjection } from "./test-fixtures/after-reject-scoring";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { gpcProductFixture } from "./test-fixtures/gpc-product";
import { saleSharingOptOutEvidenceSchema, postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";
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

test("GDPR combines distinct flagged resource groups, excludes unknown purpose and scopes GPC out", () => {
  const metric = { ...emptyMetric, overview: { ...emptyMetric.overview, distinctResources: 96227, distinctStorage: 4,
    distinctClassifications: { ...emptyMetric.overview.distinctClassifications,
      requests: { ...empty, nonEssential: 84593, review: 11625, unclassified: 9 }, storage: { ...empty, review: 4 } } } };
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [metric] }, "gdpr_eprivacy");
  assert.deepEqual(tiles.map(tile => tile.id), ["before", "accept", "reject", "services", "storage", "forms"]);
  assert.equal(tiles[0]?.count, 96222);
  assert.equal(tiles[0]?.metrics?.[0]?.counts?.unclassified, 9);
  assert.equal(tiles[0]?.metrics?.[1]?.counts?.review, 4);
});

test("verified zero flags can coexist with requests, and complete after-click observation can remain unconfirmed", () => {
  const accept = projectActionResourceInventory({ ...input, action: "accept", projection: completedActionProjection("accept") });
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [emptyMetric], formsSummary,
    actionInventories: { accept } }, "gdpr_eprivacy");
  assert.equal(tiles[0]?.count, 0);
  assert.equal(tiles[0]?.metrics?.[0]?.value, 9);
  assert.equal(tiles[0]?.notes, undefined);
  assert.equal(tiles[1]?.count, 0);
  assert.deepEqual(tiles[1]?.notes, []);
  assert.deepEqual(tiles[1]?.facts, [{ label: "Choice", value: "Click recorded, choice unconfirmed" }, { label: "Observed duration", value: "1 s" }]);
  assert.equal(tiles[2]?.count, null);
  assert.equal(tiles[4]?.count, null);
  assert.equal(tiles[5]?.count, 0);
  assert.equal(tiles[5]?.facts?.[1]?.value, "NA");
});

test("retained baseline storage reviews contribute to flagged items without changing canonical report data", () => {
  const metric = { ...emptyMetric, value: 45, overview: { ...emptyMetric.overview,
    distinctResources: 45, distinctStorage: 3,
    distinctClassifications: { ...emptyMetric.overview.distinctClassifications,
      requests: { ...empty, contextual: 12, unclassified: 33 }, storage: { ...empty, essential: 1, review: 2 } } } };
  const report = { scan, inventorySummary: [metric],
    score: { value: 88 }, postureScores: { gdprEprivacy: { score: 88 }, ccpaCpra: { score: 96 } },
    findings: [{ id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", status: "Partial concern" },
      { id: "semantic_labeling_accessibility_issue", status: "Observed" }] };
  const unchanged = structuredClone(report);
  const tiles = buildConsentTrackingOverview(report, "gdpr_eprivacy");
  assert.equal(tiles[0]?.count, 2);
  assert.equal(tiles[0]?.unit, "flagged items");
  assert.deepEqual(tiles[0]?.breakdown, { nonEssential: 0, review: 2 });
  assert.deepEqual(tiles.slice(1, 3).map(tile => tile.label), ["After Accept click", "After Reject click"]);
  assert.equal(tiles[3]?.label, "Services pre-consent");
  assert.equal(tiles[3]?.count, 0);
  assert.equal(tiles[4]?.count, 3);
  assert.equal(tiles[4]?.metrics?.[0]?.counts?.review, 2);
  assert.deepEqual(report, unchanged);
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
  assert.equal(tiles[2]?.metrics?.[0]?.counts?.review, 0);
  assert.equal(tiles[2]?.metrics?.[2]?.value, null);
});

test("California uses dedicated GPC evidence and keeps Reject and site opt-out separate", () => {
  const { assessment, activityComparison } = gpcProductFixture({ scanId: scan.id, urls: ["https://www.google-analytics.com/g/collect?v=2"] });
  const response = { assessment, activityComparison, headline: "", summary: "", comparisonHeadline: "", coverageSummary: "", observedFacts: [], evidenceRefs: [], californiaDeductionPoints: 0 as const };
  const tiles = buildConsentTrackingOverview({ scan, inventorySummary: [emptyMetric], gpcResponse: response }, "ccpa_cpra");
  assert.deepEqual(tiles.map(tile => tile.id), ["before", "accept", "reject", "opt-out", "gpc", "forms"]);
  assert.equal(tiles[0]?.count, 0);
  assert.equal(tiles[2]?.count, null);
  assert.equal(tiles[3]?.count, null);
  assert.ok(activityComparison);
  assert.equal(tiles[4]?.count, null, "matched requests alone supply no resource classifications");
  assert.equal(tiles[4]?.unit, "flagged items");
  assert.deepEqual(tiles[4]?.gpcWindow, { durationMs: activityComparison.durationMs, activity: activityComparison.activity });
  const unpaired = buildConsentTrackingOverview({ scan, gpcResponse: { ...response, activityComparison: undefined } }, "ccpa_cpra")[4]!;
  assert.equal(unpaired.count, null);
  assert.equal(unpaired.gpcWindow, undefined);
  assert.equal(unpaired.state, "unavailable");
  const unavailable = buildConsentTrackingOverview({ scan, gpcLaneStatus: "not_requested" }, "ccpa_cpra");
  assert.equal(unavailable[2]?.evidence, undefined);
  assert.equal(unavailable[3]?.evidence, undefined);
  assert.equal(unavailable[3]?.notes, undefined);
  assert.equal(unavailable[4]?.count, null);
  assert.equal(unavailable[4]?.state, "not_tested");
  assert.equal(unavailable[4]?.notes, undefined);
  assert.equal(unavailable[5]?.evidence, undefined);
});

test("Accept and Reject include distinct storage with requests and classify observed cookies requiring review once", () => {
  for (const id of ["accept", "reject"] as const) {
    const base = completedActionProjection(id);
    const request = afterRejectClickProjection().afterActionRequests![0]!;
    const cookie = { storageType: "cookie", name: "example", identityBasis: "cookie_name_domain_path_partition",
      identityHash: "e".repeat(64), valueHash: "f".repeat(64), purpose: "analytics", nonEssential: true };
    const projection = { ...base, afterActionCapture: { ...base.afterActionCapture,
      requestIds: [request.requestId, "repeat"],
      requestAncestry: [request.requestId, "repeat"].map(requestId => ({ requestId, rootStartedAtMs: request.rootStartedAtMs })),
    }, afterActionRequests: [request, { ...request, requestId: "repeat" }],
      afterActionStorage: [cookie, cookie, { ...cookie, identityHash: "d".repeat(64), nonEssential: false, purpose: "unknown" }] };
    const original = structuredClone(projection);
    (id === "accept" ? postAcceptReportProjectionSchema : postRefusalReportProjectionSchema).parse(projection);
    const capture = projectActionResourceInventory({ ...input, action: id, projection });
    assert.ok(capture);
    const tile = buildConsentTrackingOverview({ scan, actionInventories: { [id]: capture } }, "gdpr_eprivacy").find(tile => tile.id === id)!;
    assert.equal(tile.count, 3);
    assert.equal(tile.unit, "flagged items");
    assert.deepEqual(tile.breakdown, { nonEssential: 2, review: 1 });
    assert.equal(tile.metrics?.[0]?.value, 1);
    assert.equal(tile.metrics?.[1]?.value, 2);
    assert.equal(tile.metrics?.[1]?.counts?.review, 1);
    assert.deepEqual(projection, original);

    // A partial storage-only positive observation remains visible.
    const partial = projectActionResourceInventory({ ...input, action: id, projection: {
      ...projection, afterActionRequests: [], afterActionCapture: { ...base.afterActionCapture, stopReason: "aborted" },
    } });
    assert.ok(partial);
    const partialTile = buildConsentTrackingOverview({ scan, actionInventories: { [id]: partial } }, "gdpr_eprivacy").find(tile => tile.id === id)!;
    assert.equal(partialTile.count, 2);
    assert.equal(partialTile.state, "partial");
    assert.equal(partialTile.breakdown?.review, 1);
  }
});

test("baseline flagged items include classified frames and storage, excluding essential and contextual resources", () => {
  const metric = { ...emptyMetric, overview: { ...emptyMetric.overview, distinctStorage: 7, distinctEmbeds: 4,
    distinctClassifications: { requests: { ...empty, nonEssential: 1, review: 2, unclassified: 6 },
      storage: { ...empty, nonEssential: 1, review: 1, essential: 5 },
      embeds: { ...empty, nonEssential: 1, review: 1, contextual: 2 } } } };
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const tile = buildConsentTrackingOverview({ scan, inventorySummary: [metric] }, focus)[0]!;
    assert.equal(tile.count, 7);
    assert.deepEqual(tile.breakdown, { nonEssential: 3, review: 4 });
  }
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
    assert.equal(tiles[3]?.facts?.find(fact => fact.label === "Post-confirmation observation")?.value, "0.5 s");
  }
});

test("GPC and choice tiles count distinct classified resources, independently of request events and the matched window", () => {
  const { assessment, activityComparison } = gpcProductFixture({ scanId: scan.id });
  const gpcResponse = { assessment, activityComparison, headline: "", summary: "", comparisonHeadline: "",
    coverageSummary: "", observedFacts: [], evidenceRefs: [], californiaDeductionPoints: 0 as const };
  const row = (key: string, kind: string, inventoryEvidence: string) => ({ key, kind, inventoryEvidence, occurrence: {details:{}}, eventCount: 7, context: { identity: null } });
  const ad = row("a", "request", "Non-essential");
  const resources = [ad, ad, row("b", "cookie", "Non-essential"), row("c", "request", "Review"),
    row("d", "storage", "Unclassified"), row("e", "request", "Essential"), row("f", "embed", "Contextual")];
  const capture = (items: typeof resources, status: string) => ({
    inventory: { services: [{ key: "unattributed", context: { identity: null }, resources: items }] },
    captureCoverage: { status },
  } as unknown as NonNullable<typeof SHADOW_REPORT.gpcResourceInventory>);
  const tile = (items: typeof resources, status: string) => buildConsentTrackingOverview({
    scan, gpcResponse, gpcResourceInventory: capture(items, status),
  }, "ccpa_cpra")[4]!;
  assert.equal(tile(resources, "complete").count, 3);
  assert.deepEqual(tile(resources, "complete").breakdown, { nonEssential: 2, review: 1 });
  assert.equal(tile([], "complete").count, 0);
  assert.equal(tile([], "limited").count, null);
  assert.equal(tile(resources, "limited").count, 3);
  assert.equal(tile(resources, "limited").state, "partial");
});

test("both click inventories retain ordinary CDN images as contextual and preserve flagged image activity", () => {
  for (const action of ["accept", "reject"] as const) {
    const base = completedActionProjection(action);
    const request = { requestId: "image", sanitizedUrl: "https://cdn.sanity.io/images/abc/production/photo.png",
      method: "GET", resourceType: "image", hostname: "cdn.sanity.io", startedAtMs: 200, rootStartedAtMs: 200,
      httpStatus: 200, nonEssential: false, purpose: "infrastructure", responseCookieNamesSet: [],
      inFlightAtAcceptanceRegistration: false, inFlightAtRefusalRegistration: false };
    for (const [row, expected] of [
      [request, "Contextual"],
      [{ ...request, sanitizedUrl: request.sanitizedUrl + "?auto=format&w=100" }, "Contextual"],
      [{ ...request, sanitizedUrl: request.sanitizedUrl + "?uid=redacted" }, "Review"],
      [{ ...request, responseCookieNamesSet: ["id"] }, "Review"],
      [{ ...request, purpose: "advertising", nonEssential: true }, "Non-essential"],
    ] as const) {
      const capture = projectActionResourceInventory({ ...input, action, projection: { ...base,
        afterActionCapture: { ...base.afterActionCapture, requestIds: ["image"], requestAncestry: [{ requestId: "image", rootStartedAtMs: 200 }] },
        afterActionRequests: [row] } });
      assert.ok(capture);
      assert.equal(capture.inventory.resources[0]?.inventoryEvidence, expected);
      const tile = buildConsentTrackingOverview({ scan, actionInventories: { [action]: capture } }, "ccpa_cpra").find(t => t.id === action)!;
      assert.equal(tile.count, expected === "Contextual" ? 0 : 1);
    }
  }
});

test("Accept and Reject count successful measurement endpoints once and retain their tag libraries", () => {
  for (const action of ["accept", "reject"] as const) {
    const base = completedActionProjection(action);
    const rows = [
      ["https://www.googletagmanager.com/gtm.js", "GET", "script", true, undefined, 200],
      ["https://www.googletagmanager.com/gtag/js", "GET", "script", true, undefined, 200],
      ["https://measure.fixture.test/g/collect", "GET", "fetch", false, "analytics", 200],
      ["https://pagead2.googlesyndication.com/ccm/collect", "POST", "fetch", true, undefined, 200],
      ["https://pagead2.googlesyndication.com/ccm/collect", "POST", "fetch", true, undefined, 200],
      ["https://www.sanity.io/intake/dp/beacon/v1/batch", "POST", "ping", false, undefined, 204],
      ["https://www.sanity.io/intake/dp/beacon/v1/batch?writeKey=example", "POST", "ping", false, undefined, 200],
      ["https://failed.fixture.test/g/collect", "GET", "fetch", true, "analytics", 503],
    ] as const;
    const requests = rows.map(([sanitizedUrl, method, resourceType, nonEssential, choiceRequestRole, httpStatus], index) => ({
      sanitizedUrl, method, resourceType, nonEssential, choiceRequestRole, httpStatus, requestId: String(index),
      hostname:new URL(sanitizedUrl).hostname, startedAtMs:200, rootStartedAtMs:200,
    }));
    const capture = projectActionResourceInventory({...input, action, projection:{...base,
      afterActionCapture:{...base.afterActionCapture, requestIds:requests.map(r=>r.requestId), requestAncestry:requests.map(r=>({requestId:r.requestId, rootStartedAtMs:200}))},
      afterActionRequests:requests}});
    assert.ok(capture);
    const tile = buildConsentTrackingOverview({scan, actionInventories:{[action]:capture}}, "ccpa_cpra").find(t=>t.id===action)!;
    assert.deepEqual(tile.breakdown, {nonEssential:2, review:1});
    const beacons = capture.inventory.resources.filter(r => r.name.includes("/intake/dp/beacon/v1/batch"));
    assert.equal(beacons.length, 1);
    assert.equal(beacons[0]?.inventoryEvidence, "Review");
    assert.equal(beacons[0]?.eventCount, 2);
    assert.equal(capture.inventory.resources.filter(r=>r.inventoryEvidence==="Contextual").length, 2);
    assert.equal(capture.inventory.resources.find(r=>r.name.includes("failed.fixture"))?.inventoryEvidence,"Unclassified");
  }
});

test("GPC and choice tiles count distinct classified resources, independently of request events and the matched window", () => {
  const { assessment, activityComparison } = gpcProductFixture({ scanId: scan.id });
  const gpcResponse = { assessment, activityComparison, headline: "", summary: "", comparisonHeadline: "",
    coverageSummary: "", observedFacts: [], evidenceRefs: [], californiaDeductionPoints: 0 as const };
  const row = (key: string, kind: string, inventoryEvidence: string) => ({ key, kind, inventoryEvidence, occurrence: {details:{}}, eventCount: 7, context: { identity: null } });
  const ad = row("a", "request", "Non-essential");
  const resources = [ad, ad, row("b", "cookie", "Non-essential"), row("c", "request", "Review"),
    row("d", "storage", "Unclassified"), row("e", "request", "Essential"), row("f", "embed", "Contextual")];
  const capture = (items: typeof resources, status: string) => ({
    inventory: { services: [{ key: "unattributed", context: { identity: null }, resources: items }] },
    captureCoverage: { status },
  } as unknown as NonNullable<typeof SHADOW_REPORT.gpcResourceInventory>);
  const tile = (items: typeof resources, status: string) => buildConsentTrackingOverview({
    scan, gpcResponse, gpcResourceInventory: capture(items, status),
  }, "ccpa_cpra")[4]!;
  assert.equal(tile(resources, "complete").count, 3);
  assert.deepEqual(tile(resources, "complete").breakdown, { nonEssential: 2, review: 1 });
  assert.equal(tile([], "complete").count, 0);
  assert.equal(tile([], "limited").count, null);
  assert.equal(tile(resources, "limited").count, 3);
  assert.equal(tile(resources, "limited").state, "partial");
});

test("both click inventories retain ordinary CDN images as contextual and preserve flagged image activity", () => {
  for (const action of ["accept", "reject"] as const) {
    const base = completedActionProjection(action);
    const request = { requestId: "image", sanitizedUrl: "https://cdn.sanity.io/images/abc/production/photo.png",
      method: "GET", resourceType: "image", hostname: "cdn.sanity.io", startedAtMs: 200, rootStartedAtMs: 200,
      httpStatus: 200, nonEssential: false, purpose: "infrastructure", responseCookieNamesSet: [],
      inFlightAtAcceptanceRegistration: false, inFlightAtRefusalRegistration: false };
    for (const [row, expected] of [
      [request, "Contextual"],
      [{ ...request, sanitizedUrl: request.sanitizedUrl + "?auto=format&w=100" }, "Contextual"],
      [{ ...request, sanitizedUrl: request.sanitizedUrl + "?uid=redacted" }, "Review"],
      [{ ...request, responseCookieNamesSet: ["id"] }, "Review"],
      [{ ...request, purpose: "advertising", nonEssential: true }, "Non-essential"],
    ] as const) {
      const capture = projectActionResourceInventory({ ...input, action, projection: { ...base,
        afterActionCapture: { ...base.afterActionCapture, requestIds: ["image"], requestAncestry: [{ requestId: "image", rootStartedAtMs: 200 }] },
        afterActionRequests: [row] } });
      assert.ok(capture);
      assert.equal(capture.inventory.resources[0]?.inventoryEvidence, expected);
      const tile = buildConsentTrackingOverview({ scan, actionInventories: { [action]: capture } }, "ccpa_cpra").find(t => t.id === action)!;
      assert.equal(tile.count, expected === "Contextual" ? 0 : 1);
    }
  }
});

test("Accept and Reject count successful measurement endpoints once and retain their tag libraries", () => {
  for (const action of ["accept", "reject"] as const) {
    const base = completedActionProjection(action);
    const rows = [
      ["https://www.googletagmanager.com/gtm.js", "GET", "script", true, undefined, 200],
      ["https://www.googletagmanager.com/gtag/js", "GET", "script", true, undefined, 200],
      ["https://measure.fixture.test/g/collect", "GET", "fetch", false, "analytics", 200],
      ["https://pagead2.googlesyndication.com/ccm/collect", "POST", "fetch", true, undefined, 200],
      ["https://pagead2.googlesyndication.com/ccm/collect", "POST", "fetch", true, undefined, 200],
      ["https://www.sanity.io/intake/dp/beacon/v1/batch", "POST", "ping", false, undefined, 204],
      ["https://www.sanity.io/intake/dp/beacon/v1/batch?writeKey=example", "POST", "ping", false, undefined, 200],
      ["https://failed.fixture.test/g/collect", "GET", "fetch", true, "analytics", 503],
    ] as const;
    const requests = rows.map(([sanitizedUrl, method, resourceType, nonEssential, choiceRequestRole, httpStatus], index) => ({
      sanitizedUrl, method, resourceType, nonEssential, choiceRequestRole, httpStatus, requestId: String(index),
      hostname:new URL(sanitizedUrl).hostname, startedAtMs:200, rootStartedAtMs:200,
    }));
    const capture = projectActionResourceInventory({...input, action, projection:{...base,
      afterActionCapture:{...base.afterActionCapture, requestIds:requests.map(r=>r.requestId), requestAncestry:requests.map(r=>({requestId:r.requestId, rootStartedAtMs:200}))},
      afterActionRequests:requests}});
    assert.ok(capture);
    const tile = buildConsentTrackingOverview({scan, actionInventories:{[action]:capture}}, "ccpa_cpra").find(t=>t.id===action)!;
    assert.deepEqual(tile.breakdown, {nonEssential:2, review:1});
    const beacons = capture.inventory.resources.filter(r => r.name.includes("/intake/dp/beacon/v1/batch"));
    assert.equal(beacons.length, 1);
    assert.equal(beacons[0]?.inventoryEvidence, "Review");
    assert.equal(beacons[0]?.eventCount, 2);
    assert.equal(capture.inventory.resources.filter(r=>r.inventoryEvidence==="Contextual").length, 2);
    assert.equal(capture.inventory.resources.find(r=>r.name.includes("failed.fixture"))?.inventoryEvidence,"Unclassified");
  }
});
