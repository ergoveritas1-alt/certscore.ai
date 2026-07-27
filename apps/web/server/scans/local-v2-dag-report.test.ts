import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { buildCanonicalGdprEprivacyShadowProjection } from "../../lib/pulse/projection";
import { buildScanReportUnifiedFindingsForScan } from "../../lib/scans/scan-report-unified-findings";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import type { ScanDetailResponse } from "./get-scan-by-id";

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

async function loadLocalV2DagReport() {
  return import("./local-v2-dag-report");
}

test("getLocalV2PrimaryLanguage ranks declared, retained text, and URL evidence", async () => {
  const { getLocalV2PrimaryLanguage } = await loadLocalV2DagReport();
  assert.equal(getLocalV2PrimaryLanguage({
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    domSnapshots: [{ documentLanguage: "fr-FR", textExcerpt: "Welcome to our site." }]
  } as unknown as CanonicalEvidenceBundle), "fr");
  assert.equal(getLocalV2PrimaryLanguage({
    url: "https://example.com/de/produkte",
    normalizedUrl: "https://example.com/de/produkte",
    domSnapshots: [{ textExcerpt: "Die Webseite bietet Informationen für unsere Kunden." }]
  } as unknown as CanonicalEvidenceBundle), "de");
});

test("deriveEndpointJurisdictionEvidence materializes bounded typed geography without query values", async () => {
  const { deriveEndpointJurisdictionEvidence } = await loadLocalV2DagReport();
  const rows = deriveEndpointJurisdictionEvidence([
    {
      collectionEndpointObserved: true,
      endpointGeographyBasis: ["host_only_endpoint_geography", "aws_region_hostname"],
      endpointGeographyJurisdiction: "US",
      endpointGeographyLocationLabel: "AWS US West (Oregon)",
      endpointGeographyPrecision: "provider_region",
      endpointGeographyRegion: "us-west-2",
      endpointGeographyStatus: "region_observed",
      hostname: "collector.us-west-2.example.net",
      requestUrl: "https://collector.us-west-2.example.net/collect?email=private@example.com",
      resourceType: "script",
      thirdParty: true
    },
    {
      collectionEndpointObserved: true,
      endpointGeographyJurisdiction: "US",
      endpointGeographyPrecision: "provider_region",
      endpointGeographyRegion: "us-west-2",
      endpointGeographyStatus: "region_observed",
      hostname: "collector.us-west-2.example.net",
      requestUrl: "https://collector.us-west-2.example.net/event?account=secret",
      thirdParty: true
    },
    {
      collectionEndpointObserved: false,
      endpointGeographyRegion: "us-west-2",
      endpointGeographyStatus: "region_observed",
      hostname: "static.us-west-2.example.net",
      thirdParty: true
    }
  ], [{
    category: "analytics",
    hostnames: ["example.net"],
    vendorName: "Example Analytics"
  }]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    confidence: "high",
    etldPlusOne: "example.net",
    firstPartyStatus: "third_party",
    host: "collector.us-west-2.example.net",
    inferenceBasis: "host_only_endpoint_geography+aws_region_hostname",
    inferredCountryCode: "US",
    inferredRegion: "us-west-2",
    locationLabel: "AWS US West (Oregon)",
    matchedVendorCategory: "analytics",
    matchedVendorName: "Example Analytics",
    requestCount: 2,
    samplePaths: ["/collect", "/event"],
    scriptCount: 1,
    sources: ["request", "script"],
    transferReviewSignal: true
  });
  assert.doesNotMatch(JSON.stringify(rows), /private@example|account=secret/);
});

test("deriveEndpointJurisdictionEvidence requires direct third-party collection geography", async () => {
  const { deriveEndpointJurisdictionEvidence } = await loadLocalV2DagReport();
  assert.deepEqual(deriveEndpointJurisdictionEvidence([
    {
      collectionEndpointObserved: true,
      endpointGeographyRegion: "us-west-2",
      endpointGeographyStatus: "unknown",
      hostname: "unknown.example",
      thirdParty: true
    },
    {
      collectionEndpointObserved: true,
      endpointGeographyRegion: "us-west-2",
      endpointGeographyStatus: "region_observed",
      hostname: "first-party.example",
      thirdParty: false
    }
  ]), []);
});

test("deriveSensitiveThirdPartyTrackingCorrelation requires same-page promotion-grade tracking", async () => {
  const { deriveSensitiveThirdPartyTrackingCorrelation } = await loadLocalV2DagReport();
  const correlated = deriveSensitiveThirdPartyTrackingCorrelation({
    collectionSurfaceObservations: [{
      fieldTypes: ["text"],
      hasSensitiveFieldHint: true,
      labels: ["Medical condition"],
      pageUrl: "https://example.com/appointment?step=1"
    }],
    requestPurposeRows: [
      { category: "analytics", hostname: "analytics.example.net", pageUrl: "https://example.com/appointment?step=1", vendor: "Example Analytics" },
      { category: "advertising", hostname: "ads.example.net", pageUrl: "https://example.com/home", vendor: "Example Ads" }
    ],
    runtimeCoverageRetained: true
  });

  assert.equal(correlated.status, "ok");
  assert.equal(correlated.samePageTrackingObserved, true);
  assert.equal(correlated.thirdPartyTrackingRequestCount, 1);
  assert.deepEqual(correlated.thirdPartyTrackingVendors, ["Example Analytics"]);
  assert.deepEqual(correlated.sensitiveFormUrls, ["https://example.com/appointment?step=1"]);
});

test("deriveSensitiveThirdPartyTrackingCorrelation records a checked negative when inventory and runtime coverage are usable", async () => {
  const { deriveSensitiveThirdPartyTrackingCorrelation } = await loadLocalV2DagReport();
  const correlation = deriveSensitiveThirdPartyTrackingCorrelation({
    collectionSurfaceObservations: [],
    requestPurposeRows: [{ category: "analytics", pageUrl: "https://example.com/", vendor: "Analytics" }],
    runtimeCoverageRetained: true
  });

  assert.equal(correlation.status, "ok");
  assert.equal(correlation.eligibleSensitiveFieldCount, 0);
  assert.equal(correlation.samePageTrackingObserved, false);
});

test("getLocalV2FinalDocumentUrl prefers retained final-page evidence after a cross-domain redirect", async () => {
  const { getLocalV2FinalDocumentUrl, isThirdPartyRuntimeEventForDocument } = await loadLocalV2DagReport();
  assert.equal(getLocalV2FinalDocumentUrl({
    url: "https://requested.example/",
    normalizedUrl: "https://requested.example/",
    domSnapshots: [{ capturedAtMs: 20, url: "https://www.final-brand.example/home" }],
    screenshots: [{ capturedAtMs: 10, url: "https://requested.example/" }],
    transportSecurityObservations: [{ finalUrl: "https://requested.example/" }],
  } as unknown as CanonicalEvidenceBundle), "https://www.final-brand.example/home");
  assert.equal(isThirdPartyRuntimeEventForDocument({
    hostname: "www.final-brand.example",
    thirdParty: true,
  }, "https://www.final-brand.example/home"), false);
  assert.equal(isThirdPartyRuntimeEventForDocument({
    hostname: "analytics.vendor.test",
    thirdParty: true,
  }, "https://www.final-brand.example/home"), true);
});

test("summarizeFirstLayerConsentChoices fails closed when control geometry is missing", async () => {
  const { summarizeFirstLayerConsentChoices } = await loadLocalV2DagReport();
  const summary = summarizeFirstLayerConsentChoices({
    normalizedUrl: "https://example.test/",
    url: "https://example.test/",
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1_420,
      likelyPresent: true,
      basis: ["control:manage_preferences:Manage", "control:reject_all:Reject", "control:accept_all:Accept"],
      textExcerpt: "We use cookies and similar technologies. You can accept, reject or manage your choices.",
      layerInspected: "first_layer",
      controls: [
        { actionType: "manage_preferences", label: "Manage", visible: true, classifierReasonCodes: [] },
        { actionType: "reject_all", label: "Reject", visible: true, classifierReasonCodes: [] },
        { actionType: "accept_all", label: "Accept", visible: true, classifierReasonCodes: [] }
      ],
      evidenceRefs: [{
        refId: "imou_banner_policy_link",
        eventType: "consent_ui",
        url: "https://www.imou.com/policy#privacy-policy"
      }],
      confidence: 0.92
    }]
  } as unknown as CanonicalEvidenceBundle) as Record<string, unknown> | null;

  assert.equal(summary?.geometryAssessment, "incomplete");
  assert.equal(summary?.layerInspected, "unknown");
  assert.equal(summary?.acceptControlObserved, false);
  assert.equal(summary?.rejectControlObserved, false);
  assert.equal(summary?.managePreferencesControlObserved, false);
  assert.deepEqual(summary?.visibleChoiceLabels, []);
});

test("summarizeFirstLayerConsentChoices uses only confirmed visible controls from completed geometry", async () => {
  const { summarizeFirstLayerConsentChoices } = await loadLocalV2DagReport();
  const summary = summarizeFirstLayerConsentChoices({
    normalizedUrl: "https://example.test/",
    url: "https://example.test/",
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      likelyPresent: true,
      layerInspected: "first_layer",
      controls: [
        { actionType: "accept_all", label: { text: "Accept" }, visible: true },
        { actionType: "reject_all", label: "Reject", visible: true }
      ]
    }]
  } as unknown as CanonicalEvidenceBundle, {
    pageUrl: "https://example.test/",
    candidates: [{
      actionType: "accept_all",
      boundingBox: { height: 40, width: 120 },
      decisionStatus: "confirmed_visible",
      enabled: true,
      intersectsViewport: true,
      label: "Accept",
      layer: "first_layer"
    }],
    summary: {
      cmpDetected: true,
      cmpName: "Fixture CMP",
      confidence: 0.9,
      firstLayerAccept: true,
      firstLayerOptions: false,
      firstLayerReject: false
    }
  }) as Record<string, unknown> | null;

  assert.equal(summary?.geometryAssessment, "complete");
  assert.deepEqual(summary?.visibleChoiceLabels, ["Accept"]);
  assert.deepEqual(
    (summary?.controls as Array<{ label: string }>).map((control) => control.label),
    ["Accept"]
  );
});

test("Oxfam-style completed geometry prevents rapid-DOM controls from reaching GDPR/ePrivacy rows", async () => {
  const {
    reconcileConsentSurfaceInspectionWithGeometry,
    summarizeFirstLayerConsentChoices,
  } = await loadLocalV2DagReport();
  const bundle = {
    url: "https://oxfam.org/",
    normalizedUrl: "https://oxfam.org/",
    domSnapshots: [{
      capturedAtMs: 9_100,
      consentStateAtTime: "pre_consent",
      textExcerpt: "Oxfam stands for equality",
      url: "https://www.oxfamamerica.org/",
    }],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 7_813,
      likelyPresent: true,
      layerInspected: "first_layer",
      controls: [
        { actionType: "manage_preferences", label: "Cookie Settings", visible: true },
        { actionType: "accept_all", label: "Accept all cookies", visible: true },
        { actionType: "reject_all", label: "Accept only essential cookies", visible: true },
        { actionType: "manage_preferences", label: "Learn More", visible: true },
      ],
    }],
  } as unknown as CanonicalEvidenceBundle;
  const geometry = {
    artifactVersion: "consent_control_geometry.v1",
    pageUrl: "https://www.oxfamamerica.org/",
    candidates: [{
      actionType: "other",
      boundingBox: { height: 50, width: 200 },
      computedStyle: {
        display: "inline-block",
        opacity: "1",
        pointerEvents: "none",
        visibility: "hidden",
      },
      decisionStatus: "hidden",
      enabled: true,
      frameContext: {
        frameKind: "main_frame",
        frameUrl: "https://www.oxfamamerica.org/",
      },
      intersectsViewport: true,
      label: "Learn More",
      layer: "first_layer",
    }],
    summary: {
      cmpDetected: true,
      cmpName: "TrustArc",
      confidence: 0.65,
      firstLayerAccept: false,
      firstLayerOptions: false,
      firstLayerReject: false,
      limitations: ["cmp_detected_without_visible_first_layer_controls"],
    },
    access: { status: "loaded" },
  };
  const choices = summarizeFirstLayerConsentChoices(bundle, geometry) as Record<string, unknown>;
  const inspection = reconcileConsentSurfaceInspectionWithGeometry(
    bundle,
    geometry,
    {
      outcome: "indeterminate_limited_coverage",
      coverageStatus: "limited",
      inspectionCompleted: false,
      inspectedPreInteraction: true,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      observedAtMs: 7_813,
      evidenceSources: ["consent_ui_observation", "cmp_runtime"],
      evidenceChannels: [],
      limitationKeys: [
        "cmp_runtime_without_actionable_surface",
        "consent_surface_inspection_settled_inventory_missing",
      ],
    } as never,
  );

  assert.equal(choices.geometryAssessment, "complete");
  assert.equal(choices.acceptControlObserved, false);
  assert.equal(choices.rejectControlObserved, false);
  assert.equal(choices.managePreferencesControlObserved, false);
  assert.deepEqual(choices.visibleChoiceLabels, []);
  assert.equal(inspection.outcome, "no_surface_observed_complete_coverage");
  assert.equal(inspection.coverageStatus, "complete");
  assert.equal(inspection.inspectionCompleted, true);
  assert.equal(inspection.consentSurfaceObserved, false);
  assert.equal(inspection.actionableControlObserved, false);
  assert.deepEqual(inspection.limitationKeys, []);

  const runtimeArtifacts = {
    cmpFrameworkSignalObserved: true,
    cmpRuntimeSignalLabels: ["js.hs-banner.com"],
    cmp_vendor_name: "HubSpot Banner",
    consentSurfaceInspection: inspection,
    consentSurfaceObserved: false,
    consentActionableChoiceObserved: false,
    firstLayerConsentChoices: choices,
    rejectPathDepthAndAvailability: {
      completeRejectPathAvailable: false,
      firstLayerConsentChoices: choices,
      firstLayerCookieConsentBannerObserved: false,
      gdprEprivacyConsentSurfaceObserved: "unconfirmed",
      rejectControlObserved: false,
    },
    hybridRuntimeEvidence: {
      consentSurfaceInspection: inspection,
      consentSurfaceObserved: false,
      firstLayerConsentChoices: choices,
      networkSummary: {
        preConsentThirdPartyRequestCount: 19,
      },
      consentSummary: {
        bannerPresent: false,
        cmpDetected: true,
        cmpFrameworkSignalObserved: true,
        cmpName: "HubSpot Banner",
      },
    },
  };
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    events: [],
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: {
      cookie_banner_present: false,
      runtime_capture_completed: true,
      third_party_request_count: 19,
    },
  });

  assert.equal(outcomes.cmp_framework_signal_observed?.status, "Observed");
  assert.equal(outcomes.consent_surface_observed?.status, "Not observed");
  assert.equal(
    outcomes.accept_consent_control?.status,
    "Not observed",
    JSON.stringify(outcomes.accept_consent_control, null, 2),
  );
  assert.equal(outcomes.options_settings_preferences_control?.status, "Not observed");
  assert.equal(outcomes.reject_all_path_availability?.status, "Review signal");

  const unrelatedLimitedInspection = reconcileConsentSurfaceInspectionWithGeometry(
    bundle,
    geometry,
    {
      ...inspection,
      outcome: "indeterminate_limited_coverage",
      coverageStatus: "limited",
      inspectionCompleted: false,
      limitationKeys: [
        "cmp_runtime_without_actionable_surface",
        "visual_capture_unavailable",
      ],
    } as never,
  );
  assert.equal(unrelatedLimitedInspection.outcome, "indeterminate_limited_coverage");
  assert.equal(unrelatedLimitedInspection.coverageStatus, "limited");
  assert.equal(unrelatedLimitedInspection.inspectionCompleted, false);
});

test("visible consent-like controls outside the recognized first layer keep coverage limited", async () => {
  const { reconcileConsentSurfaceInspectionWithGeometry } = await loadLocalV2DagReport();
  const bundle = {
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    domSnapshots: [{
      capturedAtMs: 9_100,
      consentStateAtTime: "pre_consent",
      url: "https://example.com/",
    }],
  } as unknown as CanonicalEvidenceBundle;
  const inspection = reconcileConsentSurfaceInspectionWithGeometry(
    bundle,
    {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: "https://example.com/",
      access: { status: "loaded" },
      candidates: [{
        actionType: "accept_all",
        boundingBox: { x: 419, y: 348, width: 528, height: 45 },
        computedStyle: {
          display: "inline",
          opacity: "1",
          pointerEvents: "auto",
          visibility: "visible",
        },
        decisionStatus: "confirmed_visible",
        enabled: true,
        frameContext: {
          frameKind: "main_frame",
          frameUrl: "https://example.com/",
        },
        intersectsViewport: true,
        label: "Accept all",
        layer: "page_body",
      }],
      summary: {
        cmpDetected: true,
        cmpName: "Fixture CMP",
        confidence: 0.55,
        firstLayerAccept: false,
        firstLayerOptions: false,
        firstLayerReject: false,
      },
    },
    {
      outcome: "indeterminate_limited_coverage",
      coverageStatus: "limited",
      inspectionCompleted: false,
      inspectedPreInteraction: true,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      observedAtMs: 7_813,
      evidenceSources: ["consent_ui_observation", "cmp_runtime"],
      evidenceChannels: [],
      limitationKeys: ["consent_surface_inspection_settled_inventory_missing"],
    } as never,
  );

  assert.equal(inspection.outcome, "indeterminate_limited_coverage");
  assert.equal(inspection.coverageStatus, "limited");
  assert.equal(inspection.inspectionCompleted, false);
  assert.equal(inspection.consentSurfaceObserved, false);
  assert.equal(inspection.actionableControlObserved, false);
  assert.ok(inspection.limitationKeys.includes(
    "consent_control_geometry_visible_candidate_layer_ambiguous"
  ));
});

test("legacy SITS-style modal control clusters reconcile to observed first-layer controls", async () => {
  const {
    reconcileConsentSurfaceInspectionWithGeometry,
    summarizeFirstLayerConsentChoices,
  } = await loadLocalV2DagReport();
  const bundle = {
    url: "https://sits.example/",
    normalizedUrl: "https://sits.example/",
    domSnapshots: [{
      capturedAtMs: 9_100,
      consentStateAtTime: "pre_consent",
      url: "https://sits.example/",
    }],
  } as unknown as CanonicalEvidenceBundle;
  const candidateBase = {
    boundingBox: { x: 419, y: 348, width: 528, height: 45 },
    computedStyle: {
      display: "inline",
      opacity: "1",
      pointerEvents: "auto",
      visibility: "visible",
    },
    containerId: "container_11",
    decisionStatus: "confirmed_visible",
    enabled: true,
    frameContext: {
      frameKind: "main_frame",
      frameUrl: "https://sits.example/",
    },
    intersectsViewport: true,
    layer: "page_body",
    occlusion: {
      center: true,
      topLeft: true,
      topRight: true,
      bottomLeft: true,
      bottomRight: true,
      checkedPoints: 5,
      hitSelectorHints: [],
    },
  };
  const geometry = {
    artifactVersion: "consent_control_geometry.v1",
    pageUrl: "https://sits.example/",
    access: { status: "loaded" },
    containers: [{
      containerId: "container_11",
      htmlExcerpt: '<div data-borlabs-cookie-consent-required="true" id="BorlabsCookieBox">',
      layer: "page_body",
      selectorHint: "#BorlabsCookieBox",
      textExcerpt: "Data protection preference. We need your consent to use cookies.",
    }],
    candidates: [
      { ...candidateBase, actionType: "accept_all", label: "Accept all" },
      { ...candidateBase, actionType: "reject_all", label: "Accept essential cookies" },
      { ...candidateBase, actionType: "manage_preferences", label: "Individual preferences" },
      { ...candidateBase, actionType: "save_preferences", label: "Save consent" },
    ],
    summary: {
      cmpDetected: false,
      confidence: 0.55,
      firstLayerAccept: false,
      firstLayerOptions: false,
      firstLayerReject: false,
    },
  };
  const choices = summarizeFirstLayerConsentChoices(bundle, geometry);
  const inspection = reconcileConsentSurfaceInspectionWithGeometry(
    bundle,
    geometry,
    {
      outcome: "indeterminate_limited_coverage",
      coverageStatus: "limited",
      inspectionCompleted: false,
      inspectedPreInteraction: true,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      observedAtMs: 7_813,
      evidenceSources: ["consent_ui_observation"],
      evidenceChannels: [],
      limitationKeys: ["consent_surface_inspection_settled_inventory_missing"],
    } as never,
  );

  assert.equal(choices?.acceptControlObserved, true);
  assert.equal(choices?.rejectControlObserved, true);
  assert.equal(choices?.managePreferencesControlObserved, true);
  assert.deepEqual(choices?.visibleChoiceLabels, [
    "Accept all",
    "Accept essential cookies",
    "Individual preferences",
    "Save consent",
  ]);
  assert.equal(inspection.outcome, "actionable_surface_observed");
  assert.equal(inspection.consentSurfaceObserved, true);
  assert.equal(inspection.actionableControlObserved, true);
});

