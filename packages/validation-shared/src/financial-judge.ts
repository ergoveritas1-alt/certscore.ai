const CANDIDATE_FINDING_IDS = [
  "legal_entity_name_present",
  "operator_contact_path_present",
  "investment_risk_disclosure_present",
  "fee_disclosure_present",
  "past_performance_disclaimer_present",
  "apr_or_interest_rate_disclosure_present"
] as const;

const PAGE_CLASSIFICATIONS = [
  "financial_offer",
  "quasi_financial_offer",
  "pricing_or_fees",
  "disclosure_or_legal",
  "identity_or_contact",
  "unknown"
] as const;

const JUDGE_VERDICTS = ["confirm", "keep_audit_only", "suppress"] as const;
const EVIDENCE_STRENGTHS = ["thin", "moderate", "strong"] as const;
const RATIONALE_CODES = [
  "explicit_financial_evidence",
  "thin_single_source_evidence",
  "non_financial_context",
  "missing_page_attribution",
  "missing_user_facing_url",
  "conflicting_negative_evidence"
] as const;

export type FinancialJudgeInput = {
  candidateFindingId: (typeof CANDIDATE_FINDING_IDS)[number];
  evidence: {
    exactMatchTerm: string | null;
    matchedPhrases: string[];
    pageClassification: (typeof PAGE_CLASSIFICATIONS)[number];
    pageUrl: string | null;
    signalKeys: string[];
    snippets: string[];
    sourceUrls: string[];
    supportingHeadings: string[];
  };
  negativeEvidenceFlags: string[];
  scanContext: {
    domain: string | null;
    pageType: string | null;
  };
};

export type FinancialJudgeOutput = {
  buyerFacingEligible: boolean;
  confidence: number;
  evidenceStrength: (typeof EVIDENCE_STRENGTHS)[number];
  rationaleCode: (typeof RATIONALE_CODES)[number];
  retained: boolean;
  verdict: (typeof JUDGE_VERDICTS)[number];
};

type SafeParseResult<T> = { success: true; data: T } | { success: false; error: Error };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeFinancialJudgeVerdict(value: unknown): FinancialJudgeOutput["verdict"] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "confirm":
    case "supported":
    case "support":
    case "eligible":
      return "confirm";
    case "keep_audit_only":
    case "audit_only":
    case "keep_audit":
    case "inconclusive":
    case "uncertain":
    case "review":
      return "keep_audit_only";
    case "suppress":
    case "not_supported":
    case "reject":
    case "discard":
      return "suppress";
    default:
      return null;
  }
}

function normalizeEvidenceStrength(value: unknown): FinancialJudgeOutput["evidenceStrength"] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "thin":
    case "weak":
      return "thin";
    case "moderate":
    case "medium":
      return "moderate";
    case "strong":
    case "high":
      return "strong";
    default:
      return null;
  }
}

function normalizeRationaleCode(value: unknown): FinancialJudgeOutput["rationaleCode"] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "explicit_financial_evidence":
      return "explicit_financial_evidence";
    case "thin_single_source_evidence":
    case "weak_single_source_evidence":
      return "thin_single_source_evidence";
    case "non_financial_context":
    case "nonfinancial_context":
      return "non_financial_context";
    case "missing_page_attribution":
      return "missing_page_attribution";
    case "missing_user_facing_url":
    case "missing_url":
      return "missing_user_facing_url";
    case "conflicting_negative_evidence":
    case "conflicting_evidence":
      return "conflicting_negative_evidence";
    default:
      return null;
  }
}

function validateFinancialJudgeInput(value: unknown): FinancialJudgeInput {
  if (!value || typeof value !== "object") {
    throw new Error("Financial judge input must be an object.");
  }

  const record = value as Record<string, unknown>;
  const evidence = record.evidence as Record<string, unknown> | undefined;
  const scanContext = record.scanContext as Record<string, unknown> | undefined;

  if (!CANDIDATE_FINDING_IDS.includes(record.candidateFindingId as FinancialJudgeInput["candidateFindingId"])) {
    throw new Error("Unsupported candidate finding id.");
  }
  if (!evidence || typeof evidence !== "object") {
    throw new Error("Financial judge input requires evidence.");
  }
  if (!PAGE_CLASSIFICATIONS.includes(evidence.pageClassification as FinancialJudgeInput["evidence"]["pageClassification"])) {
    throw new Error("Unsupported page classification.");
  }
  if (!isStringArray(evidence.matchedPhrases) || !isStringArray(evidence.signalKeys) || !isStringArray(evidence.snippets)) {
    throw new Error("Financial judge evidence arrays must contain strings.");
  }
  if (!isStringArray(evidence.sourceUrls) || !isStringArray(evidence.supportingHeadings)) {
    throw new Error("Financial judge evidence arrays must contain strings.");
  }
  if (!Array.isArray(record.negativeEvidenceFlags) || !isStringArray(record.negativeEvidenceFlags)) {
    throw new Error("negativeEvidenceFlags must be a string array.");
  }
  if (!scanContext || typeof scanContext !== "object") {
    throw new Error("scanContext is required.");
  }

  return {
    candidateFindingId: record.candidateFindingId as FinancialJudgeInput["candidateFindingId"],
    evidence: {
      exactMatchTerm: typeof evidence.exactMatchTerm === "string" ? evidence.exactMatchTerm : null,
      matchedPhrases: evidence.matchedPhrases as string[],
      pageClassification: evidence.pageClassification as FinancialJudgeInput["evidence"]["pageClassification"],
      pageUrl: typeof evidence.pageUrl === "string" ? evidence.pageUrl : null,
      signalKeys: evidence.signalKeys as string[],
      snippets: evidence.snippets as string[],
      sourceUrls: evidence.sourceUrls as string[],
      supportingHeadings: evidence.supportingHeadings as string[]
    },
    negativeEvidenceFlags: record.negativeEvidenceFlags as string[],
    scanContext: {
      domain: typeof scanContext.domain === "string" ? scanContext.domain : null,
      pageType: typeof scanContext.pageType === "string" ? scanContext.pageType : null
    }
  };
}

