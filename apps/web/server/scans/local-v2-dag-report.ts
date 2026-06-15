import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  shouldUseLocalV2DagScanTool,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getLocalV2DagReportInput(scanRecord: ScanDetailResponse) {
  const config = scanRecord.scan.scanConfigJson;
  if (!isRecord(config) || config.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    return null;
  }

  const execution = getRecord(config, "execution");
  const v2DagParallel = getRecord(execution, "v2DagParallel");
  if (v2DagParallel?.localOnly !== true || v2DagParallel?.artifactOnly !== true) {
    return null;
  }

  const localV2Dag = getRecord(execution, "localV2Dag");
  const outDir = getString(localV2Dag?.outDir);
  const normalizedUrl = getString(config.normalizedUrl);
  const hostname = getString(config.hostname) ?? scanRecord.scan.domainHostname;
  const profile = getString(v2DagParallel.profile) ?? getString(config.profile) ?? "full";

  return {
    outDir,
    profile: profile === "tiny" ? "tiny" as LocalV2DagScanProfile : "full" as LocalV2DagScanProfile,
    url: normalizedUrl ?? hostname ?? null
  };
}

export function isLocalV2DagReport(scanRecord: ScanDetailResponse) {
  return Boolean(getLocalV2DagReportInput(scanRecord));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").replace(/^www\./i, "").toLowerCase() || null;
  }
}

function registrableDomain(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  const parts = hostname.split(".").filter(Boolean);
  return parts.length <= 2 ? hostname : parts.slice(-2).join(".");
}

function sameSite(hostname: string | null | undefined, rootDomain: string | null | undefined) {
  if (!hostname || !rootDomain) {
    return false;
  }
  const normalizedHost = hostname.replace(/^www\./i, "").toLowerCase();
  const normalizedRoot = rootDomain.replace(/^www\./i, "").toLowerCase();
  return normalizedHost === normalizedRoot || normalizedHost.endsWith(`.${normalizedRoot}`);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function durationMsFromTimestamps(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }

  return completedAtMs - startedAtMs;
}

function purposeToCategory(value: string | null | undefined) {
  switch (value) {
    case "advertising":
    case "analytics":
    case "session_replay":
    case "tag_manager":
    case "tracking":
      return value;
    case "consent_management":
      return "cmp";
    case "customer_data_platform":
      return "analytics";
    default:
      return value ?? "unknown";
  }
}

function policySurfaceLabel(surfaceType: string) {
  return surfaceType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePolicyPageType(surfaceType: string) {
  return surfaceType === "terms" ? "terms_of_service" : surfaceType;
}

function requestUrl(row: Record<string, unknown>) {
  return firstString(row.normalizedUrl, row.requestUrl, row.url);
}

function cookieName(row: Record<string, unknown>) {
  return firstString(row.cookieName, row.name);
}

function v2ArtifactRoots() {
  return [
    path.resolve(process.cwd(), "artifacts/local-v2-dag-scans"),
    path.resolve(process.cwd(), "../..", "artifacts/local-v2-dag-scans")
  ];
}

function resolveLocalV2OutDir(outDir: string) {
  const resolved = path.resolve(outDir);
  const roots = v2ArtifactRoots();
  const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!inAllowedRoot) {
    throw new Error("Local v2 DAG artifact path is outside artifacts/local-v2-dag-scans.");
  }
  return resolved;
}

async function readLocalV2DagBundle(outDir: string): Promise<CanonicalEvidenceBundle | null> {
  try {
    const raw = await readFile(path.join(resolveLocalV2OutDir(outDir), "CanonicalEvidenceBundle.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" &&
        parsed.schemaVersion !== "certscore.v2.alpha.1")
    ) {
      return null;
    }
    return parsed as CanonicalEvidenceBundle;
  } catch {
    return null;
  }
}

