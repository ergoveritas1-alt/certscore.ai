import type {
  CookieEvent,
  CookieSnapshot,
  DirectVsInferred,
  IframeEvent,
  JourneyEventRef,
  JourneySummary,
  NetworkEvent,
  NetworkResponseEvent,
  NormalizedVendorObservation,
  ObservedBehavior,
  ObservedJourney,
  RuntimeEvidenceEvent,
  ScriptEvent,
  StorageSnapshot,
} from "@certscore/contracts";

export interface BuildObservedJourneysInput {
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  cookieEvents: CookieEvent[];
  cookieSnapshots: CookieSnapshot[];
  storageSnapshots: StorageSnapshot[];
  scriptEvents: ScriptEvent[];
  iframeEvents: IframeEvent[];
  normalizedVendorObservations: NormalizedVendorObservation[];
}

const trackingPurposes = new Set<NormalizedVendorObservation["purpose"]>([
  "analytics",
  "advertising",
  "session_replay",
]);

const meaningfulNonTrackerPurposes = new Set<NormalizedVendorObservation["purpose"]>([
  "consent_management",
  "tag_management",
  "security",
  "performance_monitoring",
  "customer_support",
]);

export function classifyCookieEvents(
  cookieEvents: CookieEvent[],
  vendors: NormalizedVendorObservation[],
): CookieEvent[] {
  return cookieEvents.map((event) => {
    const relatedVendor = vendorsForCookie(event.cookieName, vendors)[0];
    const cookieParty =
      event.thirdParty === true
        ? "third_party"
        : event.firstParty === true
          ? "first_party"
          : "unknown";
    const cookiePurpose = relatedVendor?.purpose ?? classifyKnownCookiePurpose(event.cookieName);

    return {
      ...event,
      cookieParty,
      vendorAssociated: Boolean(relatedVendor),
      associatedVendorRef: relatedVendor?.observationId,
      cookiePurpose,
      cookieClassificationBasis: [
        cookieParty,
        relatedVendor ? `vendor:${relatedVendor.vendor}` : undefined,
        relatedVendor ? `purpose:${relatedVendor.purpose}` : `name:${cookiePurpose}`,
      ].filter((value): value is string => Boolean(value)),
    };
  });
}

