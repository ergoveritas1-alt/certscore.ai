function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      return uniqueStrings(record[key] as string[]);
    }
  }

  return [] as string[];
}

function getFirstString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "string") {
      const value = String(record[key]).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

export type FinancialValidationFindingId =
  | "legal_entity_name_present"
  | "operator_contact_path_present"
  | "investment_risk_disclosure_present"
  | "fee_disclosure_present"
  | "past_performance_disclaimer_present"
  | "apr_or_interest_rate_disclosure_present";

export type FinancialValidationEvidenceCategory =
  | "operator_identity"
  | "operator_contact"
  | "risk_disclosure"
  | "fee_disclosure"
  | "performance_disclaimer"
  | "rate_disclosure";

export type FinancialJudgeVerdict = "confirm" | "keep_audit_only" | "suppress";

export type FinancialEvidenceStrength = "thin" | "moderate" | "strong";

export type FinancialPageClassification =
  | "financial_offer"
  | "quasi_financial_offer"
  | "pricing_or_fees"
  | "disclosure_or_legal"
  | "identity_or_contact"
  | "unknown";

export type FinancialValidationSpec = {
  evidenceCategory: FinancialValidationEvidenceCategory;
  findingId: FinancialValidationFindingId;
  requiredSignalKeys: string[];
};

export type FinancialValidationEvidenceBundle = {
  exactMatchTerm: string | null;
  matchedPhrases: string[];
  pageClassification: FinancialPageClassification;
  pageUrl: string | null;
  signalKeys: string[];
  snippets: string[];
  sourceUrls: string[];
  supportingHeadings: string[];
};

export type FinancialJudgeInput = {
  candidateFindingId: FinancialValidationFindingId;
  evidence: FinancialValidationEvidenceBundle;
  negativeEvidenceFlags: string[];
  scanContext: {
    domain: string | null;
    pageType: string | null;
  };
};

export type FinancialJudgeOutput = {
  buyerFacingEligible: boolean;
  confidence: number;
  evidenceStrength: FinancialEvidenceStrength;
  rationaleCode:
    | "explicit_financial_evidence"
    | "thin_single_source_evidence"
    | "non_financial_context"
    | "missing_page_attribution"
    | "missing_user_facing_url"
    | "conflicting_negative_evidence";
  retained: boolean;
  verdict: FinancialJudgeVerdict;
};

function hasConcreteHumanFacingUrl(urls: Array<string | null | undefined>) {
  return urls.some((value) => typeof value === "string" && /^https?:\/\//i.test(value));
}

export const FINANCIAL_VALIDATION_SPECS: FinancialValidationSpec[] = [
  {
    evidenceCategory: "operator_identity",
    findingId: "legal_entity_name_present",
    requiredSignalKeys: ["entity.legal_entity_name_text_present"]
  },
  {
    evidenceCategory: "operator_contact",
    findingId: "operator_contact_path_present",
    requiredSignalKeys: ["entity.contact_email_present", "entity.contact_phone_present", "entity.contact_form_present"]
  },
  {
    evidenceCategory: "risk_disclosure",
    findingId: "investment_risk_disclosure_present",
    requiredSignalKeys: ["financial.risk_disclosure_text_present", "financial.loss_risk_disclosure_text_present"]
  },
  {
    evidenceCategory: "fee_disclosure",
    findingId: "fee_disclosure_present",
    requiredSignalKeys: ["commercial.explicit_fee_disclosure_text_present"]
  },
  {
    evidenceCategory: "performance_disclaimer",
    findingId: "past_performance_disclaimer_present",
    requiredSignalKeys: ["financial.past_performance_disclaimer_text_present"]
  },
  {
    evidenceCategory: "rate_disclosure",
    findingId: "apr_or_interest_rate_disclosure_present",
    requiredSignalKeys: ["financial.apr_or_interest_rate_disclosure_text_present"]
  }
];

export function isFinancialValidationFindingId(value: string | null | undefined): value is FinancialValidationFindingId {
  return FINANCIAL_VALIDATION_SPECS.some((spec) => spec.findingId === value);
}

export function getFinancialValidationSpec(findingId: FinancialValidationFindingId) {
  return FINANCIAL_VALIDATION_SPECS.find((spec) => spec.findingId === findingId) ?? null;
}

export function classifyFinancialPage(record: Record<string, unknown> | null | undefined): FinancialPageClassification {
  const raw = getFirstString(record, ["pageClassification", "page_classification", "pageType", "page_type"])?.toLowerCase();

  if (!raw) {
    return "unknown";
  }
  if (/pricing|fee/.test(raw)) {
    return "pricing_or_fees";
  }
  if (/privacy|terms|disclosure|legal|policy/.test(raw)) {
    return "disclosure_or_legal";
  }
  if (/contact|about|support/.test(raw)) {
    return "identity_or_contact";
  }
  if (/product|offer|account|card|loan|trading|invest|savings|apy|apr/.test(raw)) {
    return "financial_offer";
  }
  if (/checkout|bnpl|installment|finance/.test(raw)) {
    return "quasi_financial_offer";
  }

  return "unknown";
}

export function getFinancialValidationEvidenceBundle(
  record: Record<string, unknown> | null | undefined
): FinancialValidationEvidenceBundle | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const pageUrl =
    getFirstString(record, ["pageUrl", "page_url"]) ??
    getStringArray(record, ["pageUrls", "page_urls"])[0] ??
    getFirstString(record, ["sourceUrl", "source_url"]) ??
    getStringArray(record, ["sourceUrls", "source_urls"])[0];
  const snippets = uniqueStrings([
    ...getStringArray(record, ["policySnippets", "policy_snippets", "snippets"]),
    getFirstString(record, ["matchedSnippet", "matched_snippet"])
  ]);
  const matchedPhrases = uniqueStrings([
    ...getStringArray(record, ["matchedPhrases", "matched_phrases"]),
    getFirstString(record, ["matchedPhrase", "matched_phrase"]),
    getFirstString(record, ["matchedTerm", "matched_term"]),
    getFirstString(record, ["matchedRateTerm", "matched_rate_term"]),
    getFirstString(record, ["matchedRegulatoryToken", "matched_regulatory_token"])
  ]);
  const supportingHeadings = uniqueStrings([
    ...getStringArray(record, ["supportingHeadings", "supporting_headings"]),
    getFirstString(record, ["surroundingHeading", "surrounding_heading"])
  ]);
  const signalKeys = uniqueStrings([
    ...getStringArray(record, ["supportingSignals", "supporting_signals"]),
    getFirstString(record, ["signalKey", "signal_key"])
  ]);
  const sourceUrls = uniqueStrings([
    ...getStringArray(record, ["sourceUrls", "source_urls"]),
    pageUrl
  ]);

  const hasContent =
    Boolean(pageUrl) ||
    snippets.length > 0 ||
    matchedPhrases.length > 0 ||
    signalKeys.length > 0 ||
    supportingHeadings.length > 0;

  if (!hasContent) {
    return null;
  }

  return {
    exactMatchTerm: matchedPhrases[0] ?? null,
    matchedPhrases,
    pageClassification: classifyFinancialPage(record),
    pageUrl,
    signalKeys,
    snippets,
    sourceUrls,
    supportingHeadings
  };
}

export function evaluateFinancialJudgeInput(input: FinancialJudgeInput): FinancialJudgeOutput {
  const spec = getFinancialValidationSpec(input.candidateFindingId);
  const negativeFlags = new Set(input.negativeEvidenceFlags);
  const hasRequiredSignal = (spec?.requiredSignalKeys ?? []).some((key) => input.evidence.signalKeys.includes(key));
  const hasSnippet = input.evidence.snippets.length > 0;
  const hasUrl = hasConcreteHumanFacingUrl([input.evidence.pageUrl, ...input.evidence.sourceUrls]);
  const classification = input.evidence.pageClassification;
  const hasExplicitFinancialContext =
    classification === "financial_offer" ||
    classification === "quasi_financial_offer" ||
    classification === "pricing_or_fees" ||
    classification === "disclosure_or_legal" ||
    (input.candidateFindingId === "legal_entity_name_present" || input.candidateFindingId === "operator_contact_path_present") &&
      classification === "identity_or_contact";

  if (!hasRequiredSignal) {
    return {
      buyerFacingEligible: false,
      confidence: 0.2,
      evidenceStrength: "thin",
      rationaleCode: "thin_single_source_evidence",
      retained: false,
      verdict: "suppress"
    };
  }

  if (negativeFlags.has("non_financial_context")) {
    return {
      buyerFacingEligible: false,
      confidence: 0.15,
      evidenceStrength: "thin",
      rationaleCode: "non_financial_context",
      retained: false,
      verdict: "suppress"
    };
  }

  if (!hasExplicitFinancialContext) {
    return {
      buyerFacingEligible: false,
      confidence: 0.2,
      evidenceStrength: "thin",
      rationaleCode: "non_financial_context",
      retained: false,
      verdict: "suppress"
    };
  }

  if (!hasUrl) {
    return {
      buyerFacingEligible: false,
      confidence: 0.35,
      evidenceStrength: hasSnippet ? "moderate" : "thin",
      rationaleCode: "missing_user_facing_url",
      retained: true,
      verdict: "keep_audit_only"
    };
  }

  if (!hasSnippet) {
    return {
      buyerFacingEligible: false,
      confidence: 0.35,
      evidenceStrength: "thin",
      rationaleCode: "missing_page_attribution",
      retained: true,
      verdict: "keep_audit_only"
    };
  }

  return {
    buyerFacingEligible: true,
    confidence: 0.7,
    evidenceStrength: "strong",
    rationaleCode: "explicit_financial_evidence",
    retained: true,
    verdict: "confirm"
  };
}
