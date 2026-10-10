import { z } from "zod";

export const ACCESSIBILITY_AUDIT_VERSION = "certscore.accessibility-audit.v1" as const;
export const ACCESSIBILITY_AUDIT_BUDGET_MS = 8_000;
export const ACCESSIBILITY_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;
export const ACCESSIBILITY_LIMITS = { rules: 100, examplesPerRule: 5, selectorsPerNode: 8, evidenceBytes: 256 * 1024 } as const;

const selectorSchema = z.union([z.string().min(1).max(400), z.array(z.string().min(1).max(400)).min(1).max(8)]);
const nodeSchema = z.object({
  selectors: z.array(selectorSchema).min(1).max(ACCESSIBILITY_LIMITS.selectorsPerNode),
  htmlSnippet: z.string().min(1).max(500),
  failureSummary: z.string().min(1).max(800),
  // Opaque identities share one audit/document scope; no DOM text or attributes.
  imageLinkIdentity: z.object({
    contractVersion: z.literal("certscore.accessibility-image-link-identity.v1"),
    nodeId: z.number().int().positive().max(1_000_000),
    imageOnlyLinkId: z.number().int().positive().max(1_000_000).nullable(),
  }).strict().optional(),
  colorContrast: z.object({
    foregroundColor: z.string().max(40).optional(), backgroundColor: z.string().max(40).optional(),
    contrastRatio: z.number().nonnegative().optional(), requiredContrastRatio: z.number().nonnegative().optional(),
    fontSize: z.string().max(40).optional(), fontWeight: z.string().max(40).optional(),
  }).optional(),
}).strict();
export const accessibilityRuleObservationSchema = z.object({
  ruleId: z.string().min(1).max(100),
  impact: z.enum(["minor", "moderate", "serious", "critical"]).nullable(),
  tags: z.array(z.string().max(80)).max(24),
  help: z.string().max(300), description: z.string().max(600),
  helpUrl: z.string().url().max(400).refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "dequeuniversity.com" && !url.username && !url.password;
    } catch { return false; }
  }),
  nodeCount: z.number().int().positive().max(1_000_000),
  representativeNodes: z.array(nodeSchema).min(1).max(ACCESSIBILITY_LIMITS.examplesPerRule),
}).strict().refine(rule => rule.representativeNodes.length <= rule.nodeCount, "Examples exceed the observed node count.");

export const accessibilityAuditObservationSchema = z.object({
  contractVersion: z.literal(ACCESSIBILITY_AUDIT_VERSION), required: z.literal(true),
  scanId: z.string().min(1).max(160), sourceLane: z.literal("runtime_evidence"),
  scope: z.literal("starting_page_rendered_content"),
  documentUrl: z.string().url().max(2000), documentToken: z.string().min(1).max(200).nullable(),
  engine: z.literal("axe-core"), engineVersion: z.string().min(1).max(40),
  configuredTags: z.array(z.enum(ACCESSIBILITY_WCAG_TAGS)).length(ACCESSIBILITY_WCAG_TAGS.length),
  status: z.enum(["completed", "limited", "failed", "not_testable"]),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative().max(ACCESSIBILITY_AUDIT_BUDGET_MS + 2000),
  rulesEvaluated: z.array(z.string().min(1).max(100)).max(ACCESSIBILITY_LIMITS.rules),
  violations: z.array(accessibilityRuleObservationSchema).max(ACCESSIBILITY_LIMITS.rules),
  reviewItems: z.array(accessibilityRuleObservationSchema).max(ACCESSIBILITY_LIMITS.rules),
  limitations: z.array(z.string().max(120)).max(16),
}).strict().superRefine((audit, ctx) => {
  if (Date.parse(audit.completedAt) < Date.parse(audit.startedAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Audit timing is reversed." });
  if (new Set(audit.configuredTags).size !== ACCESSIBILITY_WCAG_TAGS.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete configured WCAG tags." });
  if ((audit.status === "completed" || audit.violations.length > 0 || audit.reviewItems.length > 0) && (!audit.documentToken || !audit.rulesEvaluated.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Completed evidence requires a bound document and evaluated rules." });
  if (audit.status === "completed" && (audit.limitations.length || audit.reviewItems.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unresolved coverage cannot be complete." });
  if ((audit.status === "failed" || audit.status === "not_testable") && (audit.violations.length || audit.reviewItems.length || audit.rulesEvaluated.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failed audits cannot supply results." });
  const evaluated = new Set(audit.rulesEvaluated);
  if (evaluated.size !== audit.rulesEvaluated.length ||
      new Set(audit.violations.map(rule => rule.ruleId)).size !== audit.violations.length ||
      new Set(audit.reviewItems.map(rule => rule.ruleId)).size !== audit.reviewItems.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate evaluated or result rule." });
  }
  if ([...audit.violations, ...audit.reviewItems].some(rule => !evaluated.has(rule.ruleId))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Result rule was not evaluated." });
});
export type AccessibilityAuditObservation = z.infer<typeof accessibilityAuditObservationSchema>;
export type AccessibilityRuleObservation = z.infer<typeof accessibilityRuleObservationSchema>;

const startingPageAccessibilityProjectionSchema = z.object({
  contractVersion: z.literal("certscore.accessibility-audit-projection.v1"),
  verificationStatus: z.literal("verified"), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRef: z.literal("CanonicalEvidenceBundle.json#accessibilityAudit"),
  observation: accessibilityAuditObservationSchema,
}).strict();
const additionalPageAccessibilityProjectionSchema = z.object({
  contractVersion: z.literal("certscore.accessibility-audit-projection.v2"),
  verificationStatus: z.literal("verified"), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  parentScanId: z.string().min(1), pageId: z.string().uuid(), attemptId: z.string().uuid(), configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRef: z.string(), observation: accessibilityAuditObservationSchema,
}).strict().superRefine((projection, ctx) => {
  if (projection.observation.scanId !== projection.pageId ||
    projection.evidenceRef !== `full-site:${projection.pageId}:${projection.attemptId}:evidence.json#accessibilityAudit`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Additional accessibility evidence identity mismatch" });
  }
});
export const accessibilityAuditProjectionSchema = z.union([startingPageAccessibilityProjectionSchema, additionalPageAccessibilityProjectionSchema]);
export type AccessibilityAuditProjection = z.infer<typeof accessibilityAuditProjectionSchema>;

/** Historical records without this contract retain their original status. Malformed new evidence fails closed. */
export function isAccessibilityAuditLimited(value: unknown, scanId?: string) {
  if (value === undefined || value === null) return false;
  const result = accessibilityAuditProjectionSchema.safeParse(value);
  return !result.success || (scanId !== undefined && result.data.observation.scanId !== scanId) || result.data.observation.status !== "completed";
}