export function buildObservedJourneys(
  input: BuildObservedJourneysInput,
): ObservedJourney[] {
  const allEvents = [
    ...input.networkEvents,
    ...input.networkResponseEvents,
    ...input.cookieEvents,
    ...input.scriptEvents,
    ...input.iframeEvents,
  ];
  const eventById = new Map(allEvents.map((event) => [event.eventId, event]));
  const journeys: ObservedJourney[] = [];

  const meaningfulVendors = input.normalizedVendorObservations.filter(
    (vendor) => vendor.purpose !== "infrastructure" && vendor.purpose !== "unknown",
  );

  const vendorsByName = groupBy(meaningfulVendors, (vendor) => vendor.vendor);
  for (const [vendorName, vendors] of vendorsByName) {
    const refs = eventRefsForVendors(vendors, input, eventById);
    if (refs.length === 0) {
      continue;
    }

    journeys.push(
      journeyFromRefs({
        journeyType: "vendor",
        key: `vendor:${vendorName.toLowerCase()}`,
        displayName: vendorName,
        entity: vendors[0]?.entity,
        vendor: vendorName,
        purpose: dominantPurpose(vendors),
        vendors,
        refs,
        directVsInferred: "mixed",
      }),
    );
  }

  for (const vendor of meaningfulVendors) {
    const refs = eventRefsForVendors([vendor], input, eventById);
    if (refs.length === 0) {
      continue;
    }

    const behaviors = behaviorsForRefs(refs, vendor.purpose);
    const relatedCookies = relatedCookiesForVendor(vendor, input, refs);
    const relatedScripts = relatedScriptsForRefs(refs);
    const relatedEndpoints = relatedEndpointsForRefs(refs);

    journeys.push(
      journeyFromRefs({
        journeyType: "product",
        key: `product:${vendor.observationId}`,
        displayName: vendor.product ?? vendor.vendor,
        entity: vendor.entity,
        vendor: vendor.vendor,
        product: vendor.product,
        purpose: vendor.purpose,
        vendors: [vendor],
        refs,
        relatedCookies,
        relatedScripts,
        relatedEndpoints,
        observedBehaviors: behaviors,
        confidence: vendor.confidence,
        directVsInferred: directnessForBehaviors(behaviors),
      }),
    );

    if (trackingPurposes.has(vendor.purpose) && hasActiveTrackingEvidence(behaviors, refs)) {
      journeys.push(
        journeyFromRefs({
          journeyType: "tracker",
          key: `tracker:${vendor.observationId}`,
          displayName: vendor.product ?? vendor.vendor,
          entity: vendor.entity,
          vendor: vendor.vendor,
          product: vendor.product,
          purpose: vendor.purpose,
          vendors: [vendor],
          refs,
          relatedCookies,
          relatedScripts,
          relatedEndpoints,
          observedBehaviors: behaviors,
          confidence: vendor.confidence,
          directVsInferred: directnessForBehaviors(behaviors),
        }),
      );
    }
  }

  for (const cookieEvent of input.cookieEvents) {
    if (!isMeaningfulCookie(cookieEvent.cookieName, input.normalizedVendorObservations)) {
      continue;
    }
    const refs = [eventRef(cookieEvent, "cookie_set", cookieEvent.cookieName)];
    const relatedVendors = vendorsForCookie(cookieEvent.cookieName, input.normalizedVendorObservations);
    journeys.push(
      journeyFromRefs({
        journeyType: "cookie",
        key: `cookie:${cookieEvent.cookieName.toLowerCase()}`,
        displayName: cookieEvent.cookieName,
        vendor: relatedVendors[0]?.vendor,
        product: relatedVendors[0]?.product,
        purpose: relatedVendors[0]?.purpose,
        vendors: relatedVendors,
        refs,
        relatedCookies: [cookieEvent.cookieName],
        relatedEndpoints: cookieEvent.url ? [cookieEvent.url] : [],
        observedBehaviors: ["cookie_set"],
        confidence: 0.9,
        directVsInferred: "direct",
      }),
    );
  }

  for (const networkEvent of input.networkEvents) {
    const cookieNames = networkEvent.cookieNamesSent;
    for (const cookieName of cookieNames) {
      if (!isMeaningfulCookie(cookieName, input.normalizedVendorObservations)) {
        continue;
      }
      const relatedVendors = vendorsForCookie(cookieName, input.normalizedVendorObservations);
      journeys.push(
        journeyFromRefs({
          journeyType: "cookie",
          key: `cookie_sent:${cookieName.toLowerCase()}:${networkEvent.eventId}`,
          displayName: cookieName,
          vendor: relatedVendors[0]?.vendor,
          product: relatedVendors[0]?.product,
          purpose: relatedVendors[0]?.purpose,
          vendors: relatedVendors,
          refs: [eventRef(networkEvent, "cookie_sent", cookieName)],
          relatedCookies: [cookieName],
          relatedEndpoints: [networkEvent.requestUrl],
          observedBehaviors: ["cookie_sent"],
          confidence: 0.82,
          directVsInferred: "direct",
        }),
      );
    }
  }

  for (const script of input.scriptEvents) {
    const relatedVendors = vendorsForUrl(script.scriptUrl, input.normalizedVendorObservations);
    if (relatedVendors.length === 0) {
      continue;
    }
    const behaviors = relatedVendors.some((vendor) => vendor.purpose === "session_replay")
      ? ["script_loaded", "library_loaded_only", "session_replay_library_observed"] satisfies ObservedBehavior[]
      : relatedVendors.some((vendor) => vendor.purpose === "tag_management")
        ? ["script_loaded", "library_loaded_only", "tag_manager_observed"] satisfies ObservedBehavior[]
      : ["script_loaded", "library_loaded_only"] satisfies ObservedBehavior[];
    journeys.push(
      journeyFromRefs({
        journeyType: "script",
        key: `script:${script.scriptUrl ?? script.eventId}`,
        displayName: script.scriptUrl ?? "Inline script",
        vendor: relatedVendors[0]?.vendor,
        product: relatedVendors[0]?.product,
        purpose: relatedVendors[0]?.purpose,
        vendors: relatedVendors,
        refs: [eventRef(script, "script_loaded", script.scriptUrl)],
        relatedScripts: script.scriptUrl ? [script.scriptUrl] : [],
        observedBehaviors: behaviors,
        confidence: maxVendorConfidence(relatedVendors, 0.75),
        directVsInferred: "direct",
      }),
    );
  }

  for (const frame of input.iframeEvents) {
    const relatedVendors = vendorsForUrl(frame.frameUrl, input.normalizedVendorObservations);
    if (relatedVendors.length === 0) {
      continue;
    }
    journeys.push(
      journeyFromRefs({
        journeyType: "endpoint",
        key: `iframe:${frame.frameUrl ?? frame.eventId}`,
        displayName: frame.frameUrl ?? "Iframe",
        vendor: relatedVendors[0]?.vendor,
        product: relatedVendors[0]?.product,
        purpose: relatedVendors[0]?.purpose,
        vendors: relatedVendors,
        refs: [eventRef(frame, "iframe_loaded", frame.frameUrl)],
        relatedEndpoints: frame.frameUrl ? [frame.frameUrl] : [],
        observedBehaviors: ["iframe_loaded"],
        confidence: maxVendorConfidence(relatedVendors, 0.75),
        directVsInferred: "direct",
      }),
    );
  }

  for (const request of input.networkEvents) {
    const relatedVendors = vendorsForUrl(request.requestUrl, input.normalizedVendorObservations);
    const behaviors = behaviorsForNetworkRequest(request, relatedVendors);
    const hasTrackingVendor = relatedVendors.some((vendor) => trackingPurposes.has(vendor.purpose));
    const attributionStatus = endpointAttributionStatus(request, relatedVendors);
    const isUnresolvedCollectionEndpoint =
      attributionStatus === "unresolved_meaningful" && relatedVendors.length === 0;
    const isSiteOwnedInfrastructureEndpoint =
      attributionStatus === "site_owned_infrastructure" && relatedVendors.length === 0;
    const meaningfulEndpoint =
      isUnresolvedCollectionEndpoint ||
      isSiteOwnedInfrastructureEndpoint ||
      behaviors.includes("collection_endpoint_observed") ||
      behaviors.includes("session_replay_collection_observed") ||
      behaviors.includes("advertising_click_id_observed") ||
      (hasTrackingVendor &&
        behaviors.some((behavior) =>
          [
            "third_party_request_observed",
            "identifier_parameter_observed",
            "cookie_sent",
          ].includes(behavior),
        ));

    if (!meaningfulEndpoint) {
      continue;
    }

    journeys.push(
      journeyFromRefs({
        journeyType: "endpoint",
        key: `endpoint:${request.requestUrl}`,
        displayName: request.hostname ?? request.requestUrl,
        vendor: relatedVendors[0]?.vendor,
        product: relatedVendors[0]?.product,
        purpose: relatedVendors[0]?.purpose,
        vendors: relatedVendors,
        refs: [eventRef(request, primaryBehavior(behaviors), request.requestUrl)],
        relatedCookies: request.cookieNamesSent,
        relatedEndpoints: [request.requestUrl],
        observedBehaviors: behaviors,
        confidence: maxVendorConfidence(
          relatedVendors,
          isUnresolvedCollectionEndpoint ? 0.58 : isSiteOwnedInfrastructureEndpoint ? 0.52 : request.collectionEndpointObserved ? 0.86 : 0.7,
        ),
        directVsInferred: isUnresolvedCollectionEndpoint || isSiteOwnedInfrastructureEndpoint ? "inferred" : "direct",
        endpointSubtype: request.endpointSubtype,
        attributionStatus,
        attributionReason: endpointAttributionReason(request, relatedVendors),
        resolverBasis: endpointResolverBasis(request, relatedVendors),
        endpointGeographyStatus: request.endpointGeographyStatus,
        endpointGeographyRegion: request.endpointGeographyRegion,
        endpointGeographyProvider: request.endpointGeographyProvider,
        endpointGeographyLocationLabel: request.endpointGeographyLocationLabel,
        endpointGeographyJurisdiction: request.endpointGeographyJurisdiction,
        endpointGeographyPrecision: request.endpointGeographyPrecision,
        endpointGeographyBasis: request.endpointGeographyBasis,
        relatedEvidenceRefs: endpointRelatedEvidenceRefs(request),
      }),
    );
  }

  for (const vendor of meaningfulVendors.filter((item) => item.purpose === "consent_management")) {
    const refs = eventRefsForVendors([vendor], input, eventById);
    if (refs.length === 0) {
      continue;
    }
    journeys.push(
      journeyFromRefs({
        journeyType: "product",
        key: `cmp:${vendor.observationId}`,
        displayName: vendor.product ?? vendor.vendor,
        entity: vendor.entity,
        vendor: vendor.vendor,
        product: vendor.product,
        purpose: vendor.purpose,
        vendors: [vendor],
        refs,
        observedBehaviors: ["consent_management_observed"],
        confidence: vendor.confidence,
        directVsInferred: "direct",
      }),
    );
  }

  return dedupeJourneys(journeys).sort(
    (left, right) => left.firstObservedAtMs - right.firstObservedAtMs,
  );
}

