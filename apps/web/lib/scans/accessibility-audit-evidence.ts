import { accessibilityAuditProjectionSchema, type AccessibilityAuditObservation, type AccessibilityAuditProjection } from "@certscore/contracts";

export function readAccessibilityAudit(value: unknown, scanId?: string): AccessibilityAuditProjection | null {
  const result = accessibilityAuditProjectionSchema.safeParse(value);
  return result.success && (scanId === undefined || result.data.observation.scanId === scanId) ? result.data : null;
}

/** Bounded public status. A zero failure count describes this automated run only. */
export function projectAccessibilityAuditSummary(value: unknown, scanId?: string) {
  if (value === undefined || value === null) return null;
  const projection = readAccessibilityAudit(value, scanId);
  if (!projection) return { status: "limited" as const, required: true as const, scope: "starting_page_rendered_content" as const,
    engine: "axe-core" as const, engineVersion: null, durationMs: null, failedRuleCount: null, affectedNodeCount: null, reviewRuleCount: null };
  const audit = projection.observation;
  return { status: audit.status, required: audit.required, scope: audit.scope, engine: audit.engine, engineVersion: audit.engineVersion,
    durationMs: audit.durationMs, failedRuleCount: audit.rulesEvaluated.length ? audit.violations.length : null,
    affectedNodeCount: audit.rulesEvaluated.length ? audit.violations.reduce((sum, rule) => sum + rule.nodeCount, 0) : null,
    reviewRuleCount: audit.rulesEvaluated.length ? audit.reviewItems.length : null };
}

/** Compatibility rows are derived once from typed observations, never from scores or counts alone. */
export function accessibilityExamples(observation?: AccessibilityAuditObservation) {
  return (observation?.violations ?? []).map(rule => ({
    ruleCode: rule.ruleId, ruleGroup: rule.tags.filter(tag => /^wcag/.test(tag)).join(", "),
    impact: rule.impact, severity: rule.impact === "critical" || rule.impact === "serious" ? "high" : rule.impact === "moderate" ? "medium" : "low",
    help: rule.help, helpUrl: rule.helpUrl, description: rule.description, pageUrl: observation!.documentUrl,
    nodeCount: rule.nodeCount, representativeNodes: rule.representativeNodes.map(node => ({
      ...node, selectors: node.selectors.map(selector => Array.isArray(selector) ? selector.join(" >>> ") : selector),
    })),
    representativeSelectors: rule.representativeNodes.flatMap(node => node.selectors.map(selector => Array.isArray(selector) ? selector.join(" >>> ") : selector)).slice(0, 5),
  }));
}
