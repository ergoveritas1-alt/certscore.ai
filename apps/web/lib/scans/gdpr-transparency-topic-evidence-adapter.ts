import {
  article13DisclosureRejectReason,
  looksLikeArticle13CodeOrConfigText,
  looksLikeArticle13PageChrome,
  looksLikeArticle13TableOfContents,
  normalizeArticle13Whitespace,
  normalizeGdprTransparencyText,
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
  evidenceSource:
    | "gdpr_transparency_topic_candidate"
    | "canonical_retained_article13_signal";
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
  | "candidate_missing_topic_reason_code"
  | "candidate_topic_invariants_failed";

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
  > & Partial<Pick<PolicySurfaceObservation, "article13DisclosureSignals">>;
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

const PRIVACY_CONTEXT_BOUND_DISCLOSURE_TOPICS = new Set<Article13DisclosureType>([
  "automated_decision_making_or_profiling",
  "data_retention",
  "data_subject_rights",
  "international_transfers",
  "legal_basis",
  "processing_purposes",
  "recipients_or_vendor_categories",
  "supervisory_authority",
]);

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
    const candidateRejectReason = rejectReasonForCandidate(input, candidate);
    const retainedSignal = candidateRejectReason
      ? boundCanonicalRetainedSignal(input, candidate)
      : null;
    const rejectReason = retainedSignal ? null : candidateRejectReason;
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

    const evidenceText = boundedEvidence(
      retainedSignal?.selectedPolicySectionExcerpt ??
        retainedSignal?.evidenceText ??
        candidate.evidenceText,
    );
    acceptedProductionSignals.push({
      classifierProvenance: candidate.classifierProvenance,
      classifierReasonCodes: uniqueStrings(candidate.classifierReasonCodes).slice(0, 16),
      confidence: candidate.confidence,
      disclosureType: candidate.topic,
      evidenceSource: retainedSignal
        ? "canonical_retained_article13_signal"
        : "gdpr_transparency_topic_candidate",
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

function boundCanonicalRetainedSignal(
  input: GdprTransparencyTopicEvidenceAdapterInput,
  candidate: GdprTransparencyTopicCandidate,
) {
  const surfaceUrl = resolvedSurfaceUrl(input);
  return (input.surface.article13DisclosureSignals ?? []).find((signal) => {
    if (
      signal.disclosureType !== candidate.topic ||
      signal.status !== "observed" ||
      signal.selectedEvidenceStrength !== "strong"
    ) {
      return false;
    }
    const signalUrl = signal.selectedPolicySectionUrl;
    if (!surfaceUrl || !signalUrl || !samePolicyUrl(surfaceUrl, signalUrl)) {
      return false;
    }
    const evidenceText =
      signal.selectedPolicySectionExcerpt ?? signal.evidenceText ?? "";
    return Boolean(evidenceText) &&
      article13DisclosureRejectReason(evidenceText, candidate.topic, {
        mode: "retained_report",
      }) === null &&
      !candidateMatchesKnownCrossTopicFalsePositive({
        ...candidate,
        evidenceText,
      });
  }) ?? null;
}

function samePolicyUrl(left: string, right: string) {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return value.trim().replace(/\/$/, "").toLowerCase();
    }
  };
  return normalize(left) === normalize(right);
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
  if (candidateMatchesKnownCrossTopicFalsePositive(candidate)) {
    return "candidate_topic_invariants_failed";
  }
  if (
    article13RejectReason === "insufficient_row_specific_terms" &&
    isContextBoundCanonicalCandidate(candidate)
  ) {
    return null;
  }
  return article13RejectReason;
}

function isContextBoundCanonicalCandidate(candidate: GdprTransparencyTopicCandidate) {
  if (
    !PRIVACY_CONTEXT_BOUND_DISCLOSURE_TOPICS.has(candidate.topic) ||
    !candidate.classifierReasonCodes.some((reasonCode) =>
      reasonCode === "variant_requires_privacy_context" || reasonCode === "variant_requires_topic_context"
    )
  ) {
    return false;
  }
  const evidenceText = normalizeGdprTransparencyText(candidate.evidenceText);
  const matchedTerm = normalizeGdprTransparencyText(candidate.matchedTerm);
  return matchedTerm.length >= 8 && evidenceText.includes(matchedTerm);
}

function candidateMatchesKnownCrossTopicFalsePositive(candidate: GdprTransparencyTopicCandidate) {
  const text = normalizeArticle13Whitespace(candidate.evidenceText);
  switch (candidate.topic) {
    case "controller_contact":
      return (
        (candidate.matchedLocale === "en" &&
          /^(?:data controller|data controller contact|controller operator of data|controller of data|questions about this privacy policy|questions about this policy please contact us|if you have questions about this policy please contact us|you can contact us at)$/i.test(candidate.matchedTerm) &&
          !(
            /\b(?:data controller|controller of (?:the )?(?:personal )?data|controller is|is the controller)\b/i.test(text) &&
            /(?:@|\bemail\b|\be-mail\b|\bpostal\b|\baddress\b|\bphone\b|\btelephone\b|\bcontact\b)/i.test(text)
          )) ||
        (candidate.matchedLocale === "en" &&
          /\bdata controller\s+(?:means|is defined as|refers to)\b/i.test(text)) ||
        (candidate.matchedLocale === "ru" &&
          candidate.matchedTerm === "оператор персональных данных" &&
          !(
            /оператор(?:ом)? персональных данных.{0,180}(?:@|e-?mail|электронн(?:ая|ой) почт|почтов(?:ый|ого) адрес|телефон|контакт|связаться)/iu.test(text) ||
            /(?:@|e-?mail|электронн(?:ая|ой) почт|почтов(?:ый|ого) адрес|телефон|контакт|связаться).{0,180}оператор(?:ом)? персональных данных/iu.test(text) ||
            /оператор(?:ом)? персональных данных\s*(?:(?:является|выступает)\s+|[-—–:]\s*)(?:ооо|ао|пао|зао|ип|[«"])/iu.test(text) ||
            /(?:ооо|ао|пао|зао|ип|[«"])[^.!?]{0,180}(?:является|выступает)\s+оператор(?:ом)? персональных данных/iu.test(text)
          )) ||
        (candidate.matchedLocale === "fr" &&
          /(?:le client|l['’]etablissement scolaire).{0,120}responsable du traitement|n['’]est pas responsable du traitement/iu.test(text)) ||
        (candidate.matchedLocale === "ja" &&
          (!/(?:連絡|お問い合わせ|e-?mail|メール|住所|電話)/iu.test(text) ||
            (text.match(/\||-->|トップ|ニュース|ログイン|料金|事例/gu) ?? []).length >= 5)) ||
        (candidate.matchedLocale === "it" &&
          /(?:finalità probatorie|secondo la relativa definizione contenuta)/iu.test(text)) ||
        (candidate.matchedLocale === "pl" &&
          /administratorem danych osobowych kandydata jest firma sandvik/iu.test(text) &&
          !/(?:@|e-?mail|telefon|adres\s+(?:pocztowy|siedziby))/iu.test(text)) ||
        (candidate.matchedLocale === "lt" &&
          /yra asmens duomenų valdytojas.{0,180}užtikrinantis/iu.test(text) &&
          !/(?:@|el\.\s*pašt|telefon|adresas|susisiekti)/iu.test(text))
      );
    case "processing_purposes":
      return (
        (candidate.matchedLocale === "ru" &&
          /определя(?:ет|ющие) цели обработки персональных данных.{0,240}персональные данные\s*[—–-]/iu.test(text)) ||
        (candidate.matchedLocale === "it" &&
          /cookie ed altri strumenti di tracciamento/iu.test(text) &&
          !/(?:al fine di|allo scopo di|per (?:fornire|erogare|gestire|migliorare|rispondere|proteggere))/iu.test(text))
      );
    case "data_retention":
      return candidate.matchedLocale === "it" &&
        /privacy policy del singolo social network/iu.test(text);
    case "data_subject_rights":
      return (
        (candidate.matchedLocale === "en" &&
          /\b(?:may|might) (?:mean )?(?:you|individuals?|data subjects?) have certain rights\b/i.test(text) &&
          !/\b(?:access|delete|erasure|rectification|correct|object|restrict|portability|complaint)\b/i.test(text)) ||
        (candidate.matchedLocale === "it" && /nel rispetto dei diritti degli interessati/iu.test(text)) ||
        (candidate.matchedLocale === "lt" && /užtikrina duomenų subjekto teises/iu.test(text))
      );
    case "international_transfers":
      return candidate.matchedLocale === "en" &&
        /\b(?:does not|doesn['’]t|did not|didn['’]t) describe\b.{0,100}\btransfer/i.test(text);
    default:
      return false;
  }
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
