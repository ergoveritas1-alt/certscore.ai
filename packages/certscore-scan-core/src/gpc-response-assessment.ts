import {
  GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION,
  gpcResponseAssessmentSchema,
  type CanonicalEvidenceBundle,
  type GpcComparisonDelta,
  type GpcResponseAssessment,
} from "@certscore/contracts";

export type GpcVerifiedArtifactPointer = {
  sha256: string;
  sizeBytes: number;
  uri: string;
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim().slice(0, 500)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 100);
}

function compareSets(baselineValues: Iterable<string>, gpcValues: Iterable<string>): GpcComparisonDelta {
  const baselineRows = [...baselineValues].map((value) => value.trim()).filter(Boolean);
  const gpcRows = [...gpcValues].map((value) => value.trim()).filter(Boolean);
  const baseline = new Set(uniqueSorted(baselineRows));
  const gpc = new Set(uniqueSorted(gpcRows));
  return {
    baselineCount: baselineRows.length,
    gpcCount: gpcRows.length,
    countDelta: gpcRows.length - baselineRows.length,
    baselineOnly: uniqueSorted([...baseline].filter((value) => !gpc.has(value))),
    gpcOnly: uniqueSorted([...gpc].filter((value) => !baseline.has(value))),
    shared: uniqueSorted([...baseline].filter((value) => gpc.has(value))),
  };
}

function cookieIdentities(bundle: CanonicalEvidenceBundle) {
  return uniqueSorted([
    ...bundle.cookieEvents.map((event) => [
      event.cookieName,
      event.cookieDomain ?? event.hostname ?? "unknown-domain",
      event.cookiePath ?? "/",
    ].join("@")),
    ...bundle.cookieSnapshots.flatMap((snapshot) => snapshot.cookies.map((cookie) => [
      cookie.name,
      cookie.domain,
      cookie.path ?? "/",
    ].join("@"))),
  ]);
}

function trackerIdentities(bundle: CanonicalEvidenceBundle) {
  const trackerPurposes = new Set(["advertising", "analytics", "marketing", "session_replay"]);
  return uniqueSorted([
    ...bundle.observedJourneys
      .filter((journey) => journey.journeyType === "tracker")
      .map((journey) => `${journey.vendor ?? journey.entity ?? "unknown"}|${journey.product ?? journey.displayName}|${journey.key}`),
    ...bundle.normalizedVendorObservations
      .filter((observation) => trackerPurposes.has(observation.purpose))
      .map((observation) => `${observation.vendor}|${observation.product ?? "unspecified"}|${observation.purpose}`),
  ]);
}

function advertisingOrMeasurementIdentities(bundle: CanonicalEvidenceBundle) {
  const relevantPurposes = new Set(["advertising", "analytics", "marketing", "performance_monitoring", "session_replay"]);
  const relevantVendors = bundle.normalizedVendorObservations
    .filter((observation) => relevantPurposes.has(observation.purpose));
  const relevantEvidenceIds = new Set(relevantVendors.flatMap((observation) => observation.matchedEvidenceIds));
  const relevantVendorObservationIds = new Set(relevantVendors.map((observation) => observation.observationId));
  return [
    ...bundle.normalizedVendorObservations
      .filter((observation) => relevantPurposes.has(observation.purpose))
      .map((observation) => `${observation.vendor}|${observation.product ?? "unspecified"}|${observation.purpose}`),
    ...bundle.observedJourneys
      .filter((journey) => Boolean(journey.purpose && relevantPurposes.has(journey.purpose)))
      .map((journey) => `${journey.vendor ?? journey.entity ?? "unknown"}|${journey.product ?? journey.displayName}|${journey.purpose}`),
    ...bundle.networkEvents
      .filter((event) =>
        relevantEvidenceIds.has(event.eventId) ||
        Boolean(event.normalizedVendorRef && relevantVendorObservationIds.has(event.normalizedVendorRef)) ||
        event.endpointSubtype === "google_ads_or_measurement" ||
        /advertis|analytic|measure|session_replay/i.test(event.endpointCategory ?? "")
      )
      .map((event) => `request:${event.requestHostname ?? event.hostname ?? "unknown"}${event.path ?? "/"}`),
  ];
}

function consentOrCmpIdentities(bundle: CanonicalEvidenceBundle) {
  return uniqueSorted([
    ...bundle.normalizedVendorObservations
      .filter((observation) => observation.purpose === "consent_management")
      .map((observation) => `vendor:${observation.vendor}|${observation.product ?? "unspecified"}`),
    ...bundle.cmpRuntimeObservations.flatMap((observation) => [
      `runtime:${observation.vendor}|${observation.product ?? "unspecified"}`,
      ...observation.signals.map((signal) =>
        `signal:${observation.vendor}|${signal.signalType}|${signal.matchedField}|${signal.matchedValueRedacted}`
      ),
    ]),
    ...bundle.consentUiObservations.flatMap((observation) => [
      [
        "surface",
        observation.likelyPresent ? "present" : "not_present",
        observation.captureStatus ?? "unknown_capture",
        observation.inventoryOutcome ?? "unknown_inventory",
        `accept=${observation.acceptControlObserved}`,
        `reject=${observation.rejectControlObserved}`,
        `options=${observation.managePreferencesControlObserved}`,
        `prechecked=${observation.precheckedOptionalPurposeCount}`,
      ].join(":"),
      ...observation.controls.map((control) => [
        "control",
        control.actionType,
        control.visible ? "visible" : "not_visible",
        control.presentationType ?? "unknown_presentation",
        control.placementType ?? "unknown_placement",
      ].join(":")),
    ]),
  ]);
}

