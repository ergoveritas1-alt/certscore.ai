import type { PolicySurfaceObservation, RuntimeCoverageSummary, ScanNoGoAssessment, ScanEvidenceLaneAssessment } from "@certscore/contracts";

export function buildScanEvidenceLaneAssessment(input: {
  consentLaneStatus?: "usable" | "limited" | "not_testable";
  consentLimitationKeys?: string[];
  normalizedUrl: string;
  policySurfaceObservations: PolicySurfaceObservation[];
  runtimeCoverage: RuntimeCoverageSummary;
  scanNoGoAssessment: ScanNoGoAssessment | null;
  transportSecurityObservationCount: number;
}): ScanEvidenceLaneAssessment {
  const homepageNoGo = input.scanNoGoAssessment?.decision === "no_go";
  // A policy reachable from a sign-in screen does not make the protected
  // target assessable. Preserve that terminal result after all lanes finish.
  // The status check also handles retained assessments with the older generic reason.
  const authenticationNoGo = homepageNoGo && (
    input.scanNoGoAssessment?.reasonCodes.includes("authentication_required") ||
    input.scanNoGoAssessment?.supportingSignals.mainDocumentStatus === 401
  );
  const usablePolicySurfaces = input.policySurfaceObservations.filter((observation) =>
    isIndependentlyUsablePolicySurface(observation, input.normalizedUrl)
  );
  // Policy artifacts retain full identities. The compact lane summary has a
  // narrower contract; omit overlong summaries rather than truncate a URL into
  // a different identity or fail the entire independent-lane scan.
  const policyUrls = usablePolicySurfaces.map(o => o.normalizedUrl ?? o.url);
  const policyRefs = usablePolicySurfaces.flatMap(o => o.evidenceRefs.map(ref => ref.refId));
  const runtimeUsable = !homepageNoGo && input.runtimeCoverage.coverageStatus === "usable";
  const runtimeLimited = !homepageNoGo && input.runtimeCoverage.coverageStatus === "limited_partial";
  const outcome: ScanEvidenceLaneAssessment["outcome"] = authenticationNoGo
    ? "no_go"
    : runtimeUsable || runtimeLimited
      ? "usable"
      : usablePolicySurfaces.length > 0
        ? "partial_with_diagnostics"
        : "no_go";
  const runtimeLane = runtimeUsable ? "usable" as const : runtimeLimited ? "limited" as const : "unusable" as const;
  const policyLane = usablePolicySurfaces.length > 0
    ? "usable" as const
    : input.policySurfaceObservations.length > 0
      ? "limited" as const
      : "not_testable" as const;
  return {
    status: "available",
    version: "scan-evidence-lane-assessment-v1",
    outcome,
    lanes: {
      homepageRuntime: runtimeLane,
      consent: input.consentLaneStatus ?? (runtimeUsable ? "usable" : runtimeLimited ? "limited" : "not_testable"),
      cookiesTrackers: runtimeUsable ? "usable" : runtimeLimited ? "limited" : "not_testable",
      policyGdpr: policyLane,
      transport: input.transportSecurityObservationCount > 0 ? "usable" : "not_testable",
    },
    usablePolicySurfaceUrls: policyUrls.filter(url => url.length <= 500)
      .slice(0, 8),
    limitationKeys: uniqueStrings([
      ...input.runtimeCoverage.limitationKeys,
      ...(input.consentLimitationKeys ?? []),
      homepageNoGo ? "homepage_runtime_no_go" : null,
      authenticationNoGo ? "authentication_required" : null,
      outcome === "partial_with_diagnostics" ? "partial_policy_evidence_only" : null,
      policyLane !== "usable" ? "verified_policy_surface_unavailable" : null,
      policyUrls.some(url => url.length > 500) ? "policy_url_summary_limited" : null,
      policyRefs.some(ref => ref.length > 160) ? "policy_reference_summary_limited" : null,
    ].filter((value): value is string => Boolean(value))).slice(0, 24),
    evidenceRefs: uniqueStrings([
      ...policyRefs.filter(ref => ref.length <= 160),
      ...(homepageNoGo ? ["scan_runtime_artifacts.scan_no_go_assessment"] : []),
    ]).slice(0, 24),
  };
}

function isIndependentlyUsablePolicySurface(
  observation: PolicySurfaceObservation,
  requestedUrl: string,
): boolean {
  if (observation.status !== "fetched" || observation.fetchable === false) return false;
  if (typeof observation.httpStatus !== "number" || observation.httpStatus < 200 || observation.httpStatus >= 400) return false;
  if (observation.surfaceType === "unknown" || observation.surfaceType === "terms") return false;
  const text = observation.textExcerpt?.replace(/\s+/g, " ").trim() ?? "";
  const wordCount = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (text.length < 240 || wordCount < 35 || observation.evidenceRefs.length === 0) return false;
  const verifiedTargetRelationship =
    ["target_controller", "first_party_brand"].includes(observation.targetRelationship ?? "") &&
    (observation.ownershipConfidence ?? 0) >= 0.75;
  if (verifiedTargetRelationship) return true;
  try {
    const requested = new URL(requestedUrl).hostname.toLowerCase().replace(/^www\./, "");
    const observed = new URL(observation.normalizedUrl ?? observation.url).hostname.toLowerCase().replace(/^www\./, "");
    return observed === requested || observed.endsWith(`.${requested}`) || requested.endsWith(`.${observed}`);
  } catch {
    return false;
  }
}

function uniqueStrings<T extends string>(values: T[]): T[] { return [...new Set(values)]; }
