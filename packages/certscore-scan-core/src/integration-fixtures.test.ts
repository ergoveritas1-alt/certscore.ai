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
  deriveConsentSurfaceInspectionOutcome,
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
  consentUiObservationFromConfirmedGeometryControls,
  consentControlsFromAccessibilityTree,
  preConsentRuntimeScanner,
  shouldRunImmediateStructuredConsentRecovery,
} from "./scanners/pre-consent-runtime-scanner.js";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { inspectBundle, type BundleInspectionReport } from "./inspector.js";
import { runScan } from "./index.js";
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
    urlPattern: /^https:\/\/cdn\.consentmanager\.net\/delivery\/js\/semiautomatic\.min\.js\b/i,
    contentType: "application/javascript",
    body: "window.__fixtureConsentmanagerLoaded = true;",
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

const broadFixtureExpectationPages = (Object.keys(expectations) as StaticFixturePage[])
  .filter((page) =>
    page !== "cmp-cookie" &&
    page !== "region-coded-collection-endpoint"
  );

for (const page of broadFixtureExpectationPages) {
  test(`fixture corpus: ${page} produces expected v2 scan/review summary`, async () => {
    const server = await startStaticFixtureServer();
    const tempRoot = await mkdtemp(path.join(tmpdir(), `certscore-v2-fixture-${page}-`));
    try {
      await scanAndAssertFixtureExpectations(server, tempRoot, page);
    } finally {
      await server.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
}

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

test("pre-consent runtime scanner retains SITS-style controls before screenshot work", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-sits-style-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-sits-style-preferences"),
      path.join(tempRoot, "consent-sits-style-preferences"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = bundle.consentUiObservations[0];
    const controls = observation?.controls ?? [];

    assert.equal(controls.some((control) => control.label === "Accept all" && control.actionType === "accept_all"), true);
    assert.equal(
      controls.some((control) => control.label === "Save consent" && control.actionType === "save_preferences"),
      true,
      JSON.stringify(controls),
    );
    assert.equal(
      controls.some((control) =>
        control.label === "Accept essential cookies" &&
        control.actionType === "reject_all" &&
        control.classifierVariant === "necessary_only"
      ),
      true,
      JSON.stringify(controls),
    );
    assert.equal(new Set(controls.map((control) => `${control.actionType}:${control.label}`)).size, controls.length);

    assert.equal(
      bundle.screenshots.some((screenshot) => screenshot.captureMethod === "primary_viewport_fallback"),
      true,
      "the production-safe viewport capture should be retained before any supplemental full-page attempt",
    );
    assert.ok(
      (bundle.modulesRun[0]?.durationMs ?? Number.POSITIVE_INFINITY) < 6_000,
      "the SITS-style fixture should retain controls and visual evidence within the bounded runtime",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner recognizes Osano deny non-essential as reject evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-deny-non-essential-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-deny-non-essential"),
      path.join(tempRoot, "consent-deny-non-essential"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.label === "Deny Non-Essential" && control.actionType === "reject_all"
      ),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner does not promote a generic product Learn more link from broad page privacy context", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-generic-learn-more-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-generic-learn-more-page-context"),
      path.join(tempRoot, "consent-generic-learn-more-page-context"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.managePreferencesControlObserved, false);
    assert.equal(
      observation?.controls.some((control) => control.label === "Learn more"),
      false,
      "contextual options labels need an actionable consent peer or a bounded CMP/consent surface",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains canonical rendered policy links from the successful page context", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-rendered-policy-links-"));
  try {
    const url = server.urlFor("consent-generic-learn-more-page-context");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 6_000,
      artifactWriter,
      routeFulfillers,
      screenshotMode: "selective",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.equal(
      result.renderedPolicyLinks.some((link) =>
        link.linkText === "Privacy policy" &&
        link.href === new URL("/policies/privacy", url).toString()
      ),
      true,
      `the successful pre-consent browser should retain the exact rendered privacy-policy href; retained=${JSON.stringify(result.renderedPolicyLinks)} timing=${JSON.stringify(result.moduleRun.timingBreakdown)}`,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner treats contextual Required Only as necessary-only reject evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-required-only-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-required-only"),
      path.join(tempRoot, "consent-required-only"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];
    const requiredOnlyControl = observation?.controls.find((control) => control.label === "Required Only");

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(requiredOnlyControl?.actionType, "reject_all");
    assert.equal(requiredOnlyControl?.classifierVariant, "necessary_only");
    assert.equal(requiredOnlyControl?.matchedTerm, "required only");
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains subscription-only reject labels without counting them as free reject proof", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-reject-subscribe-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-reject-subscribe"),
      path.join(tempRoot, "consent-reject-subscribe"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations.find((candidate) =>
      candidate.controls.some((control) => control.actionType === "accept_all" || control.actionType === "manage_preferences")
    ) ?? bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.captureDiagnostics?.completedChannels.includes("dom_inventory"),
      true,
      "typed controls should retain a completed canonical DOM-inventory channel",
    );
    assert.equal(
      observation?.captureDiagnostics?.timedOutChannels.includes("dom_inventory"),
      false,
      "a completed DOM retry should supersede an earlier timeout for the same channel",
    );
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(
      observation?.controls.some((control) => control.actionType === "reject_all"),
      false,
      "subscription-only reject labels should not satisfy first-layer reject availability",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "other" &&
        control.classifierVariant === "reject_with_subscription" &&
        /subscribe/i.test(control.label)
      ),
      true,
      "subscription-only reject labels should remain typed evidence for the paid-decline review signal",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains Reject and Pay as typed paid-decline evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-reject-pay-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-reject-pay"),
      path.join(tempRoot, "consent-reject-pay"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations.find((candidate) =>
      candidate.controls.some((control) => control.classifierVariant === "reject_with_payment")
    ) ?? bundle.consentUiObservations[0];
    const paidDecline = observation?.controls.find((control) => control.label === "Reject and Pay");

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(paidDecline?.actionType, "other");
    assert.equal(paidDecline?.classifierVariant, "reject_with_payment");
    assert.ok(paidDecline?.classifierReasonCodes.includes("variant_reject_with_payment"));
    assert.equal(paidDecline?.visible, true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner can retain confirmed first-layer geometry controls without interaction", () => {
  const optionsCandidate = {
    ...geometryCandidate("Cookie settings", "manage_preferences", "confirmed_visible", "first_layer"),
    placementType: "action_cluster" as const,
    presentationType: "inline_link" as const,
  };
  const observation = consentUiObservationFromConfirmedGeometryControls({
    artifactPath: "/tmp/ConsentControlGeometryEvidence.json",
    geometry: geometryFixture([
      geometryCandidate("Reject all", "reject_all", "confirmed_visible", "first_layer"),
      geometryCandidate("Accept all", "accept_all", "confirmed_visible", "first_layer"),
      optionsCandidate,
      geometryCandidate("Privacy policy", "policy_link", "footer_or_policy_link", "footer"),
      geometryCandidate("Hidden reject", "reject_all", "hidden", "first_layer"),
    ]),
    scanStartedAtMs: Date.now(),
    text: "We use cookies to personalize content and measure audiences.",
  });

  assert.equal(observation?.likelyPresent, true);
  assert.equal(observation?.acceptControlObserved, true);
  assert.equal(observation?.rejectControlObserved, true);
  assert.equal(observation?.managePreferencesControlObserved, true);
  assert.equal(
    observation?.controls.find((control) => control.label === "Cookie settings")?.placementType,
    "action_cluster",
  );
  assert.equal(
    observation?.controls.find((control) => control.label === "Cookie settings")?.presentationType,
    "inline_link",
  );
  assert.deepEqual(observation?.visibleChoiceLabels, ["Reject all", "Accept all", "Cookie settings"]);
  assert.equal(
    observation?.basis.includes("geometry:confirmed_first_layer_controls"),
    true,
    "geometry-derived controls should be explicitly provenance-marked",
  );
  assert.equal(
    observation?.controls.every((control) =>
      control.visible === true &&
      typeof control.matchedTerm === "string" &&
      control.classifierReasonCodes?.some((code) => code.startsWith("intent_"))
    ),
    true,
    "retained geometry controls should keep canonical classifier metadata",
  );
  assert.equal(observation?.evidenceRefs[0]?.artifactId, "consent_control_geometry");
});

test("pre-consent runtime scanner drops composite geometry containers when child controls are retained", () => {
  const container = {
    ...geometryCandidate("Manage choices Reject all Accept all", "accept_all", "confirmed_visible", "first_layer"),
    boundingBox: {
      bottom: 700,
      height: 240,
      left: 300,
      right: 1000,
      top: 460,
      width: 700,
      x: 300,
      y: 460,
    },
    role: undefined,
    selectorHint: "#button-group",
    tagName: "div",
  };
  const manage = {
    ...geometryCandidate("Manage choices", "manage_preferences", "confirmed_visible", "first_layer"),
    boundingBox: {
      bottom: 540,
      height: 48,
      left: 340,
      right: 560,
      top: 492,
      width: 220,
      x: 340,
      y: 492,
    },
  };
  const reject = {
    ...geometryCandidate("Reject all", "reject_all", "confirmed_visible", "first_layer"),
    boundingBox: {
      bottom: 620,
      height: 48,
      left: 600,
      right: 800,
      top: 572,
      width: 200,
      x: 600,
      y: 572,
    },
  };
  const accept = {
    ...geometryCandidate("Accept all", "accept_all", "confirmed_visible", "first_layer"),
    boundingBox: {
      bottom: 620,
      height: 48,
      left: 820,
      right: 980,
      top: 572,
      width: 160,
      x: 820,
      y: 572,
    },
  };

  const observation = consentUiObservationFromConfirmedGeometryControls({
    artifactPath: "/tmp/ConsentControlGeometryEvidence.json",
    geometry: geometryFixture([container, manage, reject, accept]),
    scanStartedAtMs: Date.now(),
    text: "We use cookies to personalize content and measure audiences.",
  });

  assert.equal(observation?.acceptControlObserved, true);
  assert.equal(observation?.rejectControlObserved, true);
  assert.equal(observation?.managePreferencesControlObserved, true);
  assert.deepEqual(observation?.visibleChoiceLabels, ["Manage choices", "Reject all", "Accept all"]);
  assert.equal(
    observation?.controls.some((control) => control.selectorHint === "#button-group"),
    false,
    "composite button-group containers should not be retained as extra controls",
  );
});

test("pre-consent runtime scanner drops actionable elements whose labels concatenate multiple consent choices", () => {
  const compositeButton = {
    ...geometryCandidate(
      "Cookies settingsReject All Accept All Cookies",
      "accept_all",
      "confirmed_visible",
      "first_layer",
    ),
    tagName: "button",
  };
  const manage = geometryCandidate("Cookies settings", "manage_preferences", "confirmed_visible", "first_layer");
  const reject = geometryCandidate("Reject All", "reject_all", "confirmed_visible", "first_layer");
  const accept = geometryCandidate("Accept All Cookies", "accept_all", "confirmed_visible", "first_layer");

  const observation = consentUiObservationFromConfirmedGeometryControls({
    geometry: geometryFixture([compositeButton, manage, reject, accept]),
    scanStartedAtMs: Date.now(),
    text: "We use cookies and provide settings, reject, and accept choices.",
  });

  assert.deepEqual(observation?.visibleChoiceLabels, ["Cookies settings", "Reject All", "Accept All Cookies"]);
  assert.equal(
    observation?.controls.some((control) => control.label === compositeButton.label),
    false,
    "a concatenated multi-intent label must not become accept-control evidence even when exposed as a button",
  );
});

test("pre-consent runtime scanner does not retain hidden footer or ambiguous geometry candidates", () => {
  const observation = consentUiObservationFromConfirmedGeometryControls({
    geometry: geometryFixture([
      geometryCandidate("Cookie settings", "manage_preferences", "footer_or_policy_link", "footer"),
      geometryCandidate("Accept all", "accept_all", "hidden", "first_layer"),
      geometryCandidate("Learn more", "other", "ambiguous", "first_layer"),
      geometryCandidate("Reject all", "reject_all", "covered", "first_layer"),
    ]),
    scanStartedAtMs: Date.now(),
    text: "Cookies and settings links appear in page chrome.",
  });

  assert.equal(observation, null);
});

test("pre-consent runtime scanner does not retain generic confirmed geometry controls without consent context", () => {
  const observation = consentUiObservationFromConfirmedGeometryControls({
    geometry: geometryFixture([
      geometryCandidate("Accept", "accept_all", "confirmed_visible", "first_layer"),
      geometryCandidate("Reject", "reject_all", "confirmed_visible", "first_layer"),
    ], {
      cmpDetected: false,
      containerText: "Product beta invite. Accept Reject.",
    }),
    scanStartedAtMs: Date.now(),
    text: "This product beta invitation lets account holders accept or reject the invite.",
  });

  assert.equal(observation, null);
});

test("pre-consent runtime scanner inventories German and French first-layer controls through the canonical classifier", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-localized-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-localized-controls"),
      path.join(tempRoot, "consent-localized-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "accept_all" &&
        control.label === "Alle akzeptieren" &&
        control.matchedLocale === "de"
      ),
      true,
      "scanner should classify German accept controls through the canonical registry",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.tagName === "p" ||
        control.label.startsWith("Mit Klick auf den Button")
      ),
      false,
      "scanner should not retain static explanatory text as a production consent control",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "reject_all" &&
        control.label === "Tout refuser" &&
        control.matchedLocale === "fr"
      ),
      true,
      "scanner should classify French reject controls through the canonical registry",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "manage_preferences" &&
        control.label === "Paramètres des cookies" &&
        control.matchedLocale === "fr"
      ),
      true,
      "scanner should classify French options controls through the canonical registry",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains the University of Ljubljana Slovenian banner as typed evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-slovenian-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-slovenian-load-controls"),
      path.join(tempRoot, "consent-slovenian-load-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.captureStatus, "observed");
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(observation?.inventoryDiagnostics?.retainedControlCount, 3);
    assert.equal(bundle.consentSurfaceInspection?.outcome, "actionable_surface_observed");
    assert.equal(bundle.consentSurfaceInspection?.consentSurfaceObserved, true);

    for (const [label, actionType, variant] of [
      ["Naloži vse", "accept_all", undefined],
      ["Naloži samo nujne", "reject_all", "necessary_only"],
      ["Nastavitve", "manage_preferences", undefined],
    ] as const) {
      const control = observation?.controls.find((candidate) => candidate.label === label);
      assert.equal(control?.actionType, actionType, `${label} action`);
      assert.equal(control?.matchedLocale, "sl", `${label} locale`);
      assert.equal(control?.classifierVariant, variant, `${label} variant`);
      assert.equal(control?.classifierReasonCodes?.includes("context_satisfied"), true, `${label} context`);
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains text-ish canonical controls inside CMP surfaces", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-static-canonical-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-cmp-static-canonical-controls"),
      path.join(tempRoot, "consent-cmp-static-canonical-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "accept_all" &&
        control.label === "Leisti visus slapukus" &&
        control.matchedLocale === "lt"
      ),
      true,
      "scanner should retain Lithuanian accept text rendered as a CMP control",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "manage_preferences" &&
        control.label === "Rinktis" &&
        control.matchedLocale === "lt"
      ),
      true,
      "scanner should retain Lithuanian options text rendered as a CMP control",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner treats first-layer contextual Continue as accept-equivalent only with retained consent-by-using text", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-contextual-continue-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-contextual-continue-accept"),
      path.join(tempRoot, "consent-contextual-continue-accept"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(observation?.managePreferencesControlObserved, false);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "accept_all" &&
        control.label === "Continue" &&
        control.matchedTerm === "continue" &&
        control.classifierVariant === "continue_as_accept"
      ),
      true,
      "scanner should retain NBC-style Continue as accept proof only through the contextual canonical classifier",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner can inventory NBC-style Continue from bounded accessibility-tree consent context", () => {
  const inventory = consentControlsFromAccessibilityTree([
    {
      nodeId: "1",
      role: { value: "RootWebArea" },
      name: { value: "NBC News" },
      childIds: ["2", "9"],
    },
    {
      nodeId: "2",
      role: { value: "region" },
      name: { value: "Cookie banner" },
      childIds: ["3"],
    },
    {
      nodeId: "3",
      role: { value: "alertdialog" },
      name: { value: "Privacy" },
      childIds: ["4", "5", "6"],
    },
    {
      nodeId: "4",
      role: { value: "StaticText" },
      name: {
        value: "We and our partners use cookies on this site to improve our service, perform analytics, personalize advertising, measure advertising performance, and remember website preferences. By using the site, you consent to these cookies.",
      },
    },
    {
      nodeId: "5",
      role: { value: "link" },
      name: { value: "Cookie Policy" },
    },
    {
      nodeId: "6",
      role: { value: "button" },
      name: { value: "Continue" },
    },
    {
      nodeId: "9",
      role: { value: "link" },
      name: { value: "Privacy Choices" },
    },
  ]);

  assert.equal(inventory.controls.length, 1);
  assert.equal(inventory.controls.some((control) => control.label === "Continue"), true);
  assert.equal(
    inventory.controls.every((control) => control.inventorySource === "accessibility_tree"),
    true,
  );
  assert.equal(
    inventory.controls.some((control) => control.label === "Privacy Choices"),
    false,
    "ordinary page privacy links outside bounded consent context should not be retained",
  );
  assert.match(inventory.textExcerpts.join(" "), /By using the site, you consent/i);
});