export function summarizeObservedJourneys(journeys: ObservedJourney[]): JourneySummary {
  return {
    journeyCount: journeys.length,
    vendorJourneyCount: countType(journeys, "vendor"),
    productJourneyCount: countType(journeys, "product"),
    trackerJourneyCount: countType(journeys, "tracker"),
    cookieJourneyCount: countType(journeys, "cookie"),
    scriptJourneyCount: countType(journeys, "script"),
    endpointJourneyCount: countType(journeys, "endpoint"),
    activeCollectionJourneyCount: journeys.filter((journey) =>
      journey.observedBehaviors.some((behavior) =>
        [
          "collection_endpoint_observed",
          "identifier_parameter_observed",
          "advertising_click_id_observed",
          "cookie_sent",
          "session_replay_collection_observed",
        ].includes(behavior),
      ),
    ).length,
    consentManagementJourneyCount: journeys.filter((journey) =>
      journey.observedBehaviors.includes("consent_management_observed"),
    ).length,
    notes: [],
  };
}

function eventRefsForVendors(
  vendors: NormalizedVendorObservation[],
  input: BuildObservedJourneysInput,
  eventById: Map<string, RuntimeEvidenceEvent>,
): JourneyEventRef[] {
  const refs: JourneyEventRef[] = [];
  const evidenceIds = new Set(vendors.flatMap((vendor) => vendor.matchedEvidenceIds));

  for (const eventId of evidenceIds) {
    const event = eventById.get(eventId);
    if (event) {
      refs.push(eventRef(event, behaviorForEvent(event, dominantPurpose(vendors))));
    }
  }

  for (const event of [
    ...input.networkEvents,
    ...input.networkResponseEvents,
    ...input.scriptEvents,
    ...input.iframeEvents,
    ...input.cookieEvents,
  ]) {
    if (refs.some((ref) => ref.eventId === event.eventId)) {
      continue;
    }
    if (eventMatchesAnyVendor(event, vendors)) {
      refs.push(eventRef(event, behaviorForEvent(event, dominantPurpose(vendors))));
    }
  }

  return refs.sort((left, right) => left.timestampMs - right.timestampMs);
}

