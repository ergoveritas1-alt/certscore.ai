import type { PolicySurfaceObservation } from "@certscore/contracts";
import { mergeCmpPolicyProvenance } from "./cmp-policy-discovery.js";

export function mergePolicySurfaceObservations(
  primary: PolicySurfaceObservation[],
  supplemental: PolicySurfaceObservation[],
): PolicySurfaceObservation[] {
  const merged = new Map<string, PolicySurfaceObservation>();
  for (const observation of [...primary, ...supplemental]) {
    const key = policySurfaceObservationKey(observation);
    const existingById = [...merged.entries()].find(([, candidate]) =>
      candidate.observationId === observation.observationId
    );
    const existing = merged.get(key) ?? existingById?.[1];
    if (!existing || policyObservationRank(observation) > policyObservationRank(existing)) {
      if (existingById && existingById[0] !== key) {
        merged.delete(existingById[0]);
      }
      merged.set(key, mergeVisibleLinkProof({ ...observation, cmpDiscovery: mergeCmpPolicyProvenance(observation.cmpDiscovery, existing?.cmpDiscovery) }, existing));
    } else if (existing) {
      merged.set(existingById?.[0] ?? key, mergeVisibleLinkProof({ ...existing, cmpDiscovery: mergeCmpPolicyProvenance(existing.cmpDiscovery, observation.cmpDiscovery) }, observation));
    }
  }
  return [...merged.values()];
}

function mergeVisibleLinkProof(
  preferred: PolicySurfaceObservation,
  other: PolicySurfaceObservation | undefined,
): PolicySurfaceObservation {
  if (preferred.linkVisibility === "visible" || other?.linkVisibility !== "visible" ||
      other.linkObservationState !== "observed" || other.directlyLinkedFromScannedPage !== true) return preferred;
  return {
    ...preferred,
    linkVisibility: "visible",
    accessibleNameSource: other.accessibleNameSource,
    linkSourcePageUrl: other.linkSourcePageUrl,
    classifierProvenance: other.classifierProvenance,
    classifierReasonCodes: other.classifierReasonCodes,
    linkText: other.linkText,
    linkObservationState: other.linkObservationState,
    directlyLinkedFromScannedPage: true,
    discoveryMethod: other.discoveryMethod,
  };
}