test("pre-consent runtime scanner inventories Amazon-style controls from a generic accessibility-tree container", () => {
  const inventory = consentControlsFromAccessibilityTree([
    {
      nodeId: "1",
      role: { value: "RootWebArea" },
      name: { value: "Amazon.de" },
      childIds: ["2", "20"],
    },
    {
      nodeId: "2",
      role: { value: "generic" },
      name: { value: "" },
      childIds: ["3", "4", "5", "6"],
    },
    {
      nodeId: "3",
      role: { value: "heading" },
      name: { value: "Cookies und Werbeoptionen" },
    },
    {
      nodeId: "4",
      role: { value: "button" },
      name: { value: "Akzeptieren" },
    },
    {
      nodeId: "5",
      role: { value: "button" },
      name: { value: "Ablehnen" },
    },
    {
      nodeId: "6",
      role: { value: "link" },
      name: { value: "Personalisieren" },
    },
    {
      nodeId: "20",
      role: { value: "link" },
      name: { value: "Cookie-Hinweis" },
    },
  ]);

  assert.deepEqual(
    inventory.controls.map((control) => control.label).sort(),
    ["Ablehnen", "Akzeptieren", "Personalisieren"],
  );
  assert.equal(
    inventory.controls.some((control) => control.label === "Cookie-Hinweis"),
    false,
    "an isolated footer cookie link must not be promoted into the banner inventory",
  );
});

