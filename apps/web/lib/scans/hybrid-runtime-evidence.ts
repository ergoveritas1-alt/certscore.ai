import type { PopulatedSignalRecord, ReportSignalSource } from "@website-signal-risk-scanner/shared";
import {
  buildRuntimeCookieInventory,
  isFunctionalCookieExcludedFromTrackingEvidence
} from "./runtime-cookie-evidence";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeDerivedVendorCategory(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "ads") {
    return "advertising";
  }
  if (normalized === "cdn_infra" || normalized === "fraud_security") {
    return "functional";
  }
  if (normalized.length === 0) {
    return "unknown";
  }
  return normalized;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSignalValueType(value: unknown): PopulatedSignalRecord["valueType"] | null {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return "number";
  }
  if (typeof value === "string") {
    return "text";
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return "string_array";
  }

  return null;
}

function getReportSignalSource(value: unknown): ReportSignalSource | null {
  return value === "snapshot_signal" ||
    value === "runtime_artifact_signal" ||
    value === "policy_enrichment_signal" ||
    value === "document_semantic_signal"
    ? value
    : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getEtldPlusOneFromHostname(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  const parts = hostname
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(-2).join(".");
}

function collectUrlEtldPlusOne(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const output = new Set<string>();
  const inspect = (candidate: string) => {
    try {
      const parsed = new URL(candidate);
      const etld = getEtldPlusOneFromHostname(parsed.hostname);
      if (etld) {
        output.add(etld);
      }
      for (const nestedValue of parsed.searchParams.values()) {
        if (/^https?:\/\//i.test(nestedValue)) {
          inspect(nestedValue);
        }
      }
    } catch {
      // Ignore malformed or redacted URL fragments.
    }
  };

  inspect(value);
  return [...output];
}

function getCrossDomainIdentifierSharingRows(hybrid: Record<string, unknown> | null) {
  return getObjectArray(
    hybrid?.crossDomainIdentifierSharingEvidence ??
      hybrid?.cross_domain_identifier_sharing_evidence
  );
}

function getCrossDomainIdentifierSharingDestinationCategories(hybrid: Record<string, unknown> | null) {
  return uniqueStrings([
    ...getStringArray(
      hybrid?.crossDomainIdentifierSharingVendorCategories ??
        hybrid?.cross_domain_identifier_sharing_vendor_categories
    ),
    ...getCrossDomainIdentifierSharingRows(hybrid).flatMap((row) =>
      getString(row.destinationClassification ?? row.destination_classification)
    )
  ]);
}

function getCrossDomainIdentifierSharingDestinationEtlds(hybrid: Record<string, unknown> | null) {
  return uniqueStrings(
    getCrossDomainIdentifierSharingRows(hybrid).flatMap((row) => [
      getString(row.destinationEtldPlusOne ?? row.destination_etld_plus_one),
      ...getStringArray(row.repeatedAcrossEtlds ?? row.repeated_across_etlds),
      ...collectUrlEtldPlusOne(getString(row.sourcePageUrl ?? row.source_page_url)),
      ...collectUrlEtldPlusOne(getString(row.requestUrlRedacted ?? row.request_url_redacted))
    ])
  );
}

function getCrossDomainIdentifierSharingRequestUrls(hybrid: Record<string, unknown> | null) {
  return uniqueStrings(
    getCrossDomainIdentifierSharingRows(hybrid).flatMap((row) =>
      getString(row.requestUrlRedacted ?? row.request_url_redacted)
    )
  );
}

function hasCrossDomainIdentifierSharingEvidence(hybrid: Record<string, unknown> | null) {
  if (!hybrid) {
    return false;
  }
  const explicit = getBoolean(
    hybrid.crossDomainIdentifierSharingObserved ??
      hybrid.cross_domain_identifier_sharing_observed
  );
  return explicit === true || getCrossDomainIdentifierSharingRows(hybrid).length > 0;
}

function getExistingArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const values = getStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function getExistingNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getObservedConsentActionableChoice(hybrid: Record<string, unknown> | null, runtimeArtifacts?: Record<string, unknown> | null) {
  const consentSummary = getRecord(hybrid?.consentSummary);
  const explicit =
    getBoolean(runtimeArtifacts?.consent_actionable_choice_observed) ??
    getBoolean(runtimeArtifacts?.consentActionableChoiceObserved) ??
    getBoolean(consentSummary?.actionableChoiceObserved);
  if (explicit !== null) {
    return explicit;
  }

  if (
    getBoolean(consentSummary?.acceptPresent) === true ||
    getBoolean(consentSummary?.rejectPresent) === true ||
    getBoolean(consentSummary?.managePresent) === true
  ) {
    return true;
  }

  const clicksToAccept = getNumber(consentSummary?.clicksToAccept);
  const clicksToReject = getNumber(consentSummary?.clicksToReject);
  if ((clicksToAccept !== null && clicksToAccept > 0) || (clicksToReject !== null && clicksToReject > 0)) {
    return true;
  }

  const rejectDepthClass = getString(consentSummary?.rejectDepthClass);
  if (rejectDepthClass && rejectDepthClass !== "absent" && rejectDepthClass !== "unknown") {
    return true;
  }

  return null;
}

function classifyBaselineTrackerCategory(input: { requestUrl: string | null; vendor: string | null }) {
  const value = `${input.vendor ?? ""} ${input.requestUrl ?? ""}`;
  if (/fullstory|hotjar|clarity|contentsquare|mouseflow|qualtrics|siteintercept/i.test(value)) {
    return "session_replay";
  }
  if (/marketo|munchkin|hubspot|pardot|eloqua/i.test(value)) {
    return "marketing_automation";
  }
  if (/googletagmanager|gtm|tealium|utag|tiqcdn|tag manager/i.test(value)) {
    return "tag_management";
  }
  if (/doubleclick|googleadservices|facebook|connect\.facebook|linkedin|licdn|tiktok|criteo|adnxs|xandr|pubmatic|rubicon|openx|ads?/i.test(value)) {
    return "advertising";
  }
  if (/analytics|measurement|segment|mixpanel|amplitude|posthog/i.test(value)) {
    return "analytics";
  }
  return "tracking";
}

export function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
}

