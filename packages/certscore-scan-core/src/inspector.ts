import {
  type CanonicalEvidenceBundle,
  type CookieEvent,
  type FindingCandidate,
  type NetworkEvent,
  type NormalizedVendorObservation,
  type ObservedBehavior,
  type ObservedJourney,
  canonicalEvidenceBundleSchema,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";

const attributionStatuses = [
  "resolved",
  "unresolved_meaningful",
  "site_owned_infrastructure",
  "ignored_noise",
] as const;

const googleEndpointSubtypes = [
  "google_analytics_collection",
  "google_ads_or_measurement",
  "google_consent_or_tag_support",
  "google_recaptcha_or_security",
  "google_owned_unresolved_meaningful",
  "google_owned_infrastructure",
] as const;

const activeCollectionBehaviors = new Set<ObservedBehavior>([
  "collection_endpoint_observed",
  "identifier_parameter_observed",
  "advertising_click_id_observed",
  "cookie_sent",
  "session_replay_collection_observed",
]);

export interface BundleInspectionReport {
  scanId: string;
  url: string;
  schemaVersion: string;
  endpointAttribution: {
    countByAttributionStatus: Record<string, number>;
    countByEndpointSubtype: Record<string, number>;
    unresolvedMeaningfulEndpoints: EndpointInspectionItem[];
    siteOwnedInfrastructureEndpoints: EndpointInspectionItem[];
    ignoredNoiseExamples: EndpointInspectionItem[];
  };
  vendorResolution: {
    resolvedVendors: VendorInspectionItem[];
    purposeCounts: Record<string, number>;
    confidenceDistribution: Record<string, number>;
    resolverBasisCounts: Record<string, number>;
  };
  journeySummary: {
    countByJourneyType: Record<string, number>;
    countByObservedBehavior: Record<string, number>;
    activeCollectionJourneys: JourneyInspectionItem[];
    libraryOnlyJourneys: JourneyInspectionItem[];
    unresolvedEndpointJourneys: JourneyInspectionItem[];
    cmpSecurityPerformanceJourneys: JourneyInspectionItem[];
    trackerEligibleJourneys: JourneyInspectionItem[];
    nonTrackerJourneyCount: number;
  };
  cookieClassification: {
    firstPartyCookies: string[];
    thirdPartyCookies: string[];
    firstPartyVendorAssociatedCookies: string[];
    cmpCookies: string[];
    securityInfrastructureCookies: string[];
    unknownCookies: string[];
    cookiesLinkedToJourneys: string[];
  };
  consentFlowSummary: ConsentFlowInspectionSummary;
  policySurfaceSummary: PolicySurfaceInspectionSummary;
  googleEndpointSubtypeSummary: Record<string, number>;
  findingCandidateSummary: FindingInspectionItem[];
  traceabilitySummary: TraceabilityInspectionSummary;
  evidenceExcerptSummary: EvidenceExcerptInspectionSummary;
  coverageLimitations: string[];
}

export interface EndpointInspectionItem {
  hostname?: string;
  path?: string;
  queryParamNames: string[];
  initiatorType?: string;
  contentType?: string;
  cookieNamesSent: string[];
  attributionStatus?: string;
  endpointSubtype?: string;
  attributionReason?: string;
  resolverBasis: string[];
  eventId?: string;
}

export interface VendorInspectionItem {
  vendor: string;
  product?: string;
  purpose: string;
  confidence: number;
  basis: string[];
  matchedEvidenceRefCount: number;
  matchSourceCount: number;
}

export interface JourneyInspectionItem {
  journeyId: string;
  journeyType: string;
  displayName: string;
  vendor?: string;
  product?: string;
  purpose?: string;
  endpointSubtype?: string;
  attributionStatus?: string;
  observedBehaviors: string[];
  confidence: number;
}

export interface FindingInspectionItem {
  findingKey: string;
  eligibility: string;
  confidence: number;
  relatedVendors: string[];
  sourceJourneyIds: string[];
  sourceEvidenceRefCount: number;
  evidenceExcerptIds: string[];
  coverageLimitations: string[];
}

export interface TraceabilityInspectionSummary {
  vendorObservationsWithEvidenceRefs: number;
  vendorObservationsMissingEvidenceRefs: number;
  vendorObservationsWithMatchSources: number;
  vendorObservationsMissingMatchSources: number;
  journeysWithRawEventRefs: number;
  journeysMissingRawEventRefs: number;
  findingCandidatesWithSourceEvidenceRefs: number;
  findingCandidatesMissingSourceEvidenceRefs: number;
  eligibleFindingCandidatesWithSourceEvidenceRefs: number;
  eligibleFindingCandidatesMissingSourceEvidenceRefs: number;
}

export interface EvidenceExcerptInspectionSummary {
  evidenceExcerptsTotal: number;
  evidenceExcerptsByKind: Record<string, number>;
  excerptsWithArtifactRefs: number;
  excerptsMissingSourceEvent: number;
  excerptsInternalOnly: number;
  excerptsRedacted: number;
  findingCandidatesWithExcerpts: number;
  findingCandidatesMissingExcerpts: number;
  eligibleFindingCandidatesWithExcerpts: number;
  eligibleFindingCandidatesMissingExcerpts: number;
}

export interface ConsentFlowInspectionSummary {
  scenariosObserved: Record<string, number>;
  controlsObservedByType: Record<string, number>;
  bannerLikelyPresentByScenario: Record<string, boolean>;
  actionAttempts: ConsentActionAttemptInspectionItem[];
  comparisons: ConsentFlowComparisonInspectionItem[];
  journeyPhaseDeltaCount: number;
  preferenceCenterTraversalCount: number;
  preferenceCenterOpenedCount: number;
  preferenceCenterSecondLayerObservedCount: number;
  rejectViaPreferenceCenterAttemptedCount: number;
  rejectViaPreferenceCenterSucceededCount: number;
  saveChoicesAttemptedCount: number;
  saveChoicesSucceededCount: number;
  preferenceCenterLimitations: string[];
  nanoAssistCount: number;
  nanoUncertaintyCount: number;
}

export interface ConsentActionAttemptInspectionItem {
  scenario: string;
  actionType: string;
  attempted: boolean;
  succeeded: boolean;
  failureReason?: string;
  bannerPresentBefore?: boolean;
  bannerPresentAfter?: boolean;
  viaPreferenceCenter?: boolean;
  preferenceCenterOpened?: boolean;
  preferenceCenterSecondLayerObserved?: boolean;
  preferenceCenterRejectAttempted?: boolean;
  preferenceCenterSaveAttempted?: boolean;
}

export interface ConsentFlowComparisonInspectionItem {
  comparedScenarios: string;
  vendorsPersistingAfterReject: string[];
  vendorsSuppressedAfterReject: string[];
  vendorsAppearingOnlyAfterAccept: string[];
  cookiesPersistingAfterReject: string[];
  cookiesSetAfterAccept: string[];
  collectionEndpointsPersistingAfterReject: string[];
  collectionEndpointsAppearingOnlyAfterAccept: string[];
  confidence: number;
  coverageLimitations: string[];
}

export interface PolicySurfaceInspectionSummary {
  policySurfacesObserved: number;
  policySurfaceAttempts: number;
  policySurfaceStatusCounts: Record<string, number>;
  policySurfaceFailedCount: number;
  surfaceTypes: Record<string, number>;
  failedSurfaceTypes: Record<string, number>;
  discoveryMethods: Record<string, number>;
  nanoAssistedCandidates: number;
  observedTopics: Record<string, number>;
  vendorMentions: string[];
  privacyChoicesLinks: string[];
  preferenceControlLinks: string[];
  gpcDisclosureObserved: boolean;
  doNotSellOrShareLinkObserved: boolean;
  noticeAtCollectionObserved: boolean;
  aiDisclosureObserved: boolean;
  policyExcerptCount: number;
  nanoAssistCount: number;
  nanoUncertaintyCount: number;
  policyRuntimeAlignmentCandidateStatus?: string;
  policyRuntimeAlignmentMatchedCriteria: string[];
}

export async function inspectBundle(
  bundleInput: CanonicalEvidenceBundle,
): Promise<BundleInspectionReport> {
  const bundle = canonicalEvidenceBundleSchema.parse(bundleInput);
  const review = await reviewEvidenceBundle(bundle);

  return {
    scanId: bundle.scanId,
    url: bundle.url,
    schemaVersion: bundle.schemaVersion,
    endpointAttribution: {
      countByAttributionStatus: fixedCountMap(
        attributionStatuses,
        bundle.networkEvents.map((event) => event.attributionStatus ?? "ignored_noise"),
      ),
      countByEndpointSubtype: fixedCountMap(
        googleEndpointSubtypes,
        endpointSubtypeValues(bundle),
      ),
      unresolvedMeaningfulEndpoints: endpointItems(
        bundle,
        (event) => event.attributionStatus === "unresolved_meaningful",
      ),
      siteOwnedInfrastructureEndpoints: endpointItems(
        bundle,
        (event) => event.attributionStatus === "site_owned_infrastructure",
      ),
      ignoredNoiseExamples: endpointItems(
        bundle,
        (event) => event.attributionStatus === "ignored_noise" || event.attributionStatus === undefined,
        8,
      ),
    },
    vendorResolution: {
      resolvedVendors: sortedVendors(bundle.normalizedVendorObservations),
      purposeCounts: sortedCountMap(
        bundle.normalizedVendorObservations.map((vendor) => vendor.purpose),
      ),
      confidenceDistribution: confidenceDistribution(bundle.normalizedVendorObservations),
      resolverBasisCounts: sortedCountMap(
        bundle.normalizedVendorObservations.flatMap((vendor) => vendor.basis),
      ),
    },
    journeySummary: {
      countByJourneyType: sortedCountMap(bundle.observedJourneys.map((journey) => journey.journeyType)),
      countByObservedBehavior: sortedCountMap(
        bundle.observedJourneys.flatMap((journey) => journey.observedBehaviors),
      ),
      activeCollectionJourneys: journeyItems(
        bundle.observedJourneys.filter((journey) =>
          journey.observedBehaviors.some((behavior) => activeCollectionBehaviors.has(behavior)),
        ),
      ),
      libraryOnlyJourneys: journeyItems(
        bundle.observedJourneys.filter((journey) =>
          journey.observedBehaviors.includes("library_loaded_only"),
        ),
      ),
      unresolvedEndpointJourneys: journeyItems(
        bundle.observedJourneys.filter((journey) =>
          journey.journeyType === "endpoint" &&
          journey.attributionStatus === "unresolved_meaningful",
        ),
      ),
      cmpSecurityPerformanceJourneys: journeyItems(
        bundle.observedJourneys.filter((journey) =>
          journey.purpose === "consent_management" ||
          journey.purpose === "security" ||
          journey.purpose === "performance_monitoring",
        ),
      ),
      trackerEligibleJourneys: journeyItems(
        bundle.observedJourneys.filter((journey) => journey.journeyType === "tracker"),
      ),
      nonTrackerJourneyCount: bundle.observedJourneys.filter((journey) => journey.journeyType !== "tracker").length,
    },
    cookieClassification: cookieClassification(bundle.cookieEvents, bundle.observedJourneys),
    consentFlowSummary: consentFlowSummary(bundle),
    policySurfaceSummary: policySurfaceSummary(bundle, review.findingCandidates),
    googleEndpointSubtypeSummary: fixedCountMap(
      googleEndpointSubtypes,
      endpointSubtypeValues(bundle),
    ),
    findingCandidateSummary: review.findingCandidates
      .map((candidate) => findingItem(candidate, bundle.observedJourneys))
      .sort((left, right) => left.findingKey.localeCompare(right.findingKey)),
    traceabilitySummary: traceabilitySummary(
      bundle,
      review.findingCandidates,
    ),
    evidenceExcerptSummary: evidenceExcerptSummary(review.findingCandidates, review.evidenceExcerpts),
    coverageLimitations: review.coverageLimitations
      .map((limitation) => limitation.limitationKey)
      .sort(),
  };
}

export function formatInspectionReportText(report: BundleInspectionReport): string {
  const lines: string[] = [];
  lines.push(`CertScore v2 bundle inspection`);
  lines.push(`Scan: ${report.scanId}`);
  lines.push(`URL: ${report.url}`);
  lines.push(`Schema: ${report.schemaVersion}`);
  lines.push("");
  lines.push("Endpoint attribution");
  lines.push(`  by status: ${formatCounts(report.endpointAttribution.countByAttributionStatus)}`);
  lines.push(`  by subtype: ${formatCounts(report.endpointAttribution.countByEndpointSubtype)}`);
  lines.push(`  unresolved meaningful: ${formatEndpointList(report.endpointAttribution.unresolvedMeaningfulEndpoints)}`);
  lines.push(`  site-owned infrastructure: ${formatEndpointList(report.endpointAttribution.siteOwnedInfrastructureEndpoints)}`);
  lines.push(`  ignored noise examples: ${formatEndpointList(report.endpointAttribution.ignoredNoiseExamples)}`);
  lines.push("");
  lines.push("Vendor/product resolution");
  lines.push(`  vendors: ${report.vendorResolution.resolvedVendors.map(formatVendor).join("; ") || "none"}`);
  lines.push(`  purposes: ${formatCounts(report.vendorResolution.purposeCounts)}`);
  lines.push(`  confidence: ${formatCounts(report.vendorResolution.confidenceDistribution)}`);
  lines.push(`  resolver basis: ${formatCounts(report.vendorResolution.resolverBasisCounts)}`);
  lines.push("");
  lines.push("Journey summary");
  lines.push(`  by type: ${formatCounts(report.journeySummary.countByJourneyType)}`);
  lines.push(`  by behavior: ${formatCounts(report.journeySummary.countByObservedBehavior)}`);
  lines.push(`  active collection: ${formatJourneyList(report.journeySummary.activeCollectionJourneys)}`);
  lines.push(`  library-only: ${formatJourneyList(report.journeySummary.libraryOnlyJourneys)}`);
  lines.push(`  unresolved endpoints: ${formatJourneyList(report.journeySummary.unresolvedEndpointJourneys)}`);
  lines.push(`  CMP/security/performance: ${formatJourneyList(report.journeySummary.cmpSecurityPerformanceJourneys)}`);
  lines.push(`  tracker-eligible: ${formatJourneyList(report.journeySummary.trackerEligibleJourneys)}`);
  lines.push(`  non-tracker count: ${report.journeySummary.nonTrackerJourneyCount}`);
  lines.push("");
  lines.push("Cookie classification");
  lines.push(`  first-party: ${formatStringList(report.cookieClassification.firstPartyCookies)}`);
  lines.push(`  third-party: ${formatStringList(report.cookieClassification.thirdPartyCookies)}`);
  lines.push(`  first-party vendor-associated: ${formatStringList(report.cookieClassification.firstPartyVendorAssociatedCookies)}`);
  lines.push(`  CMP: ${formatStringList(report.cookieClassification.cmpCookies)}`);
  lines.push(`  security/infrastructure: ${formatStringList(report.cookieClassification.securityInfrastructureCookies)}`);
  lines.push(`  unknown: ${formatStringList(report.cookieClassification.unknownCookies)}`);
  lines.push(`  linked to journeys: ${formatStringList(report.cookieClassification.cookiesLinkedToJourneys)}`);
  lines.push("");
  lines.push("Consent flow");
  lines.push(`  scenarios: ${formatCounts(report.consentFlowSummary.scenariosObserved)}`);
  lines.push(`  controls: ${formatCounts(report.consentFlowSummary.controlsObservedByType)}`);
  lines.push(`  banner states: ${formatBooleanRecord(report.consentFlowSummary.bannerLikelyPresentByScenario)}`);
  lines.push(`  attempts: ${formatConsentAttempts(report.consentFlowSummary.actionAttempts)}`);
  lines.push(`  preference-center traversal: total=${report.consentFlowSummary.preferenceCenterTraversalCount}, opened=${report.consentFlowSummary.preferenceCenterOpenedCount}, second_layer=${report.consentFlowSummary.preferenceCenterSecondLayerObservedCount}, reject_attempted=${report.consentFlowSummary.rejectViaPreferenceCenterAttemptedCount}, reject_succeeded=${report.consentFlowSummary.rejectViaPreferenceCenterSucceededCount}, save_attempted=${report.consentFlowSummary.saveChoicesAttemptedCount}, limitations=${formatStringList(report.consentFlowSummary.preferenceCenterLimitations)}`);
  lines.push(`  comparisons: ${formatConsentComparisons(report.consentFlowSummary.comparisons)}`);
  lines.push(`  journey phase deltas: ${report.consentFlowSummary.journeyPhaseDeltaCount}`);
  lines.push(`  Nano assists: ${report.consentFlowSummary.nanoAssistCount} uncertainty=${report.consentFlowSummary.nanoUncertaintyCount}`);
  lines.push("");
  lines.push("Policy surfaces");
  lines.push(`  observed: ${report.policySurfaceSummary.policySurfacesObserved}`);
  lines.push(`  attempts: ${report.policySurfaceSummary.policySurfaceAttempts}`);
  lines.push(`  statuses: ${formatCounts(report.policySurfaceSummary.policySurfaceStatusCounts)}`);
  lines.push(`  failed: ${report.policySurfaceSummary.policySurfaceFailedCount} (${formatCounts(report.policySurfaceSummary.failedSurfaceTypes)})`);
  lines.push(`  surface types: ${formatCounts(report.policySurfaceSummary.surfaceTypes)}`);
  lines.push(`  discovery methods: ${formatCounts(report.policySurfaceSummary.discoveryMethods)}`);
  lines.push(`  topics: ${formatCounts(report.policySurfaceSummary.observedTopics)}`);
  lines.push(`  vendors: ${formatStringList(report.policySurfaceSummary.vendorMentions)}`);
  lines.push(`  privacy choices links: ${formatStringList(report.policySurfaceSummary.privacyChoicesLinks)}`);
  lines.push(`  preference/control links: ${formatStringList(report.policySurfaceSummary.preferenceControlLinks)}`);
  lines.push(`  GPC observed: ${report.policySurfaceSummary.gpcDisclosureObserved}`);
  lines.push(`  Do Not Sell/Share observed: ${report.policySurfaceSummary.doNotSellOrShareLinkObserved}`);
  lines.push(`  Notice at Collection observed: ${report.policySurfaceSummary.noticeAtCollectionObserved}`);
  lines.push(`  AI disclosure observed: ${report.policySurfaceSummary.aiDisclosureObserved}`);
  lines.push(`  policy excerpts: ${report.policySurfaceSummary.policyExcerptCount}`);
  lines.push(`  Nano assists: ${report.policySurfaceSummary.nanoAssistCount} uncertainty=${report.policySurfaceSummary.nanoUncertaintyCount}`);
  lines.push(`  runtime alignment: ${report.policySurfaceSummary.policyRuntimeAlignmentCandidateStatus ?? "none"} criteria=${formatStringList(report.policySurfaceSummary.policyRuntimeAlignmentMatchedCriteria)}`);
  lines.push("");
  lines.push("Google endpoint subtype summary");
  lines.push(`  ${formatCounts(report.googleEndpointSubtypeSummary)}`);
  lines.push("");
  lines.push("Traceability");
  lines.push(`  vendor observations with evidence refs: ${report.traceabilitySummary.vendorObservationsWithEvidenceRefs}`);
  lines.push(`  vendor observations missing evidence refs: ${report.traceabilitySummary.vendorObservationsMissingEvidenceRefs}`);
  lines.push(`  vendor observations with match sources: ${report.traceabilitySummary.vendorObservationsWithMatchSources}`);
  lines.push(`  vendor observations missing match sources: ${report.traceabilitySummary.vendorObservationsMissingMatchSources}`);
  lines.push(`  journeys with raw event refs: ${report.traceabilitySummary.journeysWithRawEventRefs}`);
  lines.push(`  journeys missing raw event refs: ${report.traceabilitySummary.journeysMissingRawEventRefs}`);
  lines.push(`  finding candidates with source refs: ${report.traceabilitySummary.findingCandidatesWithSourceEvidenceRefs}`);
  lines.push(`  finding candidates missing source refs: ${report.traceabilitySummary.findingCandidatesMissingSourceEvidenceRefs}`);
  lines.push(`  eligible finding candidates with source refs: ${report.traceabilitySummary.eligibleFindingCandidatesWithSourceEvidenceRefs}`);
  lines.push(`  eligible finding candidates missing source refs: ${report.traceabilitySummary.eligibleFindingCandidatesMissingSourceEvidenceRefs}`);
  lines.push("");
  lines.push("Evidence excerpts");
  lines.push(`  total: ${report.evidenceExcerptSummary.evidenceExcerptsTotal}`);
  lines.push(`  by kind: ${formatCounts(report.evidenceExcerptSummary.evidenceExcerptsByKind)}`);
  lines.push(`  with artifacts: ${report.evidenceExcerptSummary.excerptsWithArtifactRefs}`);
  lines.push(`  missing source event: ${report.evidenceExcerptSummary.excerptsMissingSourceEvent}`);
  lines.push(`  redacted: ${report.evidenceExcerptSummary.excerptsRedacted}`);
  lines.push(`  internal-only: ${report.evidenceExcerptSummary.excerptsInternalOnly}`);
  lines.push(`  finding candidates with excerpts: ${report.evidenceExcerptSummary.findingCandidatesWithExcerpts}`);
  lines.push(`  finding candidates missing excerpts: ${report.evidenceExcerptSummary.findingCandidatesMissingExcerpts}`);
  lines.push(`  eligible finding candidates with excerpts: ${report.evidenceExcerptSummary.eligibleFindingCandidatesWithExcerpts}`);
  lines.push(`  eligible finding candidates missing excerpts: ${report.evidenceExcerptSummary.eligibleFindingCandidatesMissingExcerpts}`);
  lines.push("");
  lines.push("Finding candidates");
  for (const finding of report.findingCandidateSummary) {
    lines.push(
      `  ${finding.findingKey}: ${finding.eligibility} confidence=${finding.confidence.toFixed(2)} vendors=${formatStringList(finding.relatedVendors)} journeys=${formatStringList(finding.sourceJourneyIds)} limitations=${formatStringList(finding.coverageLimitations)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function endpointSubtypeValues(bundle: CanonicalEvidenceBundle): string[] {
  return bundle.networkEvents.flatMap((event) =>
    event.endpointSubtype ? [event.endpointSubtype] : [],
  );
}

function endpointItems(
  bundle: CanonicalEvidenceBundle,
  predicate: (event: NetworkEvent) => boolean,
  limit = 20,
): EndpointInspectionItem[] {
  const responseByRequest = new Map(
    bundle.networkResponseEvents.flatMap((response) =>
      response.requestId ? [[response.requestId, response]] : [],
    ),
  );
  return bundle.networkEvents
    .filter(predicate)
    .slice(0, limit)
    .map((event) => ({
      hostname: event.hostname,
      path: safePath(event.path),
      queryParamNames: [...event.queryParamNames].sort(),
      initiatorType: event.initiatorType,
      contentType: responseByRequest.get(event.requestId)?.contentType,
      cookieNamesSent: [...event.cookieNamesSent].sort(),
      attributionStatus: event.attributionStatus,
      endpointSubtype: event.endpointSubtype,
      attributionReason: event.attributionReason,
      resolverBasis: [...(event.resolverBasis ?? [])].sort(),
      eventId: event.eventId,
    }))
    .sort(compareEndpointItems);
}

function sortedVendors(vendors: NormalizedVendorObservation[]): VendorInspectionItem[] {
  return vendors
    .map((vendor) => ({
      vendor: vendor.vendor,
      product: vendor.product,
      purpose: vendor.purpose,
      confidence: vendor.confidence,
      basis: [...vendor.basis].sort(),
      matchedEvidenceRefCount: vendor.matchedEvidenceRefs.length,
      matchSourceCount: vendor.matchSources.length,
    }))
    .sort((left, right) =>
      `${left.vendor}:${left.product ?? ""}:${left.purpose}`.localeCompare(
        `${right.vendor}:${right.product ?? ""}:${right.purpose}`,
      ),
    );
}

function journeyItems(journeys: ObservedJourney[], limit = 20): JourneyInspectionItem[] {
  return journeys
    .slice(0, limit)
    .map((journey) => ({
      journeyId: journey.journeyId,
      journeyType: journey.journeyType,
      displayName: journey.displayName,
      vendor: journey.vendor,
      product: journey.product,
      purpose: journey.purpose,
      endpointSubtype: journey.endpointSubtype,
      attributionStatus: journey.attributionStatus,
      observedBehaviors: [...journey.observedBehaviors].sort(),
      confidence: journey.confidence,
    }))
    .sort((left, right) => left.journeyId.localeCompare(right.journeyId));
}

function cookieClassification(
  cookies: CookieEvent[],
  journeys: ObservedJourney[],
): BundleInspectionReport["cookieClassification"] {
  const linked = new Set(journeys.flatMap((journey) => journey.relatedCookies));
  return {
    firstPartyCookies: cookieNames(cookies.filter((cookie) => cookie.cookieParty === "first_party")),
    thirdPartyCookies: cookieNames(cookies.filter((cookie) => cookie.cookieParty === "third_party")),
    firstPartyVendorAssociatedCookies: cookieNames(
      cookies.filter((cookie) =>
        cookie.cookieParty === "first_party" &&
        cookie.vendorAssociated,
      ),
    ),
    cmpCookies: cookieNames(cookies.filter((cookie) => cookie.cookiePurpose === "consent_management")),
    securityInfrastructureCookies: cookieNames(
      cookies.filter((cookie) =>
        cookie.cookiePurpose === "security" ||
        cookie.cookiePurpose === "infrastructure",
      ),
    ),
    unknownCookies: cookieNames(cookies.filter((cookie) => cookie.cookiePurpose === "unknown")),
    cookiesLinkedToJourneys: [...linked].sort(),
  };
}

function consentFlowSummary(bundle: CanonicalEvidenceBundle): ConsentFlowInspectionSummary {
  const traversals = bundle.consentActionAttempts.flatMap((attempt) =>
    attempt.preferenceCenterTraversal ? [attempt.preferenceCenterTraversal] : [],
  );
  return {
    scenariosObserved: sortedCountMap(bundle.consentFlowObservations.map((observation) => observation.scenario)),
    controlsObservedByType: sortedCountMap(
      bundle.consentActionCandidates
        .filter((candidate) => candidate.visible && candidate.enabled)
        .map((candidate) => candidate.actionType),
    ),
    bannerLikelyPresentByScenario: Object.fromEntries(
      bundle.consentFlowObservations
        .map((observation) => [observation.scenario, observation.bannerLikelyPresent] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    actionAttempts: bundle.consentActionAttempts
      .map((attempt) => ({
        scenario: attempt.scenario,
        actionType: attempt.actionType,
        attempted: attempt.attempted,
        succeeded: attempt.succeeded,
        failureReason: attempt.failureReason,
        bannerPresentBefore: attempt.bannerPresentBefore,
        bannerPresentAfter: attempt.bannerPresentAfter,
        viaPreferenceCenter: attempt.viaPreferenceCenter,
        preferenceCenterOpened: attempt.preferenceCenterTraversal?.opened,
        preferenceCenterSecondLayerObserved: attempt.preferenceCenterTraversal?.secondLayerObserved,
        preferenceCenterRejectAttempted: attempt.preferenceCenterTraversal?.attemptedRejectViaPreferenceCenter,
        preferenceCenterSaveAttempted: attempt.preferenceCenterTraversal?.attemptedSaveChoices,
      }))
      .sort((left, right) => `${left.scenario}:${left.actionType}`.localeCompare(`${right.scenario}:${right.actionType}`)),
    comparisons: bundle.consentFlowComparisons
      .map((comparison) => ({
        comparedScenarios: comparison.comparedScenarios,
        vendorsPersistingAfterReject: [...comparison.vendorsPersistingAfterReject].sort(),
        vendorsSuppressedAfterReject: [...comparison.vendorsSuppressedAfterReject].sort(),
        vendorsAppearingOnlyAfterAccept: [...comparison.vendorsAppearingOnlyAfterAccept].sort(),
        cookiesPersistingAfterReject: [...comparison.cookiesPersistingAfterReject].sort(),
        cookiesSetAfterAccept: [...comparison.cookiesSetAfterAccept].sort(),
        collectionEndpointsPersistingAfterReject: [...comparison.collectionEndpointsPersistingAfterReject].sort(),
        collectionEndpointsAppearingOnlyAfterAccept: [...comparison.collectionEndpointsAppearingOnlyAfterAccept].sort(),
        confidence: comparison.confidence,
        coverageLimitations: comparison.coverageLimitations
          .map((limitation) => limitation.limitationKey)
          .sort(),
      }))
      .sort((left, right) => left.comparedScenarios.localeCompare(right.comparedScenarios)),
    journeyPhaseDeltaCount: bundle.consentFlowComparisons.reduce((count, comparison) =>
      count + comparison.journeyPhaseDeltas.length,
    0),
    preferenceCenterTraversalCount: traversals.length,
    preferenceCenterOpenedCount: traversals.filter((traversal) => traversal.openSucceeded).length,
    preferenceCenterSecondLayerObservedCount: traversals.filter((traversal) => traversal.secondLayerObserved).length,
    rejectViaPreferenceCenterAttemptedCount: traversals.filter((traversal) =>
      traversal.attemptedRejectViaPreferenceCenter,
    ).length,
    rejectViaPreferenceCenterSucceededCount: traversals.filter((traversal) =>
      traversal.attemptedRejectViaPreferenceCenter && traversal.succeeded,
    ).length,
    saveChoicesAttemptedCount: traversals.filter((traversal) => traversal.attemptedSaveChoices).length,
    saveChoicesSucceededCount: traversals.filter((traversal) =>
      traversal.attemptedSaveChoices && traversal.succeeded,
    ).length,
    preferenceCenterLimitations: uniqueSorted(
      traversals.flatMap((traversal) => traversal.failureReason ? [traversal.failureReason] : []),
    ),
    nanoAssistCount: bundle.consentActionCandidates.reduce((count, candidate) =>
      count + candidate.assistMetadata.length,
    0),
    nanoUncertaintyCount: bundle.consentActionCandidates.reduce((count, candidate) =>
      count + candidate.assistMetadata.filter((metadata) => metadata.uncertaintyNotes.length > 0).length,
    0),
  };
}

function findingItem(
  finding: FindingCandidate,
  journeys: ObservedJourney[],
): FindingInspectionItem {
  const eventIds = new Set(
    finding.sourceEvidenceRefs.flatMap((ref) => ref.eventId ? [ref.eventId] : []),
  );
  return {
    findingKey: finding.findingKey,
    eligibility: finding.eligibility.status,
    confidence: finding.confidence,
    relatedVendors: uniqueSorted(
      finding.relatedVendors.map((vendor) => vendor.product ?? vendor.vendor),
    ),
    sourceJourneyIds: journeys
      .filter((journey) =>
        journey.eventRefs.some((ref) => eventIds.has(ref.eventId)) ||
        journey.evidenceRefs.some((ref) => ref.eventId && eventIds.has(ref.eventId)),
      )
      .map((journey) => journey.journeyId)
      .sort(),
    sourceEvidenceRefCount: finding.sourceEvidenceRefs.length,
    evidenceExcerptIds: [...finding.evidenceExcerptIds].sort(),
    coverageLimitations: finding.coverageLimitations
      .map((limitation) => limitation.limitationKey)
      .sort(),
  };
}

function evidenceExcerptSummary(
  findings: FindingCandidate[],
  excerpts: Array<{ evidenceKind: string; artifactRefs: unknown[]; sourceEventId?: string; sensitivity: string }>,
): EvidenceExcerptInspectionSummary {
  const eligibleFindings = findings.filter((finding) => finding.eligibility.status === "eligible");
  return {
    evidenceExcerptsTotal: excerpts.length,
    evidenceExcerptsByKind: sortedCountMap(excerpts.map((excerpt) => excerpt.evidenceKind)),
    excerptsWithArtifactRefs: excerpts.filter((excerpt) => excerpt.artifactRefs.length > 0).length,
    excerptsMissingSourceEvent: excerpts.filter((excerpt) => !excerpt.sourceEventId).length,
    excerptsInternalOnly: excerpts.filter((excerpt) => excerpt.sensitivity === "internal_only").length,
    excerptsRedacted: excerpts.filter((excerpt) => excerpt.sensitivity === "redacted").length,
    findingCandidatesWithExcerpts: findings.filter((finding) => finding.evidenceExcerptIds.length > 0).length,
    findingCandidatesMissingExcerpts: findings.filter((finding) => finding.evidenceExcerptIds.length === 0).length,
    eligibleFindingCandidatesWithExcerpts: eligibleFindings.filter((finding) => finding.evidenceExcerptIds.length > 0).length,
    eligibleFindingCandidatesMissingExcerpts: eligibleFindings.filter((finding) => finding.evidenceExcerptIds.length === 0).length,
  };
}

function policySurfaceSummary(
  bundle: CanonicalEvidenceBundle,
  findings: FindingCandidate[],
): PolicySurfaceInspectionSummary {
  const observed = bundle.policySurfaceObservations.filter((observation) =>
    observation.status === "observed" || observation.status === "fetched",
  );
  const policyRuntimeAlignment = findings.find((finding) =>
    finding.findingKey === "policy_runtime_vendor_alignment_review_signal",
  );

  return {
    policySurfacesObserved: observed.length,
    policySurfaceAttempts: bundle.policySurfaceObservations.length,
    policySurfaceStatusCounts: sortedCountMap(bundle.policySurfaceObservations.map((observation) => observation.status)),
    policySurfaceFailedCount: bundle.policySurfaceObservations.filter((observation) => observation.status === "failed").length,
    surfaceTypes: sortedCountMap(observed.map((observation) => observation.surfaceType)),
    failedSurfaceTypes: sortedCountMap(
      bundle.policySurfaceObservations
        .filter((observation) => observation.status === "failed")
        .map((observation) => observation.surfaceType),
    ),
    discoveryMethods: sortedCountMap(bundle.policySurfaceObservations.map((observation) => observation.discoveryMethod)),
    nanoAssistedCandidates: bundle.policySurfaceObservations.filter((observation) =>
      observation.discoveryMethod === "nano_assisted_link_classification",
    ).length,
    observedTopics: sortedCountMap(observed.flatMap((observation) => observation.observedTopics)),
    vendorMentions: uniqueSorted(observed.flatMap((observation) => observation.mentionedVendors)),
    privacyChoicesLinks: observed
      .filter((observation) =>
        observation.surfaceType === "your_privacy_choices" ||
        observation.surfaceType === "cookie_settings" ||
        observation.surfaceType === "consent_preferences",
      )
      .map((observation) => observation.normalizedUrl ?? observation.url)
      .sort(),
    preferenceControlLinks: observed
      .filter((observation) => observation.mayLeadToConsentControls === true)
      .map((observation) => observation.normalizedUrl ?? observation.url)
      .sort(),
    gpcDisclosureObserved: observed.some((observation) =>
      observation.observedTopics.includes("global_privacy_control"),
    ),
    doNotSellOrShareLinkObserved: observed.some((observation) =>
      observation.surfaceType === "do_not_sell_or_share" ||
      observation.observedTopics.includes("do_not_sell_or_share"),
    ),
    noticeAtCollectionObserved: observed.some((observation) =>
      observation.surfaceType === "notice_at_collection" ||
      observation.observedTopics.includes("notice_at_collection"),
    ),
    aiDisclosureObserved: observed.some((observation) =>
      observation.surfaceType === "ai_disclosure" ||
      observation.observedTopics.includes("ai_generated_content"),
    ),
    policyExcerptCount: observed.reduce((count, observation) =>
      count + observation.boundedTextExcerptIds.length,
    0),
    nanoAssistCount: bundle.policySurfaceObservations.reduce((count, observation) =>
      count + observation.assistMetadata.length,
    0),
    nanoUncertaintyCount: bundle.policySurfaceObservations.reduce((count, observation) =>
      count + observation.assistMetadata.filter((metadata) => metadata.uncertaintyNotes.length > 0).length,
    0),
    policyRuntimeAlignmentCandidateStatus: policyRuntimeAlignment?.eligibility.status,
    policyRuntimeAlignmentMatchedCriteria: [...(policyRuntimeAlignment?.matchedCriteria ?? [])].sort(),
  };
}

function traceabilitySummary(
  bundle: CanonicalEvidenceBundle,
  findingCandidates: FindingCandidate[],
): TraceabilityInspectionSummary {
  const eligibleCandidates = findingCandidates.filter((candidate) => candidate.eligibility.status === "eligible");
  return {
    vendorObservationsWithEvidenceRefs: bundle.normalizedVendorObservations.filter((vendor) =>
      vendor.matchedEvidenceRefs.length > 0,
    ).length,
    vendorObservationsMissingEvidenceRefs: bundle.normalizedVendorObservations.filter((vendor) =>
      vendor.matchedEvidenceRefs.length === 0,
    ).length,
    vendorObservationsWithMatchSources: bundle.normalizedVendorObservations.filter((vendor) =>
      vendor.matchSources.length > 0,
    ).length,
    vendorObservationsMissingMatchSources: bundle.normalizedVendorObservations.filter((vendor) =>
      vendor.matchSources.length === 0,
    ).length,
    journeysWithRawEventRefs: bundle.observedJourneys.filter((journey) => journey.eventRefs.length > 0).length,
    journeysMissingRawEventRefs: bundle.observedJourneys.filter((journey) => journey.eventRefs.length === 0).length,
    findingCandidatesWithSourceEvidenceRefs: findingCandidates.filter((candidate) =>
      candidate.sourceEvidenceRefs.length > 0,
    ).length,
    findingCandidatesMissingSourceEvidenceRefs: findingCandidates.filter((candidate) =>
      candidate.sourceEvidenceRefs.length === 0,
    ).length,
    eligibleFindingCandidatesWithSourceEvidenceRefs: eligibleCandidates.filter((candidate) =>
      candidate.sourceEvidenceRefs.length > 0,
    ).length,
    eligibleFindingCandidatesMissingSourceEvidenceRefs: eligibleCandidates.filter((candidate) =>
      candidate.sourceEvidenceRefs.length === 0,
    ).length,
  };
}

function confidenceDistribution(vendors: NormalizedVendorObservation[]): Record<string, number> {
  return fixedCountMap(
    ["high", "medium", "low"],
    vendors.map((vendor) =>
      vendor.confidence >= 0.9 ? "high" : vendor.confidence >= 0.7 ? "medium" : "low",
    ),
  );
}

function cookieNames(cookies: CookieEvent[]): string[] {
  return uniqueSorted(cookies.map((cookie) => cookie.cookieName));
}

function fixedCountMap<T extends string>(keys: readonly T[], values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return sortRecord(counts);
}

function sortedCountMap(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return sortRecord(counts);
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function compareEndpointItems(left: EndpointInspectionItem, right: EndpointInspectionItem): number {
  return `${left.hostname ?? ""}:${left.path ?? ""}:${left.eventId ?? ""}`.localeCompare(
    `${right.hostname ?? ""}:${right.path ?? ""}:${right.eventId ?? ""}`,
  );
}

function safePath(path: string | undefined): string | undefined {
  if (!path) {
    return path;
  }
  const pathParameterIndex = path.indexOf(";");
  if (pathParameterIndex >= 0) {
    return `${path.slice(0, pathParameterIndex)};[redacted]`;
  }
  if (path.length > 160) {
    return `${path.slice(0, 157)}...`;
  }
  return path;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${value}`).join(", ")
    : "none";
}

function formatEndpointList(items: EndpointInspectionItem[]): string {
  return items.length > 0
    ? items.map((item) => `${item.hostname ?? "unknown"}${item.path ?? ""}${item.endpointSubtype ? ` (${item.endpointSubtype})` : ""}`).join("; ")
    : "none";
}

function formatJourneyList(items: JourneyInspectionItem[]): string {
  return items.length > 0
    ? items.map((item) => `${item.displayName} [${item.journeyType}]`).join("; ")
    : "none";
}

function formatVendor(item: VendorInspectionItem): string {
  return `${item.product ?? item.vendor} (${item.purpose}, ${item.confidence.toFixed(2)})`;
}

function formatStringList(values: string[]): string {
  return values.length > 0 ? values.join("|") : "none";
}

function formatBooleanRecord(values: Record<string, boolean>): string {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${value}`).join(", ")
    : "none";
}

function formatConsentAttempts(attempts: ConsentActionAttemptInspectionItem[]): string {
  return attempts.length > 0
    ? attempts.map((attempt) =>
      `${attempt.scenario}:${attempt.actionType}${attempt.viaPreferenceCenter ? ":via_preference_center" : ""}:${attempt.attempted ? "attempted" : "not_attempted"}/${attempt.succeeded ? "succeeded" : "not_succeeded"}${attempt.failureReason ? `:${attempt.failureReason}` : ""}`,
    ).join("; ")
    : "none";
}

function formatConsentComparisons(comparisons: ConsentFlowComparisonInspectionItem[]): string {
  return comparisons.length > 0
    ? comparisons.map((comparison) =>
      `${comparison.comparedScenarios}:persist=${formatStringList([
        ...comparison.vendorsPersistingAfterReject,
        ...comparison.cookiesPersistingAfterReject,
        ...comparison.collectionEndpointsPersistingAfterReject,
      ])}:accept_only=${formatStringList([
        ...comparison.vendorsAppearingOnlyAfterAccept,
        ...comparison.cookiesSetAfterAccept,
        ...comparison.collectionEndpointsAppearingOnlyAfterAccept,
      ])}:limitations=${formatStringList(comparison.coverageLimitations)}`,
    ).join("; ")
    : "none";
}
