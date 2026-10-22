import { gpcResponseAssessmentSchema, gpcPolicyCollectionEvidenceIds, type GpcResponseAssessment } from "@certscore/contracts";
import { californiaChoiceEnforcementPoints, type CaliforniaChoiceEnforcementPoints } from "./california-choice-enforcement-policy";

const GPP_POLICY_VERSION = "california-gpc-response.v7-gpp" as const;
const IDENTIFIER_POLICY_VERSION="california-gpc-response.v8-identifiers" as const;
const QUALIFIED_DISCLOSURE_POLICY_VERSION = "california-gpc-response.v9-qualified-disclosure" as const;
export const CALIFORNIA_GPC_RESPONSE_POLICY_VERSION = "california-gpc-response.v10-property-bound" as const;
const PRE_GPP_POLICY_VERSION = "california-gpc-response.v6-sale-sharing" as const;
const HISTORICAL_RECIPIENT_POLICY_VERSION = "california-gpc-response.v5-recipients" as const;
export const CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS = 15 as const;
export const CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY =
  "california.gpc_response.qualifying_activity_not_suppressed" as const;
export const CANONICAL_OVERALL_SCORE_SOURCE = "canonical.multi_framework" as const;
export const CANONICAL_OVERALL_SCORE_VERSION = "overall-posture.v13" as const;

export type CaliforniaGpcResponsePolicyAssessment = {
  assessmentStatus: "checked" | "gap_observed" | "needs_evidence" | "not_applicable" | "review_signal";
  deductionPoints: CaliforniaChoiceEnforcementPoints;
  recipientIds?: string[];
  eligibleActivity: {
    baseline: string[];
    persistedUnderGpc: string[];
    suppressedUnderGpc: string[];
  };
  policyKey: typeof CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY;
  policyVersion: typeof CALIFORNIA_GPC_RESPONSE_POLICY_VERSION | typeof QUALIFIED_DISCLOSURE_POLICY_VERSION | typeof IDENTIFIER_POLICY_VERSION | typeof GPP_POLICY_VERSION | typeof PRE_GPP_POLICY_VERSION | typeof HISTORICAL_RECIPIENT_POLICY_VERSION | "california-gpc-response.v1";
  reasonCode:
    | "gpc_customer_policy_suspended"
    | "verified_gpc_advertising_collection"
    | "verified_gpc_choice_contradiction"
    | "no_verified_gpc_advertising_collection"
    | "comparable_gpc_no_qualifying_suppression"
    | "comparable_gpc_partial_qualifying_suppression"
    | "comparable_gpc_qualifying_activity_suppressed"
    | "gpc_comparison_not_determinate"
    | "no_qualifying_sale_share_activity_observed";
  scoreEffect: "deduction" | "none";
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 100);
}

function isCaliforniaSaleShareCandidateIdentity(value: string) {
  return /\|(?:advertising|marketing)$/i.test(value.trim());
}

function qualifyingIdentities(values: Iterable<string>) {
  return uniqueSorted([...values].filter(isCaliforniaSaleShareCandidateIdentity));
}

/**
 * Applies California scoring policy to a jurisdiction-neutral GPC comparison.
 * The policy deliberately uses only directly classified advertising/marketing
 * identities. Analytics, measurement, cookies, and CMP changes alone cannot
 * create this deduction because they do not establish sale/share treatment.
 */
export function deriveHistoricalCaliforniaGpcResponsePolicy(
  assessment: GpcResponseAssessment,
): CaliforniaGpcResponsePolicyAssessment {
  const base = {
    policyKey: CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
    policyVersion: "california-gpc-response.v1",
  } as const;
  const comparable = gpcResponseAssessmentSchema.safeParse(assessment).success && assessment.status !== "indeterminate" &&
    assessment.comparison.comparable &&
    assessment.comparison.enabledProof.secGpcHeaderValue === "1" &&
    assessment.comparison.enabledProof.requestsWithSecGpc > 0 &&
    assessment.comparison.enabledProof.requestEventIds.length > 0 &&
    assessment.comparison.enabledProof.navigatorGlobalPrivacyControl === true;
  if (!comparable) {
    return {
      ...base,
      assessmentStatus: "needs_evidence",
      deductionPoints: 0,
      eligibleActivity: { baseline: [], persistedUnderGpc: [], suppressedUnderGpc: [] },
      reasonCode: "gpc_comparison_not_determinate",
      scoreEffect: "none",
    };
  }

  const advertising = assessment.comparison.deltas.advertisingOrMeasurementActivity;
  const trackers = assessment.comparison.deltas.trackers;
  const completeActivity = assessment.contractVersion !== "certscore.gpc-response-assessment.v1"
    ? assessment.comparison.deltas.advertisingOrMarketingActivity : null;
  const suppressedUnderGpc = completeActivity?.baselineOnly ?? qualifyingIdentities([
    ...advertising.baselineOnly,
    ...trackers.baselineOnly,
  ]);
  const persistedUnderGpc = completeActivity?.shared ?? qualifyingIdentities([
    ...advertising.shared,
    ...trackers.shared,
  ]);
  const baseline = uniqueSorted([...suppressedUnderGpc, ...persistedUnderGpc]);
  // V2 samples are bounded for display. Only full-set counts decide policy.
  const baselineCount = completeActivity?.baselineCount ?? baseline.length;
  const persistedCount = completeActivity?.sharedCount ?? persistedUnderGpc.length;
  const suppressedCount = completeActivity?.baselineOnlyCount ?? suppressedUnderGpc.length;

  if (baselineCount === 0) {
    return {
      ...base,
      assessmentStatus: "not_applicable",
      deductionPoints: 0,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "no_qualifying_sale_share_activity_observed",
      scoreEffect: "none",
    };
  }

  if (persistedCount > 0 && suppressedCount === 0) {
    return {
      ...base,
      assessmentStatus: "gap_observed",
      deductionPoints: CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "comparable_gpc_no_qualifying_suppression",
      scoreEffect: "deduction",
    };
  }

  if (persistedCount === 0 && suppressedCount > 0) {
    return {
      ...base,
      assessmentStatus: "checked",
      deductionPoints: 0,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "comparable_gpc_qualifying_activity_suppressed",
      scoreEffect: "none",
    };
  }

  return {
    ...base,
    assessmentStatus: "review_signal",
    deductionPoints: 0,
    eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
    reasonCode: "comparable_gpc_partial_qualifying_suppression",
    scoreEffect: "none",
  };
}

