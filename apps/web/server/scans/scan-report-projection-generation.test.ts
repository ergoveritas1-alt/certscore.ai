import assert from "node:assert/strict";
import test from "node:test";
import {
  getCanonicalScanReportPublicationReadiness,
  getScanReportProjectionGeneration,
  isSameScanReportProjectionGeneration,
  isScanReportProjectionSourceEvent
} from "./scan-report-projection-generation";

function event(index: number, createdAt: string) {
  return {
    createdAt,
    eventType: index === 12 ? "findings.unified_derivation_completed" : "scan.progress",
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    message: "fixture",
    metadataJson: null
  };
}

test("CNN-style stale and canonical event generations cannot compare equal", () => {
  const canonicalEvents = Array.from({ length: 13 }, (_, index) =>
    event(index, `2026-07-31T16:36:${String(index).padStart(2, "0")}.000Z`)
  );
  const stale = getScanReportProjectionGeneration({ events: canonicalEvents.slice(0, 6) });
  const canonical = getScanReportProjectionGeneration({ events: canonicalEvents });

  assert.deepEqual(stale, {
    eventCount: 6,
    latestEventId: "00000000-0000-0000-0000-000000000005"
  });
  assert.equal(canonical.eventCount, 13);
  assert.equal(isSameScanReportProjectionGeneration(stale, canonical), false);
  assert.equal(isSameScanReportProjectionGeneration(canonical, canonical), true);
});

test("CNN-style pre-completion record fails closed until canonical findings are ready", () => {
  assert.deepEqual(getCanonicalScanReportPublicationReadiness({
    findingsReady: false,
    mergedSignalsReady: false,
    projectionRequired: true,
    scanStatus: "completed"
  }), { ready: false, reason: "canonical_findings_not_ready" });
  assert.deepEqual(getCanonicalScanReportPublicationReadiness({
    findingsReady: true,
    mergedSignalsReady: true,
    projectionRequired: true,
    scanStatus: "completed"
  }), { ready: true, reason: "canonical_inputs_ready" });
});

test("generation selects the latest event deterministically even when input is unsorted", () => {
  const generation = getScanReportProjectionGeneration({
    events: [
      event(2, "2026-07-31T16:36:22.000Z"),
      event(3, "2026-07-31T16:36:22.000Z"),
      event(1, "2026-07-31T16:36:21.000Z")
    ]
  });
  assert.deepEqual(generation, {
    eventCount: 3,
    latestEventId: "00000000-0000-0000-0000-000000000003"
  });
});

test("generation preserves repository order when database timestamp precision collapses in JavaScript", () => {
  const collapsedAt = "2026-09-02T02:36:05.803Z";
  const earlierDatabaseRow = {
    ...event(1, collapsedAt),
    id: "aac9b57a-8b19-404d-85b4-6154930df75c"
  };
  const laterDatabaseRow = {
    ...event(2, collapsedAt),
    id: "725fc262-2bf1-44c6-b2bd-ef3f54ae71d3"
  };

  assert.deepEqual(
    getScanReportProjectionGeneration({ events: [earlierDatabaseRow, laterDatabaseRow] }),
    {
      eventCount: 2,
      latestEventId: laterDatabaseRow.id
    }
  );
});

test("artifact-only policy handoff events do not invalidate report generation", () => {
  const canonicalEvents = [event(1, "2026-07-31T16:36:21.000Z")];
  const withInternalPolicyHandoff = [
    ...canonicalEvents,
    {
      ...event(2, "2026-07-31T16:36:22.000Z"),
      eventType: "v2_policy_evidence.received"
    }
  ];

  assert.equal(isScanReportProjectionSourceEvent("v2_policy_evidence.received"), false);
  assert.equal(isScanReportProjectionSourceEvent("findings.unified_derivation_completed"), true);
  assert.deepEqual(
    getScanReportProjectionGeneration({ events: withInternalPolicyHandoff }),
    getScanReportProjectionGeneration({ events: canonicalEvents })
  );
});

test("internal early-review lifecycle does not restart publication; canonical changes do", () => {
  const baseline = [event(1, "2026-07-31T16:36:21.000Z")];
  const internal = ["v2_policy_evidence.verified", "v2_policy_review.started", "v2_runtime_preview.received"]
    .map((eventType, index) => ({ ...event(index + 2, "2026-07-31T16:36:22.000Z"), eventType }));
  const generation = getScanReportProjectionGeneration({ events: baseline });
  assert.deepEqual(getScanReportProjectionGeneration({ events: [...baseline, ...internal] }), generation);
  for (const eventType of ["browser_extension.observed_signals_ingested", "v2_lambda_result.received", "findings.unified_derivation_completed"]) {
    assert.equal(isSameScanReportProjectionGeneration(generation,
      getScanReportProjectionGeneration({ events: [...baseline, { ...event(5, "2026-07-31T16:36:23.000Z"), eventType }] })), false);
  }
});

test("worker and polling publication share a lock and reuse only a verified current generation", async () => {
  const { readFile } = await import("node:fs/promises");
  const publisher = await readFile("apps/web/server/scans/canonical-scan-report-publisher.ts", "utf8");
  const route = await readFile("apps/web/app/api/internal/scan-score-materialization/route.ts", "utf8");
  assert.match(publisher, /withNonBlockingDatabaseLock\([\s\S]*canonical-report-publication:/);
  assert.match(publisher, /!isCurrentScanReportProjectionReady\(rawRecord.snapshot\)/);
  assert.match(publisher, /getPersistedScanReportProjection\(rawRecord\)/);
  assert.match(publisher, /isSameScanReportProjectionGeneration/);
  assert.ok(publisher.indexOf('reason: "already_published"') < publisher.indexOf("const materializedRecord"));
  assert.match(route, /publishCanonicalScanReportProjection\(/);
  assert.doesNotMatch(route, /persistScanReportProjection\(|materializeLocalV2DagScanDetail\(/);
  const repair = await readFile("apps/web/app/api/internal/scan-report-projection-backfill/route.ts", "utf8");
  assert.match(repair, /forceRebuild: true/);
});

test("projection persistence and materialization cache both bind to the event generation", async () => {
  const { readFile } = await import("node:fs/promises");
  const [projectionSource, materializerSource, publisherSource] = await Promise.all([
    readFile("apps/web/server/scans/scan-report-projection.ts", "utf8"),
    readFile("apps/web/server/scans/local-v2-dag-report.ts", "utf8"),
    readFile("apps/web/server/scans/canonical-scan-report-publisher.ts", "utf8")
  ]);
  assert.match(projectionSource, /count\(\*\)[\s\S]*scan_events source_events/);
  assert.match(projectionSource, /SCAN_REPORT_PROJECTION_NON_SOURCE_EVENT_TYPES/);
  assert.match(projectionSource, /not \(source_events\.event_type = any\(\$43::text\[\]\)\)/);
  assert.match(projectionSource, /order by source_events\.created_at desc, source_events\.id desc/);
  assert.match(projectionSource, /StaleScanReportProjectionSourceError/);
  assert.match(materializerSource, /getScanReportProjectionGeneration\(scanRecord\)/);
  assert.match(publisherSource, /stale_source_retry/);
  assert.match(publisherSource, /STALE_SOURCE_MAX_ATTEMPTS\s*=\s*4/);
});
