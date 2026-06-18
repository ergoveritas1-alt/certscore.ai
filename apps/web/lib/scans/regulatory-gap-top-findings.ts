import type { CertScoreFinding } from "./finding-registry";

export type RegulatoryGapTopFindingRow = {
  assessmentStatus?: string;
  criticalEvidence?: {
    retainedEvidence?: Record<string, unknown>;
    statusBasis?: string | null;
  };
  evidenceRefs?: string[];
  evidenceState?: string;
  explanation?: string;
  id: string;
  label: string;
  note?: string;
  regulatoryMapping?: string[];
  retainedEvidence?: Record<string, unknown> | null;
  status?: string;
  statusLabel?: string;
};

export type RegulatoryGapTopFindingArea = {
  id: string;
  navLabel?: string;
  rows: RegulatoryGapTopFindingRow[];
  title: string;
};

export type RegulatoryGapTopFindingInput = {
  gdprEprivacyArea?: RegulatoryGapTopFindingArea | null;
};

type RegulatoryGapAreaConfig = {
  idPrefix: string;
  labelPrefix: string;
  lawLabel: string;
  priorityBase: number;
};

const GDPR_CONFIG: RegulatoryGapAreaConfig = {
  idPrefix: "gdpr_eprivacy",
  labelPrefix: "GDPR/ePrivacy",
  lawLabel: "GDPR/ePrivacy",
  priorityBase: 140
};

const POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking"
]);

export function buildRegulatoryGapTopFindings(input: RegulatoryGapTopFindingInput): CertScoreFinding[] {
  return [
    ...findingsForArea(input.gdprEprivacyArea, GDPR_CONFIG)
  ];
}

function findingsForArea(
  area: RegulatoryGapTopFindingArea | null | undefined,
  config: RegulatoryGapAreaConfig
): CertScoreFinding[] {
  if (!area) {
    return [];
  }

  return area.rows
    .filter(isPotentialConcernCoverageRow)
    .map((row, index): CertScoreFinding => {
      const statusLabel = row.statusLabel ?? humanizeStatus(row.status ?? "gap_observed");
      return {
        id: `regulatory_gap__${config.idPrefix}__${safeId(row.id)}`,
        label: row.label,
        section: "Privacy & Tracking",
        defaultSurfacePriority: config.priorityBase - index,
        whyItMatters:
          `${config.lawLabel} coverage projected this row as a potential concern from retained checklist evidence. This is a high-priority review signal, not a legal conclusion.`,
        remediation:
          "Review the retained checklist evidence, confirm whether the row is applicable to the site, and address the underlying implementation or disclosure gap if confirmed.",
        confidence: "good",
        directVsInferred: "mixed",
        evidenceDetails: {
          policyEvidenceDetails: {
            assessmentStatus: row.assessmentStatus,
            evidenceRefs: row.evidenceRefs ?? [],
            explanation: row.explanation ?? null,
            regulatoryAreaId: area.id,
            regulatoryAreaTitle: area.title,
            regulatoryMapping: row.regulatoryMapping ?? [],
            rowId: row.id,
            rowLabel: row.label,
            rowNote: row.note ?? null,
            status: row.status ?? row.statusLabel ?? "gap_observed"
          }
        },
        evidencePreview: [
          `${area.title}: ${row.label}`,
          row.note ?? row.explanation ?? `${config.lawLabel} checklist row projected as ${statusLabel}.`
        ],
        evidenceRefs: row.evidenceRefs ?? [],
        severity: "high",
        shortSummary: getRegulatoryGapTopFindingSummary(row, config)
      };
    });
}

function getRegulatoryGapTopFindingSummary(row: RegulatoryGapTopFindingRow, config: RegulatoryGapAreaConfig) {
  const summary = row.note ?? row.explanation ?? row.criticalEvidence?.statusBasis ?? null;
  if (typeof summary === "string" && summary.trim().length > 0) {
    return summary.trim();
  }
  return `${config.lawLabel} evidence projected this row as a potential concern from retained checklist evidence.`;
}