export function applyGoverningPolicySelection(
  observations: PolicySurfaceObservation[],
): PolicySurfaceObservation[] {
  const ranked = observations
    .filter((observation) => observation.surfaceType === "privacy_policy")
    .map((observation) => {
      const targetOwned = observation.targetRelationship === "target_controller" ||
        observation.targetRelationship === "first_party_brand";
      const eligible =
        observation.status === "fetched" &&
        observation.documentFetchState === "fetched" &&
        observation.documentEvaluationState === "usable" &&
        observation.documentRole === "policy_document" &&
        targetOwned &&
        observation.contentCoverage?.status !== "malformed";
      const observedTopicCount = new Set(
        (observation.gdprTransparencyTopicCoverageDiagnostics ?? [])
          .filter((diagnostic) => diagnostic.evaluationState === "observed")
          .map((diagnostic) => diagnostic.topic),
      ).size;
      const score = Math.min(100, Math.max(0,
        (observation.status === "fetched" ? 15 : 0) +
        (observation.documentEvaluationState === "usable" ? 15 : 0) +
        (observation.documentRole === "policy_document" ? 15 : 0) +
        (observation.targetRelationship === "target_controller" ? 20 :
          observation.targetRelationship === "first_party_brand" ? 16 : 0) +
        (observation.contentCoverage?.status === "complete" ? 15 :
          observation.contentCoverage?.status === "partial" ? 8 : 0) +
        (observation.documentTextCoverage?.status === "complete" ? 10 : 0) +
        Math.min(10, observedTopicCount * 2),
      ));
      return { eligible, observation, observedTopicCount, score };
    })
    .filter((row) => row.eligible)
    .sort((left, right) =>
      right.score - left.score ||
      right.observedTopicCount - left.observedTopicCount ||
      right.observation.confidence - left.observation.confidence ||
      (left.observation.normalizedUrl ?? left.observation.url)
        .localeCompare(right.observation.normalizedUrl ?? right.observation.url)
    );
  const rankByObservationId = new Map(
    ranked.map((row, index) => [row.observation.observationId, {
      rank: index + 1,
      score: row.score,
    }]),
  );

  return observations.map((observation) => {
    if (observation.surfaceType !== "privacy_policy") return observation;
    const selected = rankByObservationId.get(observation.observationId);
    const targetOwned = observation.targetRelationship === "target_controller" ||
      observation.targetRelationship === "first_party_brand";
    const reasonCodes = uniqueStrings((selected
      ? [
          selected.rank === 1 ? "highest_ranked_eligible_governing_policy" : "eligible_supporting_policy_document",
          observation.targetRelationship === "target_controller"
            ? "target_controller_document"
            : "confirmed_first_party_brand_document",
          observation.contentCoverage?.status === "complete"
            ? "complete_policy_content_coverage"
            : `policy_content_coverage_${observation.contentCoverage?.status ?? "unavailable"}`,
          observation.documentTextCoverage?.status === "complete"
            ? "complete_policy_text_retention"
            : `policy_text_coverage_${observation.documentTextCoverage?.status ?? "unavailable"}`,
          ...(observation.documentRoleReasonCodes ?? []),
        ]
      : [
          observation.status !== "fetched" ? `policy_document_status_${observation.status}` : null,
          observation.documentFetchState !== "fetched"
            ? `policy_document_fetch_${observation.documentFetchState ?? "not_attempted"}`
            : null,
          observation.documentEvaluationState !== "usable"
            ? `policy_document_evaluation_${observation.documentEvaluationState ?? "not_attempted"}`
            : null,
          observation.documentRole !== "policy_document"
            ? `policy_document_role_${observation.documentRole ?? "unknown"}`
            : null,
          !targetOwned ? "policy_document_target_ownership_unverified" : null,
          observation.contentCoverage?.status === "malformed" ? "policy_content_malformed" : null,
        ]).filter((value): value is string => value !== null));
    return {
      ...observation,
      governingPolicySelection: {
        contractVersion: "governing_policy_selection.v1" as const,
        state: selected
          ? selected.rank === 1 ? "primary" as const : "supporting" as const
          : "ineligible" as const,
        rank: selected?.rank,
        score: selected?.score ?? 0,
        reasonCodes: reasonCodes.slice(0, 16),
      },
    };
  });
}

export function policySurfaceObservationKey(observation: PolicySurfaceObservation): string {
  return `${observation.surfaceType}:${canonicalPolicyUrlIdentity(observation.normalizedUrl ?? observation.url)}`;
}

function policyObservationRank(observation: PolicySurfaceObservation): number {
  const statusRank: Record<PolicySurfaceObservation["status"], number> = {
    fetched: 7,
    observed: 6,
    candidate: 5,
    assisted_candidate: 4,
    failed: 3,
    skipped_budget: 2,
    not_observed: 1,
  };
  return statusRank[observation.status] * 10 + observation.confidence;
}

const POLICY_TRACKING_QUERY_PARAM = /^(?:utm_.+|ref|ref_|referrer|source|campaign|campaignid|tag|linkcode|creative|creativeasin|ascsubtag|pf_rd_.+)$/i;
const POLICY_SENSITIVE_QUERY_PARAM = /(?:token|secret|password|passwd|email|session|auth|signature|sig|key)$/i;

export function canonicalPolicyUrlIdentity(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    const retained = [...parsed.searchParams.entries()]
      .filter(([name]) =>
        !POLICY_TRACKING_QUERY_PARAM.test(name) &&
        !POLICY_SENSITIVE_QUERY_PARAM.test(name)
      )
      .sort(([leftName, leftValue], [rightName, rightValue]) =>
        leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
      );
    parsed.search = "";
    for (const [name, parameterValue] of retained) {
      parsed.searchParams.append(name, parameterValue);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return value.replace(/#.*$/, "");
  }
}

function uniqueStrings(values: string[]): string[] { return [...new Set(values)]; }
