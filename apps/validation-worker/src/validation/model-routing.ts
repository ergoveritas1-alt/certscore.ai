export type ValidationModelRoute = {
  impact: "routine" | "high";
  primaryRole: "extraction" | "review";
  reasonCodes: string[];
  escalationEligible: boolean;
};

function stringValues(value: unknown) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export function routeValidationFinding(finding: Record<string, unknown>): ValidationModelRoute {
  const evidence =
    typeof finding.evidence === "object" && finding.evidence !== null && !Array.isArray(finding.evidence)
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const normalized = [
    finding.ruleKey,
    finding.category,
    finding.title,
    finding.description,
    finding.findingFamily,
    ...stringValues(evidence.reasonCodes),
    ...stringValues(evidence.negativeEvidenceFlags),
    ...stringValues(evidence.supportingSignals)
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replaceAll("_", " ")
    .toLowerCase();
  const severity = typeof finding.severity === "string" ? finding.severity.toLowerCase() : "";
  const reasonCodes: string[] = [];

  if (severity === "critical" || severity === "high") {
    reasonCodes.push("high_severity");
  }
  if (/\b(policy|privacy|gdpr|eprivacy|legal_basis|retention|transfer|rights)\b/.test(normalized)) {
    reasonCodes.push("substantive_policy_interpretation");
  }
  if (/\b(financial|fee|apr|interest|performance|yield)\b/.test(normalized)) {
    reasonCodes.push("financial_interpretation");
  }
  if (/\b(conflict|contradict|mismatch|inconsistent|ambiguous|uncertain)\b/.test(normalized)) {
    reasonCodes.push("conflicting_or_ambiguous_evidence");
  }
  if (/\b(session[_ -]?replay|fingerprint|biometric|children|minor)\b/.test(normalized)) {
    reasonCodes.push("sensitive_or_high_impact_signal");
  }

  const requiresReview = reasonCodes.length > 0;
  const escalationEligible =
    reasonCodes.includes("high_severity") ||
    reasonCodes.includes("conflicting_or_ambiguous_evidence") ||
    reasonCodes.includes("financial_interpretation") ||
    reasonCodes.includes("sensitive_or_high_impact_signal");

  return {
    impact: escalationEligible ? "high" : "routine",
    primaryRole: requiresReview ? "review" : "extraction",
    reasonCodes: requiresReview ? reasonCodes : ["routine_taxonomy_validation"],
    escalationEligible
  };
}

export function shouldEscalateValidationVerdict(input: {
  confidence: number;
  route: ValidationModelRoute;
  verdict: "supported" | "inconclusive" | "not_supported";
}) {
  return (
    input.route.escalationEligible &&
    (input.verdict === "inconclusive" || input.confidence < 0.65)
  );
}