function eventMatchesAnyVendor(
  event: RuntimeEvidenceEvent,
  vendors: NormalizedVendorObservation[],
): boolean {
  const url = urlForEvent(event);
  return vendors.some((vendor) => {
    const urlMatch = url ? vendor.matchedUrls.includes(url) : false;
    const cookieMatch =
      event.eventType === "cookie" &&
      "cookieName" in event &&
      typeof event.cookieName === "string" &&
      vendor.matchedCookieNames.includes(event.cookieName);
    return urlMatch || cookieMatch;
  });
}

function behaviorForEvent(
  event: RuntimeEvidenceEvent,
  purpose: NormalizedVendorObservation["purpose"] | undefined,
): ObservedBehavior {
  if (event.eventType === "script") {
    if (purpose === "session_replay") {
      return "session_replay_library_observed";
    }
    if (purpose === "tag_management") {
      return "tag_manager_observed";
    }
    return "script_loaded";
  }
  if (event.eventType === "iframe") {
    return "iframe_loaded";
  }
  if (event.eventType === "cookie") {
    return "cookie_set";
  }
  if (event.eventType === "network_request" && "collectionEndpointObserved" in event) {
    const networkEvent = event as Partial<NetworkEvent>;
    if (networkEvent.collectionEndpointObserved) {
      return purpose === "session_replay"
        ? "session_replay_collection_observed"
        : "collection_endpoint_observed";
    }
    if (networkEvent.hasAdvertisingClickIdParameters) {
      return "advertising_click_id_observed";
    }
    if (networkEvent.hasIdentifierLikeParameters) {
      return "identifier_parameter_observed";
    }
    if (networkEvent.cookieHeaderPresent) {
      return "cookie_sent";
    }
  }
  return event.thirdParty ? "third_party_request_observed" : "library_loaded_only";
}

function behaviorsForRefs(
  refs: JourneyEventRef[],
  purpose: NormalizedVendorObservation["purpose"],
): ObservedBehavior[] {
  const behaviors = unique(refs.flatMap((ref) => ref.behavior ? [ref.behavior] : []));
  if (purpose === "consent_management") {
    behaviors.push("consent_management_observed");
  }
  if (purpose === "tag_management") {
    behaviors.push("tag_manager_observed");
  }
  if (
    purpose === "session_replay" &&
    behaviors.includes("script_loaded") &&
    !behaviors.includes("session_replay_library_observed")
  ) {
    behaviors.push("session_replay_library_observed");
  }
  if (
    purpose === "session_replay" &&
    behaviors.includes("collection_endpoint_observed") &&
    !behaviors.includes("session_replay_collection_observed")
  ) {
    behaviors.push("session_replay_collection_observed");
  }
  if (
    behaviors.includes("script_loaded") &&
    !behaviors.some((behavior) =>
      [
        "collection_endpoint_observed",
        "cookie_set",
        "cookie_sent",
        "identifier_parameter_observed",
        "advertising_click_id_observed",
        "session_replay_collection_observed",
      ].includes(behavior),
    )
  ) {
    behaviors.push("library_loaded_only");
  }
  return unique(behaviors);
}

