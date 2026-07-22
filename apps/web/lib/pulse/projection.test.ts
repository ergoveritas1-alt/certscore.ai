import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = {
  exports: {},
  filename: serverOnlyPath,
  id: serverOnlyPath,
  isPreloading: false,
  loaded: true,
  path: serverOnlyPath,
  paths: []
};

const {
  assessPulseScanRecordQuality,
  buildCookieEvidenceExamples,
  buildRawHostInventory,
  buildTrackerFootprintBreakdown,
  buildPulseNoGoState,
  deriveConsentPlatform,
  getPulseExecutiveActionLabel,
  hasMeaningfulPolicyAnchor,
  isPublicPulseApiFinding,
  projectedPolicySurfaceRows
} = require("./projection") as typeof import("./projection");

test("Pulse executive action label follows the same posture as the rendered report", () => {
  assert.equal(getPulseExecutiveActionLabel("Action Needed"), "Action Needed");
  assert.equal(getPulseExecutiveActionLabel("Watch"), "Monitor");
  assert.equal(getPulseExecutiveActionLabel("Clear"), "Complete");
});

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

  assert.match(source, /const publicExecutiveTopFindings = executive\.topFindings\.filter\(\(finding\) =>/);
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

test("Pulse uses the same selected versioned GDPR/ePrivacy assessment as the report", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /gdprEprivacyScoreAssessment/);
  assert.match(source, /customerScoreAssessment/);
  assert.match(source, /coverageRatio: reportSurface\.customerScoreAssessment\.coverageRatio/);
  assert.match(source, /kind: reportSurface\.customerScoreAssessment\.scoreKind/);
  assert.match(source, /metricLabel: reportSurface\.customerScoreAssessment\.scoreKind/);
  assert.match(source, /selectedWithholdingReason/);
  assert.match(source, /version: reportSurface\.customerScoreAssessment\.scoreVersion/);
});

test("Pulse policy surfaces exclude unfetched guessed aliases and retain verified canonical pages", () => {
  const rows = projectedPolicySurfaceRows(pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://medal.tv/" },
    policyEnrichment: [
      { discoveryMethod: "guessed_common_path", policy_page_type: "privacy_policy", policy_page_url: "https://medal.tv/privacy-notice", status: "failed" },
      { discoveryMethod: "footer_link", policy_page_type: "privacy_policy", policy_page_url: "https://medal.tv/privacy", status: "fetched" },
      { discoveryMethod: "footer_link", policy_page_type: "cookie_policy", policy_page_url: "https://medal.tv/cookie-notice", status: "fetched" },
      { discoveryMethod: "footer_link", policy_page_type: "terms", policy_page_url: "https://medal.tv/terms", status: "fetched" }
    ],
    scan: { domainHostname: "medal.tv", pagesRequested: 1, pagesScanned: 1, status: "completed" }
  }));

  assert.deepEqual(rows.map((row) => row.url).sort(), [
    "https://medal.tv/cookie-notice",
    "https://medal.tv/privacy",
    "https://medal.tv/terms"
  ]);
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
  const calibrationSource = readFileSync(new URL("./calibration-context.ts", import.meta.url), "utf8");

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
  assert.match(source, /calibrationContext/);
  assert.match(calibrationSource, /scannerRegion: input\.scan\.provenance\?\.lambdaAwsRegion/);
  assert.match(calibrationSource, /site_language_primary/);
  assert.match(source, /gdprTransparencyTopicCandidateSummary/);
  assert.match(source, /domainsRejected/);
  assert.match(source, /hostsRejected/);
  assert.match(source, /policy_surface_url_recovered_from_alternate_field/);
  assert.match(source, /coverage_limited_by_scan_quality_no_go/);
  assert.match(source, /promotion_grade_preconsent_request_not_available/);
});