function getHybridNanoSignalRows(hybrid: Record<string, unknown> | null) {
  for (const key of ["nano_signals", "nanoSignals", "signal_populations", "signalPopulations"]) {
    const rows = getObjectArray(hybrid?.[key]);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

export function getHybridNanoSignalPopulations(runtimeArtifacts: Record<string, unknown> | null | undefined): PopulatedSignalRecord[] {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const rows = getHybridNanoSignalRows(hybrid);

  return rows.flatMap((row) => {
    const key = getString(row.key);
    const label = getString(row.label);
    const valueType = getSignalValueType(row.value);
    if (!key || !label || valueType === null) {
      return [];
    }

    const confidence = getNumber(row.confidence);
    const observedAt = getString(row.observed_at ?? row.observedAt);
    const populationStatus =
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : row.populationStatus === "present" ||
            row.populationStatus === "missing" ||
            row.populationStatus === "conflicting" ||
            row.populationStatus === "insufficient"
          ? row.populationStatus
          : "present";
    const provenanceDetail =
      getString(row.provenance_detail ?? row.provenanceDetail) ??
      getString(row.provenance) ??
      "hybrid_runtime_evidence.nano_signals";

    return [
      {
        confidence,
        evidenceRefs: getStringArray(row.evidence_refs ?? row.evidenceRefs),
        key,
        label,
        observedAt,
        populationStatus,
        provenance: [
          {
            detail: provenanceDetail,
            kind: "document"
          }
        ],
        reportSignalSource: getReportSignalSource(row.report_signal_source ?? row.reportSignalSource),
        source: "nano",
        value: row.value as PopulatedSignalRecord["value"],
        valueType
      } satisfies PopulatedSignalRecord
    ];
  });
}

export function getHybridConsentAuditCompleted(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  return hybrid && getRecord(hybrid.consentSummary) ? true : null;
}

function getConsentOutcomeSummary(hybrid: Record<string, unknown> | null) {
  return getRecord(hybrid?.consentOutcomeSummary);
}

export function withHybridRuntimeArtifactFallbacks(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  if (!runtimeArtifacts) {
    return runtimeArtifacts ?? null;
  }

  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return runtimeArtifacts;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const requestTypeCounts = getRecord(networkSummary?.requestTypeCounts);
  const vendorSummary = getRecord(hybrid.vendorSummary);
  const storageSummary = getRecord(hybrid.storageSummary);
  const requestObservations = getObjectArray(hybrid.requestObservations);
  const cookieWriteObservations = getObjectArray(hybrid.cookieWriteObservations);
  const consentOutcomeSummary = getConsentOutcomeSummary(hybrid);
  const rejectCookieDiffProvenance =
    getRecord(runtimeArtifacts.consent_reject_cookie_diff_provenance) ??
    getRecord(runtimeArtifacts.consentRejectCookieDiffProvenance) ??
    getRecord(consentOutcomeSummary?.rejectCookieDiffProvenance);
  const rejectInteractionAttribution =
    getRecord(runtimeArtifacts.consent_reject_interaction_attribution) ??
    getRecord(runtimeArtifacts.consentRejectInteractionAttribution) ??
    getRecord(consentOutcomeSummary?.rejectInteractionAttribution);

  const thirdPartyRequestDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["third_party_request_domains", "thirdPartyRequestDomains"]),
    ...getStringArray(vendorSummary?.rawThirdPartyDomains),
    ...requestObservations
      .filter((row) => row.thirdParty === true)
      .flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);
  const initialCookieNames = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["initial_cookie_names", "initialCookieNames"]),
    ...cookieWriteObservations.flatMap((row) => (typeof row.cookieName === "string" ? [row.cookieName] : []))
  ]);
  const initialCookieDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["initial_cookie_domains", "initialCookieDomains"]),
    ...cookieWriteObservations.flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);
  const scriptSrcDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["script_src_domains", "scriptSrcDomains"]),
    ...requestObservations
      .filter((row) => row.resourceType === "script")
      .flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);

  const thirdPartyRequestCount =
    getExistingNumber(runtimeArtifacts, ["third_party_request_count", "thirdPartyRequestCount"]) ??
    getNumber(networkSummary?.thirdPartyRequestCount) ??
    thirdPartyRequestDomains.length;
  const initialCookieCount =
    getExistingNumber(runtimeArtifacts, ["initial_cookie_count", "initialCookieCount"]) ??
    getNumber(storageSummary?.cookiesSeenCount) ??
    initialCookieNames.length;
  const scriptTagCount =
    getExistingNumber(runtimeArtifacts, ["script_tag_count", "scriptTagCount"]) ??
    getNumber(requestTypeCounts?.script) ??
    scriptSrcDomains.length;
  const consentAuditCompleted =
    getBoolean(runtimeArtifacts.consent_audit_completed) ?? getHybridConsentAuditCompleted(runtimeArtifacts);
  const consentRejectInteractionSucceeded =
    getBoolean(runtimeArtifacts.consent_reject_interaction_succeeded) ?? getBoolean(consentOutcomeSummary?.rejectInteractionSucceeded);
  const consentRejectReducedTracking =
    getBoolean(runtimeArtifacts.consent_reject_reduced_tracking) ?? getBoolean(consentOutcomeSummary?.rejectReducedTracking);
  const consentRejectReducedThirdPartyCookies =
    getBoolean(runtimeArtifacts.consent_reject_reduced_third_party_cookies) ??
    getBoolean(consentOutcomeSummary?.rejectReducedThirdPartyCookies);
  const preconsentEvidenceQuality = buildPreconsentEvidenceQualityFallback(runtimeArtifacts);

  return {
    ...runtimeArtifacts,
    ...(preconsentEvidenceQuality?.consentTimeline && !runtimeArtifacts.consentTimeline && !runtimeArtifacts.consent_timeline
      ? {
          consentTimeline: preconsentEvidenceQuality.consentTimeline,
          consent_timeline: preconsentEvidenceQuality.consentTimeline
        }
      : {}),
    ...(preconsentEvidenceQuality?.requestPurposeClassificationConfidence &&
    !runtimeArtifacts.requestPurposeClassificationConfidence &&
    !runtimeArtifacts.request_purpose_classification_confidence
      ? {
          requestPurposeClassificationConfidence: preconsentEvidenceQuality.requestPurposeClassificationConfidence,
          request_purpose_classification_confidence: preconsentEvidenceQuality.requestPurposeClassificationConfidence
        }
      : {}),
    ...(typeof preconsentEvidenceQuality?.consentActionableChoiceObserved === "boolean" &&
    typeof runtimeArtifacts.consentActionableChoiceObserved !== "boolean" &&
    typeof runtimeArtifacts.consent_actionable_choice_observed !== "boolean"
      ? {
          consentActionableChoiceObserved: preconsentEvidenceQuality.consentActionableChoiceObserved,
          consent_actionable_choice_observed: preconsentEvidenceQuality.consentActionableChoiceObserved
        }
      : {}),
    ...(typeof preconsentEvidenceQuality?.consentSurfaceObserved === "boolean" &&
    typeof runtimeArtifacts.consentSurfaceObserved !== "boolean" &&
    typeof runtimeArtifacts.consent_surface_observed !== "boolean"
      ? {
          consentSurfaceObserved: preconsentEvidenceQuality.consentSurfaceObserved,
          consent_surface_observed: preconsentEvidenceQuality.consentSurfaceObserved
        }
      : {}),
    consent_audit_completed: consentAuditCompleted,
    consent_reject_interaction_succeeded: consentRejectInteractionSucceeded,
    consentRejectInteractionSucceeded: consentRejectInteractionSucceeded,
    consent_reject_reduced_tracking: consentRejectReducedTracking,
    consentRejectReducedTracking: consentRejectReducedTracking,
    consent_reject_reduced_third_party_cookies: consentRejectReducedThirdPartyCookies,
    consentRejectReducedThirdPartyCookies: consentRejectReducedThirdPartyCookies,
    consent_reject_cookie_diff_provenance: rejectCookieDiffProvenance,
    consentRejectCookieDiffProvenance: rejectCookieDiffProvenance,
    consent_reject_interaction_attribution: rejectInteractionAttribution,
    consentRejectInteractionAttribution: rejectInteractionAttribution,
    third_party_request_count: thirdPartyRequestCount,
    thirdPartyRequestCount: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyRequestDomains,
    thirdPartyRequestDomains: thirdPartyRequestDomains,
    initial_cookie_count: initialCookieCount,
    initialCookieCount: initialCookieCount,
    initial_cookie_names: initialCookieNames,
    initialCookieNames: initialCookieNames,
    initial_cookie_domains: initialCookieDomains,
    initialCookieDomains: initialCookieDomains,
    script_tag_count: scriptTagCount,
    scriptTagCount: scriptTagCount,
    script_src_domains: scriptSrcDomains,
    scriptSrcDomains: scriptSrcDomains
  };
}

function isSessionReplayCategory(value: string | null | undefined) {
  return /session_replay|session replay|behavioral_analytics|behavioral analytics|session_intercept|siteintercept/i.test(value ?? "");
}

