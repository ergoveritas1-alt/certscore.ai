import type { summarizeBrowserEvidence } from "./evidence-summary";
import {
  classifyConsentControlLabel,
  classifyConsentLanguage,
  classifyGdprTransparencyTopics
} from "@certscore/contracts";
import { resolveCanonicalVendor, resolveVendorObservations } from "@certscore/vendor-resolver";
import {
  BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
  BROWSER_SCAN_SOURCE_ID,
  BROWSER_SCAN_SOURCE_TYPE,
  type BrowserScanObservedSignalPackageInput
} from "./schema";

function uniqueStrings(values: Array<string | null | undefined>, limit = 250) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .slice(0, limit);
}

const TRACKING_PURPOSES = new Set(["advertising", "analytics", "session_replay", "tag_management"]);

function vendorLabel(observation: ReturnType<typeof resolveVendorObservations>[number]) {
  return observation.product?.trim() || observation.vendor;
}

function uniqueObservedCookieCount(cookies: ReturnType<typeof summarizeBrowserEvidence>["cookies"]) {
  return new Set(
    cookies.map((cookie) =>
      [cookie.domain.toLowerCase(), cookie.path ?? "/", cookie.cookieName].join("|")
    )
  ).size;
}

function normalizeHostname(value: string) {
  return value.trim().replace(/^\.+/, "").replace(/^www\./i, "").toLowerCase();
}

function roughRegistrableDomain(value: string) {
  const parts = normalizeHostname(value).split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]).has(lastTwo)
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function isFirstPartyCookieDomain(cookieDomain: string, targetHostname: string) {
  return roughRegistrableDomain(cookieDomain) === roughRegistrableDomain(targetHostname);
}

function canonicalAttribution(
  observation: ReturnType<typeof resolveVendorObservations>[number] | null
) {
  return observation
    ? {
        attributionStatus: "resolved" as const,
        confidence: observation.confidence,
        product: observation.product ?? null,
        purpose: observation.purpose,
        regulatoryRelevance: uniqueStrings(observation.regulatoryRelevance, 20),
        vendor: observation.vendor
      }
    : {
        attributionStatus: "unresolved" as const,
        confidence: null,
        product: null,
        purpose: null,
        regulatoryRelevance: [],
        vendor: null
      };
}

function buildCookieInventory(evidence: ReturnType<typeof summarizeBrowserEvidence>) {
  type CookieRow = NonNullable<BrowserScanObservedSignalPackageInput["evidenceInventory"]>["cookies"][number];
  const grouped = new Map<string, CookieRow>();

  for (const event of evidence.cookies) {
    const key = [event.domain.toLowerCase(), event.path ?? "/", event.cookieName].join("|");
    const observation = resolveCanonicalVendor({
      cookieName: event.cookieName,
      evidenceId: browserEvidenceRef("cookie", event.observedAtMs, event.cookieName) ?? undefined,
      hostname: event.domain,
      sourceEventType: event.eventType,
      sourceScanner: BROWSER_SCAN_SOURCE_ID,
      type: "cookie"
    }).observation;
    const candidate: CookieRow = {
      ...canonicalAttribution(observation),
      beforeConsent: event.consentInteractionObserved !== true,
      cookieName: event.cookieName,
      domain: event.domain,
      firstObservedAtMs: event.observedAtMs,
      httpOnly: event.httpOnly === true,
      lastObservedAtMs: event.observedAtMs,
      party: isFirstPartyCookieDomain(event.domain, evidence.targetHostname) ? "first_party" : "third_party",
      path: event.path ?? "/",
      sameSite: event.sameSite ?? null,
      secure: event.secure === true,
      sources: [event.source ?? event.eventType],
      timingBasis: event.timingPrecision ?? "browser_observed"
    };
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, candidate);
      continue;
    }
    grouped.set(key, {
      ...existing,
      attributionStatus: existing.attributionStatus === "resolved" ? "resolved" : candidate.attributionStatus,
      beforeConsent: existing.beforeConsent || candidate.beforeConsent,
      confidence: existing.confidence ?? candidate.confidence,
      firstObservedAtMs: Math.min(existing.firstObservedAtMs, candidate.firstObservedAtMs),
      httpOnly: existing.httpOnly || candidate.httpOnly,
      lastObservedAtMs: Math.max(existing.lastObservedAtMs, candidate.lastObservedAtMs),
      product: existing.product ?? candidate.product,
      purpose: existing.purpose ?? candidate.purpose,
      regulatoryRelevance: uniqueStrings([...existing.regulatoryRelevance, ...candidate.regulatoryRelevance], 20),
      secure: existing.secure || candidate.secure,
      sources: uniqueStrings([...existing.sources, ...candidate.sources], 8),
      vendor: existing.vendor ?? candidate.vendor
    });
  }

  return [...grouped.values()]
    .sort((left, right) => left.firstObservedAtMs - right.firstObservedAtMs || left.cookieName.localeCompare(right.cookieName))
    .slice(0, 250);
}

