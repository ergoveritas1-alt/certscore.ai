import { z } from "zod";
import type {
  ClaimType,
  EvidenceArtifactCollection,
  EvidencePacket,
  SanitizationResult,
  SanitizedFinding,
  ScanFinding,
  ValidationResult
} from "./types";

const bannedReplacementRules: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  {
    pattern: /\bcompliant\b/gi,
    replacement: "aligned",
    reason: "Replace verdict-style legal language with conservative wording."
  },
  {
    pattern: /\bnon-?compliant\b/gi,
    replacement: "not fully substantiated by observable evidence",
    reason: "Replace legal-failure phrasing with evidence-bound wording."
  },
  {
    pattern: /\bpasses\b/gi,
    replacement: "shows",
    reason: "Avoid pass or fail framing in customer-facing language."
  }
];

const rejectionPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bviolates?\b/gi, reason: "Legal violation language is prohibited." },
  { pattern: /\bviolation\b/gi, reason: "Legal violation language is prohibited." },
  { pattern: /\bunlawful\b/gi, reason: "Legal verdict language is prohibited." },
  { pattern: /\billegal\b/gi, reason: "Legal verdict language is prohibited." },
  { pattern: /\bcertified\b/gi, reason: "Certification claims are prohibited." },
  { pattern: /\bin-?scope\b/gi, reason: "Scanner output must not claim a company is legally in scope." },
  { pattern: /\bfails law\b/gi, reason: "Pass or fail legal framing is prohibited." },
  { pattern: /\bmeets legal requirements\b/gi, reason: "Legal conclusion language is prohibited." },
  { pattern: /\b(ada|wcag|eaa)\s+compliant\b/gi, reason: "Framework compliance claims are prohibited." },
  { pattern: /\b(ada|wcag|eaa)\s+non-?compliant\b/gi, reason: "Framework non-compliance claims are prohibited." }
];

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeProhibitedLanguage(text: string): SanitizationResult {
  let sanitized = text;
  const reasons: string[] = [];
  let changed = false;

  for (const rule of bannedReplacementRules) {
    if (rule.pattern.test(sanitized)) {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      reasons.push(rule.reason);
      changed = true;
    }
  }

  sanitized = collapseWhitespace(sanitized);

  const rejectionReasons = rejectionPatterns
    .filter((rule) => rule.pattern.test(sanitized))
    .map((rule) => rule.reason);

  return {
    changed,
    originalText: text,
    rejected: rejectionReasons.length > 0,
    reasons: [...reasons, ...rejectionReasons],
    sanitizedText: sanitized
  };
}

function sanitizeStringArray(values: string[]) {
  const reasons: string[] = [];
  let changed = false;
  let rejected = false;
  const sanitizedValues = values.map((value) => {
    const result = sanitizeProhibitedLanguage(value);
    changed = changed || result.changed;
    rejected = rejected || result.rejected;
    reasons.push(...result.reasons);
    return result.sanitizedText;
  });

  return { changed, rejected, reasons, sanitizedValues };
}