function looksLikeSessionReplayVendor(row: Record<string, unknown>) {
  const vendor = getString(row.vendor);
  const hostname = getString(row.hostname);
  return isSessionReplayCategory(getString(row.category)) || /qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow/i.test(`${vendor ?? ""} ${hostname ?? ""}`);
}

function getRequestUrl(row: Record<string, unknown>) {
  if (typeof row.url === "string") {
    return row.url;
  }
  const domain = getString(row.domain);
  const pathSample =
    typeof row.pathSample === "string"
      ? row.pathSample
      : typeof row.path_sample === "string"
        ? row.path_sample
        : null;
  return domain && pathSample ? `https://${domain}${pathSample}` : domain ? `https://${domain}` : null;
}

function getSessionReplayVendors(hybrid: Record<string, unknown> | null) {
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const vendors = requestToVendorObservations
    .filter(looksLikeSessionReplayVendor)
    .flatMap((row) => (typeof row.vendor === "string" ? [row.vendor] : []));

  return uniqueStrings(vendors);
}

function getSessionReplayRequestUrls(hybrid: Record<string, unknown> | null) {
  const requestObservations = getObjectArray(hybrid?.requestObservations);
  const sessionReplayHosts = getObjectArray(hybrid?.requestToVendorObservations)
    .filter(looksLikeSessionReplayVendor)
    .flatMap((row) => getString(row.hostname));

  return uniqueStrings(
    requestObservations
      .filter((row) => {
        const domain = getString(row.domain);
        return Boolean(domain && sessionReplayHosts.includes(domain)) || /qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow/i.test(getRequestUrl(row) ?? "");
      })
      .flatMap((row) => getRequestUrl(row) ?? [])
  );
}

function getPreconsentTrackerVendors(hybrid: Record<string, unknown> | null) {
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const vendors = requestToVendorObservations
    .filter((row) => row.pre_consent === true || row.preConsent === true)
    .flatMap((row) => (typeof row.vendor === "string" ? [row.vendor] : []));

  return uniqueStrings(vendors);
}

function isPreconsentRequestObservation(row: Record<string, unknown>, hybrid: Record<string, unknown> | null) {
  if (row.preConsent === true || row.pre_consent === true || row.beforeConsent === true || row.before_consent === true) {
    return true;
  }

  const phase = getString(row.phase) ?? getString(row.runtimePhase) ?? getString(row.runtime_phase);
  if (phase === "pre_consent" || phase === "before_interaction" || phase === "before_consent") {
    return true;
  }

  const tsMs = getNumber(row.ts_ms ?? row.tsMs);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers);
  const consentChoiceAtMs = getNumber(
    timelineMarkers?.consentChoiceAtMs ??
      timelineMarkers?.consentAcceptedAtMs ??
      timelineMarkers?.consentRejectedAtMs
  );
  const consentBannerDetectedMs = getNumber(timelineMarkers?.consentBannerDetectedMs);
  const threshold = consentChoiceAtMs ?? consentBannerDetectedMs;
  return tsMs !== null && threshold !== null && tsMs < threshold;
}

function getPreconsentCookieEvidenceRows(
  hybrid: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null | undefined
) {
  return buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid, runtimeArtifacts }).rows.map((row) => ({
    category: row.category,
    cookieName: row.cookieName,
    domain: row.domain,
    firstObservedAtMs: row.firstObservedAtMs,
    initiatorDomain: row.initiatorDomain,
    initiatorUrl: row.initiatorUrl,
    initiatorVendor: row.initiatorVendor,
    nonEssential: row.nonEssential,
    party: row.party,
    setAtMs: row.setAtMs,
    setMethod: row.setMethod,
    timingEvidence: row.timingEvidence
  }));
}

function getPreconsentRequestUrls(hybrid: Record<string, unknown> | null) {
  const requestObservations = getObjectArray(hybrid?.requestObservations);
  const preconsentVendorHosts = getObjectArray(hybrid?.requestToVendorObservations)
    .filter((row) => row.pre_consent === true || row.preConsent === true)
    .flatMap((row) => getString(row.hostname));
  return uniqueStrings(
    requestObservations
      .filter((row) => {
        const domain = getString(row.domain);
        const matchedPreconsentVendor = Boolean(domain && preconsentVendorHosts.includes(domain));
        return row.thirdParty === true && (isPreconsentRequestObservation(row, hybrid) || matchedPreconsentVendor);
      })
      .flatMap((row) => getRequestUrl(row) ?? [])
  );
}

function getPreconsentVendorEvidenceRows(hybrid: Record<string, unknown> | null) {
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const requestObservations = getObjectArray(hybrid?.requestObservations);
  const requestUrls = getPreconsentRequestUrls(hybrid);

  return requestToVendorObservations
    .filter((row) => row.pre_consent === true || row.preConsent === true)
    .map((row) => {
      const hostname = getString(row.hostname);
      const matchedRequest = requestObservations.find((request) => {
        const domain = getString(request.domain);
        return hostname && domain === hostname;
      });
      return {
        category: normalizeDerivedVendorCategory(getString(row.category)),
        confidence: getString(row.confidence) ?? "unknown",
        detectionSource: getString(row.evidenceSource) ?? getString(row.evidence_source) ?? "hybrid_runtime",
        hostname,
        matchedSignatureId: getString(row.matchedSignatureId) ?? getString(row.matched_signature_id),
        requestUrl: getString(matchedRequest?.url) ?? requestUrls.find((url) => (hostname ? url.includes(hostname) : false)) ?? null,
        vendor: getString(row.vendor)
      };
    })
    .filter((row) => row.vendor || row.requestUrl || row.hostname);
}

function getNestedObject(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getNestedObjectArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    const rows = getObjectArray(value);
    if (rows.length > 0) {
      return rows;
    }
  }
  return [] as Array<Record<string, unknown>>;
}

function categoryToEssentiality(category: string | null) {
  return category && /^(?:advertising|analytics|marketing|marketing_automation|retargeting|session_replay|tag_manager|tag_management|tracking)$/i.test(category)
    ? "non_essential"
    : null;
}

function confidenceToNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    if (/^high$/i.test(value)) {
      return 0.9;
    }
    if (/^medium$/i.test(value)) {
      return 0.75;
    }
    if (/^low$/i.test(value)) {
      return 0.45;
    }
  }
  return null;
}

