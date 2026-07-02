import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assessPulseScanRecordQuality } from "./projection";

function pulseScanRecord(overrides: Record<string, unknown> = {}) {
  return {
    accessPostureSummary: {
      homepageFetchStatus: null,
      interruptionLabel: null,
      interruptionReason: null,
      stopOutcomeTitle: null,
      stopReason: null,
      stopReviewTitle: null
    },
    policyEnrichment: [],
    regulatoryRisk: null,
    scan: {
      pagesRequested: 1,
      pagesScanned: 0,
      status: "completed"
    },
    snapshot: {},
    trackerVendors: [],
    ...overrides
  } as never;
}

test("Pulse projection does not cap top findings by detail level", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /const topFindings = regulatoryGapTopFindings\.length > 0 \? regulatoryGapTopFindings : executive\.topFindings/);
  assert.match(source, /reportSurface\.topFindings\.map\(/);
  assert.doesNotMatch(source, /topFindings = executive\.topFindings\.slice\(/);
  assert.doesNotMatch(source, /input\.detail === "tiny" \? 3 : 5/);
});

test("Pulse quality gate rejects completed shells with no retained public evidence", () => {
  const quality = assessPulseScanRecordQuality(pulseScanRecord());

  assert.equal(quality.usable, false);
  assert.equal(quality.level, "unavailable");
  assert.equal(quality.reason, "completed_without_retained_public_evidence");
});

test("Pulse quality gate keeps explicit access-limited scans usable as limitations", () => {
  const quality = assessPulseScanRecordQuality(
    pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: null,
        interruptionLabel: "Access limited",
        interruptionReason: "Bot challenge prevented retained homepage evidence.",
        stopOutcomeTitle: "Public site access was limited",
        stopReason: "bot_challenge",
        stopReviewTitle: "Public site access was limited"
      }
    })
  );

  assert.equal(quality.usable, true);
  assert.equal(quality.level, "usable_with_limitations");
  assert.equal(quality.reason, "retained_access_limitation");
});

test("Pulse route rejects unusable completed scan records before projection", () => {
  const source = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");

  assert.match(source, /loadPulseScanRecord/);
  assert.match(source, /assessPulseScanRecordQuality\(scanRecord\)/);
  assert.match(source, /pulseUnavailableResponse/);
  assert.match(source, /recentScanWasUnusable/);
  assert.match(source, /bypassRecentScanReuse: forceNewScan \|\| recentScanWasUnusable/);
});

test("Pulse projection exposes explicit counts for agent summaries", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function buildPulseCounts/);
  assert.match(source, /totalObservationCount: input\.allFindingCount/);
  assert.match(source, /highPriorityFindingCount/);
  assert.match(source, /counts: base\.counts/);
});

test("Pulse projection exposes Summary JSON and Evidence JSON artifacts", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");
  const adminSource = readFileSync(new URL("../../server/admin/list-pulse-requests.ts", import.meta.url), "utf8");

  assert.match(source, /type: "certscore_pulse_summary"/);
  assert.match(source, /type: "certscore_pulse_evidence"/);
  assert.match(source, /summaryJsonUrl/);
  assert.match(source, /evidenceJsonUrl/);
  assert.match(source, /function capArray/);
  assert.match(routeSource, /recordPulseArtifactDownload/);
  assert.match(routeSource, /summary_json/);
  assert.match(routeSource, /evidence_json/);
  assert.match(adminSource, /pulse_artifact_downloads/);
  assert.match(adminSource, /summary_json_downloads/);
  assert.match(adminSource, /evidence_json_downloads/);
});
