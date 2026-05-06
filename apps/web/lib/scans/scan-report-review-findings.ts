import {
  type PreviewSampleFinding,
  type ReportSignalDefinition
} from "@website-signal-risk-scanner/shared";
import {
  isRightsFrictionSignal,
  shouldSurfacePrimarySignalFinding
} from "./finding-evidence-gates";
import {
  buildAccessibilitySupportFallbackEvidence,
  buildChildContextFallbackEvidence,
  buildCookiePolicyFallbackEvidence,
  buildSnapshotDisclosureFallbackEvidence,
  isChildContextSignalKey
} from "./signal-fallback-evidence";
import {
  buildPreconsentEvidenceQualityFallback,
  getHybridRuntimeEvidence,
  getHybridSignalFallbackEvidence
} from "./hybrid-runtime-evidence";
import {
  findMergedSignalValue,
  isSignalValuePopulated
} from "./report-signal-values";
import {
  getPolicyPositiveSignalSpec,
  isPolicyPositiveSignalKey,
  isPrivacyRightsSignalKey
} from "./policy-positive-signal-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";
import {
  getPolicyEvidenceSnippets,
  getPolicyEvidenceSnippetValues,
  getPolicyDsarMechanism,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicyRightsSignals,
  getPolicySummaryText
} from "./policy-enrichment-row";
import {
  type ContradictionEvidenceBundle,
  type PolicyBehaviorConflictClaimType,
  type PolicyBehaviorConflictType,
  type PolicyBehaviorRuntimeObservationType,
  type RuntimeObservationPhase
} from "./contradiction-evidence-contract";
import {
  findValidationFindingForKeys,
  getValidationMatchKeysForReviewReason,
  getValidationMatchKeysForSignal,
  getValidationMatchKeysForTitle,
  type ScanValidationFinding
} from "./validation-review-linking";
import {
  deriveHighRiskTrackingContext,
  formatHighRiskVendorSummary
} from "./high-risk-tracking-context";
import {
  classifyRuntimeCookieCategory,
  isFunctionalCookieExcludedFromTrackingEvidence,
  isNonEssentialCookieCategory
} from "./runtime-cookie-evidence";
import {
  REJECT_TRACKING_CONFIRMATION_MIN_MS,
  REJECT_TRACKING_CONFIRMATION_MIN_MS_LABEL
} from "./reject-tracking-policy";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function roughEtldPlusOne(hostname: string | null | undefined) {
  const parts = (hostname ?? "").replace(/^\./, "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]).has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function getHostnameForCookieScope(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^\./, "").toLowerCase() ?? null;
  }
}

function isSameSiteCookieScope(cookieHost: string | null | undefined, pageHost: string | null | undefined) {
  const cookieSite = roughEtldPlusOne(getHostnameForCookieScope(cookieHost));
  const pageSite = roughEtldPlusOne(getHostnameForCookieScope(pageHost));
  return Boolean(cookieSite && pageSite && cookieSite === pageSite);
}

function getPreconsentPageHost(snapshot: Record<string, unknown>) {
  return typeof snapshot.registered_domain === "string"
    ? snapshot.registered_domain
    : typeof snapshot.final_url === "string"
      ? snapshot.final_url
      : null;
}

function getCookieHintName(value: string | null | undefined) {
  const match = value?.match(/^cookie_hint:(.+)$/i);
  return match?.[1]?.trim() || null;
}

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getRecordString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecordObject(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordObjectArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function firstRecordObject(...values: Array<unknown>) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function collectTextCandidates(value: unknown, output: string[], depth = 0) {
  if (depth > 3 || output.length >= 100) {
    return;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    output.push(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTextCandidates(entry, output, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/html|script|style|css|svg|screenshot|image|base64|cookie|headers?/i.test(key)) {
        continue;
      }
      collectTextCandidates(entry, output, depth + 1);
    }
  }
}

function normalizeSentenceSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractNearbySnippet(text: string, index: number, radius = 180) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return normalizeSentenceSnippet(text.slice(start, end));
}

const SPORTSBOOK_OFFER_PATTERN =
  /(?:\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:in\s*)?(?:bonus\s+bets?|free\s+bets?|bet(?:ting)?\s+credits?)|(?:bonus\s+bets?|free\s+bets?|risk[- ]free\s+bet|no\s+sweat\s+bet|deposit\s+match|odds\s+boost|profit\s+boost)[^.!?\n]{0,120})/gi;

function getHighRiskPromotionEvidence(input: {
  pageEvidenceRows?: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  signalHitRows?: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown>;
}) {
  const pageEvidenceCandidates = (input.pageEvidenceRows ?? []).flatMap((row) => {
    const metadataValues: string[] = [];
    collectTextCandidates(row.metadata, metadataValues);
    return [
      getRecordString(row, "matched_text"),
      getRecordString(row, "matchedText"),
      ...metadataValues
    ];
  });
  const signalHitCandidates = (input.signalHitRows ?? []).flatMap((row) => {
    const payloadValues: string[] = [];
    collectTextCandidates(row.payload, payloadValues);
    return [
      getRecordString(row, "signal_key"),
      getRecordString(row, "signalKey"),
      ...getRecordStringArray(row, "evidence_refs"),
      ...getRecordStringArray(row, "evidenceRefs"),
      ...payloadValues
    ];
  });
  const directCandidates = uniqueStrings([
    getRecordString(input.snapshot, "homepage_text"),
    getRecordString(input.snapshot, "homepageText"),
    getRecordString(input.snapshot, "visible_text"),
    getRecordString(input.snapshot, "visibleText"),
    getRecordString(input.snapshot, "document_text"),
    getRecordString(input.snapshot, "documentText"),
    getRecordString(input.snapshot, "normalized_body_text"),
    getRecordString(input.snapshot, "normalizedBodyText"),
    getRecordString(input.runtimeArtifacts, "homepage_text"),
    getRecordString(input.runtimeArtifacts, "homepageText"),
    getRecordString(input.runtimeArtifacts, "visible_text"),
    getRecordString(input.runtimeArtifacts, "visibleText"),
    getRecordString(input.runtimeArtifacts, "document_text"),
    getRecordString(input.runtimeArtifacts, "documentText"),
    getRecordString(input.runtimeArtifacts, "rendered_text"),
    getRecordString(input.runtimeArtifacts, "renderedText"),
    ...pageEvidenceCandidates,
    ...signalHitCandidates
  ]);
  const nestedCandidates: string[] = [];
  collectTextCandidates(input.runtimeArtifacts, nestedCandidates);
  collectTextCandidates(input.snapshot, nestedCandidates);
  const text = uniqueStrings([...directCandidates, ...nestedCandidates])
    .filter((value) => /\b(?:bonus\s+bets?|free\s+bet|risk[- ]free|sportsbook|sports betting|wager|casino|gambl|terms|responsible)\b|\$\s?\d/i.test(value))
    .join(" ");

  if (!text) {
    return null;
  }

  const offerSnippets: string[] = [];
  for (const match of text.matchAll(SPORTSBOOK_OFFER_PATTERN)) {
    if (typeof match.index !== "number") {
      continue;
    }
    offerSnippets.push(extractNearbySnippet(text, match.index));
  }

  const uniqueOfferSnippets = uniqueStrings(offerSnippets).slice(0, 3);
  const responsibleIndex = text.search(/responsible\s+(?:gaming|gambling)|1-800-gambler|problem\s+gambling|gambling\s+problem/i);
  const termsIndex = text.search(/\b(?:terms\s*(?:and|&)\s*conditions|terms\s+apply|t&c|bonus\s+terms|offer\s+terms|eligibility|restrictions?)\b/i);
  const firstOfferIndex = text.search(SPORTSBOOK_OFFER_PATTERN);
  const responsibleGamblingDisclosureAdjacent =
    firstOfferIndex >= 0 && responsibleIndex >= 0 ? Math.abs(responsibleIndex - firstOfferIndex) <= 600 : false;
  const termsDisclosureAdjacent =
    firstOfferIndex >= 0 && termsIndex >= 0 ? Math.abs(termsIndex - firstOfferIndex) <= 600 : false;

  return {
    offerSnippets: uniqueOfferSnippets,
    primaryOfferSnippet: uniqueOfferSnippets[0] ?? null,
    responsibleGamblingDisclosureAdjacent,
    responsibleGamblingSnippets: responsibleIndex >= 0 ? [extractNearbySnippet(text, responsibleIndex, 120)] : [],
    termsDisclosureAdjacent,
    termsSnippets: termsIndex >= 0 ? [extractNearbySnippet(text, termsIndex, 120)] : []
  };
}

function getInitialNonEssentialCookieNames(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return uniqueStrings(
    getRecordStringArray(runtimeArtifacts, "initial_cookie_names").filter((name) => {
      if (isFunctionalCookieExcludedFromTrackingEvidence(name)) {
        return false;
      }

      return isNonEssentialCookieCategory(classifyRuntimeCookieCategory(name));
    })
  );
}

function getRecordNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function looksLikeSessionReplayVendor(row: TrackerVendorEvidenceRow) {
  return (
    row.vendorCategory === "session_replay" ||
    /fullstory|hotjar|clarity|qualtrics|siteintercept|logrocket|mouseflow|smartlook|contentsquare|quantum\s*metric|crazy\s*egg|inspectlet|lucky\s*orange/i.test(
      `${row.vendorName} ${row.scriptHost ?? ""} ${row.matchedSignatureId ?? ""}`
    )
  );
}

function hostToEvidenceUrl(host: string | null | undefined) {
  const normalized = typeof host === "string" ? host.trim().replace(/^\./, "") : "";
  if (!normalized || normalized.startsWith("script_host:")) {
    return null;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized) ? `https://${normalized}` : null;
}

function getHostnameFromEvidenceUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function classifyPostRejectRequestUrl(url: string, fallbackVendor?: string | null) {
  const hostname = getHostnameFromEvidenceUrl(url);
  if (/px\.ads\.linkedin\.com$|snap\.licdn\.com$/i.test(hostname ?? "")) {
    return { category: "advertising", confidence: "high", hostname, vendor: "LinkedIn Insight Tag" };
  }
  if (/alb\.reddit\.com$|pixel-config\.reddit\.com$/i.test(hostname ?? "")) {
    return { category: "advertising", confidence: "high", hostname, vendor: "Reddit Pixel" };
  }
  if (/(^|\.)clarity\.ms$/i.test(hostname ?? "")) {
    return { category: "session_replay", confidence: "high", hostname, vendor: "Microsoft Clarity" };
  }
  if (/googleads\.g\.doubleclick\.net$|www\.googleadservices\.com$/i.test(hostname ?? "")) {
    return { category: "advertising", confidence: "high", hostname, vendor: "Google Ads" };
  }
  if (/(^|\.)googletagmanager\.com$/i.test(hostname ?? "")) {
    return { category: "tag_manager", confidence: "high", hostname, vendor: "Google Tag Manager" };
  }
  if (/munchkin\.marketo\.net$/i.test(hostname ?? "")) {
    return { category: "marketing_automation", confidence: "high", hostname, vendor: "Marketo" };
  }

  const vendor = fallbackVendor && fallbackVendor.trim().length > 0 ? fallbackVendor.trim() : "Unknown vendor";
  return { category: inferVendorCategory(vendor), confidence: "low", hostname, vendor };
}

function getConsentOutcomeSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  return firstRecordObject(hybrid?.consentOutcomeSummary, runtimeArtifacts?.consent_outcome_summary);
}

function getConsentSummaryObject(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  camelKey: string,
  snakeKey: string
) {
  const consentOutcomeSummary = getConsentOutcomeSummary(runtimeArtifacts);
  return firstRecordObject(consentOutcomeSummary?.[camelKey], runtimeArtifacts?.[snakeKey]);
}

