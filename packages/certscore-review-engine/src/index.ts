import {
  type ArtifactRef,
  type CanonicalEvidenceBundle,
  type CoverageLimitation,
  type DirectVsInferred,
  type DisplaySafeEvidenceExcerpt,
  type EvidenceRef,
  type EndpointEnrichmentOverlay,
  type FindingCandidate,
  type NormalizedVendorObservation,
  type ObservedBehavior,
  type ObservedJourney,
  type ReviewResult,
  canonicalEvidenceBundleSchema,
  endpointEnrichmentOverlaySchema,
  reviewResultSchema,
  SCHEMA_VERSION,
} from "@certscore/contracts";
import { projectRegulatoryReview } from "./regulatory-review";

const PRE_CONSENT_MODULE = "preConsentRuntimeScanner";
const CONSENT_FLOW_MODULE = "consentFlowRuntimeScanner";
const POLICY_SURFACE_MODULE = "policySurfaceScanner";
const MAX_POST_OPT_OUT_COMPARISON_EVIDENCE_REFS = 24;

const trackingPurposes = new Set<NormalizedVendorObservation["purpose"]>([
  "analytics",
  "advertising",
  "session_replay",
]);

export async function reviewEvidenceBundle(
  bundleInput: CanonicalEvidenceBundle,
  options: { endpointEnrichmentOverlay?: EndpointEnrichmentOverlay } = {},
): Promise<ReviewResult> {
  const parsedBundle = canonicalEvidenceBundleSchema.parse(bundleInput);
  const bundle = applyEndpointEnrichmentOverlay(
    parsedBundle,
    options.endpointEnrichmentOverlay
      ? endpointEnrichmentOverlaySchema.parse(options.endpointEnrichmentOverlay)
      : undefined,
  );
  const sourceModulesPresent = bundle.modulesRun
    .filter((moduleRun) => moduleRun.status === "completed" || moduleRun.status === "partial")
    .map((moduleRun) => moduleRun.moduleName);

  const moduleSet = new Set(sourceModulesPresent);
  const coverageLimitations = buildCoverageLimitations(bundle, sourceModulesPresent);
  const findingCandidatesBase: FindingCandidate[] = [
    thirdPartyVendorsObserved(bundle, sourceModulesPresent, moduleSet),
    preConsentTrackingDetected(bundle, sourceModulesPresent, moduleSet),
    targetedAdvertisingRuntimeSignal(bundle, sourceModulesPresent, moduleSet),
    thirdPartyCookiePreConsent(bundle, sourceModulesPresent, moduleSet),
    vendorAssociatedCookiePreConsent(bundle, sourceModulesPresent, moduleSet),
    nonEssentialStoragePreConsent(bundle, sourceModulesPresent, moduleSet),
    unresolvedCollectionEndpointReviewSignal(bundle, sourceModulesPresent, moduleSet),
    endpointTransferReviewSignal(bundle, sourceModulesPresent, moduleSet),
    consentBannerObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet),
    sessionReplayOrBehavioralAnalyticsObserved(bundle, sourceModulesPresent, moduleSet),
    privacyNoticeObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet),
    cookiePolicyObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet),
    policySurfaceObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet, "privacy_choices_link_observed", "Privacy choices link observed", ["your_privacy_choices", "cookie_settings", "consent_preferences"]),
    doNotSellShareLinkObserved(bundle, sourceModulesPresent, moduleSet),
    gpcDisclosureObserved(bundle, sourceModulesPresent, moduleSet),
    gpcRuntimeProbeWithDisclosureObserved(bundle, sourceModulesPresent, moduleSet),
    noticeAtCollectionObserved(bundle, sourceModulesPresent, moduleSet),
    policyVendorMentionsObserved(bundle, sourceModulesPresent, moduleSet),
    policyRuntimeVendorAlignmentReviewSignal(bundle, sourceModulesPresent, moduleSet),
    policyTopicObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet, "ai_disclosure_observed_or_not_observed", "AI disclosure observed or not observed", "ai_features"),
    consentControlObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet, "reject_control_observed_or_not_observed", "Reject control observed or not observed", "reject_all"),
    consentControlObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet, "accept_control_observed_or_not_observed", "Accept control observed or not observed", "accept_all"),
    consentActionSucceededOrNotTestable(bundle, sourceModulesPresent, moduleSet, "reject_action_succeeded_or_not_testable", "Reject action succeeded or not testable", "reject_all"),
    consentActionSucceededOrNotTestable(bundle, sourceModulesPresent, moduleSet, "accept_action_succeeded_or_not_testable", "Accept action succeeded or not testable", "accept_all"),
    postChoiceConsentControlObserved(bundle, sourceModulesPresent, moduleSet),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "tracking_after_refusal_review_signal", "Tracking after refusal review signal", (comparison) =>
      comparisonHasPostRejectPersistence(comparison),
    ),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "reject_did_not_reduce_tracking_review_signal", "Reject did not reduce tracking review signal", (comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject" &&
      comparison.vendorsSuppressedAfterReject.length === 0 &&
      !comparison.journeyPhaseDeltas.some((delta) => delta.suppressedAfterReject) &&
      comparisonHasPostRejectTrackingPersistence(comparison),
    ),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "vendors_persist_after_reject_review_signal", "Vendors persist after reject review signal", (comparison) =>
      comparisonHasPostRejectVendorPersistence(comparison),
    ),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "vendors_appear_only_after_accept_review_signal", "Vendors appear only after accept review signal", (comparison) =>
      comparison.vendorsAppearingOnlyAfterAccept.length > 0,
    ),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "cookies_persist_after_reject_review_signal", "Cookies persist after reject review signal", (comparison) =>
      comparison.cookiesPersistingAfterReject.length > 0 ||
      comparison.journeyPhaseDeltas.some((delta) => delta.persistedAfterReject && deltaKind(delta) === "cookie"),
    ),
    postOptOutTargetedAdvertisingBehaviorSignal(bundle, sourceModulesPresent, moduleSet),
    consentComparisonSignal(bundle, sourceModulesPresent, moduleSet, "accept_reject_runtime_delta_observed", "Accept/reject runtime delta observed", (comparison) =>
      comparison.comparedScenarios === "after_reject_vs_after_accept" &&
      comparison.journeyPhaseDeltas.some((delta) => delta.persistedAfterReject || delta.suppressedAfterReject || delta.appearedOnlyAfterAccept || delta.expandedAfterAccept),
    ),
  ].map((finding) => ({
    ...finding,
    coverageLimitations: coverageLimitations.filter((limitation) =>
      limitation.affectedFindingKeys.includes(finding.findingKey),
    ),
  }));
  const evidenceExcerpts = buildEvidenceExcerpts(bundle, findingCandidatesBase);
  const excerptIdsBySourceKey = groupExcerptIdsBySourceKey(evidenceExcerpts);
  const findingCandidates = findingCandidatesBase.map((finding) => ({
    ...finding,
    evidenceExcerptIds: unique(
      finding.sourceEvidenceRefs.flatMap((ref) =>
        sourceKeysForRef(ref).flatMap((key) => excerptIdsBySourceKey.get(key) ?? []),
      ),
    ),
  }));

  return reviewResultSchema.parse({
    reviewId: `review_${bundle.scanId}`,
    scanId: bundle.scanId,
    url: bundle.url,
    reviewedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    sourceBundleSchemaVersion: bundle.schemaVersion,
    sourceModulesPresent,
    findingCandidates,
    evidenceExcerpts,
    coverageLimitations,
    regulatoryReview: projectRegulatoryReview({
      coverageLimitations,
      findingCandidates,
      reviewId: `review_${bundle.scanId}`,
      scanId: bundle.scanId,
      sourceModulesPresent,
      url: bundle.url,
    }),
    reportProjection: {
      projectionVersion: "placeholder.v1",
      generatedAt: new Date().toISOString(),
      findingKeys: findingCandidates
        .filter((candidate) => candidate.eligibility.status === "eligible")
        .map((candidate) => candidate.findingKey),
      notes: [
        "Placeholder projection only. Production report UI integration is intentionally not implemented in phase 1.",
      ],
    },
  });
}

function applyEndpointEnrichmentOverlay(
  bundle: CanonicalEvidenceBundle,
  overlay: EndpointEnrichmentOverlay | undefined,
): CanonicalEvidenceBundle {
  if (!overlay || overlay.endpointOverlays.length === 0) {
    return bundle;
  }
  if (overlay.sourceBundleScanId !== bundle.scanId) {
    throw new Error(
      `Endpoint enrichment overlay scan mismatch: ${overlay.sourceBundleScanId} does not match ${bundle.scanId}`,
    );
  }
  const overlaysByHost = new Map(
    overlay.endpointOverlays
      .filter((entry) => entry.endpointGeographyStatus === "region_observed")
      .map((entry) => [entry.hostname, entry]),
  );
  if (overlaysByHost.size === 0) {
    return bundle;
  }

  return {
    ...bundle,
    observedJourneys: bundle.observedJourneys.map((journey) => {
      const overlayHost = journey.relatedEndpoints
        .map(endpointHostname)
        .find((hostname): hostname is string => Boolean(hostname && overlaysByHost.has(hostname)));
      if (!overlayHost) {
        return journey;
      }
      const overlayEntry = overlaysByHost.get(overlayHost);
      if (!overlayEntry) {
        return journey;
      }
      return {
        ...journey,
        endpointGeographyStatus: overlayEntry.endpointGeographyStatus,
        endpointGeographyRegion: overlayEntry.endpointGeographyRegion,
        endpointGeographyProvider: overlayEntry.endpointGeographyProvider,
        endpointGeographyLocationLabel: overlayEntry.endpointGeographyLocationLabel,
        endpointGeographyJurisdiction: overlayEntry.endpointGeographyJurisdiction,
        endpointGeographyPrecision: overlayEntry.endpointGeographyPrecision,
        endpointGeographyBasis: unique([
          ...(journey.endpointGeographyBasis ?? []),
          ...overlayEntry.basis,
          "endpoint_enrichment_overlay",
        ]),
        eventRefs: journey.eventRefs.map((ref) => ({
          ...ref,
          endpointGeographyStatus: overlayEntry.endpointGeographyStatus,
          endpointGeographyRegion: overlayEntry.endpointGeographyRegion,
          endpointGeographyProvider: overlayEntry.endpointGeographyProvider,
          endpointGeographyLocationLabel: overlayEntry.endpointGeographyLocationLabel,
          endpointGeographyJurisdiction: overlayEntry.endpointGeographyJurisdiction,
          endpointGeographyPrecision: overlayEntry.endpointGeographyPrecision,
          endpointGeographyBasis: unique([
            ...(ref.endpointGeographyBasis ?? []),
            ...overlayEntry.basis,
            "endpoint_enrichment_overlay",
          ]),
        })),
      };
    }),
  };
}

function thirdPartyVendorsObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const journeys = meaningfulVendorJourneys(bundle);
  const relatedVendors = journeys.length > 0
    ? vendorsForJourneys(bundle, journeys)
    : bundle.normalizedVendorObservations.filter(
      (vendor) => !["consent_management", "infrastructure", "security", "performance_monitoring", "customer_support"].includes(vendor.purpose),
    );
  const refs = journeys.length > 0
    ? evidenceRefsFromJourneys(journeys)
    : evidenceRefsFromVendorObservations(bundle, relatedVendors);

  return candidate({
    findingKey: "third_party_vendors_observed",
    title: "Third-party vendors observed",
    eligible: journeys.length > 0 || relatedVendors.length > 0,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria:
      journeys.length > 0
        ? ["observed_vendor_journey_present"]
        : relatedVendors.length > 0 ? ["normalized_vendor_observation_present"] : [],
    missingCorroborators:
      journeys.length > 0 || relatedVendors.length > 0 ? [] : ["no_vendor_journey_or_observation"],
    confidence: maxConfidence(relatedVendors, 0.2),
    directVsInferred: directnessForVendors(relatedVendors),
    sourceEvidenceRefs: refs,
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function preConsentTrackingDetected(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const journeyEvidence = trackingJourneys(bundle).filter((journey) =>
    hasAnyBehavior(journey, [
      "collection_endpoint_observed",
      "cookie_sent",
      "identifier_parameter_observed",
      "advertising_click_id_observed",
      "session_replay_collection_observed",
    ]) ||
    (journey.firstPartyOrThirdParty === "third_party" &&
      journey.observedBehaviors.includes("cookie_set")),
  );
  const relatedVendors = journeyEvidence.length > 0
    ? vendorsForJourneys(bundle, journeyEvidence)
    : bundle.normalizedVendorObservations.filter((vendor) =>
      trackingPurposes.has(vendor.purpose),
    );
  const endpointObserved = journeyEvidence.some((journey) =>
    hasAnyBehavior(journey, [
      "collection_endpoint_observed",
      "session_replay_collection_observed",
    ]),
  ) || (journeyEvidence.length === 0 && relatedVendors.some(isCollectionEndpointObservation));
  const libraryLoadedOnly =
    journeyEvidence.length === 0 &&
    relatedVendors.length > 0 &&
    !endpointObserved;
  const eligible =
    moduleSet.has(PRE_CONSENT_MODULE) &&
    (journeyEvidence.length > 0 ||
      (bundle.observedJourneys.length === 0 &&
        bundle.derivedRuntimeSignals.preConsentTrackingObserved &&
        relatedVendors.length > 0));
  const journeyCriteria = criteriaFromJourneyBehaviors(journeyEvidence);

  return candidate({
    findingKey: "pre_consent_tracking_detected",
    title: "Pre-consent tracking detected",
    eligible,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: unique([
      ...journeyCriteria,
      ...(bundle.derivedRuntimeSignals.preConsentTrackingObserved
        ? ["pre_consent_tracking_signal_true"]
        : []),
      ...(endpointObserved ? ["collection_endpoint_observed"] : []),
      ...(libraryLoadedOnly ? ["library_loaded_only"] : []),
    ]),
    missingCorroborators:
      eligible || relatedVendors.length > 0 ? [] : ["active_tracking_journey"],
    demotionReasons: libraryLoadedOnly
      ? ["library_loaded_only_without_collection_endpoint"]
      : [],
    confidence: maxJourneyConfidence(journeyEvidence, endpointObserved ? 0.86 : libraryLoadedOnly ? 0.62 : 0.2),
    directVsInferred: journeyEvidence.length > 0 ? directnessForJourneys(journeyEvidence) : endpointObserved ? "direct" : libraryLoadedOnly ? "inferred" : "unknown",
    sourceEvidenceRefs: journeyEvidence.length > 0
      ? preConsentTrackingEvidenceRefsFromJourneys(journeyEvidence)
      : evidenceRefsFromVendorObservations(bundle, relatedVendors),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function targetedAdvertisingRuntimeSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const advertisingJourneys = bundle.observedJourneys.filter((journey) =>
    journey.purpose === "advertising" &&
    ["vendor", "product", "tracker", "cookie", "endpoint", "script", "iframe"].includes(journey.journeyType),
  );
  const relatedVendors = advertisingJourneys.length > 0
    ? vendorsForJourneys(bundle, advertisingJourneys).filter((vendor) => vendor.purpose === "advertising")
    : bundle.normalizedVendorObservations.filter((vendor) => vendor.purpose === "advertising");
  const endpointObserved = advertisingJourneys.some((journey) =>
    hasAnyBehavior(journey, [
      "collection_endpoint_observed",
      "identifier_parameter_observed",
      "advertising_click_id_observed",
      "cookie_sent",
      "cookie_set",
    ]),
  ) || (advertisingJourneys.length === 0 && relatedVendors.some(isCollectionEndpointObservation));
  const libraryLoadedOnly =
    advertisingJourneys.length > 0 &&
    !endpointObserved &&
    advertisingJourneys.every((journey) => journey.observedBehaviors.includes("library_loaded_only"));
  const eligible = moduleSet.has(PRE_CONSENT_MODULE) && (advertisingJourneys.length > 0 || relatedVendors.length > 0);

  return candidate({
    findingKey: "targeted_advertising_runtime_signal",
    title: "Targeted advertising runtime signal",
    eligible,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: [
      ...(advertisingJourneys.length > 0 ? ["advertising_purpose_journey"] : []),
      ...(relatedVendors.length > 0 ? ["advertising_purpose_vendor_resolved"] : []),
      ...(endpointObserved ? ["advertising_collection_or_cookie_signal"] : []),
      ...criteriaFromJourneyBehaviors(advertisingJourneys),
    ],
    missingCorroborators: eligible ? [] : ["advertising_purpose_runtime_evidence"],
    demotionReasons: libraryLoadedOnly ? ["advertising_library_loaded_only_without_collection_or_cookie_signal"] : [],
    confidence: advertisingJourneys.length > 0
      ? maxJourneyConfidence(advertisingJourneys, endpointObserved ? 0.88 : 0.74)
      : maxConfidence(relatedVendors, 0.2),
    directVsInferred: advertisingJourneys.length > 0 ? directnessForJourneys(advertisingJourneys) : directnessForVendors(relatedVendors),
    sourceEvidenceRefs: targetedAdvertisingEvidenceRefs(advertisingJourneys, relatedVendors),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function thirdPartyCookiePreConsent(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const cookieJourneys = bundle.observedJourneys.filter(
    (journey) =>
      journey.journeyType === "cookie" &&
      journey.firstObservedConsentState === "pre_consent" &&
      journey.firstPartyOrThirdParty === "third_party" &&
      journey.observedBehaviors.includes("cookie_set") &&
      isTrackingCookiePurpose(journey.purpose),
  );
  const thirdPartyCookieEvents = bundle.cookieEvents.filter(
    (event) =>
      event.consentStateAtTime === "pre_consent" &&
      (event.cookieParty === "third_party" || event.thirdParty === true) &&
      event.operation === "set_cookie_header" &&
      isTrackingCookiePurpose(event.cookiePurpose),
  );
  const relatedVendors = cookieJourneys.length > 0
    ? vendorsForJourneys(bundle, cookieJourneys)
    : vendorsRelatedToCookieEvents(
    bundle.normalizedVendorObservations,
    thirdPartyCookieEvents.map((event) => event.cookieName),
  );
  const eligible =
    moduleSet.has(PRE_CONSENT_MODULE) &&
    (cookieJourneys.length > 0 || thirdPartyCookieEvents.length > 0);

  return candidate({
    findingKey: "third_party_cookie_pre_consent",
    title: "Third-party cookie observed before consent",
    eligible,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria:
      cookieJourneys.length > 0
        ? ["pre_consent_cookie_journey", "non_essential_cookie_purpose_classified"]
        : thirdPartyCookieEvents.length > 0
        ? ["third_party_set_cookie_header_pre_consent", "non_essential_cookie_purpose_classified"]
        : [],
    missingCorroborators:
      cookieJourneys.length > 0 || thirdPartyCookieEvents.length > 0
        ? []
        : ["third_party_cookie_event_pre_consent", "non_essential_cookie_purpose_classification"],
    confidence: cookieJourneys.length > 0
      ? maxJourneyConfidence(cookieJourneys, 0.9)
      : thirdPartyCookieEvents.length > 0 ? 0.9 : 0.2,
    directVsInferred: cookieJourneys.length > 0 || thirdPartyCookieEvents.length > 0 ? "direct" : "unknown",
    sourceEvidenceRefs: cookieJourneys.length > 0 ? evidenceRefsFromJourneys(cookieJourneys) : thirdPartyCookieEvents.map((event) => ({
      refId: `ref_${event.eventId}`,
      eventId: event.eventId,
      eventType: event.eventType,
      label: event.cookieName,
    })),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function vendorAssociatedCookiePreConsent(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const cookieJourneys = bundle.observedJourneys.filter(
    (journey) =>
      journey.journeyType === "cookie" &&
      journey.firstObservedConsentState === "pre_consent" &&
      journey.firstPartyOrThirdParty === "first_party" &&
      isTrackingCookiePurpose(journey.purpose),
  );
  const cookieEvents = bundle.cookieEvents.filter(
    (event) =>
      event.consentStateAtTime === "pre_consent" &&
      event.cookieParty === "first_party" &&
      event.vendorAssociated &&
      isTrackingCookiePurpose(event.cookiePurpose),
  );
  const relatedVendors = cookieJourneys.length > 0
    ? vendorsForJourneys(bundle, cookieJourneys)
    : vendorsRelatedToCookieEvents(
      bundle.normalizedVendorObservations,
      cookieEvents.map((event) => event.cookieName),
    );

  return candidate({
    findingKey: "vendor_associated_cookie_pre_consent",
    title: "Vendor-associated first-party cookie observed before consent",
    eligible: moduleSet.has(PRE_CONSENT_MODULE) && (cookieJourneys.length > 0 || cookieEvents.length > 0),
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: cookieJourneys.length > 0 || cookieEvents.length > 0
      ? ["vendor_associated_first_party_cookie_pre_consent", "non_essential_cookie_purpose_classified"]
      : [],
    missingCorroborators: cookieJourneys.length > 0 || cookieEvents.length > 0
      ? []
      : ["vendor_associated_first_party_cookie", "non_essential_cookie_purpose_classification"],
    demotionReasons: ["first_party_cookie_not_third_party_cookie_finding"],
    confidence: maxJourneyConfidence(cookieJourneys, cookieEvents.length > 0 ? 0.74 : 0.2),
    directVsInferred: cookieJourneys.length > 0 || cookieEvents.length > 0 ? "direct" : "unknown",
    sourceEvidenceRefs: cookieJourneys.length > 0
      ? evidenceRefsFromJourneys(cookieJourneys)
      : cookieEvents.map((event) => ({
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        label: event.cookieName,
      })),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function nonEssentialStoragePreConsent(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const preConsentStorageKeys = preConsentStorageKeySet(bundle);
  const relatedVendors = bundle.normalizedVendorObservations.filter((vendor) =>
    isTrackingCookiePurpose(vendor.purpose) &&
    vendor.matchSources.some((source) =>
      source.source === "storage_key" &&
      source.matchedField === "storage_key" &&
      source.consentStateAtTime === "pre_consent" &&
      typeof source.matchedValueRedacted === "string" &&
      preConsentStorageKeys.has(source.matchedValueRedacted),
    ),
  );
  const sourceEvidenceRefs = storageEvidenceRefsForVendors(relatedVendors, preConsentStorageKeys);
  const eligible =
    moduleSet.has(PRE_CONSENT_MODULE) &&
    preConsentStorageKeys.size > 0 &&
    relatedVendors.length > 0 &&
    sourceEvidenceRefs.length > 0;

  return candidate({
    findingKey: "non_essential_storage_pre_consent",
    title: "Non-essential browser storage observed before consent",
    eligible,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: eligible
      ? ["pre_consent_storage_snapshot", "storage_key_retained", "non_essential_storage_purpose_classified"]
      : [],
    missingCorroborators: eligible
      ? []
      : ["classified_non_essential_storage_key_pre_consent"],
    confidence: eligible ? Math.min(maxConfidence(relatedVendors, 0.84), 0.86) : 0.2,
    directVsInferred: eligible ? "direct" : "unknown",
    sourceEvidenceRefs,
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function unresolvedCollectionEndpointReviewSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const journeys = bundle.observedJourneys.filter(
    (journey) =>
      journey.journeyType === "endpoint" &&
      journey.vendor === undefined &&
      journey.purpose === undefined &&
      (journey.attributionStatus === undefined || journey.attributionStatus === "unresolved_meaningful") &&
      isUnresolvedEndpointReviewSubtype(journey) &&
      journey.observedBehaviors.includes("collection_endpoint_observed"),
  );

  return candidate({
    findingKey: "unresolved_collection_endpoint_review_signal",
    title: "Unresolved collection-like endpoint observed",
    eligible: moduleSet.has(PRE_CONSENT_MODULE) && journeys.length > 0,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: journeys.length > 0 ? ["unresolved_collection_endpoint_observed"] : [],
    missingCorroborators: journeys.length > 0 ? [] : ["unresolved_collection_endpoint"],
    demotionReasons: ["unresolved_vendor_low_confidence_review_signal"],
    confidence: maxJourneyConfidence(journeys, journeys.length > 0 ? 0.58 : 0.2),
    directVsInferred: journeys.length > 0 ? "inferred" : "unknown",
    sourceEvidenceRefs: evidenceRefsFromJourneys(journeys),
    relatedVendors: [],
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function endpointTransferReviewSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const journeys = bundle.observedJourneys.filter(
    (journey) =>
      journey.observedBehaviors.includes("collection_endpoint_observed") &&
      journey.relatedEndpoints.length > 0 &&
      journey.firstPartyOrThirdParty === "third_party" &&
      journey.attributionStatus !== "site_owned_infrastructure" &&
      journey.attributionStatus !== "ignored_noise",
  );
  const relatedVendors = vendorsForJourneys(bundle, journeys);
  const geographyStatuses = endpointGeographyStatusesForJourneys(journeys);
  const geographyObserved = geographyStatuses.includes("region_observed");
  const geographyLocationObserved = geographyObserved && journeys.some((journey) =>
    Boolean(journey.endpointGeographyLocationLabel && journey.endpointGeographyJurisdiction)
  );
  const geographyMissingCorroborator = geographyObserved
    ? geographyLocationObserved
      ? undefined
      : "endpoint_geography_location_not_retained"
    : geographyStatuses.includes("not_evaluated")
    ? "Endpoint geography was explicitly not evaluated for retained endpoint evidence."
    : "Add bounded endpoint geography or region evidence before treating this as high confidence.";

  return candidate({
    findingKey: "endpoint_transfer_review_signal",
    title: "Endpoint transfer review signal",
    eligible: moduleSet.has(PRE_CONSENT_MODULE) && journeys.length > 0,
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: [
      ...(journeys.length > 0 ? ["collection_endpoint_observed"] : []),
      ...(relatedVendors.length > 0 ? ["endpoint_vendor_attribution_retained"] : []),
      ...(geographyObserved ? ["endpoint_geography_region_observed"] : []),
      ...(geographyLocationObserved ? ["endpoint_geography_region_location_observed"] : []),
      ...(journeys.some((journey) => journey.endpointGeographyBasis?.includes("endpoint_enrichment_overlay"))
        ? ["endpoint_geography_enrichment_overlay_applied"]
        : []),
      ...(geographyStatuses.includes("not_evaluated") ? ["endpoint_geography_not_evaluated"] : []),
    ],
    missingCorroborators: journeys.length > 0
      ? geographyMissingCorroborator ? [geographyMissingCorroborator] : []
      : ["collection_endpoint"],
    demotionReasons: geographyObserved ? [] : ["endpoint_geography_not_retained"],
    confidence: journeys.length > 0
      ? Math.min(maxJourneyConfidence(journeys, 0.62), geographyLocationObserved ? 0.82 : geographyObserved ? 0.72 : 0.62)
      : 0.2,
    directVsInferred: journeys.length > 0 ? directnessForJourneys(journeys) : "unknown",
    sourceEvidenceRefs: endpointReviewEvidenceRefsFromJourneys(journeys),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function endpointGeographyStatusesForJourneys(journeys: ObservedJourney[]) {
  return unique(journeys.flatMap((journey) =>
    journey.endpointGeographyStatus ? [journey.endpointGeographyStatus] : [],
  ));
}

function endpointReviewEvidenceRefsFromJourneys(journeys: ObservedJourney[]): EvidenceRef[] {
  return uniqueEvidenceRefs(journeys.flatMap((journey) => {
    const eventRef =
      journey.eventRefs.find((ref) => ref.behavior === "collection_endpoint_observed") ??
      journey.eventRefs[0];
    const endpoint = journey.relatedEndpoints[0] ?? eventRef?.url ?? journey.entryPoint;
    const hostname = endpointHostname(endpoint);
    const endpointRef = {
      refId: `ref_${eventRef?.eventId ?? journey.journeyId}`,
      eventId: eventRef?.eventId,
      eventType: eventRef?.eventType,
      label: hostname ? `endpoint:${hostname}` : journey.displayName,
    };
    if (!journey.endpointGeographyLocationLabel || !journey.endpointGeographyJurisdiction) {
      return [endpointRef];
    }
    return [
      endpointRef,
      {
        refId: `ref_${eventRef?.eventId ?? journey.journeyId}_endpoint_location`,
        eventId: eventRef?.eventId,
        eventType: eventRef?.eventType,
        label: `endpoint location:${journey.endpointGeographyLocationLabel} (${journey.endpointGeographyJurisdiction})`,
      },
    ];
  }));
}

function endpointHostname(endpoint: string | undefined): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint.includes(".") && !endpoint.includes("/") ? endpoint : undefined;
  }
}

function consentBannerObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const observation = bundle.consentUiObservations[0];
  const hasObservation = Boolean(observation);
  const actionableCandidates = actionableConsentSurfaceCandidates(bundle);
  const surfaceClass = classifyConsentSurfaceEvidence(observation, actionableCandidates);
  const actionableSurfaceObserved = surfaceClass === "actionable_banner";
  const likelyPresent = observation?.likelyPresent === true || actionableSurfaceObserved;
  const confidence = consentSurfaceConfidence(surfaceClass, observation, actionableCandidates);

  return candidate({
    findingKey: "consent_banner_observed_or_not_observed",
    title: "Consent banner observed or not observed",
    eligible: moduleSet.has(PRE_CONSENT_MODULE) && hasObservation && surfaceClass !== "not_observed",
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: hasObservation
      ? [
        likelyPresent ? "consent_ui_likely_present" : "consent_ui_not_observed",
        `consent_surface_quality:${surfaceClass}`,
        ...(actionableSurfaceObserved ? ["actionable_consent_control_observed"] : []),
        ...(actionableCandidates.length > 0 ? ["consent_action_candidate_retained"] : []),
      ]
      : [],
    missingCorroborators: hasObservation
      ? consentSurfaceMissingCorroborators(surfaceClass)
      : ["consent_ui_observation"],
    demotionReasons: consentSurfaceDemotionReasons(surfaceClass),
    confidence,
    directVsInferred: surfaceClass === "actionable_banner" ? "direct" : hasObservation ? "inferred" : "unknown",
    sourceEvidenceRefs: consentSurfaceEvidenceRefs(observation, actionableCandidates, surfaceClass),
    relatedVendors: bundle.normalizedVendorObservations.filter(
      (vendor) => vendor.purpose === "consent_management",
    ),
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

type ConsentSurfaceEvidenceClass =
  | "actionable_banner"
  | "preference_control_only"
  | "notice_only"
  | "keyword_only"
  | "not_observed";

function classifyConsentSurfaceEvidence(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number] | undefined,
  actionableCandidates: CanonicalEvidenceBundle["consentActionCandidates"],
): ConsentSurfaceEvidenceClass {
  if (!observation || observation.likelyPresent !== true) {
    return "not_observed";
  }
  const hasAcceptOrReject = actionableCandidates.some((candidate) =>
    candidate.actionType === "accept_all" || candidate.actionType === "reject_all",
  );
  const hasFirstLayerActionBasis =
    consentUiObservationHasFirstLayerActionBasis(observation) &&
    consentUiObservationHasRetainedEvidence(observation);
  if (hasAcceptOrReject || hasFirstLayerActionBasis) {
    return "actionable_banner";
  }
  const hasPreferenceControl = actionableCandidates.some((candidate) =>
    candidate.actionType === "manage_preferences" || candidate.actionType === "save_preferences",
  ) || consentUiObservationHasPreferenceControlBasis(observation);
  if (hasPreferenceControl) {
    return "preference_control_only";
  }
  if (observation.textExcerpt && observation.textExcerpt.trim().length > 0) {
    return "notice_only";
  }
  return "keyword_only";
}

function consentSurfaceConfidence(
  surfaceClass: ConsentSurfaceEvidenceClass,
  observation: CanonicalEvidenceBundle["consentUiObservations"][number] | undefined,
  actionableCandidates: CanonicalEvidenceBundle["consentActionCandidates"],
) {
  if (surfaceClass === "actionable_banner") {
    return Math.max(observation?.confidence ?? 0.2, maxConsentCandidateConfidence(actionableCandidates, 0.84));
  }
  if (surfaceClass === "preference_control_only") {
    return Math.min(0.68, Math.max(observation?.confidence ?? 0.2, maxConsentCandidateConfidence(actionableCandidates, 0.62)));
  }
  if (surfaceClass === "notice_only") {
    return Math.min(0.62, observation?.confidence ?? 0.2);
  }
  if (surfaceClass === "keyword_only") {
    return Math.min(0.55, observation?.confidence ?? 0.2);
  }
  return observation?.confidence ?? 0.2;
}

function consentSurfaceMissingCorroborators(surfaceClass: ConsentSurfaceEvidenceClass) {
  switch (surfaceClass) {
    case "actionable_banner":
    case "not_observed":
      return [];
    case "preference_control_only":
      return ["initial_consent_banner_accept_or_reject_control"];
    case "notice_only":
      return ["actionable_consent_control_evidence"];
    case "keyword_only":
      return ["bounded_visible_consent_surface_text", "actionable_consent_control_evidence"];
  }
}

function consentSurfaceDemotionReasons(surfaceClass: ConsentSurfaceEvidenceClass) {
  switch (surfaceClass) {
    case "preference_control_only":
      return ["preference_control_observed_without_initial_banner_controls"];
    case "notice_only":
      return ["notice_only_consent_surface_without_actionable_control"];
    case "keyword_only":
      return ["keyword_only_consent_surface_without_actionable_control"];
    default:
      return [];
  }
}

function consentSurfaceEvidenceRefs(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number] | undefined,
  actionableCandidates: CanonicalEvidenceBundle["consentActionCandidates"],
  surfaceClass: ConsentSurfaceEvidenceClass,
) {
  const observationRefs = observation?.evidenceRefs ?? [];
  const candidateRefs = actionableCandidates.flatMap((candidate) => [
    ...candidate.evidenceRefs,
    ...consentActionCandidateSummaryRefs(candidate),
  ]);
  return uniqueEvidenceRefs([
    ...observationRefs,
    ...(surfaceClass === "actionable_banner" || surfaceClass === "preference_control_only" ? candidateRefs : []),
  ]);
}

function consentActionCandidateSummaryRefs(
  candidate: CanonicalEvidenceBundle["consentActionCandidates"][number],
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (candidate.labelText) {
    refs.push({
      refId: `ref_${candidate.actionId}_label`,
      eventType: "consent_ui",
      label: `Consent control: ${candidate.labelText.slice(0, 80)}`,
      excerpt: candidate.contextTextExcerpt ?? candidate.labelText,
    });
  }
  if (candidate.selectorSummary) {
    refs.push({
      refId: `ref_${candidate.actionId}_selector`,
      eventType: "consent_ui",
      label: `Consent control selector: ${candidate.selectorSummary.slice(0, 80)}`,
    });
  }
  return refs;
}

function consentUiObservationHasFirstLayerActionBasis(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number],
): boolean {
  return observation.basis.some((basis) =>
    /button_(?:accept|reject)_detected/i.test(basis) ||
    /accept_all|reject_all/i.test(basis),
  );
}

function consentUiObservationHasRetainedEvidence(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number],
): boolean {
  return Boolean(observation.textExcerpt?.trim()) || observation.evidenceRefs.length > 0;
}

function consentUiObservationHasPreferenceControlBasis(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number],
): boolean {
  return observation.basis.some((basis) =>
    /button_settings_detected/i.test(basis) ||
    /manage_preferences|save_preferences|cmp_root_detected|role:dialog/i.test(basis),
  );
}

function actionableConsentSurfaceCandidates(
  bundle: CanonicalEvidenceBundle,
): CanonicalEvidenceBundle["consentActionCandidates"] {
  const actionableTypes = new Set<CanonicalEvidenceBundle["consentActionCandidates"][number]["actionType"]>([
    "accept_all",
    "reject_all",
    "manage_preferences",
    "save_preferences",
  ]);
  return bundle.consentActionCandidates.filter((candidate) =>
    actionableTypes.has(candidate.actionType) &&
    candidate.visible &&
    candidate.enabled &&
    candidate.confidence >= 0.75 &&
    consentActionCandidateHasRetainedEvidence(candidate),
  );
}

function consentActionCandidateHasRetainedEvidence(
  candidate: CanonicalEvidenceBundle["consentActionCandidates"][number],
): boolean {
  return Boolean(candidate.labelText.trim()) ||
    Boolean(candidate.contextTextExcerpt?.trim()) ||
    Boolean(candidate.selectorSummary?.trim()) ||
    candidate.evidenceRefs.length > 0 ||
    candidate.screenshotArtifactRefs.length > 0;
}

function maxConsentCandidateConfidence(
  candidates: CanonicalEvidenceBundle["consentActionCandidates"],
  fallback: number,
): number {
  return candidates.reduce((max, candidate) => Math.max(max, candidate.confidence), fallback);
}

function sessionReplayOrBehavioralAnalyticsObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const replayJourneys = bundle.observedJourneys.filter(
    (journey) => journey.purpose === "session_replay",
  );
  const relatedVendors = replayJourneys.length > 0
    ? vendorsForJourneys(bundle, replayJourneys)
    : bundle.normalizedVendorObservations.filter(
      (vendor) => vendor.purpose === "session_replay",
    );
  const endpointObserved = replayJourneys.some((journey) =>
    hasAnyBehavior(journey, [
      "collection_endpoint_observed",
      "session_replay_collection_observed",
    ]),
  ) || (replayJourneys.length === 0 && relatedVendors.some(isCollectionEndpointObservation));
  const libraryLoadedOnly =
    replayJourneys.length > 0
      ? replayJourneys.some((journey) => journey.observedBehaviors.includes("library_loaded_only")) && !endpointObserved
      : relatedVendors.length > 0 && !endpointObserved;
  const replayVendorWithoutCollection = relatedVendors.length > 0 && !endpointObserved && !libraryLoadedOnly;

  return candidate({
    findingKey: "session_replay_or_behavioral_analytics_observed",
    title: "Session replay or behavioral analytics observed",
    eligible:
      replayJourneys.length > 0 ||
      (bundle.derivedRuntimeSignals.sessionReplayOrBehavioralAnalyticsObserved &&
        relatedVendors.length > 0),
    deferred: isPreConsentRuntimeCoverageUnavailable(bundle, moduleSet),
    deferredReason: preConsentRuntimeDeferredReason(bundle, moduleSet),
    matchedCriteria: [
      ...(relatedVendors.length > 0 ? ["session_replay_vendor_observation"] : []),
      ...(endpointObserved ? ["collection_endpoint_observed"] : []),
      ...(libraryLoadedOnly ? ["library_loaded_only"] : []),
      ...(replayVendorWithoutCollection ? ["session_replay_vendor_without_collection_endpoint"] : []),
    ],
    missingCorroborators:
      libraryLoadedOnly || replayVendorWithoutCollection
        ? ["session_replay_collection_evidence"]
        : relatedVendors.length > 0 ? [] : ["session_replay_vendor_observation"],
    demotionReasons: libraryLoadedOnly
      ? ["library_loaded_only_without_collection_endpoint"]
      : replayVendorWithoutCollection
        ? ["session_replay_vendor_observed_without_collection_endpoint"]
      : [],
    confidence: libraryLoadedOnly
      ? Math.min(0.62, maxJourneyConfidence(replayJourneys, 0.62))
      : replayVendorWithoutCollection
        ? Math.min(0.68, maxJourneyConfidence(replayJourneys, 0.68))
      : maxJourneyConfidence(replayJourneys, endpointObserved ? 0.86 : 0.2),
    directVsInferred: endpointObserved
      ? replayJourneys.length > 0 ? directnessForJourneys(replayJourneys) : "direct"
      : relatedVendors.length > 0 ? "inferred" : "unknown",
    sourceEvidenceRefs: replayJourneys.length > 0
      ? evidenceRefsFromJourneys(replayJourneys)
      : evidenceRefsFromVendorObservations(bundle, relatedVendors),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE],
    sourceModulesPresent,
  });
}

function policySurfaceObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  surfaceTypes: Array<CanonicalEvidenceBundle["policySurfaceObservations"][number]["surfaceType"]>,
): FindingCandidate {
  const observations = observedPolicySurfaces(bundle).filter((observation) =>
    surfaceTypes.includes(observation.surfaceType),
  );
  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && observations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: observations.length > 0 ? [`policy_surface_observed:${surfaceTypes.join("|")}`] : [],
    missingCorroborators: observations.length > 0 ? [] : ["policy_surface_observation"],
    confidence: observations.length > 0 ? maxPolicyConfidence(observations, 0.7) : 0.2,
    directVsInferred: policyDirectness(observations),
    sourceEvidenceRefs: evidenceRefsFromPolicySurfaces(observations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function doNotSellShareLinkObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const policySurfaces = observedPolicySurfaces(bundle);
  const observations = policySurfaces.filter((observation) =>
    observation.surfaceType === "do_not_sell_or_share" || observation.surfaceType === "your_privacy_choices",
  );
  const directPolicyOptOutSurfaces = policySurfaces.filter((observation) =>
    !observations.includes(observation) && isDirectSaleShareOptOutPolicySurface(observation),
  );
  const explicitSurfaces = observations.filter(isExplicitDoNotSellShareSurface);
  const contextualPrivacyChoices = observations.filter((observation) =>
    !explicitSurfaces.includes(observation) && isContextualPrivacyChoicesSurface(observation),
  );
  const ambiguousPrivacyChoices = observations.filter((observation) =>
    !explicitSurfaces.includes(observation) && !contextualPrivacyChoices.includes(observation),
  );
  const supportingSaleSharePolicyContexts = policySurfaces.filter((observation) =>
    !observations.includes(observation) && isSaleShareOptOutPolicyContext(observation),
  );
  const hasCorroboratedPrivacyChoices =
    ambiguousPrivacyChoices.length > 0 && supportingSaleSharePolicyContexts.length > 0;
  const evidenceObservations = explicitSurfaces.length > 0
    ? explicitSurfaces
    : contextualPrivacyChoices.length > 0
      ? contextualPrivacyChoices
      : hasCorroboratedPrivacyChoices
        ? [...ambiguousPrivacyChoices, ...supportingSaleSharePolicyContexts]
        : directPolicyOptOutSurfaces.length > 0
          ? directPolicyOptOutSurfaces
        : ambiguousPrivacyChoices;
  const hasStrongOptOutPath =
    explicitSurfaces.length > 0 ||
    directPolicyOptOutSurfaces.length > 0 ||
    contextualPrivacyChoices.length > 0 ||
    hasCorroboratedPrivacyChoices;
  const hasAmbiguousPrivacyChoicesOnly = !hasStrongOptOutPath && ambiguousPrivacyChoices.length > 0;

  return candidate({
    findingKey: "do_not_sell_or_share_link_observed",
    title: "Do Not Sell or Share link observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && evidenceObservations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: [
      ...(explicitSurfaces.length > 0 ? ["explicit_do_not_sell_share_surface_observed"] : []),
      ...(directPolicyOptOutSurfaces.length > 0 ? ["explicit_do_not_sell_share_policy_text_observed"] : []),
      ...(directPolicyOptOutSurfaces.length > 0 ? ["bounded_sale_share_policy_context_retained"] : []),
      ...(contextualPrivacyChoices.length > 0 ? ["privacy_choices_surface_with_sale_share_context_observed"] : []),
      ...(hasCorroboratedPrivacyChoices ? ["privacy_choices_surface_with_policy_sale_share_context_observed"] : []),
      ...(hasCorroboratedPrivacyChoices ? ["bounded_sale_share_policy_context_retained"] : []),
      ...(hasAmbiguousPrivacyChoicesOnly ? ["privacy_choices_surface_observed_without_sale_share_context"] : []),
    ],
    missingCorroborators:
      evidenceObservations.length === 0
        ? ["do_not_sell_or_share_surface"]
        : hasStrongOptOutPath ? [] : ["sale_share_or_opt_out_context"],
    demotionReasons: hasAmbiguousPrivacyChoicesOnly
      ? ["privacy_choices_surface_without_sale_share_context"]
      : [],
    confidence: hasStrongOptOutPath
      ? Math.max(0.82, maxPolicyConfidence(evidenceObservations, 0.82))
      : hasAmbiguousPrivacyChoicesOnly ? Math.min(0.62, maxPolicyConfidence(evidenceObservations, 0.62)) : 0.2,
    directVsInferred: policyDirectness(evidenceObservations),
    sourceEvidenceRefs: evidenceRefsFromPolicySurfaces(evidenceObservations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function isExplicitDoNotSellShareSurface(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (observation.surfaceType !== "do_not_sell_or_share") {
    return false;
  }
  return /do not sell|do-not-sell|do not share|do-not-share|do not sell or share/i.test(policySurfaceContextText(observation)) ||
    observation.observedTopics.includes("do_not_sell_or_share") ||
    observation.mentionedRights.includes("do_not_sell_or_share");
}

function isContextualPrivacyChoicesSurface(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (observation.surfaceType !== "your_privacy_choices") {
    return false;
  }
  return /do not sell|do-not-sell|do not share|do-not-share|sale|share|opt[-\s]?out|targeted advertising|cross[-\s]?context/i.test(policySurfaceContextText(observation)) ||
    observation.observedTopics.some((topic) =>
      ["do_not_sell_or_share", "sale_or_share", "targeted_advertising"].includes(topic)
    ) ||
    observation.mentionedRights.includes("do_not_sell_or_share");
}

function isSaleShareOptOutPolicyContext(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (!hasBoundedFetchedPolicyContent(observation)) {
    return false;
  }
  const text = policySurfaceContextText(observation);
  const saleShareContext =
    observation.observedTopics.some((topic) =>
      ["do_not_sell_or_share", "sale_or_share", "targeted_advertising"].includes(topic)
    ) ||
    observation.mentionedRights.includes("do_not_sell_or_share");
  const optOutControlContext =
    /your privacy choices|do not sell|do-not-sell|do not share|do-not-share|opt[-\s]?out|global privacy control|\bgpc\b|preference signal/i.test(text) ||
    observation.mentionedControls.some((control) =>
      /privacy choices|do not sell|do not share|opt[-\s]?out|global privacy control|\bgpc\b/i.test(control)
    );
  return saleShareContext && optOutControlContext;
}

function isDirectSaleShareOptOutPolicySurface(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (!hasBoundedFetchedPolicyContent(observation)) {
    return false;
  }
  const text = policySurfaceContextText(observation);
  const explicitOptOutText = /do not sell|do-not-sell|do not share|do-not-share|opt[-\s]?out of (?:the )?(?:sale|sharing)|your privacy choices/i.test(text);
  const saleShareContext =
    /sale|share|sharing|targeted advertising|cross[-\s]?context/i.test(text) ||
    observation.observedTopics.some((topic) =>
      ["do_not_sell_or_share", "sale_or_share", "targeted_advertising"].includes(topic)
    ) ||
    observation.mentionedRights.includes("do_not_sell_or_share");
  return explicitOptOutText && saleShareContext;
}

function policySurfaceContextText(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  return [
    observation.linkText,
    observation.title,
    observation.surroundingTextExcerpt,
    observation.normalizedUrl,
    observation.url,
    observation.textExcerpt,
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function privacyNoticeObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const observations = observedPolicySurfaces(bundle).filter((observation) =>
    observation.surfaceType === "privacy_policy",
  );
  const completeObservations = observations.filter(hasBoundedFetchedPolicyContent);
  const incompleteObservations = observations.filter((observation) =>
    !completeObservations.includes(observation),
  );
  const evidenceObservations = completeObservations.length > 0
    ? completeObservations
    : incompleteObservations;
  const hasCompletePrivacyNotice = completeObservations.length > 0;

  return candidate({
    findingKey: "privacy_notice_observed_or_not_observed",
    title: "Privacy notice observed or not observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && evidenceObservations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: [
      ...(observations.length > 0 ? ["privacy_notice_surface_observed"] : []),
      ...(hasCompletePrivacyNotice ? ["privacy_notice_bounded_excerpt_retained"] : []),
      ...(hasCompletePrivacyNotice ? ["privacy_notice_fetch_succeeded"] : []),
      ...(incompleteObservations.length > 0 && !hasCompletePrivacyNotice
        ? ["privacy_notice_link_or_surface_observed_without_bounded_excerpt"]
        : []),
    ],
    missingCorroborators:
      evidenceObservations.length === 0
        ? ["policy_surface_observation"]
        : hasCompletePrivacyNotice
          ? []
          : ["bounded_privacy_notice_excerpt"],
    demotionReasons: incompleteObservations.length > 0 && !hasCompletePrivacyNotice
      ? ["privacy_notice_observed_without_bounded_excerpt"]
      : [],
    confidence: hasCompletePrivacyNotice
      ? Math.max(0.82, maxPolicyConfidence(completeObservations, 0.82))
      : incompleteObservations.length > 0
        ? Math.min(0.62, maxPolicyConfidence(incompleteObservations, 0.62))
        : 0.2,
    directVsInferred: policyDirectness(evidenceObservations),
    sourceEvidenceRefs: hasCompletePrivacyNotice
      ? evidenceRefsFromPrivacyNoticeSurfaces(completeObservations)
      : evidenceRefsFromPolicySurfaces(evidenceObservations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function hasBoundedFetchedPolicyContent(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const statusSupportsContent = observation.status === "fetched" || observation.status === "observed";
  return statusSupportsContent &&
    Boolean(observation.normalizedUrl ?? observation.url) &&
    Boolean(observation.textExcerpt?.trim()) &&
    (observation.evidenceRefs.length > 0 || observation.boundedTextExcerptIds.length > 0);
}

function evidenceRefsFromPrivacyNoticeSurfaces(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
): EvidenceRef[] {
  return uniqueEvidenceRefs(observations.flatMap((observation) => {
    const refs = [...observation.evidenceRefs];
    const url = observation.normalizedUrl ?? observation.url;
    if (observation.linkText) {
      refs.push({
        refId: `ref_${observation.observationId}_privacy_link`,
        eventType: "policy_surface",
        label: `Privacy notice link: ${observation.linkText.slice(0, 80)}`,
        url,
      });
    }
    if (observation.title) {
      refs.push({
        refId: `ref_${observation.observationId}_privacy_title`,
        eventType: "policy_surface",
        label: `Privacy notice title: ${observation.title.slice(0, 80)}`,
        url,
      });
    }
    if (url) {
      refs.push({
        refId: `ref_${observation.observationId}_privacy_url`,
        eventType: "policy_surface",
        label: `Privacy notice URL: ${hostnameFromUrl(url) ?? "policy surface"}${safePath(pathFromUrl(url) ?? "")}`,
        url,
      });
    }
    if (observation.textExcerpt) {
      refs.push({
        refId: `ref_${observation.observationId}_privacy_excerpt`,
        eventType: "policy_surface",
        label: "Privacy notice bounded text excerpt",
        excerpt: observation.textExcerpt,
      });
    }
    return refs;
  }));
}

function cookiePolicyObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const cookiePolicyObservations = observedPolicySurfaces(bundle).filter((observation) =>
    observation.surfaceType === "cookie_policy" ||
    isCookieNoticeSurfaceFromBoundedText(observation),
  );
  const cookieNoticeReferenceObservations = observedPolicySurfaces(bundle)
    .filter(hasPrivacyPolicyCookieNoticeReferenceEvidence);
  const cookieControlObservations = observedPolicySurfaces(bundle).filter((observation) =>
    observation.surfaceType === "cookie_settings" || observation.surfaceType === "consent_preferences",
  );
  const completeCookiePolicies = cookiePolicyObservations.filter(hasCompleteCookieNoticeEvidence);
  const completeCookieNoticeObservations = [...completeCookiePolicies, ...cookieNoticeReferenceObservations];
  const genericCookieMentions = cookiePolicyObservations.filter((observation) =>
    !completeCookieNoticeObservations.includes(observation) && hasBoundedFetchedPolicyContent(observation)
  );
  const incompleteCookiePolicies = cookiePolicyObservations.filter((observation) =>
    !completeCookieNoticeObservations.includes(observation) && !genericCookieMentions.includes(observation),
  );
  const evidenceObservations = completeCookieNoticeObservations.length > 0
    ? completeCookieNoticeObservations
    : genericCookieMentions.length > 0
      ? genericCookieMentions
      : incompleteCookiePolicies.length > 0
        ? incompleteCookiePolicies
        : cookieControlObservations;
  const hasCompleteCookieNotice = completeCookieNoticeObservations.length > 0;
  const hasGenericCookieMentionOnly = completeCookieNoticeObservations.length === 0 && genericCookieMentions.length > 0;
  const hasCookieControlOnly = cookiePolicyObservations.length === 0 &&
    cookieNoticeReferenceObservations.length === 0 &&
    cookieControlObservations.length > 0;

  return candidate({
    findingKey: "cookie_policy_observed_or_not_observed",
    title: "Cookie policy observed or not observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && evidenceObservations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: [
      ...(cookiePolicyObservations.length > 0 ? ["cookie_policy_surface_observed"] : []),
      ...(cookieNoticeReferenceObservations.length > 0 ? ["privacy_policy_cookie_notice_reference_observed"] : []),
      ...(cookieNoticeReferenceObservations.length > 0 ? ["cookie_notice_reference_bounded_excerpt_retained"] : []),
      ...(hasCompleteCookieNotice ? ["cookie_policy_bounded_excerpt_retained"] : []),
      ...(hasCompleteCookieNotice ? ["cookie_policy_fetch_succeeded"] : []),
      ...(hasGenericCookieMentionOnly ? ["generic_policy_cookie_mention_observed"] : []),
      ...(incompleteCookiePolicies.length > 0 && !hasCompleteCookieNotice
        ? ["cookie_policy_surface_observed_without_bounded_excerpt"]
        : []),
      ...(hasCookieControlOnly ? ["cookie_settings_or_preferences_surface_observed"] : []),
    ],
    missingCorroborators:
      evidenceObservations.length === 0
        ? ["cookie_policy_surface"]
        : hasCompleteCookieNotice
          ? []
          : hasGenericCookieMentionOnly
            ? missingCookieNoticeCorroborators(genericCookieMentions)
            : hasCookieControlOnly
              ? ["bounded_cookie_policy_or_cookie_notice"]
              : ["bounded_cookie_policy_excerpt"],
    demotionReasons: [
      ...(hasGenericCookieMentionOnly ? ["generic_policy_cookie_mention_without_cookie_specific_notice"] : []),
      ...(incompleteCookiePolicies.length > 0 && !hasCompleteCookieNotice
        ? ["cookie_policy_observed_without_bounded_excerpt"]
        : []),
      ...(hasCookieControlOnly ? ["cookie_control_observed_without_cookie_policy"] : []),
    ],
    confidence: hasCompleteCookieNotice
      ? Math.max(0.82, maxPolicyConfidence(completeCookieNoticeObservations, 0.82))
      : genericCookieMentions.length > 0
        ? Math.min(0.62, maxPolicyConfidence(genericCookieMentions, 0.62))
      : incompleteCookiePolicies.length > 0
        ? Math.min(0.58, maxPolicyConfidence(incompleteCookiePolicies, 0.58))
        : cookieControlObservations.length > 0
          ? Math.min(0.58, maxPolicyConfidence(cookieControlObservations, 0.58))
          : 0.2,
    directVsInferred: policyDirectness(evidenceObservations),
    sourceEvidenceRefs: hasCompleteCookieNotice
      ? evidenceRefsFromCookieNoticeSurfaces(completeCookieNoticeObservations)
      : evidenceRefsFromPolicySurfaces(evidenceObservations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function hasCompleteCookieNoticeEvidence(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  return observation.status === "fetched" &&
    hasBoundedFetchedPolicyContent(observation) &&
    hasCookieSpecificSurfaceContext(observation) &&
    hasCookieDisclosureExcerpt(observation);
}

function hasPrivacyPolicyCookieNoticeReferenceEvidence(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  return observation.surfaceType === "privacy_policy" &&
    observation.status === "fetched" &&
    hasBoundedFetchedPolicyContent(observation) &&
    hasCookieNoticeReferenceContext(observation) &&
    hasCookieDisclosureExcerpt(observation);
}

function isCookieNoticeSurfaceFromBoundedText(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  return observation.surfaceType === "privacy_policy" &&
    hasBoundedFetchedPolicyContent(observation) &&
    hasCookieSpecificSurfaceContext(observation) &&
    hasCookieDisclosureExcerpt(observation);
}

function hasCookieSpecificSurfaceContext(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const values = [
    observation.linkText,
    observation.title,
    observation.normalizedUrl,
    observation.url,
    observation.mentionedControls.join(" "),
  ].filter((value): value is string => Boolean(value));
  return values.some((value) =>
    /cookie[-\s]?(policy|notice|statement|declaration)|cookies[-\s]?(policy|notice|statement|declaration)|\/cookies?(?:\/|$|-)|cookie-policy/i.test(value)
  );
}

function hasCookieNoticeReferenceContext(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const cookieTopicObserved = observation.observedTopics.includes("cookies") ||
    observation.mentionedPurposes.some((purpose) => /\bcookies?\b/i.test(purpose)) ||
    observation.mentionedControls.some((control) => /\bcookies?\b/i.test(control));
  return cookieTopicObserved &&
    /cookies?\s+(notice|policy|statement|declaration)|cookie[-\s]?(notice|policy|statement|declaration)/i
      .test(policySurfaceContextText(observation));
}

function hasCookieDisclosureExcerpt(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const excerpt = observation.textExcerpt?.toLowerCase() ?? "";
  return /\bcookies?\b/.test(excerpt) &&
    /\b(analytics|advertis(?:ing|e|ement)?|tracking|storage|preference|essential|necessary|third[-\s]?part(?:y|ies)|consent|withdraw|reject|opt[-\s]?out)\b/.test(excerpt);
}

function missingCookieNoticeCorroborators(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
) {
  return unique([
    ...(observations.some(hasCookieSpecificSurfaceContext) ? [] : ["cookie_specific_notice_surface"]),
    ...(observations.some(hasCookieDisclosureExcerpt) ? [] : ["cookie_storage_tracking_disclosure_excerpt"]),
  ]);
}

function evidenceRefsFromCookieNoticeSurfaces(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
): EvidenceRef[] {
  return uniqueEvidenceRefs(observations.flatMap((observation) => {
    const refs = [...observation.evidenceRefs];
    const url = observation.normalizedUrl ?? observation.url;
    if (observation.linkText) {
      refs.push({
        refId: `ref_${observation.observationId}_cookie_link`,
        eventType: "policy_surface",
        label: `Cookie notice link: ${observation.linkText.slice(0, 80)}`,
        url,
      });
    }
    if (observation.title) {
      refs.push({
        refId: `ref_${observation.observationId}_cookie_title`,
        eventType: "policy_surface",
        label: `Cookie notice title: ${observation.title.slice(0, 80)}`,
        url,
      });
    }
    if (url) {
      refs.push({
        refId: `ref_${observation.observationId}_cookie_url`,
        eventType: "policy_surface",
        label: `Cookie notice URL: ${hostnameFromUrl(url) ?? "policy surface"}${safePath(pathFromUrl(url) ?? "")}`,
        url,
      });
    }
    if (observation.textExcerpt) {
      refs.push({
        refId: `ref_${observation.observationId}_cookie_excerpt`,
        eventType: "policy_surface",
        label: "Cookie notice bounded text excerpt",
        excerpt: observation.textExcerpt,
      });
    }
    return refs;
  }));
}

function policyTopicObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  topic: CanonicalEvidenceBundle["policySurfaceObservations"][number]["observedTopics"][number],
): FindingCandidate {
  const observations = observedPolicySurfaces(bundle).filter((observation) =>
    (topic === "ai_features"
      ? observation.surfaceType === "ai_disclosure" ||
        observation.observedTopics.includes("ai_generated_content")
      : observation.observedTopics.includes(topic)) ||
    (topic === "ai_features" && observation.surfaceType === "ai_disclosure") ||
    (topic === "notice_at_collection" && observation.surfaceType === "notice_at_collection"),
  );
  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && observations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: observations.length > 0 ? [`policy_topic_observed:${topic}`] : [],
    missingCorroborators: observations.length > 0 ? [] : [`policy_topic:${topic}`],
    confidence: observations.length > 0 ? maxPolicyConfidence(observations, 0.68) : 0.2,
    directVsInferred: policyDirectness(observations),
    sourceEvidenceRefs: evidenceRefsFromPolicySurfaces(observations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function gpcDisclosureObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const observations = observedPolicySurfaces(bundle).filter((observation) =>
    isGpcDisclosureSurface(observation),
  );
  const boundedObservations = observations.filter(hasBoundedGpcDisclosureEvidence);
  const incompleteObservations = observations.filter((observation) => !boundedObservations.includes(observation));
  const evidenceObservations = boundedObservations.length > 0 ? boundedObservations : incompleteObservations;
  const hasBoundedDisclosure = boundedObservations.length > 0;
  const hasObservedTopic = observations.some((observation) =>
    observation.observedTopics.includes("global_privacy_control")
  );

  return candidate({
    findingKey: "gpc_disclosure_observed",
    title: "Global Privacy Control disclosure observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && evidenceObservations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: [
      ...(hasObservedTopic ? ["policy_topic_observed:global_privacy_control"] : []),
      ...(observations.length > 0 && !hasObservedTopic ? ["gpc_disclosure_text_or_control_observed"] : []),
      ...(hasBoundedDisclosure ? ["bounded_gpc_disclosure_retained"] : []),
    ],
    missingCorroborators:
      evidenceObservations.length === 0
        ? ["policy_topic:global_privacy_control"]
        : hasBoundedDisclosure ? [] : ["bounded_gpc_disclosure_excerpt"],
    demotionReasons: evidenceObservations.length > 0 && !hasBoundedDisclosure
      ? ["gpc_disclosure_observed_without_bounded_excerpt"]
      : [],
    confidence: hasBoundedDisclosure
      ? Math.max(0.82, maxPolicyConfidence(boundedObservations, 0.82))
      : incompleteObservations.length > 0 ? Math.min(0.62, maxPolicyConfidence(incompleteObservations, 0.62)) : 0.2,
    directVsInferred: policyDirectness(evidenceObservations),
    sourceEvidenceRefs: evidenceRefsFromPolicySurfaces(evidenceObservations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function noticeAtCollectionObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const topicObservations = observedPolicySurfaces(bundle).filter((observation) =>
    observation.observedTopics.includes("notice_at_collection") ||
    observation.surfaceType === "notice_at_collection" ||
    hasCollectionContextualNoticeEvidence(observation),
  );
  const explicitNoticeObservations = topicObservations.filter(isExplicitNoticeAtCollectionSurface);
  const genericPolicyMentions = topicObservations.filter((observation) =>
    !explicitNoticeObservations.includes(observation),
  );
  const evidenceObservations = explicitNoticeObservations.length > 0
    ? explicitNoticeObservations
    : genericPolicyMentions;
  const hasExplicitNotice = explicitNoticeObservations.length > 0;

  return candidate({
    findingKey: "notice_at_collection_observed",
    title: "Notice at Collection observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && evidenceObservations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: [
      ...(hasExplicitNotice ? ["notice_at_collection_surface_observed"] : []),
      ...(topicObservations.some((observation) => observation.observedTopics.includes("notice_at_collection"))
        ? ["notice_at_collection_topic_observed"]
        : []),
      ...(hasExplicitNotice && topicObservations.some((observation) =>
        !observation.observedTopics.includes("notice_at_collection")
      )
        ? ["notice_at_collection_text_or_link_observed"]
        : []),
      ...(genericPolicyMentions.length > 0 && !hasExplicitNotice
        ? ["generic_policy_notice_at_collection_topic"]
        : []),
    ],
    missingCorroborators:
      evidenceObservations.length === 0
        ? ["policy_topic:notice_at_collection"]
        : hasExplicitNotice
          ? []
          : ["contextual_notice_at_collection_surface"],
    demotionReasons: genericPolicyMentions.length > 0 && !hasExplicitNotice
      ? ["generic_policy_text_only_without_contextual_notice_surface"]
      : [],
    confidence: hasExplicitNotice
      ? Math.max(0.82, maxPolicyConfidence(explicitNoticeObservations, 0.82))
      : genericPolicyMentions.length > 0
        ? Math.min(0.62, maxPolicyConfidence(genericPolicyMentions, 0.62))
        : 0.2,
    directVsInferred: policyDirectness(evidenceObservations),
    sourceEvidenceRefs: hasExplicitNotice
      ? evidenceRefsFromNoticeAtCollectionSurfaces(explicitNoticeObservations)
      : evidenceRefsFromPolicySurfaces(evidenceObservations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function isExplicitNoticeAtCollectionSurface(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (observation.surfaceType === "notice_at_collection") {
    return true;
  }
  if (observation.surfaceType === "california_notice" && observation.observedTopics.includes("notice_at_collection")) {
    return true;
  }
  if (hasCollectionContextualNoticeEvidence(observation)) {
    return true;
  }
  return /notice at collection|notice of collection|collection notice/i.test([
    observation.linkText,
    observation.title,
    observation.surroundingTextExcerpt,
    observation.normalizedUrl,
    observation.url,
  ].filter((value): value is string => Boolean(value)).join(" "));
}

function hasCollectionContextualNoticeEvidence(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const labelContext = [
    observation.linkText,
    observation.title,
    observation.normalizedUrl,
    observation.url,
  ].filter((value): value is string => Boolean(value)).join(" ");
  if (/notice[-\s]?(?:at|of)[-\s]?collection|collection[-\s]?notice/i.test(labelContext)) {
    return true;
  }
  if (!hasBoundedFetchedPolicyContent(observation)) {
    return false;
  }
  const text = policySurfaceContextText(observation);
  return /notice at collection|notice of collection|collection notice/i.test(text) &&
    /(?:when|before|at or before|submit|provide|form|checkout|sign[-\s]?up|create an account|categories of|personal information collected|information we collect)/i.test(text);
}

function evidenceRefsFromNoticeAtCollectionSurfaces(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
): EvidenceRef[] {
  return uniqueEvidenceRefs(observations.flatMap((observation) => {
    const refs = [...observation.evidenceRefs];
    const url = observation.normalizedUrl ?? observation.url;
    if (observation.linkText) {
      refs.push({
        refId: `ref_${observation.observationId}_notice_link`,
        eventType: "policy_surface",
        label: `Notice at Collection link: ${observation.linkText.slice(0, 80)}`,
        url,
      });
    }
    if (url) {
      refs.push({
        refId: `ref_${observation.observationId}_notice_url`,
        eventType: "policy_surface",
        label: `Notice at Collection URL: ${hostnameFromUrl(url) ?? "policy surface"}${safePath(pathFromUrl(url) ?? "")}`,
        url,
      });
    }
    if (observation.textExcerpt) {
      refs.push({
        refId: `ref_${observation.observationId}_notice_excerpt`,
        eventType: "policy_surface",
        label: "Notice at Collection bounded text excerpt",
        excerpt: observation.textExcerpt,
      });
    }
    return refs;
  }));
}

function gpcRuntimeProbeWithDisclosureObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const gpcPolicyObservations = observedPolicySurfaces(bundle).filter((observation) =>
    isGpcDisclosureSurface(observation),
  );
  const gpcNetworkEvents = bundle.networkEvents.filter((event) => event.scenario === "gpc_enabled");
  const gpcNetworkEventsWithHeader = gpcNetworkEvents.filter(hasRetainedGpcRequestHeader);
  const gpcJourneys = bundle.observedJourneys.filter((journey) =>
    journey.scenariosObserved.includes("gpc_enabled"),
  );
  const gpcProbeRefs = uniqueEvidenceRefs([
    ...gpcNetworkEvents.slice(0, 6).map((event): EvidenceRef => ({
      refId: `ref_${event.eventId}`,
      eventId: event.eventId,
      eventType: event.eventType,
      label: event.thirdParty
        ? `GPC probe request: ${event.hostname ?? "third-party endpoint"}`
        : "GPC probe request",
    })),
    ...evidenceRefsFromJourneys(gpcJourneys).slice(0, 6),
  ]);
  const policyRefs = evidenceRefsFromPolicySurfaces(gpcPolicyObservations);
  const policyObserved = gpcPolicyObservations.length > 0;
  const boundedPolicyObserved = gpcPolicyObservations.some(hasBoundedGpcDisclosureEvidence);
  const runtimeProbeObserved = gpcProbeRefs.length > 0;
  const gpcRequestHeaderObserved = gpcNetworkEventsWithHeader.length > 0;
  const gpcHandlingRecognitionRefs = gpcHandlingRecognitionEvidenceRefs(bundle);
  const gpcHandlingRecognitionObserved = gpcHandlingRecognitionRefs.length > 0;
  const runtimeRecognitionObserved = runtimeProbeObserved &&
    gpcRequestHeaderObserved &&
    gpcHandlingRecognitionObserved;

  return candidate({
    findingKey: "gpc_runtime_probe_with_disclosure_observed",
    title: "GPC runtime probe with disclosure observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) &&
      moduleSet.has(CONSENT_FLOW_MODULE) &&
      runtimeProbeObserved &&
      (policyObserved || runtimeRecognitionObserved),
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE) || !moduleSet.has(CONSENT_FLOW_MODULE),
    deferredReason: !moduleSet.has(POLICY_SURFACE_MODULE)
      ? "required_policy_surface_module_not_run"
      : !moduleSet.has(CONSENT_FLOW_MODULE)
      ? "required_gpc_runtime_probe_module_not_run"
      : undefined,
    matchedCriteria: [
      ...(policyObserved ? ["gpc_policy_disclosure_observed"] : []),
      ...(boundedPolicyObserved ? ["bounded_gpc_disclosure_retained"] : []),
      ...(runtimeProbeObserved ? ["gpc_enabled_runtime_probe_retained"] : []),
      ...(gpcRequestHeaderObserved ? ["gpc_request_header_marker_retained"] : []),
      ...(gpcHandlingRecognitionObserved ? ["gpc_handling_recognition_proof_retained"] : []),
    ],
    missingCorroborators: [
      ...(!policyObserved ? ["gpc_policy_disclosure"] : []),
      ...(policyObserved && !boundedPolicyObserved ? ["bounded_gpc_disclosure_excerpt"] : []),
      ...(!runtimeProbeObserved ? ["gpc_enabled_runtime_probe"] : []),
      ...(runtimeProbeObserved && !gpcRequestHeaderObserved ? ["gpc_request_header_marker"] : []),
      ...(runtimeProbeObserved && !gpcHandlingRecognitionObserved ? ["gpc_handling_recognition_proof"] : []),
    ],
    demotionReasons: gpcHandlingRecognitionObserved ? [] : ["review_signal_only_no_gpc_honored_conclusion"],
    confidence: boundedPolicyObserved && runtimeProbeObserved && gpcRequestHeaderObserved && gpcHandlingRecognitionObserved
      ? Math.max(0.86, maxPolicyConfidence(gpcPolicyObservations, 0.74))
      : boundedPolicyObserved && runtimeProbeObserved && gpcRequestHeaderObserved
        ? Math.min(0.74, maxPolicyConfidence(gpcPolicyObservations, 0.74))
      : policyObserved && runtimeProbeObserved ? Math.min(0.68, maxPolicyConfidence(gpcPolicyObservations, 0.68))
        : runtimeRecognitionObserved ? 0.66
        : policyObserved ? Math.min(0.62, maxPolicyConfidence(gpcPolicyObservations, 0.62)) : 0.2,
    directVsInferred: (boundedPolicyObserved && runtimeProbeObserved && gpcRequestHeaderObserved) || runtimeRecognitionObserved
      ? "direct"
      : policyDirectness(gpcPolicyObservations),
    sourceEvidenceRefs: uniqueEvidenceRefs([...policyRefs, ...gpcProbeRefs, ...gpcHandlingRecognitionRefs]).slice(0, 8),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE, CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function hasBoundedGpcDisclosureEvidence(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  const excerpt = observation.textExcerpt?.toLowerCase() ?? "";
  return observation.status === "fetched" &&
    hasBoundedFetchedPolicyContent(observation) &&
    /global privacy control|\bgpc\b|opt[-\s]?out preference signal/.test(excerpt) &&
    /opt[-\s]?out|sale|share|targeted advertising|preference signal|privacy control/.test(excerpt);
}

function isGpcDisclosureSurface(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  if (observation.observedTopics.includes("global_privacy_control")) {
    return true;
  }
  if (observation.mentionedControls.some((control) => /global privacy control|\bgpc\b/i.test(control))) {
    return true;
  }
  return hasBoundedGpcDisclosureEvidence(observation);
}

function hasRetainedGpcRequestHeader(
  event: CanonicalEvidenceBundle["networkEvents"][number],
): boolean {
  return event.requestHeaders?.secGpc === "1";
}

function gpcHandlingRecognitionEvidenceRefs(bundle: CanonicalEvidenceBundle): EvidenceRef[] {
  const uiRecognitionRefs = bundle.consentFlowObservations
    .filter((observation) =>
      observation.scenario === "gpc_enabled" &&
      explicitGpcHandlingRecognitionText(observation.textExcerpt)
    )
    .flatMap((observation) =>
      observation.evidenceRefs.length > 0
        ? observation.evidenceRefs
        : [{
          refId: `ref_${observation.observationId}_gpc_recognition`,
          eventType: "consent_ui",
          label: "GPC handling recognition text",
          excerpt: observation.textExcerpt,
        } satisfies EvidenceRef]
    );
  const comparisonRefs = bundle.consentFlowComparisons
    .filter(gpcComparisonShowsSuppression)
    .flatMap((comparison) =>
      comparison.evidenceRefs.length > 0
        ? comparison.evidenceRefs.slice(0, 4).map((ref) => ({
          ...ref,
          label: ref.label ?? "GPC comparison suppression evidence",
        }))
        : [{
          refId: `ref_${comparison.comparisonId}_gpc_suppression`,
          eventType: "consent_comparison",
          label: "GPC comparison suppression evidence",
        } satisfies EvidenceRef]
    );
  return uniqueEvidenceRefs([...uiRecognitionRefs, ...comparisonRefs]);
}

function explicitGpcHandlingRecognitionText(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  return /global privacy control|\bgpc\b/.test(normalized) &&
    /honou?r|recogniz|detected|received|enabled|applied|opt[-\s]?out|preference signal/.test(normalized);
}

function gpcComparisonShowsSuppression(
  comparison: CanonicalEvidenceBundle["consentFlowComparisons"][number],
): boolean {
  return comparison.comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" &&
    comparison.comparableMeasurement?.comparable === true &&
    (
      comparison.vendorsSuppressedAfterGpc.length > 0 ||
      comparison.cookiesSuppressedAfterGpc.length > 0 ||
      comparison.collectionEndpointsSuppressedAfterGpc.length > 0
    );
}

function policyVendorMentionsObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const observations = observedPolicySurfaces(bundle).filter((observation) => observation.mentionedVendors.length > 0);
  return candidate({
    findingKey: "policy_vendor_mentions_observed",
    title: "Policy vendor mentions observed",
    eligible: moduleSet.has(POLICY_SURFACE_MODULE) && observations.length > 0,
    deferred: !moduleSet.has(POLICY_SURFACE_MODULE),
    matchedCriteria: observations.length > 0 ? ["policy_vendor_mentions_observed"] : [],
    missingCorroborators: observations.length > 0 ? [] : ["policy_vendor_mentions"],
    confidence: observations.length > 0 ? maxPolicyConfidence(observations, 0.72) : 0.2,
    directVsInferred: policyDirectness(observations),
    sourceEvidenceRefs: evidenceRefsFromPolicySurfaces(observations),
    relatedVendors: [],
    sourceModulesRequired: [POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function policyRuntimeVendorAlignmentReviewSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const policyRan = moduleSet.has(POLICY_SURFACE_MODULE);
  const runtimeRan = moduleSet.has(PRE_CONSENT_MODULE);
  const observedPolicy = observedPolicySurfaces(bundle);
  const policyObservationsWithVendors = observedPolicy.filter((observation) => observation.mentionedVendors.length > 0);
  const disclosureRelevantRuntimeVendors = bundle.normalizedVendorObservations.filter(isDisclosureRelevantRuntimeVendor);
  const runtimeVendorIdentities = disclosureRelevantRuntimeVendors.map(runtimeVendorIdentity);
  const runtimeVendorNames = unique(runtimeVendorIdentities.map((identity) => identity.displayName));
  const policyVendorNames = unique(observedPolicy.flatMap((observation) => observation.mentionedVendors));
  const matched = runtimeVendorIdentities.filter((vendor) =>
    policyVendorNames.some((policyVendor) => vendor.aliases.some((alias) => sameVendorName(alias, policyVendor)))
  );
  const unmatched = runtimeVendorIdentities.filter((vendor) =>
    !matched.some((match) => sameVendorName(vendor.displayName, match.displayName))
  );
  const hasObservedPolicySurface = observedPolicy.length > 0;
  const hasPolicyVendorMentions = policyVendorNames.length > 0;
  const hasRuntimePolicyVendorOverlap = matched.length > 0;
  const hasBoundedPolicyVendorEvidence = policyObservationsWithVendors.some(hasFetchedBoundedPolicyText);
  const strongAlignmentEvidence = policyRan &&
    runtimeRan &&
    hasObservedPolicySurface &&
    runtimeVendorNames.length > 0 &&
    hasPolicyVendorMentions &&
    hasRuntimePolicyVendorOverlap &&
    hasBoundedPolicyVendorEvidence;
  return candidate({
    findingKey: "policy_runtime_vendor_alignment_review_signal",
    title: "Policy/runtime vendor alignment review signal",
    eligible: policyRan && runtimeRan && hasObservedPolicySurface && (runtimeVendorNames.length > 0 || policyVendorNames.length > 0),
    deferred: !policyRan || !runtimeRan,
    matchedCriteria: [
      ...(matched.length > 0 ? ["runtime_vendor_mentioned_in_policy"] : []),
      ...(unmatched.length > 0 ? ["runtime_vendor_not_matched_to_policy_mention_review_signal"] : []),
      ...(policyVendorNames.length > 0 ? ["policy_vendor_mentions_present"] : []),
      ...(hasBoundedPolicyVendorEvidence ? ["bounded_policy_vendor_excerpt_retained"] : []),
      ...(strongAlignmentEvidence ? ["policy_runtime_vendor_alignment_evidence_retained"] : []),
    ],
    missingCorroborators: policyRan && runtimeRan
      ? hasObservedPolicySurface
        ? [
          ...(runtimeVendorNames.length > 0 ? [] : ["disclosure_relevant_runtime_vendor"]),
          ...(hasPolicyVendorMentions ? [] : ["policy_vendor_mentions"]),
          ...(hasPolicyVendorMentions && runtimeVendorNames.length > 0 && !hasRuntimePolicyVendorOverlap
            ? ["runtime_policy_vendor_overlap"]
            : []),
          ...(hasPolicyVendorMentions && hasRuntimePolicyVendorOverlap && !hasBoundedPolicyVendorEvidence
            ? ["bounded_policy_vendor_excerpt"]
            : []),
        ]
        : ["observed_policy_surface"]
      : ["runtime_and_policy_surface_modules"],
    demotionReasons: ["review_signal_only_no_disclosure_gap_conclusion"],
    confidence: strongAlignmentEvidence
      ? 0.82
      : hasRuntimePolicyVendorOverlap ? 0.68 : policyRan && runtimeRan && hasObservedPolicySurface ? 0.58 : 0.2,
    directVsInferred: strongAlignmentEvidence ? "mixed" : "inferred",
    sourceEvidenceRefs: uniqueEvidenceRefs([
      ...evidenceRefsFromPolicySurfaces(policyObservationsWithVendors),
      ...evidenceRefsFromVendorObservations(bundle, disclosureRelevantRuntimeVendors),
    ]),
    relatedVendors: disclosureRelevantRuntimeVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE],
    sourceModulesPresent,
  });
}

function isDisclosureRelevantRuntimeVendor(vendor: NormalizedVendorObservation) {
  return [
    "analytics",
    "advertising",
    "targeted_advertising",
    "session_replay",
    "tag_management",
  ].includes(vendor.purpose);
}

function runtimeVendorIdentity(vendor: NormalizedVendorObservation) {
  const aliases = unique([
    vendor.product,
    vendor.vendor,
    vendor.entity,
  ].filter((value): value is string => Boolean(value)));
  return {
    aliases,
    displayName: vendor.product ?? vendor.vendor,
  };
}

function hasFetchedBoundedPolicyText(
  observation: CanonicalEvidenceBundle["policySurfaceObservations"][number],
) {
  return observation.status === "fetched" &&
    Boolean(observation.textExcerpt || observation.boundedTextExcerptIds.length > 0 ||
      observation.evidenceRefs.some((ref) => Boolean(ref.excerpt)));
}

function consentControlObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  actionType: CanonicalEvidenceBundle["consentActionCandidates"][number]["actionType"],
): FindingCandidate {
  const candidates = bundle.consentActionCandidates.filter((candidate) =>
    candidate.actionType === actionType && candidate.visible && candidate.enabled,
  );
  if (actionType === "reject_all") {
    return rejectControlObservedOrNotObserved(bundle, sourceModulesPresent, moduleSet, findingKey, title, candidates);
  }
  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(CONSENT_FLOW_MODULE) && candidates.length > 0,
    deferred: !moduleSet.has(CONSENT_FLOW_MODULE),
    matchedCriteria: candidates.length > 0 ? [`consent_control_observed:${actionType}`] : [],
    missingCorroborators: candidates.length > 0 ? [] : [`consent_control:${actionType}`],
    confidence: candidates.length > 0 ? Math.max(...candidates.map((item) => item.confidence)) : 0.2,
    directVsInferred: candidates.some((item) => item.detectionMethod === "nano_assisted_ui_classification") ? "mixed" : "direct",
    sourceEvidenceRefs: uniqueEvidenceRefs(candidates.flatMap((item) => item.evidenceRefs)),
    relatedVendors: [],
    sourceModulesRequired: [CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function rejectControlObservedOrNotObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  candidates: CanonicalEvidenceBundle["consentActionCandidates"],
): FindingCandidate {
  const surfaceClass = classifyConsentSurfaceEvidence(bundle.consentUiObservations[0], actionableConsentSurfaceCandidates(bundle));
  const reliableCandidates = candidates.filter(isReliableRejectControlCandidate);
  const weakCandidates = candidates.filter((candidate) => !reliableCandidates.includes(candidate));
  const attempts = bundle.consentActionAttempts.filter((attempt) => attempt.actionType === "reject_all");
  const successfulDirectAttempt = attempts.some((attempt) =>
    attempt.attempted &&
    attempt.succeeded &&
    attempt.actionProof?.actionPath === "direct_action",
  );
  const successfulPreferenceCenterAttempt = attempts.some((attempt) =>
    attempt.attempted &&
    attempt.succeeded &&
    attempt.preferenceCenterTraversal?.succeeded === true,
  );
  const context = rejectPathContext(surfaceClass, successfulDirectAttempt, successfulPreferenceCenterAttempt, reliableCandidates);
  const observed = reliableCandidates.length > 0 || successfulDirectAttempt || successfulPreferenceCenterAttempt;
  const weakCandidateOnly = !observed && weakCandidates.length > 0;

  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(CONSENT_FLOW_MODULE) && observed,
    deferred: !moduleSet.has(CONSENT_FLOW_MODULE),
    matchedCriteria: [
      ...(observed ? ["consent_control_observed:reject_all"] : []),
      ...(observed ? [`reject_path_context:${context}`] : []),
      ...(successfulDirectAttempt ? ["first_layer_reject_action_proof_retained"] : []),
      ...(successfulPreferenceCenterAttempt ? ["preference_center_reject_path_proof_retained"] : []),
      ...(weakCandidateOnly ? ["low_confidence_reject_control_candidate_observed"] : []),
    ],
    missingCorroborators: observed
      ? rejectControlMissingCorroborators(context)
      : weakCandidateOnly ? ["confident_consent_control:reject_all"] : ["consent_control:reject_all"],
    demotionReasons: [
      ...rejectControlDemotionReasons(context),
      ...(weakCandidateOnly ? ["reject_control_candidate_below_confidence_floor"] : []),
    ],
    confidence: observed
      ? rejectControlConfidence(reliableCandidates, context)
      : weakCandidateOnly ? Math.max(...weakCandidates.map((item) => item.confidence)) : 0.2,
    directVsInferred: context === "direct_first_layer" || context === "preference_center_proven" ? "direct" : "mixed",
    sourceEvidenceRefs: rejectControlEvidenceRefs(observed ? reliableCandidates : weakCandidates, attempts, context),
    relatedVendors: [],
    sourceModulesRequired: [CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function isReliableRejectControlCandidate(
  candidate: CanonicalEvidenceBundle["consentActionCandidates"][number],
) {
  return candidate.confidence >= 0.5 || candidate.shouldClick === true;
}

type RejectPathContext =
  | "direct_first_layer"
  | "preference_center_proven"
  | "preference_control_only"
  | "no_initial_surface_context";

function rejectPathContext(
  surfaceClass: ConsentSurfaceEvidenceClass,
  successfulDirectAttempt: boolean,
  successfulPreferenceCenterAttempt: boolean,
  candidates: CanonicalEvidenceBundle["consentActionCandidates"],
): RejectPathContext {
  if (successfulPreferenceCenterAttempt) {
    return "preference_center_proven";
  }
  if (surfaceClass === "actionable_banner" || successfulDirectAttempt) {
    return "direct_first_layer";
  }
  const hasPreferenceOnlyContext = surfaceClass === "preference_control_only" ||
    candidates.some((candidate) => /preference|settings/i.test(candidate.contextTextExcerpt ?? candidate.labelText));
  return hasPreferenceOnlyContext ? "preference_control_only" : "no_initial_surface_context";
}

function rejectControlMissingCorroborators(context: RejectPathContext) {
  switch (context) {
    case "direct_first_layer":
    case "preference_center_proven":
      return [];
    case "preference_control_only":
      return ["first_layer_reject_control_or_preference_center_reject_path_proof"];
    case "no_initial_surface_context":
      return ["initial_consent_surface_context"];
  }
}

function rejectControlDemotionReasons(context: RejectPathContext) {
  switch (context) {
    case "preference_control_only":
      return ["reject_control_observed_without_completed_preference_center_path"];
    case "no_initial_surface_context":
      return ["reject_control_observed_without_initial_consent_surface_context"];
    default:
      return [];
  }
}

function rejectControlConfidence(
  candidates: CanonicalEvidenceBundle["consentActionCandidates"],
  context: RejectPathContext,
) {
  const base = candidates.length > 0 ? Math.max(...candidates.map((item) => item.confidence)) : 0.82;
  if (context === "direct_first_layer") {
    return Math.max(base, 0.84);
  }
  if (context === "preference_center_proven") {
    return Math.max(base, 0.82);
  }
  if (context === "preference_control_only") {
    return Math.min(base, 0.68);
  }
  return Math.min(base, 0.62);
}

function rejectControlEvidenceRefs(
  candidates: CanonicalEvidenceBundle["consentActionCandidates"],
  attempts: CanonicalEvidenceBundle["consentActionAttempts"],
  context: RejectPathContext,
) {
  return uniqueEvidenceRefs([
    ...candidates.flatMap((item) => [
      ...item.evidenceRefs,
      ...consentActionCandidateSummaryRefs(item),
    ]),
    ...(context === "preference_center_proven"
      ? attempts.flatMap((attempt) => [
        ...attempt.evidenceRefs,
        ...(attempt.actionProof?.evidenceRefs ?? []),
        ...(attempt.preferenceCenterTraversal?.evidenceRefs ?? []),
      ])
      : []),
  ]);
}

function consentActionSucceededOrNotTestable(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  actionType: CanonicalEvidenceBundle["consentActionAttempts"][number]["actionType"],
): FindingCandidate {
  const attempts = bundle.consentActionAttempts.filter((attempt) => attempt.actionType === actionType);
  const succeeded = attempts.some((attempt) => attempt.attempted && attempt.succeeded);
  const attempted = attempts.some((attempt) => attempt.attempted);
  const succeededViaPreferenceCenter = attempts.some((attempt) =>
    attempt.attempted && attempt.succeeded && attempt.viaPreferenceCenter,
  );
  const directRejectActionProof = actionType === "reject_all" && attempts.some((attempt) =>
    attempt.attempted &&
    attempt.succeeded &&
    attempt.actionProof?.actionPath === "direct_action" &&
    attempt.actionProof.candidateObserved,
  );
  const preferenceCenterRejectPathProof = actionType === "reject_all" && attempts.some((attempt) =>
    attempt.attempted &&
    attempt.succeeded &&
    attempt.preferenceCenterTraversal?.succeeded === true,
  );
  const rejectActionPathProof = actionType !== "reject_all" || directRejectActionProof || preferenceCenterRejectPathProof;
  const manageOnly = actionType === "reject_all" &&
    bundle.consentActionCandidates.some((candidate) => candidate.actionType === "manage_preferences") &&
    attempts.length > 0 &&
    !succeeded;
  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(CONSENT_FLOW_MODULE) && succeeded,
    deferred: !moduleSet.has(CONSENT_FLOW_MODULE),
    matchedCriteria: [
      ...(attempted ? [`consent_action_attempted:${actionType}`] : []),
      ...(succeeded ? [`consent_action_succeeded:${actionType}`] : []),
      ...(succeededViaPreferenceCenter ? [`consent_action_succeeded_via_preference_center:${actionType}`] : []),
      ...(directRejectActionProof ? ["first_layer_reject_action_proof_retained"] : []),
      ...(preferenceCenterRejectPathProof ? ["preference_center_reject_path_proof_retained"] : []),
    ],
    missingCorroborators: succeeded
      ? rejectActionPathProof ? [] : ["reject_action_path_proof"]
      : [
        `successful_action:${actionType}`,
        ...(manageOnly ? ["preference_center_reject_path_completed"] : []),
      ],
    demotionReasons: moduleSet.has(CONSENT_FLOW_MODULE) && attempts.length > 0
      ? succeeded
        ? rejectActionPathProof ? [] : ["reject_action_succeeded_without_path_context"]
        : [
        "action_not_testable_or_not_successful",
        ...(manageOnly ? ["manage_preferences_observed_without_completed_reject_path"] : []),
        ]
      : [],
    confidence: succeeded
      ? rejectActionPathProof ? 0.82 : 0.72
      : attempted ? 0.45 : 0.2,
    directVsInferred: "direct",
    sourceEvidenceRefs: uniqueEvidenceRefs(attempts.flatMap((attempt) => [
      ...attempt.evidenceRefs,
      ...(attempt.actionProof?.evidenceRefs ?? []),
      ...(attempt.preferenceCenterTraversal?.evidenceRefs ?? []),
    ])),
    relatedVendors: [],
    sourceModulesRequired: [CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function postChoiceConsentControlObserved(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const preferenceCenterAttempts = bundle.consentActionAttempts.filter((attempt) =>
    attempt.viaPreferenceCenter === true &&
    attempt.preferenceCenterTraversal?.openSucceeded === true &&
    attempt.preferenceCenterTraversal.secondLayerObserved === true
  );
  const successfulPreferenceCenterAttempts = preferenceCenterAttempts.filter((attempt) =>
    attempt.attempted &&
    attempt.succeeded &&
    attempt.preferenceCenterTraversal?.succeeded === true
  );
  const evidenceAttempts = successfulPreferenceCenterAttempts.length > 0
    ? successfulPreferenceCenterAttempts
    : preferenceCenterAttempts;

  return candidate({
    findingKey: "post_choice_consent_control_observed",
    title: "Post-choice consent control observed",
    eligible: moduleSet.has(CONSENT_FLOW_MODULE) && successfulPreferenceCenterAttempts.length > 0,
    deferred: !moduleSet.has(CONSENT_FLOW_MODULE),
    matchedCriteria: [
      ...(preferenceCenterAttempts.length > 0 ? ["preference_center_opened"] : []),
      ...(successfulPreferenceCenterAttempts.length > 0 ? ["preference_center_action_succeeded"] : []),
    ],
    missingCorroborators: successfulPreferenceCenterAttempts.length > 0
      ? []
      : ["successful_preference_center_interaction"],
    confidence: successfulPreferenceCenterAttempts.length > 0
      ? Math.max(...successfulPreferenceCenterAttempts.map((attempt) => attempt.preferenceCenterTraversal?.confidence ?? 0.82))
      : 0.2,
    directVsInferred: preferenceCenterAttempts.length > 0 ? "direct" : "unknown",
    sourceEvidenceRefs: uniqueEvidenceRefs(evidenceAttempts.flatMap((attempt) => [
      ...attempt.evidenceRefs,
      ...(attempt.actionProof?.evidenceRefs ?? []),
      ...(attempt.preferenceCenterTraversal?.evidenceRefs ?? []),
    ])),
    relatedVendors: [],
    sourceModulesRequired: [CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function consentComparisonSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
  findingKey: string,
  title: string,
  predicate: (comparison: CanonicalEvidenceBundle["consentFlowComparisons"][number]) => boolean,
): FindingCandidate {
  const matchingComparisons = bundle.consentFlowComparisons.filter(predicate);
  const comparisons = matchingComparisons.filter((comparison) =>
    comparison.confidence >= 0.78 &&
    comparison.coverageLimitations.length === 0 &&
    comparison.comparableMeasurement?.comparable === true &&
    consentComparisonHasRequiredActionProof(bundle, findingKey, comparison),
  );
  const evidenceComparisons = comparisons.length > 0 ? comparisons : matchingComparisons;
  const relatedVendors = consentComparisonRelatedVendors(bundle, evidenceComparisons);
  return candidate({
    findingKey,
    title,
    eligible: moduleSet.has(CONSENT_FLOW_MODULE) && comparisons.length > 0,
    deferred: !moduleSet.has(CONSENT_FLOW_MODULE),
    matchedCriteria: matchingComparisons.length > 0
      ? [
        ...consentComparisonMatchedCriteria(matchingComparisons, comparisons.length > 0),
        ...(findingKey === "accept_reject_runtime_delta_observed" && comparisons.length > 0
          ? ["successful_accept_and_reject_actions"]
          : []),
      ]
      : [],
    missingCorroborators: comparisons.length > 0
      ? []
      : matchingComparisons.length > 0
      ? [
        "confident_successful_consent_action_comparison",
        ...(findingKey === "accept_reject_runtime_delta_observed"
          ? ["successful_accept_and_reject_actions"]
          : []),
        ...(matchingComparisons.some((comparison) => !comparison.comparableMeasurement)
          ? ["comparable_pre_post_measurement_window"]
          : []),
      ]
      : ["consent_flow_comparable_delta"],
    demotionReasons: [
      "review_signal_only_no_gap_conclusion",
      ...(matchingComparisons.length > 0 && comparisons.length === 0
        ? ["comparison_not_confidently_testable"]
        : []),
      ...(findingKey === "accept_reject_runtime_delta_observed" &&
        matchingComparisons.length > 0 &&
        !matchingComparisons.some((comparison) =>
          consentComparisonHasRequiredActionProof(bundle, findingKey, comparison),
        )
        ? ["accept_reject_actions_not_both_successful"]
        : []),
      ...(matchingComparisons.some((comparison) => comparison.comparableMeasurement?.comparable === false)
        ? ["comparison_windows_not_comparable"]
        : []),
      ...(matchingComparisons.some((comparison) => !comparison.comparableMeasurement)
        ? ["comparison_measurement_metadata_missing"]
        : []),
    ],
    confidence: comparisons.length > 0
      ? confidenceForConsentComparisonSignal(findingKey, comparisons)
      : matchingComparisons.length > 0 ? Math.max(...matchingComparisons.map((comparison) => comparison.confidence)) : 0.2,
    directVsInferred: "inferred",
    sourceEvidenceRefs: uniqueEvidenceRefs([
      ...(findingKey === "accept_reject_runtime_delta_observed"
        ? acceptRejectActionProofEvidenceRefs(bundle)
        : []),
      ...evidenceComparisons.flatMap(consentComparisonEvidenceRefs),
    ]),
    relatedVendors,
    sourceModulesRequired: [CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function postOptOutTargetedAdvertisingBehaviorSignal(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
  moduleSet: Set<string>,
): FindingCandidate {
  const matchingComparisons = bundle.consentFlowComparisons.filter((comparison) =>
    isPostOptOutAdvertisingComparison(comparison) &&
    comparisonHasAdvertisingPostOptOutEvidence(bundle, comparison),
  );
  const comparisons = matchingComparisons.filter((comparison) =>
    isConfidentPostOptOutComparison(bundle, comparison),
  );
  const hasCcpaOptOutProof = hasCcpaPostOptOutProof(bundle);
  const hasBoundedReviewEvidence = hasCcpaOptOutProof && matchingComparisons.length > 0;
  const evidenceComparisons = comparisons.length > 0 ? comparisons : matchingComparisons;
  const comparisonEvidenceRefs = hasCcpaOptOutProof && evidenceComparisons.length > 0
    ? uniqueEvidenceRefs(evidenceComparisons.flatMap(consentComparisonEvidenceRefs))
      .slice(0, MAX_POST_OPT_OUT_COMPARISON_EVIDENCE_REFS)
    : [];
  const relatedVendors = consentComparisonRelatedVendors(bundle, evidenceComparisons).filter((vendor) =>
    vendor.purpose === "advertising",
  );

  return candidate({
    findingKey: "post_opt_out_targeted_advertising_behavior_signal",
    title: "Post-opt-out targeted advertising behavior signal",
    eligible: moduleSet.has(PRE_CONSENT_MODULE) &&
      moduleSet.has(CONSENT_FLOW_MODULE) &&
      (comparisons.length > 0 || hasBoundedReviewEvidence),
    deferred: !moduleSet.has(PRE_CONSENT_MODULE) || !moduleSet.has(CONSENT_FLOW_MODULE),
    deferredReason: !moduleSet.has(PRE_CONSENT_MODULE)
      ? "required_pre_consent_runtime_module_not_run"
      : !moduleSet.has(CONSENT_FLOW_MODULE)
      ? "required_consent_flow_module_not_run"
      : undefined,
    matchedCriteria: matchingComparisons.length > 0
      ? [
        "advertising_purpose_post_opt_out_comparison",
        ...consentComparisonMatchedCriteria(matchingComparisons, comparisons.length > 0),
        ...(matchingComparisons.some((comparison) => comparisonHasAdvertisingPersistence(bundle, comparison))
          ? ["advertising_signal_persisted_after_opt_out"]
          : []),
        ...(matchingComparisons.some((comparison) => comparisonHasAdvertisingSuppression(bundle, comparison))
          ? ["advertising_signal_suppressed_after_opt_out"]
          : []),
        ...(hasCcpaOptOutProof ? ["ccpa_opt_out_or_gpc_probe_proof_retained"] : []),
      ]
      : [],
    missingCorroborators: comparisons.length > 0
      ? []
      : matchingComparisons.length > 0
      ? [
        "confident_successful_post_opt_out_advertising_comparison",
        ...(hasCcpaOptOutProof ? [] : ["ccpa_opt_out_or_gpc_probe_proof"]),
      ]
      : ["advertising_purpose_post_opt_out_comparison"],
    demotionReasons: [
      "review_signal_only_no_opt_out_honored_conclusion",
      ...(matchingComparisons.length > 0 && comparisons.length === 0
        ? ["comparison_not_confidently_testable"]
        : []),
      ...(matchingComparisons.length > 0 && !hasCcpaOptOutProof
        ? ["ccpa_opt_out_or_gpc_probe_proof_missing"]
        : []),
    ],
    confidence: comparisons.length > 0
      ? Math.max(0.82, ...comparisons.map((comparison) => comparison.confidence))
      : matchingComparisons.length > 0 ? Math.max(...matchingComparisons.map((comparison) => comparison.confidence)) : 0.2,
    directVsInferred: comparisons.length > 0 ? "direct" : matchingComparisons.length > 0 ? "inferred" : "unknown",
    sourceEvidenceRefs: uniqueEvidenceRefs([
      ...ccpaPostOptOutProofEvidenceRefs(bundle),
      ...comparisonEvidenceRefs,
    ]),
    relatedVendors,
    sourceModulesRequired: [PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE],
    sourceModulesPresent,
  });
}

function confidenceForConsentComparisonSignal(
  findingKey: string,
  comparisons: ConsentFlowComparison[],
): number {
  const baseConfidence = Math.max(...comparisons.map((comparison) => comparison.confidence));
  if (findingKey === "accept_reject_runtime_delta_observed") {
    return Math.max(baseConfidence, 0.82);
  }
  if (!isPostRejectComparisonFinding(findingKey)) {
    return baseConfidence;
  }
  const highConfidencePostRejectComparison = comparisons.some((comparison) =>
    comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject" &&
    comparison.comparableMeasurement?.comparable === true &&
    isConfidentSuccessfulConsentComparison(comparison),
  );
  return highConfidencePostRejectComparison ? Math.max(baseConfidence, 0.82) : baseConfidence;
}

function consentComparisonHasRequiredActionProof(
  bundle: CanonicalEvidenceBundle,
  findingKey: string,
  comparison: ConsentFlowComparison,
): boolean {
  if (findingKey !== "accept_reject_runtime_delta_observed") {
    return true;
  }
  return comparison.comparedScenarios === "after_reject_vs_after_accept" &&
    hasSuccessfulConsentActionAttempt(bundle, "accept_all") &&
    hasSuccessfulConsentActionAttempt(bundle, "reject_all") &&
    comparison.comparableMeasurement?.rejectActionEvent?.attempted === true &&
    comparison.comparableMeasurement.rejectActionEvent.succeeded === true &&
    comparison.comparableMeasurement.rejectActionEvent.proofAvailable === true;
}

function hasSuccessfulConsentActionAttempt(
  bundle: CanonicalEvidenceBundle,
  actionType: CanonicalEvidenceBundle["consentActionAttempts"][number]["actionType"],
): boolean {
  return bundle.consentActionAttempts.some((attempt) =>
    attempt.actionType === actionType &&
    attempt.attempted &&
    attempt.succeeded &&
    attempt.actionProof?.attemptedStatus === "attempted_succeeded",
  );
}

function acceptRejectActionProofEvidenceRefs(bundle: CanonicalEvidenceBundle): EvidenceRef[] {
  const attempts = bundle.consentActionAttempts.filter((attempt) =>
    (attempt.actionType === "accept_all" || attempt.actionType === "reject_all") &&
    attempt.attempted &&
    attempt.succeeded &&
    attempt.actionProof?.attemptedStatus === "attempted_succeeded",
  );
  return uniqueEvidenceRefs(attempts.flatMap((attempt) => [
    ...attempt.evidenceRefs,
    ...(attempt.actionProof?.evidenceRefs ?? []),
  ]));
}

function isPostRejectComparisonFinding(findingKey: string): boolean {
  return findingKey === "tracking_after_refusal_review_signal" ||
    findingKey === "reject_did_not_reduce_tracking_review_signal" ||
    findingKey === "vendors_persist_after_reject_review_signal" ||
    findingKey === "cookies_persist_after_reject_review_signal";
}

function isConfidentSuccessfulConsentComparison(comparison: ConsentFlowComparison): boolean {
  const rejectAction = comparison.comparableMeasurement?.rejectActionEvent;
  return comparison.confidence >= 0.78 &&
    comparison.coverageLimitations.length === 0 &&
    comparison.comparableMeasurement?.comparable === true &&
    rejectAction?.attempted === true &&
    rejectAction.succeeded === true &&
    rejectAction.proofAvailable === true;
}

function isConfidentPostOptOutComparison(
  bundle: CanonicalEvidenceBundle,
  comparison: ConsentFlowComparison,
): boolean {
  return comparison.confidence >= 0.78 &&
    comparison.coverageLimitations.length === 0 &&
    comparisonHasAdvertisingPostOptOutEvidence(bundle, comparison) &&
    hasCcpaPostOptOutProof(bundle) &&
    (isConfidentSuccessfulConsentComparison(comparison) ||
      hasRetainedSuccessfulCcpaPostOptOutAttempt(bundle) ||
      hasRetainedGpcProbe(bundle));
}

function isPostOptOutAdvertisingComparison(comparison: ConsentFlowComparison): boolean {
  return comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject" ||
    comparison.comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out";
}

function hasCcpaPostOptOutProof(bundle: CanonicalEvidenceBundle): boolean {
  return hasRetainedSuccessfulCcpaPostOptOutAttempt(bundle) || hasRetainedGpcProbe(bundle);
}

function hasRetainedSuccessfulCcpaPostOptOutAttempt(bundle: CanonicalEvidenceBundle): boolean {
  return bundle.consentActionAttempts.some((attempt) =>
    attempt.actionType === "do_not_sell_share" &&
    attempt.attempted === true &&
    attempt.succeeded === true &&
    attempt.actionProof?.attemptedStatus === "attempted_succeeded"
  );
}

function hasRetainedGpcProbe(bundle: CanonicalEvidenceBundle): boolean {
  return bundle.networkEvents.some((event) => event.scenario === "gpc_enabled") ||
    bundle.observedJourneys.some((journey) => journey.scenariosObserved.includes("gpc_enabled"));
}

function ccpaPostOptOutProofEvidenceRefs(bundle: CanonicalEvidenceBundle): EvidenceRef[] {
  const optOutAttemptRefs = bundle.consentActionAttempts
    .filter((attempt) =>
      attempt.actionType === "do_not_sell_share" &&
      attempt.attempted === true &&
      attempt.succeeded === true &&
      attempt.actionProof?.attemptedStatus === "attempted_succeeded"
    )
    .flatMap((attempt) => [
      ...attempt.evidenceRefs,
      ...(attempt.actionProof?.evidenceRefs ?? []),
    ]);
  const gpcRefs = bundle.networkEvents
    .filter((event) => event.scenario === "gpc_enabled")
    .slice(0, 4)
    .map((event): EvidenceRef => ({
      refId: `ref_${event.eventId}`,
      eventId: event.eventId,
      eventType: event.eventType,
      label: event.thirdParty
        ? `GPC probe request: ${event.hostname ?? "third-party endpoint"}`
        : "GPC probe request",
    }));
  return uniqueEvidenceRefs([
    ...optOutAttemptRefs,
    ...gpcRefs,
    ...evidenceRefsFromJourneys(bundle.observedJourneys.filter((journey) =>
      journey.scenariosObserved.includes("gpc_enabled")
    )).slice(0, 4),
  ]);
}

type ConsentFlowComparison = CanonicalEvidenceBundle["consentFlowComparisons"][number];
type JourneyPhaseDelta = ConsentFlowComparison["journeyPhaseDeltas"][number];

function comparisonHasAdvertisingPostOptOutEvidence(
  bundle: CanonicalEvidenceBundle,
  comparison: ConsentFlowComparison,
): boolean {
  return comparisonHasAdvertisingPersistence(bundle, comparison) ||
    comparisonHasAdvertisingSuppression(bundle, comparison);
}

function comparisonHasAdvertisingPersistence(
  bundle: CanonicalEvidenceBundle,
  comparison: ConsentFlowComparison,
): boolean {
  return comparisonTouchesAdvertisingVendor(bundle, comparison) &&
    (comparison.vendorsPersistingAfterReject.length > 0 ||
      comparison.collectionEndpointsPersistingAfterReject.length > 0 ||
      comparison.cookiesPersistingAfterReject.length > 0 ||
      comparison.journeyPhaseDeltas.some((delta) => delta.persistedAfterReject));
}

function comparisonHasAdvertisingSuppression(
  bundle: CanonicalEvidenceBundle,
  comparison: ConsentFlowComparison,
): boolean {
  return comparisonTouchesAdvertisingVendor(bundle, comparison) &&
    (comparison.vendorsSuppressedAfterReject.length > 0 ||
      comparison.collectionEndpointsSuppressedAfterReject.length > 0 ||
      comparison.journeyPhaseDeltas.some((delta) => delta.suppressedAfterReject));
}

function comparisonTouchesAdvertisingVendor(
  bundle: CanonicalEvidenceBundle,
  comparison: ConsentFlowComparison,
): boolean {
  return consentComparisonRelatedVendors(bundle, [comparison]).some((vendor) =>
    vendor.purpose === "advertising",
  );
}

function comparisonHasPostRejectPersistence(comparison: ConsentFlowComparison) {
  return comparison.vendorsPersistingAfterReject.length > 0 ||
    comparison.collectionEndpointsPersistingAfterReject.length > 0 ||
    comparison.cookiesPersistingAfterReject.length > 0 ||
    comparison.journeyPhaseDeltas.some((delta) => delta.persistedAfterReject);
}

function comparisonHasPostRejectTrackingPersistence(comparison: ConsentFlowComparison) {
  return comparison.vendorsPersistingAfterReject.length > 0 ||
    comparison.collectionEndpointsPersistingAfterReject.length > 0 ||
    comparison.journeyPhaseDeltas.some((delta) =>
      delta.persistedAfterReject && deltaKind(delta) !== "cookie",
    );
}

function comparisonHasPostRejectVendorPersistence(comparison: ConsentFlowComparison) {
  return comparison.vendorsPersistingAfterReject.length > 0 ||
    comparison.journeyPhaseDeltas.some((delta) =>
      delta.persistedAfterReject && ["vendor", "product", "endpoint"].includes(deltaKind(delta)),
    );
}

function consentComparisonEvidenceRefs(comparison: ConsentFlowComparison): EvidenceRef[] {
  return uniqueEvidenceRefs([
    ...comparison.evidenceRefs,
    ...comparison.journeyPhaseDeltas.flatMap((delta) => delta.evidenceRefs),
  ]);
}

function consentComparisonRelatedVendors(
  bundle: CanonicalEvidenceBundle,
  comparisons: ConsentFlowComparison[],
): NormalizedVendorObservation[] {
  const names = new Set<string>();
  const hosts = new Set<string>();
  const cookieNames = new Set<string>();
  const eventIds = new Set<string>();

  for (const comparison of comparisons) {
    for (const name of [
      ...comparison.vendorsPersistingAfterReject,
      ...comparison.vendorsAppearingOnlyAfterAccept,
      ...comparison.vendorsSuppressedAfterReject,
    ]) {
      names.add(name);
    }
    for (const host of [
      ...comparison.collectionEndpointsPersistingAfterReject,
      ...comparison.collectionEndpointsAppearingOnlyAfterAccept,
      ...comparison.collectionEndpointsSuppressedAfterReject,
    ]) {
      hosts.add(host);
    }
    for (const cookieName of [
      ...comparison.cookiesPersistingAfterReject,
      ...comparison.cookiesSetAfterAccept,
    ]) {
      cookieNames.add(cookieName);
    }
    for (const ref of consentComparisonEvidenceRefs(comparison)) {
      if (ref.eventId) {
        eventIds.add(ref.eventId);
      }
    }
    for (const delta of comparison.journeyPhaseDeltas) {
      for (const name of deltaVendorNames(delta)) {
        names.add(name);
      }
      const endpoint = delta.endpointHostname ?? deltaKeyValue(delta, "endpoint");
      if (endpoint) {
        hosts.add(endpoint);
      }
      const cookieName = delta.cookieName ?? deltaKeyValue(delta, "cookie");
      if (cookieName) {
        cookieNames.add(cookieName);
      }
    }
  }

  return bundle.normalizedVendorObservations.filter((vendor) =>
    [...names].some((name) => sameVendorName(name, vendor.product ?? vendor.vendor) || sameVendorName(name, vendor.vendor)) ||
    [...hosts].some((host) => vendorMatchesHost(vendor, host)) ||
    [...cookieNames].some((cookieName) => vendor.matchedCookieNames.some((matchedCookie) => sameVendorName(cookieName, matchedCookie))) ||
    vendor.matchedEvidenceIds.some((eventId) => eventIds.has(eventId)),
  );
}

function consentComparisonMatchedCriteria(
  comparisons: ConsentFlowComparison[],
  confidentComparison: boolean,
): string[] {
  const deltas = comparisons.flatMap((comparison) => comparison.journeyPhaseDeltas);
  const persistedDeltas = deltas.filter((delta) => delta.persistedAfterReject);
  const endpointCount = unique([
    ...comparisons.flatMap((comparison) => comparison.collectionEndpointsPersistingAfterReject),
    ...persistedDeltas.map((delta) => delta.endpointHostname ?? deltaKeyValue(delta, "endpoint") ?? ""),
  ].filter(Boolean)).length;
  const cookieCount = unique([
    ...comparisons.flatMap((comparison) => comparison.cookiesPersistingAfterReject),
    ...persistedDeltas.map((delta) => delta.cookieName ?? deltaKeyValue(delta, "cookie") ?? ""),
  ].filter(Boolean)).length;
  const vendorCount = unique([
    ...comparisons.flatMap((comparison) => comparison.vendorsPersistingAfterReject),
    ...persistedDeltas.flatMap(deltaVendorNames),
  ].filter(Boolean)).length;

  return [
    "consent_flow_runtime_delta_detected",
    `post_reject_persisted_delta_count:${persistedDeltas.length}`,
    `post_reject_persisted_endpoint_count:${endpointCount}`,
    `post_reject_persisted_cookie_count:${cookieCount}`,
    `post_reject_persisted_vendor_count:${vendorCount}`,
    ...(comparisons.some((comparison) => comparison.comparableMeasurement?.comparable === true)
      ? ["comparable_pre_post_measurement_window"]
      : []),
    ...(confidentComparison ? ["confident_successful_consent_action_comparison"] : []),
  ];
}

function deltaVendorNames(delta: JourneyPhaseDelta): string[] {
  return [
    delta.vendor,
    delta.product,
    deltaKind(delta) === "vendor" || deltaKind(delta) === "product" ? deltaKeyBareValue(delta) : undefined,
    delta.displayName && !/^cookie:|^endpoint:/i.test(delta.displayName) ? delta.displayName : undefined,
  ].filter((value): value is string => Boolean(value));
}

function deltaKind(delta: JourneyPhaseDelta) {
  if (delta.cookieName || delta.journeyKey.startsWith("cookie:") || delta.displayName?.startsWith("cookie:")) {
    return "cookie";
  }
  if (delta.endpointHostname || delta.journeyKey.startsWith("endpoint:") || delta.displayName?.startsWith("endpoint:")) {
    return "endpoint";
  }
  if (delta.product || delta.journeyKey.startsWith("product:")) {
    return "product";
  }
  if (delta.vendor || delta.journeyKey.startsWith("vendor:")) {
    return "vendor";
  }
  return "unknown";
}

function deltaKeyValue(delta: JourneyPhaseDelta, prefix: string) {
  const prefixed = `${prefix}:`;
  if (delta.journeyKey.startsWith(prefixed)) {
    return delta.journeyKey.slice(prefixed.length);
  }
  if (delta.displayName?.startsWith(prefixed)) {
    return delta.displayName.slice(prefixed.length);
  }
  return undefined;
}

function deltaKeyBareValue(delta: JourneyPhaseDelta) {
  return delta.journeyKey.includes(":") ? delta.journeyKey.split(":").slice(1).join(":") : delta.displayName;
}

function vendorMatchesHost(vendor: NormalizedVendorObservation, host: string) {
  const normalizedHost = host.toLowerCase();
  return vendor.matchedHostnames.some((matchedHost) => hostMatches(normalizedHost, matchedHost)) ||
    vendor.matchedUrls.some((url) => hostMatches(normalizedHost, url)) ||
    vendorHostHints(vendor).some((hint) => normalizedHost.includes(hint));
}

function hostMatches(host: string, value: string) {
  const normalizedValue = value.toLowerCase();
  return normalizedValue.includes(host) || host.includes(normalizedValue);
}

function vendorHostHints(vendor: NormalizedVendorObservation) {
  const product = `${vendor.vendor} ${vendor.product ?? ""}`.toLowerCase();
  return [
    product.includes("google analytics") ? "google-analytics.com" : undefined,
    product.includes("google tag manager") ? "googletagmanager.com" : undefined,
    product.includes("microsoft clarity") ? "clarity.ms" : undefined,
    product.includes("hotjar") ? "hotjar.com" : undefined,
    product.includes("meta") || product.includes("facebook") ? "facebook.com" : undefined,
    product.includes("tiktok") ? "tiktok.com" : undefined,
  ].filter((hint): hint is string => Boolean(hint));
}

function candidate(input: {
  findingKey: string;
  title: string;
  eligible: boolean;
  deferred?: boolean;
  deferredReason?: string;
  matchedCriteria?: string[];
  missingCorroborators?: string[];
  demotionReasons?: string[];
  confidence: number;
  directVsInferred: DirectVsInferred;
  sourceEvidenceRefs: EvidenceRef[];
  relatedVendors: NormalizedVendorObservation[];
  sourceModulesRequired: string[];
  sourceModulesPresent: string[];
}): FindingCandidate {
  return {
    findingKey: input.findingKey,
    title: input.title,
    eligibility: {
      status: input.deferred ? "deferred" : input.eligible ? "eligible" : "not_eligible",
      reasons: input.deferred
        ? [input.deferredReason ?? "required_source_module_not_run"]
        : input.eligible
          ? ["criteria_matched_from_canonical_evidence"]
          : ["criteria_not_met"],
    },
    matchedCriteria: input.matchedCriteria ?? [],
    missingCorroborators: input.missingCorroborators ?? [],
    demotionReasons: input.demotionReasons ?? [],
    confidence: input.confidence,
    directVsInferred: input.directVsInferred,
    sourceEvidenceRefs: input.sourceEvidenceRefs,
    evidenceExcerptIds: [],
    relatedVendors: input.relatedVendors,
    sourceModulesRequired: input.sourceModulesRequired,
    sourceModulesPresent: input.sourceModulesPresent,
    coverageLimitations: [],
  };
}

function isPreConsentRuntimeCoverageUnavailable(
  bundle: CanonicalEvidenceBundle,
  moduleSet: Set<string>,
) {
  return !moduleSet.has(PRE_CONSENT_MODULE) || bundle.runtimeCoverage?.coverageStatus === "limited_none";
}

function preConsentRuntimeDeferredReason(
  bundle: CanonicalEvidenceBundle,
  moduleSet: Set<string>,
) {
  if (!moduleSet.has(PRE_CONSENT_MODULE)) {
    return "required_source_module_not_run";
  }
  if (bundle.runtimeCoverage?.coverageStatus === "limited_none") {
    return "runtime_coverage_limited_none";
  }
  return undefined;
}

function buildEvidenceExcerpts(
  bundle: CanonicalEvidenceBundle,
  findingCandidates: FindingCandidate[],
): DisplaySafeEvidenceExcerpt[] {
  const eventById = eventMap(bundle);
  const journeyByEventId = journeysByEventId(bundle);
  const vendorByEventId = vendorsByEventId(bundle);
  const refs = uniqueEvidenceRefs([
    ...findingCandidates.flatMap((finding) => finding.sourceEvidenceRefs),
    ...bundle.observedJourneys.flatMap((journey) => journey.evidenceRefs),
  ]);
  const excerpts = new Map<string, DisplaySafeEvidenceExcerpt>();

  for (const ref of refs) {
    if (ref.eventId) {
      const event = eventById.get(ref.eventId);
      if (!event) {
        continue;
      }
      const journey = journeyByEventId.get(event.eventId);
      const vendor = vendorByEventId.get(event.eventId);
      const excerpt = excerptForEvent(bundle, event, {
        ref,
        journey,
        vendor,
      });
      excerpts.set(excerpt.excerptId, excerpt);
      continue;
    }
    if (ref.artifactId) {
      const excerpt = excerptForArtifactRef(bundle, ref);
      if (excerpt) {
        excerpts.set(excerpt.excerptId, excerpt);
      }
    }
  }

  return [...excerpts.values()].sort((left, right) => left.excerptId.localeCompare(right.excerptId));
}

function excerptForEvent(
  bundle: CanonicalEvidenceBundle,
  event: RuntimeEvent,
  context: {
    ref: EvidenceRef;
    journey?: ObservedJourney;
    vendor?: NormalizedVendorObservation;
  },
): DisplaySafeEvidenceExcerpt {
  const base = {
    excerptId: `excerpt_${event.eventId}`,
    sourceEventId: event.eventId,
    sourceEventType: event.eventType,
    sourceScanner: event.sourceScanner,
    scenario: event.scenario,
    consentStateAtTime: event.consentStateAtTime,
    pagePhase: event.pagePhase,
    observedAtMs: event.timestampMs,
    vendorRef: context.vendor?.observationId,
    journeyId: context.journey?.journeyId,
    artifactRefs: artifactRefsForEvent(bundle, event.eventId),
    queryParamNames: [],
    cookieNames: [],
    headerNames: [],
    confidence: event.confidence,
    directVsInferred: event.directVsInferred,
  };

  if (event.eventType === "network_request") {
    const networkEvent = event as CanonicalEvidenceBundle["networkEvents"][number];
    return {
      ...base,
      evidenceKind: networkEvent.cookieHeaderPresent ? "cookie_sent" : "network_request",
      displayLabel: networkEvent.collectionEndpointObserved
        ? "Collection endpoint request"
        : "Network request",
      displayValueRedacted: safeHostPath(networkEvent.hostname, networkEvent.path),
      hostname: networkEvent.hostname,
      path: safePath(networkEvent.path),
      queryParamNames: [...networkEvent.queryParamNames].sort(),
      cookieNames: [...networkEvent.cookieNamesSent].sort(),
      headerNames: safeHeaderNames(networkEvent.requestHeaders),
      sensitivity: networkEvent.queryParamNames.length > 0 || networkEvent.cookieHeaderPresent ? "redacted" : "safe",
      redactionReason: networkEvent.queryParamNames.length > 0 || networkEvent.cookieHeaderPresent
        ? "query values and cookie values omitted"
        : undefined,
    };
  }
  if (event.eventType === "network_response") {
    const response = event as CanonicalEvidenceBundle["networkResponseEvents"][number];
    return {
      ...base,
      evidenceKind: "network_response",
      displayLabel: "Network response",
      displayValueRedacted: safeHostPath(response.hostname, pathFromUrl(response.responseUrl)),
      hostname: response.hostname,
      path: safePath(pathFromUrl(response.responseUrl)),
      queryParamNames: [],
      cookieNames: [...response.cookieNamesSet].sort(),
      headerNames: safeHeaderNames(response.responseHeaders),
      sensitivity: response.cookieNamesSet.length > 0 ? "redacted" : "safe",
      redactionReason: response.cookieNamesSet.length > 0 ? "Set-Cookie values omitted" : undefined,
    };
  }
  if (event.eventType === "cookie") {
    const cookie = event as CanonicalEvidenceBundle["cookieEvents"][number];
    return {
      ...base,
      evidenceKind: cookie.operation === "set_cookie_header" ? "cookie_set" : "cookie_sent",
      displayLabel: cookie.operation === "set_cookie_header" ? "Cookie set" : "Cookie observed",
      displayValueRedacted: `${cookie.cookieName}=[redacted]`,
      hostname: cookie.hostname,
      path: safePath(cookie.cookiePath),
      queryParamNames: [],
      cookieNames: [cookie.cookieName],
      headerNames: [],
      sensitivity: "redacted",
      redactionReason: "cookie value omitted",
    };
  }
  if (event.eventType === "script") {
    const script = event as CanonicalEvidenceBundle["scriptEvents"][number];
    return {
      ...base,
      evidenceKind: "script_loaded",
      displayLabel: "Script loaded",
      displayValueRedacted: safeHostPath(script.hostname, pathFromUrl(script.scriptUrl)),
      hostname: script.hostname,
      path: safePath(pathFromUrl(script.scriptUrl)),
      queryParamNames: [],
      cookieNames: [],
      headerNames: [],
      sensitivity: "safe",
    };
  }
  if (event.eventType === "iframe") {
    const iframe = event as CanonicalEvidenceBundle["iframeEvents"][number];
    return {
      ...base,
      evidenceKind: "iframe_loaded",
      displayLabel: "Iframe loaded",
      displayValueRedacted: safeHostPath(iframe.hostname, pathFromUrl(iframe.frameUrl)),
      hostname: iframe.hostname,
      path: safePath(pathFromUrl(iframe.frameUrl)),
      queryParamNames: [],
      cookieNames: [],
      headerNames: [],
      sensitivity: "safe",
    };
  }

  return {
    ...base,
    evidenceKind: "storage_observed",
    displayLabel: "Runtime evidence observed",
    displayValueRedacted: context.ref.label,
    queryParamNames: [],
    cookieNames: [],
    headerNames: [],
    sensitivity: "redacted",
    redactionReason: "raw runtime value omitted",
  };
}

function excerptForArtifactRef(
  bundle: CanonicalEvidenceBundle,
  ref: EvidenceRef,
): DisplaySafeEvidenceExcerpt | undefined {
  const consentObservation = bundle.consentUiObservations.find((observation) =>
    observation.evidenceRefs.some((evidenceRef) => evidenceRef.artifactId === ref.artifactId),
  );
  const policyObservation = bundle.policySurfaceObservations.find((observation) =>
    observation.evidenceRefs.some((evidenceRef) => evidenceRef.artifactId === ref.artifactId),
  );
  const artifact = artifactRefForEvidenceRef(bundle, ref);
  if (policyObservation) {
    return {
      excerptId: `excerpt_${ref.artifactId ?? ref.refId}`,
      evidenceKind: "policy_surface_placeholder",
      displayLabel: `Policy surface: ${policyObservation.surfaceType}`,
      displayValueRedacted: policyObservation.textExcerpt,
      hostname: hostnameFromUrl(policyObservation.normalizedUrl ?? policyObservation.url),
      path: safePath(pathFromUrl(policyObservation.normalizedUrl ?? policyObservation.url)),
      queryParamNames: [],
      cookieNames: [],
      headerNames: [],
      artifactRefs: artifact ? [artifact] : policyObservation.artifactRefs,
      sensitivity: "redacted",
      redactionReason: "policy excerpt is bounded and full policy page is not copied into review output",
      confidence: policyObservation.confidence,
      directVsInferred: policyObservation.directVsInferred,
    };
  }
  if (consentObservation) {
    return {
      excerptId: `excerpt_${ref.artifactId ?? ref.refId}`,
      evidenceKind: "consent_ui_observed",
      displayLabel: "Consent UI observation",
      displayValueRedacted: consentObservation.likelyPresent ? "likely_present" : "not_observed",
      queryParamNames: [],
      cookieNames: [],
      headerNames: [],
      artifactRefs: artifact ? [artifact] : [],
      sensitivity: "redacted",
      redactionReason: "DOM text is bounded and raw page text is not copied into finding output",
      confidence: consentObservation.confidence,
      directVsInferred: "inferred",
    };
  }
  if (artifact) {
    return {
      excerptId: `excerpt_${artifact.artifactId}`,
      evidenceKind: artifact.artifactType === "screenshot" ? "screenshot" : "dom_snapshot",
      displayLabel: artifact.label ?? "Artifact observed",
      queryParamNames: [],
      cookieNames: [],
      headerNames: [],
      artifactRefs: [artifact],
      sensitivity: artifact.sensitivity,
      redactionReason: artifact.redactionStatus === "redacted" ? "artifact content redacted or bounded" : undefined,
      confidence: 0.7,
      directVsInferred: "direct",
    };
  }
  return undefined;
}

type RuntimeEvent =
  | CanonicalEvidenceBundle["networkEvents"][number]
  | CanonicalEvidenceBundle["networkResponseEvents"][number]
  | CanonicalEvidenceBundle["cookieEvents"][number]
  | CanonicalEvidenceBundle["scriptEvents"][number]
  | CanonicalEvidenceBundle["iframeEvents"][number]
  | CanonicalEvidenceBundle["consentInteractionEvents"][number];

function eventMap(bundle: CanonicalEvidenceBundle): Map<string, RuntimeEvent> {
  return new Map(
    [
      ...bundle.networkEvents,
      ...bundle.networkResponseEvents,
      ...bundle.cookieEvents,
      ...bundle.scriptEvents,
      ...bundle.iframeEvents,
      ...bundle.consentInteractionEvents,
    ].map((event) => [event.eventId, event]),
  );
}

function journeysByEventId(bundle: CanonicalEvidenceBundle): Map<string, ObservedJourney> {
  const byEventId = new Map<string, ObservedJourney>();
  for (const journey of bundle.observedJourneys) {
    for (const ref of journey.eventRefs) {
      if (!byEventId.has(ref.eventId)) {
        byEventId.set(ref.eventId, journey);
      }
    }
  }
  return byEventId;
}

function vendorsByEventId(bundle: CanonicalEvidenceBundle): Map<string, NormalizedVendorObservation> {
  const byEventId = new Map<string, NormalizedVendorObservation>();
  for (const vendor of bundle.normalizedVendorObservations) {
    for (const eventId of vendor.matchedEvidenceIds) {
      if (!byEventId.has(eventId)) {
        byEventId.set(eventId, vendor);
      }
    }
  }
  return byEventId;
}

function groupExcerptIdsBySourceKey(
  excerpts: DisplaySafeEvidenceExcerpt[],
): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const excerpt of excerpts) {
    for (const key of sourceKeysForExcerpt(excerpt)) {
      byKey.set(key, unique([...(byKey.get(key) ?? []), excerpt.excerptId]));
    }
  }
  return byKey;
}

function sourceKeysForRef(ref: EvidenceRef): string[] {
  return [
    ref.eventId ? `event:${ref.eventId}` : undefined,
    ref.artifactId ? `artifact:${ref.artifactId}` : undefined,
    `ref:${ref.refId}`,
  ].filter((key): key is string => Boolean(key));
}

function sourceKeysForExcerpt(excerpt: DisplaySafeEvidenceExcerpt): string[] {
  return [
    excerpt.sourceEventId ? `event:${excerpt.sourceEventId}` : undefined,
    ...excerpt.artifactRefs.map((artifact) => `artifact:${artifact.artifactId}`),
    `ref:${excerpt.excerptId.replace(/^excerpt_/, "ref_")}`,
  ].filter((key): key is string => Boolean(key));
}

function uniqueEvidenceRefs(refs: EvidenceRef[]): EvidenceRef[] {
  const byKey = new Map<string, EvidenceRef>();
  for (const ref of refs) {
    byKey.set(`${ref.refId}:${ref.eventId ?? ""}:${ref.artifactId ?? ""}`, ref);
  }
  return [...byKey.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function artifactRefsForEvent(bundle: CanonicalEvidenceBundle, eventId: string): ArtifactRef[] {
  return bundle.artifactRefs.filter((artifact) => artifact.relatedEventIds.includes(eventId));
}

function artifactRefForEvidenceRef(
  bundle: CanonicalEvidenceBundle,
  ref: EvidenceRef,
): ArtifactRef | undefined {
  if (!ref.artifactId) {
    return undefined;
  }
  const existing = bundle.artifactRefs.find((artifact) => artifact.artifactId === ref.artifactId);
  if (existing) {
    return existing;
  }
  const screenshot = bundle.screenshots.find((artifact) => artifact.artifactId === ref.artifactId);
  if (screenshot) {
    return {
      artifactId: screenshot.artifactId,
      artifactType: "screenshot",
      path: screenshot.path,
      observedAtMs: screenshot.capturedAtMs,
      sensitivity: "safe",
      redactionStatus: "not_needed",
      relatedEventIds: [],
    };
  }
  const domSnapshot = bundle.domSnapshots.find((artifact) => artifact.artifactId === ref.artifactId);
  if (domSnapshot) {
    return {
      artifactId: domSnapshot.artifactId,
      artifactType: "dom_snapshot",
      path: domSnapshot.path,
      observedAtMs: domSnapshot.capturedAtMs,
      sensitivity: "redacted",
      redactionStatus: "redacted",
      relatedEventIds: [],
    };
  }
  if (ref.artifactId) {
    return {
      artifactId: ref.artifactId,
      artifactType: ref.eventType === "screenshot" ? "screenshot" : "dom_snapshot",
      path: ref.path,
      sensitivity: ref.excerpt ? "redacted" : "safe",
      redactionStatus: ref.excerpt ? "redacted" : "not_needed",
      relatedEventIds: ref.eventId ? [ref.eventId] : [],
      label: ref.label,
    };
  }
  return undefined;
}

function safeHostPath(hostname: string | undefined, path: string | undefined): string | undefined {
  if (!hostname && !path) {
    return undefined;
  }
  return `${hostname ?? ""}${safePath(path) ?? ""}`;
}

function safePath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  return path.replace(/;[^/?#]*/g, ";[redacted]");
}

function pathFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function hostnameFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function safeHeaderNames(headers: unknown): string[] {
  if (!headers || typeof headers !== "object") {
    return [];
  }
  return Object.entries(headers)
    .filter(([, value]) =>
      typeof value === "string" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.length > 0),
    )
    .map(([key]) => key)
    .sort();
}

function buildCoverageLimitations(
  bundle: CanonicalEvidenceBundle,
  sourceModulesPresent: string[],
): CoverageLimitation[] {
  const moduleSet = new Set(sourceModulesPresent);
  const limitations: CoverageLimitation[] = [];

  if (!moduleSet.has(CONSENT_FLOW_MODULE)) {
    limitations.push({
      limitationKey: "consent_flow_not_run",
      description:
        "Consent-flow scanner did not run, so reject/accept interaction findings are out of scope.",
      affectedFindingKeys: [
        "reject_control_observed_or_not_observed",
        "accept_control_observed_or_not_observed",
        "reject_action_succeeded_or_not_testable",
        "accept_action_succeeded_or_not_testable",
        "tracking_after_refusal_review_signal",
        "reject_did_not_reduce_tracking_review_signal",
        "vendors_persist_after_reject_review_signal",
        "vendors_appear_only_after_accept_review_signal",
        "cookies_persist_after_reject_review_signal",
        "accept_reject_runtime_delta_observed",
      ],
      sourceModulesRequired: [CONSENT_FLOW_MODULE],
      sourceModulesPresent,
    });
  }

  if (!moduleSet.has(POLICY_SURFACE_MODULE)) {
    limitations.push({
      limitationKey: "policy_surface_not_run",
      description:
        "Policy-surface scanner did not run, so policy/runtime mismatch findings are out of scope.",
      affectedFindingKeys: [
        "privacy_notice_observed_or_not_observed",
        "cookie_policy_observed_or_not_observed",
        "privacy_choices_link_observed",
        "do_not_sell_or_share_link_observed",
        "gpc_disclosure_observed",
        "notice_at_collection_observed",
        "policy_vendor_mentions_observed",
        "policy_runtime_vendor_alignment_review_signal",
        "ai_disclosure_observed_or_not_observed",
      ],
      sourceModulesRequired: [POLICY_SURFACE_MODULE],
      sourceModulesPresent,
    });
  }

  if (!moduleSet.has(PRE_CONSENT_MODULE)) {
    limitations.push({
      limitationKey: "pre_consent_runtime_not_run",
      description:
        "Pre-consent runtime scanner did not run, so runtime tracking/cookie findings are deferred.",
      affectedFindingKeys: [
        "pre_consent_tracking_detected",
        "third_party_cookie_pre_consent",
        "consent_banner_observed_or_not_observed",
      ],
      sourceModulesRequired: [PRE_CONSENT_MODULE],
      sourceModulesPresent,
    });
  }

  const runtimeCoverage = bundle.runtimeCoverage;
  if (
    runtimeCoverage &&
    runtimeCoverage.coverageStatus !== "usable" &&
    runtimeCoverage.coverageStatus !== "not_applicable"
  ) {
    limitations.push({
      limitationKey: `runtime_coverage_${runtimeCoverage.coverageStatus}`,
      description:
        runtimeCoverage.coverageStatus === "limited_none"
          ? "Pre-consent runtime observation did not retain usable runtime evidence, so absence of runtime signals must not be treated as a clean result."
          : "Pre-consent runtime observation retained partial coverage, so runtime absence findings require review.",
      affectedFindingKeys: [
        "third_party_vendors_observed",
        "pre_consent_tracking_detected",
        "third_party_cookie_pre_consent",
        "vendor_associated_cookie_pre_consent",
        "unresolved_collection_endpoint_review_signal",
        "consent_banner_observed_or_not_observed",
        "session_replay_or_behavioral_analytics_observed",
      ],
      sourceModulesRequired: [PRE_CONSENT_MODULE],
      sourceModulesPresent,
    });
  }

  if (runtimeCoverage?.silentEmpty) {
    limitations.push({
      limitationKey: "silent_empty_runtime_completed",
      description:
        "The pre-consent runtime scanner completed without module errors but retained no runtime observations; treat this as no usable runtime coverage, not evidence that no tracking exists.",
      affectedFindingKeys: [
        "third_party_vendors_observed",
        "pre_consent_tracking_detected",
        "third_party_cookie_pre_consent",
        "vendor_associated_cookie_pre_consent",
        "unresolved_collection_endpoint_review_signal",
        "session_replay_or_behavioral_analytics_observed",
      ],
      sourceModulesRequired: [PRE_CONSENT_MODULE],
      sourceModulesPresent,
    });
  }

  return limitations;
}

function evidenceRefsFromVendorObservations(
  bundle: CanonicalEvidenceBundle,
  vendors: NormalizedVendorObservation[],
): EvidenceRef[] {
  const structuredRefs = new Map<string, EvidenceRef>();
  for (const vendor of vendors) {
    for (const ref of vendor.matchedEvidenceRefs) {
      structuredRefs.set(ref.refId, ref);
    }
    for (const source of vendor.matchSources) {
      if (source.sourceEventId) {
        structuredRefs.set(`ref_${source.sourceEventId}`, {
          refId: `ref_${source.sourceEventId}`,
          eventId: source.sourceEventId,
          eventType: source.sourceEventType,
          label: source.matchedField,
        });
      }
    }
  }
  if (structuredRefs.size > 0) {
    return [...structuredRefs.values()];
  }

  const matchedUrls = new Set(vendors.flatMap((vendor) => vendor.matchedUrls));
  const refs: EvidenceRef[] = [];

  for (const event of [...bundle.networkEvents, ...bundle.scriptEvents]) {
    const observedUrl =
      "requestUrl" in event ? event.requestUrl : "scriptUrl" in event ? event.scriptUrl : undefined;
    if (observedUrl && matchedUrls.has(observedUrl)) {
      refs.push({
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: observedUrl,
      });
    }
  }

  return refs;
}

function observedPolicySurfaces(bundle: CanonicalEvidenceBundle): CanonicalEvidenceBundle["policySurfaceObservations"] {
  return bundle.policySurfaceObservations.filter((observation) =>
    observation.status === "observed" || observation.status === "fetched",
  );
}

function evidenceRefsFromPolicySurfaces(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
): EvidenceRef[] {
  return uniqueEvidenceRefs(observations.flatMap((observation) => observation.evidenceRefs));
}

function maxPolicyConfidence(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
  fallback: number,
): number {
  return Math.max(fallback, ...observations.map((observation) => observation.confidence));
}

function policyDirectness(
  observations: CanonicalEvidenceBundle["policySurfaceObservations"],
): DirectVsInferred {
  if (observations.length === 0) {
    return "unknown";
  }
  return observations.some((observation) => observation.directVsInferred === "mixed") ? "mixed" : "direct";
}

function sameVendorName(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalize(left).includes(normalize(right)) || normalize(right).includes(normalize(left));
}

function meaningfulVendorJourneys(bundle: CanonicalEvidenceBundle): ObservedJourney[] {
  return bundle.observedJourneys.filter((journey) =>
    ["vendor", "product", "tracker"].includes(journey.journeyType) &&
    journey.purpose !== "consent_management" &&
    journey.purpose !== "infrastructure" &&
    journey.purpose !== "security" &&
    journey.purpose !== "performance_monitoring" &&
    journey.purpose !== "customer_support" &&
    journey.purpose !== "unknown",
  );
}

function trackingJourneys(bundle: CanonicalEvidenceBundle): ObservedJourney[] {
  return bundle.observedJourneys.filter((journey) =>
    journey.firstObservedConsentState === "pre_consent" &&
    journey.purpose !== undefined &&
    trackingPurposes.has(journey.purpose) &&
    journey.attributionStatus !== "site_owned_infrastructure" &&
    journey.attributionStatus !== "ignored_noise" &&
    journey.endpointSubtype !== "google_consent_or_tag_support",
  );
}

function hasAnyBehavior(
  journey: ObservedJourney,
  behaviors: ObservedBehavior[],
): boolean {
  return journey.observedBehaviors.some((behavior) => behaviors.includes(behavior));
}

function criteriaFromJourneyBehaviors(journeys: ObservedJourney[]): string[] {
  const behaviors = new Set(journeys.flatMap((journey) => journey.observedBehaviors));
  const criteria: string[] = [];
  if (behaviors.has("collection_endpoint_observed") || behaviors.has("session_replay_collection_observed")) {
    criteria.push("collection_endpoint_observed");
  }
  if (behaviors.has("cookie_set")) {
    criteria.push("cookie_set");
  }
  if (behaviors.has("cookie_sent")) {
    criteria.push("cookie_sent");
  }
  if (behaviors.has("identifier_parameter_observed")) {
    criteria.push("identifier_parameter_observed");
  }
  if (behaviors.has("advertising_click_id_observed")) {
    criteria.push("advertising_click_id_observed");
  }
  return criteria;
}

function evidenceRefsFromJourneys(journeys: ObservedJourney[]): EvidenceRef[] {
  const refs = new Map<string, EvidenceRef>();
  for (const journey of journeys) {
    for (const ref of journey.evidenceRefs) {
      refs.set(ref.refId, ref);
    }
  }
  return [...refs.values()];
}

function targetedAdvertisingEvidenceRefs(
  journeys: ObservedJourney[],
  relatedVendors: NormalizedVendorObservation[],
): EvidenceRef[] {
  const vendorRefs = evidenceRefsFromVendors(relatedVendors);
  const sourceRefs = vendorRefs.length > 0 ? vendorRefs : evidenceRefsFromJourneys(journeys);
  return uniqueEvidenceRefs(sourceRefs.map(toBoundedTargetedAdvertisingEvidenceRef));
}

function evidenceRefsFromVendors(vendors: NormalizedVendorObservation[]): EvidenceRef[] {
  const structuredRefs = new Map<string, EvidenceRef>();
  for (const vendor of vendors) {
    for (const ref of vendor.matchedEvidenceRefs) {
      structuredRefs.set(ref.refId, ref);
    }
    for (const source of vendor.matchSources) {
      if (!source.sourceEventId) {
        continue;
      }
      structuredRefs.set(`ref_${source.sourceEventId}`, {
        refId: `ref_${source.sourceEventId}`,
        eventId: source.sourceEventId,
        eventType: source.sourceEventType,
        label: source.matchedValueRedacted ?? source.matchedField,
      });
    }
  }
  return [...structuredRefs.values()];
}

function toBoundedTargetedAdvertisingEvidenceRef(ref: EvidenceRef): EvidenceRef {
  return {
    refId: ref.refId,
    eventId: ref.eventId,
    artifactId: ref.artifactId,
    eventType: ref.eventType,
    label: targetedAdvertisingEvidenceLabel(ref),
  };
}

function targetedAdvertisingEvidenceLabel(ref: EvidenceRef): string | undefined {
  const urlLabel = endpointHostnameLabel(ref.url) ?? endpointHostnameLabel(ref.label);
  if (urlLabel) {
    return urlLabel;
  }
  return ref.label ?? ref.eventId ?? ref.artifactId ?? ref.refId;
}

function endpointHostnameLabel(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) {
    return undefined;
  }
  try {
    return `endpoint:${new URL(value).hostname}`;
  } catch {
    return undefined;
  }
}

function preConsentTrackingEvidenceRefsFromJourneys(journeys: ObservedJourney[]): EvidenceRef[] {
  const refs = new Map<string, EvidenceRef>();
  for (const journey of journeys) {
    for (const ref of journey.evidenceRefs) {
      const label = ref.label ??
        (ref.url ? endpointHostname(ref.url) : undefined) ??
        journey.displayName;
      refs.set(ref.refId, {
        refId: ref.refId,
        eventId: ref.eventId,
        artifactId: ref.artifactId,
        eventType: ref.eventType,
        label,
      });
    }
  }
  return [...refs.values()];
}

function vendorsForJourneys(
  bundle: CanonicalEvidenceBundle,
  journeys: ObservedJourney[],
): NormalizedVendorObservation[] {
  const vendorKeys = new Set(
    journeys.flatMap((journey) => [
      journey.vendor ? `${journey.vendor}:${journey.product ?? ""}` : undefined,
      ...journey.relatedVendors.map((vendor) => `${vendor}:`),
    ]).filter((key): key is string => Boolean(key)),
  );

  return bundle.normalizedVendorObservations.filter((vendor) =>
    vendorKeys.has(`${vendor.vendor}:${vendor.product ?? ""}`) ||
    vendorKeys.has(`${vendor.vendor}:`),
  );
}

function maxJourneyConfidence(journeys: ObservedJourney[], fallback: number): number {
  return Math.max(fallback, ...journeys.map((journey) => journey.confidence));
}

function directnessForJourneys(journeys: ObservedJourney[]): DirectVsInferred {
  if (journeys.some((journey) => journey.directVsInferred === "direct")) {
    return "direct";
  }
  if (journeys.some((journey) => journey.directVsInferred === "mixed")) {
    return "mixed";
  }
  if (journeys.some((journey) => journey.directVsInferred === "inferred")) {
    return "inferred";
  }
  return "unknown";
}

function vendorsRelatedToCookieEvents(
  vendors: NormalizedVendorObservation[],
  cookieNames: string[],
): NormalizedVendorObservation[] {
  const names = new Set(cookieNames.map((name) => name.toLowerCase()));
  return vendors.filter((vendor) =>
    vendor.matchedCookieNames.some((cookieName) => names.has(cookieName.toLowerCase())),
  );
}

function preConsentStorageKeySet(bundle: CanonicalEvidenceBundle): Set<string> {
  return new Set(
    bundle.storageSnapshots
      .filter((snapshot) => snapshot.consentStateAtTime === "pre_consent")
      .flatMap((snapshot) => [
        ...snapshot.localStorageKeys,
        ...snapshot.sessionStorageKeys,
      ]),
  );
}

function storageEvidenceRefsForVendors(
  vendors: NormalizedVendorObservation[],
  preConsentStorageKeys: Set<string>,
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const vendor of vendors) {
    refs.push(
      ...vendor.matchedEvidenceRefs.filter((ref) =>
        ref.eventType === "storage_snapshot" &&
        typeof ref.label === "string" &&
        preConsentStorageKeys.has(ref.label),
      ),
    );
    for (const source of vendor.matchSources) {
      if (
        source.source !== "storage_key" ||
        source.matchedField !== "storage_key" ||
        source.consentStateAtTime !== "pre_consent" ||
        !source.sourceEventId ||
        !source.matchedValueRedacted ||
        !preConsentStorageKeys.has(source.matchedValueRedacted)
      ) {
        continue;
      }
      refs.push({
        refId: `ref_${source.sourceEventId}`,
        eventId: source.sourceEventId,
        eventType: "storage_snapshot",
        label: source.matchedValueRedacted,
      });
    }
  }
  return uniqueEvidenceRefs(refs);
}

function isTrackingCookiePurpose(purpose: string | undefined): boolean {
  return purpose === "analytics" ||
    purpose === "advertising" ||
    purpose === "session_replay" ||
    purpose === "tag_management";
}

function isUnresolvedEndpointReviewSubtype(journey: ObservedJourney): boolean {
  return journey.endpointSubtype === undefined ||
    journey.endpointSubtype === "google_owned_unresolved_meaningful";
}

function maxConfidence(
  vendors: NormalizedVendorObservation[],
  fallback: number,
): number {
  return vendors.reduce(
    (max, vendor) => Math.max(max, vendor.confidence),
    fallback,
  );
}

function directnessForVendors(vendors: NormalizedVendorObservation[]): DirectVsInferred {
  if (vendors.length === 0) {
    return "unknown";
  }
  return vendors.some((vendor) =>
    isCollectionEndpointObservation(vendor) ||
    vendor.basis.some((basis) => basis.includes("cookie")),
  )
    ? "direct"
    : "inferred";
}

function isCollectionEndpointObservation(
  vendor: NormalizedVendorObservation,
): boolean {
  return vendor.matchedUrls.some((url) =>
    /\/(?:g\/collect|collect|tr|rec|pagead|gampad|activityi|api\/v2\/pixel)\b/i.test(url),
  );
}
