import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assessPulseScanRecordQuality,
  buildPulseNoGoState,
  hasMeaningfulPolicyAnchor,
  isPublicPulseApiFinding
} from "./projection";
import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";

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

  assert.match(source, /const publicExecutiveTopFindings = executive\.topFindings\.filter\(isPublicPulseApiFinding\)/);
  assert.match(source, /const topFindings = regulatoryGapTopFindings\.length > 0 \? regulatoryGapTopFindings : publicExecutiveTopFindings/);
  assert.match(source, /reportSurface\.topFindings\.map\(/);
  assert.doesNotMatch(source, /topFindings = executive\.topFindings\.slice\(/);
  assert.doesNotMatch(source, /input\.detail === "tiny" \? 3 : 5/);
});

test("Pulse public API scope excludes non-GDPR product risk findings", () => {
  assert.equal(
    isPublicPulseApiFinding({
      id: "high_risk_product_risk_disclosure_missing",
      section: "Financial & Claims"
    }),
    false
  );
  assert.equal(
    isPublicPulseApiFinding({
      id: "pre_consent_tracking_detected",
      section: "Privacy & Tracking"
    }),
    true
  );
  assert.equal(
    isPublicPulseApiFinding({
      id: "scan_quality_visual_no_go",
      section: "Runtime & Diagnostics"
    }),
    true
  );
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

test("Pulse no-go state preserves every canonical reason", () => {
  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[reasonCode];
    const state = buildPulseNoGoState({
      scan_no_go_assessment: { decision: "no_go", reasonCodes: [reasonCode, "scan_no_go_corroborated"] },
      visual_access_review: { page_state: presentation.pageState, reason_code: reasonCode }
    });
    assert.equal(state?.scanStatus, "completed_limited", reasonCode);
    assert.equal(state?.resultDisposition, "no_go", reasonCode);
    assert.equal(state?.noGo.reasonCode, reasonCode, reasonCode);
    assert.equal(state?.noGo.title, presentation.customerTitle, reasonCode);
    assert.equal(state?.noGo.recommendedNextAction, presentation.recommendedNextAction, reasonCode);
    assert.equal(state?.resultQuality.reason, "scan_no_go", reasonCode);
  }
});

test("Pulse route rejects unusable completed scan records before projection", () => {
  const source = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");

  assert.match(source, /loadPulseScanRecord/);
  assert.match(source, /assessPulseScanRecordQuality\(scanRecord\)/);
  assert.match(source, /pulseUnavailableResponse/);
  assert.match(source, /getRecentScanReuseEligibility/);
  assert.match(source, /bypassRecentScanReuse: forceNewScan/);
  assert.doesNotMatch(source, /recentScanWasUnusable/);
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

test("Pulse evidence JSON includes diagnostic metadata and projection warnings", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /CANONICAL_VENDOR_RESOLVER_VERSION/);
  assert.match(source, /canonicalResolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION/);
  assert.match(source, /projectionWarnings/);
  assert.match(source, /regulatory_gap_runtime_anchor_from_retained_checklist_evidence/);
  assert.match(source, /third_party_service_connection_pre_consent/);
  assert.match(source, /social_media_embed_pre_consent/);
  assert.match(source, /session_replay_fingerprinting_review/);
  assert.match(source, /retainedEvidencePointer/);
  assert.match(source, /sourceEvidencePath/);
  assert.match(source, /sourceFindingId/);
  assert.match(source, /canonical_endpoint_vendor_replaced_raw_vendor/);
  assert.match(source, /request_event_missing_url/);
  assert.match(source, /projectionDiagnostics/);
  assert.match(source, /domainsRejected/);
  assert.match(source, /hostsRejected/);
  assert.match(source, /policy_surface_url_recovered_from_alternate_field/);
  assert.match(source, /coverage_limited_by_scan_quality_no_go/);
  assert.match(source, /promotion_grade_preconsent_request_not_available/);
});

test("Pulse evidence inventory filters display hostnames and deduplicates vendor rows", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function scanRecordVendors/);
  assert.match(source, /isInventoryDisplayHostname\(vendor\.scriptHost\)/);
  assert.match(source, /row\.domains\.filter\(isInventoryDisplayHostname\)\.slice\(0, 4\)/);
  assert.match(source, /const rows = new Map/);
  assert.match(source, /const vendors = scanRecordVendors\(input\.scanRecord\)/);
  assert.match(source, /total: vendors\.length/);
  assert.doesNotMatch(source, /return scanRecord\.trackerVendors\.map/);
  assert.doesNotMatch(source, /total: input\.scanRecord\.trackerVendors\.length/);
});