function getConsentSummaryObjectArray(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  camelKey: string,
  snakeKey: string
) {
  const consentOutcomeSummary = getConsentOutcomeSummary(runtimeArtifacts);
  const value = consentOutcomeSummary?.[camelKey] ?? runtimeArtifacts?.[snakeKey];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getConsentSummaryStringArray(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  camelKey: string,
  snakeKey: string
) {
  const consentOutcomeSummary = getConsentOutcomeSummary(runtimeArtifacts);
  const value = consentOutcomeSummary?.[camelKey] ?? runtimeArtifacts?.[snakeKey];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getRuntimeArtifactObjectArray(runtimeArtifacts: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = runtimeArtifacts?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
    }
  }
  return [];
}

function buildConsentInteractionFromOptOutLog(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const optOutLog = getRuntimeArtifactObjectArray(runtimeArtifacts, "consent_opt_out_evidence_log", "consentOptOutEvidenceLog");
  const clickedStep = optOutLog.find((step) => step.action !== "preferences") ?? optOutLog[0] ?? null;
  if (!clickedStep) {
    return null;
  }

  return {
    action_type: clickedStep.actionType ?? clickedStep.action_type ?? clickedStep.action ?? "unknown",
    clicked_at_ms: clickedStep.clickedAtMs ?? clickedStep.clicked_at_ms ?? null,
    clicked_label: clickedStep.clickedLabel ?? clickedStep.clicked_label ?? clickedStep.text ?? null,
    page_url_at_click: clickedStep.pageUrlAtClick ?? clickedStep.page_url_at_click ?? null,
    resulting_url_if_changed: clickedStep.resultingUrlIfChanged ?? clickedStep.resulting_url_if_changed ?? null,
    selector: clickedStep.selector ?? clickedStep.selectorHint ?? null,
    success: runtimeArtifacts?.consent_reject_interaction_succeeded === true,
    visible_text: clickedStep.visibleText ?? clickedStep.visible_text ?? clickedStep.text ?? null
  };
}

function inferVendorCategory(vendor: string) {
  if (/clarity|hotjar|fullstory|mouseflow|contentsquare|session/i.test(vendor)) {
    return "session_replay";
  }
  if (/marketo|munchkin/i.test(vendor)) {
    return "marketing_automation";
  }
  if (/tag manager|gtm/i.test(vendor)) {
    return "tag_manager";
  }
  if (/linkedin|reddit|google ads|doubleclick|meta|facebook|tiktok|pinterest|pixel/i.test(vendor)) {
    return "advertising";
  }
  if (/analytics|adobe/i.test(vendor)) {
    return "analytics";
  }
  return "unknown";
}

function normalizePostRejectNonEssentialRequestRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const url = typeof row.url === "string" ? row.url : "";
    const classified = classifyPostRejectRequestUrl(url, typeof row.vendor === "string" ? row.vendor : null);
    return {
      ...row,
      category: classified.confidence === "high" ? classified.category : typeof row.category === "string" && row.category.trim().length > 0 ? row.category : classified.category,
      hostname: classified.hostname ?? (typeof row.hostname === "string" ? row.hostname : null),
      phase: typeof row.phase === "string" ? row.phase : "post_reject",
      url,
      vendor: classified.vendor,
      vendor_attribution_confidence: classified.confidence
    };
  });
}