function behaviorsForNetworkRequest(
  request: NetworkEvent,
  vendors: NormalizedVendorObservation[],
): ObservedBehavior[] {
  const behaviors: ObservedBehavior[] = [];
  if (request.thirdParty) {
    behaviors.push("third_party_request_observed");
  }
  if (request.collectionEndpointObserved) {
    behaviors.push(
      vendors.some((vendor) => vendor.purpose === "session_replay")
        ? "session_replay_collection_observed"
        : "collection_endpoint_observed",
    );
  }
  if (request.cookieHeaderPresent) {
    behaviors.push("cookie_sent");
  }
  if (request.hasIdentifierLikeParameters) {
    behaviors.push("identifier_parameter_observed");
  }
  if (request.hasAdvertisingClickIdParameters) {
    behaviors.push("advertising_click_id_observed");
  }
  if (request.hasTagContainerParameters || vendors.some((vendor) => vendor.purpose === "tag_management")) {
    behaviors.push("tag_manager_observed");
  }
  return unique(behaviors);
}

function journeyFromRefs(input: {
  journeyType: ObservedJourney["journeyType"];
  key: string;
  displayName: string;
  entity?: string;
  vendor?: string;
  product?: string;
  purpose?: NormalizedVendorObservation["purpose"];
  vendors?: NormalizedVendorObservation[];
  refs: JourneyEventRef[];
  relatedCookies?: string[];
  relatedScripts?: string[];
  relatedEndpoints?: string[];
  observedBehaviors?: ObservedBehavior[];
  endpointSubtype?: ObservedJourney["endpointSubtype"];
  attributionStatus?: ObservedJourney["attributionStatus"];
  attributionReason?: string;
  resolverBasis?: string[];
  endpointGeographyStatus?: ObservedJourney["endpointGeographyStatus"];
  endpointGeographyRegion?: ObservedJourney["endpointGeographyRegion"];
  endpointGeographyProvider?: ObservedJourney["endpointGeographyProvider"];
  endpointGeographyLocationLabel?: ObservedJourney["endpointGeographyLocationLabel"];
  endpointGeographyJurisdiction?: ObservedJourney["endpointGeographyJurisdiction"];
  endpointGeographyPrecision?: ObservedJourney["endpointGeographyPrecision"];
  endpointGeographyBasis?: ObservedJourney["endpointGeographyBasis"];
  relatedEvidenceRefs?: ObservedJourney["relatedEvidenceRefs"];
  confidence?: number;
  directVsInferred?: DirectVsInferred;
}): ObservedJourney {
  const refs = input.refs.sort((left, right) => left.timestampMs - right.timestampMs);
  const firstRef = refs[0];
  const lastRef = refs[refs.length - 1] ?? firstRef;
  const behaviors = input.observedBehaviors ?? behaviorsForRefs(refs, input.purpose ?? "unknown");
  const vendors = input.vendors ?? [];
  const scenariosObserved = unique(refs.flatMap((ref) => ref.scenario ? [ref.scenario] : []));
  const consentStatesObserved = unique(refs.flatMap((ref) => ref.consentStateAtTime ? [ref.consentStateAtTime] : []));

  return {
    journeyId: stableJourneyId(input.journeyType, input.key),
    journeyType: input.journeyType,
    key: input.key,
    displayName: input.displayName,
    entity: input.entity,
    vendor: input.vendor,
    product: input.product,
    purpose: input.purpose,
    sourceScanner: "pre_consent_runtime",
    scenariosObserved: scenariosObserved.length > 0 ? scenariosObserved : ["fresh_pre_consent"],
    firstObservedAtMs: firstRef?.timestampMs ?? 0,
    lastObservedAtMs: lastRef?.timestampMs ?? firstRef?.timestampMs ?? 0,
    firstObservedConsentState: firstRef?.consentStateAtTime ?? "pre_consent",
    consentStatesObserved: consentStatesObserved.length > 0 ? consentStatesObserved : ["pre_consent"],
    firstPartyOrThirdParty: partyForRefs(refs),
    entryPoint: firstRef?.url,
    entryPointSourceEventId: firstRef?.eventId,
    relatedCookies: unique([
      ...(input.relatedCookies ?? []),
      ...vendors.flatMap((vendor) => vendor.matchedCookieNames),
    ]),
    relatedScripts: unique(input.relatedScripts ?? []),
    relatedEndpoints: unique(input.relatedEndpoints ?? []),
    relatedVendors: unique(vendors.map((vendor) => vendor.vendor)),
    relatedVendorObservationIds: unique(vendors.map((vendor) => vendor.observationId)),
    observedBehaviors: unique(behaviors),
    endpointSubtype: input.endpointSubtype,
    attributionStatus: input.attributionStatus,
    attributionReason: input.attributionReason,
    resolverBasis: input.resolverBasis ?? [],
    endpointGeographyStatus: input.endpointGeographyStatus ?? endpointGeographyStatusForRefs(refs),
    endpointGeographyRegion: input.endpointGeographyRegion ?? endpointGeographyRegionForRefs(refs),
    endpointGeographyProvider: input.endpointGeographyProvider ?? endpointGeographyProviderForRefs(refs),
    endpointGeographyLocationLabel: input.endpointGeographyLocationLabel ?? endpointGeographyLocationLabelForRefs(refs),
    endpointGeographyJurisdiction: input.endpointGeographyJurisdiction ?? endpointGeographyJurisdictionForRefs(refs),
    endpointGeographyPrecision: input.endpointGeographyPrecision ?? endpointGeographyPrecisionForRefs(refs),
    endpointGeographyBasis: input.endpointGeographyBasis ?? endpointGeographyBasisForRefs(refs),
    relatedEvidenceRefs: input.relatedEvidenceRefs ?? [],
    eventRefs: refs,
    phaseDeltas: [],
    confidence: input.confidence ?? maxVendorConfidence(vendors, 0.75),
    directVsInferred: input.directVsInferred ?? directnessForBehaviors(behaviors),
    evidenceRefs: refs.map((ref) => ({
      refId: `ref_${ref.eventId}`,
      eventId: ref.eventId,
      eventType: ref.eventType,
      label: ref.label,
      url: ref.url,
    })),
  };
}

