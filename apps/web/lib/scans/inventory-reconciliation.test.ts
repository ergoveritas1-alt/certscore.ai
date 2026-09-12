import assert from "node:assert/strict";
import test from "node:test";
import { buildBrowserStorageInventoryRows, buildReportInventorySummary, classifyInventoryEvidence } from "./runtime-inventory-projection";
import { buildSinglePageResourceInventory } from "./single-page-resource-inventory";
import { inventoryMetricFamily, INVENTORY_METRIC_LABELS } from "./inventory-resource-semantics";
const projection = {
  contractVersion: "certscore.pre-consent-browser-storage-projection.v1", scanId: "scan",
  assessmentStatus: "observed", consentState: "pre_interaction", localStorageKeys: ["shared"],
  sessionStorageKeys: ["shared", "second", "second"], retainedStorageSnapshotCount: 2,
  storageFirstObservedAtMs: 3270, valuesRedacted: true, evidenceRefs: ["CanonicalEvidenceBundle.json#storageSnapshots"],
  limitationKeys: [], sourceHash: "a".repeat(64), sourceLane: "runtime_evidence",
};
test("retained storage preserves type/key distinction and reconciles summary, resources, services and export data", () => {
  const rows = buildBrowserStorageInventoryRows(projection, "scan");
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.type === "storage" && classifyInventoryEvidence(row) === "Review"));
  assert.ok(rows.every(row => row.cookieDetails.length === 0 && row.storageDetails?.origin === null));
  const summary = buildReportInventorySummary(rows);
  assert.equal(summary[0]!.value, 3);
  assert.equal(summary[0]!.counts?.review, 3);
  const inventory = buildSinglePageResourceInventory("scan", rows, []);
  assert.equal(new Set(inventory.resources.map(row => row.key)).size, 3);
  assert.equal(inventory.services.flatMap(service => service.resources).length, 3);
  assert.deepEqual(inventory.mix.type, [{ label: "storage", count: 3 }]);
  assert.ok(inventory.resources.every(row => row.kind === "storage"));
  assert.ok(inventory.resources.every(row => row.occurrence.evidenceRefs[0] === projection.evidenceRefs[0]));
  assert.ok(inventory.resources.every(row => row.occurrence.details.origin === null));
});
test("storage inventory fails closed on mismatched scans, malformed packets and absent retained observations", () => {
  assert.deepEqual(buildBrowserStorageInventoryRows(projection, "other"), []);
  for (const value of [undefined, {}, { ...projection, sourceHash: "bad" }, { ...projection, retainedStorageSnapshotCount: 0 }, { ...projection, assessmentStatus: "not_testable" }]) {
    assert.deepEqual(buildBrowserStorageInventoryRows(value, "scan"), []);
  }
});
test("SDK requests and actual frames have separate canonical metric families", () => {
  assert.equal(inventoryMetricFamily("request"), "requests");
  assert.equal(inventoryMetricFamily("embed"), "frames");
  assert.equal(INVENTORY_METRIC_LABELS.frames, "Embedded frames");
  assert.equal(buildReportInventorySummary([])[2]!.label, INVENTORY_METRIC_LABELS.frames);
});

// This tests the shared consumer boundary, not a display-only count correction.
test("persisted storage reaches canonical export and API without changing findings", async () => {
  const { buildRuntimeInventoryProjectionFromScan } = await import("./runtime-inventory-projection");
  const { buildApiV2PreConsentCookiesTrackers } = await import("../api-v2/scan-resource");
  const { buildCanonicalReportExport } = await import("../../server/scans/report-export");
  // Use a synthetic minimal persisted record rather than a network/DB dependency.
  const scanRecord = {
    scan: { id: "scan", domainHostname: "example.com", targetUrl: "https://example.com/", status: "completed", createdAt: "2026-09-12T00:00:00Z", completedAt: "2026-09-12T00:00:05Z", pagesScanned: 1 },
    trackerVendors: [], signals: [], signalHits: [], validationFindings: [], runtimeArtifacts: {},
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [], derivedContext: {},
      globalUnifiedFindings: [], legacyScoreAssessmentInput: { scanId: "scan" }, normalizedConcerns: [],
      ownerUnifiedFindings: [], topFindingIds: [], preConsentBrowserStorageProjection: projection,
    },
  } as unknown as Parameters<typeof buildRuntimeInventoryProjectionFromScan>[0];
  const api = buildApiV2PreConsentCookiesTrackers(scanRecord);
  assert.equal(api.summary.storageCount, 3);
  assert.equal(api.summary.cookieCount, 0);
  assert.equal(api.rows.filter(row => row.kind === "storage").length, 3);
  assert.equal(new Set(api.rows.map(row => row.id)).size, 3);
  assert.ok(api.rows.every(row => row.storageDetails?.origin === null));
  const exported = buildCanonicalReportExport(scanRecord);
  const text = JSON.stringify(exported);
  assert.match(text, /retained_scan_type_key/);
  assert.match(text, /sessionStorage/);
  assert.deepEqual(scanRecord.validationFindings, []);
});