function buildRejectTrackingEvidenceFallback(input: {
  baselineTrackerEvidenceUrls: string[];
  baselineTrackerVendors: string[];
  newTrackerVendors: string[];
  persistedTrackerVendors: string[];
  postRejectTrackerEvidenceUrls: string[];
  postRejectTrackerVendors: string[];
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}) {
  const reconciledBaselineVendors = uniqueStrings([
    ...input.baselineTrackerVendors,
    ...getRecordStringArray(input.runtimeArtifacts, "preconsent_tracker_vendors"),
    ...getRecordStringArray(input.runtimeArtifacts, "preconsentTrackerVendors"),
    ...getRecordStringArray(input.runtimeArtifacts, "runtime_vendors_before_reject"),
    ...getRecordStringArray(input.runtimeArtifacts, "runtimeVendorsBeforeReject"),
    ...getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names")
  ]);
  const baselineReconstructionIncomplete = reconciledBaselineVendors.length === 0;
  const consentInteraction =
    getConsentSummaryObject(input.runtimeArtifacts, "consentInteraction", "consent_reject_interaction_trace") ??
    buildConsentInteractionFromOptOutLog(input.runtimeArtifacts);
  const retainedRejectEvidenceDiff =
    getConsentSummaryObject(input.runtimeArtifacts, "rejectEvidenceDiff", "consent_reject_evidence_diff") ?? {
      baseline_vendors: reconciledBaselineVendors,
      baseline_reconstruction_status: baselineReconstructionIncomplete ? "incomplete" : "reconciled",
      post_reject_vendors: input.postRejectTrackerVendors,
      new_after_reject_vendors: input.newTrackerVendors,
      persisting_after_reject_vendors: input.persistedTrackerVendors,
      baseline_request_count: input.baselineTrackerEvidenceUrls.length,
      post_reject_request_count: input.postRejectTrackerEvidenceUrls.length,
      baseline_cookie_count:
        typeof input.runtimeArtifacts?.consent_baseline_cookie_count === "number"
          ? input.runtimeArtifacts.consent_baseline_cookie_count
          : 0,
      post_reject_cookie_count:
        typeof input.runtimeArtifacts?.consent_post_reject_cookie_count === "number"
          ? input.runtimeArtifacts.consent_post_reject_cookie_count
          : 0,
      baseline_third_party_cookie_count:
        typeof input.runtimeArtifacts?.consent_baseline_third_party_cookie_count === "number"
          ? input.runtimeArtifacts.consent_baseline_third_party_cookie_count
          : 0,
      post_reject_third_party_cookie_count:
        typeof input.runtimeArtifacts?.consent_post_reject_third_party_cookie_count === "number"
          ? input.runtimeArtifacts.consent_post_reject_third_party_cookie_count
          : 0
    };
  const retainedBaselineVendors = Array.isArray(retainedRejectEvidenceDiff.baseline_vendors)
    ? retainedRejectEvidenceDiff.baseline_vendors.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const rejectEvidenceDiff = {
    ...retainedRejectEvidenceDiff,
    baseline_vendors: retainedBaselineVendors.length > 0 ? retainedBaselineVendors : reconciledBaselineVendors,
    baseline_reconstruction_status:
      retainedBaselineVendors.length > 0 || reconciledBaselineVendors.length > 0
        ? (typeof retainedRejectEvidenceDiff.baseline_reconstruction_status === "string"
            ? retainedRejectEvidenceDiff.baseline_reconstruction_status
            : "reconciled")
        : "incomplete"
  };
  const retainedPostRejectNonEssentialRequests = getConsentSummaryObjectArray(
    input.runtimeArtifacts,
    "postRejectNonEssentialRequests",
    "consent_reject_post_reject_non_essential_requests"
  );
  const postRejectNonEssentialRequests: Array<Record<string, unknown>> =
    retainedPostRejectNonEssentialRequests.length > 0
      ? normalizePostRejectNonEssentialRequestRows(retainedPostRejectNonEssentialRequests)
      : normalizePostRejectNonEssentialRequestRows(input.postRejectTrackerEvidenceUrls.map((url, index) => {
          const classified = classifyPostRejectRequestUrl(url, input.postRejectTrackerVendors[index] ?? input.postRejectTrackerVendors[0] ?? null);
          return {
            vendor: classified.vendor,
            hostname: classified.hostname,
            category: classified.category,
            url,
            ts_ms: null,
            ms_after_reject: null,
            phase: "unknown",
            resource_type: null,
            initiator: null,
            vendor_attribution_confidence: classified.confidence,
            why_non_essential: `${classified.vendor} is likely non-essential, but the scanner did not retain a clean post-reject timestamp for this request.`
          };
        }));
  const suppressionChecks =
    getConsentSummaryObject(input.runtimeArtifacts, "suppressionChecks", "consent_reject_suppression_checks") ?? {};
  const vendorClassifications = getConsentSummaryObjectArray(
    input.runtimeArtifacts,
    "vendorClassifications",
    "consent_reject_vendor_classifications"
  );
  const requestTimingBuckets = getConsentSummaryObjectArray(
    input.runtimeArtifacts,
    "requestTimingBuckets",
    "consent_reject_request_timing_buckets"
  );
  const confidenceRisks = getConsentSummaryStringArray(
    input.runtimeArtifacts,
    "confidenceRisks",
    "consent_reject_confidence_risks"
  );
  const rejectCookieDiffProvenance = getConsentSummaryObject(
    input.runtimeArtifacts,
    "rejectCookieDiffProvenance",
    "consent_reject_cookie_diff_provenance"
  );
  const rejectInteractionAttribution = getConsentSummaryObject(
    input.runtimeArtifacts,
    "rejectInteractionAttribution",
    "consent_reject_interaction_attribution"
  );
  const rejectInteractionRiskFlags = Array.isArray(rejectInteractionAttribution?.riskFlags)
    ? rejectInteractionAttribution.riskFlags.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const hasNonEssentialAfterReject =
    postRejectNonEssentialRequests.length > 0 ||
    input.postRejectTrackerVendors.some((vendor) =>
      /linkedin|reddit|clarity|marketo|munchkin|google ads|doubleclick|meta|facebook|tiktok|pinterest|analytics|adobe/i.test(vendor)
    );
  const hasRequestAfterConfirmationThreshold = postRejectNonEssentialRequests.some((row) => {
    const value = row.ms_after_reject ?? row.msAfterReject;
    return typeof value === "number" && value >= REJECT_TRACKING_CONFIRMATION_MIN_MS;
  });
  const hasPromotionGradeRequest = postRejectNonEssentialRequests.some((row) => {
    const vendor = typeof row.vendor === "string" ? row.vendor : "";
    const url = typeof row.url === "string" ? row.url : "";
    const category = typeof row.category === "string" ? row.category : "";
    const tsMs = row.ts_ms ?? row.tsMs;
    const msAfterReject = row.ms_after_reject ?? row.msAfterReject;
    return (
      typeof tsMs === "number" &&
      typeof msAfterReject === "number" &&
      msAfterReject >= REJECT_TRACKING_CONFIRMATION_MIN_MS &&
      vendor.trim().length > 0 &&
      /^https?:\/\//i.test(url) &&
      /^(advertising|analytics|session_replay|marketing_automation)$/i.test(category)
    );
  });
  const requiredVendorClassificationSatisfied = hasPromotionGradeRequest;
  const rejectClickConfirmed =
    suppressionChecks.reject_click_confirmed === true ||
    input.runtimeArtifacts?.consent_reject_interaction_succeeded === true ||
    consentInteraction?.success === true;
  const postRejectWindowAvailable =
    suppressionChecks.post_reject_window_available === true ||
    requestTimingBuckets.some((row) => {
      const phase = typeof row.phase === "string" ? row.phase : "";
      const bucket = typeof row.bucket === "string" ? row.bucket : "";
      return phase === "post_reject" || bucket.startsWith("after_reject_");
    });
  const requiredTimingSatisfied =
    postRejectWindowAvailable &&
    hasPromotionGradeRequest;
  const cmpInitializationOnly = suppressionChecks.cmp_initialization_only === true;
  const rejectHostChanged = rejectInteractionAttribution?.finalUrlHostChanged === true;
  const rejectAttributionClearsNavigationAmbiguity =
    rejectInteractionAttribution != null &&
    rejectInteractionAttribution.finalUrlHostChanged === false &&
    (!Array.isArray(rejectInteractionAttribution.navigationEventsAfterClick) ||
      rejectInteractionAttribution.navigationEventsAfterClick.length === 0);
  const navigationOrReloadAmbiguous =
    (suppressionChecks.navigation_or_reload_ambiguous === true && !rejectAttributionClearsNavigationAmbiguity) ||
    rejectHostChanged;
  const rejectCookieDiffSummary =
    rejectCookieDiffProvenance && typeof rejectCookieDiffProvenance.summary === "object" && !Array.isArray(rejectCookieDiffProvenance.summary)
      ? rejectCookieDiffProvenance.summary as Record<string, unknown>
      : null;
  const hasRejectCookieDiffBaseline =
    typeof rejectCookieDiffProvenance?.baselineCookieCount === "number" ||
    typeof rejectCookieDiffProvenance?.postRejectCookieCount === "number" ||
    typeof rejectCookieDiffSummary?.addedAfterRejectCount === "number" ||
    typeof rejectCookieDiffSummary?.thirdPartyAddedAfterRejectCount === "number";
  const baselineContradictionDetected =
    (suppressionChecks.baseline_contradiction_detected === true && !hasRejectCookieDiffBaseline) ||
    (!hasRejectCookieDiffBaseline &&
      input.baselineTrackerVendors.length === 0 &&
      input.baselineTrackerEvidenceUrls.length > 0 &&
      input.postRejectTrackerVendors.length > 0);
  const runtimeEvidenceUrls = uniqueStrings([
    ...input.baselineTrackerEvidenceUrls,
    ...input.postRejectTrackerEvidenceUrls,
    ...postRejectNonEssentialRequests.map((row) => (typeof row.url === "string" ? row.url : null))
  ]);
  const confirmed =
    rejectClickConfirmed &&
    requiredTimingSatisfied &&
    requiredVendorClassificationSatisfied &&
    !cmpInitializationOnly &&
    !navigationOrReloadAmbiguous &&
    !baselineContradictionDetected;
  const strongTimestampedRuntimeEvidence =
    requiredTimingSatisfied &&
    requiredVendorClassificationSatisfied &&
    postRejectNonEssentialRequests.length >= 3 &&
    runtimeEvidenceUrls.length >= 5;
  const review =
    rejectClickConfirmed &&
    hasNonEssentialAfterReject &&
    !cmpInitializationOnly &&
    !baselineContradictionDetected &&
    (!navigationOrReloadAmbiguous || strongTimestampedRuntimeEvidence);
  const firstPostRejectMs = postRejectNonEssentialRequests
    .map((row) => row.ms_after_reject ?? row.msAfterReject)
    .find((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    confidenceRisks: uniqueStrings([
      ...confidenceRisks,
      baselineReconstructionIncomplete ? "Baseline vendor reconstruction incomplete; before/after comparison may be incomplete." : null,
      !hasRequestAfterConfirmationThreshold
        ? `No classified non-essential request fired at least ${REJECT_TRACKING_CONFIRMATION_MIN_MS_LABEL} after reject.`
        : null,
      !requiredTimingSatisfied ? "Post-reject timing unavailable; cannot confirm persistence after reject." : null,
      navigationOrReloadAmbiguous ? "Navigation or reload makes reject attribution ambiguous." : null,
      rejectInteractionRiskFlags.includes("auth_wall_detected") ? "An auth wall or modal was detected after the reject interaction." : null,
      baselineContradictionDetected ? "Baseline/post-reject comparison is internally contradictory." : null
    ]),
    consentBaselineCookieCount:
      typeof input.runtimeArtifacts?.consent_baseline_cookie_count === "number"
        ? input.runtimeArtifacts.consent_baseline_cookie_count
        : null,
    consentBaselineThirdPartyCookieCount:
      typeof input.runtimeArtifacts?.consent_baseline_third_party_cookie_count === "number"
        ? input.runtimeArtifacts.consent_baseline_third_party_cookie_count
        : null,
    consentBaselineTrackerEvidenceUrls: input.baselineTrackerEvidenceUrls,
    consentInteraction,
    consentOptOutClicks:
      typeof input.runtimeArtifacts?.consent_opt_out_clicks === "number" ? input.runtimeArtifacts.consent_opt_out_clicks : null,
    consentOptOutEvidenceLog:
      Array.isArray(input.runtimeArtifacts?.consent_opt_out_evidence_log) ? input.runtimeArtifacts.consent_opt_out_evidence_log : [],
    consentPostRejectCookieCount:
      typeof input.runtimeArtifacts?.consent_post_reject_cookie_count === "number"
        ? input.runtimeArtifacts.consent_post_reject_cookie_count
        : null,
    consentPostRejectThirdPartyCookieCount:
      typeof input.runtimeArtifacts?.consent_post_reject_third_party_cookie_count === "number"
        ? input.runtimeArtifacts.consent_post_reject_third_party_cookie_count
        : null,
    consentPostRejectTrackerEvidenceUrls: input.postRejectTrackerEvidenceUrls,
    consentRejectReducedTracking: false,
    firstPostRejectMs,
    persisted_tracker_vendors: uniqueStrings([
      ...input.persistedTrackerVendors,
      ...input.newTrackerVendors,
      ...input.postRejectTrackerVendors
    ]),
    post_reject_tracker_vendors: input.postRejectTrackerVendors,
    postRejectNonEssentialRequests,
    reject_did_not_reduce_tracking: true,
    rejectCookieDiffProvenance,
    rejectEvidenceConfidence: confirmed ? "confirmed" : review ? "review" : "suppress",
    rejectEvidenceDiff,
    rejectInteractionAttribution,
    promotionDecision: {
      promoted: confirmed,
      reason: confirmed
        ? "Reject click, post-reject timing, vendor classification, and retained request URL satisfied promotion requirements."
        : navigationOrReloadAmbiguous && strongTimestampedRuntimeEvidence
          ? "Post-reject timing and vendor classification were retained, but navigation or reload context keeps this at review level."
        : !requiredTimingSatisfied
          ? "Post-reject timing unavailable; cannot confirm persistence after reject."
          : !requiredVendorClassificationSatisfied
            ? "Post-reject request vendor classification or retained URL did not satisfy promotion requirements."
            : !rejectClickConfirmed
              ? "Reject click was not confirmed."
              : "Reject-path evidence did not satisfy promotion requirements.",
      requiredTimingSatisfied,
      requiredVendorClassificationSatisfied,
      requiredRejectClickSatisfied: rejectClickConfirmed
    },
    requestTimingBuckets,
    runtimeEvidenceUrls,
    runtimeVendors: uniqueStrings([
      ...input.postRejectTrackerVendors,
      ...postRejectNonEssentialRequests.map((row) => (typeof row.vendor === "string" ? row.vendor : null))
    ]),
    supportingSignals: ["consent_reject_reduced_tracking"],
    suppressionChecks: {
      reject_click_confirmed: rejectClickConfirmed,
      post_reject_window_available: postRejectWindowAvailable,
      non_essential_vendor_after_reject: hasNonEssentialAfterReject,
      cmp_initialization_only: cmpInitializationOnly,
      navigation_or_reload_ambiguous: navigationOrReloadAmbiguous,
      baseline_contradiction_detected: baselineContradictionDetected
    },
    unifiedFindingId: "reject_did_not_reduce_tracking",
    vendorClassifications
  };
}

function buildSessionReplayTrackerFallbackEvidence(input: {
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  trackerVendors?: TrackerVendorEvidenceRow[];
}) {
  const replayRows = (input.trackerVendors ?? []).filter(looksLikeSessionReplayVendor);
  const seenVendorNames = new Set<string>();
  const uniqueReplayRows = replayRows.filter((row) => {
    if (seenVendorNames.has(row.vendorName)) {
      return false;
    }
    seenVendorNames.add(row.vendorName);
    return true;
  });

  if (uniqueReplayRows.length === 0) {
    return null;
  }

  const runtimeVendors = uniqueStrings(uniqueReplayRows.map((row) => row.vendorName));
  const runtimeEvidenceUrls = uniqueStrings(uniqueReplayRows.map((row) => hostToEvidenceUrl(row.scriptHost)));
  const runtimeEvidenceArtifacts = uniqueStrings(
    uniqueReplayRows.flatMap((row) => [
      `tracker_vendor:${row.vendorName}`,
      `vendor_category:${row.vendorCategory}`,
      row.scriptHost ? `script_host:${row.scriptHost}` : null,
      row.matchedSignatureId ? `matched_signature:${row.matchedSignatureId}` : null,
      row.collectionEndpointType ? `collection_endpoint:${row.collectionEndpointType}` : null,
      typeof row.beforeConsent === "boolean" ? `before_consent:${row.beforeConsent}` : null,
      typeof row.confidence === "number" ? `tracker_confidence:${row.confidence}` : null
    ])
  );

  return {
    requestUrls: runtimeEvidenceUrls,
    runtimeEvidenceArtifacts,
    runtimeEvidenceUrls,
    runtimeVendors,
    session_replay_runtime_detected: true,
    session_replay_runtime_vendors: runtimeVendors,
    session_replay_tracker_evidence: uniqueReplayRows.map((row) => ({
      beforeConsent: row.beforeConsent ?? null,
      collectionEndpointType: row.collectionEndpointType ?? null,
      confidence: row.confidence ?? null,
      detectionSource: row.detectionSource ?? null,
      firstPartyOrThirdParty: row.firstPartyOrThirdParty ?? null,
      matchedSignatureId: row.matchedSignatureId ?? null,
      scriptHost: row.scriptHost ?? null,
      vendorCategory: row.vendorCategory,
      vendorName: row.vendorName
    })),
    session_replay_vendor_artifact_present: true,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue
  };
}

function buildHighSensitivitySignalFallbackEvidence(input: {
  matchedTexts?: string[];
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  runtimeArtifacts?: Record<string, unknown> | null;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  trackerVendors?: TrackerVendorEvidenceRow[];
}) {
  const retainedSensitiveFieldEvidence = [
    ...(Array.isArray(input.runtimeArtifacts?.sensitive_field_evidence)
      ? input.runtimeArtifacts.sensitive_field_evidence
      : []),
    ...(Array.isArray(input.runtimeArtifacts?.sensitiveFieldEvidence)
      ? input.runtimeArtifacts.sensitiveFieldEvidence
      : [])
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
  const matchingSensitiveFieldEvidence = retainedSensitiveFieldEvidence
    .filter((entry) => typeof entry.signalKey === "string" ? entry.signalKey === input.signalKey : true)
    .slice(0, 5);
  const retainedSensitivePayloadViolations = Array.isArray(input.runtimeArtifacts?.sensitive_payload_violations)
    ? input.runtimeArtifacts.sensitive_payload_violations.slice(0, 3)
    : [];
  const matchedTexts = uniqueStrings([
    ...(input.matchedTexts ?? []),
    ...matchingSensitiveFieldEvidence.map((entry) => typeof entry.matchSnippet === "string" ? entry.matchSnippet : null)
  ]).slice(0, 3);
  const sensitiveCollectionTypeBySignalKey: Record<string, string> = {
    "commerce.form_collects_financial_information": "financial_information",
    "commerce.form_collects_geolocation": "geolocation",
    "commerce.form_collects_government_id": "government_id",
    "commerce.form_collects_health_information": "health_information",
    "commerce.form_collects_ssn": "ssn"
  };
  const signalCollectionType = sensitiveCollectionTypeBySignalKey[input.signalKey] ?? "high_sensitivity_data";
  const sensitivePayloadViolations =
    retainedSensitivePayloadViolations.length > 0
      ? retainedSensitivePayloadViolations
      : (matchingSensitiveFieldEvidence.length > 0 ? matchingSensitiveFieldEvidence : matchedTexts).map((entry) => {
        const matchedText = typeof entry === "string" ? entry : typeof entry.matchSnippet === "string" ? entry.matchSnippet : "";
        return {
          detectedType: typeof entry === "object" && typeof entry.dataType === "string" ? entry.dataType : signalCollectionType,
          evidenceSource: typeof entry === "string" ? "snapshot_signal_match" : "sensitive_field_evidence",
          evidenceStrength: "form_field_signal",
          matchSnippet: matchedText,
          requestUrl: "",
          sourceField:
            typeof entry === "object" && typeof entry.inputName === "string"
              ? entry.inputName
              : typeof entry === "object" && typeof entry.inputId === "string"
                ? entry.inputId
                : null,
          sourceLocation: "form_field",
          signalKey: input.signalKey
        };
      });
  const retargetingPixelDetected =
    findMergedSignalValue(input.mergedSignals, "commerce.retargeting_pixel_detected") === true ||
    input.runtimeArtifacts?.retargeting_pixel_detected === true ||
    input.runtimeArtifacts?.retargetingPixelDetected === true;
  const sessionReplayFallbackEvidence = buildSessionReplayTrackerFallbackEvidence({
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    trackerVendors: input.trackerVendors
  });

  return {
    ...(sessionReplayFallbackEvidence ?? {}),
    ...(retargetingPixelDetected
      ? {
          retargetingPixelArtifactPresent: true,
          retargetingPixelDetected: true
        }
      : {}),
    ...(matchedTexts.length > 0
      ? {
          sensitiveCollectionMatchedTexts: matchedTexts,
          sensitiveCollectionSignalKey: input.signalKey
        }
      : {}),
    sensitiveCollectionDataTypes: [signalCollectionType],
    sensitiveFieldEvidence: matchingSensitiveFieldEvidence,
    sensitivePayloadViolations,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue
  };
}

function mergeStringArrayEvidence(left: unknown, right: unknown) {
  return uniqueStrings([
    ...(Array.isArray(left) ? left.filter((entry): entry is string => typeof entry === "string") : []),
    ...(Array.isArray(right) ? right.filter((entry): entry is string => typeof entry === "string") : [])
  ]);
}

function mergeObjectArrayEvidence(left: unknown, right: unknown) {
  const rows = [
    ...(Array.isArray(left) ? left.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : []),
    ...(Array.isArray(right) ? right.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [])
  ];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeFallbackEvidenceRecords(
  baseFallbackEvidence: Record<string, unknown> | null | undefined,
  hybridFallbackEvidence: Record<string, unknown> | null | undefined
) {
  if (!baseFallbackEvidence) {
    return hybridFallbackEvidence ?? undefined;
  }
  if (!hybridFallbackEvidence) {
    return baseFallbackEvidence;
  }

  const merged: Record<string, unknown> = { ...baseFallbackEvidence, ...hybridFallbackEvidence };
  for (const key of [
    "requestUrls",
    "runtimeEvidenceArtifacts",
    "runtimeEvidenceUrls",
    "runtimeVendors",
    "session_replay_request_urls",
    "session_replay_runtime_vendors",
    "sourceUrls",
    "supportingSignals"
  ]) {
    const values = mergeStringArrayEvidence(baseFallbackEvidence[key], hybridFallbackEvidence[key]);
    if (values.length > 0) {
      merged[key] = values;
    }
  }

  const trackerRows = mergeObjectArrayEvidence(
    baseFallbackEvidence.session_replay_tracker_evidence,
    hybridFallbackEvidence.session_replay_tracker_evidence
  );
  if (trackerRows.length > 0) {
    merged.session_replay_tracker_evidence = trackerRows;
  }

  return merged;
}

function getRuntimeRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasMeaningfulWeakCookieAttributeSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary) {
    return false;
  }

  const totalCookiesAnalyzed = getRecordNumber(summary, "totalCookiesAnalyzed") || getRecordNumber(summary, "total_cookies_analyzed");
  const missingSecureCount = getRecordNumber(summary, "missingSecureCount") || getRecordNumber(summary, "missing_secure_count");
  const missingHttpOnlyCount = getRecordNumber(summary, "missingHttpOnlyCount") || getRecordNumber(summary, "missing_http_only_count");
  const weakSameSiteCount = getRecordNumber(summary, "weakSameSiteCount") || getRecordNumber(summary, "weak_same_site_count");
  const thirdPartyWeakCount =
    getRecordNumber(summary, "thirdPartyWeakAttributeCount") || getRecordNumber(summary, "third_party_weak_attribute_count");
  const weakNames = uniqueStrings([
    ...getRecordStringArray(summary, "missingSecureCookieNames"),
    ...getRecordStringArray(summary, "missing_secure_cookie_names"),
    ...getRecordStringArray(summary, "weakSameSiteCookieNames"),
    ...getRecordStringArray(summary, "weak_same_site_cookie_names"),
    ...getRecordStringArray(summary, "thirdPartyWeakAttributeCookieNames"),
    ...getRecordStringArray(summary, "third_party_weak_attribute_cookie_names")
  ]);

  return (
    thirdPartyWeakCount >= 1 ||
    weakNames.length >= 2 ||
    weakSameSiteCount >= 1 ||
    missingSecureCount >= 2 ||
    (totalCookiesAnalyzed >= 3 && (missingSecureCount >= 1 || missingHttpOnlyCount >= 3))
  );
}

export type PolicyBehaviorContradiction = {
  claim: string;
  evidence: string[];
  observedBehavior: string;
  policyPageUrl: string | null;
  policyClaimType?: PolicyBehaviorConflictClaimType | null;
  policyConfidence?: number | null;
  policyExtractionStatus?: string | null;
  policySnippet: string | null;
  policySummary: string | null;
  relatedVendors: string[];
  runtimeConfidence?: number | null;
  runtimeObservationType?: PolicyBehaviorRuntimeObservationType | null;
  runtimePhase?: RuntimeObservationPhase;
  runtimeScriptHosts?: string[];
  runtimeSummary: string;
  runtimeVendors: string[];
  conflictReasoning?: string | null;
  conflictSupportsPromotion?: boolean;
  conflictType?: PolicyBehaviorConflictType | null;
  supportingSignals: string[];
  severity: "high" | "medium";
  status: "contradiction" | "violation risk" | "likely contradiction";
  title: string;
};

export type AccessibilityIssueRow = {
  count: number;
  description: string;
  key: string;
  label: string;
};

export type PreconsentViolationRow = {
  collectionEndpointType?: string | null;
  confidence?: number | null;
  detectionSource?: string | null;
  evidenceUrls: string[];
  firstPartyOrThirdParty?: string | null;
  matchedSignatureId?: string | null;
  scriptHost?: string | null;
  vendorCategory: string;
  vendorName: string;
};

function isPromotionGradePreconsentCookieViolation(row: PreconsentViolationRow, pageHost: string | null) {
  const cookieName = getCookieHintName(row.matchedSignatureId);
  if (!cookieName || isFunctionalCookieExcludedFromTrackingEvidence(cookieName, row.scriptHost ?? null)) {
    return false;
  }
  if (row.firstPartyOrThirdParty !== "third_party") {
    return false;
  }
  if (row.scriptHost && isSameSiteCookieScope(row.scriptHost, pageHost)) {
    return false;
  }
  return isNonEssentialCookieCategory(row.vendorCategory);
}

function buildPreconsentCookieEvidenceFromViolationRows(input: {
  pageHost: string | null;
  rows: PreconsentViolationRow[];
}) {
  return input.rows
    .filter((row) => isPromotionGradePreconsentCookieViolation(row, input.pageHost))
    .map((row) => ({
      beforeConsent: true,
      category: row.vendorCategory,
      cookieName: getCookieHintName(row.matchedSignatureId),
      cookiePartyType: "third_party",
      domain: row.scriptHost ?? null,
      initiatorDomain: row.scriptHost ?? null,
      initiatorVendor: row.vendorName,
      nonEssential: true,
      party: "third_party",
      thirdParty: true,
      timingEvidence: "before_consent_cookie_write",
      vendor: row.vendorName
    }));
}

export type TrackerVendorEvidenceRow = {
  beforeConsent?: boolean | null;
  collectionEndpointType?: string | null;
  confidence?: number | null;
  detectionSource?: string | null;
  firstPartyOrThirdParty?: string | null;
  matchedSignatureId?: string | null;
  scriptHost?: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type AccessibilityRuleEvidenceRow = {
  description: string | null;
  help: string | null;
  helpUrl: string | null;
  impact: string | null;
  nodeCount: number;
  pageUrl: string | null;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
  weightedPriority: number;
};

export type ScanReportReviewIssueRow = {
  description: string;
  key: string;
  pageType: string;
  pageUrl: string | null;
  reason: string;
  reviewStatus: string;
  reviewVerdict: unknown;
  summary: unknown;
};

export type CanonicalReviewIssue = {
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationRuleKeys?: string[];
  severity: "high" | "medium" | "low";
  title: string;
};

export type CanonicalReviewFinding = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  id: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: "high" | "medium" | "low";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalDefinition["source"];
  sourceType: "issue" | "signal";
  title: string;
};

export type CanonicalSignalItem = {
  key: string;
  label: string;
  relation: "primary" | "secondary" | "overlay";
  source: ReportSignalDefinition["source"];
  value: unknown;
};

function isConcerningSignal(key: string, value: unknown) {
  if (!isSignalValuePopulated(key, value)) {
    return false;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /fingerprinting/,
    /gpc_signal_not_honored/,
    /weak_cookie_security_attributes_detected/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /popup_behavior/,
    /autoplay_media/,
    /overlay_blocking/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /extraction_limited/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/,
    /children_audience_likely/,
    /kid_directed_content_detected/,
    /form_collects_birthdate/,
    /policyChildrenReference/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (
    isPolicyPositiveSignalKey(key) ||
    /accessibility_contact_method_present|affiliate_disclosure_present|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(
      key
    )
  ) {
    return true;
  }

  if (typeof value === "number") {
    if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
      return value > 0;
    }
    if (/window_days/i.test(key)) {
      return false;
    }
  }

  return false;
}

function getSignalConcernReason(key: string, value: unknown) {
  if (!isConcerningSignal(key, value)) {
    return null;
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }
  if (/fingerprinting/i.test(key)) {
    return "Observed coordinated browser or device attribute collection consistent with fingerprinting review risk.";
  }
  if (/gpc_signal_not_honored/i.test(key)) {
    return "A browser-level opt-out preference signal appears not to have been honored during the scan.";
  }
  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "Observed intrusive or blocking runtime behavior that may interfere with normal page use.";
  }
  if (/children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference/i.test(key)) {
    return "The scan flagged age-related or youth-directed context that may raise children’s privacy review expectations.";
  }
  if (/weak_cookie_security_attributes_detected/i.test(key)) {
    return "Observed cookies appear to rely on weaker security attributes than expected.";
  }
  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }
  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was linked from the scanned site, but automated retrieval of that target was limited during the scan.";
  }
  if (/extraction_limited/i.test(key)) {
    return "A key disclosure page was linked and fetched, but the retrieved content was too limited for reliable automated extraction on its own.";
  }
  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }
  if (/cookie_policy_structurally_obstructed/i.test(key)) {
    return "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.";
  }
  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }
  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }
  if (/affiliate_disclosure_present/i.test(key)) {
    return "The scan retained a clear affiliate disclosure path that signals when recommendations or links may involve a financial relationship.";
  }
  if (/disclosure\.privacy_policy_present/i.test(key)) {
    return "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.";
  }
  if (/disclosure\.terms_of_service_present/i.test(key)) {
    return "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.";
  }
  if (/disclosure\.cookie_policy_present/i.test(key)) {
    return "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.";
  }
  if (/disclosure\.contact_page_present/i.test(key)) {
    return "The scan retained a reachable contact or feedback path that users can use when they need help or want to reach the operator.";
  }
  if (/privacy\.do_not_sell_link_present/i.test(key)) {
    return "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.";
  }

  const policyPositiveSpec = getPolicyPositiveSignalSpec(key);
  if (policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present") {
    return "The scan retained a clear policy-based privacy-rights request path that users can rely on when seeking access, deletion, export, or related controls.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "gpc_disclosure_present") {
    return "The scan retained a disclosure indicating how the site says it handles Global Privacy Control or similar browser-level opt-out signals.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "tracking_technologies_disclosure_present") {
    return "The scan retained a disclosure describing cookies, pixels, tags, beacons, scripts, or similar tracking technologies used on the site.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "targeted_advertising_disclosure_present") {
    return "The scan retained a disclosure describing targeted advertising, sale, or sharing practices and related user controls.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present") {
    return "The scan retained a disclosure describing behavioral analytics, session-observation, or replay-style tooling on at least some pages.";
  }
  if (/accessibility_contact_method_present/i.test(key)) {
    return "The scan retained a visible accessibility support or accommodation path that users can use when they need help.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "arbitration_clause_present") {
    return "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.";
  }
  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }
  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }
  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }
  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  return "This signal is worth reviewer attention.";
}

