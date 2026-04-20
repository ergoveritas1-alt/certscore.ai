const SOURCE_TYPES = ["document_source", "page_evidence", "signal_hit"] as const;
const CLAIM_TYPES = [
  "earnings_claim",
  "return_performance_claim",
  "guaranteed_outcome_claim",
  "simulated_performance_claim",
  "superlative_claim",
  "pricing_fee_claim",
  "urgency_conversion_claim",
  "other",
  "none"
] as const;
const CONTEXT_TYPES = [
  "financial_offer",
  "subscription_offer",
  "pricing_page",
  "checkout_offer",
  "lead_generation_offer",
  "marketing_page",
  "legal_disclosure",
  "other",
  "unknown"
] as const;
const DISCLOSURE_TYPES = [
  "risk_disclosure",
  "earnings_disclaimer",
  "simulation_disclaimer",
  "pricing_terms",
  "fee_schedule",
  "eligibility_or_conditions",
  "other",
  "none"
] as const;

export type FinancialCommercialClaimCandidateInput = {
  adjacentAfter: string | null;
  adjacentBefore: string | null;
  blockHeading: string | null;
  blockText: string;
  candidateSignals: string[];
  pageType: string | null;
  pageUrl: string | null;
  sourceType: (typeof SOURCE_TYPES)[number];
};

export type FinancialCommercialClaimClassification = {
  adjacentDisclosurePresent: boolean;
  adjacentDisclosureText: string | null;
  adjacentDisclosureType: (typeof DISCLOSURE_TYPES)[number] | null;
  claimPresent: boolean;
  claimText: string | null;
  claimType: (typeof CLAIM_TYPES)[number];
  commercialContext: boolean;
  confidence: number;
  contextType: (typeof CONTEXT_TYPES)[number];
  feeDisclosurePresent: boolean;
  guaranteeLanguage: boolean;
  pricingPresent: boolean;
  rationaleShort: string;
  simulatedPerformanceLanguage: boolean;
  superlativeLanguage: boolean;
  urgencyPresent: boolean;
  urgencyTiedToConversion: boolean;
};

type SafeParseResult<T> = { success: true; data: T } | { success: false; error: Error };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isBoolean(value: unknown) {
  return typeof value === "boolean";
}

function isConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function createSchema<T>(validator: (value: unknown) => T) {
  return {
    parse(value: unknown) {
      return validator(value);
    },
    safeParse(value: unknown): SafeParseResult<T> {
      try {
        return { success: true, data: validator(value) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error("Schema validation failed.")
        };
      }
    }
  };
}