function getRequestClassificationRows(runtimeArtifacts: Record<string, unknown> | null | undefined, hybrid: Record<string, unknown> | null) {
  const retainedRows = [
    ...getNestedObjectArray(runtimeArtifacts, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"]),
    ...getNestedObjectArray(hybrid, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"])
  ];
  const baselineEvidenceUrls = getExistingArray(runtimeArtifacts ?? {}, [
    "consentBaselineTrackerEvidenceUrls",
    "consent_baseline_tracker_evidence_urls"
  ]);
  const baselineVendorNames = getExistingArray(runtimeArtifacts ?? {}, [
    "consentBaselineTrackerVendorNames",
    "consent_baseline_tracker_vendor_names"
  ]);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers);
  const firstBaselineRequestMs =
    getNumber(timelineMarkers?.firstThirdPartyRequestMs) ??
    getNumber(timelineMarkers?.firstRequestMs) ??
    null;
  const baselineRows = baselineEvidenceUrls.map((requestUrl, index) => {
    const vendor = baselineVendorNames[index] ?? baselineVendorNames[0] ?? null;
    const category = classifyBaselineTrackerCategory({ requestUrl, vendor });
    return {
      category,
      confidence: 0.85,
      essentiality: "non_essential",
      requestUrl,
      timestampMs: firstBaselineRequestMs,
      tsMs: firstBaselineRequestMs,
      vendor
    };
  });

  if (retainedRows.length > 0 || baselineRows.length > 0) {
    const byUrl = new Map<string, Record<string, unknown>>();
    for (const row of [...retainedRows, ...baselineRows]) {
      const record = row as Record<string, unknown>;
      const requestUrl = getString(record.requestUrl) ?? getString(record.request_url) ?? getString(record.url);
      byUrl.set(requestUrl ?? JSON.stringify(record), record);
    }
    return [...byUrl.values()];
  }

  const vendorRows = getPreconsentVendorEvidenceRows(hybrid);
  const requestRows = getObjectArray(hybrid?.requestObservations);
  return requestRows.flatMap((row) => {
    if (!isPreconsentRequestObservation(row, hybrid)) {
      return [];
    }

    const requestUrl = getRequestUrl(row);
    if (!requestUrl) {
      return [];
    }

    const domain = getString(row.domain);
    const matchedVendor = vendorRows.find((vendorRow) => {
      const hostname = getString(vendorRow.hostname);
      return Boolean(hostname && domain === hostname);
    });
    const category = normalizeDerivedVendorCategory(
      getString(row.category) ??
        getString(row.vendorCategory) ??
        getString(row.vendor_category) ??
        getString(matchedVendor?.category)
    );
    const essentiality = categoryToEssentiality(category);
    if (essentiality !== "non_essential") {
      return [];
    }

    return [{
      category,
      confidence: confidenceToNumber(row.confidence ?? row.vendorAttributionConfidence ?? row.vendor_attribution_confidence ?? matchedVendor?.confidence) ?? 0.75,
      essentiality,
      requestUrl,
      tsMs: getNumber(row.tsMs ?? row.ts_ms),
      vendor: getString(row.vendor) ?? getString(matchedVendor?.vendor)
    }];
  });
}

function getRowNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNumber(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function getRowString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(row[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

export function buildPreconsentEvidenceQualityFallback(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const hybridConsentSummary = getRecord(hybrid?.consentSummary);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers);
  const retainedTimeline =
    getNestedObject(runtimeArtifacts, ["consentTimeline", "consent_timeline"]) ??
    getNestedObject(hybrid, ["consentTimeline", "consent_timeline"]);
  const requestClassifications = getRequestClassificationRows(runtimeArtifacts, hybrid);
  const nonEssentialRequestRows = requestClassifications.filter((row) => {
    const essentiality = getString(row.essentiality) ?? getString(row.classification);
    const confidence = confidenceToNumber(row.confidence ?? row.score);
    const requestUrl = getString(row.requestUrl) ?? getString(row.request_url) ?? getString(row.url);
    return essentiality === "non_essential" && (confidence ?? 0) >= 0.7 && Boolean(requestUrl && /^https?:\/\//i.test(requestUrl));
  });

  const firstNonEssentialRequestMs = getNumber(
    retainedTimeline?.firstNonEssentialRequestMs ?? retainedTimeline?.first_non_essential_request_ms
  ) ?? Math.min(
    ...nonEssentialRequestRows
      .map((row) => getRowNumber(row, ["tsMs", "ts_ms", "timestampMs", "timestamp_ms"]))
      .filter((value): value is number => value !== null)
  );
  const normalizedFirstNonEssentialRequestMs = Number.isFinite(firstNonEssentialRequestMs) ? firstNonEssentialRequestMs : null;
  const preconsentTrackingCookieRows = buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid, runtimeArtifacts }).rows.filter(
    (row) =>
      row.timingEvidence === "before_consent_cookie_write" &&
      row.party === "third_party" &&
      row.nonEssential &&
      !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
  );
  const firstTrackingCookieSetMs = Math.min(
    ...preconsentTrackingCookieRows
      .map((row) => row.setAtMs ?? row.firstObservedAtMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );
  const normalizedFirstTrackingCookieSetMs = Number.isFinite(firstTrackingCookieSetMs) ? firstTrackingCookieSetMs : null;
  const consentTimeline = retainedTimeline ?? (
    normalizedFirstNonEssentialRequestMs !== null || normalizedFirstTrackingCookieSetMs !== null
      ? {
          firstCmpVisibleMs:
            getNumber(timelineMarkers?.consentBannerDetectedMs) ??
            getNumber(hybridConsentSummary?.firstVisibleMs),
          firstConsentActionMs: getNumber(
            timelineMarkers?.consentChoiceAtMs ??
              timelineMarkers?.consentAcceptedAtMs ??
              timelineMarkers?.consentRejectedAtMs
          ),
          ...(normalizedFirstTrackingCookieSetMs !== null ? { firstTrackingCookieSetMs: normalizedFirstTrackingCookieSetMs } : {}),
          firstNonEssentialRequestMs: normalizedFirstNonEssentialRequestMs,
          navigationStartMs: getNumber(timelineMarkers?.navigationStartMs) ?? 0,
          timelineConfidence: "derived_from_hybrid_runtime"
        }
      : null
  );

  if (!consentTimeline && nonEssentialRequestRows.length === 0 && preconsentTrackingCookieRows.length === 0) {
    return null;
  }

  return {
    consentTimeline,
    consentActionableChoiceObserved:
      getObservedConsentActionableChoice(hybrid, runtimeArtifacts),
    consentSurfaceObserved:
      getObservedConsentSurface(hybrid, runtimeArtifacts),
    requestPurposeClassificationConfidence: requestClassifications,
    preconsent_tracker_evidence_urls: uniqueStrings(
      nonEssentialRequestRows.flatMap((row) => getRowString(row, ["requestUrl", "request_url", "url"]))
    ),
    preconsent_tracker_vendors: uniqueStrings(nonEssentialRequestRows.flatMap((row) => getString(row.vendor))),
    runtimeEvidenceQuality: "timeline_and_classification",
    runtimeEvidenceQualityDisposition: "promotion_contract_ready"
  };
}

function getHybridArtifactRefs(hybrid: Record<string, unknown> | null, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => getStringArray(hybrid?.[key])));
}

export function getHybridPreconsentViolationCount(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const explicitCount = getNumber(networkSummary?.preConsentThirdPartyRequestCount);
  const evidenceUrlCount = getPreconsentRequestUrls(hybrid).length;
  const vendorCount = getPreconsentTrackerVendors(hybrid).length;
  if (explicitCount !== null) {
    return Math.max(explicitCount, evidenceUrlCount, vendorCount);
  }

  return Math.max(evidenceUrlCount, vendorCount);
}

export function getHybridPreconsentTrackerEvidenceUrls(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return [];
  }

  return getPreconsentRequestUrls(hybrid);
}

export function getHybridPreconsentTrackerVendors(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getPreconsentTrackerVendors(getHybridRuntimeEvidence(runtimeArtifacts));
}

