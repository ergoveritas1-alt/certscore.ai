import type { PopulatedSignalRecord, ReportSignalSource } from "@website-signal-risk-scanner/shared";
import {
  buildRuntimeCookieInventory
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

  return {
    ...runtimeArtifacts,
    consent_audit_completed: consentAuditCompleted,
    consent_reject_interaction_succeeded: consentRejectInteractionSucceeded,
    consentRejectInteractionSucceeded: consentRejectInteractionSucceeded,
    consent_reject_reduced_tracking: consentRejectReducedTracking,
    consentRejectReducedTracking: consentRejectReducedTracking,
    consent_reject_reduced_third_party_cookies: consentRejectReducedThirdPartyCookies,
    consentRejectReducedThirdPartyCookies: consentRejectReducedThirdPartyCookies,
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
  if (explicitCount !== null) {
    return explicitCount;
  }

  const vendorCount = getPreconsentTrackerVendors(hybrid).length;
  return vendorCount > 0 ? vendorCount : 0;
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

      return preConsentThirdPartyRequestCount > 0 || preConsentVendorCount > 0;
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
      return consentSummary?.closePresent === true && consentSummary?.rejectPresent === false;
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
        uiSummary?.overlayDetected === true ||
        uiSummary?.interstitialDetected === true ||
        uiSummary?.scrollLocked === true ||
        uiSummary?.forcedActionRequired === true
      );
    case "privacy.autoplay_media_detected":
      return mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true;
    default:
      return undefined;
  }
}

export function getHybridSignalFallbackEvidence(input: {
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
}) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const consentSummary = getRecord(hybrid.consentSummary);
  const consentVisual = getRecord(hybrid.consentVisual);
  const uiSummary = getRecord(hybrid.uiSummary);
  const networkSummary = getRecord(hybrid.networkSummary);
  const fingerprintSummary = getFingerprintSummary(hybrid);
  const mediaSummary = getMediaSummary(hybrid);
  const verifiedConsentSurface = hasVerifiedConsentSurface(hybrid, input.runtimeArtifacts);

  switch (input.signalKey) {
    case "privacy.preconsent_tracking_detected":
    case "privacy.tracking_before_consent_detected": {
      const preconsentRequestUrls = getPreconsentRequestUrls(hybrid);
      const preconsentVendors = getPreconsentTrackerVendors(hybrid);
      const preconsentCookieEvidence = getPreconsentCookieEvidenceRows(hybrid, input.runtimeArtifacts);
      const preconsentNonEssentialCookies = uniqueStrings(
        preconsentCookieEvidence.filter((row) => row.nonEssential).flatMap((row) => row.cookieName)
      );
      const preconsentCookieNames = uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.cookieName));
      const beforeConsentCookieRows = preconsentCookieEvidence.filter((row) => row.timingEvidence === "before_consent_cookie_write");
      return {
        consentBannerDetectedMs: getNumber(getRecord(hybrid.timelineMarkers)?.consentBannerDetectedMs),
        consentChoiceAtMs: getNumber(
          getRecord(hybrid.timelineMarkers)?.consentChoiceAtMs ??
            getRecord(hybrid.timelineMarkers)?.consentAcceptedAtMs ??
            getRecord(hybrid.timelineMarkers)?.consentRejectedAtMs
        ),
        preconsent_cookie_before_consent_count: beforeConsentCookieRows.length,
        preconsent_cookie_categories: uniqueStrings(preconsentCookieEvidence.flatMap((row) => row.category)),
        preconsent_cookie_evidence: preconsentCookieEvidence,
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
        runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
        hybridNetworkSummary: networkSummary
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
    default:
      return null;
  }
}