test("missing auxiliary geometry does not erase completed canonical consent evidence", async () => {
  const { reconcileConsentSurfaceInspectionWithGeometry } = await loadLocalV2DagReport();
  const retainedInspection = {
    outcome: "actionable_surface_observed",
    coverageStatus: "complete",
    inspectionCompleted: true,
    inspectedPreInteraction: true,
    consentSurfaceObserved: true,
    actionableControlObserved: true,
    observedAtMs: 9_940,
    evidenceSources: ["consent_ui_observation", "control_inventory", "geometry"],
    evidenceChannels: [],
    limitationKeys: [],
  } as const;
  const reconciled = reconcileConsentSurfaceInspectionWithGeometry(
    {
      url: "https://sits.example/",
      normalizedUrl: "https://sits.example/",
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent",
        observedAtMs: 9_940,
        likelyPresent: true,
        layerInspected: "first_layer",
        acceptControlObserved: true,
        rejectControlObserved: true,
        managePreferencesControlObserved: true,
        controls: [
          { actionType: "accept_all", label: "Accept all", visible: true },
          { actionType: "reject_all", label: "Accept essential cookies", visible: true },
          { actionType: "manage_preferences", label: "Individual preferences", visible: true },
        ],
      }],
    } as unknown as CanonicalEvidenceBundle,
    null,
    retainedInspection as never,
  );

  assert.deepEqual(reconciled, retainedInspection);
});

test("completed consent geometry from a different document fails closed", async () => {
  const { summarizeFirstLayerConsentChoices } = await loadLocalV2DagReport();
  const choices = summarizeFirstLayerConsentChoices({
    url: "https://before.example/",
    normalizedUrl: "https://before.example/",
    domSnapshots: [{
      capturedAtMs: 2_000,
      url: "https://after.example/",
    }],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1_000,
      likelyPresent: true,
      layerInspected: "first_layer",
      controls: [{ actionType: "accept_all", label: "Accept all", visible: true }],
    }],
  } as unknown as CanonicalEvidenceBundle, {
    pageUrl: "https://before.example/",
    candidates: [{
      actionType: "accept_all",
      boundingBox: { height: 40, width: 120 },
      decisionStatus: "confirmed_visible",
      enabled: true,
      intersectsViewport: true,
      label: "Accept all",
      layer: "first_layer",
    }],
    summary: {
      cmpDetected: true,
      confidence: 0.9,
      firstLayerAccept: true,
      firstLayerOptions: false,
      firstLayerReject: false,
    },
  }) as Record<string, unknown>;

  assert.equal(choices.geometryAssessment, "document_mismatch");
  assert.equal(choices.acceptControlObserved, false);
  assert.deepEqual(choices.visibleChoiceLabels, []);
});

test("policy summary distinguishes discovered-but-budget-skipped privacy notices from absent notices", async () => {
  const { summarizePolicySurfaces } = await loadLocalV2DagReport();
  const discoveredSurface = {
    observationId: "privacy-discovered",
    surfaceType: "privacy_policy",
    normalizedUrl: "https://example.test/privacy",
    url: "/privacy",
    status: "skipped_budget",
    confidence: 0.9,
  } as CanonicalEvidenceBundle["policySurfaceObservations"][number];
  const summary = summarizePolicySurfaces([], "example.test", {
    discoveredPolicySurfaces: [discoveredSurface],
  });

  assert.equal(summary.privacyPolicyPresent, false);
  assert.equal(summary.privacyPolicyDiscovered, true);
  assert.equal(summary.privacyPolicyEvaluationState, "discovered_skipped_budget");
  assert.deepEqual(summary.discoveredPrivacyPolicyUrls, ["https://example.test/privacy"]);
});

test("observed rendered privacy links remain reportable when document fetch fails without becoming evaluated policy evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const discoveredSurface = {
    observationId: "privacy-rendered-fetch-failed",
    surfaceType: "privacy_policy",
    normalizedUrl: "https://example.test/privacy",
    url: "https://example.test/privacy",
    discoveryMethod: "footer_link",
    status: "failed",
    linkObservationState: "observed",
    documentFetchState: "failed",
    documentEvaluationState: "not_attempted",
    fetchFailureReason: "http_error",
    confidence: 0.9,
  } as CanonicalEvidenceBundle["policySurfaceObservations"][number];
  const surfaces = dedupePolicySurfaces([discoveredSurface], "https://example.test/");
  const summary = summarizePolicySurfaces(surfaces, "example.test", {
    discoveredPolicySurfaces: [discoveredSurface],
  });

  assert.equal(surfaces.length, 1);
  assert.equal(summary.privacyPolicyPresent, false);
  assert.equal(summary.privacyPolicyDiscovered, true);
  assert.equal(summary.privacyPolicyEvaluationState, "discovered_fetch_failed");
  assert.deepEqual(summary.privacyPolicyUrls, []);
  assert.deepEqual(summary.discoveredPrivacyPolicyUrls, ["https://example.test/privacy"]);
});

test("policy summary materializes structured named-cookie disclosures from cookie surfaces", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const sourceUrl = "https://www.oxfam.org/en/cookies";
  const surfaces = dedupePolicySurfaces([{
    observationId: "oxfam-cookie-policy",
    surfaceType: "cookie_policy",
    url: sourceUrl,
    normalizedUrl: sourceUrl,
    confidence: 0.96,
    status: "fetched",
    textExcerpt: "Cookie name Provider Expiry Purpose __stripe_mid Stripe 1 year",
    policyCookieDisclosures: [
      {
        cookieName: "__stripe_mid",
        provider: "Stripe",
        duration: "1 year",
        purpose: "Necessary for credit card transactions.",
        category: "essential",
        sourceUrl,
        evidenceRef: "policy_cookie_stripe_mid",
        parserProvenance: "policy_cookie_table_dom.v1",
        confidence: 0.96,
      },
      {
        cookieName: "fundraiseup_cid",
        provider: "Fundraise Up",
        duration: "10 years",
        purpose: "Persistent anti-fraud and analytics identifier.",
        category: "essential",
        sourceUrl,
        evidenceRef: "policy_cookie_fundraiseup_cid",
        parserProvenance: "policy_cookie_table_dom.v1",
        confidence: 0.96,
      },
    ],
  }] as never, "https://www.oxfam.org/");
  const summary = summarizePolicySurfaces(surfaces, "oxfam.org");

  assert.equal(summary.cookiePolicyPresent, true);
  assert.deepEqual(
    summary.policyCookieDisclosures.map((row) => row.cookieName),
    ["__stripe_mid", "fundraiseup_cid"],
  );
  assert.deepEqual(summary.cookieDisclosures, summary.policyCookieDisclosures);
});

test("buildLocalV2NoGoSnapshotFields preserves every canonical no-go reason classification", async () => {
  const { buildLocalV2NoGoSnapshotFields } = await loadLocalV2DagReport();
  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[reasonCode];
    const snapshot = buildLocalV2NoGoSnapshotFields(reasonCode, presentation.pageState);
    assert.equal(snapshot.stop_reason_code, presentation.snapshotStopReasonCode, reasonCode);
    assert.equal(snapshot.stop_reason_label, presentation.snapshotStopReasonLabel, reasonCode);
    assert.equal(snapshot.stop_reason_detail, presentation.snapshotStopReasonDetail, reasonCode);
    assert.equal(snapshot.block_page_classification, presentation.snapshotBlockPageClassification, reasonCode);
    assert.notEqual(snapshot.stop_reason_label, "Homepage capture failed", reasonCode);
  }
});

test("final non-no-go materialization replaces a stale provisional no-go outcome", async () => {
  const { resolveFinalMaterializedScanOutcome } = await loadLocalV2DagReport();

  assert.equal(resolveFinalMaterializedScanOutcome({
    existingOutcome: "homepage_access_blocked",
  }), "completed_partial");
  assert.equal(resolveFinalMaterializedScanOutcome({
    existingOutcome: "homepage_visual_capture_failed",
  }), "completed_partial");
  assert.equal(resolveFinalMaterializedScanOutcome({
    existingOutcome: "completed_successfully",
  }), "completed_successfully");
});

test("buildLocalV2NoGoSnapshotFields gives Cerebras site-not-ready snapshot copy", async () => {
  const { buildLocalV2NoGoSnapshotFields } = await loadLocalV2DagReport();
  const snapshot = buildLocalV2NoGoSnapshotFields("site_not_ready", "parked_or_placeholder");
  assert.equal(snapshot.stop_reason_code, "homepage_site_not_ready");
  assert.equal(snapshot.stop_reason_label, "Site not ready for scanning");
  assert.match(snapshot.stop_reason_detail, /prelaunch/i);
  assert.doesNotMatch(snapshot.stop_reason_detail, /capture failed/i);
});

test("explicit scanner continue assessment blocks downstream raw-text no-go reconstruction", async () => {
  const { buildLocalV2ScanNoGoAssessment } = await loadLocalV2DagReport();
  const result = buildLocalV2ScanNoGoAssessment({
    bundle: {
      scanNoGoAssessment: {
        status: "available",
        version: "scan-no-go-assessment-v1",
        decision: "continue_with_diagnostics",
        scanNoGoConfidence: 0.72,
        reasonCodes: ["potential_security_challenge", "scan_no_go_corroborated"],
        corroboratorCodes: ["network_cloudflare_challenge"],
        contradictorCodes: ["multiple_first_party_resources_loaded"],
        supportingSignals: {},
        evidenceRefs: [],
      },
      visualAccessReview: {
        confidence: 0.72,
        go_no_go: "GO",
        key_visual_evidence: ["Background challenge traffic was contradicted by retained normal-site evidence."],
        page_state: "degraded_but_useful",
        reason_code: "potential_security_challenge",
        short_explanation: "Normal-site evidence required the scan to continue.",
        status: "available",
        version: "visual-access-review-v1",
      },
    } as unknown as CanonicalEvidenceBundle,
    consentSurfaceLikelyPresent: false,
    runtimeActivityObserved: true,
    lowRuntimeActivity: false,
  });

  assert.equal(result, null);
});

test("local v2 no-go classifies parked cross-domain placeholders before scoring", async () => {
  const { buildLocalV2ScanNoGoAssessment } = await loadLocalV2DagReport();
  const result = buildLocalV2ScanNoGoAssessment({
    bundle: {
      domSnapshots: [{ textExcerpt: "This domain may be for sale. Domains may be for sale." }]
    } as unknown as CanonicalEvidenceBundle,
    consentSurfaceLikelyPresent: false,
    finalUrl: "https://domains.collinlove.com/query-default",
    requestedUrl: "https://noyb.com/",
    runtimeActivityObserved: true,
    lowRuntimeActivity: false
  });

  assert.equal(result?.primaryReasonCode, "parked_or_placeholder");
  assert.equal(result?.visualAccessReview.page_state, "parked_or_placeholder");
});

test("local v2 no-go classifies application error pages as wrong-site or soft-404", async () => {
  const { buildLocalV2ScanNoGoAssessment } = await loadLocalV2DagReport();
  const result = buildLocalV2ScanNoGoAssessment({
    bundle: {
      domSnapshots: [{ textExcerpt: "No company found! We couldn't find your company." }]
    } as unknown as CanonicalEvidenceBundle,
    consentSurfaceLikelyPresent: false,
    finalUrl: "https://timeacle.com/booking/company",
    requestedUrl: "https://timeacle.com/booking/",
    runtimeActivityObserved: true,
    lowRuntimeActivity: false
  });

  assert.equal(result?.primaryReasonCode, "wrong_site_or_soft_404");
  assert.equal(result?.visualAccessReview.page_state, "wrong_site_or_soft_404");
});

test("buildLocalV2DagTimingArtifacts retains bounded module and policy timings", async () => {
  const { buildLocalV2DagTimingArtifacts } = await loadLocalV2DagReport();
  const bundle = {
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: "2026-07-09T12:00:00.000Z",
        completedAt: "2026-07-09T12:00:04.000Z",
        durationMs: 4000,
        timingBreakdown: [{ label: "page navigation", durationMs: 1200 }],
        evidenceRefs: [],
        errors: []
      },
      {
        moduleName: "policySurfaceScanner",
        status: "completed",
        startedAt: "2026-07-09T12:00:00.500Z",
        completedAt: "2026-07-09T12:00:06.500Z",
        durationMs: 6000,
        timingBreakdown: [
          { label: "deterministic link ranking", durationMs: 5, detail: "Rank 18 policy candidates deterministically for planned-DAG fast mode." },
          { label: "policy candidate group fetch", durationMs: 4100, detail: "Fetch and project up to 5 ranked policy candidates with concurrency 3." },
          { label: "policy fetch 1", durationMs: 1000 },
          { label: "policy fetch 2", durationMs: 900 },
          { label: "rendered discovery skipped", durationMs: 0 }
        ],
        evidenceRefs: [],
        errors: []
      }
    ],
    policySurfaceObservations: [{ observationId: "privacy" }, { observationId: "terms" }]
  } as unknown as CanonicalEvidenceBundle;

  const timing = buildLocalV2DagTimingArtifacts(bundle);

  assert.equal(timing.buildPhaseSummaries[1]?.phase, "policySurfaceScanner");
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.candidatesDiscovered, 18);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.requestsStarted, 2);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.successfulDocuments, 2);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.phaseWallMs, 6000);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.maxConcurrency, 3);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.shortCircuitReason, "static_core_policy_coverage");
});

test("buildLocalV2DagTimingArtifacts tolerates retained legacy bundles without module timings", async () => {
  const { buildLocalV2DagTimingArtifacts } = await loadLocalV2DagReport();
  const timing = buildLocalV2DagTimingArtifacts({
    policySurfaceObservations: []
  } as unknown as CanonicalEvidenceBundle);

  assert.deepEqual(timing.buildPhaseSummaries, []);
  assert.equal(timing.v2DagPolicyDiscoveryDiagnostics.phaseWallMs, null);
});

test("selectBoundedPreconsentRequestPurposeRows retains later promotion-grade evidence", async () => {
  const {
    firstPromotionGradePreconsentRequestMs,
    selectBoundedPreconsentRequestPurposeRows
  } = await loadLocalV2DagReport();
  const contextualRows = Array.from({ length: 30 }, (_, index) => ({
    category: "infrastructure",
    classification: "tracking",
    confidence: 0.95,
    essentiality: "non_essential",
    hostname: `static-${index}.example.test`,
    requestUrl: `https://static-${index}.example.test/asset.js`,
    runtimePhase: "pre_consent",
    tsMs: index,
    vendor: "Example CDN"
  }));
  const eligibleRow = {
    category: "advertising",
    classification: "tracking",
    confidence: 0.95,
    essentiality: "non_essential",
    hostname: "ads.example.test",
    requestUrl: "https://ads.example.test/pixel.js",
    runtimePhase: "pre_consent",
    tsMs: 31,
    vendor: "Example Ads"
  };

  const selected = selectBoundedPreconsentRequestPurposeRows([...contextualRows, eligibleRow]);

  assert.equal(selected.length, 25);
  assert.equal(selected.some((row) => row.requestUrl === eligibleRow.requestUrl), true);
  assert.equal(
    firstPromotionGradePreconsentRequestMs([{ ...contextualRows[0], tsMs: 1 }, eligibleRow]),
    31,
    "contextual requests must not provide the promotion sequence timestamp"
  );
});

test("canonical report counters dedupe repeated cookie writes and request rows", async () => {
  const {
    countCanonicalCookieObservations,
    countCanonicalNetworkEvents,
    deriveApplicablePolicyCoverageComplete,
    deriveCriticalCoverageLimitationKeys
  } = await loadLocalV2DagReport();
  assert.equal(countCanonicalCookieObservations([
    { cookieDomain: ".example.test", cookiePath: "/", cookieName: "session", operation: "set_cookie_header" },
    { cookieDomain: ".example.test", cookiePath: "/", cookieName: "session", operation: "browser_snapshot" },
    { cookieDomain: ".example.test", cookiePath: "/account", cookieName: "session", operation: "set_cookie_header" }
  ]), 2);
  assert.equal(countCanonicalCookieObservations([
    { cookieDomain: ".example.test", cookiePath: "/", cookieName: "cf_clearance", operation: "set_cookie_header" },
    { cookieDomain: "example.test", cookiePath: "/", cookieName: "cf_clearance", operation: "browser_snapshot" }
  ]), 1, "leading-dot domain formatting must not create a second cookie identity");
  assert.equal(countCanonicalNetworkEvents([
    { eventId: "net-1", requestUrl: "https://vendor.test/a" },
    { eventId: "net-1", requestUrl: "https://vendor.test/a" },
    { eventId: "net-2", requestUrl: "https://vendor.test/a" }
  ]), 2);
  assert.deepEqual(deriveCriticalCoverageLimitationKeys({
    applicablePolicyCoverageComplete: false,
    consentCoverageComplete: true,
    transportCoverageComplete: false
  }), ["transport_security_observation_incomplete", "applicable_privacy_policy_unresolved"]);
  assert.equal(deriveApplicablePolicyCoverageComplete({
    policySurfaceInspection: {
      outcome: "indeterminate_limited_coverage",
      coverageStatus: "limited",
      linkDiscoveryCoverageStatus: "limited",
      documentRetrievalCoverageStatus: "limited",
      inspectionCompleted: false,
      privacyPolicyObserved: false,
      observedSurfaceTypes: [],
      limitationKeys: ["policy_surface_inspection_runtime_failed"]
    },
    privacyPolicyPresent: false,
    rawPrivacyPolicyCandidateCount: 0
  }), false, "a failed policy module must not project an absent policy as complete coverage");
  assert.equal(deriveApplicablePolicyCoverageComplete({
    policySurfaceInspection: {
      outcome: "no_privacy_policy_observed_complete_coverage",
      coverageStatus: "complete",
      linkDiscoveryCoverageStatus: "complete",
      documentRetrievalCoverageStatus: "insufficient",
      inspectionCompleted: true,
      privacyPolicyObserved: false,
      observedSurfaceTypes: [],
      limitationKeys: []
    },
    privacyPolicyPresent: false,
    rawPrivacyPolicyCandidateCount: 0
  }), true, "a completed bounded negative search remains complete coverage");
});

test("classifies script loading, ad collection, and identifier synchronization separately", async () => {
  const { classifyRetainedRequestActivity } = await loadLocalV2DagReport();
  assert.equal(classifyRetainedRequestActivity({
    category: "advertising",
    collectionEndpointObserved: false,
    url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
  }), "library");
  assert.equal(classifyRetainedRequestActivity({
    category: "advertising",
    collectionEndpointObserved: true,
    url: "https://securepubads.g.doubleclick.net/gampad/ads"
  }), "ad_request");
  assert.equal(classifyRetainedRequestActivity({
    category: "advertising",
    collectionEndpointObserved: true,
    regulatoryRelevance: ["identifier_sync"],
    url: "https://sync.example.test/user_sync"
  }), "identifier_synchronization");
  for (const url of [
    "https://cm.g.doubleclick.net/pixel",
    "https://am-match.taboola.com/pixel",
    "https://ats.rlcdn.com/ats",
    "https://nbcuni.demdex.net/event",
    "https://gum.criteo.com/pixel"
  ]) {
    assert.equal(classifyRetainedRequestActivity({
      category: "advertising",
      collectionEndpointObserved: true,
      resourceType: "fetch",
      url
    }), "identifier_synchronization", `${url} is a canonical ID-sync endpoint`);
  }
  assert.equal(classifyRetainedRequestActivity({
    category: "analytics",
    collectionEndpointObserved: false,
    resourceType: "script",
    url: "https://cloud.umami.is/script.js"
  }), "library", "loading the bounded analytics library is not collection evidence");
  assert.equal(classifyRetainedRequestActivity({
    category: "analytics",
    collectionEndpointObserved: false,
    resourceType: "fetch",
    url: "https://gateway.umami.is/api/send"
  }), "tracker_beacon", "a canonical vendor fetch endpoint is collection evidence");
});

test("segments auxiliary authorization and callback navigation from the primary page assessment", async () => {
  const { isPrimaryAssessmentRuntimeEvent } = await loadLocalV2DagReport();
  const pageUrl = "https://journal.example/";
  assert.equal(isPrimaryAssessmentRuntimeEvent({ topLevelUrl: pageUrl, requestUrl: "https://ad.doubleclick.net/activity" }, pageUrl), true);
  assert.equal(isPrimaryAssessmentRuntimeEvent({ topLevelUrl: "https://id.publisher.example/as/authorization.oauth2", requestUrl: "https://cdn.example/sdk.js" }, pageUrl), false);
  assert.equal(isPrimaryAssessmentRuntimeEvent({ documentUrl: "https://www.journal.example/callback?code=redacted", cookieName: "SESSION" }, pageUrl), false);
});

