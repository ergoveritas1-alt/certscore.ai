import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  type CanonicalEvidenceBundle,
  type ReviewResult,
  SCHEMA_VERSION,
  canonicalEvidenceBundleSchema,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  buildObservedJourneys,
  classifyCookieEvents,
  summarizeObservedJourneys,
} from "./journey-builder.js";
import { getScanProfile } from "./profiles.js";
import {
  type FixtureRouteFulfiller,
  preConsentRuntimeScanner,
} from "./scanners/pre-consent-runtime-scanner.js";
import { inspectBundle, type BundleInspectionReport } from "./inspector.js";
import {
  type StaticFixturePage,
  startStaticFixtureServer,
} from "./test-fixtures/static-server.js";

const routeFulfillers: FixtureRouteFulfiller[] = [
  {
    urlPattern: /^https:\/\/www\.googletagmanager\.com\/gtm\.js\b/i,
    contentType: "application/javascript",
    body: "window.__fixtureGtmLoaded = true;",
  },
  {
    urlPattern: /^https:\/\/www\.google-analytics\.com\/g\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/www\.google\.com\/ccm\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/www\.google\.com\/pagead\/1p-conversion\//i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/www\.google\.com\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/googleads\.g\.doubleclick\.net\/pagead\/cookie\b/i,
    contentType: "image/gif",
    body: pixelBody(),
    setCookieHeaders: [
      "IDE=fixture-redacted; Domain=.doubleclick.net; Path=/; SameSite=None; Secure; HttpOnly",
    ],
  },
  {
    urlPattern: /^https:\/\/n\.clarity\.ms\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/f\.clarity\.ms\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/dpm\.demdex\.net\/id\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/www\.youtube\.com\//i,
    contentType: "text/html",
    body: "<!doctype html><title>Fixture embed</title><p>Embedded video fixture</p>",
  },
  {
    urlPattern: /^https:\/\/cm\.g\.doubleclick\.net\/pixel\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/bam\.nr-data\.net\/1\/browser\//i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/video-ads-module\.ad-tech\.nbcuni\.com\/v1\/freewheel-params\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/collector\.example\.net\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/collector\.us-east-1\.amazonaws\.com\/collect\b/i,
    contentType: "image/gif",
    body: pixelBody(),
  },
  {
    urlPattern: /^https:\/\/static\.examplecdn\.com\/app\.css\b/i,
    contentType: "text/css",
    body: "body { color: #222; }",
  },
  {
    urlPattern: /^https:\/\/static\.examplecdn\.com\/app\.js\b/i,
    contentType: "application/javascript",
    body: "window.__fixtureCdnLoaded = true;",
  },
];