export function getHybridDerivedTrackerVendors(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return [];
  }

  const requestToVendorObservations = getObjectArray(hybrid.requestToVendorObservations);
  const domainVendorRegistry = getObjectArray(runtimeArtifacts?.domainVendorRegistry ?? runtimeArtifacts?.domain_vendor_registry);
  const rows = new Map<
    string,
    {
      beforeConsent: boolean | null;
      collectionEndpointType: string;
      confidence: number;
      detectionSource: string;
      firstPartyOrThirdParty: string;
      matchedSignatureId: string | null;
      scriptHost: string | null;
      vendorCategory: string;
      vendorName: string;
    }
  >();

  const upsert = (key: string, row: {
    beforeConsent: boolean | null;
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    firstPartyOrThirdParty: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }) => {
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, row);
      return;
    }

    rows.set(key, {
      ...existing,
      beforeConsent: existing.beforeConsent === true || row.beforeConsent === true ? true : existing.beforeConsent ?? row.beforeConsent,
      confidence: Math.max(existing.confidence, row.confidence),
      matchedSignatureId: existing.matchedSignatureId ?? row.matchedSignatureId,
      scriptHost: existing.scriptHost ?? row.scriptHost
    });
  };

  for (const row of requestToVendorObservations) {
    const vendorName = getString(row.vendor);
    if (!vendorName || vendorName === "unresolved") {
      continue;
    }
    const vendorCategory = normalizeDerivedVendorCategory(getString(row.category));
    const scriptHost = getString(row.hostname);
    const beforeConsent =
      typeof row.preConsent === "boolean" ? row.preConsent : typeof row.pre_consent === "boolean" ? row.pre_consent : null;
    const confidenceLabel = getString(row.confidence);
    const confidence = confidenceLabel === "high" ? 0.95 : confidenceLabel === "medium" ? 0.7 : 0.45;
    const detectionSource = getString(row.evidenceSource) ?? "hybrid_runtime";
    const key = `${vendorName}|${scriptHost ?? ""}|${detectionSource}`;
    upsert(key, {
      beforeConsent,
      collectionEndpointType: "unknown",
      confidence,
      detectionSource,
      firstPartyOrThirdParty: "third_party",
      matchedSignatureId: null,
      scriptHost,
      vendorCategory,
      vendorName
    });
  }

  for (const row of domainVendorRegistry) {
    const vendorName = getString(row.vendorName) ?? getString(row.vendor_name);
    if (!vendorName) {
      continue;
    }
    const scriptHost = getString(row.endpointHostname) ?? getString(row.endpoint_hostname);
    const isCnameCloaked = row.isCnameCloaked === true || row.is_cname_cloaked === true;
    const beforeConsentCount =
      getNumber(row.beforeConsentUiRequestCount ?? row.before_consent_ui_request_count) ??
      getNumber(row.beforeConsentUiSetCookieResponseCount ?? row.before_consent_ui_set_cookie_response_count) ??
      0;
    const vendorCategory = normalizeDerivedVendorCategory(getString(row.category) ?? (isCnameCloaked ? "unknown" : "functional"));
    const detectionSource = isCnameCloaked ? "cname_candidate" : "domain_vendor_registry";
    const key = `${vendorName}|${scriptHost ?? ""}|${detectionSource}`;
    upsert(key, {
      beforeConsent: beforeConsentCount > 0 ? true : null,
      collectionEndpointType: isCnameCloaked ? "first_party_collection_proxy" : "unknown",
      confidence: isCnameCloaked ? 0.8 : 0.65,
      detectionSource,
      firstPartyOrThirdParty: isCnameCloaked ? "first_party" : "third_party",
      matchedSignatureId: null,
      scriptHost,
      vendorCategory,
      vendorName
    });
  }

  return [...rows.values()].sort(
    (left, right) =>
      left.vendorCategory.localeCompare(right.vendorCategory) ||
      left.vendorName.localeCompare(right.vendorName) ||
      (left.scriptHost ?? "").localeCompare(right.scriptHost ?? "")
  );
}

function getFingerprintSummary(hybrid: Record<string, unknown> | null) {
  return getRecord(hybrid?.fingerprintSummary);
}