test("reports distinct cookies, timed writes, periodic snapshots, and initial snapshots separately", async () => {
  const { summarizeRuntimeCookieEvidenceCounts } = await loadLocalV2DagReport();
  const counts = summarizeRuntimeCookieEvidenceCounts([
    { consentStateAtTime: "pre_consent", cookieName: "session", cookieDomain: ".example.test", cookiePath: "/", operation: "set_cookie_header" },
    { consentStateAtTime: "pre_consent", cookieName: "session", cookieDomain: ".example.test", cookiePath: "/", operation: "initial_cookie_snapshot" },
    { consentStateAtTime: "pre_consent", cookieName: "_gcl_au", cookieDomain: ".example.test", cookiePath: "/", operation: "browser_snapshot", timestampMs: 12000 },
    { consentStateAtTime: "post_consent", cookieName: "later", cookieDomain: ".example.test", cookiePath: "/", operation: "document_cookie" }
  ]);
  assert.deepEqual(counts, {
    distinctCookieCount: 3,
    distinctPreConsentCookieCount: 2,
    timedCookieWriteCount: 2,
    timedPreConsentCookieWriteCount: 1,
    initialCookieSnapshotCount: 1,
    periodicCookieSnapshotCount: 1
  });
});

test("requires a concrete canonical host, request, cookie, or runtime signature for retained vendor rows", async () => {
  const { hasConcreteCanonicalVendorAnchor } = await loadLocalV2DagReport();

  assert.equal(hasConcreteCanonicalVendorAnchor({
    basis: ["canonical_product_label"],
    confidence: 0.8,
    entity: "bombora",
    matchedHostnames: ["yandex.ru"],
    matchedUrls: ["https://yandex.ru/sync_cookie_image_check"],
    observationId: "label-only-bombora",
    product: "Bombora Visitor Insights",
    purpose: "advertising",
    vendor: "Bombora"
  } as never), false);
  assert.equal(hasConcreteCanonicalVendorAnchor({
    basis: ["cookie_name_match"],
    confidence: 0.95,
    entity: "Yandex LLC",
    matchedCookieNames: ["_ym_uid"],
    matchedHostnames: ["life.ru"],
    observationId: "concrete-yandex-metrica",
    product: "Yandex Metrica",
    purpose: "analytics",
    vendor: "Yandex"
  } as never), true);
});

function syntheticPngHeader(width: number, height: number, byteSize = 1024) {
  const buffer = Buffer.alloc(byteSize);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function makeScanRecord(overrides: Partial<ScanDetailResponse> = {}): ScanDetailResponse {
  return {
    events: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: null,
    runtimeArtifacts: {},
    scan: {
      completedAt: "2026-06-17T13:14:02.000Z",
      createdAt: "2026-06-17T13:13:50.000Z",
      displayCreatedAt: "2026-06-17T13:13:50.000Z",
      displayStatus: "completed",
      domainHostname: "caltech.edu",
      domainId: null,
      errorMessage: null,
      executionSummary: null,
      id: "94d8855d-0347-4d5d-9bb1-b60f1cccc8fd",
      pagesRequested: 1,
      pagesScanned: 0,
      scanConfigJson: {
        hostname: "caltech.edu",
        normalizedUrl: "https://caltech.edu/",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        execution: {
          v2DagParallel: {
            artifactOnly: true,
            localOnly: true,
            profile: "standard",
            productionFindingIntegration: false
          }
        }
      },
      scanFromLabel: "Cloud",
      scanFromValue: "cloud",
      scanType: "full",
      startedAt: "2026-06-17T13:13:50.000Z",
      status: "completed"
    },
    signals: [],
    snapshot: {},
    trackerVendors: [],
    validationFindings: [],
    ...overrides
  } as ScanDetailResponse;
}

function completedConsentGeometryFixture(input: {
  cmpName?: string;
  controls: Array<{
    actionType: "accept_all" | "reject_all" | "manage_preferences";
    label: string;
  }>;
  pageUrl: string;
}) {
  return {
    artifactVersion: "consent_control_geometry.v1",
    pageUrl: input.pageUrl,
    candidates: input.controls.map((control, index) => ({
      ...control,
      boundingBox: {
        bottom: 180 + index * 50,
        height: 40,
        left: 100,
        right: 300,
        top: 140 + index * 50,
        width: 200,
        x: 100,
        y: 140 + index * 50,
      },
      decisionStatus: "confirmed_visible",
      enabled: true,
      frameContext: {
        frameKind: "main_frame",
        frameUrl: input.pageUrl,
      },
      intersectsViewport: true,
      layer: "first_layer",
      tagName: "button",
    })),
    containers: [{
      layer: "first_layer",
      textExcerpt: "Cookie consent preferences",
    }],
    summary: {
      cmpDetected: Boolean(input.cmpName),
      cmpName: input.cmpName,
      confidence: 0.95,
      firstLayerAccept: input.controls.some((control) => control.actionType === "accept_all"),
      firstLayerOptions: input.controls.some((control) => control.actionType === "manage_preferences"),
      firstLayerReject: input.controls.some((control) => control.actionType === "reject_all"),
      limitations: [],
    },
    access: { status: "loaded" },
  };
}

test("getLocalV2DagReportInput reads Lambda scan artifact URI from retained result event", async () => {
  const { getLocalV2DagReportInput } = await loadLocalV2DagReport();
  const input = getLocalV2DagReportInput(makeScanRecord({
    events: [
      {
        createdAt: "2026-06-17T13:14:02.000Z",
        eventType: "v2_lambda_result.received",
        id: "event-1",
        message: "Local v2 DAG Lambda returned a completed artifact-only result.",
        metadataJson: {
          artifactAccess: {
            productionReadMode: "verified_s3"
          },
          artifactOnly: true,
          artifactMetadata: {
            manifestUri: {
              sha256: "manifest-sha256",
              sizeBytes: 456
            },
            scanArtifactUri: {
              sha256: "scan-sha256",
              sizeBytes: 123
            }
          },
          artifactPointers: {
            manifestUri: "s3://certscore-v2-dag-local-artifacts-199536052647-eu-central-1/v2-dag-lambda/local/manifest.json",
            scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-199536052647-eu-central-1/v2-dag-lambda/local/scan.json"
          },
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: false
        }
      }
    ],
    scan: {
      ...makeScanRecord().scan,
      scanConfigJson: {
        hostname: "caltech.edu",
        normalizedUrl: "https://caltech.edu/",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        execution: {
          v2DagLambda: {
            resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/ie-results"
          },
          v2DagParallel: {
            artifactOnly: true,
            localOnly: true,
            profile: "standard",
            productionFindingIntegration: false
          }
        }
      }
    }
  }));

  assert.equal(
    input?.scanArtifactUri,
    "s3://certscore-v2-dag-local-artifacts-199536052647-eu-central-1/v2-dag-lambda/local/scan.json"
  );
  assert.equal(input?.outDir, null);
  assert.equal(input?.profile, "standard");
  assert.equal(input?.lambdaResultQueueUrl, "https://sqs.eu-west-1.amazonaws.com/123/ie-results");
  assert.equal(input?.scanArtifactSha256, "scan-sha256");
  assert.equal(input?.scanArtifactSizeBytes, 123);
  assert.equal(input?.manifestArtifactSha256, "manifest-sha256");
  assert.equal(input?.manifestArtifactSizeBytes, 456);
});

test("getLocalV2DagReportInput rejects new verified-S3 pointers without checksums", async () => {
  const { getLocalV2DagReportInput } = await loadLocalV2DagReport();
  const input = getLocalV2DagReportInput(makeScanRecord({
    events: [
      {
        createdAt: "2026-07-10T13:14:02.000Z",
        eventType: "v2_lambda_result.received",
        id: "event-unverified",
        message: "Unverifiable result.",
        metadataJson: {
          artifactAccess: { productionReadMode: "verified_s3" },
          artifactOnly: true,
          artifactPointers: { scanArtifactUri: "s3://certscore-artifacts/scan/bundle.json" },
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: false
        }
      }
    ]
  }));

  assert.equal(input?.scanArtifactUri, null);
});

test("resolveLocalV2DagVisualEvidencePointer resolves a mirrored screenshot without reading the canonical bundle", async () => {
  const { resolveLocalV2DagVisualEvidencePointer } = await loadLocalV2DagReport();
  const scanId = "94d8855d-0347-4d5d-9bb1-b60f1cccc8fd";
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/direct-visual-evidence-"));
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await writeFile(path.join(outDir, "screenshot-pre-consent.png"), syntheticPngHeader(1366, 900));
    await writeFile(path.join(outDir, "LocalV2DagLambdaManifest.json"), JSON.stringify({
      auxiliaryArtifacts: [{
        fileName: "screenshot-pre-consent.png",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        uri: `s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2-dag-lambda/local/${scanId}/auxiliary/screenshot-pre-consent.png`
      }]
    }));

    const scanRecord = makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: scanId,
        scanConfigJson: {
          ...makeScanRecord().scan.scanConfigJson,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    });

    assert.deepEqual(
      await resolveLocalV2DagVisualEvidencePointer(scanRecord, "local_v2:screenshot_pre_consent"),
      {
        bucket: null,
        id: "local_v2:screenshot_pre_consent",
        key: `local-v2-dag-scans/${scanId}/screenshot-pre-consent.png`,
        mimeType: "image/png",
        status: "available"
      }
    );
    assert.equal(
      await resolveLocalV2DagVisualEvidencePointer(scanRecord, "local_v2:unknown_screenshot"),
      null,
      "unrecognized artifact IDs must not be converted into storage paths"
    );
    assert.equal(
      await resolveLocalV2DagVisualEvidencePointer(scanRecord, "toString"),
      null,
      "inherited object properties must not be accepted as artifact IDs"
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("resolveLocalV2DagVisualEvidencePointer resolves the local full-page JPEG artifact", async () => {
  const { resolveLocalV2DagVisualEvidencePointer } = await loadLocalV2DagReport();
  const scanId = "8f3f4d54-3137-4f3b-a0d4-4bdcfb8f94f3";
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/full-page-jpeg-"));
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await writeFile(path.join(outDir, "screenshot-pre-consent-full-page.jpg"), Buffer.from("jpeg"));

    const scanRecord = makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: scanId,
        scanConfigJson: {
          ...makeScanRecord().scan.scanConfigJson,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    });

    assert.deepEqual(
      await resolveLocalV2DagVisualEvidencePointer(scanRecord, "local_v2:screenshot_pre_consent_full_page"),
      {
        bucket: null,
        id: "local_v2:screenshot_pre_consent_full_page",
        key: `local-v2-dag-scans/${scanId}/screenshot-pre-consent-full-page.jpg`,
        mimeType: "image/jpeg",
        status: "available"
      }
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("verified S3 fallback enforces Lambda artifact checksum and size", async () => {
  const { verifyLocalV2DagLambdaArtifactBody } = await loadLocalV2DagReport();
  const body = Buffer.from('{"schemaVersion":"certscore.v2.canonical-evidence-bundle.v1"}');
  const sha256 = createHash("sha256").update(body).digest("hex");

  assert.equal(verifyLocalV2DagLambdaArtifactBody({
    body,
    expectedSha256: sha256,
    expectedSizeBytes: body.byteLength
  }), body);
  assert.throws(() => verifyLocalV2DagLambdaArtifactBody({
    body,
    expectedSha256: "0".repeat(64),
    expectedSizeBytes: body.byteLength
  }), /checksum mismatch/);
  assert.throws(() => verifyLocalV2DagLambdaArtifactBody({
    body,
    expectedSha256: sha256,
    expectedSizeBytes: body.byteLength + 1
  }), /size mismatch/);
});

test("getLocalV2DagReportInput ignores Lambda events that would enable production finding integration", async () => {
  const { getLocalV2DagReportInput } = await loadLocalV2DagReport();
  const input = getLocalV2DagReportInput(makeScanRecord({
    events: [
      {
        createdAt: "2026-06-17T13:14:02.000Z",
        eventType: "v2_lambda_result.received",
        id: "event-1",
        message: "Unexpected result.",
        metadataJson: {
          artifactOnly: true,
          artifactPointers: {
            scanArtifactUri: "s3://bucket/key.json"
          },
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: true
        }
      }
    ]
  }));

  assert.equal(input?.scanArtifactUri, null);
});

test("inferS3ArtifactRegion follows the regional Lambda artifact bucket", async () => {
  const { inferS3ArtifactRegion } = await loadLocalV2DagReport();

  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-eu-central-1-199536052647"),
    "eu-central-1"
  );
  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-eu-west-1-199536052647"),
    "eu-west-1"
  );
  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-us-west-2-199536052647"),
    "us-west-2"
  );
  assert.equal(inferS3ArtifactRegion("certscore-v2-dag-local-artifacts"), "eu-central-1");
});

test("shouldAttemptLocalV2DagLambdaResultRefresh keeps web pages out of SQS result ingestion", async () => {
  const { shouldAttemptLocalV2DagLambdaResultRefresh } = await loadLocalV2DagReport();
  const nowMs = Date.parse("2026-06-17T13:14:20.000Z");
  const baseScan = makeScanRecord().scan;

  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
      scan: {
        ...baseScan,
        completedAt: null,
        startedAt: "2026-06-17T13:13:50.000Z",
        status: "running"
      }
    }), nowMs),
    false
  );

  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
	    scan: {
	      ...baseScan,
	      completedAt: null,
	      startedAt: "2026-06-17T13:14:16.000Z",
	      status: "running"
	    }
	  }), nowMs),
    false
  );

  assert.equal(shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord(), nowMs), false);
  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://bucket/key.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...baseScan,
        completedAt: null,
        status: "running"
      }
    }), nowMs),
    false
  );
});

test("tryRefreshLocalV2DagLambdaResult does not poll SQS from report pages", async () => {
  const {
    resetLocalV2DagLambdaResultRefreshStateForTest,
    tryRefreshLocalV2DagLambdaResult
  } = await loadLocalV2DagReport();
  resetLocalV2DagLambdaResultRefreshStateForTest();

  const nowMs = Date.parse("2026-06-17T13:14:20.000Z");
  const baseScan = makeScanRecord().scan;
  const scanRecord = makeScanRecord({
    scan: {
      ...baseScan,
      completedAt: null,
      startedAt: "2026-06-17T13:13:50.000Z",
      status: "running"
    }
  });
  let pollCount = 0;
  const pollResultQueue = async () => {
    pollCount += 1;
    return { handled: 0 };
  };

  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs, pollResultQueue }), false);
  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs: nowMs + 4_000, pollResultQueue }), false);
  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs: nowMs + 6_000, pollResultQueue }), false);
  assert.equal(pollCount, 0);

  resetLocalV2DagLambdaResultRefreshStateForTest();
});

test("dedupePolicySurfaces collapses equivalent privacy URLs before report projection", async () => {
  const { dedupePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "privacy-relative",
      surfaceType: "privacy_policy",
      url: "/privacy",
      title: "Privacy center",
      confidence: 0.76,
      textExcerpt: "Privacy policy text"
    },
    {
      observationId: "privacy-www",
      surfaceType: "privacy_policy",
      url: "https://www.cnn.com/privacy",
      title: "Privacy center",
      confidence: 0.76,
      textExcerpt: "Privacy policy text"
    },
    {
      observationId: "terms",
      surfaceType: "terms",
      url: "/terms",
      confidence: 0.45,
      status: "fetched",
      textExcerpt: "Terms of service text"
    }
  ] as never, "https://cnn.com/");

  assert.deepEqual(
    surfaces.map((row) => ({ pageUrl: row.pageUrl, type: row.surface.surfaceType })),
    [
      { pageUrl: "https://cnn.com/privacy", type: "privacy_policy" },
      { pageUrl: "https://cnn.com/terms", type: "terms" }
    ]
  );
});

test("dedupePolicySurfaces canonicalizes locale aliases and separates cookie preferences", async () => {
  const { dedupePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "cookie-direct",
      surfaceType: "cookie_policy",
      url: "https://www.amazon.de/gp/help/customer/display.html?nodeId=201890250",
      title: "Cookie policy",
      confidence: 0.76,
      textExcerpt: "Cookie policy text"
    },
    {
      observationId: "cookie-locale-alias",
      surfaceType: "cookie_policy",
      url: "https://www.amazon.de/-/en/gp/help/customer/display.html?nodeId=201890250",
      title: "Cookie policy",
      confidence: 0.76,
      textExcerpt: "Cookie policy text"
    },
    {
      observationId: "cookie-preferences",
      surfaceType: "cookie_policy",
      url: "https://www.amazon.de/privacyprefs/customize?language=en&oCT=ads",
      title: "Privacy preferences",
      confidence: 0.82,
      textExcerpt: "Cookie preferences"
    }
  ] as never, "https://amazon.de/");

  assert.equal(surfaces.length, 2);
  assert.deepEqual(
    surfaces.map((row) => ({
      pageUrl: row.pageUrl,
      type: row.surface.surfaceType,
      aliases: row.aliasUrls
    })),
    [
      {
        pageUrl: "https://amazon.de/gp/help/customer/display.html?nodeId=201890250",
        type: "cookie_policy",
        aliases: [
          "https://www.amazon.de/gp/help/customer/display.html?nodeId=201890250",
          "https://www.amazon.de/-/en/gp/help/customer/display.html?nodeId=201890250"
        ]
      },
      {
        pageUrl: "https://amazon.de/privacyprefs/customize?language=en&oCT=ads",
        type: "cookie_settings",
        aliases: ["https://www.amazon.de/privacyprefs/customize?language=en&oCT=ads"]
      }
    ]
  );
});

test("dedupePolicySurfaces rejects IMOU 404 evidence and preserves typed semantic policy fragments", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "broken-regional-policy",
      surfaceType: "privacy_policy",
      normalizedUrl: "https://www.imou.com/uk/404",
      status: "fetched",
      confidence: 0.99,
      textExcerpt: "Ops, the page slips away. Back Home Products Support Privacy Policy Cookie Policy."
    },
    {
      observationId: "canonical-privacy",
      surfaceType: "privacy_policy",
      normalizedUrl: "https://www.imou.com/na/policy#privacy-policy",
      status: "fetched",
      confidence: 0.99,
      lastUpdatedText: "Last modified: 2022-01-19",
      textExcerpt: "IMOU privacy policy explains how the controller processes personal data and how to contact its privacy team."
    },
    {
      observationId: "canonical-cookie",
      surfaceType: "cookie_policy",
      normalizedUrl: "https://www.imou.com/na/policy#cookie-policy",
      status: "fetched",
      confidence: 0.99,
      textExcerpt: "IMOU cookie policy explains the cookies used by the website."
    }
  ] as never, "https://www.imou.com/");

  assert.deepEqual(surfaces.map((row) => row.pageUrl), [
    "https://imou.com/policy#privacy-policy",
    "https://imou.com/policy#cookie-policy"
  ]);
  assert.deepEqual(
    summarizePolicySurfaces(surfaces, "imou.com").policyLastUpdatedTexts,
    ["Last modified: 2022-01-19"]
  );
});

test("dedupePolicySurfaces suppresses failed common-path privacy guesses", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "caltech-privacy",
      surfaceType: "privacy_policy",
      url: "/privacy",
      normalizedUrl: "https://caltech.edu/privacy",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    },
    {
      observationId: "caltech-privacy-policy",
      surfaceType: "privacy_policy",
      url: "/privacy-policy",
      normalizedUrl: "https://caltech.edu/privacy-policy",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    },
    {
      observationId: "caltech-privacy-notice",
      surfaceType: "privacy_policy",
      url: "/privacy-notice",
      normalizedUrl: "https://caltech.edu/privacy-notice",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    }
  ] as never, "https://caltech.edu/");

  assert.deepEqual(surfaces, []);
  const summary = summarizePolicySurfaces(surfaces, "caltech.edu", {
    discoveredPolicySurfaces: [
      {
        observationId: "caltech-privacy",
        surfaceType: "privacy_policy",
        url: "/privacy",
        normalizedUrl: "https://caltech.edu/privacy",
        discoveryMethod: "guessed_common_path",
        status: "failed",
        fetchable: true,
        confidence: 0.58
      }
    ] as never
  });
  assert.equal(summary.policySurfaceCount, 0);
  assert.equal(summary.privacyPolicyPresent, false);
  assert.equal(summary.privacyPolicyDiscovered, false);
  assert.deepEqual(summary.privacyPolicyUrls, []);
  assert.deepEqual(summary.discoveredPrivacyPolicyUrls, []);
});

test("dedupePolicySurfaces keeps the strongest fetched privacy document over weaker candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "weak-candidate",
      surfaceType: "privacy_policy",
      url: "/privacy",
      normalizedUrl: "https://example.edu/privacy",
      discoveryMethod: "guessed_common_path",
      status: "candidate",
      fetchable: true,
      confidence: 0.9
    },
    {
      observationId: "fetched-notice",
      surfaceType: "privacy_policy",
      url: "https://www.example.edu/privacy-notice",
      normalizedUrl: "https://www.example.edu/privacy-notice",
      discoveryMethod: "footer_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.7,
      textExcerpt: "Privacy Notice. We explain controller contact, processing purposes, legal basis, retention, rights, and international transfers.",
      observedTopics: ["controller_contact", "processing_purposes", "legal_basis", "data_retention", "data_subject_rights", "international_transfers"]
    }
  ] as never, "https://example.edu/");

  assert.deepEqual(
    surfaces.map((row) => ({ pageUrl: row.pageUrl, status: row.surface.status, type: row.surface.surfaceType })),
    [{ pageUrl: "https://example.edu/privacy-notice", status: "fetched", type: "privacy_policy" }]
  );
  const summary = summarizePolicySurfaces(surfaces, "example.edu");
  assert.equal(summary.policySurfaceCount, 1);
  assert.equal(summary.privacyPolicyPresent, true);
  assert.deepEqual(summary.privacyPolicyUrls, ["https://example.edu/privacy-notice"]);
});

