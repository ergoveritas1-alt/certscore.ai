function formatLabelSegment(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ValidationFindingFamilyId =
  | "accessibility_review"
  | "cookie_runtime_review"
  | "financial_review"
  | "policy_runtime_review"
  | "policy_review_queue"
  | "section_review"
  | "uncategorized";

export type ValidationFindingSource =
  | "cookie_runtime"
  | "financial_signal"
  | "policy_runtime"
  | "policy_enrichment"
  | "policy_review_queue"
  | "supplemental_validation"
  | "snapshot_accessibility"
  | "unknown";

export type ValidationFindingScope = "page" | "runtime" | "site" | "unknown";

export type ValidationFindingSubject = "accessibility" | "disclosure" | "privacy" | "unknown";

export type ValidationFindingTaxonomy = {
  familyId: ValidationFindingFamilyId | string;
  familyLabel: string;
  scope: ValidationFindingScope | string;
  source: ValidationFindingSource | string;
  subject: ValidationFindingSubject | string;
};

export function deriveValidationFindingTaxonomy(input: {
  category?: string | null;
  ruleKey?: string | null;
  subtype?: string | null;
}): ValidationFindingTaxonomy {
  const rulePrefix = input.ruleKey?.split(".", 1)[0] ?? null;

  if (rulePrefix === "scan_report_review" || input.subtype === "policy_review_queue") {
    return {
      familyId: "policy_review_queue",
      familyLabel: "Policy Review Queue",
      scope: "page",
      source: "policy_review_queue",
      subject: "disclosure"
    };
  }

  if (rulePrefix === "section_review") {
    return {
      familyId: "section_review",
      familyLabel: "Section Review",
      scope: "page",
      source: "supplemental_validation",
      subject: "disclosure"
    };
  }

  if (rulePrefix === "policy_runtime") {
    return {
      familyId: "policy_runtime_review",
      familyLabel: "Policy Runtime Review",
      scope: "page",
      source: "policy_runtime",
      subject: "disclosure"
    };
  }

  if (rulePrefix === "cookie_runtime") {
    return {
      familyId: "cookie_runtime_review",
      familyLabel: "Cookie Runtime Review",
      scope: "page",
      source: "cookie_runtime",
      subject: "disclosure"
    };
  }

  if (rulePrefix === "financial_review") {
    return {
      familyId: "financial_review",
      familyLabel: "Financial Review",
      scope: "page",
      source: "financial_signal",
      subject: "disclosure"
    };
  }

  if (rulePrefix === "accessibility_review") {
    return {
      familyId: "accessibility_review",
      familyLabel: "Accessibility Review",
      scope: "site",
      source: "snapshot_accessibility",
      subject: "accessibility"
    };
  }

  const fallback = input.category ?? input.subtype ?? rulePrefix ?? "uncategorized";
  return {
    familyId: fallback,
    familyLabel: formatLabelSegment(fallback),
    scope: "unknown",
    source: "unknown",
    subject: "unknown"
  };
}

export function getValidationFindingFamily(input: {
  category?: string | null;
  findingFamily?: string | null;
  ruleKey?: string | null;
  subtype?: string | null;
}) {
  const derived = deriveValidationFindingTaxonomy(input);
  const familyId = input.findingFamily ?? derived.familyId;
  return {
    id: familyId,
    label: familyId === derived.familyId ? derived.familyLabel : formatLabelSegment(familyId)
  };
}
