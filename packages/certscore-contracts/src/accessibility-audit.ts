import {captureFailureDiagnosticSchema} from "./capture-failure-diagnostic";
import { z } from "zod";

export const ACCESSIBILITY_AUDIT_VERSION = "certscore.accessibility-audit.v1" as const;
export const ACCESSIBILITY_AUDIT_BUDGET_MS = 8_000;
export const ACCESSIBILITY_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;
export const ACCESSIBILITY_LIMITS = { rules: 100, examplesPerRule: 5, selectorsPerNode: 8, evidenceBytes: 256 * 1024 } as const;
/** Positive element findings only. Global, cross-frame and spacing rules are
 * deliberately excluded when child-frame churn prevents complete coverage. */
export const ACCESSIBILITY_MAIN_DOCUMENT_RULE_IDS = [
  "image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "button-name", "input-button-name", "link-name",
  "label", "select-name", "summary-name", "aria-command-name", "aria-input-field-name", "aria-meter-name",
  "aria-progressbar-name", "aria-toggle-field-name", "aria-tooltip-name", "aria-allowed-attr", "aria-valid-attr",
  "aria-valid-attr-value", "aria-prohibited-attr", "aria-roles", "aria-required-attr", "aria-required-parent",
  "aria-required-children", "aria-hidden-focus", "autocomplete-valid", "form-field-multiple-labels", "list",
  "listitem", "definition-list", "dlitem", "nested-interactive", "scrollable-region-focusable", "color-contrast",
  "td-headers-attr", "td-has-header", "th-has-data-cells",
] as const;

const selectorSchema = z.union([z.string().min(1).max(400), z.array(z.string().min(1).max(400)).min(1).max(8)]);
const nodeSchema = z.object({
  mainDocumentBound: z.literal(true).optional(),
  captureState: z.literal("opened_navigation_menu").optional(),
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
  executionDiagnostic: captureFailureDiagnosticSchema.optional(),
  menuInspection: z.object({
    version: z.literal("bounded_navigation_menu.v1"), documentToken: z.string().min(1).max(200),
    triggerSelector: z.string().min(1).max(400), triggerKeyboardFocusable: z.boolean(),
    capturePolicyVersion: z.literal("menu_identity.v2").optional(), triggerAccessibleName:z.string().max(160).optional(),
    expanded: z.literal(true), engineRunCount: z.literal(1),
    rulesEvaluated: z.array(z.enum(["link-name", "button-name"])).min(1).max(2),
  }).strict().optional(),
  frameCoverage: z.object({
    version: z.literal("stable_main_document_evidence.v1"), resultScope: z.literal("positive_findings_only"),
    documentToken: z.string().min(1).max(200), engineRunCount: z.literal(1),
    engineRuleCount: z.number().int().positive().max(ACCESSIBILITY_LIMITS.rules),
    changedChildFrameCount: z.number().int().nonnegative().max(10000),
    unavailableChildFrameCount: z.number().int().positive().max(10000).optional(),
    excludedNodeCount: z.number().int().nonnegative().max(200_000_000),
  }).strict().optional(),
  // Bounded examples describe retained detail, separately from engine coverage.
  // Absence on historical records does not imply this policy was applied.
  exampleCoverage: z.object({
    version: z.literal("breadth_before_detail.v1"),
    observedNodeCount: z.number().int().nonnegative().max(200_000_000),
    retainedNodeCount: z.number().int().nonnegative().max(1000),
    omittedNodeCount: z.number().int().nonnegative().max(200_000_000),
    byteBudgetLimited: z.boolean(),
  }).strict().optional(),
}).strict().superRefine((audit, ctx) => {
  if (Date.parse(audit.completedAt) < Date.parse(audit.startedAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Audit timing is reversed." });
  if (new Set(audit.configuredTags).size !== ACCESSIBILITY_WCAG_TAGS.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete configured WCAG tags." });
  if ((audit.status === "completed" || audit.violations.length > 0 || audit.reviewItems.length > 0) && (!audit.documentToken || !audit.rulesEvaluated.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Completed evidence requires a bound document and evaluated rules." });
  if (audit.status === "completed" && (audit.limitations.length || audit.reviewItems.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unresolved coverage cannot be complete." });
  if ((audit.status === "failed" || audit.status === "not_testable") && (audit.violations.length || audit.reviewItems.length || audit.rulesEvaluated.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failed audits cannot supply results." });
  const menuNodes = [...audit.violations, ...audit.reviewItems].flatMap(rule => rule.representativeNodes).filter(node => node.captureState);
  if ((audit.menuInspection && audit.menuInspection.documentToken !== audit.documentToken) ||
      menuNodes.length && !audit.menuInspection) ctx.addIssue({code: "custom", message: "Menu examples require same-document verified opening evidence."});
  if (audit.exampleCoverage) {
    const rows = [...audit.violations, ...audit.reviewItems];
    const observed = rows.reduce((sum, row) => sum + row.nodeCount, 0);
    const retained = rows.reduce((sum, row) => sum + row.representativeNodes.length, 0);
    if (audit.exampleCoverage.observedNodeCount !== observed || audit.exampleCoverage.retainedNodeCount !== retained ||
      audit.exampleCoverage.omittedNodeCount !== observed - retained) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Example coverage counts must match retained rule evidence." });
  }
  if (audit.frameCoverage) {
    const rows = [...audit.violations, ...audit.reviewItems];
    if (audit.status !== "limited" || audit.frameCoverage.documentToken !== audit.documentToken || !rows.length ||
        !(audit.limitations.includes("child_frames_changed_main_document_retained") || audit.limitations.includes("unavailable_frames_main_document_retained")) ||
        !(audit.frameCoverage.changedChildFrameCount > 0 || (audit.frameCoverage.unavailableChildFrameCount ?? 0) > 0) ||
        audit.rulesEvaluated.length !== new Set(rows.map(row => row.ruleId)).size ||
        audit.frameCoverage.engineRuleCount < audit.rulesEvaluated.length ||
        rows.some(row => !(ACCESSIBILITY_MAIN_DOCUMENT_RULE_IDS as readonly string[]).includes(row.ruleId) || row.representativeNodes.some(node => node.mainDocumentBound !== true))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Main-document subset requires bound positive rule/node evidence and limited frame coverage." });
    }
  }
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
