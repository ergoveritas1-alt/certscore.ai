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
