import {
  article13DisclosureRejectReason,
  looksLikeArticle13CodeOrConfigText,
  looksLikeArticle13PageChrome,
  looksLikeArticle13TableOfContents,
  normalizeArticle13Whitespace,
  type PolicySurfaceObservation,
} from "@certscore/contracts";

import {
  GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  gdprTransparencyProductionEvidenceProfileEnabled,
  normalizeGdprTransparencyProductionEvidenceProfile,
  type GdprTransparencyProductionEvidenceProfile,
} from "./gdpr-transparency-production-profile";

type Article13DisclosureType =
  PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"];
type GdprTransparencyTopicCandidate =
  PolicySurfaceObservation["gdprTransparencyTopicCandidates"][number];
type Article13DiscardRejectReason =
  PolicySurfaceObservation["discardedArticle13DisclosureSignals"][number]["rejectReason"];

export type GdprTransparencyProductionArticle13Evidence = {
  classifierProvenance: "gdpr_transparency_topic_classifier.v1";
  classifierReasonCodes: string[];
  confidence: number;
  disclosureType: Article13DisclosureType;
  evidenceSource: "gdpr_transparency_topic_candidate";
  evidenceText: string;
  matchStrength: "direct" | "equivalent";
  matchedLocale: GdprTransparencyTopicCandidate["matchedLocale"];
  matchedTerm: string;
  productionCredit: true;
  productionCreditProfile: typeof GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE;
  selectedEvidenceStrength: "strong";
  selectedPolicySectionExcerpt: string;
  selectedPolicySectionUrl?: string;
  source: "deterministic";
  sourceCandidateProductionCredit: false;
  sourceUrl?: string;
  status: "observed";
};

export type GdprTransparencyAdapterRejectReason =
  | Article13DiscardRejectReason
  | "profile_not_enabled"
  | "non_privacy_policy_surface"
  | "policy_surface_not_fetched"
  | "policy_text_quality_not_usable"
  | "candidate_strength_not_creditworthy"
  | "candidate_missing_classifier_provenance"
  | "candidate_missing_topic_reason_code";

export type GdprTransparencyCandidateDisposition = {
  candidate: GdprTransparencyTopicCandidate;
  disposition: "accepted" | "diagnostic_only" | "discarded";
  productionCredit: false;
  rejectReason?: GdprTransparencyAdapterRejectReason;
};

export type GdprTransparencyDiscardedArticle13Signal = {
  classifierProvenance: "gdpr_transparency_topic_classifier.v1";
  classifierReasonCodes: string[];
  confidence: number;
  disclosureType: Article13DisclosureType;
  evidenceText?: string;
  matchedLocale: GdprTransparencyTopicCandidate["matchedLocale"];
  matchedTerm: string;
  matchStrength: GdprTransparencyTopicCandidate["matchStrength"];
  productionCredit: false;
  rejectReason: Article13DiscardRejectReason;
  source: "deterministic";
};

export type GdprTransparencyTopicEvidenceAdapterInput = {
  isTargetRelevantPrivacyPolicy?: boolean;
  pageUrl?: string | null;
  policyTextQuality?: {
    usable?: boolean | null;
  } | null;
  profile?: GdprTransparencyProductionEvidenceProfile | string | null;
  surface: Pick<
    PolicySurfaceObservation,
    | "gdprTransparencyTopicCandidates"
    | "normalizedUrl"
    | "status"
    | "surfaceType"
    | "textExcerpt"
    | "url"
  >;
};

export type GdprTransparencyTopicEvidenceAdapterResult = {
  acceptedProductionSignals: GdprTransparencyProductionArticle13Evidence[];
  discardedArticle13DisclosureSignals: GdprTransparencyDiscardedArticle13Signal[];
  dispositions: GdprTransparencyCandidateDisposition[];
  profile: GdprTransparencyProductionEvidenceProfile;
  productionEvidenceEnabled: boolean;
};

const CREDITWORTHY_MATCH_STRENGTHS = new Set<GdprTransparencyTopicCandidate["matchStrength"]>([
  "direct",
  "equivalent",
]);

const MIN_CREDITWORTHY_CONFIDENCE = 0.8;

