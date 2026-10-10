import { z } from "zod";
import { accessibilityRuleObservationSchema } from "@certscore/contracts";
import { getAccessibilityFindingIdForRuleCode, hasPromotableKeyboardAccessibilityEvidence, hasBehaviorReproducedFocusManagementEvidence } from "./accessibility-evidence";
import { SCORING_FAMILIES, SCORING_RULE_BY_ID } from "./scoring-policy";
import type { NormalizedConcernScoreEffect } from "./normalized-concerns";

export const ACCESSIBILITY_SCORE_POLICY_VERSION = "certscore.accessibility-score.v1";
export const ACCESSIBILITY_SCORE_FINDING_IDS = [
  "text_alternative_accessibility_issue", "semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue",
  "zoom_restriction_accessibility_issue", "target_size_accessibility_issue", "keyboard_navigation_accessibility_issue",
] as const;
const findingIdSchema = z.enum(ACCESSIBILITY_SCORE_FINDING_IDS);
type FindingId = z.infer<typeof findingIdSchema>;
type Overlap = "distinct" | "image_link" | "unresolved_image_link";
const provenanceSchema = z.object({
  contractVersion: z.enum(["certscore.accessibility-audit-projection.v1", "certscore.accessibility-audit-projection.v2"]), verificationStatus: z.literal("verified"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), evidenceRef: z.string().min(1),
  engine: z.literal("axe-core"), engineVersion: z.string().min(1), scanId: z.string().min(1),
  documentUrl: z.string().url(), documentToken: z.string().min(1), status: z.enum(["completed", "limited"]),
  evaluatedRules: z.array(z.string().min(1)).min(1).max(100),
}).superRefine((p, ctx) => {
  if (p.contractVersion === "certscore.accessibility-audit-projection.v1" ? p.evidenceRef !== "CanonicalEvidenceBundle.json#accessibilityAudit"
    : !(z.string().uuid().safeParse(p.scanId).success && p.evidenceRef.startsWith(`full-site:${p.scanId}:`) &&
      /:[0-9a-f-]{36}:evidence\.json#accessibilityAudit$/.test(p.evidenceRef))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid accessibility evidence reference" });
  }
});

function readExample(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const parsed = accessibilityRuleObservationSchema.safeParse({
    ruleId: row.ruleCode, impact: row.impact, tags: typeof row.ruleGroup === "string" ? row.ruleGroup.split(", ") : [],
    help: row.help, description: row.description, helpUrl: row.helpUrl, nodeCount: row.nodeCount,
    representativeNodes: row.representativeNodes,
  });
  return parsed.success ? { ...parsed.data, pageUrl: row.pageUrl } : null;
}

function hasMeasuredTargetFailure(summary: string) {
  const size = summary.match(/insufficient size \((\d+(?:\.\d+)?)px by (\d+(?:\.\d+)?)px/);
  const space = summary.match(/diameter of (\d+(?:\.\d+)?)px/);
  return Boolean(size && space && /insufficient space/.test(summary) &&
    (Number(size[1]) < 24 || Number(size[2]) < 24) && Number(space[1]) < 24);
}

/** Score only the verified audit concern, never compatibility counts or display prominence. */
export function buildAccessibilityScoreEffects(findingId: string, raw: Record<string, unknown> | null | undefined): NormalizedConcernScoreEffect[] {
  const id = findingIdSchema.safeParse(findingId);
  const proof = provenanceSchema.safeParse(raw?.accessibilityAuditProvenance);
  if (!id.success || !proof.success || !Array.isArray(raw?.accessibilityRuleExamples)) return [];
  const p = proof.data;
  const examples = raw.accessibilityRuleExamples.map(readExample).filter((example): example is NonNullable<typeof example> => example !== null).filter(example =>
    example.pageUrl === p.documentUrl && p.evaluatedRules.includes(example.ruleId) &&
    getAccessibilityFindingIdForRuleCode(example.ruleId) === findingId &&
    (example.impact === "serious" || example.impact === "critical" || (findingId === "zoom_restriction_accessibility_issue" && example.impact === "moderate")));
  if (!examples.length) return [];
  if (findingId === "keyboard_navigation_accessibility_issue" && !hasPromotableKeyboardAccessibilityEvidence(raw)) return [];
  if (findingId === "zoom_restriction_accessibility_issue" && !examples.some(example => example.tags.includes("wcag144") &&
    example.representativeNodes.some(node => /user-scalable=no/.test(node.failureSummary)))) return [];
  if (findingId === "target_size_accessibility_issue" && !examples.some(example => example.tags.includes("wcag258") &&
    example.representativeNodes.some(node => hasMeasuredTargetFailure(node.failureSummary)))) return [];

  let overlap: Overlap = "distinct";
  const peers = Array.isArray(raw.accessibilityImageLinkExamples) ? raw.accessibilityImageLinkExamples.map(readExample)
    .filter((row): row is NonNullable<typeof row> => row !== null).filter(row => row.pageUrl === p.documentUrl) : [];
  const links = peers.filter(row => row.ruleId === "link-name");
  const images = peers.filter(row => row.ruleId === "image-alt");
  const imageNodes = images.flatMap(row => row.representativeNodes);
  const linkNodes = links.flatMap(row => row.representativeNodes);
  const complete = [...images, ...links].every(row => row.nodeCount === row.representativeNodes.length);
  const capturedIdentity = images.length > 0 && links.length > 0 && complete &&
    [...imageNodes, ...linkNodes].every(node => node.imageLinkIdentity !== undefined);
  const imageOnlyLinks = links.flatMap(row => row.representativeNodes).filter(node => /^<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>$/i.test(node.htmlSnippet));
  if (capturedIdentity && examples.every(row => ["image-alt", "link-name"].includes(row.ruleId))) {
    // Compare opaque IDs from the same verified audit, never selector suffixes or markup.
    const imageIds = imageNodes.map(node => node.imageLinkIdentity!);
    const linkIds = linkNodes.map(node => node.imageLinkIdentity!);
    const shared = imageIds.every(image => image.imageOnlyLinkId !== null && linkIds.some(link =>
      link.nodeId === image.imageOnlyLinkId && link.imageOnlyLinkId === link.nodeId && link.nodeId !== image.nodeId)) &&
      linkIds.every(link => imageIds.some(image => image.imageOnlyLinkId === link.nodeId));
    overlap = shared ? "image_link" : "distinct";
  } else if (images.length && imageOnlyLinks.length && examples.every(row => ["image-alt", "link-name"].includes(row.ruleId))) {
    const linkSelectors = imageOnlyLinks.flatMap(node => node.selectors).filter((value): value is string => typeof value === "string");
    const exact = imageNodes.every(node => node.selectors.some(selector => typeof selector === "string" &&
      linkSelectors.some(link => selector === `${link} > img`)));
    // A bounded sample cannot prove every observed failure is the same barrier.
    const allImageLinks = imageOnlyLinks.length === links.reduce((sum, row) => sum + row.nodeCount, 0);
    overlap = exact && complete && allImageLinks ? "image_link" : "unresolved_image_link";
  }
  const rule = SCORING_RULE_BY_ID.get(id.data)!;
  return [{ appliesTo: "certscore_overall", framework: "accessibility", policyKey: `accessibility.${id.data}`,
    policyVersion: ACCESSIBILITY_SCORE_POLICY_VERSION, reasonCode: "verified_wcag_failure", deductionPoints: rule.points,
    observedActivity: [JSON.stringify([p.scanId, p.documentUrl, overlap])],
    evidenceRefs: [`sha256:${p.sourceHash}`, `${p.scanId}:${p.evidenceRef}`, `document:${p.documentToken}`] }];
}

/** Reproduced focus uses its existing evidence gate; no new keyboard interaction is performed. */
export function buildFocusAccessibilityScoreEffects(raw: Record<string, unknown> | null | undefined): NormalizedConcernScoreEffect[] {
  if (!hasBehaviorReproducedFocusManagementEvidence(raw)) return [];
  // Focus traces without the verified audit provenance are retained but score-neutral.
  const p = provenanceSchema.safeParse(raw?.accessibilityAuditProvenance);
  if (!p.success) return [];
  const trace = raw?.focusManagementEvidence as Record<string, unknown> | undefined;
  if (trace?.documentUrl !== p.data.documentUrl || trace.documentToken !== p.data.documentToken) return [];
  const id = "keyboard_navigation_accessibility_issue";
  return [{ appliesTo: "certscore_overall", framework: "accessibility", policyKey: `accessibility.${id}`,
    policyVersion: ACCESSIBILITY_SCORE_POLICY_VERSION, reasonCode: "verified_reproduced_focus_barrier",
    deductionPoints: SCORING_RULE_BY_ID.get(id)!.points, observedActivity: [JSON.stringify([p.data.scanId, p.data.documentUrl, "distinct"])],
    evidenceRefs: [`sha256:${p.data.sourceHash}`, `${p.data.scanId}:${p.data.evidenceRef}`, `document:${p.data.documentToken}`] }];
}

export const accessibilityScoreEffectSchema = z.object({
  appliesTo: z.literal("certscore_overall"), framework: z.literal("accessibility"),
  policyKey: z.string(), policyVersion: z.literal(ACCESSIBILITY_SCORE_POLICY_VERSION),
  reasonCode: z.enum(["verified_wcag_failure", "verified_reproduced_focus_barrier"]), deductionPoints: z.number().int(),
  observedActivity: z.array(z.string()).length(1), evidenceRefs: z.array(z.string().min(1)).length(3),
}).strict().superRefine((effect, ctx) => {
  const id = findingIdSchema.safeParse(effect.policyKey.replace(/^accessibility\./, ""));
  let valid = id.success && effect.policyKey === `accessibility.${id.data}` && effect.deductionPoints === SCORING_RULE_BY_ID.get(id.data)?.points;
  try {
    const activity = JSON.parse(effect.observedActivity[0]!);
    valid &&= Array.isArray(activity) && activity.length === 3 && typeof activity[0] === "string" && activity[0].length > 0 &&
      z.string().url().safeParse(activity[1]).success && ["distinct", "image_link", "unresolved_image_link"].includes(activity[2]) &&
      /^sha256:[a-f0-9]{64}$/.test(effect.evidenceRefs[0]!) && (effect.evidenceRefs[1] === `${activity[0]}:CanonicalEvidenceBundle.json#accessibilityAudit` ||
        effect.evidenceRefs[1]!.startsWith(`${activity[0]}:full-site:${activity[0]}:`) && /:[0-9a-f-]{36}:evidence\.json#accessibilityAudit$/.test(effect.evidenceRefs[1]!)) &&
      /^document:.+/.test(effect.evidenceRefs[2]!);
  } catch { valid = false; }
  if (!valid || (effect.reasonCode === "verified_reproduced_focus_barrier" && id.data !== "keyboard_navigation_accessibility_issue")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid accessibility policy effect" });
  }
});

/** Union approved category effects across pages; repeated nodes/rules/pages never multiply points. */
export function accessibilityDeductionBreakdown(effects: readonly unknown[]) {
  const categories = new Map<FindingId, Array<{ scope: string; overlap: Overlap }>>();
  for (const value of effects) {
    const parsed = accessibilityScoreEffectSchema.safeParse(value);
    if (!parsed.success) continue;
    const id = parsed.data.policyKey.slice("accessibility.".length) as FindingId;
    const [scanId, page, overlap] = JSON.parse(parsed.data.observedActivity[0]!) as [string, string, Overlap];
    const scope = JSON.stringify([scanId, page, parsed.data.evidenceRefs]);
    categories.set(id, [...(categories.get(id) ?? []), { scope, overlap }]);
  }
  const text = categories.get("text_alternative_accessibility_issue");
  const semantics = categories.get("semantic_labeling_accessibility_issue");
  const sharedImageLink = Boolean(text?.length && semantics?.length && text.every(row => row.overlap !== "distinct" &&
    semantics.some(other => other.scope === row.scope && other.overlap !== "distinct")) &&
    semantics.every(row => row.overlap !== "distinct"));
  let remaining = SCORING_FAMILIES.accessibility.cap as number;
  const rules = ACCESSIBILITY_SCORE_FINDING_IDS.flatMap(id => {
    if (!categories.has(id) || (id === "text_alternative_accessibility_issue" && sharedImageLink)) return [];
    const rule = SCORING_RULE_BY_ID.get(id)!;
    const points = Math.min(remaining, rule.points);
    remaining -= points;
    if (!points) return [];
    return [{ ruleId: id, label: rule.label, policyDeductionPoints: points, decisionVerification: "not_applicable" as const }];
  });
  const deductionPoints = SCORING_FAMILIES.accessibility.cap - remaining;
  return { family: "accessibility" as const, label: SCORING_FAMILIES.accessibility.label, deductionPoints, rules,
    imageLinkOverlap: sharedImageLink ? (text!.some(row => row.overlap === "unresolved_image_link") ? "unresolved" : "verified") : "none" };
}