function getFingerprintAttributeCategories(fingerprintSummary: Record<string, unknown> | null) {
  const direct = getStringArray(fingerprintSummary?.attributeCategories);
  if (direct.length > 0) {
    return direct;
  }

  return getObjectArray(fingerprintSummary?.attributeCategories)
    .flatMap((row) => getString(row.name) ?? getString(row.category) ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function getFingerprintArtifactRefs(hybrid: Record<string, unknown> | null, fingerprintSummary: Record<string, unknown> | null) {
  return uniqueStrings([
    ...getStringArray(fingerprintSummary?.artifactRefs),
    ...getStringArray(fingerprintSummary?.artifact_refs),
    ...getHybridArtifactRefs(hybrid, ["fingerprintArtifactRefs", "fingerprint_artifact_refs", "screenshotRefs", "screenshot_refs"])
  ]);
}

function getUiSummary(hybrid: Record<string, unknown> | null) {
  return getRecord(hybrid?.uiSummary);
}

function getMediaSummary(hybrid: Record<string, unknown> | null) {
  return getRecord(hybrid?.mediaSummary);
}

function looksLikeMetaPixelVendor(row: Record<string, unknown>) {
  const vendor = getString(row.vendor);
  const hostname = getString(row.hostname) ?? getString(row.domain);
  const requestUrl = getRequestUrl(row);

  return /meta\s+pixel|facebook|fb\s*pixel/i.test(`${vendor ?? ""} ${hostname ?? ""} ${requestUrl ?? ""}`) ||
    /(?:^|\.)facebook\.com$|(?:^|\.)facebook\.net$/i.test(hostname ?? "") ||
    /\/tr\/?|fbevents\.js|facebook\.com\/tr/i.test(requestUrl ?? "");
}

function getPageUrlFromRuntimeRow(row: Record<string, unknown>) {
  return (
    getString(row.pageUrl) ??
    getString(row.page_url) ??
    getString(row.sourcePageUrl) ??
    getString(row.source_page_url) ??
    getString(row.topLevelUrl) ??
    getString(row.top_level_url) ??
    getString(row.documentUrl) ??
    getString(row.document_url) ??
    getString(row.frameUrl) ??
    getString(row.frame_url) ??
    getString(row.initiatorPageUrl) ??
    getString(row.initiator_page_url)
  );
}

function getMediaVideoEvidenceRows(mediaSummary: Record<string, unknown> | null) {
  return [
    ...getObjectArray(mediaSummary?.videoEvidence),
    ...getObjectArray(mediaSummary?.video_evidence),
    ...getObjectArray(mediaSummary?.videoContentEvidence),
    ...getObjectArray(mediaSummary?.video_content_evidence)
  ];
}

function getVideoPageUrls(hybrid: Record<string, unknown> | null) {
  const mediaSummary = getMediaSummary(hybrid);
  const directUrls = uniqueStrings([
    getString(mediaSummary?.pageUrl),
    getString(mediaSummary?.page_url),
    ...getStringArray(mediaSummary?.videoPageUrls),
    ...getStringArray(mediaSummary?.video_page_urls)
  ]);
  const evidenceUrls = getMediaVideoEvidenceRows(mediaSummary)
    .flatMap((row) => getPageUrlFromRuntimeRow(row) ?? getString(row.url) ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return uniqueStrings([...directUrls, ...evidenceUrls]);
}

function getVideoTitleSnippets(hybrid: Record<string, unknown> | null) {
  const mediaSummary = getMediaSummary(hybrid);
  return uniqueStrings([
    getString(mediaSummary?.videoTitle),
    getString(mediaSummary?.video_title),
    getString(mediaSummary?.pageTitle),
    getString(mediaSummary?.page_title),
    ...getStringArray(mediaSummary?.videoTitles),
    ...getStringArray(mediaSummary?.video_titles),
    ...getMediaVideoEvidenceRows(mediaSummary).flatMap((row) => [
      getString(row.videoTitle),
      getString(row.video_title),
      getString(row.title),
      getString(row.pageTitle),
      getString(row.page_title)
    ])
  ]);
}

function hasVideoContentSurface(hybrid: Record<string, unknown> | null) {
  const mediaSummary = getMediaSummary(hybrid);
  if (!mediaSummary) {
    return false;
  }

  return (
    mediaSummary.videoContentSurfaceObserved === true ||
    mediaSummary.video_content_surface_observed === true ||
    mediaSummary.videoPlayerDetected === true ||
    mediaSummary.video_player_detected === true ||
    (getNumber(mediaSummary.videoElementCount ?? mediaSummary.video_element_count) ?? 0) > 0 ||
    (getNumber(mediaSummary.videoCount ?? mediaSummary.video_count) ?? 0) > 0 ||
    getMediaVideoEvidenceRows(mediaSummary).length > 0 ||
    getVideoPageUrls(hybrid).length > 0
  );
}

function getMetaPixelRequestRows(hybrid: Record<string, unknown> | null) {
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const requestObservations = getObjectArray(hybrid?.requestObservations);
  const metaHosts = requestToVendorObservations
    .filter(looksLikeMetaPixelVendor)
    .flatMap((row) => getString(row.hostname) ?? getString(row.domain) ?? []);

  return requestObservations.filter((row) => {
    const domain = getString(row.domain);
    return looksLikeMetaPixelVendor(row) || Boolean(domain && metaHosts.includes(domain));
  });
}

function getMetaPixelRequestUrls(hybrid: Record<string, unknown> | null) {
  return uniqueStrings(getMetaPixelRequestRows(hybrid).flatMap((row) => getRequestUrl(row) ?? []));
}

function getMetaPixelRuntimePhases(hybrid: Record<string, unknown> | null) {
  return uniqueStrings(
    getMetaPixelRequestRows(hybrid).flatMap((row) =>
      getString(row.runtimePhase) ??
      getString(row.runtime_phase) ??
      getString(row.phase) ??
      (isPreconsentRequestObservation(row, hybrid) ? "pre_consent" : [])
    )
  );
}

function getMetaPixelPayloadFieldHints(hybrid: Record<string, unknown> | null) {
  const fieldNames = getMetaPixelRequestRows(hybrid).flatMap((row) => [
    ...getStringArray(row.payloadKeys),
    ...getStringArray(row.payload_keys),
    ...getStringArray(row.parameterKeys),
    ...getStringArray(row.parameter_keys),
    ...getStringArray(row.queryKeys),
    ...getStringArray(row.query_keys),
    ...getStringArray(row.urlQueryKeys),
    ...getStringArray(row.url_query_keys),
    ...extractQueryKeys(getRequestUrl(row))
  ]);

  return uniqueStrings(fieldNames);
}

function extractQueryKeys(value: string | null) {
  if (!value) {
    return [] as string[];
  }
  try {
    return [...new URL(value).searchParams.keys()];
  } catch {
    return [] as string[];
  }
}

function hasSamePageVideoMetaCorrelation(hybrid: Record<string, unknown> | null) {
  const videoPageUrls = getVideoPageUrls(hybrid);
  const requestRows = getMetaPixelRequestRows(hybrid);
  if (requestRows.some((row) => row.samePageVideoCorrelation === true || row.same_page_video_correlation === true)) {
    return true;
  }

  const normalizedVideoPageUrls = new Set(videoPageUrls.map((url) => normalizeUrlForPageCorrelation(url)));
  if (normalizedVideoPageUrls.size === 0) {
    return false;
  }

  return requestRows.some((row) => {
    const requestPageUrl = getPageUrlFromRuntimeRow(row);
    return Boolean(requestPageUrl && normalizedVideoPageUrls.has(normalizeUrlForPageCorrelation(requestPageUrl)));
  });
}

function normalizeUrlForPageCorrelation(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

function hasVideoContentTrackingExposure(hybrid: Record<string, unknown> | null) {
  return hasVideoContentSurface(hybrid) && getMetaPixelRequestRows(hybrid).length > 0 && hasSamePageVideoMetaCorrelation(hybrid);
}

function getObservedConsentSurface(
  hybrid: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null | undefined
) {
  const consentSummary = getRecord(hybrid?.consentSummary);
  const explicitBannerPresent = getBoolean(consentSummary?.bannerPresent);
  if (explicitBannerPresent !== null) {
    return explicitBannerPresent;
  }

  for (const value of [
    runtimeArtifacts?.consent_surface_observed,
    runtimeArtifacts?.consentSurfaceObserved,
    runtimeArtifacts?.cookie_banner_present,
    runtimeArtifacts?.cookieBannerPresent,
    runtimeArtifacts?.consentBannerPresent
  ]) {
    const parsed = getBoolean(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  const surfacedControls = [
    consentSummary?.acceptPresent,
    consentSummary?.rejectPresent,
    consentSummary?.managePresent,
    consentSummary?.closePresent
  ].some((value) => value === true);

  return surfacedControls ? true : null;
}

function hasVerifiedConsentSurface(
  hybrid: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null | undefined
) {
  return getObservedConsentSurface(hybrid, runtimeArtifacts) === true;
}

function hasSessionReplayObserved(hybrid: Record<string, unknown> | null) {
  const vendorSummary = getRecord(hybrid?.vendorSummary);
  const categoryCounts = getRecord(vendorSummary?.vendorCategoryCounts);
  const categoryCount = getNumber(categoryCounts?.session_replay) ?? 0;

  return categoryCount > 0 || getSessionReplayVendors(hybrid).length > 0;
}

export function getHybridDerivedSignalValue(runtimeArtifacts: Record<string, unknown> | null | undefined, signalKey: string) {
  if (signalKey === "privacy.pre_submit_text_capture_detected") {
    const rows = getObjectArray(runtimeArtifacts?.pre_submit_text_capture_evidence ?? runtimeArtifacts?.preSubmitTextCaptureEvidence);
    if (rows.length > 0) {
      return rows.some((row) => {
        const classification = String(row.destinationClassification ?? row.destination_classification ?? "");
        const submitObserved = row.submitObserved ?? row.submit_observed;
        return (
          submitObserved === false &&
          (classification === "third_party_tracking_hashed_identifier" ||
          classification === "third_party_tracking_raw_identifier")
        );
      });
    }
    return undefined;
  }

  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return undefined;
  }

  const consentSummary = getRecord(hybrid.consentSummary);
  const consentVisual = getRecord(hybrid.consentVisual);
  const uiSummary = getRecord(hybrid.uiSummary);
  const networkSummary = getRecord(hybrid.networkSummary);
  const fingerprintSummary = getFingerprintSummary(hybrid);
  const mediaSummary = getMediaSummary(hybrid);
  const verifiedConsentSurface = hasVerifiedConsentSurface(hybrid, runtimeArtifacts);

  switch (signalKey) {
    case "privacy.preconsent_tracking_detected":
    case "privacy.tracking_before_consent_detected": {
      const preConsentThirdPartyRequestCount = getNumber(networkSummary?.preConsentThirdPartyRequestCount) ?? 0;
      const preConsentVendorCount =
        getNumber(getRecord(hybrid.vendorSummary)?.preConsentVendorCount) ?? getPreconsentTrackerVendors(hybrid).length;
      const preConsentEvidenceUrlCount = getPreconsentRequestUrls(hybrid).length;
      const preConsentTrackingCookieCount = getPreconsentCookieEvidenceRows(hybrid, runtimeArtifacts).filter(
        (row) => row.nonEssential && !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
      ).length;

      return preConsentThirdPartyRequestCount > 0 || preConsentVendorCount > 0 || preConsentEvidenceUrlCount > 0 || preConsentTrackingCookieCount > 0;
    }
    case "privacy.dark_pattern_reject_button_missing":
      if (!verifiedConsentSurface) {
        return undefined;
      }
      return (
        consentSummary?.bannerPresent === true &&
        (consentSummary?.rejectPresent === false ||
          consentSummary?.rejectDepthClass === "absent" ||
          consentVisual?.rejectHidden === true)
      );
    case "privacy.dark_pattern_accept_button_prominence":
      if (!verifiedConsentSurface) {
        return undefined;
      }
      if (consentSummary?.acceptPresent !== true) {
        return undefined;
      }
      return (
        consentVisual?.ctaImbalanceDetected === true ||
        consentVisual?.acceptProminence === "high" ||
        consentVisual?.rejectProminence === "none" ||
        consentVisual?.rejectProminence === "low" ||
        consentVisual?.contrastAsymmetryDetected === true
      );
    case "privacy.dark_pattern_forced_consent_wall":
      if (!verifiedConsentSurface) {
        return undefined;
      }
      if (consentSummary?.rejectPresent === true || consentSummary?.closePresent === true) {
        return undefined;
      }
      return (
        consentSummary?.cookieWallDetected === true ||
        consentSummary?.pageInteractionBlocked === true ||
        uiSummary?.forcedActionRequired === true
      );
    case "privacy.dark_pattern_accept_only_banner":
      if (!verifiedConsentSurface) {
        return undefined;
      }
      return (
        consentVisual?.acceptOnly === true ||
        (consentSummary?.bannerPresent === true &&
          consentSummary?.acceptPresent === true &&
          consentSummary?.rejectPresent === false &&
          consentSummary?.managePresent === false)
      );
    case "privacy.dark_pattern_dismiss_without_reject":
      if (!verifiedConsentSurface) {
        return undefined;
      }
      return (
        consentSummary?.closePresent === true &&
        consentSummary?.rejectPresent === false &&
        (consentSummary?.acceptPresent === true || consentSummary?.bannerDisappearedWithoutChoice === true)
      );
    case "commerce.session_replay_tool_detected":
    case "privacy.session_replay_runtime_detected":
      return hasSessionReplayObserved(hybrid);
    case "privacy.session_replay_runtime_vendors":
      return getSessionReplayVendors(hybrid);
    case "privacy.fingerprinting_detected":
      return (getNumber(fingerprintSummary?.tier) ?? 0) >= 2;
    case "privacy.popup_behavior_detected":
      return (getNumber(uiSummary?.popupCount) ?? 0) > 0;
    case "privacy.overlay_blocking_detected":
      return (
        consentSummary?.cookieWallDetected === true ||
        consentSummary?.pageInteractionBlocked === true ||
        uiSummary?.interstitialDetected === true ||
        uiSummary?.scrollLocked === true ||
        uiSummary?.forcedActionRequired === true
      );
    case "privacy.autoplay_media_detected":
      return mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true;
    case "privacy.video_content_tracking_exposure_detected":
      return hasVideoContentTrackingExposure(hybrid);
    case "privacy.cross_domain_identifier_sharing_observed":
      return hasCrossDomainIdentifierSharingEvidence(hybrid);
    default:
      return undefined;
  }
}

export function getHybridSignalFallbackEvidence(input: {
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
}): Record<string, unknown> | null {
  if (input.signalKey === "privacy.pre_submit_text_capture_detected") {
    const rows = getObjectArray(input.runtimeArtifacts?.pre_submit_text_capture_evidence ?? input.runtimeArtifacts?.preSubmitTextCaptureEvidence);
    if (rows.length === 0) {
      return null;
    }

    return {
      preSubmitTextCaptureEvidence: rows,
      pre_submit_text_capture_evidence: rows,
      runtimeEvidenceArtifacts: ["pre_submit_text_capture_evidence"],
      signalKey: input.signalKey,
      signalLabel: input.signalLabel,
      signalValue: input.signalValue
    };
  }

  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const consentSummary = getRecord(hybrid.consentSummary);
  const consentVisual = getRecord(hybrid.consentVisual);
  const uiSummary = getRecord(hybrid.uiSummary);
  const networkSummary = getRecord(hybrid.networkSummary);
  const navigationSummary = getRecord(hybrid.navigationSummary ?? hybrid.navigation_summary);
  const consentPageUrl = getString(navigationSummary?.finalUrl ?? navigationSummary?.final_url ?? navigationSummary?.initialUrl ?? navigationSummary?.initial_url);
  const fingerprintSummary = getFingerprintSummary(hybrid);
  const mediaSummary = getMediaSummary(hybrid);
  const verifiedConsentSurface = hasVerifiedConsentSurface(hybrid, input.runtimeArtifacts);

  switch (input.signalKey) {
    case "privacy.preconsent_tracking_detected":
    case "privacy.tracking_before_consent_detected": {
      const preconsentRequestUrls = getPreconsentRequestUrls(hybrid);
      const preconsentVendors = getPreconsentTrackerVendors(hybrid);
      const preconsentEvidenceQuality = buildPreconsentEvidenceQualityFallback(input.runtimeArtifacts);
      const allPreconsentCookieEvidence = getPreconsentCookieEvidenceRows(hybrid, input.runtimeArtifacts);
      const functionalPreconsentCookieEvidence = allPreconsentCookieEvidence.filter((row) =>
        isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
      );
      const preconsentCookieEvidence = allPreconsentCookieEvidence.filter(
        (row) =>
          !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain) &&
          (row.nonEssential || (row.party === "third_party" && row.category !== "necessary"))
      );
      const preconsentNonEssentialCookies = uniqueStrings(
        preconsentCookieEvidence.filter((row) => row.nonEssential).flatMap((row) => row.cookieName)
      );
      const preconsentCookieNames = uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.cookieName));
      const beforeConsentCookieRows = preconsentCookieEvidence.filter((row) => row.timingEvidence === "before_consent_cookie_write");
      const timelineMarkers = getRecord(hybrid.timelineMarkers);
      return {
        consentBannerDetectedMs: getNumber(timelineMarkers?.consentBannerDetectedMs),
        consentChoiceAtMs: getNumber(
          timelineMarkers?.consentChoiceAtMs ??
            timelineMarkers?.consentAcceptedAtMs ??
            timelineMarkers?.consentRejectedAtMs
        ),
        firstRequestMs: getNumber(timelineMarkers?.firstRequestMs),
        firstThirdPartyRequestMs: getNumber(timelineMarkers?.firstThirdPartyRequestMs),
        firstCookieSeenMs: getNumber(timelineMarkers?.firstCookieSeenMs),
        cmpVisibleMs: getNumber(getRecord(hybrid.consentSummary)?.firstVisibleMs),
        preconsent_cookie_before_consent_count: beforeConsentCookieRows.length,
        preconsent_cookie_categories: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.category)),
        preconsent_cookie_evidence: preconsentCookieEvidence,
        preconsent_cookie_excluded_functional_evidence: functionalPreconsentCookieEvidence,
        preconsent_cookie_excluded_functional_names: uniqueStrings(functionalPreconsentCookieEvidence.flatMap((row) => row.cookieName)),
        preconsent_cookie_initiator_domains: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.initiatorDomain)),
        preconsent_cookie_initiator_urls: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.initiatorUrl)),
        preconsent_cookie_initiator_vendors: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.initiatorVendor)),
        preconsent_cookie_names: preconsentCookieNames,
        preconsent_cookie_set_methods: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.setMethod)),
        preconsent_cookie_timing_evidence: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.timingEvidence)),
        preconsent_nonessential_cookie_names: preconsentNonEssentialCookies,
        preconsent_tracker_evidence_urls: preconsentRequestUrls,
        preconsent_tracker_vendor_evidence: getPreconsentVendorEvidenceRows(hybrid),
        preconsent_tracker_vendors: preconsentVendors,
        preconsent_tracking_detected: true,
        requestUrls: preconsentRequestUrls,
        runtimeEvidenceUrls: preconsentRequestUrls,
        runtimeVendors: preconsentVendors,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
        tracking_before_consent_detected: true,
        runtimeEvidenceQuality: "legacy_without_consent_timeline",
        runtimeEvidenceQualityDisposition: "audit_only_until_evidence_quality_artifacts_present",
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        hybridNetworkSummary: networkSummary,
        ...(preconsentEvidenceQuality ?? {})
      };
    }
    case "privacy.dark_pattern_reject_button_missing":
      if (!verifiedConsentSurface) {
        return null;
      }
      return {
        consentSurfaceObserved: true,
        reject_button_missing: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        ...(consentPageUrl ? { pageUrl: consentPageUrl } : {}),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        consentUiArtifactRefs: getHybridArtifactRefs(hybrid, ["consentArtifactRefs", "consent_artifact_refs", "bannerScreenshotRefs", "banner_screenshot_refs"]),
        hybridConsentSummary: consentSummary,
        hybridConsentVisual: consentVisual
      };
    case "privacy.dark_pattern_accept_button_prominence":
      if (!verifiedConsentSurface) {
        return null;
      }
      return {
        consentSurfaceObserved: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        ...(consentPageUrl ? { pageUrl: consentPageUrl } : {}),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        consentUiArtifactRefs: getHybridArtifactRefs(hybrid, ["consentArtifactRefs", "consent_artifact_refs", "bannerScreenshotRefs", "banner_screenshot_refs"]),
        hybridConsentSummary: consentSummary,
        hybridConsentVisual: consentVisual
      };
    case "privacy.dark_pattern_forced_consent_wall":
      if (!verifiedConsentSurface) {
        return null;
      }
      return {
        consentSurfaceObserved: true,
        forced_consent_wall: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        ...(consentPageUrl ? { pageUrl: consentPageUrl } : {}),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        consentUiArtifactRefs: getHybridArtifactRefs(hybrid, ["consentArtifactRefs", "consent_artifact_refs", "bannerScreenshotRefs", "banner_screenshot_refs"]),
        hybridConsentSummary: consentSummary,
        hybridUiSummary: uiSummary
      };
    case "privacy.dark_pattern_accept_only_banner":
      if (!verifiedConsentSurface) {
        return null;
      }
      return {
        consentSurfaceObserved: true,
        accept_only_banner: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        ...(consentPageUrl ? { pageUrl: consentPageUrl } : {}),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        consentUiArtifactRefs: getHybridArtifactRefs(hybrid, ["consentArtifactRefs", "consent_artifact_refs", "bannerScreenshotRefs", "banner_screenshot_refs"]),
        hybridConsentSummary: consentSummary,
        hybridConsentVisual: consentVisual
      };
    case "privacy.dark_pattern_dismiss_without_reject":
      if (!verifiedConsentSurface) {
        return null;
      }
      return {
        consentSurfaceObserved: true,
        dismiss_without_reject: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        ...(consentPageUrl ? { pageUrl: consentPageUrl } : {}),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        consentUiArtifactRefs: getHybridArtifactRefs(hybrid, ["consentArtifactRefs", "consent_artifact_refs", "bannerScreenshotRefs", "banner_screenshot_refs"]),
        hybridConsentSummary: consentSummary
      };
    case "commerce.session_replay_tool_detected":
    case "privacy.session_replay_runtime_detected":
    case "privacy.session_replay_runtime_vendors": {
      const runtimeVendors = getSessionReplayVendors(hybrid);
      const requestUrls = getSessionReplayRequestUrls(hybrid);
      return {
        session_replay_runtime_detected: runtimeVendors.length > 0 || requestUrls.length > 0,
        session_replay_request_urls: requestUrls,
        session_replay_runtime_vendors: runtimeVendors,
        session_replay_vendor_artifact_present: runtimeVendors.length > 0 || requestUrls.length > 0,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        requestUrls,
        runtimeEvidenceUrls: requestUrls,
        runtimeVendors
      };
    }
    case "privacy.fingerprinting_detected":
      return {
        fingerprintAttributeCategories: getFingerprintAttributeCategories(fingerprintSummary),
        fingerprintArtifactRefs: getFingerprintArtifactRefs(hybrid, fingerprintSummary),
        fingerprinting_detected: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        fingerprintSummary
      };
    case "privacy.popup_behavior_detected":
      return {
        popup_behavior_detected: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        hybridUiSummary: uiSummary
      };
    case "privacy.overlay_blocking_detected":
      return {
        overlay_blocking_detected: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        hybridConsentSummary: consentSummary,
        hybridUiSummary: uiSummary
      };
    case "privacy.autoplay_media_detected":
      return {
        autoplay_media_detected: true,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        hybridMediaSummary: mediaSummary
      };
    case "privacy.video_content_tracking_exposure_detected":
      return {
        metaPixelPayloadFieldHints: getMetaPixelPayloadFieldHints(hybrid),
        metaPixelRequestUrls: getMetaPixelRequestUrls(hybrid),
        metaPixelRuntimePhases: getMetaPixelRuntimePhases(hybrid),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        runtimeEvidenceUrls: getMetaPixelRequestUrls(hybrid),
        runtimeRequestUrls: getMetaPixelRequestUrls(hybrid),
        runtimeVendors: ["Meta Pixel"],
        samePageVideoTrackingCorrelation: hasSamePageVideoMetaCorrelation(hybrid),
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        supportingSignals: ["privacy.video_content_tracking_exposure_detected"],
        videoContentSurfaceObserved: hasVideoContentSurface(hybrid),
        videoContentTrackingExposureDetected: hasVideoContentTrackingExposure(hybrid),
        videoPageUrls: getVideoPageUrls(hybrid),
        videoTitleSnippets: getVideoTitleSnippets(hybrid),
        hybridMediaSummary: mediaSummary
      };
    case "privacy.cross_domain_identifier_sharing_observed": {
      const crossDomainIdentifierSharingEvidence = getCrossDomainIdentifierSharingRows(hybrid);
      const destinationEtlds = getCrossDomainIdentifierSharingDestinationEtlds(hybrid);
      const destinationCategories = getCrossDomainIdentifierSharingDestinationCategories(hybrid);
      const runtimeEvidenceUrls = getCrossDomainIdentifierSharingRequestUrls(hybrid);
      return {
        crossDomainIdentifierSharingDetected: crossDomainIdentifierSharingEvidence.length > 0,
        crossDomainIdentifierSharingDestinationCategories: destinationCategories,
        crossDomainIdentifierSharingDestinationCount: destinationEtlds.length,
        crossDomainIdentifierSharingDestinationEtlds: destinationEtlds,
        crossDomainIdentifierSharingEvidence,
        identifierClasses: uniqueStrings(
          crossDomainIdentifierSharingEvidence.flatMap((row) =>
            getString(row.identifierClass ?? row.identifier_class)
          )
        ),
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        runtimeEvidenceUrls,
        runtimeRequestUrls: runtimeEvidenceUrls,
        signalKey: input.signalKey,
        signalLabel: input.signalLabel,
        signalValue: input.signalValue,
        supportingSignals: ["privacy.cross_domain_identifier_sharing_observed"],
        valueHashCount: uniqueStrings(
          crossDomainIdentifierSharingEvidence.flatMap((row) =>
            getString(row.valueHash ?? row.value_hash)
          )
        ).length
      };
    }
    default:
      return null;
  }
}