/** Risk scoring uses verified collection facts, never vendor presence or a
 * failure-to-change label. A risk deduction is not a finding of legal sale/sharing. */
export function deriveCaliforniaGpcResponsePolicy(assessment: unknown): CaliforniaGpcResponsePolicyAssessment {
  const parsed=gpcResponseAssessmentSchema.safeParse(assessment);
  const a=parsed.success?parsed.data:null;
  const o=a?.contractVersion === "certscore.gpc-response-assessment.v3"?a.observation:null;
  // A retained positive event does not require proving that every other event
  // was captured. Keep full-pair response/completeness independent of that fact.
  const verified=Boolean(a && a.contractVersion === "certscore.gpc-response-assessment.v3" && o &&
    o.status !== "unavailable" && o.delivery.httpHeaderRetained && o.delivery.mainNavigatorReadbackRetained &&
    o.sourceSha256 && o.sessionSha256 && o.documentUrlSha256 && Boolean(o.scanId) &&
    o.sourceSha256 === a.comparison.gpcArtifact?.sha256 &&
    (o.positiveEvidence?.representativeDocument || o.status === "complete" && o.delivery.fullContextVerified && o.requests.complete));
  const collectionEvidenceIds = o ? gpcPolicyCollectionEvidenceIds(o) : [];
  const collection=verified && (o?.requests.advertisingCollectionCount ?? 0)>0 && collectionEvidenceIds.length > 0;
  const contradiction=verified && o?.semanticProbe === "observed" && o.registration.cmpGpcSignal === "received" &&
    (o.registration.sale === "not_opted_out" || o.registration.sharing === "not_opted_out");
  const eligible=collection || contradiction;
  const recipientIds = collection ? [...new Set(o!.requests.advertisingCollectionRecipients?.rows
    .filter(row => collectionEvidenceIds.includes(row.evidenceId)).map(row => row.entityId) ?? [])].sort() : [];
  return {policyKey:CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
    policyVersion:o?.requests.advertisingCollectionQualification?.policyVersion === "gpc_sale_sharing_evidence.v5" ? CALIFORNIA_GPC_RESPONSE_POLICY_VERSION :
      o?.requests.advertisingCollectionQualification?.policyVersion === "gpc_sale_sharing_evidence.v4" ? QUALIFIED_DISCLOSURE_POLICY_VERSION :
      o?.requests.advertisingCollectionQualification?.policyVersion === "gpc_sale_sharing_evidence.v3" ? IDENTIFIER_POLICY_VERSION :
      o?.requests.advertisingCollectionQualification?.policyVersion === "gpc_sale_sharing_evidence.v2" ? GPP_POLICY_VERSION :
      o?.requests.advertisingCollectionQualification ? PRE_GPP_POLICY_VERSION : HISTORICAL_RECIPIENT_POLICY_VERSION,
    recipientIds,
    assessmentStatus:eligible?"review_signal":"needs_evidence",deductionPoints:californiaChoiceEnforcementPoints(recipientIds, eligible),
    scoreEffect:eligible?"deduction":"none",reasonCode:contradiction?"verified_gpc_choice_contradiction":collection?"verified_gpc_advertising_collection":"no_verified_gpc_advertising_collection",
    eligibleActivity:{baseline:[],persistedUnderGpc:contradiction?["gpc_received_but_applicable_opt_out_off"]:collection?collectionEvidenceIds:[],suppressedUnderGpc:[]}};
}