test("summarizePolicySurfaces limits Article 13 aggregation to target-relevant privacy notices", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "google-policy",
      surfaceType: "privacy_policy",
      url: "https://policies.google.com/privacy",
      confidence: 0.95,
      textExcerpt: "Google Privacy Policy. We retain data and explain legal basis.",
      observedTopics: ["legal_basis", "data_retention"],
      article13DisclosureSignals: [
        {
          disclosureType: "legal_basis",
          status: "observed",
          evidenceText: "Google legal basis",
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "trustarc-seal",
      surfaceType: "privacy_policy",
      url: "https://privacy.truste.com/privacy-seal/example",
      confidence: 0.8,
      textExcerpt: "TrustArc certification program.",
      observedTopics: ["controller_contact"]
    },
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://www.webmd.com/about-webmd-policies/about-privacy-policy",
      confidence: 0.9,
      textExcerpt: "WebMD Privacy Policy. You may exercise your rights to access and erasure.",
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: "You may exercise your rights to access and erasure.",
          confidence: 0.88,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "target-cookie",
      surfaceType: "cookie_policy",
      url: "https://www.webmd.com/cookie-policy",
      confidence: 0.9,
      textExcerpt: "Cookie Policy. Analytics partners.",
      observedTopics: ["analytics", "recipients_or_vendor_categories"],
      article13DisclosureSignals: [
        {
          disclosureType: "recipients_or_vendor_categories",
          status: "observed",
          evidenceText: "Analytics partners.",
          confidence: 0.8,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://www.webmd.com/");

  const summary = summarizePolicySurfaces(surfaces, "webmd.com");

  assert.deepEqual(summary.privacyPolicyUrls, ["https://webmd.com/about-webmd-policies/about-privacy-policy"]);
  assert.deepEqual(summary.observedTopics, ["data_subject_rights"]);
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["data_subject_rights"]);
  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "thin");
  assert.equal(summary.policyTextExtractionHealth.minimumTextLengthRequired, 2500);
  assert.equal(summary.policyTextExtractionHealth.policySurfaceObserved, true);
  assert.equal(summary.policyTextExtractionHealth.policyUrlRetained, true);
  assert.equal(summary.policy_text_extraction_health.policyTextExtractionStatus, "thin");
  assert.doesNotMatch(summary.retainedPrivacyPolicyTextExcerpt, /Google Privacy Policy|Cookie Policy|TrustArc/i);
});

test("summarizePolicySurfaces does not credit external vendor policies as first-party privacy notices", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "google-privacy",
      surfaceType: "privacy_policy",
      url: "https://policies.google.com/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: "Google Privacy Policy. We explain how Google collects and uses data.",
      observedTopics: ["controller_contact", "processing_purposes"],
      article13DisclosureSignals: [
        {
          disclosureType: "controller_contact",
          status: "observed",
          evidenceText: "Google LLC is the controller for this Google service.",
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "google-terms",
      surfaceType: "terms",
      url: "https://policies.google.com/terms",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: "Google Terms of Service."
    }
  ] as never, "https://playsport.cc/");

  const summary = summarizePolicySurfaces(surfaces, "playsport.cc");

  assert.equal(summary.policySurfaceCount, 2);
  assert.equal(summary.privacyPolicyPresent, false);
  assert.deepEqual(summary.privacyPolicyUrls, []);
  assert.deepEqual(summary.observedTopics, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);
  assert.equal(summary.policyTextExtractionHealth.policySurfaceObserved, false);
  assert.equal(summary.policyTextExtractionHealth.policyUrlRetained, false);
});

test("summarizePolicySurfaces rejects consent-provider privacy policies without a provider host allowlist", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "piwik-provider-policy",
      surfaceType: "privacy_policy",
      url: "https://piwik.pro/privacy-policy/",
      normalizedUrl: "https://piwik.pro/privacy-policy/",
      linkText: "Learn more about this provider — Piwik Pro's privacy policy",
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.95,
      textExcerpt: "Piwik PRO Privacy Policy. Piwik PRO is the controller and explains its processing purposes.",
      observedTopics: ["controller_contact", "processing_purposes"]
    },
    {
      observationId: "cookiebot-provider-policy",
      surfaceType: "privacy_policy",
      url: "https://www.cookiebot.com/en/privacy-policy/",
      normalizedUrl: "https://www.cookiebot.com/en/privacy-policy/",
      linkText: "Learn more about this provider — Cookiebot's privacy policy",
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.95,
      textExcerpt: "Cookiebot Privacy Policy. Usercentrics is the controller and explains its processing purposes.",
      observedTopics: ["controller_contact", "processing_purposes"]
    }
  ] as never, "https://punktum.dk/");

  const summary = summarizePolicySurfaces(surfaces, "punktum.dk", {
    discoveredPolicySurfaces: surfaces.map((row) => row.surface)
  });

  assert.equal(summary.privacyPolicyPresent, false);
  assert.equal(summary.privacyPolicyDiscovered, false);
  assert.deepEqual(summary.privacyPolicyUrls, []);
  assert.deepEqual(summary.discoveredPrivacyPolicyUrls, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);
});

test("summarizePolicySurfaces retains a legitimate externally hosted brand privacy notice", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "hosted-brand-policy",
      surfaceType: "privacy_policy",
      url: "https://privacy.example-cdn.test/acme/privacy-policy",
      normalizedUrl: "https://privacy.example-cdn.test/acme/privacy-policy",
      linkText: "Acme's privacy policy",
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.95,
      textExcerpt: "Acme Privacy Policy. Acme is the controller and explains its processing purposes.",
      observedTopics: ["controller_contact", "processing_purposes"]
    }
  ] as never, "https://acme.test/");

  const summary = summarizePolicySurfaces(surfaces, "acme.test", {
    discoveredPolicySurfaces: surfaces.map((row) => row.surface)
  });

  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.privacyPolicyDiscovered, true);
  assert.deepEqual(summary.privacyPolicyUrls, ["https://privacy.example-cdn.test/acme/privacy-policy"]);
});

test("summarizePolicySurfaces prioritizes an explicitly general notice ahead of product-specific privacy material", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "product-policy",
      surfaceType: "privacy_policy",
      url: "https://example.test/products/learning/privacy",
      normalizedUrl: "https://example.test/products/learning/privacy",
      linkText: "Learning product privacy",
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.9,
      textExcerpt: "Product-specific privacy material for the learning application."
    },
    {
      observationId: "general-policy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy-policy-generale",
      normalizedUrl: "https://example.test/privacy-policy-generale",
      linkText: "Privacy Policy Generale",
      classifierReasonCodes: ["matched_privacy_policy", "variant_general_scope"],
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.95,
      textExcerpt: "General controller-level privacy notice with Article 13 transparency information."
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /^General controller-level privacy notice/);
  assert.deepEqual(summary.privacyPolicyUrls, [
    "https://example.test/privacy-policy-generale",
    "https://example.test/products/learning/privacy"
  ]);
});

test("summarizePolicySurfaces does not credit an external challenge-provider policy on a no-go homepage", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "challenge-provider-policy",
      surfaceType: "privacy_policy",
      url: "https://www.cloudflare.com/privacypolicy/",
      normalizedUrl: "https://www.cloudflare.com/privacypolicy/",
      linkText: "Privacy",
      status: "fetched",
      documentEvaluationState: "usable",
      confidence: 0.95,
      textExcerpt: "Cloudflare Privacy Policy. Cloudflare explains its processing purposes and controller contact.",
      observedTopics: ["controller_contact", "processing_purposes"]
    }
  ] as never, "batmanapollo.ru");

  const summary = summarizePolicySurfaces(surfaces, "batmanapollo.ru", {
    discoveredPolicySurfaces: surfaces.map((row) => row.surface),
    homepageNoGo: true
  });

  assert.equal(summary.privacyPolicyPresent, false);
  assert.equal(summary.privacyPolicyDiscovered, false);
  assert.deepEqual(summary.privacyPolicyUrls, []);
  assert.deepEqual(summary.discoveredPrivacyPolicyUrls, []);
});

test("policy projection rejects empty fetched documents and audience-specific privacy notices", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "empty-terms",
      surfaceType: "terms",
      url: "https://cnn.com/terms",
      status: "fetched",
      textExcerpt: "",
      evidenceRefs: [{ refId: "empty", excerpt: "" }]
    },
    {
      observationId: "children-privacy",
      surfaceType: "privacy_policy",
      url: "https://cnn.com/privacy",
      status: "fetched",
      title: "Children's Privacy Policy",
      textExcerpt: "Children's Privacy Policy. This document covers Services aimed at children. We collect and use personal information for those child-directed services.",
      observedTopics: ["controller_contact"],
      article13DisclosureSignals: [{
        disclosureType: "controller_contact",
        status: "observed",
        evidenceText: "The controller for these child-directed services is Warner Bros. Discovery.",
        confidence: 0.9,
        source: "deterministic"
      }]
    }
  ] as never, "https://cnn.com/");

  assert.equal(surfaces.some((row) => row.surface.surfaceType === "terms"), false);
  const summary = summarizePolicySurfaces(surfaces, "cnn.com");
  assert.equal(summary.privacyPolicyPresent, false);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);
});

test("summarizePolicySurfaces prefers general privacy notices over cookie-specific surfaces for Article 13", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "cookie-policy-misclassified",
      surfaceType: "privacy_policy",
      url: "https://www.verkada.com/privacy/cookie-policy/",
      normalizedUrl: "https://www.verkada.com/privacy/cookie-policy/",
      discoveryMethod: "footer_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.95,
      textExcerpt: "Cookie Policy. This page explains cookies, analytics, advertising tags, and similar technologies.",
      observedTopics: ["analytics", "advertising"],
      article13DisclosureSignals: [
        {
          disclosureType: "legal_basis",
          status: "partial",
          evidenceText: "Cookie consent may be used for analytics.",
          confidence: 0.66,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "general-privacy-policy",
      surfaceType: "privacy_policy",
      url: "https://www.verkada.com/privacy/privacy-policy/",
      normalizedUrl: "https://www.verkada.com/privacy/privacy-policy/",
      discoveryMethod: "footer_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.9,
      textExcerpt: "Privacy Policy. The data controller can be contacted through our privacy contact. We describe why we process personal data and the legal basis for processing personal data. We disclose service providers that process personal data, rights, and international transfers of personal data.",
      observedTopics: [
        "controller_contact",
        "processing_purposes",
        "legal_basis",
        "recipients_or_vendor_categories",
        "data_subject_rights",
        "international_transfers"
      ],
      article13DisclosureSignals: [
        {
          disclosureType: "controller_contact",
          status: "observed",
          evidenceText: "The data controller can be contacted through our privacy contact.",
          confidence: 0.88,
          source: "deterministic"
        },
        {
          disclosureType: "legal_basis",
          status: "observed",
          evidenceText: "We describe the legal basis for processing personal data.",
          confidence: 0.88,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://www.verkada.com/");

  const summary = summarizePolicySurfaces(surfaces, "verkada.com");

  assert.deepEqual(summary.privacyPolicyUrls, ["https://verkada.com/privacy/privacy-policy"]);
  assert.equal(summary.article13DisclosureTypesObserved.includes("controller_contact"), true);
  assert.equal(summary.article13DisclosureTypesObserved.includes("legal_basis"), true);
  assert.doesNotMatch(summary.retainedPrivacyPolicyTextExcerpt, /Cookie Policy/i);
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /Privacy Policy/i);
});

test("summarizePolicySurfaces excludes privacy-service marketing when a canonical privacy policy was retained", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "canonical-policy",
      surfaceType: "privacy_policy",
      url: "https://sits.example/en/privacy-policy/",
      normalizedUrl: "https://sits.example/en/privacy-policy/",
      discoveryMethod: "footer_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.95,
      textExcerpt: "Information on the controller pursuant to Art. 4 No. 7 GDPR: SITS Group AG. E-Mail: INFO@SITS.EXAMPLE. We process personal data for the purposes described in this privacy policy.",
      observedTopics: ["controller_contact", "processing_purposes"],
      article13DisclosureSignals: [{
        disclosureType: "controller_contact",
        status: "observed",
        evidenceText: "Information on the controller pursuant to Art. 4 No. 7 GDPR: SITS Group AG. E-Mail: INFO@SITS.EXAMPLE.",
        confidence: 0.9,
        source: "deterministic"
      }, {
        disclosureType: "processing_purposes",
        status: "observed",
        evidenceText: "Your contact details are stored for the purpose of processing your enquiry and follow-up questions.",
        confidence: 0.9,
        source: "deterministic"
      }]
    },
    {
      observationId: "privacy-services-marketing",
      surfaceType: "privacy_policy",
      url: "https://sits.example/en/security-advisory/dataprivacy/",
      normalizedUrl: "https://sits.example/en/security-advisory/dataprivacy/",
      discoveryMethod: "homepage_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.78,
      title: "Data Privacy Solutions",
      textExcerpt: "Our DPO-as-a-Service provides a seamless approach to managing your data and supports customer compliance programs.",
      observedTopics: ["controller_contact"],
      article13DisclosureSignals: [{
        disclosureType: "controller_contact",
        status: "partial",
        evidenceText: "Our DPO-as-a-Service provides a seamless approach to managing your data and supports customer compliance programs.",
        confidence: 0.62,
        source: "deterministic"
      }]
    },
    {
      observationId: "customer-story-false-positive",
      surfaceType: "privacy_policy",
      url: "https://sits.example/en/customer-stories/finstreet/",
      normalizedUrl: "https://sits.example/en/customer-stories/finstreet/",
      discoveryMethod: "homepage_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.76,
      title: "Efficient Data Protection Management at finstreet",
      textExcerpt: "Customer story: protection efforts. Everything had to be built from scratch.",
      observedTopics: ["controller_contact"],
      article13DisclosureSignals: [{
        disclosureType: "controller_contact",
        status: "partial",
        evidenceText: "Protection efforts. Everything had to be built from scratch.",
        confidence: 0.66,
        source: "deterministic"
      }]
    }
  ] as never, "https://sits.example/");

  const summary = summarizePolicySurfaces(surfaces, "sits.example");
  const controllerSignals = summary.article13DisclosureSignals.filter((signal) =>
    signal.disclosureType === "controller_contact"
  );

  assert.equal(controllerSignals.length, 1);
  assert.equal(controllerSignals[0]?.status, "observed");
  assert.match(controllerSignals[0]?.evidenceText ?? "", /SITS Group AG/i);
  assert.doesNotMatch(summary.retainedPrivacyPolicyTextExcerpt, /DPO-as-a-Service/i);
  assert.doesNotMatch(summary.retainedPrivacyPolicyTextExcerpt, /built from scratch/i);
  assert.equal(summary.article13DisclosureTypesPartial.includes("controller_contact"), false);
  assert.equal(summary.article13DisclosureTypesObserved.includes("processing_purposes"), true);
});

test("summarizePolicySurfaces retains substantive policy text beyond navigation chrome", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const navigationChrome = "Privacy Policy Privacy & Terms Overview Technologies FAQ Terms of Service Introduction ".repeat(18);
  const substantivePolicyText = [
    "Information we collect. We collect information you provide and information created when you use our services.",
    "Why we use information. We use personal information to provide services, maintain and improve them, personalize content, measure performance, and prevent abuse.",
    "Legal basis. We process information with consent, when needed to perform a contract, for legitimate interests, and when required by law.",
    "Retaining your information. We retain the data we collect for different periods depending on what it is, how we use it, and your settings.",
    "Data transfers. We maintain servers around the world and information may be processed outside the country where you live."
  ].join(" ");
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: `${navigationChrome}${substantivePolicyText}`,
      observedTopics: ["processing_purposes", "legal_basis", "data_retention", "international_transfers"]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.privacyPolicyPresent, true);
  assert.ok(summary.retainedPrivacyPolicyTextExcerpt.length > 1_000);
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /Retaining your information/i);
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /Data transfers/i);
});

test("summarizePolicySurfaces surrounds Article 13 snippets with full retained policy artifact context", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const artifactRoot = path.join(process.cwd(), "artifacts/local-v2-dag-lambda-simulated");
  await mkdir(artifactRoot, { recursive: true });
  const outDir = await mkdtemp(path.join(artifactRoot, "policy-context-"));
  const artifactPath = path.join(outDir, "policy_surface_text_context.txt");
  const evidenceText = "If you have a complaint, it is best to contact us first so that we can try to make things right. If you are still not happy, you have the right to contact your data protection authority.";
  const supportingContactText = "Further details can be found by contacting us by email at wbdprivacy@wbd.com.";
  const fullPolicyText = [
    "Privacy Policy introduction. We explain how this policy works.",
    "Controller information. We describe the company responsible for processing.",
    "Information we collect. We collect account and usage information.",
    "How we use information. We use information to provide and improve services.",
    "Sharing information. We share information with vendors where needed.",
    "Your choices. You can adjust some preferences in account settings.",
    evidenceText,
    supportingContactText,
    "Retention. We retain information for different periods depending on the context.",
    "Security. We use safeguards designed to protect information.",
    "International transfers. Information may be processed outside your country.",
    "Policy changes. We may update this policy from time to time.",
    "Contact. You can contact us if you have questions."
  ].join(" ");

  try {
    await writeFile(artifactPath, fullPolicyText, "utf8");
    const surfaces = dedupePolicySurfaces([
      {
        observationId: "target-privacy",
        surfaceType: "privacy_policy",
        url: "https://example.test/privacy",
        normalizedUrl: "https://example.test/privacy",
        confidence: 0.95,
        status: "fetched",
        textExcerpt: "Privacy Policy introduction. We explain how this policy works.",
        observedTopics: ["supervisory_authority"],
        artifactRefs: [
          {
            artifactId: "policy_surface_text_context",
            label: "privacy_policy normalized text",
            path: artifactPath
          }
        ],
        article13DisclosureSignals: [
          {
            disclosureType: "supervisory_authority",
            status: "observed",
            evidenceText,
            confidence: 0.9,
            source: "deterministic"
          }
        ]
      }
    ] as never, "https://example.test/");

    const summary = summarizePolicySurfaces(surfaces, "example.test");
    const retainedContext = summary.article13DisclosureSignals[0]?.selectedPolicySectionExcerpt ?? "";

    assert.match(retainedContext, /collect account and usage information/i);
    assert.match(retainedContext, /If you have a complaint/i);
    assert.match(retainedContext, /wbdprivacy@wbd\.com/i);
    assert.match(retainedContext, /International transfers/i);
    assert.match(retainedContext, /Policy changes/i);
    assert.doesNotMatch(retainedContext, /Cookies What are cookies/i);
    assert.ok(retainedContext.length > evidenceText.length);
    assert.equal(summary.article13DisclosureSignals[0]?.selectedPolicySectionHeading, "Policy text context");
    assert.equal(summary.article13DisclosureSignals[0]?.supportingContactContext, "wbdprivacy@wbd.com");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("summarizePolicySurfaces retains outside-region service-provider transfer safeguards signals", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const evidenceText = "We share personal information with third parties, service providers, and business partners for the purposes described in this notice. These third parties may be in the Netherlands as well as within other countries in the European Economic Area (EEA). Sometimes they may also be outside the EEA. We have concluded agreements with our service providers and business partners, to ensure that your personal information is protected, both within and outside the EEA.";

  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy introduction. We explain how this policy works.",
        "Information we collect. We collect account and usage information.",
        evidenceText,
        "Your privacy rights. You can exercise your rights by contacting us."
      ].join(" "),
      observedTopics: ["international_transfers"],
      article13DisclosureSignals: [
        {
          disclosureType: "international_transfers",
          status: "observed",
          evidenceText,
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");
  const transferSignal = summary.article13DisclosureSignals.find((signal) =>
    signal.disclosureType === "international_transfers"
  );
  const discardedTransferSignals = summary.discardedArticle13DisclosureSignals.filter((signal) =>
    signal.disclosureType === "international_transfers"
  );

  assert.equal(transferSignal?.status, "observed");
  assert.match(transferSignal?.evidenceText ?? "", /Sometimes they may also be outside the EEA/i);
  assert.match(
    transferSignal?.evidenceText ?? "",
    /personal information is protected, both within and outside the EEA/i
  );
  assert.equal(discardedTransferSignals.length, 0);
});

test("summarizePolicySurfaces dedupes overlapping Article 13 evidence candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const shorterRightsText = "You have the right to access and correct your personal data.";
  const mediumRightsText = "You have the right to access, correct, delete, and erase your personal data.";
  const completeRightsText = "You have the right to access, correct, delete, erase, object to, restrict processing of, and port your personal data.";
  const distinctRightsText = "You may download a copy of your data through privacy controls.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how information is handled.",
        "We collect account information, device information, usage information, and contact information to provide services, maintain security, improve product features, personalize experiences, respond to requests, and measure performance. ".repeat(18),
        completeRightsText,
        distinctRightsText,
        "Retention. We retain information for different periods depending on the context and legal requirements. ".repeat(12)
      ].join(" "),
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: shorterRightsText,
          confidence: 0.8,
          source: "deterministic",
          selectedEvidenceStrength: "moderate",
          selectedPolicySectionExcerpt: shorterRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: completeRightsText,
          confidence: 0.9,
          source: "deterministic",
          selectedEvidenceStrength: "strong",
          selectedPolicySectionExcerpt: completeRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: mediumRightsText,
          confidence: 0.85,
          source: "deterministic",
          selectedEvidenceStrength: "moderate",
          selectedPolicySectionExcerpt: mediumRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: distinctRightsText,
          confidence: 0.86,
          source: "deterministic",
          selectedEvidenceStrength: "strong",
          selectedPolicySectionExcerpt: distinctRightsText
        }
      ],
      retainedArticle13SectionEvidence: [
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: shorterRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "moderate",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: completeRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: distinctRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.evidenceText),
    [completeRightsText, distinctRightsText]
  );
  assert.deepEqual(
    summary.retainedArticle13SectionEvidence.map((evidence) => evidence.selectedPolicySectionExcerpt),
    [completeRightsText, distinctRightsText]
  );
});