function isPotentialConcernCoverageRow(row: RegulatoryGapTopFindingRow) {
  if (row.assessmentStatus === "gap_observed") {
    return true;
  }
  const evidenceLabel = getEvidenceLabel(row);
  if (evidenceLabel === "Not testable") {
    return false;
  }
  if (evidenceLabel === "Potential gap") {
    return true;
  }
  if (evidenceLabel === "Observed") {
    return isObservedPotentialConcernRow(row);
  }
  if (evidenceLabel === "Partial" || row.assessmentStatus === "review_signal") {
    return false;
  }
  if (POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS.has(row.id)) {
    return false;
  }
  if (row.id === "reject_all_path_availability" && hasConsentSurfaceExpectation(row)) {
    return true;
  }
  if (
    (row.id === "consent_surface_observed" || row.id === "cookie_notice_policy_availability") &&
    hasPreConsentRuntimeExpectation(row)
  ) {
    return true;
  }
  return false;
}

function getEvidenceLabel(row: RegulatoryGapTopFindingRow) {
  if (row.assessmentStatus === "coverage_limitation" || row.evidenceState === "not_testable" || row.status === "Not testable") {
    return "Not testable";
  }
  if (row.status === "Gap observed" || row.assessmentStatus === "gap_observed") {
    return "Potential gap";
  }
  if (row.status === "Insufficient evidence" || row.status === "Not confirmed" || row.status === "Review signal") {
    return row.evidenceState === "observed" && isRiskSignalRow(row.id) ? "Observed" : "Partial";
  }
  if (isObservedRow(row)) {
    return "Observed";
  }
  return "Not observed";
}

function isRiskSignalRow(rowId: string) {
  return rowId === "pre_consent_cookies_storage" ||
    rowId === "pre_consent_third_party_tracking" ||
    rowId === "advertising_retargeting_vendor_signal_observed" ||
    rowId === "analytics_vendor_observed" ||
    rowId === "session_replay_fingerprinting_review" ||
    rowId === "device_identification_fingerprinting_signal_observed" ||
    rowId === "embedded_content_pre_consent";
}

function isObservedRow(row: RegulatoryGapTopFindingRow) {
  const statuses = [row.status, row.statusLabel]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
  if (statuses.some((status) => status === "not observed" || status === "not confirmed")) {
    return false;
  }
  return row.evidenceState === "observed" ||
    statuses.some((status) => status === "observed" || status === "gap observed");
}

function isObservedPotentialConcernRow(row: RegulatoryGapTopFindingRow) {
  switch (row.id) {
    case "pre_consent_cookies_storage":
      return hasHighConfidenceStorageConcern(row);
    case "pre_consent_third_party_tracking":
      return true;
    case "advertising_retargeting_vendor_signal_observed":
      return hasHighConfidenceAdvertisingConcern(row);
    case "analytics_vendor_observed":
      return hasHighConfidenceAnalyticsConcern(row);
    case "session_replay_fingerprinting_review":
      return true;
    case "device_identification_fingerprinting_signal_observed":
      return getDeviceIdentificationDirection(row) === "potential_concern";
    case "embedded_content_pre_consent":
      return getEmbeddedContentDirection(row) === "potential_concern";
    default:
      return false;
  }
}

function retainedEvidence(row: RegulatoryGapTopFindingRow) {
  return row.criticalEvidence?.retainedEvidence ?? row.retainedEvidence ?? {};
}

function retainedBoolean(row: RegulatoryGapTopFindingRow, keys: string[]) {
  const evidence = retainedEvidence(row);
  return keys.some((key) => evidence[key] === true);
}