export function formatReviewIssueReason(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Possible policy-to-behavior conflict";
    case "session_replay_without_disclosure_detected":
      return "Possible undisclosed session replay";
    case "missing_dsar_high_exposure":
      return "Possible missing DSAR path";
    case "low_confidence_critical_fields":
      return "Low-confidence policy extraction";
    default:
      return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function formatReviewIssueDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${formatReviewIssueReason(reason)}.`;
  }
}

export function buildSectionReviewIssues(input: {
  accessibilityIssueRows: AccessibilityIssueRow[];
  consentAuditFindings: PreviewSampleFinding[];
  pageEvidenceRows?: Array<Record<string, unknown>>;
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: PreconsentViolationRow[];
  runtimeArtifacts: Record<string, unknown> | null;
  scanReportReviewIssues: ScanReportReviewIssueRow[];
  sectionId: string;
  signalHitRows?: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown>;
}) {
  const issues: CanonicalReviewIssue[] = [];

  if (input.sectionId === "high_risk_product_marketing_disclosures") {
    const pageUrl =
      typeof input.snapshot?.final_url === "string" && /^https?:\/\//i.test(input.snapshot.final_url)
        ? input.snapshot.final_url
        : typeof input.snapshot?.registered_domain === "string" && input.snapshot.registered_domain.trim().length > 0
          ? `https://${input.snapshot.registered_domain}/`
          : null;
    const highRiskContext = deriveHighRiskTrackingContext({
      hostname:
        typeof input.snapshot?.registered_domain === "string"
          ? input.snapshot.registered_domain
          : typeof input.snapshot?.final_url === "string"
            ? input.snapshot.final_url
            : null,
      snapshot: input.snapshot,
      runtimeArtifacts: input.runtimeArtifacts
    });
    const runtimeText = uniqueStrings([
      ...(typeof input.snapshot?.registered_domain === "string" ? [input.snapshot.registered_domain] : []),
      ...getRecordStringArray(input.runtimeArtifacts, "third_party_request_domains"),
      ...getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls")
    ]).join(" ");
    const gamblingContextDetected =
      highRiskContext.sensitiveContextLabel === "sports betting or gambling site" ||
      /\b(gambling|sportsbook|sports betting|casino|wager|bonus bet|promo|1-800-gambler|draftkings|fanduel)\b/i.test(runtimeText);

    if (gamblingContextDetected) {
      const promotionEvidence = getHighRiskPromotionEvidence({
        pageEvidenceRows: input.pageEvidenceRows,
        runtimeArtifacts: input.runtimeArtifacts,
        signalHitRows: input.signalHitRows,
        snapshot: input.snapshot
      });
      const matchedSnippet =
        promotionEvidence?.primaryOfferSnippet ??
        "Sports betting or gambling context detected. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims.";
      const disclosureAdjacency = promotionEvidence
        ? promotionEvidence.responsibleGamblingDisclosureAdjacent && promotionEvidence.termsDisclosureAdjacent
          ? "Nearby responsible-gambling and terms evidence was retained."
          : "Clear nearby responsible-gambling and terms evidence was not retained with the offer snippet."
        : "No specific homepage offer snippet was retained with this context signal.";
      issues.push({
        description:
          promotionEvidence?.primaryOfferSnippet
            ? `Sportsbook offer language was observed: "${promotionEvidence.primaryOfferSnippet}" ${disclosureAdjacency}`
            : "The scanned surface appears to be a sports betting or gambling product. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims.",
        evidence: uniqueStrings([
          pageUrl,
          ...(promotionEvidence?.offerSnippets ?? []),
          ...getRecordStringArray(input.runtimeArtifacts, "third_party_request_domains").slice(0, 4)
        ]),
        fallbackEvidence: {
          familyPacketFindingId: "high_risk_product_risk_disclosure_missing",
          matchedSnippet,
          offerSnippets: promotionEvidence?.offerSnippets ?? [],
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl,
          policySnippets: [matchedSnippet],
          primaryOfferSnippet: promotionEvidence?.primaryOfferSnippet ?? null,
          responsibleGamblingDisclosureAdjacent: promotionEvidence?.responsibleGamblingDisclosureAdjacent ?? null,
          responsibleGamblingSnippets: promotionEvidence?.responsibleGamblingSnippets ?? [],
          sectionReviewIssue: true,
          sensitive_context_label: "sports betting or gambling site",
          supportingSignals: [
            "financial.high_risk_product_promotion",
            "commercial.gambling_or_sportsbook_context_detected"
          ],
          termsDisclosureAdjacent: promotionEvidence?.termsDisclosureAdjacent ?? null,
          termsSnippets: promotionEvidence?.termsSnippets ?? []
        },
        linkedValidationRuleKeys: ["section_review.high_risk_product_without_local_loss_risk_disclosure"],
        severity: "medium",
        title: "High-risk gambling promotion disclosure review"
      });
    }
  }

  if (input.sectionId === "policy_clarity_consistency_review") {
    issues.push(
      ...input.policyBehaviorContradictions.map((row) => {
        const runtimeRequestUrls = uniqueStrings(row.evidence.filter((value) => /^https?:\/\//i.test(value)));
        const runtimeScriptHosts = uniqueStrings(row.runtimeScriptHosts ?? []);
        const policyAnchorPresent = Boolean(row.policyClaimType && row.policySnippet && row.policyPageUrl);
        const runtimeAnchorPresent = Boolean(row.runtimeObservationType && runtimeRequestUrls.length > 0 && row.runtimeVendors.length > 0);
        const conflictBridgePresent = Boolean(row.conflictType && row.conflictSupportsPromotion === true);
        const promotionEligible = policyAnchorPresent && runtimeAnchorPresent && conflictBridgePresent;
        const reviewStatus = promotionEligible ? "complete" : "insufficient_evidence_for_policy_behavior_conflict";

        return {
          description: row.observedBehavior,
          evidence: row.evidence,
          fallbackEvidence: {
            contradictionEvidence: {
              claim: row.claim,
              contradictionBasis: row.status,
	              conflictBridge: {
	                conflictType: row.conflictType ?? null,
	                provenance: {
	                  bridgeRuleId: row.conflictType ? "wc01.scan_report_review.policy_behavior_contradiction_v1" : null,
	                  generatedBy: "wc01.scan_report_review",
	                  mappingType: row.conflictType ? "deterministic_policy_runtime_mapping" : null,
	                  mappingVersion: "policy_behavior_conflict_map:v1",
	                  policyAnchorRef: row.policyPageUrl,
	                  runtimeAnchorRef: runtimeRequestUrls[0] ?? runtimeScriptHosts[0] ?? null,
	                  sourceEvidenceIds: uniqueStrings([
	                    row.policyPageUrl,
	                    ...runtimeRequestUrls,
	                    ...runtimeScriptHosts.map((host) => `script_host:${host}`)
	                  ])
	                },
	                reasoning: row.conflictReasoning ?? row.runtimeSummary,
	                supportsPromotion: row.conflictSupportsPromotion === true
	              },
              evidenceSufficiency: {
                conflictBridgePresent,
                policyAnchorPresent,
                promotionEligible,
                reviewStatus,
                runtimeAnchorPresent
              },
              explicitPolicySnippet: row.policySnippet ?? null,
              policyAnchor: {
                claimType: row.policyClaimType ?? null,
                confidence: row.policyConfidence ?? null,
                extractionStatus: row.policyExtractionStatus ?? null,
                normalizedClaim: row.claim,
                snippet: row.policySnippet ?? row.claim,
                sourceUrl: row.policyPageUrl
              },
              policySnippet: row.policySnippet ?? row.claim,
              policySourceUrl: row.policyPageUrl,
              policySummaryShort: row.policySummary,
              relatedVendors: row.relatedVendors,
              runtimeAnchor: {
                confidence: row.runtimeConfidence ?? null,
                cookies: [],
                observationType: row.runtimeObservationType ?? null,
                phase: row.runtimePhase ?? "unknown",
                requests: runtimeRequestUrls,
                sourceUrl: row.policyPageUrl,
                storageArtifacts: runtimeScriptHosts.map((host) => `script_host:${host}`),
                vendors: row.runtimeVendors
              },
              runtimeEvidenceArtifacts: uniqueStrings([
                ...row.evidence,
                ...runtimeScriptHosts.map((host) => `script_host:${host}`)
              ]),
              runtimeSummary: row.runtimeSummary,
              runtimeVendors: row.runtimeVendors,
              sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
              supportingSignals: row.supportingSignals
            } satisfies ContradictionEvidenceBundle,
            claim: row.claim,
            pageUrl: row.policyPageUrl,
            policySnippets: row.policySnippet ? [row.policySnippet] : [],
            policySummaryShort: row.policySummary,
            relatedVendors: row.relatedVendors,
            requestUrls: runtimeRequestUrls,
            runtimeEvidenceArtifacts: uniqueStrings([
              ...row.evidence,
              ...runtimeScriptHosts.map((host) => `script_host:${host}`)
            ]),
            runtimeEvidenceUrls: runtimeRequestUrls,
            preconsent_tracker_script_hosts: runtimeScriptHosts,
            runtimeSummary: row.runtimeSummary,
            runtimeVendors: row.runtimeVendors,
            sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
            supportingSignals: row.supportingSignals
          },
          severity: row.severity,
          title: row.title
        };
      })
    );

    issues.push(
      ...dedupeReviewIssues(
        input.scanReportReviewIssues.map((row) => {
          const reviewSeverity: CanonicalReviewIssue["severity"] =
            row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium";

          return {
            description: row.description,
            evidence: row.pageUrl ? [row.pageUrl] : [],
            linkedValidationRuleKeys: getValidationMatchKeysForReviewReason(row.reason),
            severity: reviewSeverity,
            title: formatReviewIssueReason(row.reason)
          };
        })
      )
    );
  }

  if (input.sectionId === "tracking_third_party_ecosystem" && input.preconsentViolationRows.length > 0) {
    const preconsentEvidenceUrls = uniqueStrings(
      input.preconsentViolationRows.flatMap((row) => row.evidenceUrls)
    );
    const preconsentScriptHosts = uniqueStrings(input.preconsentViolationRows.map((row) => row.scriptHost));
    const preconsentVendors = uniqueStrings(input.preconsentViolationRows.map((row) => row.vendorName));
    const preconsentCookieEvidence = buildPreconsentCookieEvidenceFromViolationRows({
      pageHost: getPreconsentPageHost(input.snapshot),
      rows: input.preconsentViolationRows
    });
    const preconsentEvidenceQuality = buildPreconsentEvidenceQualityFallback(input.runtimeArtifacts);
    const highRiskContext = deriveHighRiskTrackingContext({
      hostname:
        typeof input.snapshot?.registered_domain === "string"
          ? input.snapshot.registered_domain
          : typeof input.snapshot?.final_url === "string"
            ? input.snapshot.final_url
            : null,
      snapshot: input.snapshot,
      runtimeArtifacts: input.runtimeArtifacts,
      evidenceUrls: preconsentEvidenceUrls
    });
    const highRiskVendorSummary = formatHighRiskVendorSummary(highRiskContext.highRiskVendors, highRiskContext.isSensitiveContext ? 8 : 5);
    issues.push({
      description:
        highRiskContext.isSensitiveContext && highRiskVendorSummary.length > 0
          ? `Pre-consent tracking was observed on a ${highRiskContext.sensitiveContextLabel}. Vendors observed include ${highRiskVendorSummary.join(", ")}. Sensitive-context behavioral data may be flowing to third parties before a clear consent interaction is completed.`
          : `Observed vendor activity before consent for ${input.preconsentViolationRows.length} vendor${input.preconsentViolationRows.length === 1 ? "" : "s"}.`,
      evidence: preconsentEvidenceUrls.slice(0, 3),
      fallbackEvidence: {
        high_risk_tracking_vendor_names: highRiskContext.highRiskVendors.map((vendor) => vendor.name),
        high_risk_tracking_vendor_roles: highRiskContext.highRiskVendors.map((vendor) => `${vendor.name}: ${vendor.role}`),
        preconsent_tracker_evidence_urls: preconsentEvidenceUrls,
        preconsent_tracker_script_hosts: preconsentScriptHosts,
        preconsent_tracker_vendors: uniqueStrings([...preconsentVendors, ...highRiskContext.highRiskVendors.map((vendor) => vendor.name)]),
        ...(preconsentCookieEvidence.length > 0
          ? {
              preconsent_cookie_categories: uniqueStrings(preconsentCookieEvidence.map((row) => row.category)),
              preconsent_cookie_evidence: preconsentCookieEvidence,
              preconsent_cookie_initiator_domains: uniqueStrings(preconsentCookieEvidence.map((row) => row.initiatorDomain)),
              preconsent_cookie_initiator_vendors: uniqueStrings(preconsentCookieEvidence.map((row) => row.initiatorVendor)),
              preconsent_cookie_names: uniqueStrings(preconsentCookieEvidence.map((row) => row.cookieName)),
              preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
              preconsent_nonessential_cookie_names: uniqueStrings(preconsentCookieEvidence.map((row) => row.cookieName))
            }
          : {}),
        preconsent_tracking_detected: true,
        runtimeEvidenceArtifacts: uniqueStrings([
          ...preconsentEvidenceUrls,
          ...preconsentScriptHosts.map((host) => `script_host:${host}`)
        ]),
        runtimeEvidenceUrls: preconsentEvidenceUrls,
        runtimeVendors: uniqueStrings([...preconsentVendors, ...highRiskContext.highRiskVendors.map((vendor) => vendor.name)]),
        sensitive_context_label: highRiskContext.sensitiveContextLabel,
        sensitive_context_tracking_detected: highRiskContext.isSensitiveContext && highRiskContext.highRiskVendors.length > 0,
        supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
        tracking_before_consent_detected: true,
        ...(preconsentEvidenceQuality ?? {})
      },
      severity: "high",
      title:
        highRiskContext.isSensitiveContext && highRiskVendorSummary.length > 0
          ? "Sensitive-data collection with third-party tracking present"
          : "Pre-consent tracking incidents detected"
    });
  }

  if (input.sectionId === "tracking_third_party_ecosystem" && input.preconsentViolationRows.length === 0) {
    const initialNonEssentialCookieNames = getInitialNonEssentialCookieNames(input.runtimeArtifacts);
    if (initialNonEssentialCookieNames.length > 0) {
      const initialCookieDomains = uniqueStrings(getRecordStringArray(input.runtimeArtifacts, "initial_cookie_domains"));
      issues.push({
        description:
          `${initialNonEssentialCookieNames.length} non-essential cookie${initialNonEssentialCookieNames.length === 1 ? " was" : "s were"} retained in the initial runtime payload before CertScore had enough consent-timing evidence to promote a pre-consent tracking finding.`,
        evidence: initialNonEssentialCookieNames.slice(0, 6),
        fallbackEvidence: {
          initial_cookie_domains: initialCookieDomains,
          initial_cookie_names: initialNonEssentialCookieNames,
          preconsent_cookie_names: initialNonEssentialCookieNames,
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true,
          source: "initial_runtime_cookie_inventory",
          supportingSignals: ["privacy.preconsent_tracking_detected"],
          unifiedFindingId: "preconsent_tracking"
        },
        severity: "medium",
        title: "Initial tracking cookies retained before consent verification"
      });
    }
  }

  if (input.sectionId === "tracking_third_party_ecosystem") {
    const cookieAttributeSummary = getRuntimeRecord(input.runtimeArtifacts, "cookie_attribute_summary");
    if (hasMeaningfulWeakCookieAttributeSummary(cookieAttributeSummary)) {
      issues.push({
        description:
          "Runtime cookie attributes show missing Secure, HttpOnly, or SameSite protections on meaningful non-functional cookies. These attributes should be reviewed because they control how tracking and identity cookies can be handled by browsers.",
        evidence: uniqueStrings([
          ...getRecordStringArray(cookieAttributeSummary, "missingSecureCookieNames"),
          ...getRecordStringArray(cookieAttributeSummary, "missing_secure_cookie_names"),
          ...getRecordStringArray(cookieAttributeSummary, "weakSameSiteCookieNames"),
          ...getRecordStringArray(cookieAttributeSummary, "weak_same_site_cookie_names")
        ]).slice(0, 6),
        fallbackEvidence: {
          cookieAttributeSummary,
          supportingSignals: ["privacy.weak_cookie_security_attributes_detected"]
        },
        severity: "medium",
        title: "Weak cookie security attributes"
      });
    }
  }

  if (input.sectionId === "consent_controls_enforcement") {
    const consentHighRiskContext = deriveHighRiskTrackingContext({
      hostname:
        typeof input.snapshot?.registered_domain === "string"
          ? input.snapshot.registered_domain
          : typeof input.snapshot?.final_url === "string"
            ? input.snapshot.final_url
            : null,
      snapshot: input.snapshot,
      runtimeArtifacts: input.runtimeArtifacts
    });
    const cmpNames = uniqueStrings(consentHighRiskContext.cmpVendors.map((vendor) => vendor.name));
    if (cmpNames.includes("OneTrust") && cmpNames.includes("TrustArc")) {
      issues.push({
        description:
          "Multiple consent or preference-management vendors were observed on the same property. This can create audit complexity or conflicting consent state unless ownership of each consent signal is documented.",
        evidence: uniqueStrings(consentHighRiskContext.cmpVendors.flatMap((vendor) => vendor.evidence)).slice(0, 4),
        fallbackEvidence: {
          cmp_vendor_names: cmpNames,
          cmp_vendor_evidence: consentHighRiskContext.cmpVendors.map((vendor) => ({
            evidence: vendor.evidence,
            name: vendor.name,
            role: vendor.role
          })),
          supportingSignals: ["privacy.cookie_banner_present"]
        },
        severity: "medium",
        title: "Multiple consent vendors observed"
      });
    }

    issues.push(
      ...input.consentAuditFindings.map((finding) => {
        const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
        const baselineTrackerEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
        const persistedTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
        const newTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
        const postRejectTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
        const postRejectTrackerEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_post_reject_tracker_evidence_urls");

        let fallbackEvidence: Record<string, unknown> | undefined;
        if (finding.title === "Trackers fired before consent interaction") {
          const baselineTrackerScriptHosts = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_script_hosts");
          const preconsentEvidenceQuality = buildPreconsentEvidenceQualityFallback(input.runtimeArtifacts);
          fallbackEvidence = {
            preconsent_tracker_evidence_urls: baselineTrackerEvidenceUrls,
            preconsent_tracker_script_hosts: baselineTrackerScriptHosts,
            preconsent_tracker_vendors: baselineTrackerVendors,
            preconsent_tracking_detected: true,
            runtimeEvidenceArtifacts: uniqueStrings([
              ...baselineTrackerEvidenceUrls,
              ...baselineTrackerScriptHosts.map((host) => `script_host:${host}`)
            ]),
            runtimeEvidenceUrls: baselineTrackerEvidenceUrls,
            runtimeVendors: baselineTrackerVendors,
            supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
            tracking_before_consent_detected: true,
            ...(preconsentEvidenceQuality ?? {})
          };
        } else if (finding.title === "Reject interaction did not reduce tracking") {
          fallbackEvidence = buildRejectTrackingEvidenceFallback({
            baselineTrackerEvidenceUrls,
            baselineTrackerVendors,
            newTrackerVendors,
            persistedTrackerVendors,
            postRejectTrackerEvidenceUrls,
            postRejectTrackerVendors,
            runtimeArtifacts: input.runtimeArtifacts
          });
        } else if (finding.title === "Reject interaction did not reduce third-party cookies") {
          const rejectFallback = buildRejectTrackingEvidenceFallback({
            baselineTrackerEvidenceUrls,
            baselineTrackerVendors,
            newTrackerVendors,
            persistedTrackerVendors,
            postRejectTrackerEvidenceUrls,
            postRejectTrackerVendors,
            runtimeArtifacts: input.runtimeArtifacts
          });
          fallbackEvidence = {
            ...rejectFallback,
            consent_post_reject_third_party_cookie_count:
              input.runtimeArtifacts?.consent_post_reject_third_party_cookie_count ?? null,
            consent_reject_reduced_third_party_cookies: false,
            supportingSignals: ["consent_reject_reduced_third_party_cookies"],
            unifiedFindingId: "reject_did_not_reduce_third_party_cookies"
          };
        }

        return {
          description: finding.description,
          fallbackEvidence,
          severity: finding.severity === "info" ? "low" : finding.severity,
          title: finding.title
        };
      })
    );
  }

  if (input.sectionId === "access_barriers_task_completion") {
    issues.push(
      ...input.accessibilityIssueRows
        .filter((row) => row.count > 0)
        .slice(0, 3)
        .map((row) => {
          const severity: CanonicalReviewIssue["severity"] = row.count >= 5 ? "high" : row.count >= 2 ? "medium" : "low";

          return {
            description: `${row.count} observed in the automated accessibility audit.`,
            severity,
            title: row.label
          };
        })
    );
  }

  if (input.sectionId === "accessibility_commitments_conformance_support" && input.snapshot.accessibility_claim_mismatch_detected === true) {
    issues.push({
      description: "Public-facing accessibility claims appear to conflict with the automated issue profile captured during the scan.",
      severity: "high",
      title: "Accessibility claim mismatch detected"
    });
  }

  if (input.sectionId === "billing_cancellation_post_purchase_rights" && input.snapshot.store_credit_only_policy_present === true) {
    issues.push({
      description: "The refund/remedy posture appears to lean on store credit only, which is worth direct reviewer attention.",
      severity: "medium",
      title: "Store-credit-only remedy detected"
    });
  }

  return issues;
}

function dedupeReviewIssues(issues: CanonicalReviewIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = [
      issue.title.trim().toLowerCase(),
      issue.description.trim().toLowerCase(),
      issue.severity,
      ...(issue.evidence ?? []).map((entry) => entry.trim().toLowerCase()).sort()
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function severityRank(severity: CanonicalReviewFinding["severity"]) {
  switch (severity) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function getKeyPageTypeForSignal(key: string) {
  if (/disclosure\.privacy_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "privacy_policy";
  }
  if (/disclosure\.terms_of_service_(fetch_failed|extraction_limited)/i.test(key)) {
    return "terms_of_service";
  }
  if (/disclosure\.cookie_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "cookie_policy";
  }
  if (/disclosure\.accessibility_statement_(fetch_failed|extraction_limited)/i.test(key)) {
    return "accessibility_statement";
  }
  if (/disclosure\.contact_page_fetch_failed/i.test(key)) {
    return "contact";
  }
  return null;
}

function getPolicySignalFallbackEvidence(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment: Array<Record<string, unknown>>;
  runtimeArtifacts?: Record<string, unknown> | null;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  const rightsSnippetKeys = [
    "dsar",
    "access",
    "delete",
    "correct",
    "export",
    "manage",
    "state_rights",
    "authorized_agent",
    "appeal",
    "privacy_controls",
    "privacy_contact"
  ] as const;
  const rightsSnippetSelectors: Array<string | RegExp> = [
    ...rightsSnippetKeys,
    /^rights[_:-]/i,
    /^rights_signal[:_-]/i,
    /^topic:privacy_rights/i,
    /^topic:dsar/i,
    /dsar/i
  ];
  const policyPositiveSpec = getPolicyPositiveSignalSpec(input.signalKey);
  const topicKey = policyPositiveSpec?.evidenceSnippetKey ?? null;
  const pageType = policyPositiveSpec?.pageType ?? "privacy_policy";
  const candidateRows = input.policyEnrichment.filter((entry) => getPolicyPageType(entry) === pageType);
  const mergedPolicyRightsSignals = findMergedSignalValue(input.mergedSignals, "policyRightsSignals");
  const policyRightsSignals = Array.isArray(mergedPolicyRightsSignals)
    ? mergedPolicyRightsSignals.filter((value): value is string => typeof value === "string")
    : [];
  const rightsSnippetKeysForSignal = isPrivacyRightsSignalKey(input.signalKey) ? [...rightsSnippetKeys] : [];
  const topicSnippetKeys = topicKey
    ? [
        topicKey,
        topicKey.startsWith("topic:") ? topicKey.slice("topic:".length) : `topic:${topicKey}`,
        ...(policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present"
          ? ["session_replay_disclosure", "behavioral_analytics_disclosure", "product_analytics_disclosure"]
          : [])
      ]
    : policyPositiveSpec?.unifiedFindingId === "privacy_contact_path_present"
      ? ["privacy_contact", "notice_contact", "dsar"]
      : policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present"
        ? rightsSnippetKeysForSignal
      : policyPositiveSpec?.unifiedFindingId === "children_privacy_disclosure_present"
        ? ["topic:children", "children"]
        : [];
  const rowHasTopicSnippet = (entry: Record<string, unknown>) => {
    const snippets = getPolicyEvidenceSnippets(entry);
    if (topicSnippetKeys.some((key) => isMeaningfulPolicyText(snippets?.[key]))) {
      return true;
    }
    if (policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present") {
      return getPolicyEvidenceSnippetValues(entry, rightsSnippetSelectors).length > 0 ||
        getPolicyRightsSignals(entry, snippets).length > 0 ||
        Boolean(getPolicyDsarMechanism(entry));
    }
    return false;
  };
  const row =
    candidateRows.find(rowHasTopicSnippet) ??
    candidateRows[0] ??
    input.policyEnrichment[0] ??
    null;
  const pageUrl = row ? getPolicyPageUrl(row) : null;
  const policySummaryShort = row ? getPolicySummaryText(row) : null;
  const evidenceSnippets = row ? getPolicyEvidenceSnippets(row) : null;
  const topicSnippets = topicSnippetKeys.flatMap((key) =>
    isMeaningfulPolicyText(evidenceSnippets?.[key]) && String(evidenceSnippets[key]).trim().toLowerCase() !== "nano"
      ? [String(evidenceSnippets[key])]
      : []
  );
  const rightsSnippets = isPrivacyRightsSignalKey(input.signalKey)
    ? getPolicyEvidenceSnippetValues(row ?? {}, rightsSnippetSelectors).slice(0, 3)
    : [];
  const policySnippets = normalizePolicySnippetList([...topicSnippets, ...rightsSnippets]);
  const rowPolicyRightsSignals = row ? getPolicyRightsSignals(row, evidenceSnippets) : [];
  const retainedPolicyRightsSignals = uniqueStrings([...policyRightsSignals, ...rowPolicyRightsSignals]);
  const mergedPrivacyContactChannelType = findMergedSignalValue(input.mergedSignals, "privacyContactChannelType");
  const snapshotPrivacyContactChannelType =
    typeof input.snapshot?.privacy_contact_channel_type === "string" && isMeaningfulPolicyText(input.snapshot.privacy_contact_channel_type)
      ? input.snapshot.privacy_contact_channel_type
      : null;
  const privacyContactChannelType =
    typeof mergedPrivacyContactChannelType === "string" && isMeaningfulPolicyText(mergedPrivacyContactChannelType)
      ? mergedPrivacyContactChannelType
      : snapshotPrivacyContactChannelType;
  const mergedPolicyChildrenReference = findMergedSignalValue(input.mergedSignals, "policyChildrenReference");
  const policyChildrenReference =
    typeof mergedPolicyChildrenReference === "string" && isMeaningfulPolicyText(mergedPolicyChildrenReference)
      ? mergedPolicyChildrenReference
      : null;

  return {
    pageUrl,
    pageUrls: pageUrl ? [pageUrl] : [],
    policyDsarMechanism: row ? getPolicyDsarMechanism(row) : null,
    policyPageType: row ? getPolicyPageType(row) : null,
    policySnippets,
    policyRightsSignals: retainedPolicyRightsSignals,
    runtimeDisclosureSupport:
      policyPositiveSpec?.unifiedFindingId &&
      [
        "tracking_technologies_disclosure_present",
        "targeted_advertising_disclosure_present",
        "third_party_advertising_disclosure_present",
        "behavioral_analytics_disclosure_present"
      ].includes(policyPositiveSpec.unifiedFindingId)
        ? {
            thirdPartyRequestCount:
              typeof input.runtimeArtifacts?.third_party_request_count === "number"
                ? input.runtimeArtifacts.third_party_request_count
                : typeof input.snapshot?.third_party_request_count === "number"
                  ? input.snapshot.third_party_request_count
                  : null,
            thirdPartyRequestDomains: getRecordStringArray(input.runtimeArtifacts, "third_party_request_domains").slice(0, 8),
            sessionReplayRuntimeVendors: getRecordStringArray(input.runtimeArtifacts, "session_replay_runtime_vendors").slice(0, 8)
          }
        : null,
    privacyContactChannelType,
    policyChildrenReference,
    policyPositiveSnippetKeys: topicSnippetKeys,
    policyPositiveTopic:
      policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present"
        ? "behavioral_analytics_disclosure"
        : topicKey?.replace(/^topic:/, ""),
    policySummaryShort: policySnippets.length > 0 ? null : policySummaryShort,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: pageUrl ? [pageUrl] : []
  };
}

function getKeyPageDiscoveryPageSummary(
  summary: unknown,
  pageType: string
): {
  attemptCount: number | null;
  attemptedUrls: string[];
  bestDiscoverySource: string | null;
  fetchQuality: string | null;
  guessedOnly: boolean;
  stopReason: string | null;
} | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return null;
  }

  const match = pageSummaries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && entry.pageType === pageType
  );

  if (!match) {
    return null;
  }

  return {
    attemptCount: typeof match.attemptCount === "number" ? match.attemptCount : null,
    attemptedUrls: Array.isArray(match.attemptedUrls)
      ? match.attemptedUrls.filter((value): value is string => typeof value === "string")
      : [],
    bestDiscoverySource: typeof match.bestDiscoverySource === "string" ? match.bestDiscoverySource : null,
    fetchQuality: typeof match.fetchQuality === "string" ? match.fetchQuality : null,
    guessedOnly: match.guessedOnly === true,
    stopReason: typeof match.stopReason === "string" ? match.stopReason : null
  };
}

function getRepresentativeAccessibilityExamplesForSignal(input: {
  rows: AccessibilityRuleEvidenceRow[];
  signalKey: string;
}) {
  const matches = input.rows.filter((row) => {
    const ruleCode = typeof row.ruleCode === "string" ? row.ruleCode.toLowerCase() : "";
    const ruleGroup = typeof row.ruleGroup === "string" ? row.ruleGroup.toLowerCase() : "";

    if (/wcag_contrast_failures_count/i.test(input.signalKey)) {
      return /contrast/.test(ruleCode) || /contrast/.test(ruleGroup);
    }
    if (/wcag_form_label_error_count/i.test(input.signalKey)) {
      return ruleCode === "label" || ruleGroup === "label";
    }
    if (/wcag_link_name_error_count/i.test(input.signalKey)) {
      return ruleCode === "link-name" || ruleGroup === "link";
    }

    return false;
  });

  return matches.slice(0, 3).map((row) => ({
    description: row.description,
    help: row.help,
    helpUrl: row.helpUrl,
    impact: row.impact,
    nodeCount: row.nodeCount,
    pageUrl: row.pageUrl,
    representativeSelectors: row.representativeSelectors.slice(0, 3),
    ruleCode: row.ruleCode,
    ruleGroup: row.ruleGroup,
    severity: row.severity
  }));
}

import { buildScanDomainContext } from "./scan-domain-context";

export function getDomainMacroFallbackFields(
  macroEnrichment: Record<string, unknown> | null | undefined
): { domainIndustryPrimary: string | null; investorOrSecuritiesPromotion: boolean | null } {
  return buildScanDomainContext(macroEnrichment);
}

function getSignalHitMatchedTexts(signalKey: string, signalHitRows: Array<Record<string, unknown>> | undefined): string[] {
  if (!signalHitRows || signalHitRows.length === 0) {
    return [];
  }

  const texts: string[] = [];
  for (const row of signalHitRows) {
    if (getRecordString(row, "signal_key") !== signalKey && getRecordString(row, "signalKey") !== signalKey) {
      continue;
    }

    const dbMatchedText = getRecordString(row, "matched_text") ?? getRecordString(row, "matchedText");
    if (dbMatchedText) {
      texts.push(dbMatchedText);
      continue;
    }

    const payload = row.payload;
    if (payload && typeof payload === "object") {
      const matchedTexts = (payload as Record<string, unknown>).matchedTexts;
      if (Array.isArray(matchedTexts)) {
        for (const text of matchedTexts) {
          if (typeof text === "string" && text.trim().length > 0) {
            texts.push(text.trim());
          }
        }
      }
    }
  }

  return uniqueStrings(texts);
}

export function buildReviewFindings(input: {
  allSignals?: Array<{ key: string; value: unknown }>;
  categoryId?: string;
  issues: CanonicalReviewIssue[];
  macroEnrichment?: Record<string, unknown> | null;
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment?: Array<Record<string, unknown>>;
  prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
  runtimeArtifacts?: Record<string, unknown> | null;
  signalHitRows?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown> | null;
  sectionId: string;
  sectionItems: CanonicalSignalItem[];
  trackerVendors?: TrackerVendorEvidenceRow[];
  validationFindingLookup?: Map<string, ScanValidationFinding>;
}) {
  const contradictorySignalPairs = new Map<string, string>([
    ["privacy.privacy_contact_channel_missing", "privacy.privacy_contact_path_present"],
    ["accessibility.accessibility_support_path_missing", "accessibility.accessibility_contact_method_present"]
  ]);
  const availableSignalKeys = new Set([
    ...input.sectionItems
      .filter((item) => isSignalValuePopulated(item.key, item.value))
      .map((item) => item.key),
    ...(input.allSignals ?? [])
      .filter((signal) => isSignalValuePopulated(signal.key, signal.value))
      .map((signal) => signal.key)
  ]);
  const signalFindings: CanonicalReviewFinding[] = input.sectionItems
    .filter((item) => {
      if (item.relation !== "primary" || !isConcerningSignal(item.key, item.value)) {
        return false;
      }

      const contradictoryPositiveSignalKey = contradictorySignalPairs.get(item.key);
      if (contradictoryPositiveSignalKey) {
        const mergedPositiveValue = findMergedSignalValue(input.mergedSignals, contradictoryPositiveSignalKey);
        if (
          availableSignalKeys.has(contradictoryPositiveSignalKey) ||
          isSignalValuePopulated(contradictoryPositiveSignalKey, mergedPositiveValue)
        ) {
          return false;
        }
      }

      return true;
    })
    .flatMap((item): CanonicalReviewFinding[] => {
      const linkedValidationFinding = input.validationFindingLookup
        ? findValidationFindingForKeys(input.validationFindingLookup, getValidationMatchKeysForSignal(item.key))
        : null;
      const keyPageType = getKeyPageTypeForSignal(item.key);
      const keyPageSummary =
        keyPageType
          ? getKeyPageDiscoveryPageSummary(input.runtimeArtifacts?.key_page_discovery_summary, keyPageType)
          : null;
      const accessibilityRuleExamples = getRepresentativeAccessibilityExamplesForSignal({
        rows: input.prioritizedAccessibilityRuleRows,
        signalKey: item.key
      });

      const baseFallbackEvidence = {
        ...(isRightsFrictionSignal(item.key)
          ? {
              consentBlockerPageTitle:
                typeof input.runtimeArtifacts?.consent_blocker_page_title === "string"
                  ? input.runtimeArtifacts.consent_blocker_page_title
                  : null,
              consentBlockerTextSnippet:
                typeof input.runtimeArtifacts?.consent_blocker_text_snippet === "string"
                  ? input.runtimeArtifacts.consent_blocker_text_snippet
                  : null,
              consentBlockerType:
                typeof input.runtimeArtifacts?.consent_blocker_type === "string"
                  ? input.runtimeArtifacts.consent_blocker_type
                  : null,
              consentBlockerUrl:
                typeof input.runtimeArtifacts?.consent_blocker_url === "string"
                  ? input.runtimeArtifacts.consent_blocker_url
                  : null,
              consentEvidencePassCount:
                typeof input.runtimeArtifacts?.consent_evidence_pass_count === "number"
                  ? input.runtimeArtifacts.consent_evidence_pass_count
                  : null,
              consentFrictionDelta:
                typeof input.runtimeArtifacts?.consent_friction_delta === "number"
                  ? input.runtimeArtifacts.consent_friction_delta
                  : null,
              consentOptInClicks:
                typeof input.runtimeArtifacts?.consent_opt_in_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_in_clicks
                  : null,
              consentOptOutClicks:
                typeof input.runtimeArtifacts?.consent_opt_out_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_out_clicks
                  : null,
              consentRedirectOrAuthRequired: input.runtimeArtifacts?.consent_redirect_or_auth_required === true,
              signalKey: item.key,
              signalLabel: item.label,
              signalValue: item.value
            }
          : (item.source === "policy_enrichment_signal" || item.source === "document_semantic_signal") &&
              isPolicyPositiveSignalKey(item.key)
            ? getPolicySignalFallbackEvidence({
                mergedSignals: input.mergedSignals,
                policyEnrichment: input.policyEnrichment ?? [],
                runtimeArtifacts: input.runtimeArtifacts,
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value,
                snapshot: input.snapshot
              })
          : /privacy\.gpc_signal_not_honored/i.test(item.key)
            ? {
                gpcVerification:
                  input.runtimeArtifacts?.gpc_verification && typeof input.runtimeArtifacts.gpc_verification === "object"
                    ? input.runtimeArtifacts.gpc_verification
                    : null,
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value,
                sourceUrls:
                  input.runtimeArtifacts?.gpc_verification &&
                  typeof input.runtimeArtifacts.gpc_verification === "object" &&
                  Array.isArray((input.runtimeArtifacts.gpc_verification as { evidenceUrls?: unknown }).evidenceUrls)
                    ? ((input.runtimeArtifacts.gpc_verification as { evidenceUrls: string[] }).evidenceUrls)
                    : []
              }
            : /privacy\.weak_cookie_security_attributes_detected/i.test(item.key)
              ? {
                  cookieAttributeSummary:
                    input.runtimeArtifacts?.cookie_attribute_summary && typeof input.runtimeArtifacts.cookie_attribute_summary === "object"
                      ? input.runtimeArtifacts.cookie_attribute_summary
                      : null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
            : /commerce\.(?:high_sensitivity_data_collection_detected|form_collects_(?:ssn|government_id|health_information|financial_information|geolocation))/i.test(item.key)
              ? (
                buildHighSensitivitySignalFallbackEvidence({
                  matchedTexts: getSignalHitMatchedTexts(item.key, input.signalHitRows),
                  mergedSignals: input.mergedSignals,
                  runtimeArtifacts: input.runtimeArtifacts,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  trackerVendors: input.trackerVendors
                })
              )
            : /(?:commerce|privacy)\.session_replay_|session_replay.*detected/i.test(item.key)
              ? (
                buildSessionReplayTrackerFallbackEvidence({
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  trackerVendors: input.trackerVendors
                }) ?? {
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
              )
          : isChildContextSignalKey(item.key)
              ? buildChildContextFallbackEvidence({
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /accessibility\.accessibility_contact_method_present/i.test(item.key)
              ? buildAccessibilitySupportFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /disclosure\.cookie_policy_structurally_obstructed/i.test(item.key)
              ? buildCookiePolicyFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                })
            : /commerce\.affiliate_disclosure_present|disclosure\.key_page_discovery_unresolved_after_bounded_search|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(item.key)
              ? buildSnapshotDisclosureFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  relatedSignals: (input.allSignals ?? input.sectionItems).map((signalLike) => ({
                    key: signalLike.key,
                    value: signalLike.value
                  })),
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : keyPageType
              ? {
                  fetchQuality: keyPageSummary?.fetchQuality ?? null,
                  keyPageAttemptCount: keyPageSummary?.attemptCount ?? null,
                  keyPageDiscoverySource: keyPageSummary?.bestDiscoverySource ?? null,
                  keyPageGuessedOnly: keyPageSummary?.guessedOnly ?? null,
                  keyPageAttemptedUrls: keyPageSummary?.attemptedUrls ?? [],
                  keyPageStopReason: keyPageSummary?.stopReason ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
              : {
                  accessibilityRuleExamples,
                  ...(/accessibility\.wcag_contrast_failures_count/i.test(item.key) && typeof item.value === "number"
                    ? { count: item.value }
                    : {}),
                  matchedTexts: getSignalHitMatchedTexts(item.key, input.signalHitRows),
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }),
        ...getDomainMacroFallbackFields(input.macroEnrichment)
      };
      const hybridFallbackEvidence = getHybridSignalFallbackEvidence({
        runtimeArtifacts: input.runtimeArtifacts,
        signalKey: item.key,
        signalLabel: item.label,
        signalValue: item.value
      });
      const fallbackEvidence =
        mergeFallbackEvidenceRecords(baseFallbackEvidence, hybridFallbackEvidence);

      if (!shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: item.key,
        linkedValidationEvidence: linkedValidationFinding?.evidence ?? null,
        signalSource: item.source
      })) {
        return [];
      }

      return [{
        categoryId: input.categoryId,
        description: getSignalConcernReason(item.key, item.value) ?? "This signal is worth reviewer attention.",
        fallbackEvidence,
        id: `${input.sectionId}-signal-${item.key}`,
        linkedValidationFinding,
        observedValue: formatCompactValue(item.value),
        severity: getSignalFindingSeverity(item.key, item.value),
        signalKey: item.key,
        signalLabel: item.label,
        signalSource: item.source,
        sourceType: "signal",
        title: item.label
      }];
    });

  const issueFindings: CanonicalReviewFinding[] = input.issues.map((issue, index) => ({
    categoryId: input.categoryId ?? getDefaultIssueCategoryId(input.sectionId),
    description: issue.description,
    evidence: issue.evidence,
    fallbackEvidence: issue.fallbackEvidence,
    id: `${input.sectionId}-issue-${index}`,
    linkedValidationFinding: input.validationFindingLookup
      ? findValidationFindingForKeys(
          input.validationFindingLookup,
          issue.linkedValidationRuleKeys && issue.linkedValidationRuleKeys.length > 0
            ? issue.linkedValidationRuleKeys
            : getValidationMatchKeysForTitle(issue.title)
        )
      : null,
    observedValue: summarizeObservedIssueEvidence(issue.evidence, issue.severity),
    severity: issue.severity,
    sourceType: "issue",
    title: issue.title
  }));

  return [...signalFindings, ...issueFindings].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity) || left.title.localeCompare(right.title)
  );
}