test("Pulse cookie findings require concrete cookie evidence and preserve snapshot timing limits", () => {
  const rows = [
    {
      category: "advertising",
      cookieName: "test_cookie",
      domain: ".doubleclick.net",
      firstObservedAtMs: 1500,
      initiatorVendor: "Google Tag Manager",
      party: "third_party",
      provider: "Google",
      setAtMs: 1500,
      setMethod: "set_cookie_header",
      sourceRequestUrl: "https://doubleclick.net/pagead/test",
      timingBasis: "set_cookie_header",
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "analytics",
      cookieName: "_ym_uid",
      domain: ".life.ru",
      firstObservedAtMs: 10875,
      initiatorVendor: null,
      party: "first_party",
      provider: "Yandex Metrica",
      setAtMs: null,
      setMethod: "browser_snapshot",
      sourceRequestUrl: null,
      timingBasis: "periodic_cookie_snapshot",
      timingEvidence: "periodic_cookie_snapshot"
    }
  ] as unknown as Parameters<typeof buildCookieEvidenceExamples>[1];

  assert.deepEqual(buildCookieEvidenceExamples("third_party_cookie_pre_consent", rows), [
    {
      category: "advertising",
      cookieDomain: ".doubleclick.net",
      cookieName: "test_cookie",
      exactWriteTimeObserved: true,
      party: "third_party",
      phase: "pre_consent",
      provider: "Google",
      relatedOrInitiatingVendor: "Google Tag Manager",
      setMethod: "set_cookie_header",
      sourceRequestUrl: "https://doubleclick.net/pagead/test",
      timestampMs: 1500,
      timingBasis: "set_cookie_header",
      type: "cookie_write"
    }
  ]);
  assert.deepEqual(buildCookieEvidenceExamples("analytics_cookie_pre_consent", rows), [
    {
      category: "analytics",
      cookieDomain: ".life.ru",
      cookieName: "_ym_uid",
      exactWriteTimeObserved: false,
      party: "first_party",
      phase: null,
      provider: "Yandex Metrica",
      relatedOrInitiatingVendor: null,
      setMethod: "browser_snapshot",
      sourceRequestUrl: null,
      timestampMs: null,
      timingBasis: "periodic_cookie_snapshot",
      type: "cookie_snapshot"
    }
  ]);
  assert.deepEqual(buildCookieEvidenceExamples("third_party_cookie_pre_consent", rows.slice(1)), []);
});

test("Pulse descriptive storage totals include explicit pre-consent observations without weakening promotion-grade timing", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /eligibleNonEssentialPreConsentStorageCount: input\.reportSurface\.runtimeCookieRows\.filter\(isEligibleNonEssentialPreconsentStorageRow\)\.length/);
  assert.match(source, /observedNonEssentialPreConsentStorageCount:/);
  assert.match(source, /hasUnresolvedNonEssentialPreconsentStorageEvidence/);
  assert.match(source, /nonEssentialPreConsentStorageCount =/);
  assert.match(source, /nonEssentialPreConsentStorage: nonEssentialPreConsentStorageCount/);
  assert.match(source, /unclassifiedPreConsentStorageCount/);
  assert.match(source, /const cookiesBeforeConsentCount = hasClassifiedRuntimeStorageRows/);
  assert.doesNotMatch(source, /const cookiesBeforeConsentCount = nonEssentialPreConsentStorageCount \?\?/);
  assert.match(source, /hasClassifiedRuntimeStorageRows \? "Non-essential storage" : "Pre-consent storage"/);
  assert.match(source, /hasClassifiedRuntimeStorageRows \? "nonessential_only" : "all_observed"/);
  assert.match(source, /storageMetricStatus/);
  assert.match(source, /Storage was scanned and none was detected/);
  assert.match(source, /Storage was not measured or retained/);
});

test("Pulse evidence inventory filters display hostnames and deduplicates vendor rows", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function scanRecordVendors/);
  assert.match(source, /isInventoryDisplayHostname\(vendor\.scriptHost\)/);
  assert.match(source, /row\.domains\.filter\(isInventoryDisplayHostname\)\.slice\(0, 4\)/);
  assert.match(source, /const rows = new Map/);
  assert.match(source, /const groupedTrackerRows = buildTrackerInventoryGroupRows/);
  assert.match(source, /classifiedTrackerVendors = groupedTrackerRows\.length/);
  assert.doesNotMatch(source, /return scanRecord\.trackerVendors\.map/);
  assert.doesNotMatch(source, /total: input\.scanRecord\.trackerVendors\.length/);
});

test("Pulse iFIT footprint separates vendor categories while preserving literal raw hosts", () => {
  const reportSurface = {
    runtimeCookieRows: [{ cookieName: "_ga" }, { cookieName: "wisepops_visitor" }],
    trackerInventoryRows: [
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["region1.analytics.google.com"],
        firstSeenMs: 2_343,
        label: "Google Analytics",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      },
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["api2.branch.io"],
        firstSeenMs: 25_309,
        label: "Branch Deep Linking and Attribution",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      },
      {
        category: "cdn",
        confidence: 0.95,
        domains: ["iconcdn-res.cloudinary.com"],
        firstSeenMs: 2_500,
        label: "Cloudinary CDN",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Functional"
      },
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["wisepops.net"],
        firstSeenMs: 7_000,
        label: "WisePops Onsite Campaigns",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      }
    ]
  } as never;

  const hosts = buildRawHostInventory(reportSurface);
  assert.deepEqual(hosts.map((row) => row.host), [
    "api2.branch.io",
    "iconcdn-res.cloudinary.com",
    "region1.analytics.google.com",
    "wisepops.net"
  ]);
  assert.deepEqual(buildTrackerFootprintBreakdown(reportSurface), {
    cdns: 1,
    consentPlatforms: 0,
    cookies: 2,
    displayedRows: 4,
    domains: 4,
    functionalServices: 0,
    products: 4,
    purposeCounts: { Analytics: 3, Functional: 1 },
    priorityCounts: { contextual: 1, high: 0, medium: 3, review_needed: 0 },
    confidenceCounts: { high: 4, low: 0, medium: 0 },
    providerFamilies: 4,
    rawHosts: 4,
    trackers: 3,
    vendors: 4
  });
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