test("pre-consent accessibility inventory stays bounded on link-heavy commerce trees", () => {
  const irrelevantLinks = Array.from({ length: 2_000 }, (_, index) => ({
    nodeId: `nav-${index}`,
    role: { value: "link" },
    name: { value: `Product category ${index}` },
  }));
  const startedAtMs = Date.now();
  const inventory = consentControlsFromAccessibilityTree([
    {
      nodeId: "root",
      role: { value: "RootWebArea" },
      name: { value: "Commerce" },
      childIds: ["banner", ...irrelevantLinks.map((node) => node.nodeId)],
    },
    {
      nodeId: "banner",
      role: { value: "generic" },
      name: { value: "" },
      childIds: ["heading", "accept", "reject", "options"],
    },
    { nodeId: "heading", role: { value: "heading" }, name: { value: "Cookies und Werbeoptionen" } },
    { nodeId: "accept", role: { value: "button" }, name: { value: "Akzeptieren" } },
    { nodeId: "reject", role: { value: "button" }, name: { value: "Ablehnen" } },
    { nodeId: "options", role: { value: "link" }, name: { value: "Personalisieren" } },
    ...irrelevantLinks,
  ]);

  assert.deepEqual(
    inventory.controls.map((control) => control.label).sort(),
    ["Ablehnen", "Akzeptieren", "Personalisieren"],
  );
  assert.ok(Date.now() - startedAtMs < 500, "large accessibility trees should be filtered before ancestor analysis");
});