function eventRef(
  event: RuntimeEvidenceEvent,
  behavior: ObservedBehavior,
  label?: string,
): JourneyEventRef {
  const networkEvent = event.eventType === "network_request" ? event as Partial<NetworkEvent> : undefined;
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    timestampMs: event.timestampMs,
    url: urlForEvent(event),
    label,
    behavior,
    firstParty: event.firstParty,
    thirdParty: event.thirdParty,
    scenario: event.scenario,
    consentStateAtTime: event.consentStateAtTime,
    endpointGeographyStatus: networkEvent?.endpointGeographyStatus,
    endpointGeographyRegion: networkEvent?.endpointGeographyRegion,
    endpointGeographyProvider: networkEvent?.endpointGeographyProvider,
    endpointGeographyLocationLabel: networkEvent?.endpointGeographyLocationLabel,
    endpointGeographyJurisdiction: networkEvent?.endpointGeographyJurisdiction,
    endpointGeographyPrecision: networkEvent?.endpointGeographyPrecision,
    endpointGeographyBasis: networkEvent?.endpointGeographyBasis,
  };
}

function endpointGeographyStatusForRefs(refs: JourneyEventRef[]): ObservedJourney["endpointGeographyStatus"] | undefined {
  if (refs.some((ref) => ref.endpointGeographyStatus === "region_observed")) {
    return "region_observed";
  }
  if (refs.some((ref) => ref.endpointGeographyStatus === "unknown")) {
    return "unknown";
  }
  if (refs.some((ref) => ref.endpointGeographyStatus === "not_evaluated")) {
    return "not_evaluated";
  }
  return undefined;
}

function endpointGeographyRegionForRefs(refs: JourneyEventRef[]): ObservedJourney["endpointGeographyRegion"] | undefined {
  return refs.find((ref) => ref.endpointGeographyRegion)?.endpointGeographyRegion;
}

function endpointGeographyProviderForRefs(refs: JourneyEventRef[]): ObservedJourney["endpointGeographyProvider"] | undefined {
  return refs.find((ref) => ref.endpointGeographyProvider)?.endpointGeographyProvider;
}

function endpointGeographyLocationLabelForRefs(
  refs: JourneyEventRef[],
): ObservedJourney["endpointGeographyLocationLabel"] | undefined {
  return refs.find((ref) => ref.endpointGeographyLocationLabel)?.endpointGeographyLocationLabel;
}

function endpointGeographyJurisdictionForRefs(
  refs: JourneyEventRef[],
): ObservedJourney["endpointGeographyJurisdiction"] | undefined {
  return refs.find((ref) => ref.endpointGeographyJurisdiction)?.endpointGeographyJurisdiction;
}

function endpointGeographyPrecisionForRefs(
  refs: JourneyEventRef[],
): ObservedJourney["endpointGeographyPrecision"] | undefined {
  return refs.find((ref) => ref.endpointGeographyPrecision)?.endpointGeographyPrecision;
}

function endpointGeographyBasisForRefs(refs: JourneyEventRef[]): ObservedJourney["endpointGeographyBasis"] | undefined {
  const basis = unique(refs.flatMap((ref) => ref.endpointGeographyBasis ?? []));
  return basis.length > 0 ? basis : undefined;
}

function urlForEvent(event: RuntimeEvidenceEvent): string | undefined {
  if (event.eventType === "network_request" && "requestUrl" in event) {
    return (event as Partial<NetworkEvent>).requestUrl;
  }
  if (event.eventType === "network_response" && "responseUrl" in event) {
    return (event as Partial<NetworkResponseEvent>).responseUrl;
  }
  if (event.eventType === "script" && "scriptUrl" in event) {
    return (event as Partial<ScriptEvent>).scriptUrl;
  }
  if (event.eventType === "iframe" && "frameUrl" in event) {
    return (event as Partial<IframeEvent>).frameUrl;
  }
  return event.url;
}