function normalizedDocument(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function representativeLane(bundle: CanonicalEvidenceBundle, lane: "runtime_evidence" | "gpc_observation") {
  return bundle.scanLaneRuns.find((run) => run.laneId === lane);
}

function hasObservableDelta(delta: GpcComparisonDelta) {
  return delta.baselineOnly.length > 0 || delta.gpcOnly.length > 0 || delta.countDelta !== 0;
}

export function buildGpcResponseAssessment(input: {
  baseline: CanonicalEvidenceBundle;
  baselineArtifact: GpcVerifiedArtifactPointer;
  generatedAt?: string;
  gpc: CanonicalEvidenceBundle;
  gpcArtifact: GpcVerifiedArtifactPointer;
}): GpcResponseAssessment {
  const baselineLane = representativeLane(input.baseline, "runtime_evidence");
  const gpcLane = representativeLane(input.gpc, "gpc_observation");
  const gpcHeaderEvents = input.gpc.networkEvents.filter((event) => event.requestHeaders?.secGpc === "1");
  const limitationKeys = new Set<string>();

  if (gpcHeaderEvents.length === 0) limitationKeys.add("sec_gpc_header_not_retained");
  if (!baselineLane || baselineLane.accessOutcome !== "representative_page") {
    limitationKeys.add("baseline_not_representative");
  }
  if (!gpcLane || gpcLane.accessOutcome !== "representative_page") {
    limitationKeys.add("gpc_condition_not_representative");
  }
  if (!input.baseline.runtimeCoverage || !["usable", "limited_partial"].includes(input.baseline.runtimeCoverage.coverageStatus)) {
    limitationKeys.add("baseline_runtime_coverage_insufficient");
  }
  if (!input.gpc.runtimeCoverage || !["usable", "limited_partial"].includes(input.gpc.runtimeCoverage.coverageStatus)) {
    limitationKeys.add("gpc_runtime_coverage_insufficient");
  }
  const baselineDocument = normalizedDocument(baselineLane?.firstEffectiveUrl ?? input.baseline.normalizedUrl);
  const gpcDocument = normalizedDocument(gpcLane?.firstEffectiveUrl ?? input.gpc.normalizedUrl);
  if (!baselineDocument || !gpcDocument || baselineDocument !== gpcDocument) {
    limitationKeys.add("baseline_gpc_document_mismatch");
  }

  const deltas = {
    cookies: compareSets(cookieIdentities(input.baseline), cookieIdentities(input.gpc)),
    trackers: compareSets(trackerIdentities(input.baseline), trackerIdentities(input.gpc)),
    advertisingOrMeasurementActivity: compareSets(
      advertisingOrMeasurementIdentities(input.baseline),
      advertisingOrMeasurementIdentities(input.gpc),
    ),
    consentOrCmpBehavior: compareSets(consentOrCmpIdentities(input.baseline), consentOrCmpIdentities(input.gpc)),
  };
  const comparable = limitationKeys.size === 0;
  const observableResponse = Object.values(deltas).some(hasObservableDelta);
  const status = !comparable
    ? "indeterminate" as const
    : observableResponse
      ? "responsive" as const
      : "no_observable_response" as const;

  return gpcResponseAssessmentSchema.parse({
    contractVersion: GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    findingTitle: status === "no_observable_response" ? "No observable GPC response" : "GPC response",
    scoreEffect: "none",
    legalInterpretation: "not_assessed",
    comparison: {
      comparable,
      protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: { lane: "runtime_evidence", ...input.baselineArtifact },
      gpcArtifact: { lane: "gpc_observation", ...input.gpcArtifact },
      enabledProof: {
        secGpcHeaderValue: "1",
        requestsWithSecGpc: gpcHeaderEvents.length,
        requestEventIds: uniqueSorted(gpcHeaderEvents.map((event) => event.eventId.slice(0, 160))),
        navigatorGlobalPrivacyControl: true,
      },
      deltas,
      evidenceRefs: uniqueSorted([
        input.baselineArtifact.uri,
        input.gpcArtifact.uri,
        ...gpcHeaderEvents.slice(0, 30).map((event) => event.eventId),
      ]).slice(0, 32),
      limitationKeys: [...limitationKeys].sort(),
    },
  });
}
