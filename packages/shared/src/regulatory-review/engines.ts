import { REGULATORY_FINDING_DEFINITIONS } from "./registry";
import { buildEvidenceRefs, sanitizeFindingObject, validateFindingSchema, validateNoProhibitedLanguage } from "./safety";
import type {
  ClaimType,
  Confidence,
  ConfidenceResult,
  CustomerFacingFinding,
  CustomerFacingRegulatoryReviewOutput,
  EvidencePacket,
  GapFinding,
  InternalRegulatoryReviewOutput,
  ObservableBehavior,
  PublicClaim,
  RegulatoryReviewArtifacts,
  ReproductionInfo,
  ScanFinding,
  ScanMethodology,
  Severity,
  SeverityResult
} from "./types";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getEvidenceTypeCount(evidence: EvidencePacket) {
  return [
    evidence.screenshots.length > 0,
    evidence.domSnapshots.length > 0,
    evidence.networkEvents.length > 0,
    evidence.cookies.length > 0,
    evidence.storageWrites.length > 0,
    evidence.sessionLogs.length > 0
  ].filter(Boolean).length;
}

function getBehaviorContradictionFlag(finding: Pick<ScanFinding, "observations">) {
  return finding.observations.some((entry) => /contradict|unclear|ambiguous|inconsistent/i.test(entry));
}

export function computeFindingConfidence(
  finding: Pick<ScanFinding, "claimType" | "observations" | "reproduction">,
  evidence: EvidencePacket
): ConfidenceResult {
  const evidenceTypes = getEvidenceTypeCount(evidence);
  const pageCount = new Set(evidence.pageUrls).size;
  const contradiction = getBehaviorContradictionFlag(finding);
  const sessionCount = finding.reproduction.sessionCount;
  const repeatability = finding.reproduction.repeatability;

  if (evidenceTypes >= 2 && (pageCount >= 2 || sessionCount >= 2) && repeatability === "consistent" && !contradiction) {
    return {
      confidence: "high",
      confidenceReason:
        "High confidence because two or more independent evidence types support the same observable claim across repeated pages or sessions without contradictory evidence.",
      evidenceQuality: "strong"
    };
  }

  if (
    (evidenceTypes >= 2 && !contradiction) ||
    (evidenceTypes >= 1 && repeatability === "consistent") ||
    repeatability === "partially_consistent"
  ) {
    return {
      confidence: "medium",
      confidenceReason:
        "Medium confidence because the finding is supported by at least one strong evidence type with supporting context, but breadth or repeatability remains limited.",
      evidenceQuality: evidenceTypes >= 2 ? "moderate" : "weak"
    };
  }

  return {
    confidence: "low",
    confidenceReason:
      "Low confidence because the finding relies on limited or ambiguous evidence, incomplete rendering, contradictory signals, or a single weak observation.",
    evidenceQuality: "weak"
  };
}

type SeverityContext = {
  breadth?: number;
  contradictionImportance?: "material" | "moderate" | "limited";
  defaultSeverity?: Severity;
  flowCriticality?: "core" | "important" | "secondary";
  repeatability?: ReproductionInfo["repeatability"];
};

const severityWeight: Record<Severity, number> = {
  critical: 5,
  high: 4,
  info: 1,
  low: 2,
  medium: 3
};

const weightedSeverity = (weight: number): Severity => {
  if (weight >= 5) {
    return "critical";
  }
  if (weight >= 4) {
    return "high";
  }
  if (weight >= 3) {
    return "medium";
  }
  if (weight >= 2) {
    return "low";
  }
  return "info";
};

export function computeFindingSeverity(
  finding: Pick<ScanFinding, "claimType" | "findingId">,
  context: SeverityContext = {}
): SeverityResult {
  const definition = REGULATORY_FINDING_DEFINITIONS[finding.findingId];
  let weight = severityWeight[context.defaultSeverity ?? definition.defaultSeverity];

  if (context.flowCriticality === "core") {
    weight += 1;
  } else if (context.flowCriticality === "secondary") {
    weight -= 1;
  }

  if ((context.breadth ?? 0) >= 3) {
    weight += 1;
  }

  if (context.repeatability === "inconsistent") {
    weight -= 1;
  }

  if (finding.claimType === "claim_vs_behavior_gap" && context.contradictionImportance === "material") {
    weight += 1;
  }

  const severity = weightedSeverity(Math.max(1, Math.min(weight, 5)));
  return {
    rationale:
      "Severity reflects observable materiality based on flow criticality, breadth across pages, repeatability, and the importance of any public claim mismatch rather than any legal conclusion.",
    severity
  };
}