test("origin-bound storage identities reconcile across report, resources and API without trimming keys", async () => {
  const { projectOriginBoundBrowserStorage } = await import("../../server/scans/pre-consent-browser-storage-projection");
  const { storageSnapshotSchema } = await import("@certscore/contracts");
  const snapshots = ["https://a.example.com", "https://b.example.com"].map(origin => storageSnapshotSchema.parse({
    artifactId: "storage", capturedAtMs: 5, consentStateAtTime: "pre_consent", url: origin,
    localStorage: {}, sessionStorage: {}, localStorageKeys: ["", " key "], sessionStorageKeys: [""],
    captureContext: { contractVersion: "storage-capture-context.v1", origin, localStorageReadComplete: true, sessionStorageReadComplete: true },
  }));
  const packet = projectOriginBoundBrowserStorage({ snapshots, scanId: "scan", sourceHash: "b".repeat(64) });
  const rows = buildBrowserStorageInventoryRows(packet, "scan");
  assert.equal(rows.length, 6);
  assert.equal(buildReportInventorySummary(rows)[0]?.value, 6);
  const resources = buildSinglePageResourceInventory("scan", rows, []).resources;
  assert.equal(new Set(resources.map(row => row.key)).size, 6);
  assert.ok(resources.some(row => row.name === " key "));
  assert.ok(resources.every(row => row.occurrence.details.identityBasis === "origin_type_key"));
  const { buildApiV2PreConsentCookiesTrackers } = await import("../api-v2/scan-resource");
  const { buildCanonicalReportExport } = await import("../../server/scans/report-export");
  const scanRecord = {
    scan: { id: "scan", domainHostname: "example.com", targetUrl: "https://example.com/", status: "completed", createdAt: "2026-09-12T00:00:00Z", completedAt: "2026-09-12T00:00:05Z", pagesScanned: 1 },
    trackerVendors: [], signals: [], signalHits: [], validationFindings: [], runtimeArtifacts: {},
    canonicalReportProjection: { artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [], derivedContext: {}, globalUnifiedFindings: [], legacyScoreAssessmentInput: { scanId: "scan" }, normalizedConcerns: [], ownerUnifiedFindings: [], topFindingIds: [], preConsentBrowserStorageProjection: packet },
  } as unknown as Parameters<typeof buildApiV2PreConsentCookiesTrackers>[0];
  const api = buildApiV2PreConsentCookiesTrackers(scanRecord);
  assert.equal(api.summary.storageCount, 6);
  assert.equal(new Set(api.rows.map(row => row.id)).size, 6);
  assert.ok(api.rows.every(row => row.storageDetails?.identityBasis === "origin_type_key"));
  assert.match(JSON.stringify(buildCanonicalReportExport(scanRecord)), /https:\/\/a.example.com/);
  // Identity follows origin/type/exact key, independently of page and timestamp.
  const otherPage = buildSinglePageResourceInventory("another-page", rows, []).resources;
  assert.deepEqual(resources.map(row => row.key), otherPage.map(row => row.key));
});

test("video SDK role requires a registered SDK endpoint and never creates an embedded frame", async () => {
  const { resolveCanonicalVendor } = await import("@certscore/vendor-resolver");
  const { buildRetainedRequestInventory } = await import("./retained-request-inventory");
  const sdk = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
  const resolved = resolveCanonicalVendor({ type: "request", url: sdk });
  assert.ok(resolved.status === "resolved");
  assert.equal(resolved.resourceRole, "video_ad_sdk");
  const other = resolveCanonicalVendor({ type: "request", url: "https://imasdk.googleapis.com/other" });
  assert.ok(other.status === "resolved");
  assert.equal(other.resourceRole, undefined);
  const requests = buildRetainedRequestInventory({ networkSummary: { metricBasis: "retained_unique_request_events", preConsentRequestCount: 1, retainedRequestEventCount: 1, totalRequestCount: 1 }, requestObservations: [{ requestUrl: sdk, preConsent: true, timestampMs: 1, resourceType: "script", method: "GET" }] });
  assert.ok(requests);
  const inventory = buildSinglePageResourceInventory("scan", [], requests);
  assert.equal(inventory.resources.length, 1);
  assert.equal(inventory.resources[0]?.kind, "request");
  assert.equal(inventory.resources[0]?.occurrence.resourceType, "script");
  assert.equal(inventory.resources[0]?.occurrence.details.resourceRole, "video_ad_sdk");
  assert.equal(inventory.resources.filter(row => row.kind === "embed").length, 0);
});