function vendorsForUrl(
  url: string | undefined,
  vendors: NormalizedVendorObservation[],
): NormalizedVendorObservation[] {
  if (!url) {
    return [];
  }
  return vendors.filter((vendor) =>
    vendor.matchedUrls.includes(url),
  );
}

function vendorsForCookie(
  cookieName: string,
  vendors: NormalizedVendorObservation[],
): NormalizedVendorObservation[] {
  const normalized = cookieName.toLowerCase();
  return vendors.filter((vendor) =>
    vendor.matchedCookieNames.some((name) => name.toLowerCase() === normalized),
  );
}

function relatedCookiesForVendor(
  vendor: NormalizedVendorObservation,
  input: BuildObservedJourneysInput,
  refs: JourneyEventRef[],
): string[] {
  const names = new Set(vendor.matchedCookieNames);
  const refIds = new Set(refs.map((ref) => ref.eventId));
  for (const event of input.cookieEvents) {
    if (refIds.has(event.eventId)) {
      names.add(event.cookieName);
    }
  }
  for (const event of input.networkEvents) {
    if (refIds.has(event.eventId)) {
      for (const cookieName of event.cookieNamesSent) {
        names.add(cookieName);
      }
    }
  }
  return [...names];
}

function relatedScriptsForRefs(refs: JourneyEventRef[]): string[] {
  return unique(
    refs
      .filter((ref) => ref.eventType === "script")
      .flatMap((ref) => ref.url ? [ref.url] : []),
  );
}

function relatedEndpointsForRefs(refs: JourneyEventRef[]): string[] {
  return unique(
    refs
      .filter((ref) => ref.eventType === "network_request" || ref.eventType === "iframe")
      .flatMap((ref) => ref.url ? [ref.url] : []),
  );
}

function isMeaningfulCookie(
  cookieName: string,
  vendors: NormalizedVendorObservation[],
): boolean {
  return vendors.some((vendor) =>
    vendor.matchedCookieNames.some((name) => name.toLowerCase() === cookieName.toLowerCase()),
  );
}

function hasActiveTrackingBehavior(behaviors: ObservedBehavior[]): boolean {
  return behaviors.some((behavior) =>
    [
      "collection_endpoint_observed",
      "cookie_set",
      "cookie_sent",
      "identifier_parameter_observed",
      "advertising_click_id_observed",
      "session_replay_collection_observed",
    ].includes(behavior),
  );
}

function hasActiveTrackingEvidence(
  behaviors: ObservedBehavior[],
  refs: JourneyEventRef[],
): boolean {
  if (
    behaviors.some((behavior) =>
      [
        "collection_endpoint_observed",
        "cookie_sent",
        "identifier_parameter_observed",
        "advertising_click_id_observed",
        "session_replay_collection_observed",
      ].includes(behavior),
    )
  ) {
    return true;
  }
  if (behaviors.includes("cookie_set")) {
    return refs.some((ref) => ref.behavior === "cookie_set" && ref.thirdParty === true);
  }
  return false;
}

function endpointAttributionStatus(
  request: NetworkEvent,
  vendors: NormalizedVendorObservation[],
): ObservedJourney["attributionStatus"] {
  if (vendors.length > 0) {
    return "resolved";
  }
  if (request.attributionStatus) {
    return request.attributionStatus;
  }
  return request.collectionEndpointObserved ? "unresolved_meaningful" : "ignored_noise";
}

function endpointAttributionReason(
  request: NetworkEvent,
  vendors: NormalizedVendorObservation[],
): string {
  if (vendors.length > 0) {
    return "matched_normalized_vendor_observation";
  }
  return request.attributionReason ?? (
    request.collectionEndpointObserved
      ? "collection_like_endpoint_without_confident_vendor_mapping"
      : "request_without_collection_or_vendor_signal"
  );
}

function endpointResolverBasis(
  request: NetworkEvent,
  vendors: NormalizedVendorObservation[],
): string[] {
  if (vendors.length > 0) {
    return unique(vendors.flatMap((vendor) => vendor.basis));
  }
  return request.resolverBasis ?? [];
}

function endpointRelatedEvidenceRefs(request: NetworkEvent): ObservedJourney["relatedEvidenceRefs"] {
  return (request.relatedEvidenceRefs?.length ?? 0) > 0
    ? request.relatedEvidenceRefs ?? []
    : [
      {
        refId: `ref_${request.eventId}`,
        eventId: request.eventId,
        eventType: request.eventType,
        url: request.requestUrl,
      },
    ];
}

function primaryBehavior(behaviors: ObservedBehavior[]): ObservedBehavior {
  return behaviors[0] ?? "third_party_request_observed";
}

function directnessForBehaviors(behaviors: ObservedBehavior[]): DirectVsInferred {
  if (hasActiveTrackingBehavior(behaviors)) {
    return "direct";
  }
  if (behaviors.includes("library_loaded_only")) {
    return "inferred";
  }
  return "direct";
}