export function buildLimitations(module: string, findingType: ClaimType, context: { claimGap?: boolean } = {}) {
  const limitations = [
    "Result reflects publicly observable website behavior under tested conditions only.",
    "Internal server-side processing and internal compliance controls cannot be confirmed from external scanning alone.",
    "Dynamic, authenticated, geofenced, or region-specific behavior may differ outside the tested conditions."
  ];

  if (/privacy/i.test(module)) {
    limitations.push(
      "Observed tracking behavior reflects tested browser sessions and may not represent all jurisdictions, devices, or logged-in states."
    );
  }

  if (/accessibility/i.test(module)) {
    limitations.push(
      "Automated testing can identify many accessibility barriers, but does not alone determine conformance with WCAG or legal requirements.",
      "Manual review is recommended for complete accessibility evaluation."
    );
  }

  if (findingType === "claim_vs_behavior_gap" || context.claimGap) {
    limitations.push("Observed behavior may vary depending on region, account state, or untested user flows.");
  }

  return limitations;
}

export function generateConservativeSummary(finding: Pick<ScanFinding, "claimType" | "title" | "observations">) {
  const lead = finding.observations[0] ?? "Observable evidence was retained for follow-up review.";

  switch (finding.claimType) {
    case "surface_absence":
      return `${finding.title}. Based on publicly observable behavior during the scan, the expected surface was not evident under the tested conditions.`;
    case "surface_presence":
      return `${finding.title}. A relevant public surface was observed and evidence was retained for reviewer follow-up.`;
    case "observable_behavior":
      return `Automated testing identified observable behavior relevant to ${finding.title.toLowerCase()}; ${lead.toLowerCase()}`;
    case "readiness_not_evident":
      return `${finding.title}. Readiness was not evident from the retained public evidence and manual review may be warranted.`;
    case "claim_vs_behavior_gap":
      return `${finding.title}. Public claim language may be inconsistent with behavior observed during the scan.`;
    case "manual_review_recommended":
      return `${finding.title}. Automated evidence suggests a potential issue on tested flows, and manual review is recommended.`;
    case "behavior_inconsistency":
      return `${finding.title}. The retained evidence suggests behavior changed across tested conditions and may warrant review.`;
  }
}

export function extractPublicClaims(scanArtifacts: Pick<RegulatoryReviewArtifacts, "claims"> | { claims?: PublicClaim[] }): PublicClaim[] {
  return scanArtifacts.claims ?? [];
}