function validateCandidateInput(value: unknown): FinancialCommercialClaimCandidateInput {
  if (!value || typeof value !== "object") {
    throw new Error("Financial commercial claim candidate input must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.blockText !== "string" || record.blockText.trim().length < 20) {
    throw new Error("Candidate blockText must be a non-empty string.");
  }
  if (!SOURCE_TYPES.includes(record.sourceType as FinancialCommercialClaimCandidateInput["sourceType"])) {
    throw new Error("Unsupported candidate sourceType.");
  }
  if (!isStringArray(record.candidateSignals)) {
    throw new Error("candidateSignals must be a string array.");
  }
  if (!isNullableString(record.blockHeading) || !isNullableString(record.adjacentBefore) || !isNullableString(record.adjacentAfter)) {
    throw new Error("Candidate heading and adjacent context fields must be string|null.");
  }
  if (!isNullableString(record.pageType) || !isNullableString(record.pageUrl)) {
    throw new Error("Candidate pageType/pageUrl must be string|null.");
  }

  return {
    adjacentAfter: typeof record.adjacentAfter === "string" ? record.adjacentAfter : null,
    adjacentBefore: typeof record.adjacentBefore === "string" ? record.adjacentBefore : null,
    blockHeading: typeof record.blockHeading === "string" ? record.blockHeading : null,
    blockText: record.blockText.trim(),
    candidateSignals: record.candidateSignals,
    pageType: typeof record.pageType === "string" ? record.pageType : null,
    pageUrl: typeof record.pageUrl === "string" ? record.pageUrl : null,
    sourceType: record.sourceType as FinancialCommercialClaimCandidateInput["sourceType"]
  };
}

function validateClassificationOutput(value: unknown): FinancialCommercialClaimClassification {
  if (!value || typeof value !== "object") {
    throw new Error("Financial commercial claim classification must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (!isBoolean(record.claimPresent)) {
    throw new Error("claimPresent must be boolean.");
  }
  if (!CLAIM_TYPES.includes(record.claimType as FinancialCommercialClaimClassification["claimType"])) {
    throw new Error("Unsupported claimType.");
  }
  if (!isNullableString(record.claimText)) {
    throw new Error("claimText must be string|null.");
  }
  if (!isBoolean(record.commercialContext)) {
    throw new Error("commercialContext must be boolean.");
  }
  if (!CONTEXT_TYPES.includes(record.contextType as FinancialCommercialClaimClassification["contextType"])) {
    throw new Error("Unsupported contextType.");
  }
  if (!isBoolean(record.adjacentDisclosurePresent)) {
    throw new Error("adjacentDisclosurePresent must be boolean.");
  }
  if (
    record.adjacentDisclosureType !== null &&
    !DISCLOSURE_TYPES.includes(
      record.adjacentDisclosureType as Exclude<FinancialCommercialClaimClassification["adjacentDisclosureType"], null>
    )
  ) {
    throw new Error("Unsupported adjacentDisclosureType.");
  }
  if (!isNullableString(record.adjacentDisclosureText)) {
    throw new Error("adjacentDisclosureText must be string|null.");
  }
  if (
    !isBoolean(record.guaranteeLanguage) ||
    !isBoolean(record.superlativeLanguage) ||
    !isBoolean(record.simulatedPerformanceLanguage) ||
    !isBoolean(record.urgencyPresent) ||
    !isBoolean(record.urgencyTiedToConversion) ||
    !isBoolean(record.pricingPresent) ||
    !isBoolean(record.feeDisclosurePresent)
  ) {
    throw new Error("Classification booleans are missing.");
  }
  if (!isConfidence(record.confidence)) {
    throw new Error("confidence must be between 0 and 1.");
  }
  if (typeof record.rationaleShort !== "string" || record.rationaleShort.trim().length === 0) {
    throw new Error("rationaleShort must be a non-empty string.");
  }

  return {
    adjacentDisclosurePresent: record.adjacentDisclosurePresent,
    adjacentDisclosureText: typeof record.adjacentDisclosureText === "string" ? record.adjacentDisclosureText : null,
    adjacentDisclosureType:
      record.adjacentDisclosureType === null
        ? null
        : (record.adjacentDisclosureType as FinancialCommercialClaimClassification["adjacentDisclosureType"]),
    claimPresent: record.claimPresent,
    claimText: typeof record.claimText === "string" ? record.claimText : null,
    claimType: record.claimType as FinancialCommercialClaimClassification["claimType"],
    commercialContext: record.commercialContext,
    confidence: record.confidence as number,
    contextType: record.contextType as FinancialCommercialClaimClassification["contextType"],
    feeDisclosurePresent: record.feeDisclosurePresent,
    guaranteeLanguage: record.guaranteeLanguage,
    pricingPresent: record.pricingPresent,
    rationaleShort: record.rationaleShort.trim(),
    simulatedPerformanceLanguage: record.simulatedPerformanceLanguage,
    superlativeLanguage: record.superlativeLanguage,
    urgencyPresent: record.urgencyPresent,
    urgencyTiedToConversion: record.urgencyTiedToConversion
  };
}

export const financialCommercialClaimCandidateInputSchema = createSchema(validateCandidateInput);
export const financialCommercialClaimClassificationSchema = createSchema(validateClassificationOutput);

export function buildFinancialCommercialClaimPrompt(input: FinancialCommercialClaimCandidateInput) {
  const payload = financialCommercialClaimCandidateInputSchema.parse(input);

  return [
    "You classify narrow website text blocks for CertScore's Financial & Commercial Claims Risk detector.",
    "This is not a legal conclusion task.",
    "Do not describe content as fraudulent, deceptive, unlawful, or non-compliant.",
    "Only classify observable text and nearby disclosure patterns.",
    "Work conservatively.",
    "If the block is not clearly financial or commercial in context, return commercialContext=false and claimPresent=false unless a concrete pricing or conversion-risk pattern is directly visible.",
    "Only treat adjacent disclosure as present when balancing language is actually visible in the block or immediately adjacent context.",
    "Only tie urgency to conversion when the urgency language appears connected to a signup, purchase, subscribe, apply, enroll, or similar CTA.",
    "Return strict JSON only.",
    "Use these enums exactly:",
    `claimType: ${CLAIM_TYPES.join(", ")}`,
    `contextType: ${CONTEXT_TYPES.join(", ")}`,
    `adjacentDisclosureType: ${DISCLOSURE_TYPES.join(", ")}`,
    "",
    "Return JSON in exactly this shape:",
    JSON.stringify(
      {
        claimPresent: true,
        claimType: "earnings_claim",
        claimText: "Earn up to $5,000 per month",
        commercialContext: true,
        contextType: "subscription_offer",
        adjacentDisclosurePresent: false,
        adjacentDisclosureType: null,
        adjacentDisclosureText: null,
        guaranteeLanguage: false,
        superlativeLanguage: false,
        simulatedPerformanceLanguage: false,
        urgencyPresent: true,
        urgencyTiedToConversion: true,
        pricingPresent: false,
        feeDisclosurePresent: false,
        confidence: 0.88,
        rationaleShort: "Earnings-style claim near signup CTA without nearby balancing language."
      },
      null,
      2
    ),
    "",
    "Classification guidance:",
    "- claimText should be the shortest exact quoted snippet that best captures the claim or pressure language.",
    "- Use claimType=none when no qualifying claim or pressure pattern is present.",
    "- superlativeLanguage covers unqualified superiority claims such as best, #1, highest returns, safest, or lowest fees.",
    "- pricingPresent means pricing, plan, fee, cost, billing, rate, or charge language is visible in the focus block.",
    "- feeDisclosurePresent means the focus block or immediately adjacent context clearly explains fees, pricing terms, rates, or material conditions.",
    "",
    "Input JSON:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}