function dominantPurpose(
  vendors: NormalizedVendorObservation[],
): NormalizedVendorObservation["purpose"] | undefined {
  return vendors.find((vendor) => !meaningfulNonTrackerPurposes.has(vendor.purpose))?.purpose ?? vendors[0]?.purpose;
}

function maxVendorConfidence(vendors: NormalizedVendorObservation[], fallback: number): number {
  return Math.max(fallback, ...vendors.map((vendor) => vendor.confidence));
}

function partyForRefs(refs: JourneyEventRef[]): ObservedJourney["firstPartyOrThirdParty"] {
  const thirdParty = refs.some((ref) => ref.thirdParty === true);
  const firstParty = refs.some((ref) => ref.firstParty === true);
  if (thirdParty && firstParty) {
    return "mixed";
  }
  if (thirdParty) {
    return "third_party";
  }
  if (firstParty) {
    return "first_party";
  }
  return "unknown";
}

function countType(
  journeys: ObservedJourney[],
  journeyType: ObservedJourney["journeyType"],
): number {
  return journeys.filter((journey) => journey.journeyType === journeyType).length;
}

function dedupeJourneys(journeys: ObservedJourney[]): ObservedJourney[] {
  const byId = new Map<string, ObservedJourney>();
  for (const journey of journeys) {
    const existing = byId.get(journey.journeyId);
    if (!existing) {
      byId.set(journey.journeyId, journey);
      continue;
    }
    byId.set(journey.journeyId, {
      ...existing,
      lastObservedAtMs: Math.max(existing.lastObservedAtMs, journey.lastObservedAtMs),
      relatedCookies: unique([...existing.relatedCookies, ...journey.relatedCookies]),
      relatedScripts: unique([...existing.relatedScripts, ...journey.relatedScripts]),
      relatedEndpoints: unique([...existing.relatedEndpoints, ...journey.relatedEndpoints]),
      relatedVendors: unique([...existing.relatedVendors, ...journey.relatedVendors]),
      relatedVendorObservationIds: unique([
        ...existing.relatedVendorObservationIds,
        ...journey.relatedVendorObservationIds,
      ]),
      observedBehaviors: unique([...existing.observedBehaviors, ...journey.observedBehaviors]),
      endpointSubtype: existing.endpointSubtype ?? journey.endpointSubtype,
      attributionStatus: existing.attributionStatus ?? journey.attributionStatus,
      attributionReason: existing.attributionReason ?? journey.attributionReason,
      resolverBasis: unique([...(existing.resolverBasis ?? []), ...(journey.resolverBasis ?? [])]),
      relatedEvidenceRefs: uniqueEvidenceRefs([...(existing.relatedEvidenceRefs ?? []), ...(journey.relatedEvidenceRefs ?? [])]),
      eventRefs: uniqueEventRefs([...existing.eventRefs, ...journey.eventRefs]),
      evidenceRefs: uniqueEvidenceRefs([...existing.evidenceRefs, ...journey.evidenceRefs]),
      confidence: Math.max(existing.confidence, journey.confidence),
      directVsInferred:
        existing.directVsInferred === "direct" || journey.directVsInferred === "direct"
          ? "direct"
          : existing.directVsInferred,
    });
  }
  return [...byId.values()];
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueEventRefs(refs: JourneyEventRef[]): JourneyEventRef[] {
  const byKey = new Map<string, JourneyEventRef>();
  for (const ref of refs) {
    byKey.set(`${ref.eventId}:${ref.behavior ?? ""}`, ref);
  }
  return [...byKey.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function uniqueEvidenceRefs(
  refs: ObservedJourney["evidenceRefs"],
): ObservedJourney["evidenceRefs"] {
  const byKey = new Map<string, ObservedJourney["evidenceRefs"][number]>();
  for (const ref of refs) {
    byKey.set(ref.refId, ref);
  }
  return [...byKey.values()];
}

function stableJourneyId(type: string, key: string): string {
  let hash = 0;
  const raw = `${type}:${key}`.toLowerCase();
  for (const char of raw) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `journey_${hash.toString(16)}`;
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function classifyKnownCookiePurpose(cookieName: string): CookieEvent["cookiePurpose"] {
  if (/^(OptanonConsent|OptanonAlertBoxClosed|CookieConsent|didomi_token|euconsent-v2)$/i.test(cookieName)) {
    return "consent_management";
  }
  if (/^(_abck|bm_sz|ak_bmsc|akaas_|akamai_|__cf_bm)/i.test(cookieName)) {
    return "security";
  }
  if (/^_ga(?:_.+)?$|^_gid$|^_gat|^_lfa(?:_.*)?$/i.test(cookieName)) {
    return "analytics";
  }
  return "unknown";
}