function includesKeyword(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function detectClaimBehaviorGaps(claims: PublicClaim[], behaviors: ObservableBehavior[]): GapFinding[] {
  return claims.flatMap((claim) => {
    if (!claim.text.trim()) {
      return [];
    }

    const relatedBehaviors = behaviors.filter((behavior) => {
      if (behavior.kind !== claim.kind) {
        return false;
      }

      if (behavior.contradictsClaim) {
        return true;
      }

      const privacyKeywords = ["opt out", "reject", "privacy choice", "sell", "share", "tracking"];
      const accessibilityKeywords = ["accessible", "screen reader", "keyboard", "wcag", "assistive"];
      const keywords = claim.kind === "privacy" ? privacyKeywords : accessibilityKeywords;
      return includesKeyword(claim.text, keywords) && includesKeyword(behavior.summary, keywords);
    });

    if (relatedBehaviors.length === 0) {
      return [];
    }

    return [
      {
        claimSourceUrl: claim.sourceUrl,
        claimText: claim.text,
        kind: claim.kind,
        limitationNote: "Observed behavior may vary depending on region, account state, or untested user flows.",
        observedBehaviorEvidenceRefs: uniqueStrings(relatedBehaviors.flatMap((behavior) => behavior.evidenceRefs)),
        observedBehaviorSummary: uniqueStrings(relatedBehaviors.map((behavior) => behavior.summary)).join(" ")
      }
    ];
  });
}

export function determineReviewerOnly(confidence: Confidence, evidenceQuality: ConfidenceResult["evidenceQuality"]) {
  return confidence === "low" || evidenceQuality === "weak";
}

export function finalizeFinding(finding: ScanFinding) {
  const sanitized = sanitizeFindingObject(finding);
  const schemaValidation = validateFindingSchema(sanitized.finding);
  const languageValidation = validateNoProhibitedLanguage(sanitized.finding);

  return {
    finding: sanitized.finding,
    validation: {
      errors: [...(sanitized.rejected ? sanitized.reasons : []), ...schemaValidation.errors, ...languageValidation.errors],
      ok: !sanitized.rejected && schemaValidation.ok && languageValidation.ok
    }
  };
}

export function toCustomerFacingFinding(finding: ScanFinding): CustomerFacingFinding | null {
  if (finding.reviewerOnly) {
    return null;
  }

  const sanitized = sanitizeFindingObject(finding);
  if (sanitized.rejected) {
    return null;
  }

  return {
    findingId: finding.findingId,
    limitations: sanitized.finding.limitations,
    summary: sanitized.finding.summary,
    suggestedFollowUp: sanitized.finding.recommendedReview,
    title: sanitized.finding.title,
    whatWasObserved: sanitized.finding.observations,
    whereObserved: uniqueStrings(sanitized.finding.evidence.pageUrls),
    whyItMayMatter:
      finding.claimType === "manual_review_recommended"
        ? "The retained evidence suggests users may encounter a material issue on tested flows and a reviewer should confirm impact."
        : "The retained evidence may indicate a posture gap that merits follow-up review under the tested conditions."
  };
}

export function buildInternalRegulatoryReviewOutput(input: {
  findings: ScanFinding[];
  methodology: ScanMethodology;
}): InternalRegulatoryReviewOutput {
  return {
    findings: input.findings,
    generatedAt: input.methodology.generatedAt,
    methodology: input.methodology,
    scanRunId: input.methodology.scanRunId
  };
}

export function buildCustomerFacingRegulatoryReviewOutput(input: {
  findings: ScanFinding[];
  methodology: ScanMethodology;
  methodologySummary: string;
}): CustomerFacingRegulatoryReviewOutput {
  return {
    findings: input.findings.flatMap((finding) => {
      const surfaced = toCustomerFacingFinding(finding);
      return surfaced ? [surfaced] : [];
    }),
    generatedAt: input.methodology.generatedAt,
    methodologySummary: input.methodologySummary,
    scanRunId: input.methodology.scanRunId
  };
}

export function toReproductionInfo(artifacts: RegulatoryReviewArtifacts): ReproductionInfo {
  return {
    comparedAgainstControl: artifacts.comparedAgainstControl,
    repeatability: artifacts.repeatability ?? "not_retested",
    sessionCount: artifacts.sessionCount ?? 1,
    testConditions: artifacts.testConditions ?? ["Public website scan using retained browser artifacts."]
  };
}

export function baseFindingFromDefinition(input: {
  evidence?: EvidencePacket;
  finding: Omit<ScanFinding, "confidence" | "confidenceReason" | "reviewerOnly" | "severity" | "summary" | "evidence">;
  flowCriticality?: SeverityContext["flowCriticality"];
  breadth?: number;
  contradictionImportance?: SeverityContext["contradictionImportance"];
}) {
  const evidence = input.evidence ?? buildEvidenceRefs({ pageUrls: [] });
  const confidence = computeFindingConfidence(
    {
      claimType: input.finding.claimType,
      observations: input.finding.observations,
      reproduction: input.finding.reproduction
    },
    evidence
  );
  const severity = computeFindingSeverity(
    {
      claimType: input.finding.claimType,
      findingId: input.finding.findingId
    },
    {
      breadth: input.breadth ?? new Set(evidence.pageUrls).size,
      contradictionImportance: input.contradictionImportance,
      flowCriticality: input.flowCriticality,
      repeatability: input.finding.reproduction.repeatability
    }
  );

  const built: ScanFinding = {
    ...input.finding,
    confidence: confidence.confidence,
    confidenceReason: confidence.confidenceReason,
    evidence,
    reviewerOnly: determineReviewerOnly(confidence.confidence, confidence.evidenceQuality),
    severity: severity.severity,
    summary: generateConservativeSummary({
      claimType: input.finding.claimType,
      observations: input.finding.observations,
      title: input.finding.title
    })
  };

  return finalizeFinding(built);
}