test("summarizePolicySurfaces carries row-targeted retained policy section evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. Overview Privacy Policy Terms of Service Introduction Information Google collects Why Google collects data.",
        "Your privacy controls. You can review and update privacy controls, activity controls, ad settings, and personalization settings.",
        "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
        "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
        "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
        "Compliance and cooperation with regulators. We work with regulatory authorities, including local data protection authorities, to resolve complaints."
      ].join(" "),
      observedTopics: ["data_retention", "data_subject_rights", "international_transfers", "supervisory_authority"],
      retainedPolicySections: [
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Your privacy controls",
          textExcerpt: "Your privacy controls. You can review and update privacy controls, activity controls, ad settings, and personalization settings.",
          charStart: 120,
          charEnd: 255,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Exporting and deleting your information",
          textExcerpt: "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
          charStart: 256,
          charEnd: 410,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Retaining your information",
          textExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          charStart: 411,
          charEnd: 570,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Data transfers",
          textExcerpt: "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
          charStart: 571,
          charEnd: 690,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Compliance and cooperation with regulators",
          textExcerpt: "Compliance and cooperation with regulators. We work with regulatory authorities, including local data protection authorities, to resolve complaints.",
          charStart: 691,
          charEnd: 840,
          quality: "partial"
        }
      ],
      retainedArticle13SectionEvidence: [
        {
          coverageArea: "data_retention",
          selectedPolicySectionHeading: "Retaining your information",
          selectedPolicySectionExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionHeading: "Exporting and deleting your information",
          selectedPolicySectionExcerpt: "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "international_transfers",
          selectedPolicySectionHeading: "Data transfers",
          selectedPolicySectionExcerpt: "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "legal_basis",
          selectedPolicySectionHeading: "Policy body",
          selectedPolicySectionExcerpt: "Privacy Policy. Overview Privacy Policy Terms of Service.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed",
          extractionLimitation: "section_retained_without_row_specific_disclosure"
        }
      ],
      article13DisclosureSignals: [
        {
          disclosureType: "data_retention",
          status: "observed",
          evidenceText: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          confidence: 0.82,
          source: "deterministic",
          selectedPolicySectionHeading: "Retaining your information",
          selectedPolicySectionExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.policyTextCoverageMode, "section_targeted");
  assert.deepEqual(summary.missingExpectedPolicySections, ["European requirements"]);
  assert.equal(summary.policySectionCount, 5);
  assert.equal(summary.retainedPolicySectionHeadings.includes("Retaining your information"), true);
  assert.equal(summary.retainedPolicySectionHeadings.includes("Data transfers"), true);
  assert.equal(summary.retainedArticle13SectionEvidence.some((evidence) =>
    evidence.coverageArea === "legal_basis" &&
    evidence.signalObserved === "not_confirmed" &&
    evidence.extractionLimitation === "section_retained_without_row_specific_disclosure"
  ), true);
  assert.equal(summary.article13DisclosureSignals[0]?.selectedPolicySectionHeading, "Retaining your information");
  assert.match(summary.article13DisclosureSignals[0]?.selectedPolicySectionExcerpt ?? "", /retained as long as necessary/i);
});

test("summarizePolicySurfaces rejects script/config text as Article 13 policy evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const codePolicyText = ";this.gbar_={CONFIG:[[[0,\"www.gstatic.com\",null,\"0\"]]]};_.z=function(a,b){Object.defineProperties(a,b)};var rights=function(){return Object.keys({access:1,delete:1})}; Copyright The Closure Library; ".repeat(40);
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: codePolicyText,
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: ":!!b};_.z=function(a,b){Object.defineProperties(a,b)}; rights Object access delete export",
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "low_quality_extracted_code_or_config");
  assert.equal(summary.policyTextExtractionHealth.extractionFailureReason, "privacy_policy_text_low_quality_or_non_policy_content");
  assert.deepEqual(summary.article13DisclosureSignals, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_subject_rights" &&
    signal.rejectReason === "code_or_non_policy_excerpt"
  ), true);
});

test("summarizePolicySurfaces accepts substantive Portuguese policy text and production-credit topic evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const evidenceText = "A base legal para o tratamento de dados pessoais inclui consentimento, contrato e legítimo interesse.";
  const policyText = [
    "Esta política de privacidade explica como tratamos dados pessoais e como você pode exercer seus direitos.",
    "Nós utilizamos dados pessoais para prestar serviços, proteger contas e atender às solicitações dos usuários.",
    "Os titulares podem entrar em contato com o controlador para obter informações sobre proteção de dados.",
    evidenceText,
  ].join(" ").repeat(12);
  const surfaces = dedupePolicySurfaces([{
    observationId: "privacy-pt",
    surfaceType: "privacy_policy",
    url: "https://example.test/politica-de-privacidade",
    normalizedUrl: "https://example.test/politica-de-privacidade",
    confidence: 0.95,
    status: "fetched",
    textExcerpt: policyText,
    gdprTransparencyTopicCandidates: [{
      topic: "legal_basis",
      status: "diagnostic_only",
      evidenceText,
      confidence: 0.9,
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      matchedLocale: "pt",
      matchedTerm: "base legal para o tratamento de dados pessoais",
      matchStrength: "direct",
      classifierReasonCodes: ["matched_legal_basis", "match_strength_direct"],
      productionCredit: false,
    }],
  }] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test", { primaryLanguage: "pt-BR" });

  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "ok");
  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, "pt");
  assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextQuality.usable, true);
  assert.equal(summary.article13DisclosureSignals.some((signal) =>
    signal.disclosureType === "legal_basis" &&
    "matchedLocale" in signal &&
    signal.matchedLocale === "pt"
  ), true);
  assert.equal(summary.gdprTransparencyProductionEvidenceDiagnostics.productionCreditSignalCount, 1);
});

test("summarizePolicySurfaces treats all twenty-one expansion policy languages as usable", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const policies = [
    ["ru", "Настоящая политика описывает цели обработки персональных данных, правовые основания обработки персональных данных и права субъекта персональных данных. "],
    ["ja", "本プライバシーポリシーでは、個人データを処理する目的、個人データ処理の法的根拠、およびデータ主体の権利について説明します。"],
    ["zh", "本隐私政策说明处理个人数据的目的、处理个人数据的法律依据以及数据主体的权利，并介绍我们如何保护个人信息。"],
    ["ar", "توضح سياسة الخصوصية أغراض معالجة البيانات الشخصية والأساس القانوني لمعالجة البيانات الشخصية وحقوق صاحب البيانات وطرق حماية المعلومات. "],
    ["sv", "Denna integritetspolicy beskriver ändamålen med behandlingen av personuppgifter, rättslig grund för behandling av personuppgifter och den registrerades rättigheter. "],
    ["ro", "Această politică de confidențialitate descrie scopurile prelucrării datelor cu caracter personal, temeiul juridic al prelucrării datelor cu caracter personal și drepturile persoanei vizate. "],
    ["cs", "Tyto zásady ochrany osobních údajů popisují účely zpracování osobních údajů, právní základ pro zpracování osobních údajů a práva subjektu údajů. "],
    ["el", "Η παρούσα πολιτική απορρήτου περιγράφει τους σκοπούς της επεξεργασίας δεδομένων προσωπικού χαρακτήρα, τη νομική βάση για την επεξεργασία δεδομένων προσωπικού χαρακτήρα και τα δικαιώματα του υποκειμένου των δεδομένων. "],
    ["hu", "Ez az adatvédelmi tájékoztató ismerteti a személyes adatok kezelésének célját, az adatkezelés jogalapját és az érintett jogait. "],
    ["da", "Denne privatlivspolitik beskriver formålene med behandlingen af personoplysninger, retsgrundlaget for behandlingen af personoplysninger og den registreredes rettigheder. "],
    ["fi", "Tämä tietosuojakäytäntö kuvaa henkilötietojen käsittelyn tarkoitukset, henkilötietojen käsittelyn oikeusperusteen ja rekisteröidyn oikeudet. "],
    ["sk", "Tieto zásady ochrany osobných údajov opisujú účely spracúvania osobných údajov, právny základ spracúvania osobných údajov a práva dotknutej osoby. "],
    ["bg", "Тази политика за поверителност описва целите на обработването на лични данни, правното основание за обработването на лични данни и правата на субекта на данните. "],
    ["hr", "Ova pravila privatnosti opisuju svrhe obrade osobnih podataka, pravnu osnovu za obradu osobnih podataka i prava ispitanika. "],
    ["nb", "Denne personvernerklæringen beskriver formålene med behandlingen av personopplysninger, rettslig grunnlag for behandling av personopplysninger og den registrertes rettigheter. "],
    ["sl", "Ta pravilnik o zasebnosti opisuje namene obdelave osebnih podatkov, pravno podlago za obdelavo osebnih podatkov in pravice posameznika na katerega se nanašajo osebni podatki. "],
    ["lt", "Ši privatumo politika aprašo asmens duomenų tvarkymo tikslus, teisinį asmens duomenų tvarkymo pagrindą ir duomenų subjekto teises. "],
    ["lv", "Šī privātuma politika apraksta personas datu apstrādes nolūkus, personas datu apstrādes juridisko pamatu un datu subjekta tiesības. "],
    ["et", "Käesolevas privaatsuspoliitikas selgitame, kuidas me teie isikuandmeid kogume, kasutame ja kaitseme, millised on isikuandmete töötlemise eesmärgid ja õiguslik alus ning kuidas andmesubjekt saab oma õigusi kasutada. "],
    ["uk", "Ця політика конфіденційності описує цілі обробки персональних даних, правову підставу для обробки персональних даних і права суб'єкта персональних даних. "],
    ["tr", "Bu gizlilik politikası kişisel verilerin işlenme amaçlarını, kişisel verilerin işlenmesinin hukuki dayanağını ve ilgili kişinin haklarını açıklar. "],
  ] as const;

  for (const [locale, sentence] of policies) {
    const surfaces = dedupePolicySurfaces([{
      observationId: `privacy-${locale}`,
      surfaceType: "privacy_policy",
      url: `https://example.test/privacy-${locale}`,
      normalizedUrl: `https://example.test/privacy-${locale}`,
      confidence: 0.95,
      status: "fetched",
      textExcerpt: sentence.repeat(80),
    }] as never, "https://example.test/");
    const summary = summarizePolicySurfaces(surfaces, "example.test", { primaryLanguage: locale });

    assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, locale, locale);
    assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, true, locale);
    assert.equal(summary.policyTextExtractionHealth.policyTextQuality.usable, true, locale);
    assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "ok", locale);
  }
});

test("summarizePolicySurfaces prefers the selected policy language over a different homepage language", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const policies = [
    [
      "pt",
      "tr",
      "Esta política de privacidade explica como tratamos dados pessoais, as finalidades do tratamento, a base legal, os direitos dos titulares e o contato de proteção de dados. ",
    ],
    [
      "ar",
      "en",
      "توضح سياسة الخصوصية أغراض معالجة البيانات الشخصية والأساس القانوني لمعالجة البيانات الشخصية وحقوق صاحب البيانات وبيانات الاتصال بمسؤول حماية البيانات. ",
    ],
  ] as const;

  for (const [policyLocale, siteLocale, sentence] of policies) {
    const surfaces = dedupePolicySurfaces([{
      observationId: `mixed-language-${policyLocale}`,
      surfaceType: "privacy_policy",
      url: `https://example.test/privacy-${policyLocale}`,
      normalizedUrl: `https://example.test/privacy-${policyLocale}`,
      confidence: 0.95,
      status: "fetched",
      textExcerpt: sentence.repeat(45),
    }] as never, "https://example.test/");
    const summary = summarizePolicySurfaces(surfaces, "example.test", { primaryLanguage: siteLocale });

    assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, policyLocale, policyLocale);
    assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguageSource, "policy_surface", policyLocale);
    assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, true, policyLocale);
    assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "ok", policyLocale);
  }
});

test("summarizePolicySurfaces does not let a supported homepage mask an unsupported policy language", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const policyText = "이 개인정보 처리방침은 개인정보 처리 목적, 이용자 권리, 보관 기간 및 연락 방법을 설명합니다. ".repeat(35);
  const surfaces = dedupePolicySurfaces([{
    observationId: "mixed-language-ko",
    surfaceType: "privacy_policy",
    url: "https://example.test/privacy-ko",
    normalizedUrl: "https://example.test/privacy-ko",
    confidence: 0.95,
    status: "fetched",
    textExcerpt: policyText,
  }] as never, "https://example.test/");
  const summary = summarizePolicySurfaces(surfaces, "example.test", { primaryLanguage: "en" });

  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, "ko");
  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguageSource, "policy_surface");
  assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, false);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "unsupported_language");
});

test("summarizePolicySurfaces reports unknown when usable policy text has no reliable language evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const policyText = "Privacy datum rights informatio regula principa transparen documenta. ".repeat(55);
  const surfaces = dedupePolicySurfaces([{
    observationId: "privacy-language-unknown",
    surfaceType: "privacy_policy",
    url: "https://example.test/notice",
    normalizedUrl: "https://example.test/notice",
    confidence: 0.95,
    status: "fetched",
    textExcerpt: policyText,
  }] as never, "https://example.test/");
  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, null);
  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguageSource, null);
  assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, null);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "language_unknown");
  assert.equal(summary.policyTextExtractionHealth.extractionFailureReason, "privacy_policy_language_unknown");
});

test("summarizePolicySurfaces distinguishes unsupported policy language from low-quality content", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const policyText = "이 개인정보 처리방침은 개인정보 처리 목적, 이용자 권리 및 연락 방법을 설명합니다. ".repeat(35);
  const surfaces = dedupePolicySurfaces([{
    observationId: "privacy-ko",
    surfaceType: "privacy_policy",
    url: "https://example.test/privacy",
    confidence: 0.95,
    status: "fetched",
    textExcerpt: policyText,
  }] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test", { primaryLanguage: "ko" });

  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "unsupported_language");
  assert.equal(summary.policyTextExtractionHealth.extractionFailureReason, "privacy_policy_language_unsupported");
  assert.equal(summary.policyTextExtractionHealth.detectedPolicyLanguage, "ko");
  assert.equal(summary.policyTextExtractionHealth.gdprTransparencyLanguageSupported, false);
});

test("summarizePolicySurfaces separates weak Article 13 candidates from validated disclosure signals", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "google-like-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "We use personal information to provide our services, maintain and improve them, personalize content, and measure performance.",
        "We share information with service providers and partners that process data on our behalf.",
        "Privacy Policy - Privacy & Terms - Google Skip to main content Privacy & Terms Overview Privacy Policy Terms of Service Technologies FAQ.",
        "Introduction Information Google collects Why Google collects data Your privacy controls Sharing your information Keeping your information.",
        "We use various technologies to collect and store information, including cookies, local storage, databases, and server logs.",
        "Data transfers. We may process information on servers outside the European Economic Area using standard contractual clauses."
      ].join(" "),
      observedTopics: ["controller_contact", "processing_purposes", "recipients_or_vendor_categories", "data_retention", "international_transfers"],
      article13DisclosureSignals: [
        {
          disclosureType: "controller_contact",
          status: "observed",
          evidenceText: "Privacy Policy - Privacy & Terms - Google Skip to main content Privacy & Terms Overview Privacy Policy Terms of Service Technologies FAQ.",
          confidence: 0.82,
          source: "deterministic"
        },
        {
          disclosureType: "data_retention",
          status: "partial",
          evidenceText: "Introduction Information Google collects Why Google collects data Your privacy controls Sharing your information Keeping your information.",
          confidence: 0.62,
          source: "deterministic"
        },
        {
          disclosureType: "data_retention",
          status: "partial",
          evidenceText: "We use various technologies to collect and store information, including cookies, local storage, databases, and server logs.",
          confidence: 0.62,
          source: "deterministic"
        },
        {
          disclosureType: "processing_purposes",
          status: "observed",
          evidenceText: "We use personal information to provide our services, maintain and improve them, personalize content, and measure performance.",
          confidence: 0.78,
          source: "deterministic"
        },
        {
          disclosureType: "recipients_or_vendor_categories",
          status: "observed",
          evidenceText: "We share information with service providers and partners that process data on our behalf.",
          confidence: 0.78,
          source: "deterministic"
        },
        {
          disclosureType: "international_transfers",
          status: "observed",
          evidenceText: "Data transfers. We may process information on servers outside the European Economic Area using standard contractual clauses.",
          confidence: 0.78,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.disclosureType),
    ["processing_purposes", "recipients_or_vendor_categories", "international_transfers"]
  );
  assert.equal(summary.article13DisclosureTypesObserved.includes("controller_contact"), false);
  assert.equal(summary.article13DisclosureTypesPartial.includes("data_retention"), false);
  assert.equal(summary.observedPolicyTopicHints.includes("controller_contact"), true);
  assert.equal(summary.observedPolicyTopicHints.includes("data_retention"), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "controller_contact" &&
    signal.rejectReason === "page_chrome_or_navigation"
  ), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_retention" &&
    signal.rejectReason === "table_of_contents_only"
  ), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_retention" &&
    signal.rejectReason === "generic_storage_not_retention"
  ), true);
});

test("summarizePolicySurfaces retains stale transfer frameworks even when the source candidate was discarded", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const staleExcerpt = [
    "Our payment provider is certified under the EU-US Privacy Shield.",
    "When you provide your information to us, we will only use the information for the purposes for which it is provided."
  ].join(" ");
  const retentionExcerpt =
    "How long do we keep your data? We retain it as long as necessary for the purpose for which it was collected.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "oxfam-like-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: `${retentionExcerpt} ${staleExcerpt}`,
      discardedArticle13DisclosureSignals: [
        {
          confidence: 0.75,
          disclosureType: "processing_purposes",
          evidenceText: staleExcerpt,
          rejectReason: "insufficient_row_specific_terms",
          source: "deterministic",
          status: "discarded"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test", {
    scanStartedAt: "2026-07-25T12:00:00.000Z"
  });

  assert.equal(summary.staleLegalFrameworkReferenceObserved, true);
  assert.equal(summary.legalFrameworkValidityMatches.length, 1);
  assert.equal(summary.legalFrameworkValidityMatches[0]?.canonicalId, "eu_us_privacy_shield");
  assert.equal(summary.legalFrameworkValidityMatches[0]?.statusAtScan, "invalidated");
  assert.match(summary.legalFrameworkValidityMatches[0]?.evidenceText ?? "", /Privacy Shield/i);
  assert.equal(
    summary.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "processing_purposes" &&
      /How long do we keep/i.test(signal.evidenceText ?? "")
    ),
    false
  );
});

test("summarizePolicySurfaces accepts GDPR Transparency candidates by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const legacySignalText = "The legal basis for processing your personal data includes consent, contract, and legitimate interests.";
  const candidateText = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how we process personal data.",
        legacySignalText,
        candidateText
      ].join(" "),
      observedTopics: ["legal_basis"],
      article13DisclosureSignals: [
        {
          disclosureType: "legal_basis",
          status: "observed",
          evidenceText: legacySignalText,
          confidence: 0.9,
          source: "deterministic"
        }
      ],
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: candidateText,
          confidence: 0.93,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(summary.observedTopics, ["legal_basis"]);
  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.evidenceText),
    [legacySignalText, candidateText]
  );
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["legal_basis"]);
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 1,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 1,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 1
  });
});

test("summarizePolicySurfaces supplements Article 13 signals only from opt-in accepted GDPR Transparency candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const acceptedSpanish = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  const rejectedToc = "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints";
  const weakRights = "You have the right to access privacy information, but this weak candidate is diagnostic only.";
  const termsCandidate = "La base jurídica del tratamiento de datos personales incluye consentimiento y contrato.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how we process personal data.",
        acceptedSpanish,
        "Your privacy rights and transfers are described in this notice."
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: acceptedSpanish,
          confidence: 0.93,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        },
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: rejectedToc,
          confidence: 0.94,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "legal basis",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        },
        {
          topic: "data_subject_rights",
          status: "diagnostic_only",
          evidenceText: weakRights,
          confidence: 0.91,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "right to access",
          matchStrength: "weak",
          classifierReasonCodes: ["matched_data_subject_rights"],
          productionCredit: false
        }
      ]
    },
    {
      observationId: "terms",
      surfaceType: "terms",
      url: "https://example.test/terms",
      normalizedUrl: "https://example.test/terms",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: termsCandidate,
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: termsCandidate,
          confidence: 0.94,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test", {
    gdprTransparencyEvidenceProfile: "gdpr_transparency_multilingual_article13_v1"
  });

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(summary.observedTopics, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["legal_basis"]);
  assert.equal(summary.article13DisclosureSignals.length, 1);
  const acceptedSignal = summary.article13DisclosureSignals[0] as Record<string, unknown> | undefined;
  assert.equal(acceptedSignal?.disclosureType, "legal_basis");
  assert.equal(acceptedSignal?.productionCredit, true);
  assert.equal(acceptedSignal?.matchedLocale, "es");
  assert.equal(acceptedSignal?.evidenceText, acceptedSpanish);
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 1,
    diagnosticCandidateCount: 1,
    discardedCandidateCount: 1,
    productionCreditSignalCount: 1,
    rejectedCandidateCount: 2,
    sourceCandidateCount: 3
  });
});