function getDefaultIssueCategoryId(sectionId: string) {
  switch (sectionId) {
    case "policy_clarity_consistency_review":
      return "cross_document_consistency";
    default:
      return undefined;
  }
}

function getSignalFindingSeverity(key: string, value: unknown): CanonicalReviewFinding["severity"] {
  if (isPolicyPositiveSignalKey(key) || /accessibility_contact_method_present/i.test(key)) {
    return "low";
  }
  if (/preconsent|tracking_before_consent|session_replay|conflict|mismatch/i.test(key)) {
    return "high";
  }
  if (/fingerprinting/i.test(key)) {
    return "high";
  }
  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "medium";
  }
  if (/gpc_signal_not_honored/i.test(key)) {
    return "high";
  }
  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(key)) {
    return "high";
  }
  if (/weak_cookie_security_attributes_detected|key_page_discovery_unresolved_after_bounded_search|surface_missing|fetch_failed|extraction_limited|dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present|store_credit_only|termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "medium";
  }
  if (typeof value === "number" && /risk_score|ambiguity_score|friction_score/i.test(key)) {
    return value >= 70 ? "high" : "medium";
  }

  return "medium";
}

function summarizeObservedIssueEvidence(evidence: string[] | undefined, severity: CanonicalReviewFinding["severity"]) {
  if (!evidence || evidence.length === 0) {
    return `${severity} severity`;
  }

  const normalizedEvidence = evidence.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (normalizedEvidence.length === 0) {
    return `${severity} severity`;
  }

  const nonUrlEvidence = normalizedEvidence.filter((entry) => !/^https?:\/\//i.test(entry.trim()));
  if (nonUrlEvidence.length > 0) {
    return summarizeReviewIssueEvidence(nonUrlEvidence);
  }

  return normalizedEvidence.length === 1 ? "Linked evidence available" : `${normalizedEvidence.length} linked evidence items`;
}

function summarizeReviewIssueEvidence(evidence: string[]) {
  if (evidence.length === 1) {
    return evidence[0] ?? "";
  }

  const [first, second] = evidence;
  const remainingCount = evidence.length - 2;

  return remainingCount > 0
    ? `${first} | ${second} | +${remainingCount} more`
    : `${first} | ${second}`;
}