// Legal-verdict language is blocked before storage or display because the
// product is intentionally limited to observable evidence and posture review.
// Allowing verdict-style phrasing here would create an avoidable credibility
// and legal-overclaim risk downstream.
export function sanitizeFindingObject(finding: ScanFinding): SanitizedFinding {
  const title = sanitizeProhibitedLanguage(finding.title);
  const summary = sanitizeProhibitedLanguage(finding.summary);
  const observations = sanitizeStringArray(finding.observations);
  const whatWasTested = sanitizeStringArray(finding.whatWasTested);
  const limitations = sanitizeStringArray(finding.limitations);
  const recommendedReview = finding.recommendedReview ? sanitizeProhibitedLanguage(finding.recommendedReview) : null;
  const confidenceReason = finding.confidenceReason ? sanitizeProhibitedLanguage(finding.confidenceReason) : null;

  const rejected =
    title.rejected ||
    summary.rejected ||
    observations.rejected ||
    whatWasTested.rejected ||
    limitations.rejected ||
    Boolean(recommendedReview?.rejected) ||
    Boolean(confidenceReason?.rejected);

  const reasons = [
    ...title.reasons,
    ...summary.reasons,
    ...observations.reasons,
    ...whatWasTested.reasons,
    ...limitations.reasons,
    ...(recommendedReview?.reasons ?? []),
    ...(confidenceReason?.reasons ?? [])
  ];

  return {
    changed:
      title.changed ||
      summary.changed ||
      observations.changed ||
      whatWasTested.changed ||
      limitations.changed ||
      Boolean(recommendedReview?.changed) ||
      Boolean(confidenceReason?.changed),
    finding: {
      ...finding,
      confidenceReason: confidenceReason?.sanitizedText ?? finding.confidenceReason,
      limitations: limitations.sanitizedValues,
      observations: observations.sanitizedValues,
      recommendedReview: recommendedReview?.sanitizedText ?? finding.recommendedReview,
      summary: summary.sanitizedText,
      title: title.sanitizedText,
      whatWasTested: whatWasTested.sanitizedValues
    },
    reasons,
    rejected
  };
}

function collectStrings(value: unknown, path = "finding"): string[] {
  if (typeof value === "string") {
    return [`${path}: ${value}`];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStrings(entry, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => collectStrings(entry, `${path}.${key}`));
  }

  return [];
}

export function validateNoProhibitedLanguage(finding: ScanFinding): ValidationResult {
  const errors = collectStrings(finding).flatMap((entry) => {
    const [, value = ""] = entry.split(": ", 2);
    const result = sanitizeProhibitedLanguage(value);
    return result.rejected ? [`${entry} -> ${result.reasons.join("; ")}`] : [];
  });

  return {
    errors,
    ok: errors.length === 0
  };
}

const urlSchema = z.string().url();
const timestampSchema = z.string().datetime({ offset: true });

const evidencePacketSchema: z.ZodType<EvidencePacket> = z.object({
  cookies: z.array(
    z.object({
      domain: z.string().optional(),
      id: z.string().min(1),
      name: z.string().min(1),
      notes: z.string().optional(),
      pageUrl: urlSchema,
      path: z.string().optional(),
      phase: z.enum(["before_choice", "after_choice", "signal_enabled", "signal_disabled"]).optional(),
      timestamp: timestampSchema
    })
  ),
  domSnapshots: z.array(
    z.object({
      excerpt: z.string().optional(),
      id: z.string().min(1),
      pageUrl: urlSchema,
      selector: z.string().optional(),
      timestamp: timestampSchema
    })
  ),
  networkEvents: z.array(
    z.object({
      category: z.string().optional(),
      id: z.string().min(1),
      method: z.string().optional(),
      notes: z.string().optional(),
      pageUrl: urlSchema,
      phase: z.enum(["before_choice", "after_choice", "signal_enabled", "signal_disabled"]).optional(),
      requestUrl: urlSchema.optional(),
      timestamp: timestampSchema,
      vendor: z.string().optional()
    })
  ),
  pageUrls: z.array(urlSchema).min(1),
  screenshots: z.array(
    z.object({
      caption: z.string().optional(),
      id: z.string().min(1),
      pageUrl: urlSchema,
      timestamp: timestampSchema,
      url: urlSchema
    })
  ),
  sessionLogs: z.array(
    z.object({
      eventType: z.string().min(1),
      id: z.string().min(1),
      message: z.string().min(1),
      pageUrl: urlSchema.optional(),
      timestamp: timestampSchema
    })
  ),
  storageWrites: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().optional(),
      notes: z.string().optional(),
      pageUrl: urlSchema,
      phase: z.enum(["before_choice", "after_choice", "signal_enabled", "signal_disabled"]).optional(),
      storageType: z.enum(["localStorage", "sessionStorage", "indexedDB"]),
      timestamp: timestampSchema
    })
  )
});

const claimTypeSchema: z.ZodType<ClaimType> = z.enum([
  "surface_presence",
  "surface_absence",
  "observable_behavior",
  "behavior_inconsistency",
  "claim_vs_behavior_gap",
  "readiness_not_evident",
  "manual_review_recommended"
]);

