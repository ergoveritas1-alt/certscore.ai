import type { summarizeBrowserEvidence } from "./evidence-summary";
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

function classifyBrowserVendor(hostname: string) {
  const host = hostname.toLowerCase();
  if (/googletagmanager\.com/.test(host)) return { category: "tag_manager", vendor: "Google Tag Manager" };
  if (/google-analytics\.com|analytics\.google\.com/.test(host)) return { category: "analytics", vendor: "Google Analytics" };
  if (/scorecardresearch\.com/.test(host)) return { category: "analytics", vendor: "Comscore / ScorecardResearch" };
  if (/doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\./.test(host)) return { category: "advertising", vendor: "Google Ads" };
  if (/facebook\.com|facebook\.net|connect\.facebook\.net/.test(host)) return { category: "advertising", vendor: "Meta Pixel" };
  if (/clarity\.ms|bat\.bing\.com/.test(host)) return { category: "analytics", vendor: host.includes("clarity") ? "Microsoft Clarity" : "Microsoft Advertising" };
  if (/hotjar\.com|fullstory\.com|logrocket\.com/.test(host)) return { category: "session_replay", vendor: host.includes("hotjar") ? "Hotjar" : host.includes("fullstory") ? "FullStory" : "LogRocket" };
  if (/segment\.com|segment\.io/.test(host)) return { category: "analytics", vendor: "Segment" };
  return null;
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
  const classified = input.evidence.thirdPartyRequestDomains
    .map((domain) => classifyBrowserVendor(domain))
    .filter((value): value is { category: string; vendor: string } => Boolean(value));
  const trackerVendors = uniqueStrings(classified.map((item) => item.vendor));
  const trackerCategories = uniqueStrings(classified.map((item) => item.category));
  const preconsentNetworkEvents = input.evidence.networkEvidence.filter((event) => event.consentInteractionObserved !== true);
  const classifiedPreconsentNetworkEvents = preconsentNetworkEvents.filter((event) => classifyBrowserVendor(event.hostname));
  const preconsentTrackerEvidenceUrls = uniqueStrings(
    classifiedPreconsentNetworkEvents.map((event) => event.url),
    50
  );
  const preconsentTrackerEvidenceRefs = uniqueStrings(
    classifiedPreconsentNetworkEvents.flatMap((event) => [
      event.url,
      browserEvidenceRef("network_request", event.observedAtMs, event.url)
    ]),
    100
  );
  const fingerprintCategories = uniqueStrings(input.evidence.fingerprintCategories, 50);
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
      category: "privacy",
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

  addSignal("privacy.third_party_request_count", "Third-party request count", input.evidence.thirdPartyRequestCount, "number", 0.8);
  addSignal("privacy.third_party_request_domains", "Third-party request domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.8);
  addSignal("privacy.third_party_script_domain_count", "Third-party script domain count", input.evidence.thirdPartyRequestDomains.length, "number", 0.68);
  addSignal("privacy.third_party_script_domains", "Third-party script domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.68);
  addSignal("privacy.tracker_vendor_count", "Tracker vendor count", trackerVendors.length, "number", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.tracker_vendors", "Tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_categories", "Pre-consent tracker categories", trackerCategories, "string_array", trackerCategories.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_vendors", "Pre-consent tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_evidence_urls", "Pre-consent tracker evidence URLs", preconsentTrackerEvidenceUrls, "string_array", 0.82, preconsentTrackerEvidenceRefs);
  addSignal("privacy.preconsent_violation_count", "Pre-consent violation count", preconsentTrackerEvidenceUrls.length, "number", 0.82, preconsentTrackerEvidenceRefs, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal("privacy.cookie_count_total", "Cookie count total", input.evidence.cookies.length, "number", 0.78);
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
  addSignal("privacy.accept_all_present", "Accept-all control present", consentSummary?.acceptObserved === true, "boolean", 0.78);
  addSignal("privacy.reject_all_present", "Reject-all control present", consentSummary?.rejectObserved === true, "boolean", 0.78);
  addSignal("privacy.granular_preferences_present", "Granular preferences present", consentSummary?.manageObserved === true, "boolean", 0.78);
  addSignal("privacy.do_not_sell_link_present", "Do-not-sell/share control present", consentSummary?.doNotSellShareObserved === true, "boolean", 0.72);
  addSignal("privacy.preconsent_tracking_detected", "Pre-consent tracking detected", preconsentTrackerEvidenceUrls.length > 0, "boolean", 0.82, preconsentTrackerEvidenceRefs, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal("privacy.session_replay_runtime_vendors", "Session replay runtime vendors", trackerCategories.includes("session_replay") ? trackerVendors : [], "string_array", 0.76);
  addSignal("privacy.fingerprinting_tier", "Fingerprinting tier", fingerprintCategories.length >= 3 ? 2 : fingerprintCategories.length > 0 ? 1 : 0, "number", 0.6);
  addSignal("privacy.fingerprinting_attribute_categories", "Fingerprinting attribute categories", fingerprintCategories, "string_array", 0.6);

  return {
    observedSignals: signals,
    provenance: {
      sourceId: BROWSER_SCAN_SOURCE_ID,
      sourceType: BROWSER_SCAN_SOURCE_TYPE
    }
  };
}