export function adaptGdprTransparencyTopicCandidatesForProduction(
  input: GdprTransparencyTopicEvidenceAdapterInput,
): GdprTransparencyTopicEvidenceAdapterResult {
  const profile = normalizeGdprTransparencyProductionEvidenceProfile(input.profile);
  const productionEvidenceEnabled = gdprTransparencyProductionEvidenceProfileEnabled(profile);
  const candidates = input.surface.gdprTransparencyTopicCandidates ?? [];

  if (!productionEvidenceEnabled) {
    return {
      acceptedProductionSignals: [],
      discardedArticle13DisclosureSignals: [],
      dispositions: candidates.map((candidate) => ({
        candidate,
        disposition: "diagnostic_only",
        productionCredit: false,
        rejectReason: "profile_not_enabled",
      })),
      productionEvidenceEnabled,
      profile,
    };
  }

  const acceptedProductionSignals: GdprTransparencyProductionArticle13Evidence[] = [];
  const discardedArticle13DisclosureSignals: GdprTransparencyDiscardedArticle13Signal[] = [];
  const dispositions: GdprTransparencyCandidateDisposition[] = [];

  for (const candidate of candidates) {
    const rejectReason = rejectReasonForCandidate(input, candidate);
    if (rejectReason) {
      dispositions.push({
        candidate,
        disposition: rejectReasonToDiscardedArticle13Reason(rejectReason) ? "discarded" : "diagnostic_only",
        productionCredit: false,
        rejectReason,
      });
      const article13RejectReason = rejectReasonToDiscardedArticle13Reason(rejectReason);
      if (article13RejectReason) {
        discardedArticle13DisclosureSignals.push({
          classifierProvenance: candidate.classifierProvenance,
          classifierReasonCodes: candidate.classifierReasonCodes,
          confidence: candidate.confidence,
          disclosureType: candidate.topic,
          evidenceText: boundedEvidence(candidate.evidenceText),
          matchedLocale: candidate.matchedLocale,
          matchedTerm: candidate.matchedTerm,
          matchStrength: candidate.matchStrength,
          productionCredit: false,
          rejectReason: article13RejectReason,
          source: "deterministic",
        });
      }
      continue;
    }

    const evidenceText = boundedEvidence(candidate.evidenceText);
    acceptedProductionSignals.push({
      classifierProvenance: candidate.classifierProvenance,
      classifierReasonCodes: uniqueStrings(candidate.classifierReasonCodes).slice(0, 16),
      confidence: candidate.confidence,
      disclosureType: candidate.topic,
      evidenceSource: "gdpr_transparency_topic_candidate",
      evidenceText,
      matchStrength: candidate.matchStrength as "direct" | "equivalent",
      matchedLocale: candidate.matchedLocale,
      matchedTerm: candidate.matchedTerm,
      productionCredit: true,
      productionCreditProfile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: evidenceText,
      ...(resolvedSurfaceUrl(input) ? { selectedPolicySectionUrl: resolvedSurfaceUrl(input), sourceUrl: resolvedSurfaceUrl(input) } : {}),
      source: "deterministic",
      sourceCandidateProductionCredit: false,
      status: "observed",
    });
    dispositions.push({
      candidate,
      disposition: "accepted",
      productionCredit: false,
    });
  }

  return {
    acceptedProductionSignals,
    discardedArticle13DisclosureSignals,
    dispositions,
    productionEvidenceEnabled,
    profile,
  };
}

function rejectReasonForCandidate(
  input: GdprTransparencyTopicEvidenceAdapterInput,
  candidate: GdprTransparencyTopicCandidate,
): GdprTransparencyAdapterRejectReason | null {
  if (input.surface.surfaceType !== "privacy_policy" || input.isTargetRelevantPrivacyPolicy === false) {
    return "non_privacy_policy_surface";
  }
  if (input.surface.status !== "fetched") {
    return "policy_surface_not_fetched";
  }
  if (input.policyTextQuality?.usable === false || !policySurfaceLooksUsable(input.surface)) {
    return "policy_text_quality_not_usable";
  }
  if (candidate.classifierProvenance !== "gdpr_transparency_topic_classifier.v1") {
    return "candidate_missing_classifier_provenance";
  }
  if (
    !CREDITWORTHY_MATCH_STRENGTHS.has(candidate.matchStrength) ||
    candidate.confidence < MIN_CREDITWORTHY_CONFIDENCE
  ) {
    return "candidate_strength_not_creditworthy";
  }
  if (!candidate.classifierReasonCodes.includes(`matched_${candidate.topic}`)) {
    return "candidate_missing_topic_reason_code";
  }
  const article13RejectReason = article13DisclosureRejectReason(candidate.evidenceText, candidate.topic, {
    mode: "multilingual_classifier",
  });
  if (
    article13RejectReason === "insufficient_row_specific_terms" &&
    isPrivacyContextContactChannelCandidate(candidate)
  ) {
    return null;
  }
  return article13RejectReason;
}

function isPrivacyContextContactChannelCandidate(candidate: GdprTransparencyTopicCandidate) {
  return (
    (candidate.topic === "controller_contact" || candidate.topic === "dpo_contact") &&
    candidate.matchStrength === "equivalent" &&
    candidate.matchedLocale === "en" &&
    candidate.matchedTerm === "you can contact us at" &&
    candidate.classifierReasonCodes.includes("variant_requires_privacy_context") &&
    /\byou can contact us at\b.{0,160}\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(candidate.evidenceText)
  );
}

function rejectReasonToDiscardedArticle13Reason(
  reason: GdprTransparencyAdapterRejectReason,
): Article13DiscardRejectReason | null {
  switch (reason) {
    case "page_chrome_or_navigation":
    case "table_of_contents_only":
    case "insufficient_row_specific_terms":
    case "generic_storage_not_retention":
    case "code_or_non_policy_excerpt":
    case "low_confidence_or_ambiguous":
      return reason;
    default:
      return null;
  }
}

function policySurfaceLooksUsable(
  surface: Pick<PolicySurfaceObservation, "textExcerpt">,
) {
  const excerpt = normalizeArticle13Whitespace(surface.textExcerpt ?? "");
  return excerpt.length === 0 || (
    !looksLikeArticle13CodeOrConfigText(excerpt) &&
    !looksLikeArticle13PageChrome(excerpt, { mode: "multilingual_classifier" }) &&
    !looksLikeArticle13TableOfContents(excerpt, { mode: "multilingual_classifier" })
  );
}

function resolvedSurfaceUrl(input: GdprTransparencyTopicEvidenceAdapterInput) {
  return input.pageUrl ?? input.surface.normalizedUrl ?? input.surface.url ?? undefined;
}

function boundedEvidence(value: string) {
  return normalizeArticle13Whitespace(value).slice(0, 640);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