function buildThirdPartyRequestInventory(evidence: ReturnType<typeof summarizeBrowserEvidence>) {
  type RequestRow = NonNullable<BrowserScanObservedSignalPackageInput["evidenceInventory"]>["thirdPartyRequests"][number];
  const thirdPartyHosts = new Set(evidence.thirdPartyRequestDomains.map((hostname) => hostname.toLowerCase()));
  const grouped = new Map<string, RequestRow>();

  for (const event of evidence.networkEvidence) {
    if (event.consentInteractionObserved === true || !thirdPartyHosts.has(event.hostname.toLowerCase())) {
      continue;
    }
    const observations = resolveVendorObservations([{
      evidenceId: browserEvidenceRef("network_request", event.observedAtMs, event.hostname) ?? undefined,
      hostname: event.hostname,
      sourceEventType: "network_request",
      sourceScanner: BROWSER_SCAN_SOURCE_ID,
      type: event.resourceType === "script" ? "script" : "request",
      url: event.url
    }]);
    const attributed = observations.length > 0 ? observations : [null];
    for (const observation of attributed) {
      const attribution = canonicalAttribution(observation);
      const key = [event.hostname.toLowerCase(), attribution.vendor ?? "unresolved", attribution.product ?? "", attribution.purpose ?? ""].join("|");
      const candidate: RequestRow = {
        ...attribution,
        firstObservedAtMs: event.observedAtMs,
        hostname: event.hostname,
        lastObservedAtMs: event.observedAtMs,
        preConsent: true,
        requestCount: 1,
        resourceTypes: event.resourceType ? [event.resourceType] : []
      };
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, candidate);
        continue;
      }
      grouped.set(key, {
        ...existing,
        firstObservedAtMs: Math.min(existing.firstObservedAtMs, candidate.firstObservedAtMs),
        lastObservedAtMs: Math.max(existing.lastObservedAtMs, candidate.lastObservedAtMs),
        requestCount: existing.requestCount + 1,
        resourceTypes: uniqueStrings([...existing.resourceTypes, ...candidate.resourceTypes], 20)
      });
    }
  }

  return [...grouped.values()]
    .sort((left, right) => left.firstObservedAtMs - right.firstObservedAtMs || left.hostname.localeCompare(right.hostname))
    .slice(0, 250);
}

function browserEvidenceRef(prefix: string, observedAtMs: number | null | undefined, value: string) {
  if (typeof observedAtMs === "number" && Number.isFinite(observedAtMs)) {
    return `bx01.${prefix}:${Math.max(0, Math.round(observedAtMs))}:${value}`;
  }
  return null;
}