export const scanFindingSchema: z.ZodType<ScanFinding> = z
  .object({
    claimType: claimTypeSchema,
    confidence: z.enum(["high", "medium", "low"]),
    confidenceReason: z.string().min(1).optional(),
    evidence: evidencePacketSchema,
    findingId: z.string().min(1) as z.ZodType<ScanFinding["findingId"]>,
    generatedAt: timestampSchema,
    limitations: z.array(z.string().min(1)).min(1),
    module: z.string().min(1),
    observations: z.array(z.string().min(1)).min(1),
    pillar: z.string().min(1),
    recommendedReview: z.string().min(1).optional(),
    regulatoryMappings: z
      .array(
        z.object({
          citationKey: z.string().min(1),
          framework: z.string().min(1),
          jurisdiction: z.string().min(1),
          mappingType: z.literal("relevance_mapping"),
          notes: z.string().optional()
        })
      )
      .min(1),
    reproduction: z.object({
      comparedAgainstControl: z.boolean().optional(),
      repeatability: z.enum(["consistent", "partially_consistent", "not_retested", "inconsistent"]),
      sessionCount: z.number().int().nonnegative(),
      testConditions: z.array(z.string().min(1)).min(1)
    }),
    reviewerOnly: z.boolean().optional(),
    scanRunId: z.string().min(1),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    summary: z.string().min(1),
    title: z.string().min(1),
    whatWasTested: z.array(z.string().min(1)).min(1)
  })
  .superRefine((finding, ctx) => {
    const hasScreenshot = finding.evidence.screenshots.length > 0;
    const hasDom = finding.evidence.domSnapshots.length > 0;
    const hasBehaviorSupport =
      finding.evidence.networkEvents.length > 0 ||
      finding.evidence.cookies.length > 0 ||
      finding.evidence.storageWrites.length > 0 ||
      finding.evidence.sessionLogs.length > 0 ||
      finding.evidence.domSnapshots.length > 0;

    if (finding.evidence.pageUrls.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one page URL is required." });
    }

    if (
      (finding.claimType === "surface_presence" || finding.claimType === "surface_absence") &&
      !(hasScreenshot || hasDom)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Surface presence and absence findings require screenshot or DOM evidence."
      });
    }

    if (
      (finding.claimType === "observable_behavior" || finding.claimType === "readiness_not_evident") &&
      !(hasScreenshot || hasDom) &&
      !hasBehaviorSupport
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Behavior findings require rendered evidence and at least one supporting behavior artifact."
      });
    }

    if (finding.claimType === "claim_vs_behavior_gap") {
      const hasClaimExcerpt = finding.evidence.domSnapshots.some((entry) => typeof entry.excerpt === "string" && entry.excerpt.trim().length > 0);
      if (!hasClaimExcerpt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Claim-vs-behavior findings require exact public claim text in DOM evidence."
        });
      }
      if (!hasBehaviorSupport) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Claim-vs-behavior findings require concrete behavior evidence."
        });
      }
    }

    if (finding.claimType === "manual_review_recommended" && !finding.recommendedReview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual-review findings require recommended review text."
      });
    }

    if (finding.confidence === "low" && !finding.reviewerOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Low-confidence findings must be reviewer-only."
      });
    }
  });

export function validateFindingSchema(finding: ScanFinding): ValidationResult {
  const parsed = scanFindingSchema.safeParse(finding);
  return {
    errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
    ok: parsed.success
  };
}

export function buildEvidenceRefs(artifacts: EvidenceArtifactCollection): EvidencePacket {
  return {
    cookies: artifacts.cookies ?? [],
    domSnapshots: artifacts.domSnapshots ?? [],
    networkEvents: artifacts.networkEvents ?? [],
    pageUrls: artifacts.pageUrls ?? [],
    screenshots: artifacts.screenshots ?? [],
    sessionLogs: artifacts.sessionLogs ?? [],
    storageWrites: artifacts.storageWrites ?? []
  };
}