function buildVendorEvidence(bundle: CanonicalEvidenceBundle) {
  const vendors = bundle.normalizedVendorObservations ?? [];
  return vendors.map((vendor) => {
    const vendorName = firstString(vendor.product, vendor.vendor, vendor.entity) ?? "Unknown vendor";
    const category = purposeToCategory(firstString(vendor.purpose));
    const evidenceHost = uniqueStrings((vendor.matchedEvidenceRefs ?? []).map((ref) => hostnameFromUrl(ref.url ?? ref.label))).find(Boolean) ?? null;
    return {
      beforeConsent: true,
      collectionEndpointType: "direct_third_party",
      confidence: typeof vendor.confidence === "number" ? vendor.confidence : 0.85,
      detectionSource: "local_v2_dag_runtime",
      firstPartyOrThirdParty: "third_party",
      matchedSignatureId: vendor.observationId ?? null,
      scriptHost: evidenceHost,
      vendorCategory: category,
      vendorName
    };
  }).filter((vendor) => vendor.vendorCategory !== "cmp");
}

function buildMaterializedLocalV2Detail(scanRecord: ScanDetailResponse, bundle: CanonicalEvidenceBundle): ScanDetailResponse {
  const requestedHost = scanRecord.scan.domainHostname ?? hostnameFromUrl(bundle.normalizedUrl ?? bundle.url);
  const rootDomain = registrableDomain(requestedHost);
  const networkEvents = bundle.networkEvents ?? [];
  const cookieEvents = bundle.cookieEvents ?? [];
  const vendorRows = buildVendorEvidence(bundle);
  const thirdPartyRequests = networkEvents.filter((event) => event.thirdParty === true || event.isThirdParty === true);
  const thirdPartyDomains = uniqueStrings(thirdPartyRequests.map((event) => event.hostname ?? hostnameFromUrl(event.url)));
  const preconsentRequests = thirdPartyRequests.filter((event) => event.consentStateAtTime === "pre_consent");
  const preconsentRequestUrls = uniqueStrings(preconsentRequests.map((event) => requestUrl(event)));
  const preconsentCookies = cookieEvents.filter((event) => event.consentStateAtTime === "pre_consent");
  const cookieNames = uniqueStrings(cookieEvents.map((event) => cookieName(event)));
  const preconsentCookieNames = uniqueStrings(preconsentCookies.map((event) => cookieName(event)));
  const cmp = bundle.cmpRuntimeObservations?.[0] ?? null;
  const cmpVendorName = firstString(cmp?.product, cmp?.vendor, cmp?.entity);
  const policySurfaces = bundle.policySurfaceObservations ?? [];
  const privacySurface = policySurfaces.find((surface) => surface.surfaceType === "privacy_policy");
  const termsSurface = policySurfaces.find((surface) => surface.surfaceType === "terms");
  const cookieSurface = policySurfaces.find((surface) => surface.surfaceType === "cookie_policy");
  const thirdPartyRequestCount =
    bundle.runtimeCoverage?.observationCounts.thirdPartyRequests ?? thirdPartyRequests.length;
  const cookiesBeforeConsentCount =
    bundle.runtimeCoverage?.observationCounts.cookiesBeforeConsent ?? preconsentCookies.length;
  const vendorCategoryCounts = vendorRows.reduce<Record<string, number>>((counts, vendor) => {
    counts[vendor.vendorCategory] = (counts[vendor.vendorCategory] ?? 0) + 1;
    return counts;
  }, {});
  const score =
    thirdPartyRequestCount > 0 || cookiesBeforeConsentCount > 0
      ? Math.max(35, Math.min(72, 82 - Math.min(24, Math.round(thirdPartyRequestCount / 8)) - Math.min(18, cookiesBeforeConsentCount)))
      : 88;
  const requestPurposeRows = (preconsentRequests
    .map((event) => {
      const matchedVendor = vendorRows.find((vendor) => {
        const host = hostnameFromUrl(event.hostname ?? event.url);
        return Boolean(host && vendor.scriptHost && (host === vendor.scriptHost || host.endsWith(`.${vendor.scriptHost}`)));
      }) ?? vendorRows[0] ?? null;
      const url = requestUrl(event);
      const hostname = event.hostname ?? hostnameFromUrl(url);
      return matchedVendor && url && hostname
        ? {
            category: matchedVendor.vendorCategory,
            classification: "tracking",
            classificationBasis: "local_v2_dag_runtime_vendor_observation",
            confidence: matchedVendor.confidence,
            essentiality: "non_essential",
            firstPartyOrThirdParty: sameSite(hostname, rootDomain) ? "first_party" : "third_party",
            hostname,
            requestUrl: url,
            runtimePhase: "pre_consent",
            tsMs: event.timestampMs,
            vendor: matchedVendor.vendorName,
            vendorName: matchedVendor.vendorName
          }
        : null;
    })
    .filter((row) => row !== null) as Array<Record<string, unknown>>)
    .slice(0, 25);
  const cookieWriteObservations = cookieEvents.map((event) => ({
    beforeConsent: event.consentStateAtTime === "pre_consent",
    category: event.cookiePurpose ?? "unknown",
    cookieName: event.cookieName,
    domain: event.cookieDomain ?? event.hostname,
    initiatorDomain: event.hostname,
    initiatorUrl: event.url,
    initiatorVendor: vendorRows[0]?.vendorName ?? null,
    nonEssential: event.cookiePurpose !== "security",
    party: event.cookieParty ?? (event.thirdParty ? "third_party" : "first_party"),
    setMethod: event.operation ?? "cookie_event",
    thirdParty: event.thirdParty === true || event.cookieParty === "third_party",
    timingEvidence: event.consentStateAtTime === "pre_consent" ? "before_consent_cookie_write" : "observed_cookie_write"
  }));
  const hybridRuntimeEvidence = {
    consentSummary: {
      bannerPresent: Boolean(cmpVendorName ?? bundle.derivedRuntimeSignals?.consentBannerLikelyPresent),
      firstVisibleMs: cmp?.observedAtMs ?? null,
      requestsBeforeAnyConsentAction: preconsentRequests.length > 0
    },
    networkSummary: {
      preConsentRequestCount: preconsentRequests.length,
      preConsentThirdPartyRequestCount: preconsentRequests.length,
      thirdPartyDomainCount: thirdPartyDomains.length,
      thirdPartyRequestCount,
      totalRequestCount: networkEvents.length
    },
    requestObservations: networkEvents.slice(0, 200).map((event) => ({
      collectionEndpointObserved: event.collectionEndpointObserved === true,
      domain: event.hostname ?? hostnameFromUrl(event.url),
      preConsent: event.consentStateAtTime === "pre_consent",
      requestUrl: requestUrl(event),
      thirdParty: event.thirdParty === true || event.isThirdParty === true,
      timestampMs: event.timestampMs,
      url: requestUrl(event)
    })),
    requestPurposeClassificationConfidence: requestPurposeRows,
    requestToVendorObservations: vendorRows.map((vendor) => ({
      category: vendor.vendorCategory,
      hostname: vendor.scriptHost,
      preConsent: true,
      vendor: vendor.vendorName
    })),
    storageSummary: {
      cookiesBeforeConsentCount,
      cookiesSeenCount: cookieNames.length,
      thirdPartyCookieBeforeConsentCount: preconsentCookies.filter((event) => event.cookieParty === "third_party" || event.thirdParty === true).length
    },
    timelineMarkers: {
      firstCmpVisibleMs: cmp?.observedAtMs ?? null,
      firstNonEssentialRequestMs: firstNumber(...preconsentRequests.map((event) => event.timestampMs)),
      firstRequestMs: firstNumber(...networkEvents.map((event) => event.timestampMs)),
      firstTrackingCookieSetMs: firstNumber(...preconsentCookies.map((event) => event.timestampMs)),
      timelineConfidence: "direct_v2_runtime"
    },
    vendorSummary: {
      normalizedVendors: uniqueStrings(vendorRows.map((vendor) => vendor.vendorName)),
      preConsentVendorCount: vendorRows.length,
      rawThirdPartyDomains: thirdPartyDomains,
      vendorCategoryCounts
    }
  };
  const runtimeArtifacts = {
    ...(scanRecord.runtimeArtifacts ?? {}),
    local_v2_dag_scan_core_duration_ms: durationMsFromTimestamps(bundle.startedAt, bundle.completedAt),
    consent_audit_completed: true,
    consent_baseline_tracker_evidence_urls: preconsentRequestUrls,
    consent_baseline_tracker_vendor_names: uniqueStrings(vendorRows.map((vendor) => vendor.vendorName)),
    consent_preconsent_violation_count: Math.max(preconsentRequests.length, vendorRows.length),
    consentActionableChoiceObserved: Boolean(cmpVendorName),
    consentSurfaceObserved: Boolean(cmpVendorName),
    consent_actionable_choice_observed: Boolean(cmpVendorName),
    consent_surface_observed: Boolean(cmpVendorName),
    consentTimeline: hybridRuntimeEvidence.timelineMarkers,
    consent_timeline: hybridRuntimeEvidence.timelineMarkers,
    domainVendorRegistry: vendorRows.map((vendor) => ({
      endpointHostname: vendor.scriptHost,
      vendorCategory: vendor.vendorCategory,
      vendorName: vendor.vendorName
    })),
    hybridRuntimeEvidence: hybridRuntimeEvidence,
    hybrid_runtime_evidence: hybridRuntimeEvidence,
    initial_cookie_count: cookieNames.length,
    initial_cookie_domains: uniqueStrings(cookieEvents.map((event) => event.cookieDomain ?? event.hostname)),
    initial_cookie_names: cookieNames,
    key_page_discovery_summary: {
      pageSummaries: [privacySurface, termsSurface, cookieSurface]
        .filter((surface): surface is NonNullable<typeof surface> => Boolean(surface))
        .map((surface) => ({
          bestCandidateUrl: surface.normalizedUrl ?? surface.url,
          pageType: surface.surfaceType,
          successfulUrl: surface.normalizedUrl ?? surface.url,
          surfaceDetected: true,
          surfaceState: "linked_and_verified"
        }))
    },
    requestPurposeClassificationConfidence: requestPurposeRows,
    request_purpose_classification_confidence: requestPurposeRows,
    thirdPartyRequestCount: thirdPartyRequestCount,
    thirdPartyRequestDomains: thirdPartyDomains,
    third_party_request_count: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyDomains
  };
  const snapshot = {
    ...(scanRecord.snapshot ?? {}),
    certscore_overall: score,
    consent_maturity_score: Math.max(0, score - 5),
    consent_score: Math.max(0, score - 10),
    cookie_banner_present: Boolean(cmpVendorName ?? bundle.derivedRuntimeSignals?.consentBannerLikelyPresent),
    cookie_count_total: cookieNames.length,
    data_collection_risk_score: Math.min(100, Math.max(20, thirdPartyRequestCount)),
    domain: requestedHost,
    final_effective_url: bundle.normalizedUrl ?? bundle.url,
    final_url: bundle.normalizedUrl ?? bundle.url,
    homepage_fetch_status: "success",
    legal_coverage_score: score,
    pages_scanned: Math.max(scanRecord.scan.pagesScanned, 1),
    partial_scan: true,
    preconsent_tracking_detected: bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0,
    privacy_policy_present: Boolean(privacySurface),
    privacy_score: score,
    registered_domain: rootDomain,
    third_party_cookie_count: preconsentCookies.filter((event) => event.cookieParty === "third_party" || event.thirdParty === true).length,
    third_party_cookie_set_before_consent: preconsentCookies.length > 0,
    third_party_request_count: thirdPartyRequestCount,
    third_party_script_domain_count: thirdPartyDomains.length,
    tracker_count_total: Math.max(vendorRows.length, thirdPartyDomains.length),
    tracker_vendor_count: vendorRows.length,
    tracking_before_consent_detected: bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0,
    verified_public_surfaces_count: policySurfaces.length,
    ...(cmpVendorName ? { cmp_vendor_name: cmpVendorName } : {}),
    ...(cookieSurface ? { cookie_policy_present: true } : {}),
    ...(termsSurface ? { terms_of_service_present: true } : {})
  };
  const policyEnrichmentRows = policySurfaces.map((surface) => ({
    id: `local-v2-${surface.observationId}`,
    pageType: normalizePolicyPageType(surface.surfaceType),
    pageUrl: surface.normalizedUrl ?? surface.url,
    page_type: normalizePolicyPageType(surface.surfaceType),
    page_url: surface.normalizedUrl ?? surface.url,
    policyActionableFlags: surface.mentionedControls ?? [],
    policyMentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    policySummaryShort: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`,
    policy_actionable_flags: surface.mentionedControls ?? [],
    policy_mentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    policy_summary_short: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`
  }));
  const signalRows = [
    {
      category: "privacy",
      key: "privacy.preconsent_tracking_detected",
      label: "Pre-consent tracking detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    },
    {
      category: "privacy",
      key: "tracking_before_consent_detected",
      label: "Tracking before consent detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    }
  ] satisfies ScanDetailResponse["signals"];
  const existingSignalKeys = new Set(scanRecord.signals.map((signal) => signal.key));
  const materializedSignals = [
    ...scanRecord.signals,
    ...signalRows.filter((signal) => !existingSignalKeys.has(signal.key))
  ];
  const preconsentViolations = vendorRows.map((vendor) => ({
    collectionEndpointType: vendor.collectionEndpointType,
    confidence: vendor.confidence,
    detectionSource: vendor.detectionSource,
    evidenceUrls: preconsentRequestUrls.filter((url) => vendor.scriptHost && url.includes(vendor.scriptHost)).slice(0, 5),
    firstPartyOrThirdParty: vendor.firstPartyOrThirdParty,
    matchedSignatureId: vendor.matchedSignatureId,
    scriptHost: vendor.scriptHost,
    vendorCategory: vendor.vendorCategory,
    vendorName: vendor.vendorName
  }));

  return {
    ...scanRecord,
    pageEvidence: scanRecord.pageEvidence,
    policyEnrichment: [...scanRecord.policyEnrichment, ...policyEnrichmentRows],
    preconsentViolations: scanRecord.preconsentViolations.length > 0 ? scanRecord.preconsentViolations : preconsentViolations,
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment ?? policyEnrichmentRows.find((row) => row.pageType === "privacy_policy") ?? policyEnrichmentRows[0] ?? null,
    runtimeArtifacts,
    scan: {
      ...scanRecord.scan,
      pagesScanned: Math.max(scanRecord.scan.pagesScanned, 1)
    },
    signals: materializedSignals,
    snapshot,
    trackerVendors: scanRecord.trackerVendors.length > 0 ? scanRecord.trackerVendors : vendorRows
  };
}

export async function materializeLocalV2DagScanDetail(scanRecord: ScanDetailResponse): Promise<ScanDetailResponse> {
  const input = getLocalV2DagReportInput(scanRecord);
  if (!input || scanRecord.scan.status !== "completed" || !input.outDir || !shouldUseLocalV2DagScanTool()) {
    return scanRecord;
  }
  const bundle = await readLocalV2DagBundle(input.outDir);
  return bundle ? buildMaterializedLocalV2Detail(scanRecord, bundle) : scanRecord;
}