export function buildBrowserObservedSignalPackageFromEvidence(input: {
  evidence: ReturnType<typeof summarizeBrowserEvidence>;
}): BrowserScanObservedSignalPackageInput {
  const consentSummary =
    input.evidence.consentSummary && typeof input.evidence.consentSummary === "object"
      ? input.evidence.consentSummary
      : null;
  const consentContextText = uniqueStrings(consentSummary?.matchedTextSnippets ?? [], 12).join(" ").slice(0, 1500);
  const consentControlClassifications = uniqueStrings(consentSummary?.buttonsObserved ?? [], 20).map((label) => ({
    classification: classifyConsentControlLabel({
      label,
      contextText: consentContextText,
      hasConsentContext: consentSummary?.bannerObserved === true
    }),
    label
  }));
  const explicitAcceptObserved = consentControlClassifications.some(
    ({ classification }) => classification.semanticRole === "explicit_accept"
  );
  const ambiguousAcknowledgmentObserved = consentControlClassifications.some(
    ({ classification }) => classification.semanticRole === "ambiguous_acknowledgment"
  );
  const consentLanguage = classifyConsentLanguage({ text: consentContextText });
  const preconsentNetworkEvents = input.evidence.networkEvidence.filter((event) => event.consentInteractionObserved !== true);
  const resolvedPreconsentNetworkEvents = preconsentNetworkEvents.flatMap((event) => {
    const observations = resolveVendorObservations([{
      evidenceId: browserEvidenceRef("network_request", event.observedAtMs, event.hostname) ?? undefined,
      hostname: event.hostname,
      sourceEventType: "network_request",
      sourceScanner: BROWSER_SCAN_SOURCE_ID,
      type: event.resourceType === "script" ? "script" : "request",
      url: event.url
    }]).filter((observation) => TRACKING_PURPOSES.has(observation.purpose));
    return observations.length > 0 ? [{ event, observations }] : [];
  });
  const resolvedCookieObservations = input.evidence.cookies.flatMap((event) =>
    resolveVendorObservations([{
      cookieName: event.cookieName,
      evidenceId: browserEvidenceRef("cookie", event.observedAtMs, event.cookieName) ?? undefined,
      hostname: event.domain,
      sourceEventType: event.eventType,
      sourceScanner: BROWSER_SCAN_SOURCE_ID,
      type: "cookie"
    }]).filter((observation) => TRACKING_PURPOSES.has(observation.purpose))
  );
  const trackerObservations = [
    ...resolvedPreconsentNetworkEvents.flatMap(({ observations }) => observations),
    ...resolvedCookieObservations
  ];
  const trackerVendors = uniqueStrings(trackerObservations.map(vendorLabel));
  const trackerCategories = uniqueStrings(trackerObservations.map((observation) => observation.purpose));
  const preconsentTrackerEvidenceUrls = uniqueStrings(
    resolvedPreconsentNetworkEvents.map(({ event }) => event.url),
    50
  );
  const preconsentTrackerEvidenceRefs = uniqueStrings(
    resolvedPreconsentNetworkEvents.flatMap(({ event }) => [
      event.url,
      browserEvidenceRef("network_request", event.observedAtMs, event.url)
    ]),
    100
  );
  const fingerprintCategories = uniqueStrings(input.evidence.fingerprintCategories, 50);
  const policySurfaces = input.evidence.policySurfaces;
  const policySurfaceUrls = (type: string) => uniqueStrings(
    policySurfaces
      .filter((surface) => surface.pageType === type && typeof surface.finalUrl === "string")
      .map((surface) => surface.finalUrl as string),
    10
  );
  const privacyPolicyUrls = policySurfaceUrls("privacy_policy");
  const cookiePolicyUrls = policySurfaceUrls("cookie_policy");
  const termsUrls = policySurfaceUrls("terms");
  const accessibilityUrls = policySurfaceUrls("accessibility");
  const homepageEvidence = input.evidence.pageEvidence[0] ?? null;
  const iframeUrls = Array.isArray(homepageEvidence?.iframeUrls)
    ? uniqueStrings(homepageEvidence.iframeUrls.filter((value): value is string => typeof value === "string"), 50)
    : [];
  const transportSecure = homepageEvidence?.transportSecure === true;
  const httpProbeAttempted = homepageEvidence?.httpProbeAttempted === true;
  const httpRedirectsToHttps = homepageEvidence?.httpRedirectsToHttps === true;
  const tlsProbeAttempted = homepageEvidence?.tlsProbeAttempted === true;
  const validTlsCertificate = homepageEvidence?.validTlsCertificate === true;
  const mixedContentCount = typeof homepageEvidence?.mixedContentCount === "number" ? homepageEvidence.mixedContentCount : 0;
  const insecureFormActionCount = typeof homepageEvidence?.insecureFormActionCount === "number" ? homepageEvidence.insecureFormActionCount : 0;
  const accessibilitySummary = homepageEvidence?.accessibilitySummary && typeof homepageEvidence.accessibilitySummary === "object"
    ? homepageEvidence.accessibilitySummary as Record<string, unknown>
    : {};
  const imagesMissingAltCount = typeof accessibilitySummary.imagesMissingAltCount === "number" ? accessibilitySummary.imagesMissingAltCount : 0;
  const unlabeledFormControlCount = typeof accessibilitySummary.unlabeledFormControlCount === "number" ? accessibilitySummary.unlabeledFormControlCount : 0;
  const gdprTransparencyTopics = uniqueStrings(
    policySurfaces
      .filter((surface) => surface.pageType === "privacy_policy" && typeof surface.bodyText === "string")
      .flatMap((surface) => classifyGdprTransparencyTopics({ text: surface.bodyText as string }).matches.map((match) => match.topic)),
    20
  );
  const signals: BrowserScanObservedSignalPackageInput["observedSignals"] = [];
  const addSignal = (
    key: string,
    label: string,
    value: boolean | number | string | string[],
    valueType: "boolean" | "number" | "text" | "string_array",
    confidence = 0.78,
    evidenceRefs: string[] = [],
    observedAtMs: number | null = null
  ) => {
    signals.push({
      category: key.startsWith("accessibility.")
        ? "accessibility"
        : key.startsWith("disclosure.")
          ? "disclosure"
          : key.startsWith("context.") || key.startsWith("security.")
            ? "context"
            : "privacy",
      confidence,
      evidenceRefs,
      key,
      label,
      observedAtMs,
      populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
      provenance: {
        captureMode: "single_page_user_browser",
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      },
      value,
      valueType
    });
  };

  addSignal("privacy.third_party_request_count", "Third-party request count", input.evidence.thirdPartyRequestCount, "number", 0.8, [], input.evidence.timelineMarkers.firstRequestMs);
  addSignal("privacy.third_party_request_domains", "Third-party request domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.8);
  addSignal("privacy.third_party_script_domain_count", "Third-party script domain count", input.evidence.thirdPartyRequestDomains.length, "number", 0.68);
  addSignal("privacy.third_party_script_domains", "Third-party script domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.68);
  addSignal("privacy.tracker_vendor_count", "Tracker vendor count", trackerVendors.length, "number", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.tracker_vendors", "Tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_categories", "Pre-consent tracker categories", trackerCategories, "string_array", trackerCategories.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_vendors", "Pre-consent tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_evidence_urls", "Pre-consent tracker evidence URLs", preconsentTrackerEvidenceUrls, "string_array", 0.82, preconsentTrackerEvidenceRefs);
  addSignal("privacy.preconsent_violation_count", "Pre-consent violation count", preconsentTrackerEvidenceUrls.length, "number", 0.82, preconsentTrackerEvidenceRefs, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal(
    "privacy.cookie_count_total",
    "Unique cookies observed",
    uniqueObservedCookieCount(input.evidence.cookies),
    "number",
    0.78,
    [],
    input.evidence.cookies.map((cookie) => cookie.observedAtMs).filter((value): value is number => typeof value === "number").sort((left, right) => left - right)[0] ?? null
  );
  addSignal(
    "privacy.cookie_banner_present",
    "Cookie banner present",
    input.evidence.bannerObserved,
    "boolean",
    0.82,
    input.evidence.bannerObserved
      ? [browserEvidenceRef("consent_ui", consentSummary?.observedAtMs ?? null, "banner")].filter((value): value is string => Boolean(value))
      : [],
    consentSummary?.observedAtMs ?? null
  );
  addSignal("privacy.accept_all_present", "Explicit accept control present", explicitAcceptObserved, "boolean", 0.82);
  addSignal("privacy.ambiguous_acknowledgment_present", "Ambiguous consent acknowledgment present", ambiguousAcknowledgmentObserved, "boolean", 0.82);
  addSignal("privacy.reject_all_present", "Reject-all control present", consentSummary?.rejectObserved === true, "boolean", 0.78);
  addSignal("privacy.granular_preferences_present", "Granular preferences present", consentSummary?.manageObserved === true, "boolean", 0.78);
  addSignal("privacy.first_layer_consent_labels", "First-layer consent control labels", Array.isArray(consentSummary?.buttonsObserved) ? consentSummary.buttonsObserved : [], "string_array", 0.78);
  addSignal(
    "privacy.first_layer_consent_control_roles",
    "First-layer consent control semantic roles",
    consentControlClassifications.map(({ classification, label }) => `${label}|${classification.semanticRole}`),
    "string_array",
    0.82
  );
  if (consentContextText) {
    addSignal(
      "privacy.first_layer_consent_context",
      "Bounded first-layer consent context",
      consentContextText.slice(0, 1500),
      "text",
      0.82,
      [browserEvidenceRef("consent_ui", consentSummary?.observedAtMs ?? null, "banner")].filter((value): value is string => Boolean(value)),
      consentSummary?.observedAtMs ?? null
    );
  }
  addSignal(
    "privacy.implied_consent_language_observed",
    "Implied-consent language observed",
    consentLanguage.impliedConsentLanguageObserved,
    "boolean",
    consentLanguage.impliedConsentLanguageObserved ? 0.9 : 0.72,
    [],
    consentSummary?.observedAtMs ?? null
  );
  addSignal(
    "privacy.implied_consent_language_matches",
    "Implied-consent language matches",
    consentLanguage.matches.map((match) => `${match.classifierId}|${match.confidence}|${match.excerpt}`),
    "string_array",
    0.9,
    [],
    consentSummary?.observedAtMs ?? null
  );
  addSignal("privacy.do_not_sell_link_present", "Do-not-sell/share control present", consentSummary?.doNotSellShareObserved === true, "boolean", 0.72);
  addSignal("privacy.preconsent_tracking_detected", "Pre-consent tracking detected", preconsentTrackerEvidenceUrls.length > 0, "boolean", 0.82, preconsentTrackerEvidenceRefs, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal("privacy.session_replay_runtime_vendors", "Session replay runtime vendors", trackerCategories.includes("session_replay") ? trackerVendors : [], "string_array", 0.76);
  addSignal("privacy.fingerprinting_tier", "Fingerprinting tier", fingerprintCategories.length >= 3 ? 2 : fingerprintCategories.length > 0 ? 1 : 0, "number", 0.6);
  addSignal("privacy.fingerprinting_attribute_categories", "Fingerprinting attribute categories", fingerprintCategories, "string_array", 0.6);
  addSignal("disclosure.privacy_policy_present", "Privacy policy fetched", privacyPolicyUrls.length > 0, "boolean", 0.9, privacyPolicyUrls);
  addSignal("disclosure.privacy_policy_urls", "Privacy policy URLs", privacyPolicyUrls, "string_array", 0.9, privacyPolicyUrls);
  addSignal("disclosure.cookie_policy_present", "Cookie policy fetched", cookiePolicyUrls.length > 0, "boolean", 0.9, cookiePolicyUrls);
  addSignal("disclosure.cookie_policy_urls", "Cookie policy URLs", cookiePolicyUrls, "string_array", 0.9, cookiePolicyUrls);
  addSignal("disclosure.terms_of_service_present", "Terms fetched", termsUrls.length > 0, "boolean", 0.9, termsUrls);
  addSignal("disclosure.terms_urls", "Terms URLs", termsUrls, "string_array", 0.9, termsUrls);
  addSignal("disclosure.accessibility_statement_present", "Accessibility statement fetched", accessibilityUrls.length > 0, "boolean", 0.86, accessibilityUrls);
  addSignal("disclosure.accessibility_statement_urls", "Accessibility statement URLs", accessibilityUrls, "string_array", 0.86, accessibilityUrls);
  addSignal("disclosure.gdpr_transparency_topics", "GDPR transparency topics observed", gdprTransparencyTopics, "string_array", 0.84, privacyPolicyUrls);
  addSignal("security.https_enforced", "HTTPS delivery observed", transportSecure, "boolean", 0.9);
  addSignal("security.tls_probe_attempted", "TLS certificate probe attempted", tlsProbeAttempted, "boolean", 0.9);
  addSignal("security.valid_tls_certificate", "Valid TLS certificate observed", validTlsCertificate, "boolean", 0.9);
  addSignal("security.http_probe_attempted", "HTTP redirect probe attempted", httpProbeAttempted, "boolean", 0.9);
  addSignal("security.http_redirects_to_https", "HTTP redirects to HTTPS", httpRedirectsToHttps, "boolean", 0.9);
  addSignal("security.mixed_content_detected", "Mixed content detected", mixedContentCount > 0, "boolean", 0.8);
  addSignal("security.insecure_form_action_count", "Insecure form action count", insecureFormActionCount, "number", 0.82);
  addSignal("privacy.preconsent_iframe_urls", "Pre-consent iframe URLs", iframeUrls, "string_array", 0.78, iframeUrls);
  addSignal("privacy.preconsent_iframe_count", "Pre-consent iframe count", iframeUrls.length, "number", 0.78, iframeUrls);
  addSignal("context.browser_policy_surface_count", "Browser policy surfaces fetched", policySurfaces.length, "number", 0.9);
  addSignal("accessibility.image_alt_missing_count", "Images missing alt text", imagesMissingAltCount, "number", 0.78);
  addSignal("accessibility.form_label_missing_count", "Form controls missing labels", unlabeledFormControlCount, "number", 0.78);
  addSignal("accessibility.document_language_present", "Document language present", accessibilitySummary.documentLanguagePresent === true, "boolean", 0.82);

  return {
    evidenceInventory: {
      cookies: buildCookieInventory(input.evidence),
      targetHostname: input.evidence.targetHostname,
      thirdPartyRequests: buildThirdPartyRequestInventory(input.evidence)
    },
    observedSignals: signals,
    provenance: {
      sourceId: BROWSER_SCAN_SOURCE_ID,
      sourceType: BROWSER_SCAN_SOURCE_TYPE
    }
  };
}