const expectations: Partial<Record<StaticFixturePage, {
  savedBundle?: string;
  findings: Record<string, "eligible" | "not_eligible" | "deferred">;
  resolvedProducts?: string[];
  requiredResolvedProducts?: string[];
  endpointSubtypeCounts?: Partial<Record<string, number>>;
  unresolvedMeaningfulEndpointCount?: number;
  siteOwnedInfrastructureEndpointCount?: number;
  cookieClassification?: Partial<Record<keyof BundleInspectionReport["cookieClassification"], string[]>>;
  requiredJourneyBehaviors?: string[];
}>> = {
  "akamai-security-cookie": {
    savedBundle: "akamai-security-cookie",
    findings: {
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
    },
    resolvedProducts: ["Akamai Bot Manager / Edge"],
    cookieClassification: {
      securityInfrastructureCookies: ["_abck"],
    },
  },
  "clarity-collection": {
    savedBundle: "clarity-collection",
    findings: {
      pre_consent_tracking_detected: "eligible",
      session_replay_or_behavioral_analytics_observed: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Microsoft Clarity"],
    requiredJourneyBehaviors: ["session_replay_collection_observed"],
  },
  "clarity-f-collection": {
    findings: {
      pre_consent_tracking_detected: "eligible",
      session_replay_or_behavioral_analytics_observed: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Microsoft Clarity"],
    unresolvedMeaningfulEndpointCount: 0,
    requiredJourneyBehaviors: ["session_replay_collection_observed"],
  },
  "cmp-cookie": {
    savedBundle: "cmp-cookie",
    findings: {
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
    },
    resolvedProducts: ["OneTrust CMP"],
    cookieClassification: {
      cmpCookies: ["OptanonConsent"],
    },
  },
  "demdex-id": {
    findings: {
      pre_consent_tracking_detected: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Adobe Audience Manager / Experience Cloud"],
    unresolvedMeaningfulEndpointCount: 0,
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "ga-collection": {
    savedBundle: "ga-collection",
    findings: {
      pre_consent_tracking_detected: "eligible",
      third_party_cookie_pre_consent: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Google Analytics"],
    endpointSubtypeCounts: {
      google_analytics_collection: 1,
    },
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "ga-first-party-vendor-associated-cookie": {
    savedBundle: "ga-first-party-vendor-associated-cookie",
    findings: {
      pre_consent_tracking_detected: "not_eligible",
      third_party_cookie_pre_consent: "not_eligible",
      vendor_associated_cookie_pre_consent: "eligible",
    },
    resolvedProducts: ["Google Analytics"],
    cookieClassification: {
      firstPartyCookies: ["_ga"],
      firstPartyVendorAssociatedCookies: ["_ga"],
      thirdPartyCookies: [],
    },
  },
  "generic-cdn-noise": {
    savedBundle: "generic-cdn-noise",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: [],
  },
  "google-ads-measurement": {
    savedBundle: "google-ads-measurement",
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Google Ads / DoubleClick"],
    endpointSubtypeCounts: {
      google_ads_or_measurement: 1,
    },
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "google-doubleclick-pixel": {
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    requiredResolvedProducts: ["Google Ads / DoubleClick"],
    endpointSubtypeCounts: {
      google_ads_or_measurement: 1,
    },
    unresolvedMeaningfulEndpointCount: 0,
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "google-consent-tag-support": {
    savedBundle: "google-consent-tag-support",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: [],
    endpointSubtypeCounts: {
      google_consent_or_tag_support: 1,
    },
  },
  "google-owned-unresolved": {
    savedBundle: "google-owned-unresolved",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
    },
    resolvedProducts: [],
    endpointSubtypeCounts: {
      google_owned_unresolved_meaningful: 1,
    },
    unresolvedMeaningfulEndpointCount: 1,
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "gtm-library-only": {
    savedBundle: "gtm-library-only",
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["Google Tag Manager"],
    requiredJourneyBehaviors: ["library_loaded_only", "tag_manager_observed"],
  },
  "newrelic-performance-monitoring": {
    savedBundle: "newrelic-performance-monitoring",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: ["New Relic Browser"],
  },
  "site-owned-infrastructure": {
    savedBundle: "nbcu-site-owned-video-ad-infrastructure",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "not_eligible",
    },
    resolvedProducts: [],
    siteOwnedInfrastructureEndpointCount: 1,
  },
  "third-party-cookie-positive": {
    savedBundle: "third-party-cookie-positive",
    findings: {
      third_party_vendors_observed: "eligible",
      pre_consent_tracking_detected: "eligible",
      third_party_cookie_pre_consent: "eligible",
      endpoint_transfer_review_signal: "eligible",
      vendor_associated_cookie_pre_consent: "not_eligible",
    },
    resolvedProducts: ["Google Ads / DoubleClick"],
    cookieClassification: {
      thirdPartyCookies: ["IDE"],
      firstPartyCookies: [],
    },
    requiredJourneyBehaviors: ["cookie_set"],
  },
  "unresolved-collection-endpoint": {
    savedBundle: "clarity-generic-collect-negative",
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
    },
    resolvedProducts: [],
    unresolvedMeaningfulEndpointCount: 1,
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
  "region-coded-collection-endpoint": {
    findings: {
      third_party_vendors_observed: "not_eligible",
      pre_consent_tracking_detected: "not_eligible",
      unresolved_collection_endpoint_review_signal: "eligible",
      endpoint_transfer_review_signal: "eligible",
    },
    resolvedProducts: [],
    unresolvedMeaningfulEndpointCount: 1,
    requiredJourneyBehaviors: ["collection_endpoint_observed"],
  },
};

test("local fixture server pages produce expected v2 scan/review summaries", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-fixtures-"));
  try {
    for (const page of Object.keys(expectations) as StaticFixturePage[]) {
      const bundle = await scanFixturePage(server.urlFor(page), path.join(tempRoot, page));
      const review = await reviewEvidenceBundle(bundle);
      const report = await inspectBundle(bundle);
      const expectation = expectations[page];

      assertFixtureExpectations(page, bundle, review, report, expectation);

      if (expectation.savedBundle) {
        const savedReport = await loadSavedInspectSnapshot(expectation.savedBundle);
        assertNormalizedSavedBundleComparison(page, report, savedReport, expectation);
      }
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("region-coded endpoint fixture projects bounded geography into cross-border review", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-region-coded-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("region-coded-collection-endpoint"),
      path.join(tempRoot, "region-coded-collection-endpoint"),
    );
    const review = await reviewEvidenceBundle(bundle);

    assert.equal(
      bundle.networkEvents.some((event) =>
        event.hostname === "collector.us-east-1.amazonaws.com" &&
        event.endpointGeographyStatus === "region_observed" &&
        event.endpointGeographyRegion === "us-east-1" &&
        event.endpointGeographyProvider === "AWS" &&
        event.endpointGeographyLocationLabel === "AWS US East (N. Virginia)" &&
        event.endpointGeographyJurisdiction === "US" &&
        event.endpointGeographyPrecision === "provider_region" &&
        event.endpointGeographyBasis?.includes("aws_region_hostname") &&
        event.endpointGeographyBasis?.includes("provider_region_catalog"),
      ),
      true,
      "region-coded fixture should retain bounded network geography",
    );

    assert.equal(
      bundle.observedJourneys.some((journey) =>
        journey.relatedEndpoints.some((endpoint) => endpoint.includes("collector.us-east-1.amazonaws.com")) &&
        journey.endpointGeographyStatus === "region_observed" &&
        journey.endpointGeographyRegion === "us-east-1" &&
        journey.endpointGeographyProvider === "AWS" &&
        journey.endpointGeographyLocationLabel === "AWS US East (N. Virginia)" &&
        journey.endpointGeographyJurisdiction === "US" &&
        journey.endpointGeographyPrecision === "provider_region" &&
        journey.endpointGeographyBasis?.includes("aws_region_hostname") &&
        journey.endpointGeographyBasis?.includes("provider_region_catalog"),
      ),
      true,
      "region-coded fixture should project bounded geography into endpoint journeys",
    );

    const signal = review.findingCandidates.find(
      (candidate) => candidate.findingKey === "endpoint_transfer_review_signal",
    );
    const gdpr = review.regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
    const crossBorderRow = gdpr?.rows.find((row) => row.id === "cross_border_endpoint_review");

    assert.equal(signal?.eligibility.status, "eligible");
    assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_observed"), true);
    assert.equal(signal?.matchedCriteria.includes("endpoint_geography_region_location_observed"), true);
    assert.deepEqual(signal?.missingCorroborators, []);
    assert.equal(crossBorderRow?.status, "review_signal");
    assert.equal(crossBorderRow?.sourceFindingKeys.includes("endpoint_transfer_review_signal"), true);
    assert.deepEqual(crossBorderRow?.missingOrIncompleteSourceSignals, []);
    assert.equal(
      crossBorderRow?.evidenceRefs.includes("endpoint:collector.us-east-1.amazonaws.com"),
      true,
      "cross-border row should retain host-only endpoint evidence",
    );
    assert.equal(
      crossBorderRow?.evidenceRefs.some((ref) => ref.includes("https://") || ref.includes("/collect")),
      false,
      "cross-border row should not expose raw endpoint URL/path labels",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains embedded-content and browser API probe evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-runtime-signals-"));
  try {
    const embeddedBundle = await scanFixturePage(
      server.urlFor("embedded-third-party-iframe"),
      path.join(tempRoot, "embedded-third-party-iframe"),
      "fast",
      "never",
    );
    assert.equal(
      embeddedBundle.iframeEvents.some((event) =>
        event.consentStateAtTime === "pre_consent" &&
        event.frameUrl === "https://www.youtube.com/embed/certscore-fixture"
      ),
      true,
      "scanner should retain pre-consent third-party embedded iframe evidence",
    );

    const fingerprintingBundle = await scanFixturePage(
      server.urlFor("fingerprinting-api-probe"),
      path.join(tempRoot, "fingerprinting-api-probe"),
      "fast",
      "never",
    );
    const browserApiEvents = fingerprintingBundle.runtimeTimeline.filter((event) =>
      event.eventType === "browser_api_access"
    );
    assert.equal(browserApiEvents.length >= 2, true, "scanner should retain browser API access events");
    assert.equal(
      browserApiEvents.some((event) =>
        event.evidenceRefs.some((ref) => ref.label?.includes("HTMLCanvasElement.toDataURL"))
      ),
      true,
      "scanner should retain canvas API access evidence",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains first-layer accept and reject controls without interaction", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-simple-accept-reject"),
      path.join(tempRoot, "consent-simple-accept-reject"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.layerInspected, "first_layer");
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\baccept all\b/i.test(label)),
      true,
      "scanner should retain visible first-layer accept label",
    );
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\breject all\b/i.test(label)),
      true,
      "scanner should retain visible first-layer reject label",
    );
    assert.equal(
      observation?.controls.some((control) => control.actionType === "accept_all"),
      true,
      "scanner should classify the first-layer accept control",
    );
    assert.equal(
      observation?.controls.some((control) => control.actionType === "reject_all"),
      true,
      "scanner should classify the first-layer reject control",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains first-layer accept-only consent surface as no reject observed", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-no-reject-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-no-reject"),
      path.join(tempRoot, "consent-no-reject"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.layerInspected, "first_layer");
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\baccept all\b/i.test(label)),
      true,
      "scanner should retain visible first-layer accept label",
    );
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\b(?:reject|decline|refuse)\b/i.test(label)),
      false,
      "scanner should not invent a reject label for accept-only banners",
    );
    assert.equal(
      observation?.controls.some((control) => control.actionType === "reject_all"),
      false,
      "scanner should not classify a reject control when none is visible",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("planned pre-consent baseline skips screenshots when no consent surface is observed", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-selective-screenshot-"));
  try {
    const url = server.urlFor("policy-footer-privacy");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotMode: "selective",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(result.consentUiObservations[0]?.likelyPresent, false);
    assert.equal(result.cmpRuntimeObservations.length, 0);
    assert.equal(result.screenshots.length, 0);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((entry) => entry.label === "screenshot capture skipped"),
      true,
    );
    assert.equal(result.domSnapshots.length, 1);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner bounds post-screenshot consent recapture", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-recapture-"));
  try {
    const url = server.urlFor("policy-footer-privacy");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotMode: "always",
      waitMode: "fast",
    });
    const recaptureTiming = result.moduleRun.timingBreakdown?.find((entry) =>
      entry.label === "consent UI control recapture"
    );

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(recaptureTiming, "expected post-screenshot consent control recapture timing");
    assert.ok(
      recaptureTiming.durationMs < 5_000,
      `post-screenshot consent recapture should stay bounded, saw ${recaptureTiming.durationMs}ms`,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function scanFixturePage(
  url: string,
  outDir: string,
  waitMode: "full" | "fast" = "full",
  screenshotMode: "always" | "selective" | "never" = "always",
): Promise<CanonicalEvidenceBundle> {
  const startedAtMs = Date.now();
  const scanProfile = getScanProfile("quick");
  const artifactWriter = await createArtifactWriter(outDir);
  const scanResult = await preConsentRuntimeScanner({
    url,
    normalizedUrl: url,
    scanStartedAtMs: startedAtMs,
    internalBudgetMs: waitMode === "fast" ? 6_000 : scanProfile.internalBudgetMs,
    artifactWriter,
    routeFulfillers,
    waitMode,
    screenshotMode,
  });
  assert.equal(scanResult.moduleRun.status, "completed", scanResult.moduleRun.errors.join("; "));

  const normalizedVendorObservations = resolveVendorObservations(scanResult.vendorResolverInputs);
  const cookieEvents = classifyCookieEvents(scanResult.cookieEvents, normalizedVendorObservations);
  const observedJourneys = buildObservedJourneys({
    networkEvents: scanResult.networkEvents,
    networkResponseEvents: scanResult.networkResponseEvents,
    cookieEvents,
    cookieSnapshots: scanResult.cookieSnapshots,
    storageSnapshots: scanResult.storageSnapshots,
    scriptEvents: scanResult.scriptEvents,
    iframeEvents: scanResult.iframeEvents,
    normalizedVendorObservations,
  });

  return canonicalEvidenceBundleSchema.parse({
    scanId: `fixture_scan_${path.basename(outDir)}`,
    url,
    normalizedUrl: url,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date().toISOString(),
    region: "fixture",
    scanProfile,
    modulesRun: [scanResult.moduleRun],
    runtimeTimeline: scanResult.runtimeTimeline,
    networkEvents: scanResult.networkEvents,
    networkResponseEvents: scanResult.networkResponseEvents,
    cookieEvents,
    cookieSnapshots: scanResult.cookieSnapshots,
    storageSnapshots: scanResult.storageSnapshots,
    scriptEvents: scanResult.scriptEvents,
    iframeEvents: scanResult.iframeEvents,
    consentUiObservations: scanResult.consentUiObservations,
    consentInteractionEvents: [],
    policySurfaceObservations: [],
    cmpRuntimeObservations: scanResult.cmpRuntimeObservations,
    screenshots: scanResult.screenshots,
    domSnapshots: scanResult.domSnapshots,
    normalizedVendorObservations,
    observedJourneys,
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: normalizedVendorObservations.some((vendor) =>
        !["consent_management", "infrastructure", "security", "performance_monitoring"].includes(vendor.purpose),
      ),
      preConsentTrackingObserved: observedJourneys.some((journey) => journey.journeyType === "tracker"),
      thirdPartyCookiesPreConsentObserved: observedJourneys.some((journey) =>
        journey.journeyType === "cookie" &&
        journey.firstObservedConsentState === "pre_consent" &&
        journey.firstPartyOrThirdParty === "third_party" &&
        !["consent_management", "security", "infrastructure"].includes(journey.purpose ?? "unknown"),
      ),
      consentBannerLikelyPresent: scanResult.consentUiObservations[0]?.likelyPresent,
      sessionReplayOrBehavioralAnalyticsObserved: observedJourneys.some((journey) => journey.purpose === "session_replay"),
      journeySummary: summarizeObservedJourneys(observedJourneys),
      notes: [],
    },
    artifactRefs: [],
    scannerVersion: "certscore-scan-core-v2-fixture",
    schemaVersion: SCHEMA_VERSION,
  });
}

function assertFixtureExpectations(
  page: StaticFixturePage,
  bundle: CanonicalEvidenceBundle,
  review: ReviewResult,
  report: BundleInspectionReport,
  expectation: (typeof expectations)[StaticFixturePage],
): void {
  for (const [findingKey, status] of Object.entries(expectation.findings)) {
    assert.equal(findingStatus(review, findingKey), status, `${page}: ${findingKey}`);
  }
  if (expectation.resolvedProducts) {
    assert.deepEqual(resolvedProducts(report), expectation.resolvedProducts, `${page}: resolved products`);
  }
  for (const product of expectation.requiredResolvedProducts ?? []) {
    assert.equal(resolvedProducts(report).includes(product), true, `${page}: resolved product ${product}`);
  }
  for (const [subtype, count] of Object.entries(expectation.endpointSubtypeCounts ?? {})) {
    assert.equal(report.endpointAttribution.countByEndpointSubtype[subtype], count, `${page}: ${subtype}`);
  }
  if (expectation.unresolvedMeaningfulEndpointCount !== undefined) {
    assert.equal(
      report.endpointAttribution.unresolvedMeaningfulEndpoints.length,
      expectation.unresolvedMeaningfulEndpointCount,
      `${page}: unresolved endpoint count`,
    );
  }
  if (expectation.siteOwnedInfrastructureEndpointCount !== undefined) {
    assert.equal(
      report.endpointAttribution.siteOwnedInfrastructureEndpoints.length,
      expectation.siteOwnedInfrastructureEndpointCount,
      `${page}: site-owned endpoint count`,
    );
  }
  for (const behavior of expectation.requiredJourneyBehaviors ?? []) {
    assert.ok(
      (report.journeySummary.countByObservedBehavior[behavior] ?? 0) > 0,
      `${page}: expected behavior ${behavior}`,
    );
  }
  for (const [key, values] of Object.entries(expectation.cookieClassification ?? {})) {
    assert.deepEqual(
      report.cookieClassification[key as keyof BundleInspectionReport["cookieClassification"]],
      values,
      `${page}: cookie ${key}`,
    );
  }
  assertTraceabilityExpectations(page, bundle, review, report);
}

function assertTraceabilityExpectations(
  page: StaticFixturePage,
  bundle: CanonicalEvidenceBundle,
  review: ReviewResult,
  report: BundleInspectionReport,
): void {
  assert.equal(
    report.traceabilitySummary.vendorObservationsMissingEvidenceRefs,
    0,
    `${page}: vendor observations missing evidence refs`,
  );
  assert.equal(
    report.traceabilitySummary.vendorObservationsMissingMatchSources,
    0,
    `${page}: vendor observations missing match sources`,
  );
  assert.equal(
    report.traceabilitySummary.journeysMissingRawEventRefs,
    0,
    `${page}: journeys missing raw event refs`,
  );

  const eligibleFindings = review.findingCandidates.filter((candidate) => candidate.eligibility.status === "eligible");
  for (const finding of eligibleFindings) {
    assert.notEqual(
      finding.sourceEvidenceRefs.length,
      0,
      `${page}: eligible finding ${finding.findingKey} has no source evidence refs`,
    );
  }
  assertFindingHasExcerpt(
    review,
    "consent_banner_observed_or_not_observed",
    "consent_ui_observed",
    `${page}: consent UI observation excerpt`,
  );
  assertExcerptExists(review, "consent_ui_observed", (excerpt) =>
    excerpt.artifactRefs.length > 0 &&
    !JSON.stringify(excerpt).includes("Accept all"),
    `${page}: consent UI excerpt has bounded artifact ref without DOM prose`,
  );

  for (const journey of bundle.observedJourneys.filter((item) => item.journeyType === "tracker")) {
    assert.notEqual(journey.eventRefs.length, 0, `${page}: tracker journey ${journey.journeyId} has no raw refs`);
  }

  for (const journey of bundle.observedJourneys.filter((item) => item.attributionStatus === "unresolved_meaningful")) {
    assert.equal(
      journey.eventRefs.some((ref) => ref.eventType === "network_request"),
      true,
      `${page}: unresolved endpoint journey ${journey.journeyId} lacks network request ref`,
    );
  }

  if (page === "generic-cdn-noise") {
    assert.equal(bundle.normalizedVendorObservations.length, 0, `${page}: should not create fake vendor refs`);
    assert.equal(
      review.evidenceExcerpts.some((excerpt) => excerpt.evidenceKind === "network_request" || excerpt.evidenceKind === "script_loaded"),
      false,
      `${page}: should not create unnecessary runtime report excerpts`,
    );
    return;
  }

  const productNames = new Set(bundle.normalizedVendorObservations.map((vendor) => vendor.product ?? vendor.vendor));
  if (page === "ga-collection" && productNames.has("Google Analytics")) {
    const ga = vendorByProduct(bundle, "Google Analytics");
    assertVendorHasSource(ga, "network_request", "net", `${page}: GA collection vendor`);
    assertFindingHasExcerpt(review, "pre_consent_tracking_detected", "network_request", `${page}: GA collection excerpt`);
  }
  if (productNames.has("Google Tag Manager")) {
    const gtm = vendorByProduct(bundle, "Google Tag Manager");
    assertVendorHasSource(gtm, "script_url", "script", `${page}: GTM library vendor`);
    assert.equal(
      gtm.matchSources.some((source) => source.matchedField === "query_param_name"),
      false,
      `${page}: GTM should not be linked as identifier evidence`,
    );
    assertExcerptExists(review, "script_loaded", (excerpt) =>
      excerpt.hostname === "www.googletagmanager.com",
      `${page}: GTM script excerpt`,
    );
    assert.equal(
      findingStatus(review, "pre_consent_tracking_detected"),
      "not_eligible",
      `${page}: GTM library-only should not support active tracking`,
    );
  }
  if (productNames.has("Microsoft Clarity")) {
    const clarity = vendorByProduct(bundle, "Microsoft Clarity");
    assertVendorHasSource(clarity, "network_request", "net", `${page}: Clarity collection vendor`);
    const expectedClarityHost = page === "clarity-f-collection" ? "f.clarity.ms" : "n.clarity.ms";
    assert.equal(
      clarity.matchSources.some((source) => source.matchedValueRedacted?.includes(expectedClarityHost)),
      true,
      `${page}: Clarity source should reference ${expectedClarityHost}`,
    );
    assertFindingHasExcerpt(review, "session_replay_or_behavioral_analytics_observed", "network_request", `${page}: Clarity collection excerpt`);
  }
  if (productNames.has("OneTrust CMP")) {
    const oneTrust = vendorByProduct(bundle, "OneTrust CMP");
    assertVendorHasSource(oneTrust, "set_cookie", "cookie", `${page}: CMP cookie vendor`);
    assert.equal(
      bundle.cmpRuntimeObservations.some((observation) =>
        observation.product === "OneTrust CMP" &&
        observation.signals.some((signal) => signal.signalType === "cookie_name"),
      ),
      true,
      `${page}: OneTrust CMP runtime observation`,
    );
    assertExcerptExists(review, "cookie_set", (excerpt) =>
      excerpt.cookieNames.includes("OptanonConsent") &&
      excerpt.displayValueRedacted === "OptanonConsent=[redacted]",
      `${page}: CMP cookie excerpt`,
    );
  }
  if (page === "ga-first-party-vendor-associated-cookie") {
    assertExcerptExists(review, "cookie_set", (excerpt) =>
      excerpt.cookieNames.includes("_ga") &&
      excerpt.displayValueRedacted === "_ga=[redacted]",
      `${page}: first-party GA cookie excerpt`,
    );
    assert.equal(findingStatus(review, "third_party_cookie_pre_consent"), "not_eligible");
  }
  if (page === "third-party-cookie-positive") {
    assertVendorProductHasSource(
      bundle,
      "Google Ads / DoubleClick",
      "set_cookie",
      "cookie",
      `${page}: third-party cookie vendor`,
    );
    assertFindingHasExcerpt(review, "third_party_cookie_pre_consent", "cookie_set", `${page}: third-party cookie excerpt`);
    assertExcerptExists(review, "cookie_set", (excerpt) =>
      excerpt.cookieNames.includes("IDE") &&
      excerpt.displayValueRedacted === "IDE=[redacted]" &&
      !JSON.stringify(excerpt).includes("fixture-redacted"),
      `${page}: third-party Set-Cookie metadata excerpt redacts value`,
    );
  }
  if (page === "google-ads-measurement") {
    assertFindingHasExcerpt(review, "pre_consent_tracking_detected", "network_request", `${page}: Google Ads measurement excerpt`);
    assertExcerptExists(review, "network_request", (excerpt) =>
      excerpt.hostname === "www.google.com" &&
      excerpt.path?.startsWith("/pagead/") &&
      !JSON.stringify(excerpt).includes("fixture-redacted"),
      `${page}: Google Ads host/path/param names excerpt`,
    );
  }
  if (page === "unresolved-collection-endpoint" || page === "google-owned-unresolved") {
    assertFindingHasExcerpt(review, "unresolved_collection_endpoint_review_signal", "network_request", `${page}: unresolved endpoint excerpt`);
  }
  if (page === "site-owned-infrastructure") {
    assertExcerptExists(review, "network_request", (excerpt) =>
      excerpt.hostname === "video-ads-module.ad-tech.nbcuni.com",
      `${page}: site-owned infrastructure excerpt`,
    );
    assert.equal(findingStatus(review, "pre_consent_tracking_detected"), "not_eligible");
  }
}

function vendorByProduct(bundle: CanonicalEvidenceBundle, product: string) {
  const vendor = bundle.normalizedVendorObservations.find((item) => item.product === product);
  assert.ok(vendor, `expected vendor product ${product}`);
  return vendor;
}

function assertVendorHasSource(
  vendor: CanonicalEvidenceBundle["normalizedVendorObservations"][number],
  source: string,
  eventPrefix: string,
  message: string,
): void {
  assert.equal(
    vendor.matchSources.some((item) =>
      item.source === source &&
      item.sourceEventId?.startsWith(eventPrefix),
    ),
    true,
    message,
  );
  assert.equal(
    vendor.matchedEvidenceRefs.some((ref) => ref.eventId?.startsWith(eventPrefix)),
    true,
    `${message} evidence ref`,
  );
}

function assertVendorProductHasSource(
  bundle: CanonicalEvidenceBundle,
  product: string,
  source: string,
  eventPrefix: string,
  message: string,
): void {
  const vendors = bundle.normalizedVendorObservations.filter((vendor) => vendor.product === product);
  assert.notEqual(vendors.length, 0, `expected vendor product ${product}`);
  assert.equal(
    vendors.some((vendor) =>
      vendor.matchSources.some((item) =>
        item.source === source &&
        item.sourceEventId?.startsWith(eventPrefix),
      ),
    ),
    true,
    message,
  );
  assert.equal(
    vendors.some((vendor) =>
      vendor.matchedEvidenceRefs.some((ref) => ref.eventId?.startsWith(eventPrefix)),
    ),
    true,
    `${message} evidence ref`,
  );
}

function assertFindingHasExcerpt(
  review: ReviewResult,
  findingKey: string,
  evidenceKind: string,
  message: string,
): void {
  const finding = review.findingCandidates.find((candidate) => candidate.findingKey === findingKey);
  assert.ok(finding, `${message}: finding missing`);
  assert.notEqual(finding.evidenceExcerptIds.length, 0, `${message}: finding has no excerpt ids`);
  const excerpts = review.evidenceExcerpts.filter((excerpt) => finding.evidenceExcerptIds.includes(excerpt.excerptId));
  assert.equal(
    excerpts.some((excerpt) => excerpt.evidenceKind === evidenceKind),
    true,
    message,
  );
}

function assertExcerptExists(
  review: ReviewResult,
  evidenceKind: string,
  predicate: (excerpt: ReviewResult["evidenceExcerpts"][number]) => boolean,
  message: string,
): void {
  assert.equal(
    review.evidenceExcerpts.some((excerpt) => excerpt.evidenceKind === evidenceKind && predicate(excerpt)),
    true,
    message,
  );
}

function assertNormalizedSavedBundleComparison(
  page: StaticFixturePage,
  generated: BundleInspectionReport,
  saved: BundleInspectionReport,
  expectation: (typeof expectations)[StaticFixturePage],
): void {
  if (expectation.resolvedProducts) {
    assert.deepEqual(
      resolvedProducts(generated),
      resolvedProducts(saved),
      `${page}: resolved products should match saved bundle`,
    );
  }
  for (const [subtype, count] of Object.entries(expectation.endpointSubtypeCounts ?? {})) {
    assert.equal(generated.googleEndpointSubtypeSummary[subtype], count, `${page}: generated ${subtype}`);
    assert.equal(saved.googleEndpointSubtypeSummary[subtype], count, `${page}: saved ${subtype}`);
  }
  if (expectation.unresolvedMeaningfulEndpointCount !== undefined) {
    assert.equal(
      generated.endpointAttribution.unresolvedMeaningfulEndpoints.length,
      saved.endpointAttribution.unresolvedMeaningfulEndpoints.length,
      `${page}: unresolved endpoint count should match saved bundle`,
    );
  }
  if (expectation.siteOwnedInfrastructureEndpointCount !== undefined) {
    assert.equal(
      generated.endpointAttribution.siteOwnedInfrastructureEndpoints.length,
      saved.endpointAttribution.siteOwnedInfrastructureEndpoints.length,
      `${page}: site-owned endpoint count should match saved bundle`,
    );
  }
}

async function loadSavedInspectSnapshot(name: string): Promise<BundleInspectionReport> {
  const snapshotPath = path.resolve(
    process.cwd(),
    "fixtures/inspect-snapshots",
    `${name}.json`,
  );
  return JSON.parse(await readFile(snapshotPath, "utf8")) as BundleInspectionReport;
}

function findingStatus(review: ReviewResult, findingKey: string): string | undefined {
  return review.findingCandidates.find((candidate) => candidate.findingKey === findingKey)
    ?.eligibility.status;
}

function resolvedProducts(report: BundleInspectionReport): string[] {
  return [...new Set(report.vendorResolution.resolvedVendors
    .map((vendor) => vendor.product ?? vendor.vendor))]
    .sort();
}

function pixelBody(): string {
  return Buffer.from(
    "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64",
  ).toString("binary");
}