function validateFinancialJudgeOutput(value: unknown): FinancialJudgeOutput {
  if (!value || typeof value !== "object") {
    throw new Error("Financial judge output must be an object.");
  }

  const record = value as Record<string, unknown>;
  const verdict = normalizeFinancialJudgeVerdict(record.verdict);
  if (!verdict) {
    throw new Error("Unsupported financial judge verdict.");
  }
  if (!clampConfidence(record.confidence)) {
    throw new Error("Financial judge output confidence must be between 0 and 1.");
  }
  const evidenceStrength = normalizeEvidenceStrength(record.evidenceStrength);
  if (!evidenceStrength) {
    throw new Error("Unsupported evidence strength.");
  }
  const rationaleCode = normalizeRationaleCode(record.rationaleCode);
  if (!rationaleCode) {
    throw new Error("Unsupported rationale code.");
  }

  const retained =
    typeof record.retained === "boolean"
      ? record.retained
      : verdict === "suppress"
        ? false
        : true;
  const buyerFacingEligible =
    typeof record.buyerFacingEligible === "boolean"
      ? record.buyerFacingEligible
      : verdict === "confirm";

  return {
    buyerFacingEligible,
    confidence: record.confidence as number,
    evidenceStrength,
    rationaleCode,
    retained,
    verdict
  };
}

function createSchema<T>(validator: (value: unknown) => T) {
  return {
    parse(value: unknown) {
      return validator(value);
    },
    safeParse(value: unknown): SafeParseResult<T> {
      try {
        return {
          success: true,
          data: validator(value)
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error("Schema validation failed.")
        };
      }
    }
  };
}

export const financialJudgeInputSchema = createSchema(validateFinancialJudgeInput);
export const financialJudgeOutputSchema = createSchema(validateFinancialJudgeOutput);

const PILOT_FINDING_ORDER = [
  "fee_disclosure_present",
  "apr_or_interest_rate_disclosure_present",
  "past_performance_disclaimer_present"
] as const;

export function buildFinancialJudgePrompt(input: FinancialJudgeInput) {
  const payload = financialJudgeInputSchema.parse(input);
  const allowedIds = PILOT_FINDING_ORDER.join(", ");

  return [
    "You are CertScore's financial finding judge.",
    "Your job is to find reasons to discard or downgrade a financial-adjacent positive finding before it can be surfaced externally.",
    "Do not make legal conclusions. Evaluate only observable public-facing disclosure evidence.",
    "Work conservatively:",
    "- prefer suppressing non-financial or weakly contextual evidence",
    "- prefer keep_audit_only when evidence is real but thin",
    "- confirm only when the retained evidence is explicit, user-facing, and strongly tied to the candidate finding",
    "You must return strict JSON matching the financialJudgeOutputSchema.",
    "Do not return prose outside JSON.",
    `Current pilot findings: ${allowedIds}.`,
    "",
    "Decision rules:",
    "1. If the evidence is not clearly in a financial or quasi-financial context, return suppress.",
    "2. If there is no concrete user-facing URL or no readable snippet, return keep_audit_only unless the evidence should be discarded entirely.",
    "3. Only return confirm when the evidence is explicit, context-appropriate, and directly supports the candidate finding.",
    "4. Use rationaleCode values exactly as provided by the schema.",
    "5. verdict must be exactly one of: confirm, keep_audit_only, suppress.",
    "6. evidenceStrength must be exactly one of: thin, moderate, strong.",
    "7. rationaleCode must be exactly one of: explicit_financial_evidence, thin_single_source_evidence, non_financial_context, missing_page_attribution, missing_user_facing_url, conflicting_negative_evidence.",
    "",
    "Return JSON in exactly this shape:",
    JSON.stringify(
      {
        verdict: "keep_audit_only",
        confidence: 0.55,
        evidenceStrength: "moderate",
        rationaleCode: "thin_single_source_evidence",
        retained: true,
        buyerFacingEligible: false
      },
      null,
      2
    ),
    "",
    "Input JSON:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}