test("Pulse policy surfaces canonicalize URLs, deduplicate aliases, and exclude an untyped effective landing page", () => {
  const scanRecord = pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://www.cira.ca/en/cybersecurity/" },
    policyEnrichment: [
      { pageType: "policy_surface", sourceUrl: "https://cira.ca/en/cybersecurity" },
      { pageType: "policy_surface", sourceUrl: "https://www.cira.ca/en/cybersecurity/" },
      { pageType: "privacy_policy", sourceUrl: "https://www.cira.ca/en/privacy-policy/" },
      { policy_page_type: "privacy_policy", policy_page_url: "https://cira.ca/en/privacy-policy" }
    ]
  });

  assert.deepEqual(
    projectedPolicySurfaceRows(scanRecord).map(({ type, url }) => ({ type, url })),
    [{ type: "privacy_policy", url: "https://cira.ca/en/privacy-policy" }]
  );
});

test("Pulse policy surfaces type iFIT privacy, accessibility, and terms pages without treating the homepage as policy", () => {
  const scanRecord = pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://www.ifit.com/en-gb/" },
    policyEnrichment: [
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/" },
      { pageType: "policy_surface", sourceUrl: "https://www3.ifit.com/en-gb/legal/privacy-policy/" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/consumer-health-data-privacy" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/accessibility" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/mobile-terms-and-conditions" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/terms-of-use" }
    ]
  });

  assert.deepEqual(
    projectedPolicySurfaceRows(scanRecord).map(({ type, url }) => ({ type, url })),
    [
      { type: "privacy_policy", url: "https://www3.ifit.com/en-gb/legal/privacy-policy" },
      { type: "privacy_policy", url: "https://ifit.com/en-gb/legal/consumer-health-data-privacy" },
    { type: "terms_of_service", url: "https://ifit.com/en-gb/legal/mobile-terms-and-conditions" },
    { type: "terms_of_service", url: "https://ifit.com/en-gb/legal/terms-of-use" },
    { type: "accessibility_statement", url: "https://ifit.com/en-gb/accessibility" }
    ]
  );
});

test("Pulse analytics evidence names captured Google and WisePops cookies without inventing write times", () => {
  const rows = ["_ga", "_gid", "_gat_UA-123", "wisepops_visitor"].map((cookieName) => ({
    category: "analytics",
    cookieName,
    domain: "ifit.com",
    firstObservedAtMs: 26_951,
    initiatorVendor: null,
    party: "first_party",
    provider: null,
    setAtMs: null,
    setMethod: "browser_snapshot",
    sourceRequestUrl: null,
    timingBasis: "periodic_cookie_snapshot",
    timingEvidence: "periodic_cookie_snapshot"
  })) as unknown as Parameters<typeof buildCookieEvidenceExamples>[1];

  const examples = buildCookieEvidenceExamples("analytics_cookie_pre_consent", rows);
  assert.deepEqual(examples.map((example) => example.cookieName), ["_ga", "_gat_UA-123", "_gid", "wisepops_visitor"]);
  assert.ok(examples.every((example) => example.timestampMs === null));
  assert.ok(examples.every((example) => example.exactWriteTimeObserved === false));
});

test("Pulse consent platform falls back to canonical nested consent evidence", () => {
  const scanRecord = pulseScanRecord({
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentSummary: {
          cmpDetected: true,
          cmpName: "Osano CMP"
        }
      }
    }
  });
  assert.equal(deriveConsentPlatform(scanRecord, { topObservedEntities: [] } as never), "Osano");
});

test("Pulse evidence projection reads canonical nested runtime summaries and distinguishes all third-party requests", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  assert.match(source, /asRecord\(recordValue\(hybrid, "consentSummary"\)\)/);
  assert.match(source, /asRecord\(recordValue\(hybrid, "networkSummary"\)\)/);
  assert.match(source, /trackingClassifiedThirdPartyRequests/);
  assert.match(source, /thirdPartyRequests: allThirdPartyRequestCount/);
  assert.match(source, /"controls"/);
  assert.match(source, /"textSnippet"/);
  assert.match(source, /"layerInspected"/);
  assert.match(source, /"defaultToggleStatesObserved"/);
  assert.match(source, /"nonEssentialDefaultsOff"/);
  assert.match(source, /"observedAtMs"/);
  assert.match(source, /"policyLinks"/);
  assert.match(source, /"firstVisibleMs"/);
  assert.match(source, /"screenshotRefs"/);
  assert.match(source, /"redirectChain"/);
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