test("pre-consent runtime scanner inventories first-layer category-scoped analytics controls through the canonical classifier", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-analytics-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-analytics-category-controls"),
      path.join(tempRoot, "consent-analytics-category-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "accept_all" &&
        control.label === "Allow analytics" &&
        control.classifierVariant === "category_analytics"
      ),
      true,
      "scanner should classify category-scoped analytics allowance as accept-equivalent",
    );
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "reject_all" &&
        control.label === "Reject analytics" &&
        control.classifierVariant === "category_analytics"
      ),
      true,
      "scanner should classify category-scoped analytics refusal as reject-equivalent",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories compact analytics controls after supplemental full-page evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-compact-analytics-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-compact-analytics-controls"),
      path.join(tempRoot, "consent-compact-analytics-controls"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, false);
    assert.deepEqual(observation?.visibleChoiceLabels, ["Reject analytics", "Allow analytics"]);
    assert.ok((observation?.inventoryDiagnostics?.retainedControlCount ?? 0) >= 2);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner captures first-layer optional toggles defaulted on", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-toggle-on-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-first-layer-optional-toggle-on"),
      path.join(tempRoot, "consent-first-layer-optional-toggle-on"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.defaultToggleStatesObserved, true);
    assert.equal(observation?.nonEssentialDefaultsOff, false);
    assert.equal(observation?.precheckedOptionalPurposeCount, 1);
    assert.deepEqual(observation?.precheckedOptionalPurposeLabels, ["Analytics cookies"]);
    assert.deepEqual(observation?.defaultTogglePurposeLabels, ["Analytics cookies"]);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner captures first-layer optional toggles defaulted off", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-toggle-off-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-first-layer-optional-toggle-off"),
      path.join(tempRoot, "consent-first-layer-optional-toggle-off"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.defaultToggleStatesObserved, true);
    assert.equal(observation?.nonEssentialDefaultsOff, true);
    assert.equal(observation?.precheckedOptionalPurposeCount, 0);
    assert.deepEqual(observation?.precheckedOptionalPurposeLabels, []);
    assert.deepEqual(observation?.defaultTogglePurposeLabels, ["Analytics cookies"]);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner does not treat necessary-only checked controls as optional defaults", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-toggle-necessary-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-first-layer-necessary-toggle-only"),
      path.join(tempRoot, "consent-first-layer-necessary-toggle-only"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.defaultToggleStatesObserved, null);
    assert.equal(observation?.nonEssentialDefaultsOff, null);
    assert.equal(observation?.precheckedOptionalPurposeCount, 0);
    assert.deepEqual(observation?.precheckedOptionalPurposeLabels, []);
    assert.deepEqual(observation?.defaultTogglePurposeLabels, []);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories compact German accept and reject controls after supplemental full-page evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-compact-cookie-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-compact-cookie-controls"),
      path.join(tempRoot, "consent-compact-cookie-controls"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.deepEqual(observation?.visibleChoiceLabels, ["Ablehnen", "Akzeptieren", "Personalisieren"]);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories compact privacy settings and accept controls after supplemental full-page evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-compact-privacy-settings-"));
  try {
    const result = await scanFixturePage(
      server.urlFor("consent-compact-privacy-settings-controls"),
      path.join(tempRoot, "consent-compact-privacy-settings-controls"),
      "fast",
      "always",
      "viewport_first",
    );
    const observation = result.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.deepEqual(observation?.visibleChoiceLabels, ["Settings", "Accept"]);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner recaptures late first-layer controls without interaction", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-late-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-late-first-layer-controls"),
      path.join(tempRoot, "consent-late-first-layer-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];
    const timingLabels = bundle.modulesRun[0]?.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.layerInspected, "first_layer");
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\baccept all\b/i.test(label)),
      true,
      "scanner should retain late first-layer accept label",
    );
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\breject all\b/i.test(label)),
      true,
      "scanner should retain late first-layer reject label",
    );
    assert.equal(
      observation?.visibleChoiceLabels.some((label) => /\bcookie settings\b/i.test(label)),
      true,
      "scanner should retain late first-layer settings label",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_settle_first_layer_controls") ||
        observation?.basis.includes("inventory:rapid_after_accessibility"),
      true,
      "scanner should mark late controls as retained by a bounded typed recapture",
    );
    assert.equal(
      timingLabels.includes("page evidence: consent UI post-settle recapture") ||
        observation?.inventoryDiagnostics?.timingMarkers.includes("rapid_inventory_post_accessibility_completed"),
      true,
      "scanner should use a bounded typed recapture path",
    );
    assert.equal(
      bundle.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_cmp_controls"),
      true,
      "scanner should retain a screenshot synchronized to late first-layer controls",
    );
    assert.equal(
      timingLabels.includes("late consent control screenshot"),
      true,
      "scanner should record the synchronized late-control screenshot",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner waits briefly for late choice controls when CMP evidence is retained", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-late-choice-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-late-first-layer-choice-controls"),
      path.join(tempRoot, "consent-late-first-layer-choice-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];
    const timingLabels = bundle.modulesRun[0]?.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.layerInspected, "first_layer");
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "scanner should mark late choice controls as retained by the bounded CMP recapture",
    );
    assert.equal(
      timingLabels.includes("page evidence: consent UI CMP recapture"),
      true,
      "scanner should use the bounded post-CMP recapture path",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.timingMarkers.includes("gate_10s:complete_exit"),
      true,
      "complete accept/reject evidence should exit through the first adaptive gate without spending the later tail",
    );
    assert.equal(
      bundle.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust"),
      true,
      "fixture should retain CMP runtime evidence before the post-CMP recapture is eligible",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains a delayed text-control banner without an early CMP marker", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-late-without-cmp-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-late-without-cmp-runtime"),
      path.join(tempRoot, "consent-late-without-cmp-runtime"),
      "fast",
      "selective",
      undefined,
      20_000,
    );
    const observation = bundle.consentUiObservations[0];
    const timingLabels = bundle.modulesRun[0]?.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(
      bundle.cmpRuntimeObservations.some((cmp) => cmp.confidence >= 0.9),
      false,
      "fixture must exercise the no-early-CMP path",
    );
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.basis.includes("adaptive_gate_inventory:10s_without_cmp_runtime"),
      true,
      "the navigation-relative late-surface gate should retain the delayed controls",
    );
    assert.equal(
      timingLabels.includes("page evidence: late consent surface gate"),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner recaptures late CMP choice controls when no initial controls are retained", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-late-cmp-choice-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-late-cmp-choice-controls"),
      path.join(tempRoot, "consent-late-cmp-choice-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "scanner should retain late CMP choice controls even when no initial controls were visible",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.timingMarkers.includes("gate_10s:complete_exit"),
      true,
      "complete late CMP controls should exit before the 10-second checkpoint when they become available",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains hit-testable transparent consent input overlays", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-transparent-input-overlays-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-transparent-input-overlays"),
      path.join(tempRoot, "consent-transparent-input-overlays"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.inventoryDiagnostics?.timingMarkers.includes("rapid_first_layer_inventory"),
      true,
      "transparent actionable overlays should be retained by the canonical rapid DOM inventory",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner attempts structured recovery before broad page evidence and retains delayed controls", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-renderer-contention-recovery-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-renderer-contention-delayed-controls"),
      path.join(tempRoot, "consent-renderer-contention-delayed-controls"),
      "fast",
      "always",
      "viewport_first",
      20_000,
    );
    const observation = bundle.consentUiObservations[0];
    const timingLabels = bundle.modulesRun[0]?.timingBreakdown?.map((entry) => entry.label) ?? [];
    const recoveryIndex = timingLabels.indexOf("page evidence: immediate consent timeout recovery");
    const broadEvidenceIndex = timingLabels.indexOf("page evidence capture");

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.ok(recoveryIndex >= 0, "an incomplete initial inventory should trigger immediate structured recovery");
    assert.ok(
      broadEvidenceIndex < 0 || recoveryIndex < broadEvidenceIndex,
      "consent recovery must run before broad page-evidence capture",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("immediate structured consent recovery is reserved for incomplete observations", () => {
  const incompleteObservation = {
    observationId: "consent_ui_pre_consent",
    observedAtMs: 7_000,
    captureStatus: "incomplete",
    captureDiagnostics: {
      completedChannels: [],
      timedOutChannels: ["accessibility_tree", "dom_inventory"],
      failedChannels: [],
    },
    likelyPresent: false,
    basis: ["bounded_capture_timeout_or_failure"],
    textExcerpt: "",
    layerInspected: "unknown",
    visibleChoiceLabels: [],
    defaultToggleStatesObserved: null,
    nonEssentialDefaultsOff: null,
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    inventoryDiagnostics: {
      candidateContainerCount: 0,
      candidateControlCount: 0,
      retainedControlCount: 0,
      inventorySources: [],
      candidateLabels: [],
      rejectionReasons: ["timing_expired_before_controls_surfaced"],
      timingMarkers: ["bounded_capture_timeout_or_failure"],
    },
    evidenceRefs: [],
    confidence: 0.4,
  } as const;

  assert.equal(shouldRunImmediateStructuredConsentRecovery(incompleteObservation), true);
  assert.equal(
    shouldRunImmediateStructuredConsentRecovery({
      ...incompleteObservation,
      captureStatus: "no_evidence",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        timedOutChannels: [],
        failedChannels: [],
      },
      basis: ["settled_control_inventory_completed"],
    }),
    false,
  );
});

