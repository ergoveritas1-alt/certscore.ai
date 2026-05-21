export type ReportFacingProjectionEligibility =
  | "projected"
  | "eligible_not_projected"
  | "not_projected"
  | "support_only"
  | "no_top_finding_mapping";

const PRECONSENT_PACKET_IDS = new Set([
  "preconsent_tracking",
  "pre_consent_tracking_detected",
  "third_party_cookie_pre_consent",
  "third_party_tracking_pre_consent"
]);

const COMMERCIAL_CLAIMS_PACKET_IDS = new Set([
  "financial_urgency_pressure_tactic_detected",
  "guaranteed_or_high_return_claims_present",
  "high_risk_product_risk_disclosure_missing",
  "performance_claims_without_context",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected"
]);

export function filterReportFacingDemotionReasons(input: {
  eligibility: ReportFacingProjectionEligibility;
  reasons: string[];
}) {
  if (input.eligibility === "projected") {
    return input.reasons;
  }
  return input.reasons.filter((reason) => !/strong enough(?:\s+\w+){0,8}\s+to stand on its own|confirmed_when|can stand on its own/i.test(reason));
}

export function getReportFacingReviewLane(findingId: string, eligibility: ReportFacingProjectionEligibility) {
  if (COMMERCIAL_CLAIMS_PACKET_IDS.has(findingId) && eligibility !== "projected") {
    return "commercialClaimsReviewFindings";
  }
  return "canonicalFindingReview";
}

export function buildReportFacingProjectionCopy(input: {
  eligibility: ReportFacingProjectionEligibility;
  findingId: string;
  summary: string;
  demotionReasons: string[];
}) {
  if (input.eligibility === "projected") {
    return {
      projectionSummary: "Projected into canonical top findings.",
      summary: input.summary
    };
  }

  const firstReason = input.demotionReasons[0] ?? (
    input.eligibility === "no_top_finding_mapping"
      ? "no canonical top-finding mapping exists for this packet"
      : "canonical top-finding criteria were not fully met"
  );
  const demotionCopy = `Not projected as a canonical top finding: ${firstReason}.`;

  if (PRECONSENT_PACKET_IDS.has(input.findingId)) {
    return {
      projectionSummary: demotionCopy,
      summary: `${demotionCopy} Retained pre-consent tracking context is support evidence for review, not a confirmed top-finding packet. ${input.summary}`
    };
  }

  if (COMMERCIAL_CLAIMS_PACKET_IDS.has(input.findingId)) {
    return {
      projectionSummary: `${demotionCopy} Commercial and financial claim signals are exposed in the commercialClaimsReviewFindings lane unless product policy adopts them into the canonical privacy/accessibility top-finding universe.`,
      summary: `${demotionCopy} This is commercial-claims review evidence, not a canonical privacy/accessibility top finding. ${input.summary}`
    };
  }

  if (input.eligibility === "eligible_not_projected" || input.eligibility === "not_projected" || input.eligibility === "support_only" || input.eligibility === "no_top_finding_mapping") {
    return {
      projectionSummary: demotionCopy,
      summary: `${demotionCopy} ${input.summary}`
    };
  }

  return {
    projectionSummary: demotionCopy,
    summary: input.summary
  };
}