function retainedNumber(row: RegulatoryGapTopFindingRow, keys: string[]) {
  const evidence = retainedEvidence(row);
  for (const key of keys) {
    const value = evidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function retainedText(row: RegulatoryGapTopFindingRow) {
  return JSON.stringify(
    retainedEvidence(row),
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  ).toLowerCase();
}

function evidenceMentions(row: RegulatoryGapTopFindingRow, pattern: RegExp) {
  return pattern.test([
    row.explanation,
    row.note,
    row.criticalEvidence?.statusBasis,
    row.evidenceRefs?.join(" "),
    retainedText(row)
  ].join(" ").toLowerCase());
}

function hasHighConfidenceStorageConcern(row: RegulatoryGapTopFindingRow) {
  return retainedBoolean(row, [
    "eligibleNonEssentialCookieStorageFindingProjected",
    "nonEssentialCookieStorageObserved",
    "non_essential_cookie_storage_observed",
    "thirdPartyCookieStorageObserved",
    "third_party_cookie_storage_observed",
    "advertisingCookieStorageObserved",
    "analyticsCookieStorageObserved",
    "sessionReplayCookieStorageObserved",
    "deviceIdentificationStorageObserved"
  ]);
}

function hasHighConfidenceAdvertisingConcern(row: RegulatoryGapTopFindingRow) {
  const count = retainedNumber(row, [
    "advertisingRetargetingVendorCount",
    "advertising_retargeting_vendor_count",
    "adtechVendorCount",
    "adtech_vendor_count"
  ]);
  return (count !== null && count > 0) ||
    evidenceMentions(row, /\b(advertis(?:ing|er)|adtech|retarget|remarket|doubleclick|google ads|meta pixel|facebook pixel|pixel)\b/i);
}

function hasHighConfidenceAnalyticsConcern(row: RegulatoryGapTopFindingRow) {
  const count = retainedNumber(row, ["analyticsVendorCount", "analytics_vendor_count"]);
  if (evidenceMentions(row, /\b(limited use|strictly necessary|essential analytics|aggregate only)\b/i)) {
    return false;
  }
  return (count !== null && count > 0) ||
    evidenceMentions(row, /\b(analytics|measurement|google analytics|ga4|gtag|adobe analytics|matomo|mixpanel|amplitude)\b/i);
}

function getDeviceIdentificationDirection(row: RegulatoryGapTopFindingRow) {
  if (evidenceMentions(row, /\b(fraud|security|bot|abuse prevention|authentication)\b/i)) {
    return "neutral_signal";
  }
  if (evidenceMentions(row, /\b(fingerprint|device id|device identification|cross[- ]site|identity graph|advertis(?:ing|er)|retarget|probabilistic)\b/i)) {
    return "potential_concern";
  }
  return "review_signal";
}

function getEmbeddedContentDirection(row: RegulatoryGapTopFindingRow) {
  const text = retainedText(row);
  if (/\b(fonts\.googleapis\.com|fonts\.gstatic\.com)\b/i.test(text) && !/\b(youtube|vimeo|maps|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "review_signal";
  }
  if (/\b(youtube|vimeo|maps|openstreetmap|spotify|soundcloud|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "potential_concern";
  }
  return "review_signal";
}

function hasPreConsentRuntimeExpectation(row: RegulatoryGapTopFindingRow) {
  return retainedBoolean(row, [
    "preConsentCookiesObserved",
    "pre_consent_cookies_observed",
    "preConsentStorageObserved",
    "pre_consent_storage_observed",
    "preConsentTrackingObserved",
    "pre_consent_tracking_observed",
    "preConsentThirdPartyTrackingObserved",
    "pre_consent_third_party_tracking_observed",
    "advertisingVendorObserved",
    "advertising_vendor_observed",
    "analyticsVendorObserved",
    "analytics_vendor_observed"
  ]);
}

function hasConsentSurfaceExpectation(row: RegulatoryGapTopFindingRow) {
  return retainedBoolean(row, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cmpSignalObserved",
    "cmp_signal_observed",
    "bannerObserved",
    "banner_observed"
  ]);
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "row";
}

function humanizeStatus(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