test("pre-consent runtime scanner recaptures late settings controls from high-confidence CMP script evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-cmp-script-late-settings-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-cmp-script-late-settings"),
      path.join(tempRoot, "consent-cmp-script-late-settings"),
      "fast",
      "selective",
      undefined,
      25_000,
    );
    const observation = bundle.consentUiObservations[0];
    const cmpRecaptureTiming = bundle.modulesRun[0]?.timingBreakdown?.find((entry) =>
      entry.label === "page evidence: consent UI CMP recapture"
    );

    assert.equal(
      bundle.cmpRuntimeObservations.some((cmp) =>
        cmp.confidence >= 0.9 &&
        cmp.signals.some((signal) => signal.signalType === "global" || signal.signalType === "script_url")
      ),
      true,
      "fixture should retain high-confidence interactive CMP runtime evidence",
    );
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "manage_preferences" &&
        control.label === "Settings" &&
        control.matchedTerm === "settings"
      ),
      true,
      "scanner should classify the delayed Settings control through the canonical registry",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "scanner should mark the delayed controls as retained by the bounded CMP recapture",
    );
    assert.equal(
      Boolean(cmpRecaptureTiming),
      true,
      "scanner should run the post-CMP recapture for high-confidence CMP script evidence",
    );
    assert.match(
      cmpRecaptureTiming?.detail ?? "",
      /Navigation-relative adaptive CMP inventory/,
      "high-confidence CMP recapture should use the navigation-relative adaptive gate path",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.timingMarkers.includes("gate_18s:stagnant_partial_exit"),
      true,
      "accept/settings-only evidence with no progress after 10 seconds should exit at the 18-second safety floor",
    );
    assert.equal(
      typeof cmpRecaptureTiming?.durationMs === "number" && cmpRecaptureTiming.durationMs < 20_000,
      true,
      "adaptive CMP recapture should stop before the hard cap when partial controls stop improving",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner recaptures late controls from direct CMP network evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-cmp-network-late-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-cmp-network-late-controls"),
      path.join(tempRoot, "consent-cmp-network-late-controls"),
      "fast",
      "selective",
      undefined,
      25_000,
    );
    const observation = bundle.consentUiObservations[0];
    const cmpRecaptureTiming = bundle.modulesRun[0]?.timingBreakdown?.find((entry) =>
      entry.label === "page evidence: consent UI CMP recapture"
    );

    assert.equal(
      bundle.cmpRuntimeObservations.some((cmp) =>
        cmp.confidence >= 0.9 &&
        cmp.directVsInferred === "direct" &&
        cmp.signals.some((signal) => signal.signalType === "network_request")
      ),
      true,
      "fixture should retain direct canonical CMP network evidence",
    );
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "network-only CMP evidence should trigger the adaptive late-control inventory",
    );
    assert.equal(Boolean(cmpRecaptureTiming), true);
    assert.equal(
      bundle.screenshots.some((screenshot) =>
        screenshot.artifactId === "screenshot_pre_consent_cmp_controls"
      ),
      true,
      "typed controls should retain a synchronized visual artifact when budget remains",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner keeps high-confidence CMP recapture open long enough for very late settings controls", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-cmp-script-very-late-settings-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-cmp-script-very-late-settings"),
      path.join(tempRoot, "consent-cmp-script-very-late-settings"),
      "fast",
      "selective",
      undefined,
      25_000,
    );
    const observation = bundle.consentUiObservations[0];
    const cmpRecaptureTiming = bundle.modulesRun[0]?.timingBreakdown?.find((entry) =>
      entry.label === "page evidence: consent UI CMP recapture"
    );

    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "manage_preferences" &&
        control.label === "Settings" &&
        control.matchedTerm === "settings"
      ),
      true,
      "scanner should retain very late Settings control before the high-confidence CMP cap expires",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "scanner should mark the very late controls as retained by the adaptive CMP recapture",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.timingMarkers.includes("gate_18s:partial_or_progressing_continue_20s"),
      true,
      "very late partial controls should be retained at the 18-second safety floor and continue to the 20-second review gate",
    );
    assert.ok(
      typeof cmpRecaptureTiming?.durationMs === "number" && cmpRecaptureTiming.durationMs < 20_000,
      `adaptive CMP recapture should retain the very late controls without spending the 25s hard cap; durationMs=${cmpRecaptureTiming?.durationMs ?? "missing"}`,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner performs a structured read after supplemental full-page capture", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-cmp-script-supplemental-settings-"));
  try {
    const url = server.urlFor("consent-cmp-script-supplemental-settings");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];
    const timingLabels = result.moduleRun.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(
      timingLabels.includes("page evidence: consent UI CMP recapture"),
      true,
      "scanner should first attempt the high-confidence CMP structured recapture",
    );
    assert.equal(
      timingLabels.includes("supplemental full-page screenshot"),
      true,
      "fixture should exercise the same supplemental full-page capture path used by local scans",
    );
    assert.equal(
      timingLabels.includes("consent UI supplemental screenshot recapture"),
      true,
      "scanner should run a final same-page structured read after supplemental capture",
    );
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.controls.some((control) =>
        control.actionType === "manage_preferences" &&
        control.label === "Settings" &&
        control.matchedTerm === "settings"
      ),
      true,
      "final structured read should retain Settings without inferring from the screenshot",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_cmp_first_layer_choice_controls"),
      true,
      "scanner should retain controls through the structured adaptive gate read after the earlier supplemental capture",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner returns retained partial evidence at its soft module deadline", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-soft-deadline-"));
  const softDeadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    softDeadlineController.abort(new Error(
      "Pre-consent runtime reached its fixture module budget; retained bounded partial evidence.",
    ));
  }, 1_500);
  try {
    const url = server.urlFor("consent-generic-learn-more-page-context");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 25_000,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "selective",
      softDeadlineSignal: softDeadlineController.signal,
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "partial");
    assert.match(result.moduleRun.errors.join("; "), /retained bounded partial evidence/i);
    assert.ok(result.moduleRun.durationMs < 5_000, `soft deadline should stop the module promptly; durationMs=${result.moduleRun.durationMs}`);
    assert.ok(
      result.networkEvents.length > 0 || result.networkResponseEvents.length > 0 || result.screenshots.length > 0,
      "soft deadline should retain evidence observed before cancellation",
    );
    assert.equal(
      result.renderedPolicyLinks.some((link) =>
        link.linkText === "Privacy policy" &&
        link.href === new URL("/policies/privacy", url).toString()
      ),
      true,
      "the early canonical policy-link inventory should survive a later module deadline",
    );
  } finally {
    clearTimeout(deadlineTimer);
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan pipeline completes with explicit limited coverage after the pre-consent soft module deadline", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-scan-soft-deadline-"));
  try {
    const bundle = await runScan({
      url: server.urlFor("consent-cmp-script-very-late-settings"),
      profile: "quick",
      outDir: path.join(tempRoot, "out"),
      preConsentModuleDeadlineMs: 1_500,
      preConsentScreenshotMode: "selective",
      scenarioPlanningMode: "planned_parallel",
      scenarioResourceMode: "lean",
    });
    const preConsentRun = bundle.modulesRun.find((run) => run.moduleName === "preConsentRuntimeScanner");

    assert.equal(preConsentRun?.status, "partial");
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("pre_consent_runtime_partial"));
    assert.ok(bundle.policySurfaceInspection, "canonical bundle should retain typed policy inspection coverage");
    assert.equal(
      bundle.policySurfaceInspection?.coverageStatus,
      bundle.modulesRun.find((run) => run.moduleName === "policySurfaceScanner")?.status === "completed"
        ? "complete"
        : "limited",
    );
    assert.ok(
      bundle.networkEvents.length > 0 || bundle.networkResponseEvents.length > 0 || bundle.screenshots.length > 0,
      "completed bundle should carry evidence retained before the module deadline",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner still fails closed when the parent scan is cancelled", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-parent-cancel-"));
  const parentController = new AbortController();
  const cancellation = new Error("Parent Lambda scanner deadline reached.");
  const deadlineTimer = setTimeout(() => parentController.abort(cancellation), 1_500);
  try {
    const url = server.urlFor("consent-cmp-script-very-late-settings");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    await assert.rejects(
      preConsentRuntimeScanner({
        url,
        normalizedUrl: url,
        scanStartedAtMs: Date.now(),
        internalBudgetMs: 25_000,
        artifactWriter,
        routeFulfillers,
        screenshotCaptureMode: "viewport_first",
        screenshotMode: "selective",
        signal: parentController.signal,
        waitMode: "fast",
      }),
      (error: unknown) => error === cancellation,
    );
  } finally {
    clearTimeout(deadlineTimer);
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories off-viewport controls inside strong CMP containers after supplemental full-page capture", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-offscreen-onetrust-controls-"));
  try {
    const url = server.urlFor("consent-cmp-script-offscreen-onetrust-controls");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];
    const timingLabels = result.moduleRun.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(
      result.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust" && cmp.confidence >= 0.9),
      true,
      "fixture should retain high-confidence OneTrust CMP runtime evidence",
    );
    assert.equal(
      timingLabels.includes("supplemental full-page screenshot"),
      true,
      "fixture should exercise the supplemental full-page capture path",
    );
    assert.equal(
      timingLabels.includes("consent UI supplemental screenshot recapture"),
      true,
      "scanner should run the final structured control inventory after supplemental capture",
    );
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.deepEqual(
      observation?.visibleChoiceLabels,
      ["Accept", "Reject", "Cookie settings"],
      "off-viewport OneTrust controls should be retained structurally in deterministic order",
    );
    assert.equal(
      observation?.basis.includes("inventory:full_document_cmp_controls"),
      true,
      "observation should mark the full-document CMP inventory as the source",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_supplemental_screenshot_full_document_cmp_controls"),
      true,
      "merged observation should distinguish full-document CMP inventory from viewport first-layer reads",
    );
    assert.equal(
      observation?.controls.every((control) =>
        typeof control.matchedTerm === "string" &&
        control.matchStrength !== undefined &&
        (control.actionType === "accept_all" ||
          control.actionType === "reject_all" ||
          control.actionType === "manage_preferences")
      ),
      true,
      "retained controls should be canonical-classifier-backed accept/reject/options controls",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories off-viewport controls inside bounded consent-text containers after supplemental full-page capture", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-offscreen-context-controls-"));
  try {
    const url = server.urlFor("consent-cmp-script-offscreen-context-controls");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(
      result.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust" && cmp.confidence >= 0.9),
      true,
      "fixture should retain high-confidence OneTrust CMP runtime evidence",
    );
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.deepEqual(
      observation?.visibleChoiceLabels,
      ["Accept", "Reject", "Cookie settings"],
      "bounded consent-text containers should retain only canonical-classified controls",
    );
    assert.equal(
      observation?.basis.includes("inventory:full_document_consent_surface_controls"),
      true,
      "observation should distinguish bounded consent-text inventory from strong CMP-container inventory",
    );
    assert.equal(
      observation?.basis.includes("recapture:post_supplemental_screenshot_full_document_cmp_controls"),
      true,
      "merged observation should identify the supplemental full-document recapture path",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains a context-confirmed off-viewport approval control", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-contextual-approval-"));
  try {
    const url = server.urlFor("consent-contextual-approval-offscreen");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(observation?.likelyPresent, true);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, false);
    assert.deepEqual(observation?.visibleChoiceLabels, ["I’m happy with that"]);
    assert.equal(
      observation?.controls[0]?.classifierVariant,
      "approval_acknowledgment",
    );
    assert.equal(
      observation?.basis.includes("inventory:full_document_consent_surface_controls"),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories open shadow-root consent controls without interaction", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-shadow-context-controls-"));
  try {
    const url = server.urlFor("consent-cmp-script-shadow-context-controls");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(
      result.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust" && cmp.confidence >= 0.9),
      true,
      "fixture should retain high-confidence OneTrust CMP runtime evidence",
    );
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.deepEqual(
      observation?.visibleChoiceLabels,
      ["Accept", "Reject", "Cookie settings"],
      "open shadow-root consent controls should be inventoried and canonical-classified",
    );
    assert.equal(
      observation?.basis.includes("inventory:full_document_consent_surface_controls"),
      true,
      "shadow-root controls should retain bounded full-document consent-surface provenance",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner inventories same-origin iframe consent controls without interaction", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-iframe-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("consent-iframe-reject"),
      path.join(tempRoot, "consent-iframe-reject"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.deepEqual(
      observation?.visibleChoiceLabels,
      ["Reject All", "Accept All"],
      "same-origin iframe controls should be retained as structured controls in deterministic order",
    );
    assert.equal(
      observation?.basis.includes("inventory:same_origin_frame_controls"),
      true,
      "observation should mark the same-origin frame inventory source",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.inventorySources.includes("same_origin_frame"),
      true,
      "diagnostics should retain same-origin frame provenance",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner does not treat off-viewport footer settings as CMP control proof", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-offscreen-footer-settings-"));
  try {
    const url = server.urlFor("consent-cmp-script-offscreen-footer-settings");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      routeFulfillers,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(
      result.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust" && cmp.confidence >= 0.9),
      true,
      "fixture should still have high-confidence CMP evidence",
    );
    assert.equal(
      observation?.controls.some((control) => /cookie settings/i.test(control.label)),
      false,
      "plain off-viewport footer settings should not become structured consent-control proof",
    );
    assert.equal(observation?.acceptControlObserved, false);
    assert.equal(observation?.rejectControlObserved, false);
    assert.equal(observation?.managePreferencesControlObserved, false);
    assert.equal(
      observation?.basis.includes("inventory:full_document_cmp_controls"),
      false,
      "full-document inventory basis should only be added when CMP-container controls are retained",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.rejectionReasons.includes("footer_nav_page_chrome"),
      true,
      "diagnostics should explain that the rejected Cookie Settings control lived in ordinary page chrome",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner skips CMP recapture without first-layer surface hints", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-cmp-no-surface-hints-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("cmp-cookie"),
      path.join(tempRoot, "cmp-cookie"),
      "fast",
      "selective",
    );
    const review = await reviewEvidenceBundle(bundle);
    const report = await inspectBundle(bundle);
    const expectation = expectations["cmp-cookie"];
    const observation = bundle.consentUiObservations[0];
    const timingLabels = bundle.modulesRun[0]?.timingBreakdown?.map((entry) => entry.label) ?? [];

    assertFixtureExpectations("cmp-cookie", bundle, review, report, expectation);
    if (expectation.savedBundle) {
      const savedReport = await loadSavedInspectSnapshot(expectation.savedBundle);
      assertNormalizedSavedBundleComparison("cmp-cookie", report, savedReport, expectation);
    }
    assert.equal(
      bundle.cmpRuntimeObservations.some((cmp) => cmp.vendor === "OneTrust"),
      true,
      "fixture should retain CMP runtime evidence",
    );
    assert.equal(observation?.likelyPresent, false);
    assert.equal(observation?.controls.length ?? 0, 0);
    assert.equal(
      timingLabels.includes("page evidence: consent UI CMP recapture"),
      false,
      "generic CMP runtime evidence without first-layer hints should not spend the full CMP recapture wait",
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner does not classify bare generic choice controls without consent context", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-generic-bare-choice-controls-"));
  try {
    const bundle = await scanFixturePage(
      server.urlFor("generic-bare-choice-controls"),
      path.join(tempRoot, "generic-bare-choice-controls"),
      "fast",
      "selective",
    );
    const observation = bundle.consentUiObservations[0];

    assert.equal(observation?.likelyPresent, false);
    assert.equal(observation?.acceptControlObserved, false);
    assert.equal(observation?.rejectControlObserved, false);
    assert.deepEqual(observation?.controls ?? [], []);
    assert.equal(
      observation?.inventoryDiagnostics?.retainedControlCount,
      0,
      "ordinary account choices without consent context should not be retained as proof",
    );
    assert.equal(
      observation?.inventoryDiagnostics?.rejectionReasons.includes("no_consent_context"),
      true,
      "diagnostics should explain why the generic account choices were rejected",
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
    assert.equal(
      result.consentUiObservations[0]?.basis.includes("settled_control_inventory_completed"),
      true,
      "a completed no-banner inspection must retain the settled inventory marker",
    );
    assert.equal(result.cmpRuntimeObservations.length, 0);
    assert.equal(result.screenshots.length, 0);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((entry) => entry.label === "screenshot capture skipped"),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((entry) =>
        entry.label === "page evidence: consent UI post-settle recapture" ||
        entry.label === "page evidence: consent UI timeout recapture"
      ),
      false,
      "a completed no-banner inspection should not queue redundant consent inventory passes",
    );
    assert.equal(result.domSnapshots.length, 1);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("planned pre-consent baseline retains supplemental full-page evidence for an ambiguous consent layer", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-viewport-screenshot-"));
  try {
    const url = server.urlFor("policy-footer-privacy");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "full",
    });

    assert.equal(result.moduleRun.status, "completed");
    const viewportScreenshot = result.screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent");
    const fullPageScreenshot = result.screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent_full_page");
    assert.equal(viewportScreenshot?.captureMethod, "primary_viewport_fallback");
    assert.equal(fullPageScreenshot?.captureMethod, "primary_full_page");
    assert.ok(result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent"));
    assert.equal(result.visualCapture.captureMethod, "primary_full_page");
    assert.equal(result.moduleRun.timingBreakdown?.some((entry) => entry.label === "supplemental full-page screenshot"), true);
    assert.equal(result.moduleRun.timingBreakdown?.some((entry) => entry.label === "page evidence: consolidated snapshot"), true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner retains the initial screenshot before delayed consent inspection completes", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-screenshot-before-consent-"));
  try {
    const url = server.urlFor("consent-late-cmp-choice-controls");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotMode: "always",
      screenshotCaptureMode: "viewport_first",
      waitMode: "full"
    });

    const timing = result.moduleRun.timingBreakdown ?? [];
    const screenshotTiming = timing.find((entry) => entry.label === "early screenshot capture");
    const consentTiming = timing.find((entry) => entry.label === "page evidence: consent UI");
    assert.ok(result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent"));
    assert.equal(result.visualCapture.status, "available");
    assert.ok(screenshotTiming);
    assert.ok(consentTiming);
    assert.ok(screenshotTiming.durationMs >= 0);
    assert.ok(consentTiming.durationMs >= 0);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("planned pre-consent baseline avoids duplicate recaptures for retained ambiguous consent surfaces", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-preconsent-text-backed-consent-"));
  try {
    const url = server.urlFor("consent-ambiguous-controls");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: getScanProfile("quick").internalBudgetMs,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });
    const timingLabels = result.moduleRun.timingBreakdown?.map((entry) => entry.label) ?? [];

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(result.consentUiObservations[0]?.likelyPresent, true);
    assert.equal(result.consentUiObservations[0]?.acceptControlObserved, false);
    assert.equal(result.consentUiObservations[0]?.rejectControlObserved, false);
    assert.equal(
      result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_full_page"),
      true,
    );
    assert.equal(timingLabels.includes("page evidence: consent UI timeout recapture"), false);
    assert.equal(timingLabels.includes("consent UI control recapture"), false);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime scanner avoids long post-screenshot consent recapture", async () => {
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
    const consentTimings = (result.moduleRun.timingBreakdown ?? []).filter((entry) =>
      /consent UI/i.test(entry.label)
    );
    const consentTimingTotalMs = consentTimings.reduce((sum, entry) => sum + entry.durationMs, 0);

    assert.equal(result.moduleRun.status, "completed");
    if (recaptureTiming) {
      assert.ok(
        recaptureTiming.durationMs < 5_000,
        `post-screenshot consent recapture should stay bounded, saw ${recaptureTiming.durationMs}ms`,
      );
    }
    assert.ok(
      consentTimingTotalMs < 7_000,
      `consent UI capture/recapture budget should stay bounded, saw ${consentTimingTotalMs}ms`,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core emits scan no-go assessment for Cloudflare-style security challenge", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-security-challenge-"));
  try {
    const bundle = await runScan({
      url: server.urlFor("security-cloudflare-challenge"),
      profile: "tiny",
      outDir: path.join(tempRoot, "out"),
      preConsentScreenshotMode: "always",
    });

    assert.equal(bundle.scan_no_go_assessment?.decision, "no_go");
    assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
    assert.equal(bundle.visual_access_review?.go_no_go, "NO_GO");
    assert.equal(bundle.visual_access_review?.page_state, "captcha_or_challenge");
    assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes("captcha_or_challenge"));
    assert.ok(bundle.scan_no_go_assessment?.corroboratorCodes.includes("network_cloudflare_challenge"));
    assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none");
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("captcha_or_challenge"));
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("scan_no_go_assessment"));
    assert.equal(bundle.scan_evidence_lane_assessment?.outcome, "no_go");
    assert.equal(bundle.scan_evidence_lane_assessment?.lanes.homepageRuntime, "unusable");
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core does not stop a substantive site for background security challenge traffic", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-background-security-challenge-"));
  try {
    const bundle = await runScan({
      url: server.urlFor("security-background-challenge-normal-site"),
      profile: "tiny",
      outDir: path.join(tempRoot, "out"),
      preConsentScreenshotMode: "always",
    });

    assert.equal(bundle.scan_no_go_assessment?.decision, "continue_with_diagnostics");
    assert.equal(bundle.visual_access_review?.go_no_go, "GO");
    assert.equal(bundle.visual_access_review?.page_state, "degraded_but_useful");
    assert.ok(bundle.scan_no_go_assessment?.corroboratorCodes.includes("network_cloudflare_challenge"));
    assert.ok(bundle.scan_no_go_assessment?.contradictorCodes.includes("substantive_dom_text_observed"));
    assert.notEqual(bundle.runtimeCoverage?.coverageStatus, "limited_none");
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("scan_no_go_diagnostics"));
    assert.equal(bundle.scan_evidence_lane_assessment?.outcome, "usable");
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core classifies deterministic non-security no-go pages", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-deterministic-no-go-"));
  const cases = [
    ["no-go-not-found", "not_found_404", "wrong_site_or_soft_404"],
    ["no-go-minimal-not-found", "not_found_404", "wrong_site_or_soft_404"],
    ["no-go-placeholder", "parked_or_placeholder", "parked_or_placeholder"],
    ["no-go-technical-placeholder", "parked_or_placeholder", "parked_or_placeholder"],
    ["no-go-configuration-error", "configuration_error", "visual_error_shell"],
    ["no-go-unsupported-region", "unsupported_region", "access_blocked"],
    ["no-go-real-world-access-shells", "captcha_or_challenge", "captcha_or_challenge"],
    ["no-go-site-not-ready", "site_not_ready", "parked_or_placeholder"],
    ["no-go-loading-stalled", "loading_or_stalled", "blank_or_unusable"],
    ["no-go-blank-page", "blank_or_unusable_page", "blank_or_unusable"],
    ["no-go-cloudflare-dns-error", "configuration_error", "visual_error_shell"],
    ["no-go-branded-technical-error", "configuration_error", "visual_error_shell"],
    ["no-go-confirmed-sparse-shell", "blank_or_unusable_page", "blank_or_unusable"],
  ] as const;
  try {
    for (const [page, reasonCode, pageState] of cases) {
      const bundle = await runScan({
        url: server.urlFor(page),
        profile: "tiny",
        outDir: path.join(tempRoot, page),
        preConsentScreenshotMode: "always",
      });
      assert.equal(bundle.scan_no_go_assessment?.decision, "no_go", page);
      assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes(reasonCode), page);
      assert.equal(bundle.visual_access_review?.page_state, pageState, page);
      assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none", page);
      if (page === "no-go-loading-stalled" || page === "no-go-blank-page") {
        assert.ok(
          bundle.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_no_go_confirmation"),
          page,
        );
      }
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core treats a substantive branded login page as scannable", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-branded-login-"));
  try {
    const bundle = await runScan({
      url: server.urlFor("branded-login-page"),
      profile: "tiny",
      outDir: path.join(tempRoot, "out"),
      preConsentScreenshotMode: "always",
    });

    assert.equal(bundle.scan_no_go_assessment, undefined);
    assert.equal(bundle.visual_access_review, undefined);
    assert.notEqual(bundle.runtimeCoverage?.coverageStatus, "limited_none");
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core emits scan no-go assessment for DataDome response challenges", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-datadome-challenge-"));
  try {
    const bundle = await runScan({
      url: server.urlFor("security-datadome-challenge"),
      profile: "tiny",
      outDir: path.join(tempRoot, "out"),
      preConsentScreenshotMode: "always",
    });

    assert.equal(bundle.scan_no_go_assessment?.decision, "no_go");
    assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
    assert.equal(bundle.visual_access_review?.go_no_go, "NO_GO");
    assert.equal(bundle.visual_access_review?.page_state, "captcha_or_challenge");
    assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes("captcha_or_challenge"));
    assert.ok(bundle.scan_no_go_assessment?.corroboratorCodes.includes("network_datadome_challenge"));
    assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none");
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("captcha_or_challenge"));
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("scan_no_go_assessment"));
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core emits scan no-go assessment for temporary access restriction pages", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-temporary-access-restriction-"));
  try {
    for (const page of ["security-access-temporarily-restricted", "security-kasada-challenge", "security-polish-temporary-interstitial"] as const) {
      const bundle = await runScan({
        url: server.urlFor(page),
        profile: "tiny",
        outDir: path.join(tempRoot, page),
        preConsentScreenshotMode: "always",
      });

      assert.equal(bundle.scan_no_go_assessment?.decision, "no_go", page);
      assert.equal(bundle.scanNoGoAssessment?.decision, "no_go", page);
      assert.equal(bundle.visual_access_review?.go_no_go, "NO_GO", page);
      if (page === "security-kasada-challenge") {
        assert.equal(bundle.visual_access_review?.page_state, "captcha_or_challenge", page);
        assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes("captcha_or_challenge"), page);
        assert.ok(bundle.scan_no_go_assessment?.corroboratorCodes.includes("network_kasada_challenge"), page);
      } else {
        assert.equal(bundle.visual_access_review?.page_state, "access_blocked", page);
        assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes("access_denied_or_forbidden_page"), page);
      }
      assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none", page);
      assert.ok(
        bundle.runtimeCoverage?.limitationKeys.includes(page === "security-kasada-challenge" ? "captcha_or_challenge" : "access_denied_or_forbidden_page"),
        page,
      );
      assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("scan_no_go_assessment"), page);
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scan-core emits scan no-go assessment when initial navigation fails before evidence capture", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-navigation-no-go-"));
  try {
    const bundle = await runScan({
      url: "http://127.0.0.1:9/",
      profile: "tiny",
      outDir: path.join(tempRoot, "out"),
      preConsentScreenshotMode: "never",
    });

    assert.equal(bundle.scan_no_go_assessment?.decision, "no_go");
    assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
    assert.equal(bundle.visual_access_review?.go_no_go, "NO_GO");
    assert.equal(bundle.visual_access_review?.page_state, "capture_failed");
    assert.equal(bundle.visual_access_review?.status, "missing_visual_artifact");
    assert.ok(bundle.scan_no_go_assessment?.reasonCodes.includes("navigation_transport_failure"));
    assert.ok(bundle.scan_no_go_assessment?.corroboratorCodes.includes("pre_consent_navigation_failed"));
    assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none");
    assert.ok(bundle.runtimeCoverage?.limitationKeys.includes("navigation_transport_failure"));
    assert.equal(bundle.policySurfaceInspection?.outcome, "indeterminate_limited_coverage");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function scanAndAssertFixtureExpectations(
  server: Awaited<ReturnType<typeof startStaticFixtureServer>>,
  tempRoot: string,
  page: StaticFixturePage,
): Promise<void> {
  const expectation = expectations[page];
  assert.ok(expectation, `${page}: fixture expectation missing`);

  const bundle = await scanFixturePage(server.urlFor(page), path.join(tempRoot, page));
  const review = await reviewEvidenceBundle(bundle);
  const report = await inspectBundle(bundle);

  assertFixtureExpectations(page, bundle, review, report, expectation);

  if (expectation.savedBundle) {
    const savedReport = await loadSavedInspectSnapshot(expectation.savedBundle);
    assertNormalizedSavedBundleComparison(page, report, savedReport, expectation);
  }
}

async function scanFixturePage(
  url: string,
  outDir: string,
  waitMode: "full" | "fast" = "full",
  screenshotMode: "always" | "selective" | "never" = "always",
  screenshotCaptureMode?: "full_page_first" | "viewport_first",
  internalBudgetMs?: number,
): Promise<CanonicalEvidenceBundle> {
  const startedAtMs = Date.now();
  const scanProfile = getScanProfile("quick");
  const artifactWriter = await createArtifactWriter(outDir);
  const scanResult = await preConsentRuntimeScanner({
    url,
    normalizedUrl: url,
    scanStartedAtMs: startedAtMs,
    internalBudgetMs: internalBudgetMs ?? (waitMode === "fast" ? 6_000 : scanProfile.internalBudgetMs),
    artifactWriter,
    routeFulfillers,
    screenshotCaptureMode,
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
  const consentSurfaceInspection = deriveConsentSurfaceInspectionOutcome({
    cmpRuntimeObservations: scanResult.cmpRuntimeObservations,
    consentUiObservations: scanResult.consentUiObservations,
    domSnapshots: scanResult.domSnapshots,
    modulesRun: [scanResult.moduleRun],
    networkEvents: scanResult.networkEvents,
    screenshots: scanResult.screenshots,
    visualCapture: scanResult.visualCapture,
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
    consentSurfaceInspection,
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

function geometryFixture(
  candidates: ConsentControlGeometryArtifact["candidates"],
  options: { cmpDetected?: boolean; containerText?: string } = {},
): ConsentControlGeometryArtifact {
  const cmpDetected = options.cmpDetected ?? true;
  const containerText = options.containerText ?? "We use cookies. Reject all Accept all Cookie settings.";
  return {
    artifactVersion: "consent_control_geometry.v1",
    capturedAt: new Date().toISOString(),
    candidates,
    cmp: {
      confidence: 0.95,
      detected: cmpDetected,
      detections: [],
      matchedSignals: [],
      name: cmpDetected ? "Fixture CMP" : undefined,
      reasonCodes: ["fixture_cmp"],
    },
    containers: [{
      boundingBox: rect(),
      containerId: "fixture_container",
      htmlExcerpt: "<section id=\"fixture-cookie-banner\">...</section>",
      id: "fixture-cookie-banner",
      intersectsViewport: true,
      layer: "first_layer",
      selectorHint: "#fixture-cookie-banner",
      textExcerpt: containerText,
    }],
    pageUrl: "https://fixture.test",
    sourceScanner: "consent_control_geometry_diagnostic",
    summary: {
      cmpDetected,
      cmpName: cmpDetected ? "Fixture CMP" : undefined,
      confidence: 0.98,
      firstLayerAccept: candidates.some((candidate) =>
        candidate.actionType === "accept_all" && candidate.decisionStatus === "confirmed_visible"
      ),
      firstLayerOptions: candidates.some((candidate) =>
        candidate.actionType === "manage_preferences" && candidate.decisionStatus === "confirmed_visible"
      ),
      firstLayerReject: candidates.some((candidate) =>
        candidate.actionType === "reject_all" && candidate.decisionStatus === "confirmed_visible"
      ),
      limitations: [],
    },
    viewport: {
      height: 768,
      width: 1366,
    },
  };
}

function geometryCandidate(
  label: string,
  actionType: ConsentControlGeometryArtifact["candidates"][number]["actionType"],
  decisionStatus: ConsentControlGeometryArtifact["candidates"][number]["decisionStatus"],
  layer: ConsentControlGeometryArtifact["candidates"][number]["layer"],
): ConsentControlGeometryArtifact["candidates"][number] {
  const classifierIntent =
    actionType === "accept_all" ? "accept" :
      actionType === "reject_all" ? "reject" :
        actionType === "manage_preferences" ? "options" :
          "unknown";
  return {
    actionType,
    boundingBox: rect(),
    candidateId: `fixture_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    classifierConfidence: classifierIntent === "unknown" ? 0.2 : 0.9,
    classifierReasonCodes: classifierIntent === "unknown" ? ["intent_unknown"] : [`intent_${classifierIntent}`],
    clippedByScrollableAncestor: false,
    computedStyle: {
      display: "block",
      opacity: "1",
      pointerEvents: "auto",
      position: "fixed",
      visibility: "visible",
      zIndex: "1000",
    },
    decisionStatus,
    enabled: true,
    frameContext: {
      frameKind: "main_frame",
      frameUrl: "https://fixture.test",
    },
    intersectsViewport: decisionStatus !== "dom_present_not_visible",
    label,
    layer,
    matchStrength: classifierIntent === "unknown" ? "weak" : "direct",
    matchedLocale: "en",
    matchedTerm: label.toLowerCase(),
    normalizedLabel: label.toLowerCase(),
    occlusion: {
      bottomLeft: true,
      bottomRight: true,
      center: decisionStatus !== "covered",
      checkedPoints: 5,
      hitSelectorHints: [],
      topLeft: true,
      topRight: true,
    },
    reasons: [decisionStatus],
    role: "button",
    selectorHint: `button[data-fixture="${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}"]`,
    tagName: "button",
    viewport: {
      height: 768,
      width: 1366,
    },
  };
}

function rect(): ConsentControlGeometryArtifact["candidates"][number]["boundingBox"] {
  return {
    bottom: 620,
    height: 48,
    left: 32,
    right: 232,
    top: 572,
    width: 200,
    x: 32,
    y: 572,
  };
}

function pixelBody(): string {
  return Buffer.from(
    "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64",
  ).toString("binary");
}