test("summarizePolicySurfaces credits French Article 13 candidates through the production profile by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const purposesText =
    "Les finalités du traitement comprennent la gestion de votre compte et la fourniture des services demandés.";
  const legalBasisText =
    "La base légale du traitement des données personnelles comprend le consentement, le contrat et l'intérêt légitime.";
  const retentionText =
    "Les données personnelles sont conservées pendant la durée nécessaire aux finalités du traitement.";
  const recipientsText =
    "Nous pouvons communiquer vos données personnelles à nos prestataires et sous-traitants qui agissent pour notre compte.";
  const candidates = [
    {
      topic: "processing_purposes",
      evidenceText: purposesText,
      matchedTerm: "finalités du traitement"
    },
    {
      topic: "legal_basis",
      evidenceText: legalBasisText,
      matchedTerm: "base légale du traitement"
    },
    {
      topic: "data_retention",
      evidenceText: retentionText,
      matchedTerm: "conservées pendant la durée nécessaire"
    },
    {
      topic: "recipients_or_vendor_categories",
      evidenceText: recipientsText,
      matchedTerm: "prestataires et sous-traitants"
    }
  ].map((candidate) => ({
    ...candidate,
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${candidate.topic}`, "match_strength_equivalent"],
    confidence: 0.82,
    matchStrength: "equivalent",
    matchedLocale: "fr",
    productionCredit: false,
    status: "diagnostic_only"
  }));
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "lefigaro-style-privacy",
      surfaceType: "privacy_policy",
      url: "https://mentions-legales.example.test/page/politique-de-confidentialite",
      normalizedUrl: "https://mentions-legales.example.test/page/politique-de-confidentialite",
      confidence: 0.96,
      status: "fetched",
      textExcerpt: [
        "Politique de confidentialité. Cette politique explique le traitement des données personnelles.",
        purposesText,
        legalBasisText,
        retentionText,
        recipientsText,
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: candidates
    }
  ] as never, "https://lefigaro.fr/");

  const summary = summarizePolicySurfaces(surfaces, "lefigaro.fr");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(
    summary.article13DisclosureTypesObserved.sort(),
    [
      "data_retention",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories"
    ]
  );
  const acceptedSignals = summary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(
    acceptedSignals.every((signal) =>
      signal.productionCredit === true &&
      signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
      signal.matchedLocale === "fr"
    ),
    true
  );
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 4,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 4,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 4
  });
});

test("summarizePolicySurfaces uses multilingual policy quality by default for GDPR Transparency candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const dpoEvidence = "satisfacción en el ejercicio de sus derechos ante los responsables de los Datos Personales, puede contactar con nuestro Delegado de Protección de datos a través del mail dpo@example.test";
  const authorityEvidence = "los Datos Personales, puede contactar con nuestro Delegado de Protección de datos y/o presentar una reclamación ante la Agencia Española de Protección de Datos a través de su página web";
  const spanishPolicyText = [
    "Navidad Niños Recetas de cocina Información General Política de cookies Configuración de cookies.",
    "Esta política de privacidad describe el tratamiento de datos personales de los usuarios.",
    "El responsable explica los derechos de acceso, rectificación, supresión y oposición sobre sus datos personales.",
    "Si no obtiene satisfacción en el ejercicio de sus derechos ante los responsables de los Datos Personales,",
    dpoEvidence,
    "y/o",
    authorityEvidence,
    "También se informa sobre la protección de datos, la base jurídica del tratamiento y otros derechos de privacidad."
  ].join(" ");
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "spanish-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacidad/",
      normalizedUrl: "https://example.test/privacidad/",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: spanishPolicyText,
      observedTopics: [],
      gdprTransparencyTopicCandidates: [
        {
          topic: "dpo_contact",
          status: "diagnostic_only",
          evidenceText: dpoEvidence,
          confidence: 0.9,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "delegado de protección de datos",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_dpo_contact"],
          productionCredit: false
        },
        {
          topic: "supervisory_authority",
          status: "diagnostic_only",
          evidenceText: authorityEvidence,
          confidence: 0.9,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "presentar una reclamación ante la agencia española de protección de datos",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_supervisory_authority"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const legacySummary = summarizePolicySurfaces(surfaces, "example.test", {
    gdprTransparencyEvidenceProfile: "legacy_only"
  });
  assert.equal(legacySummary.gdprTransparencyEvidenceProfile, "legacy_only");
  assert.equal(legacySummary.gdprTransparencyProductionEvidenceEnabled, false);
  assert.deepEqual(legacySummary.article13DisclosureSignals, []);

  const optInSummary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(optInSummary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(optInSummary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(optInSummary.article13DisclosureTypesObserved, ["dpo_contact", "supervisory_authority"]);
  assert.equal(optInSummary.article13DisclosureSignals.length, 2);
  const optInSignals = optInSummary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(optInSignals.every((signal) =>
    signal.productionCredit === true &&
    signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
    signal.matchedLocale === "es"
  ), true);
});

test("materializeLocalV2DagScanDetail records stable GDPR Transparency profile metadata from scan config", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/gdpr-profile-"));
  const acceptedSpanish = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-25T02:16:00.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [],
      policySurfaceObservations: [
        {
          observationId: "target-privacy",
          surfaceType: "privacy_policy",
          url: "https://example.test/privacy",
          normalizedUrl: "https://example.test/privacy",
          confidence: 0.95,
          status: "fetched",
          textExcerpt: [
            "Privacy Policy. We explain how we process personal data.",
            acceptedSpanish
          ].join(" "),
          observedTopics: [],
          gdprTransparencyTopicCandidates: [
            {
              topic: "legal_basis",
              status: "diagnostic_only",
              evidenceText: acceptedSpanish,
              confidence: 0.93,
              classifierProvenance: "gdpr_transparency_topic_classifier.v1",
              matchedLocale: "es",
              matchedTerm: "base jurídica",
              matchStrength: "direct",
              classifierReasonCodes: ["matched_legal_basis"],
              productionCredit: false
            }
          ]
        }
      ],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 0,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "gdpr-profile-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-25T02:15:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const baseScanConfig = {
      hostname: "example.test",
      normalizedUrl: "https://example.test/",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      execution: {
        localV2Dag: { outDir },
        v2DagParallel: {
          artifactOnly: true,
          localOnly: true,
          profile: "standard",
          productionFindingIntegration: false
        }
      }
    };
    const defaultDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: baseScanConfig
      }
    }));
    const defaultSummary = defaultDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    const defaultSignals = defaultSummary?.article13DisclosureSignals as Array<Record<string, unknown>> | undefined;
    assert.equal(defaultSummary?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(defaultSummary?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(defaultDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(defaultDetail.runtimeArtifacts?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(defaultSignals?.length, 1);
    assert.equal(defaultSignals?.[0]?.productionCredit, true);
    assert.equal(defaultSignals?.[0]?.matchedLocale, "es");

    const legacyDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          ...baseScanConfig,
          execution: {
            ...baseScanConfig.execution,
            v2DagParallel: {
              ...baseScanConfig.execution.v2DagParallel,
              gdprTransparencyEvidenceProfile: "legacy_only"
            }
          }
        }
      }
    }));
    const legacySummary = legacyDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    assert.equal(legacySummary?.gdprTransparencyEvidenceProfile, "legacy_only");
    assert.equal(legacySummary?.gdprTransparencyProductionEvidenceEnabled, false);
    assert.deepEqual(legacySummary?.article13DisclosureSignals, []);
    assert.equal(legacyDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "legacy_only");

    const optInDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          ...baseScanConfig,
          execution: {
            ...baseScanConfig.execution,
            v2DagParallel: {
              ...baseScanConfig.execution.v2DagParallel,
              gdprTransparencyEvidenceProfile: "gdpr_transparency_multilingual_article13_v1"
            }
          }
        }
      }
    }));
    const optInSummary = optInDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    const optInSignals = optInSummary?.article13DisclosureSignals as Array<Record<string, unknown>> | undefined;
    assert.equal(optInSummary?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(optInSummary?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(optInDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(optInDetail.runtimeArtifacts?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(optInSignals?.length, 1);
    assert.equal(optInSignals?.[0]?.productionCredit, true);
    assert.equal(optInSignals?.[0]?.matchedLocale, "es");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail projects row-specific runtime signal summaries", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/runtime-summaries-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: true
      },
      iframeEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "frame_1",
          eventType: "iframe",
          frameUrl: "https://www.youtube.com/embed/example",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 1250,
          url: "https://example.test/"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "frame_2",
          eventType: "iframe",
          frameUrl: "https://www.google.com/maps/embed?pb=fixture",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 1350,
          url: "https://example.test/"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "completed",
          startedAt: "2026-06-17T13:13:50.000Z",
          completedAt: "2026-06-17T13:14:02.000Z",
          durationMs: 12000,
          timingBreakdown: [
            { label: "browser api probe install", durationMs: 1 }
          ],
          evidenceRefs: [],
          errors: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "c.clarity.ms",
          requestUrl: "https://c.clarity.ms/collect",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 800,
          url: "https://c.clarity.ms/collect"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_social_1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "connect.facebook.net",
          initiatorType: "script",
          requestHeaders: {
            referer: "https://example.test/"
          },
          requestUrl: "https://connect.facebook.net/en_US/fbevents.js",
          resourceType: "script",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 980,
          topLevelUrl: "https://example.test/",
          url: "https://connect.facebook.net/en_US/fbevents.js"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [
        {
          confidence: 0.92,
          entity: "Microsoft",
          matchedEvidenceRefs: [
            { refId: "net_1", url: "https://c.clarity.ms/collect" }
          ],
          observationId: "vendor_1",
          product: "Microsoft Clarity",
          purpose: "session_replay",
          vendor: "Microsoft"
        }
      ],
      policySurfaceObservations: [],
      runtimeTimeline: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "browser_api_1",
          eventType: "browser_api_access",
          evidenceRefs: [
            {
              eventType: "browser_api_access",
              excerpt: "canvas",
              label: "Browser API access: HTMLCanvasElement.toDataURL",
              refId: "browser_api_1"
            }
          ],
          hostname: "example.test",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 900,
          url: "https://example.test/"
        }
      ],
      scanId: "runtime-summary-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));
    assert.ok(detail.runtimeArtifacts);
    const hybrid = detail.runtimeArtifacts.hybridRuntimeEvidence as Record<string, Record<string, unknown>>;
    const embeddedSummary = hybrid.embeddedContentSummary;
    const iframeSummary = hybrid.iframeSummary;
    const sessionReplaySummary = hybrid.sessionReplayEvidenceSummary;
    const fingerprintingSummary = hybrid.fingerprintingEvidenceSummary;
    const firstLayerConsentChoices = hybrid.firstLayerConsentChoices as Record<string, unknown>;
    const rejectPath = detail.runtimeArtifacts.rejectPathDepthAndAvailability as Record<string, unknown>;
    assert.ok(embeddedSummary);
    assert.ok(iframeSummary);
    assert.ok(sessionReplaySummary);
    assert.ok(fingerprintingSummary);
    assert.ok(firstLayerConsentChoices);
    assert.ok(rejectPath);
    assert.equal(detail.scan.pagesScanned, 1);
    assert.equal(detail.accessPostureSummary.pagesScanned, 1);
    assert.equal(detail.accessPostureSummary.homepageFetchStatus, "success");
    assert.equal(detail.accessPostureSummary.stopReason, null);
    assert.equal(detail.snapshot?.verified_public_surfaces_count, 1);

    assert.equal(embeddedSummary.embeddedContentObserved, true);
    assert.equal(iframeSummary.preConsentIframeCount, 2);
    assert.equal(iframeSummary.thirdPartyPreConsentIframeCount, 2);
    assert.deepEqual(embeddedSummary.embeddedContentHosts, ["youtube.com", "google.com", "connect.facebook.net"]);
    assert.deepEqual(embeddedSummary.embeddedContentPurposeBuckets, {
      fontStaticResource: [],
      formOrChatWidget: [],
      mapEmbed: ["google.com"],
      mediaEmbed: ["youtube.com"],
      otherEmbeddedContent: [],
      socialEmbed: ["connect.facebook.net"],
      videoAdSdk: []
    });
    const embeddedObservations = embeddedSummary.observations as Array<Record<string, unknown>>;
    const facebookObservation = embeddedObservations.find((row) => row.hostname === "connect.facebook.net");
    assert.equal(facebookObservation?.initiatorType, "script");
    assert.equal(facebookObservation?.resourceType, "script");
    assert.equal(facebookObservation?.referrerSent, true);
    assert.equal(facebookObservation?.pageUrlSharedViaReferrer, true);
    assert.equal(sessionReplaySummary.preConsentObserved, true);
    assert.deepEqual(sessionReplaySummary.vendors, ["Microsoft Clarity"]);
    assert.equal(fingerprintingSummary.coverageRetained, true);
    assert.equal(fingerprintingSummary.fingerprintingObserved, false);
    assert.equal(fingerprintingSummary.strongCorroboratorObserved, false);
    assert.deepEqual(fingerprintingSummary.highEntropySignals, ["HTMLCanvasElement.toDataURL"]);
    assert.equal(firstLayerConsentChoices.rejectControlObserved, false);
    const requestPurposeRows = hybrid.requestPurposeClassificationConfidence as unknown as Array<Record<string, unknown>>;
    assert.equal(
      requestPurposeRows.some((row) =>
        row.requestUrl === "https://connect.facebook.net/en_US/fbevents.js" && row.vendor === "Microsoft Clarity"
      ),
      false,
      "an unmatched request must not borrow the first retained vendor"
    );
    assert.equal(rejectPath.rejectControlObserved, false);
    assert.equal(rejectPath.rejectAvailableOnFirstLayer, false);
    assert.equal(rejectPath.gdprEprivacyConsentSurfaceObserved, "unconfirmed");

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const socialMediaEmbed = outcomes.social_media_embed_pre_consent;
    assert.equal(socialMediaEmbed?.status, "Gap observed");
    assert.deepEqual(socialMediaEmbed?.criticalEvidence.retainedEvidence.providers, ["YouTube", "Meta/Facebook"]);
    assert.equal(socialMediaEmbed?.criticalEvidence.retainedEvidence.firstSocialMediaEmbedObservedMs, 980);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail keeps unknown third-party requests and lone browser API reads out of findings", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/inventory-only-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-16T13:44:14.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: false
      },
      modulesRun: [{
        completedAt: "2026-07-16T13:44:14.000Z",
        durationMs: 14000,
        errors: [],
        evidenceRefs: [],
        moduleName: "preConsentRuntimeScanner",
        startedAt: "2026-07-16T13:44:00.000Z",
        status: "completed",
        timingBreakdown: [{ label: "browser api probe install", durationMs: 1 }]
      }],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "unknown_1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "mwa.example.digital",
          requestUrl: "https://mwa.example.digital/app.js",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1400,
          url: "https://mwa.example.digital/app.js"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "unknown_2",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "mwa.example.digital",
          requestUrl: "https://mwa.example.digital/config.json",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1600,
          url: "https://mwa.example.digital/config.json"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [],
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "complete",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 2,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 2
        },
        silentEmpty: false
      },
      runtimeTimeline: [{
        consentStateAtTime: "pre_consent",
        eventId: "browser_api_1",
        eventType: "browser_api_access",
        evidenceRefs: [{
          eventType: "browser_api_access",
          excerpt: "plugins",
          label: "Browser API access: Navigator.mimeTypes",
          refId: "browser_api_1"
        }],
        hostname: "example.test",
        sourceScanner: "pre_consent_runtime",
        timestampMs: 6400,
        url: "https://example.test/"
      }],
      scanId: "inventory-only-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-07-16T13:44:00.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const base = makeScanRecord();
    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...base.scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: { artifactOnly: true, localOnly: true, productionFindingIntegration: false }
          }
        }
      }
    }));

    assert.equal(detail.snapshot?.preconsent_tracking_detected, false);
    assert.equal(detail.snapshot?.tracking_before_consent_detected, false);
    assert.equal(detail.snapshot?.tracker_count_total, 0);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 0);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_evidence_urls, []);
    assert.equal(detail.signals.some((signal) => signal.key === "privacy.preconsent_tracking_detected"), false);
    const fingerprintingSummary = detail.runtimeArtifacts?.fingerprintingEvidenceSummary as Record<string, unknown>;
    assert.equal(fingerprintingSummary.fingerprintingObserved, false);
    assert.equal(fingerprintingSummary.artifactCount, 1);

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    assert.equal(outcomes.device_identification_fingerprinting_signal_observed?.status, "Insufficient evidence");
    assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not observed");
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes a canonical Umami gateway fetch into report and score findings", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/umami-gateway-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-22T09:48:26.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: true
      },
      modulesRun: [{
        completedAt: "2026-07-22T09:48:26.000Z",
        durationMs: 12000,
        errors: [],
        evidenceRefs: [],
        moduleName: "preConsentRuntimeScanner",
        startedAt: "2026-07-22T09:48:14.000Z",
        status: "completed",
        timingBreakdown: []
      }],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "umami_script",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "cloud.umami.is",
          requestUrl: "https://cloud.umami.is/script.js",
          resourceType: "script",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 6400,
          url: "https://cloud.umami.is/script.js"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "umami_send",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "gateway.umami.is",
          requestUrl: "https://gateway.umami.is/api/send",
          resourceType: "fetch",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 6550,
          url: "https://gateway.umami.is/api/send"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [{
        basis: ["umami_cloud_analytics_runtime", "hostname_match", "url_pattern_match"],
        confidence: 0.9,
        entity: "Umami Software, Inc.",
        matchedCookieNames: [],
        matchedEvidenceIds: ["umami_script", "umami_send"],
        matchedEvidenceRefs: [
          { eventId: "umami_script", eventType: "network_request", refId: "ref_umami_script", url: "https://cloud.umami.is/script.js" },
          { eventId: "umami_send", eventType: "network_request", refId: "ref_umami_send", url: "https://gateway.umami.is/api/send" }
        ],
        matchedHostnames: ["cloud.umami.is", "gateway.umami.is"],
        matchedUrls: ["https://cloud.umami.is/script.js", "https://gateway.umami.is/api/send"],
        observationId: "vendor_umami",
        product: "Umami Analytics",
        purpose: "analytics",
        regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
        vendor: "Umami"
      }],
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "complete",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 2,
          normalizedVendors: 1,
          observedJourneys: 0,
          thirdPartyRequests: 2
        },
        silentEmpty: false
      },
      scanId: "umami-gateway-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-07-22T09:48:14.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const base = makeScanRecord();
    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...base.scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: { artifactOnly: true, localOnly: true, productionFindingIntegration: false }
          }
        }
      }
    }));

    assert.equal(detail.snapshot?.preconsent_tracking_detected, true);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 1);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_vendor_names, ["Umami Analytics"]);
    assert.equal(detail.preconsentViolations.some((row) => row.vendorName === "Umami Analytics"), true);
    const reportFindings = buildScanReportUnifiedFindingsForScan(detail as unknown as Record<string, unknown>);
    assert.equal(reportFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), true);
    const scoreProjection = buildCanonicalGdprEprivacyShadowProjection(detail);
    assert.equal(scoreProjection.unifiedFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), true);
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail fails closed when scoring requires a missing evidence bundle", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/missing-required-bundle-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const base = makeScanRecord();
    const scanRecord = makeScanRecord({
      scan: {
        ...base.scan,
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: { artifactOnly: true, localOnly: true, productionFindingIntegration: false }
          }
        }
      }
    });

    await assert.rejects(
      materializeLocalV2DagScanDetail(scanRecord, { requireBundle: true }),
      /Required local v2 DAG evidence bundle was unavailable/
    );
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail projects retained first-layer optional toggle defaults", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/consent-toggle-defaults-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          observationId: "consent_ui_pre_consent",
          observedAtMs: 900,
          likelyPresent: true,
          basis: ["keyword:cookie", "control:accept_all:Accept All", "control:reject_all:Reject All"],
          textExcerpt: "We use cookies for analytics and advertising. Manage optional cookie purposes below.",
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Reject All", "Accept All"],
          defaultToggleStatesObserved: true,
          nonEssentialDefaultsOff: false,
          defaultTogglePurposeLabels: ["Analytics cookies"],
          precheckedOptionalPurposeCount: 1,
          precheckedOptionalPurposeLabels: ["Analytics cookies"],
          acceptControlObserved: true,
          rejectControlObserved: true,
          managePreferencesControlObserved: false,
          controls: [
            {
              actionType: "reject_all",
              classifierReasonCodes: ["canonical_match"],
              label: "Reject All",
              visible: true
            },
            {
              actionType: "accept_all",
              classifierReasonCodes: ["canonical_match"],
              label: "Accept All",
              visible: true
            }
          ],
          confidence: 0.86,
          evidenceRefs: []
        }
      ],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        preConsentTrackingObserved: false
      },
      iframeEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [],
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "consent-toggle-defaults-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(
      path.join(outDir, "ConsentControlGeometryEvidence.json"),
      `${JSON.stringify(completedConsentGeometryFixture({
        controls: [
          { actionType: "reject_all", label: "Reject All" },
          { actionType: "accept_all", label: "Accept All" },
        ],
        pageUrl: "https://example.test/",
      }), null, 2)}\n`,
      "utf8",
    );

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));
    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.defaultToggleStatesObserved, true);
    assert.equal(firstLayerChoices?.nonEssentialDefaultsOff, false);
    assert.deepEqual(firstLayerChoices?.precheckedOptionalPurposeLabels, ["Analytics cookies"]);
    assert.equal(detail.runtimeArtifacts?.consentActionableChoiceObserved, true);
    assert.equal(detail.runtimeArtifacts?.cmpFrameworkSignalObserved, undefined);
    assert.equal(
      (detail.runtimeArtifacts?.consentTimeline as Record<string, unknown> | undefined)?.firstConsentSurfaceVisibleMs,
      900
    );

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    assert.equal(outcomes.cookie_banner_preticked_or_implied_consent, undefined);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail reconciles canonical redirects, CMP traffic, consent evidence, and policy surfaces", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/canonical-redirect-cmp-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-20T18:10:31.000Z",
      cmpRuntimeObservations: [{
        entity: "Osano",
        observedAtMs: 25700,
        product: "Osano CMP",
        signals: [{ matchedField: "script_host", matchedValueRedacted: "cmp.osano.com", signalType: "script" }],
        vendor: "Osano"
      }],
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent",
        observedAtMs: 25700,
        likelyPresent: true,
        basis: ["control:accept_all:Accept All", "control:reject_all:Reject Non-Essential"],
        textExcerpt: "We use cookies for targeted advertising, personalization, and analytics.",
        layerInspected: "first_layer",
        defaultToggleStatesObserved: true,
        nonEssentialDefaultsOff: true,
        defaultTogglePurposeLabels: ["Targeted advertising", "Personalization", "Analytics"],
        precheckedOptionalPurposeCount: 0,
        controls: [
          { actionType: "manage_preferences", label: "Storage Preferences", visible: true },
          { actionType: "accept_all", label: "Accept All", visible: true },
          { actionType: "reject_all", label: "Reject Non-Essential", visible: true }
        ],
        confidence: 0.95,
        evidenceRefs: []
      }],
      cookieEvents: [],
      derivedRuntimeSignals: { consentBannerLikelyPresent: true, preConsentTrackingObserved: false },
      domSnapshots: [{
        capturedAtMs: 26000,
        textExcerpt: "CIRA Cybersecurity Services helps Canadian organizations improve their security posture with training, protection, and public resources.",
        url: "https://www.cira.ca/en/cybersecurity/"
      }],
      iframeEvents: [],
      modulesRun: [],
      networkEvents: [{
        consentStateAtTime: "pre_consent",
        eventId: "osano-request",
        eventType: "network_request",
        isThirdParty: true,
        method: "GET",
        requestHostname: "cmp.osano.com",
        requestId: "osano-request",
        requestUrl: "https://cmp.osano.com/example/config.js",
        resourceType: "script",
        documentUrl: "https://www.cira.ca/en/cybersecurity/",
        timestampMs: 1800,
        url: "https://cmp.osano.com/example/config.js"
      }],
      normalizedUrl: "https://d-zone.ca/",
      normalizedVendorObservations: [{
        confidence: 0.99,
        entity: "Osano",
        matchedEventIds: ["osano-request"],
        matchedHostnames: ["cmp.osano.com"],
        observedVia: ["network_request"],
        product: "Osano CMP",
        purpose: "consent_management"
      }],
      policySurfaceObservations: [{
        observationId: "privacy-policy",
        surfaceType: "privacy_policy",
        normalizedUrl: "https://www.cira.ca/en/privacy-policy/",
        url: "https://www.cira.ca/en/privacy-policy/",
        status: "fetched",
        confidence: 0.95,
        textExcerpt: "CIRA collects personal information to provide services. Service providers may process it outside Canada. You may request access or correction by contacting our Chief Privacy Officer at privacy@example.test."
      }],
      runtimeTimeline: [],
      scanId: "canonical-redirect-cmp-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [{
        artifactId: "screenshot_pre_consent",
        capturedAtMs: 25700,
        consentStateAtTime: "pre_consent",
        path: "screenshots/pre-consent.png",
        url: "https://www.cira.ca/en/cybersecurity/"
      }],
      startedAt: "2026-07-20T18:10:00.000Z",
      transportSecurityObservations: [{
        finalUrl: "https://www.cira.ca/en/cybersecurity/",
        httpProbe: {
          redirectChain: ["https://d-zone.ca/", "https://www.cira.ca/en/cybersecurity/"]
        }
      }],
      url: "https://d-zone.ca/"
    }, null, 2)}\n`, "utf8");
    await writeFile(
      path.join(outDir, "ConsentControlGeometryEvidence.json"),
      `${JSON.stringify(completedConsentGeometryFixture({
        cmpName: "Osano CMP",
        controls: [
          { actionType: "manage_preferences", label: "Storage Preferences" },
          { actionType: "accept_all", label: "Accept All" },
          { actionType: "reject_all", label: "Reject Non-Essential" },
        ],
        pageUrl: "https://www.cira.ca/en/cybersecurity/",
      }), null, 2)}\n`,
      "utf8",
    );

    const base = makeScanRecord({
      policyEnrichment: [
        { pageType: "policy_surface", sourceUrl: "https://www.cira.ca/en/cybersecurity/" },
        { pageType: "policy_surface", sourceUrl: "https://www.cira.ca/en/cybersecurity" }
      ] as never,
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "d-zone.ca",
        scanConfigJson: {
          hostname: "d-zone.ca",
          normalizedUrl: "https://d-zone.ca/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: { artifactOnly: true, localOnly: true, profile: "standard", productionFindingIntegration: false }
          }
        }
      }
    });
    const detail = await materializeLocalV2DagScanDetail(base);
    const hybrid = detail.runtimeArtifacts?.hybridRuntimeEvidence as Record<string, unknown>;
    const navigation = hybrid.navigationSummary as Record<string, unknown>;
    const network = hybrid.networkSummary as Record<string, unknown>;
    const consent = detail.runtimeArtifacts?.consentSummary as Record<string, unknown>;
    const choices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown>;

    assert.equal(detail.accessPostureSummary?.finalEffectiveUrl, "https://www.cira.ca/en/cybersecurity/");
    assert.deepEqual(navigation.redirectChain, ["https://d-zone.ca/", "https://www.cira.ca/en/cybersecurity/"]);
    assert.equal(network.thirdPartyRequestCount, 1);
    assert.equal(detail.runtimeArtifacts?.consentPlatform, "Osano CMP");
    assert.equal(consent.cmpName, "Osano CMP");
    assert.equal(choices.nonEssentialDefaultsOff, true);
    assert.deepEqual(choices.rejectLabels, ["Reject Non-Essential"]);
    assert.equal((choices.screenshotRefs as unknown[]).length, 1);
    assert.deepEqual(detail.policyEnrichment.map((row) => row.pageUrl), ["https://cira.ca/en/privacy-policy"]);
  } finally {
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail carries all gstatic matched hosts for inventory grouping", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/gstatic-hosts-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: true
      },
      iframeEvents: [],
      modulesRun: [
        {
          completedAt: "2026-06-17T13:14:02.000Z",
          durationMs: 12000,
          errors: [],
          evidenceRefs: [],
          moduleName: "preConsentRuntimeScanner",
          startedAt: "2026-06-17T13:13:50.000Z",
          status: "completed",
          timingBreakdown: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_t0",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "t0.gstatic.com",
          requestUrl: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1184,
          url: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_t1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "t1.gstatic.com",
          requestUrl: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1220,
          url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [
        {
          confidence: 0.9,
          entity: "Google LLC",
          matchedEvidenceRefs: [
            { eventId: "net_t0", eventType: "network_request", label: "t0.gstatic.com", refId: "ref_net_t0" },
            { eventId: "net_t1", eventType: "network_request", label: "t1.gstatic.com", refId: "ref_net_t1" }
          ],
          matchedHostnames: ["t0.gstatic.com", "t1.gstatic.com"],
          observationId: "vendor_google_static",
          product: "Google Static Assets",
          purpose: "infrastructure",
          regulatoryRelevance: ["cdn", "embedded_content", "static_assets", "third_party_runtime"],
          vendor: "Google"
        }
      ],
      observedJourneys: [
        {
          confidence: 0.52,
          displayName: "t0.gstatic.com",
          entryPoint: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
          evidenceRefs: [
            {
              eventId: "net_t0",
              eventType: "network_request",
              label: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
              refId: "ref_net_t0",
              url: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64"
            }
          ],
          firstObservedAtMs: 1184,
          journeyType: "endpoint",
          key: "endpoint:t0.gstatic.com"
        },
        {
          confidence: 0.52,
          displayName: "t1.gstatic.com",
          entryPoint: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
          evidenceRefs: [
            {
              eventId: "net_t1",
              eventType: "network_request",
              label: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
              refId: "ref_net_t1",
              url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64"
            }
          ],
          firstObservedAtMs: 1220,
          journeyType: "endpoint",
          key: "endpoint:t1.gstatic.com"
        }
      ],
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "gstatic-hosts-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const googleStatic = detail.trackerVendors.find((vendor) => vendor.vendorName === "Google Static Assets");
    assert.ok(googleStatic);
    assert.equal(googleStatic.vendorCategory, "infrastructure");
    assert.equal(
      (googleStatic as unknown as Record<string, unknown>).vendorDisplayCategory,
      "CDN"
    );
    assert.deepEqual(
      ((googleStatic as unknown as Record<string, unknown>).matchedHostnames as string[]).sort(),
      ["t0.gstatic.com", "t1.gstatic.com"]
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail derives visual evidence key from Lambda artifact URI", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-evidence-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-evidence-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent_settled",
          capturedAtMs: 1500,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-evidence-fixture/screenshot-pre-consent-settled.png",
          url: "https://example.test/"
        },
        {
          artifactId: "screenshot_pre_consent_full_page",
          capturedAtMs: 1400,
          captureMethod: "primary_full_page",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-evidence-fixture/screenshot-pre-consent-full-page.jpg",
          url: "https://example.test/"
        },
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1200,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-evidence-fixture/screenshot-pre-consent.png",
          url: "https://example.test/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-us-west-1/v2-dag-lambda/local/visual-evidence-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "5e7bcbc6-aa9f-41de-80da-a04335cc2b6a",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.bucket, "ws01-scan-artifacts-199536052647-us-west-1");
    assert.equal(visualArtifacts?.[0]?.id, "local_v2:screenshot_pre_consent_settled");
    assert.equal(visualArtifacts?.[0]?.capture_method, "primary_viewport_fallback");
    assert.equal(
      visualArtifacts?.[0]?.key,
      "v2-dag-lambda/local/visual-evidence-fixture/auxiliary/screenshot-pre-consent-settled.png"
    );
    assert.equal(
      visualArtifacts?.[1]?.key,
      "v2-dag-lambda/local/visual-evidence-fixture/auxiliary/screenshot-pre-consent-full-page.jpg"
    );
    assert.equal(
      visualArtifacts?.[2]?.key,
      "v2-dag-lambda/local/visual-evidence-fixture/auxiliary/screenshot-pre-consent.png"
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail prefers pre-consent geometry proof screenshots for visual evidence", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-geometry-proof-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-29T13:43:12.000Z",
      consentUiObservations: [
        {
          observationId: "consent_ui_pre_consent",
          likelyPresent: true,
          layerInspected: "first_layer",
          acceptControlObserved: true,
          rejectControlObserved: false,
          managePreferencesControlObserved: false,
          visibleChoiceLabels: ["Accept All"],
          controls: [
            {
              actionType: "accept_all",
              classifierReasonCodes: ["matched_accept", "match_strength_direct", "context_satisfied"],
              label: "Accept All",
              matchedLocale: "en",
              matchedTerm: "accept all",
              matchStrength: "direct",
              role: "button",
              selectorHint: "#onetrust-accept-btn-handler",
              tagName: "button",
              visible: true
            }
          ],
          basis: ["control:accept_all:Accept All"],
          inventoryDiagnostics: {
            retainedControlCount: 1
          }
        }
      ],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-geometry-proof-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 8402,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/visual-geometry-proof-fixture/screenshot-pre-consent.png",
          url: "https://example.test/"
        },
        {
          artifactId: "screenshot_pre_consent_geometry_proof",
          capturedAtMs: 32005,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-geometry-proof-fixture/screenshot-pre-consent-geometry-proof.png",
          url: "https://example.test/"
        }
      ],
      startedAt: "2026-06-29T13:42:39.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "reject_all",
          boundingBox: { x: 780, y: 201, width: 166, height: 22, top: 201, right: 946, bottom: 223, left: 780 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Continue without accepting",
          layer: "first_layer",
          selectorHint: "button.continue-without-accepting",
          tagName: "button"
        },
        {
          actionType: "other",
          boundingBox: { x: 419, y: 631, width: 256, height: 44, top: 631, right: 675, bottom: 675, left: 419 },
          decisionStatus: "ambiguous",
          enabled: true,
          intersectsViewport: true,
          label: "Set up the collection of your data",
          layer: "first_layer",
          selectorHint: "button.setup",
          tagName: "button"
        },
        {
          actionType: "accept_all",
          boundingBox: { x: 691, y: 631, width: 256, height: 44, top: 631, right: 947, bottom: 675, left: 691 },
          decisionStatus: "clipped",
          enabled: true,
          intersectsViewport: true,
          label: "Accept all the collection of your data",
          layer: "first_layer",
          selectorHint: "button.accept-all",
          tagName: "button"
        },
        {
          actionType: "reject_all",
          boundingBox: { x: 419, y: 691, width: 528, height: 16, top: 691, right: 947, bottom: 707, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Refuse all the collection of your data",
          layer: "first_layer",
          selectorHint: "button.refuse-all",
          tagName: "button"
        }
      ],
      cmp: { detected: true, name: "Consentmanager", confidence: 0.89, reasonCodes: [], matchedSignals: [], detections: [] },
      containers: [
        {
          layer: "first_layer",
          textExcerpt: "We and our partners use cookies and process personal data for advertising purposes. Set up. Accept all. Refuse all."
        }
      ],
      pageUrl: "https://example.test/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.89,
        firstLayerAccept: true,
        firstLayerOptions: false,
        firstLayerReject: true,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-29T13:43:12.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-proof-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2-dag-lambda/local/visual-geometry-proof-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "39567926-04da-4596-a44e-a48d9a8091a3",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.id, "local_v2:screenshot_pre_consent_geometry_proof");
    assert.equal(visualArtifacts?.[0]?.capture_method, "primary_viewport_fallback");
    assert.equal(
      visualArtifacts?.[0]?.key,
      "v2-dag-lambda/local/visual-geometry-proof-fixture/auxiliary/screenshot-pre-consent-geometry-proof.png"
    );
    assert.equal(visualArtifacts?.[1]?.id, "local_v2:screenshot_pre_consent");
    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(detail.runtimeArtifacts?.cmpFrameworkSignalObserved, true);
    assert.equal(detail.runtimeArtifacts?.cmp_vendor_name, "Consentmanager");
    assert.equal(firstLayerChoices?.acceptControlObserved, false);
    assert.equal(firstLayerChoices?.rejectControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, false);
    assert.deepEqual(firstLayerChoices?.preferenceLabels, []);
    assert.equal(
      (firstLayerChoices?.controls as Array<Record<string, unknown>> | undefined)?.some((control) =>
        control.actionType === "accept_all" && control.label === "Accept All"
      ),
      false,
      "rapid structured controls must not survive a completed geometry rejection",
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail does not count reject-and-subscribe geometry labels as reject availability", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/consent-reject-subscribe-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-29T13:42:59.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "consent-reject-subscribe-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-29T13:42:39.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "accept_all",
          boundingBox: { x: 691, y: 631, width: 256, height: 44, top: 631, right: 947, bottom: 675, left: 691 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Accept all",
          layer: "first_layer",
          selectorHint: "button.accept-all",
          tagName: "button"
        },
        {
          actionType: "manage_preferences",
          boundingBox: { x: 419, y: 631, width: 256, height: 44, top: 631, right: 675, bottom: 675, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Cookie settings",
          layer: "first_layer",
          selectorHint: "button.settings",
          tagName: "button"
        },
        {
          actionType: "reject_all",
          boundingBox: { x: 419, y: 691, width: 528, height: 44, top: 691, right: 947, bottom: 735, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Reject all and subscribe",
          layer: "first_layer",
          selectorHint: "button.reject-subscribe",
          tagName: "button"
        }
      ],
      cmp: { detected: true, name: "Consentmanager", confidence: 0.89, reasonCodes: [], matchedSignals: [], detections: [] },
      containers: [
        {
          layer: "first_layer",
          textExcerpt: "We use cookies and process personal data for advertising purposes. Cookie settings. Accept all. Reject all and subscribe."
        }
      ],
      pageUrl: "https://example.test/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.89,
        firstLayerAccept: true,
        firstLayerOptions: true,
        firstLayerReject: false,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: "2b56a6bc-ef9a-4b42-98af-56f1a395b612",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    const rejectPath = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, true);
    assert.equal(firstLayerChoices?.rejectControlObserved, false);
    assert.deepEqual(firstLayerChoices?.rejectLabels, []);
    assert.equal(
      (firstLayerChoices?.visibleChoiceLabels as string[] | undefined)?.some((label) => /subscribe/i.test(label)),
      false,
    );
    assert.equal(rejectPath?.rejectControlObserved, false);
    assert.equal(rejectPath?.rejectAvailableOnFirstLayer, false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes retained access-denied pages to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-access-denied-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          basis: ["dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.9,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Access to this site has been denied.",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          httpOnly: true,
          name: "_abck",
          sameSite: "Lax",
          secure: true,
          timestampMs: 700,
          valueHash: "blocked-page-cookie"
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "static.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 650,
          url: "https://static.latimes.com/error.css"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "bot-manager.example",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 790,
          url: "https://bot-manager.example/fingerprint.js"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "bot-manager.example",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 820,
          url: "https://bot-manager.example/collect"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "static.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 940,
          url: "https://static.latimes.com/error.js"
        }
      ],
      normalizedVendorObservations: [
        {
          confidence: 0.92,
          evidenceRefs: [],
          observedEventIds: [],
          product: "Bot Manager",
          purposes: ["security"],
          vendor: "Example Bot Manager"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_none",
        fallbackModesUsed: ["dom_text_fallback_after_consent_ui_timeout"],
        limitationKeys: ["access_denied_page"],
        notes: ["Access denied page captured before consent/runtime evidence was retained."],
        observationCounts: {
          cookiesBeforeConsent: 1,
          normalizedVendors: 1,
          thirdPartyRequests: 2
        }
      },
      runtimeTimeline: [],
      scanId: "latimes-no-go-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1200,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/latimes-no-go-fixture/screenshot-pre-consent.png",
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.equal(scanNoGoAssessment?.scanNoGoConfidence, 0.95);
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.snapshot?.tracking_before_consent_detected, false);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.some((signal) => signal.key === "tracking_before_consent_detected"), false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail treats Vercel security checkpoint as scan-level no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/vercel-checkpoint-no-go-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "screenshot-pre-consent.png"), syntheticPngHeader(1366, 900, 16_672));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-23T14:59:04.472Z",
      consentUiObservations: [
        {
          acceptControlObserved: false,
          basis: [
            "bounded_capture_timeout_or_failure",
            "dom_text_fallback_after_consent_ui_timeout",
            "insufficient_banner_keywords"
          ],
          confidence: 0.5,
          controls: [],
          layerInspected: "unknown",
          likelyPresent: false,
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          observedAtMs: 44746,
          rejectControlObserved: false,
          textExcerpt:
            "Wir überprüfen Ihren Browser\n\nVercel Sicherheitskontrollpunkt\n\n|\n\nfra1::1782226738-6uaer6kpJr2r8BVOQq1yMdHRP0Z12W8K",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [
        {
          completedAt: "2026-06-23T14:59:04.052Z",
          durationMs: 45809,
          errors: [],
          evidenceRefs: [],
          moduleName: "preConsentRuntimeScanner",
          startedAt: "2026-06-23T14:58:18.243Z",
          status: "completed"
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_2",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/",
          resourceType: "document",
          thirdParty: false,
          timestampMs: 40569,
          url: "https://numastays.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_5",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.min.js",
          resourceType: "script",
          thirdParty: false,
          timestampMs: 40926,
          url: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.min.js"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_8",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.wasm",
          resourceType: "fetch",
          thirdParty: false,
          timestampMs: 41334,
          url: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.wasm"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_12",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/request-challenge",
          resourceType: "fetch",
          thirdParty: false,
          timestampMs: 45097,
          url: "https://numastays.com/.well-known/vercel/security/request-challenge"
        }
      ],
      normalizedUrl: "https://numastays.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 4,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "numastays-vercel-checkpoint-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 41243,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: path.join(outDir, "screenshot-pre-consent.png"),
          url: "https://numastays.com/"
        }
      ],
      startedAt: "2026-06-23T14:58:18.234Z",
      url: "https://numastays.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "numastays.com",
        scanConfigJson: {
          hostname: "numastays.com",
          normalizedUrl: "https://numastays.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.ok((scanNoGoAssessment?.corroboratorCodes as string[] | undefined)?.includes("low_runtime_activity"));
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes security block pages even when cookie text resembles consent copy", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-security-block-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-23T04:37:16.000Z",
      consentUiObservations: [
        {
          basis: ["keyword:cookie", "keyword:cookies"],
          confidence: 0.62,
          likelyPresent: true,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Please enable cookies. Sorry, you have been blocked You are unable to access www.ikea.com Why have I been blocked? This website is using a security service to protect itself from online attacks. Cloudflare Ray ID: a100cba4df09f3ce",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".ikea.com",
          firstParty: true,
          name: "cf_clearance",
          sameSite: "Lax",
          timestampMs: 900,
          valueHash: "blocked-page-cookie"
        }
      ],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true
      },
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 120,
          url: "https://www.ikea.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 500,
          url: "https://www.ikea.com/favicon.ico"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 700,
          url: "https://www.ikea.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 760,
          url: "https://www.ikea.com/cdn-cgi/styles/challenges.css"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 820,
          url: "https://www.ikea.com/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"
        }
      ],
      normalizedVendorObservations: [],
      normalizedUrl: "https://www.ikea.com/",
      policySurfaceObservations: [
        {
          normalizedUrl: "https://ikea.com/privacy-policy",
          status: "failed",
          surfaceType: "privacy_policy",
          url: "/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 1,
          cookiesBeforeConsent: 1,
          networkEvents: 5,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "ikea-security-block-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1986,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/ikea-security-block-fixture/screenshot-pre-consent.png",
          url: "https://www.ikea.com/"
        }
      ],
      startedAt: "2026-06-23T04:37:03.000Z",
      url: "https://ikea.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "ikea.com",
        scanConfigJson: {
          hostname: "ikea.com",
          normalizedUrl: "https://ikea.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail treats retained bot verification DOM as scan-level no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-bot-verification-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-25T02:16:00.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false
      },
      domSnapshots: [
        {
          artifactId: "dom_text_pre_consent",
          capturedAtMs: 1400,
          consentStateAtTime: "pre_consent",
          path: "/tmp/certscore-v2/lufthansa-security-check/dom-text-pre-consent.txt",
          textExcerpt: "Security check We apologise for the interruption. We detected unusual behaviour from your browser, which resembles that of a bot. The reasons could be the following: you are using a VPN or privacy software often used by bots."
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.lufthansa.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 120,
          url: "https://www.lufthansa.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.lufthansa.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 620,
          url: "https://www.lufthansa.com/cdn-cgi/challenge-platform/scripts/jsd/main.js"
        }
      ],
      normalizedVendorObservations: [],
      normalizedUrl: "https://www.lufthansa.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 2,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "lufthansa-security-check-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1600,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/lufthansa-security-check/screenshot-pre-consent.png",
          url: "https://www.lufthansa.com/"
        }
      ],
      startedAt: "2026-06-25T02:15:48.000Z",
      url: "https://lufthansa.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "lufthansa.com",
        scanConfigJson: {
          hostname: "lufthansa.com",
          normalizedUrl: "https://lufthansa.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail withholds missing controls and score when consent coverage is incomplete", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/missing-reject-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      cmpRuntimeObservations: [
        {
          entity: "OneTrust",
          observedAtMs: 1200,
          product: "OneTrust",
          signals: [
            {
              matchedField: "script_host",
              matchedValueRedacted: "cdn.cookielaw.org",
              signalType: "script"
            },
            {
              matchedField: "cookie_name",
              matchedValueRedacted: "OptanonConsent",
              signalType: "cookie"
            }
          ],
          vendor: "OneTrust"
        }
      ],
      completedAt: "2026-06-21T21:53:14.000Z",
      consentUiObservations: [
        {
          acceptControlObserved: false,
          basis: [
            "bounded_capture_timeout_or_failure",
            "dom_text_fallback_after_consent_ui_timeout",
            "keyword:cookie",
            "keyword:consent"
          ],
          confidence: 0.72,
          likelyPresent: true,
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: false,
          textExcerpt: "We and our partners use cookies on this site to improve our service. Continue",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          cookieDomain: ".nbcnews.com",
          cookieName: "OptanonConsent",
          cookieParty: "first_party",
          cookiePurpose: "consent_management",
          operation: "set",
          thirdParty: false,
          timestampMs: 1400,
          url: "https://www.nbcnews.com/"
        }
      ],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true
      },
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "tags.example.test",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 1300,
          url: "https://tags.example.test/pixel.js"
        }
      ],
      modulesRun: [],
      normalizedUrl: "https://www.nbcnews.com/",
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["cmp_runtime_without_actionable_surface"],
        notes: [
          "CMP runtime evidence was observed, but no actionable consent surface or first-layer controls were retained in bounded capture."
        ],
        observationCounts: {
          cookieEvents: 1,
          cookiesBeforeConsent: 1,
          networkEvents: 1,
          normalizedVendors: 1,
          observedJourneys: 1,
          thirdPartyRequests: 1
        },
        silentEmpty: false
      },
      scanId: "missing-reject-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 900,
          consentStateAtTime: "pre_consent",
          pagePhase: "domcontentloaded",
          path: "/tmp/certscore-v2/missing-reject-fixture/screenshot-pre-consent.png",
          url: "https://www.nbcnews.com/"
        }
      ],
      startedAt: "2026-06-21T21:53:00.000Z",
      url: "https://www.nbcnews.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nbcnews.com",
        scanConfigJson: {
          hostname: "nbcnews.com",
          normalizedUrl: "https://www.nbcnews.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, true);
    assert.equal(detail.runtimeArtifacts?.consent_surface_observed, null);
    assert.equal(detail.runtimeArtifacts?.critical_coverage_complete, false);
    assert.equal(detail.snapshot?.certscore_overall, null);
    assert.equal(detail.snapshot?.score_confidence, "withheld_incomplete_critical_coverage");
    assert.equal(
      detail.runtimeArtifacts?.consent_preconsent_violation_count,
      0,
      "inventory-only requests must not become pre-consent violations without promotion-grade classification"
    );

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const checklist = deriveGdprEprivacyCoverageChecklist({
      coverageLimited: false,
      coverageOutcomes: outcomes,
      scanCompleted: true,
      unifiedFindings: buildScanReportUnifiedFindingsForScan(detail)
    });
    const rejectPath = checklist.find((item) => item.id === "reject_all_path_availability");
    const rejectPathArtifact = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;

    assert.equal(rejectPathArtifact?.firstLayerCookieConsentBannerObserved, false);
    assert.equal(rejectPathArtifact?.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
    assert.equal(rejectPath?.status, "Not testable");
    assert.equal(rejectPath?.evidenceState, "not_testable");
    assert.match(
      rejectPath?.limitation ?? "",
      /reject or equivalent refusal control availability cannot be determined/i
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes 1x1 screenshot placeholders to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-placeholder-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-19T23:05:28.000Z",
      consentUiObservations: [
        {
          basis: ["insufficient_banner_keywords"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "partial",
          errors: [
            "Observation settle ended early because the page/context closed: page.waitForTimeout: Target page, context or browser has been closed",
            "Full-page screenshot failed: page.screenshot: Target page, context or browser has been closed",
            "Viewport screenshot fallback failed: page.screenshot: Target page, context or browser has been closed",
            "1x1 screenshot placeholder used after screenshot capture failures."
          ]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 700,
          url: "https://www.latimes.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 780,
          url: "https://www.latimes.com/favicon.ico"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 0,
          normalizedVendors: 0,
          thirdPartyRequests: 0
        }
      },
      runtimeTimeline: [],
      scanId: "latimes-placeholder-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 3273,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/latimes-placeholder-fixture/screenshot-pre-consent.png",
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-19T23:05:21.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["visual_capture_failed_or_placeholder", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "capture_failed");
    assert.equal(detail.snapshot?.homepage_fetch_status, "capture_failed");
    assert.equal(detail.snapshot?.block_page_classification, "capture_failed");
    assert.equal(detail.snapshot?.stop_reason_code, "homepage_visual_capture_failed");
    assert.equal(detail.snapshot?.stop_reason_label, "Homepage visual capture failed");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes retained full-viewport visual error shells to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-visual-error-shell-"));
  const screenshotPath = path.join(outDir, "screenshot-pre-consent.png");
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(screenshotPath, syntheticPngHeader(1366, 900, 9_000));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T00:11:28.000Z",
      consentUiObservations: [
        {
          basis: ["insufficient_banner_keywords"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          name: "_abck",
          sameSite: "Lax",
          timestampMs: 700,
          valueHash: "blocked-page-cookie"
        },
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          name: "bm_sz",
          sameSite: "Lax",
          timestampMs: 760,
          valueHash: "blocked-page-cookie-2"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "partial",
          errors: [
            "Cookie capture unavailable because the page/context closed: browserContext.cookies: Target page, context or browser has been closed"
          ]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://www.latimes.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 600,
          url: "https://www.latimes.com/favicon.ico"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookieEvents: 2,
          cookiesBeforeConsent: 2,
          networkEvents: 2,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "latimes-visual-error-shell-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 2565,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: screenshotPath,
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-20T00:11:21.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["retained_visual_error_shell", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "visual_error_shell");
    assert.equal(detail.snapshot?.homepage_fetch_status, "visual_error");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail resolves mirrored Lambda screenshot paths for visual error shells", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const scanId = "cnn-lambda-visual-error-shell-fixture";
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/lambda-visual-error-shell-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "screenshot-pre-consent.png"), syntheticPngHeader(1366, 900, 6_925));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T16:45:20.000Z",
      consentUiObservations: [
        {
          basis: ["bounded_capture_timeout_or_failure", "dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Unknown Error",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".cnn.com",
          firstParty: true,
          name: "OptanonConsent",
          timestampMs: 1200,
          valueHash: "first-party-cookie"
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://cnn.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 400,
          url: "https://www.cnn.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "edition.cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 900,
          url: "https://edition.cnn.com/"
        }
      ],
      normalizedUrl: "https://cnn.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookieEvents: 14,
          cookiesBeforeConsent: 4,
          networkEvents: 3,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId,
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 4827,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: `/tmp/certscore-v2-dag-lambda/${scanId}/screenshot-pre-consent.png`,
          url: "https://edition.cnn.com/"
        }
      ],
      startedAt: "2026-06-20T16:44:35.000Z",
      url: "https://cnn.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "cnn.com",
        scanConfigJson: {
          hostname: "cnn.com",
          normalizedUrl: "https://cnn.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["retained_visual_error_shell", "scan_no_go_corroborated"]);
    assert.equal(visualArtifacts?.[0]?.status, "capture_failed");
    assert.equal(visualArtifacts?.[0]?.status_reason, "pre_consent_error_shell_captured");
    assert.equal(detail.snapshot?.homepage_fetch_status, "visual_error");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail marks failed pre-consent runtime without screenshots as unreliable", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/missing-screenshot-retained-runtime-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-19T23:06:52.000Z",
      consentUiObservations: [],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".nvidia.com",
          firstParty: true,
          name: "visitor_id",
          sameSite: "Lax",
          timestampMs: 1800,
          valueHash: "cookie-hash"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "failed",
          errors: [
            "page.goto: Target page, context or browser has been closed during navigation to https://nvidia.com/"
          ]
        },
        {
          moduleName: "policySurfaceScanner",
          status: "completed",
          errors: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "nvidia.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://nvidia.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "assets.adobedtm.com",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 900,
          url: "https://assets.adobedtm.com/launch.js"
        }
      ],
      normalizedUrl: "https://nvidia.com/",
      normalizedVendorObservations: [
        {
          confidence: 0.91,
          evidenceRefs: [],
          observedEventIds: [],
          product: "Adobe Experience Platform Launch",
          purposes: ["analytics"],
          vendor: "Adobe"
        }
      ],
      observedJourneys: [
        {
          journeyId: "journey_1",
          journeyType: "homepage_load",
          status: "observed",
          evidenceRefs: []
        }
      ],
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "homepage_link",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Privacy Policy",
          url: "https://www.nvidia.com/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 1,
          normalizedVendors: 1,
          thirdPartyRequests: 1
        }
      },
      runtimeTimeline: [],
      scanId: "nvidia-missing-screenshot-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-19T23:06:49.000Z",
      url: "https://nvidia.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nvidia.com",
        scanConfigJson: {
          hostname: "nvidia.com",
          normalizedUrl: "https://nvidia.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment, undefined);
    assert.equal(detail.runtimeArtifacts?.visual_access_review, undefined);
    assert.equal(detail.snapshot?.homepage_fetch_status, "success");
    assert.equal(detail.snapshot?.blocked_flag, undefined);
    assert.equal(detail.snapshot?.preconsent_tracking_detected, false);
    assert.equal(detail.snapshot?.tracking_before_consent_detected, false);
    assert.equal(detail.snapshot?.third_party_cookie_set_before_consent, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.snapshot?.cookies_before_consent_count, 0);
    assert.equal(detail.snapshot?.tracker_vendor_count, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_partial");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_evidence_urls, []);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_vendor_names, []);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 0);
    assert.deepEqual(detail.runtimeArtifacts?.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.deepEqual(detail.snapshot?.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.scan.pagesScanned, 1);
    assert.equal(detail.preconsentViolations.length, 0);
    assert.equal(detail.signals.some((signal) => signal.key === "privacy.preconsent_tracking_detected"), false);
    assert.equal(detail.signals.some((signal) => signal.key === "tracking_before_consent_detected"), false);
    assert.equal(detail.trackerVendors.length, 0);
    const projectedFindings = buildScanReportUnifiedFindingsForScan(detail);
    assert.equal(projectedFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail withholds consent choice quality when fallback control inventory is incomplete", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/fallback-consent-controls-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T19:14:52.000Z",
      consentUiObservations: [
        {
          acceptControlObserved: true,
          basis: [
            "keyword:cookie",
            "keyword:accept all",
            "control:manage_preferences:Manage Settings, Opens the preference center dialog",
            "control:accept_all:Accept All",
            "control:reject_all:Reject Optional"
          ],
          confidence: 0.86,
          controls: [
            {
              actionType: "manage_preferences",
              label: "Manage Settings, Opens the preference center dialog",
              role: "button",
              selectorHint: "#onetrust-pc-btn-handler",
              tagName: "button",
              visible: true
            },
            {
              actionType: "reject_all",
              label: "Reject Optional",
              role: "button",
              selectorHint: "button",
              tagName: "button",
              visible: true
            },
            {
              actionType: "accept_all",
              label: "Accept All",
              role: "button",
              selectorHint: "button",
              tagName: "button",
              visible: true
            }
          ],
          layerInspected: "first_layer",
          likelyPresent: true,
          managePreferencesControlObserved: true,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: true,
          textExcerpt: "NVIDIA and our third-party partners use cookies. Manage Settings Reject Optional Accept All",
          visibleChoiceLabels: ["Manage Settings, Opens the preference center dialog", "Reject Optional", "Accept All"]
        }
      ],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [
        {
          errors: [
            "page.goto: Target page, context or browser has been closed",
            "Visual fallback retained a pre-consent screenshot and bounded consent-surface evidence after the primary runtime page/context closed."
          ],
          moduleName: "preConsentRuntimeScanner",
          status: "failed"
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "nvidia.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://nvidia.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "cdn.optimizely.com",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 200,
          url: "https://cdn.optimizely.com/public/example.js"
        }
      ],
      normalizedUrl: "https://nvidia.com/",
      normalizedVendorObservations: [
        {
          confidence: 0.86,
          evidenceHostnames: ["cdn.optimizely.com"],
          evidenceUrls: ["https://cdn.optimizely.com/public/example.js"],
          matchedDomain: "optimizely.com",
          observationId: "vendor_optimizely",
          product: "Optimizely",
          purposes: ["analytics"],
          vendor: "Optimizely"
        }
      ],
      observedJourneys: [],
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "homepage_link",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Privacy Policy",
          url: "https://www.nvidia.com/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 0,
          normalizedVendors: 1,
          thirdPartyRequests: 1
        }
      },
      runtimeTimeline: [],
      scanId: "nvidia-fallback-consent-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 5343,
          captureMethod: "independent_visual_fallback_viewport",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/nvidia-fallback/screenshot-pre-consent.png",
          url: "https://www.nvidia.com/en-gb/"
        }
      ],
      startedAt: "2026-06-20T19:14:43.000Z",
      url: "https://nvidia.com/",
      visualCapture: {
        artifactRefs: [],
        captureMethod: "independent_visual_fallback_viewport",
        notes: ["Screenshot and bounded consent-surface evidence retained by an independent visual fallback after the primary runtime page/context closed."],
        status: "available"
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nvidia.com",
        scanConfigJson: {
          hostname: "nvidia.com",
          normalizedUrl: "https://nvidia.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.first_layer_consent_choices as Record<string, unknown> | undefined;
    const rejectPath = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;

    assert.equal(detail.runtimeArtifacts?.scan_no_go_assessment, undefined);
    assert.equal(detail.snapshot?.homepage_fetch_status, "success");
    assert.equal(detail.snapshot?.cookie_banner_present, null);
    assert.equal(detail.runtimeArtifacts?.consent_surface_observed, null);
    assert.equal(rejectPath?.firstLayerCookieConsentBannerObserved, false);
    assert.equal(rejectPath?.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
    assert.equal(firstLayerChoices?.rejectControlObserved, false);
    assert.deepEqual(firstLayerChoices?.rejectLabels, []);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_partial");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.snapshot?.preconsent_tracking_detected, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 0);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_vendor_names, []);
    assert.equal(detail.runtimeArtifacts?.visual_capture_method, "independent_visual_fallback_viewport");
    assert.equal(
      (detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined)?.[0]?.capture_method,
      "independent_visual_fallback_viewport",
    );
    assert.equal(detail.scan.pagesScanned, 1);
    const projectedFindings = buildScanReportUnifiedFindingsForScan(detail);
    assert.equal(projectedFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), false);
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const checklist = deriveGdprEprivacyCoverageChecklist({
      coverageLimited: false,
      coverageOutcomes: outcomes,
      scanCompleted: true,
      unifiedFindings: projectedFindings
    });
    const choiceQuality = checklist.find((item) => item.id === "consent_choice_quality");
    assert.equal(choiceQuality?.status, "Not confirmed");
    assert.equal(choiceQuality?.evidenceState, "not_testable");
    assert.match(choiceQuality?.explanation ?? "", /control inventory was incomplete/i);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail does not surface pre-consent error-shell screenshots", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-error-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          basis: ["bounded_capture_timeout_or_failure", "dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Unknown Error",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://cnn.com/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-error-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 4827,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-error-fixture/screenshot-pre-consent.png",
          url: "https://edition.cnn.com/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://cnn.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-error-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2-dag-lambda/local/visual-error-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "bc290424-9974-414e-ad48-558e1a2b469e",
        scanConfigJson: {
          hostname: "cnn.com",
          normalizedUrl: "https://cnn.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.status, "capture_failed");
    assert.equal(visualArtifacts?.[0]?.key, null);
    assert.equal(visualArtifacts?.[0]?.status_reason, "pre_consent_error_shell_captured");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail marks failed pre-consent runtime counts as not retained", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/runtime-failed-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-18T18:50:42.000Z",
      cookieEvents: [],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "failed",
          startedAt: "2026-06-18T18:50:33.000Z",
          completedAt: "2026-06-18T18:50:34.000Z",
          durationMs: 1000,
          evidenceRefs: [],
          errors: ["page.goto: net::ERR_HTTP2_PROTOCOL_ERROR"]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_1",
          eventType: "network_request",
          hostname: "ford.com",
          sourceScanner: "pre_consent_runtime",
          thirdParty: false,
          url: "https://ford.com/"
        }
      ],
      normalizedUrl: "https://ford.com/",
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "guessed_common_path",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Ford privacy policy.",
          url: "https://ford.com/privacy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 1,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      scanId: "runtime-failed-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-18T18:50:33.000Z",
      url: "https://ford.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "ford.com",
        scanConfigJson: {
          hostname: "ford.com",
          normalizedUrl: "https://ford.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    assert.ok(detail.snapshot);
    assert.ok(detail.runtimeArtifacts);
    assert.equal(detail.snapshot.runtime_counts_retained, false);
    assert.equal(detail.runtimeArtifacts.runtime_counts_retained, false);
    assert.deepEqual(detail.snapshot.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.snapshot.third_party_request_count, 0);
    assert.equal(detail.snapshot.cookies_before_consent_count, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});
