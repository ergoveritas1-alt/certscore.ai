type ReportFacingProjectionEligibility =
  | "projected"
  | "eligible_not_projected"
  | "not_projected"
  | "no_top_finding_mapping";

export function filterReportFacingDemotionReasons(input: {
  eligibility: ReportFacingProjectionEligibility;
  reasons: string[];
}) {
  if (input.eligibility === "projected") {
    return input.reasons;
  }
  return input.reasons.filter((reason) => !/strong enough to stand on its own|confirmed_when|can stand on its own/i.test(reason));
}
