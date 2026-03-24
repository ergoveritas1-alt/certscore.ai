import type { PolicyReviewVerdict } from "./types/snapshots";

type PolicyReviewDispositionLabel = "confirmed" | "dismissed" | "inconclusive" | "needs legal review" | "unknown";
type PolicyPageType = "privacy_policy" | "terms_of_service" | "cookie_policy" | "unknown" | string;

type PolicyReviewNoteTemplate = {
  disputedClaim?: string;
  supportedClaim: string;
  verificationStep: string;
};

const SUBSTANTIVE_PAGE_LEVEL_REASONS = new Set([
  "missing_dsar_high_exposure",
  "no_dsar_mechanism",
  "session_replay_detected_without_disclosure",
  "session_replay_without_disclosure_detected"
]);

const POLICY_REVIEW_NOTE_TEMPLATES: Record<string, PolicyReviewNoteTemplate> = {
  low_confidence_critical_fields: {
    supportedClaim: "the policy extraction contains low-confidence or incomplete critical fields",
    disputedClaim: "the underlying compliance issue from the extracted data alone",
    verificationStep: "direct policy-text verification"
  },
  missing_dsar_high_exposure: {
    supportedClaim: "the policy may lack a clearly identified DSAR mechanism",
    disputedClaim: "that no access, deletion, or privacy-request path is available",
    verificationStep: "direct policy-text verification"
  },
  no_dsar_mechanism: {
    supportedClaim: "the policy may lack a clearly identified DSAR or privacy-request mechanism",
    disputedClaim: "that no DSAR or privacy-request path is available",
    verificationStep: "direct policy-text verification"
  },
  policy_behavior_conflict_candidate: {
    supportedClaim: "a potential mismatch between observed site behavior and the policy language",
    disputedClaim: "that the observed behavior definitively contradicts the policy as written",
    verificationStep: "direct policy-text and runtime-evidence verification"
  },
  session_replay_detected_without_disclosure: {
    supportedClaim: "a session replay vendor or similar replay tooling is likely present",
    disputedClaim: "that the behavior is undisclosed in the site's privacy disclosures",
    verificationStep: "direct policy-text verification"
  },
  session_replay_without_disclosure_detected: {
    supportedClaim: "a session replay vendor or similar replay tooling is likely present",
    disputedClaim: "that the behavior is undisclosed in the site's privacy disclosures",
    verificationStep: "direct policy-text verification"
  }
};

function resolvePolicyReviewNoteTemplate(reason: string) {
  const directMatch = POLICY_REVIEW_NOTE_TEMPLATES[reason];
  if (directMatch) {
    return directMatch;
  }

  if (/^clarity_risk_\d+$/.test(reason)) {
    return {
      supportedClaim: "the page was assigned an elevated policy clarity-risk score",
      verificationStep: "direct policy-text verification"
    } satisfies PolicyReviewNoteTemplate;
  }

  return null;
}

function policyReviewDispositionLabel(reviewVerdict: PolicyReviewVerdict | null | undefined): PolicyReviewDispositionLabel {
  switch (reviewVerdict) {
    case "confirmed":
      return "confirmed";
    case "dismissed":
      return "dismissed";
    case "needs_legal_review":
      return "needs legal review";
    case "unknown":
      return "unknown";
    case "needs_followup":
    case null:
    case undefined:
      return "inconclusive";
    default:
      return "inconclusive";
  }
}

function shouldDowngradeToInconclusive(input: {
  pageType?: PolicyPageType | null;
  reason: string;
  reviewVerdict?: PolicyReviewVerdict | null;
}) {
  if (input.reviewVerdict !== "confirmed") {
    return false;
  }

  if (!SUBSTANTIVE_PAGE_LEVEL_REASONS.has(input.reason)) {
    return false;
  }

  return input.pageType !== "privacy_policy";
}

export function resolvePolicyReviewVerdict(input: {
  pageType?: PolicyPageType | null;
  reason: string | null | undefined;
  reviewVerdict?: PolicyReviewVerdict | null;
}) {
  const reason = typeof input.reason === "string" ? input.reason : "";
  const reviewVerdict = input.reviewVerdict ?? null;

  if (shouldDowngradeToInconclusive({ pageType: input.pageType, reason, reviewVerdict })) {
    return {
      reviewVerdict: "needs_followup" as const,
      verdictOverriddenByScopeGuardrail: true
    };
  }

  return {
    reviewVerdict,
    verdictOverriddenByScopeGuardrail: false
  };
}

export function normalizePolicyReviewNote(note: string | null | undefined) {
  if (typeof note !== "string") {
    return null;
  }

  const normalized = note.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildStandardPolicyReviewNote(input: {
  pageType?: PolicyPageType | null;
  reason: string | null | undefined;
  reviewVerdict?: PolicyReviewVerdict | null;
}) {
  const reason = typeof input.reason === "string" ? input.reason : "";
  const template = resolvePolicyReviewNoteTemplate(reason);

  if (!template) {
    return null;
  }

  const resolvedVerdict = resolvePolicyReviewVerdict({
    pageType: input.pageType,
    reason,
    reviewVerdict: input.reviewVerdict
  });
  const disposition = policyReviewDispositionLabel(resolvedVerdict.reviewVerdict);
  const firstSentence = template.disputedClaim
    ? `Technical evidence suggests ${template.supportedClaim}, but the record does not clearly establish ${template.disputedClaim}.`
    : `Technical evidence suggests ${template.supportedClaim}.`;

  return [
    firstSentence,
    `This finding is best marked ${disposition} pending ${template.verificationStep}.`
  ].join(" ");
}

export function resolvePolicyReviewNote(input: {
  pageType?: PolicyPageType | null;
  reason: string | null | undefined;
  reviewVerdict?: PolicyReviewVerdict | null;
  reviewerNotes?: string | null;
}) {
  const normalizedProvided = normalizePolicyReviewNote(input.reviewerNotes);
  const resolvedVerdict = resolvePolicyReviewVerdict({
    pageType: input.pageType,
    reason: input.reason,
    reviewVerdict: input.reviewVerdict
  });
  const standardNote = buildStandardPolicyReviewNote({
    pageType: input.pageType,
    reason: input.reason,
    reviewVerdict: resolvedVerdict.reviewVerdict
  });

  return {
    reviewerNotes: normalizedProvided ?? standardNote,
    standardNote,
    reviewVerdict: resolvedVerdict.reviewVerdict,
    verdictOverriddenByScopeGuardrail: resolvedVerdict.verdictOverriddenByScopeGuardrail
  };
}