test("Pulse example events do not borrow vendors by list position", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /inferDirectEndpointVendorFromUrl/);
  assert.match(source, /rawObservedVendor/);
  assert.match(source, /resolvedEndpointVendor/);
  assert.match(source, /relatedOrInitiatingVendor/);
  assert.match(source, /requestUrl: safeUrl/);
  assert.match(source, /initiatorUrl: safeUrl/);
  assert.match(source, /frameUrl: safeUrl/);
  assert.match(source, /redirectChain/);
  assert.match(source, /resourceType/);
  assert.match(source, /registrableDomain: getUrlRegistrableDomain/);
  assert.doesNotMatch(source, /const firstVendor = vendors\[0\]/);
  assert.doesNotMatch(source, /firstVendor\?\.name/);
  assert.doesNotMatch(source, /asStringArray\(details\.runtimeVendors\)\[0\]/);
});

test("Pulse full JSON policy surfaces use all retained policy URL field shapes", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function policySurfaceUrl/);
  assert.match(source, /row\.policy_page_url/);
  assert.match(source, /row\.policyPageUrl/);
  assert.match(source, /row\.page_url/);
  assert.match(source, /row\.pageUrl/);
  assert.match(source, /row\.source_url/);
  assert.match(source, /row\.sourceUrl/);
  assert.doesNotMatch(source, /url:\s*typeof row\.policy_page_url === "string" \? row\.policy_page_url : null/);
});

test("Pulse evidence digest keeps runtime basis for runtime-anchored findings", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /canonicalPhase \|\| hasTimingAnchor \|\| hasVendorAnchor/);
  assert.doesNotMatch(source, /hasPolicyAnchor \? "policy_surface_detection" : "runtime_observation"/);
});

test("Pulse evidence digest requires a real policy anchor", () => {
  assert.equal(hasMeaningfulPolicyAnchor({ policyRuntimeConflict: {} }), false);
  assert.equal(hasMeaningfulPolicyAnchor({ policyEvidence: { coveredTypes: ["privacy_policy"] } }), false);
  assert.equal(hasMeaningfulPolicyAnchor({ policyEvidence: { policyUrl: "https://example.com/privacy" } }), true);
  assert.equal(hasMeaningfulPolicyAnchor({ policyRuntimeConflict: { policySnippet: "Cookies may be used." } }), true);
});

test("Pulse no-go scans add coverage-limited framing to projected finding evidence", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /coverageLimitedByNoGo/);
  assert.match(source, /Coverage-limited:/);
  assert.match(source, /confidence: applyNoGoCoverageFraming \? "moderate" : finding\.confidence/);
  assert.match(source, /scan_quality_visual_no_go/);
});

test("Pulse evidence JSON exposes bounded cookie setter context", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /getRuntimeCookiePrimaryProvider/);
  assert.match(source, /primaryProvider/);
  assert.match(source, /relatedOrInitiatingVendor/);
  assert.match(source, /initiatorDomain: row\.initiatorDomain/);
  assert.match(source, /initiatorUrl: safeUrl\(row\.initiatorUrl\)/);
  assert.match(source, /initiatorVendor: row\.initiatorVendor/);
  assert.match(source, /responseUrl: safeUrl\(row\.responseUrl\)/);
  assert.match(source, /sourceRequestUrl: safeUrl\(row\.sourceRequestUrl\)/);
  assert.match(source, /setMethod: row\.setMethod/);
});
