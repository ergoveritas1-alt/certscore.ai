import { z } from "zod";
import { qualifiesSiteIntegrityReview, SITE_INTEGRITY_POLICY_VERSION, LEGACY_SITE_INTEGRITY_POLICY_VERSION, SITE_INTEGRITY_LIMITS, SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { SCORING_FAMILIES, SCORING_RULE_BY_ID } from "./scoring-policy";
import type { NormalizedConcernScoreEffect } from "./normalized-concerns";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const SITE_INTEGRITY_SCORE_POLICY_KEY = "site_integrity.hidden_outbound_links";
export const CALIFORNIA_SITE_INTEGRITY_SCORE_VERSION = "california-regulatory-posture.v23-shared-integrity" as const;
export function siteIntegrityPolicyForScoreVersion(version: unknown): SiteIntegrityScoringPolicy {
  return typeof version === "string" && /^overall-posture\.v(?:[1-9]|1[0-3])$/.test(version)
    ? LEGACY_SITE_INTEGRITY_POLICY_VERSION : SITE_INTEGRITY_POLICY_VERSION;
}
export type SiteIntegrityScoringPolicy = typeof SITE_INTEGRITY_POLICY_VERSION | typeof LEGACY_SITE_INTEGRITY_POLICY_VERSION;
type ScoreTarget = "certscore_overall" | "california_posture";
const rule = SCORING_RULE_BY_ID.get("site_integrity_hidden_outbound_links")!;
export function hiddenLinkDeduction(count: number, policyVersion: SiteIntegrityScoringPolicy = SITE_INTEGRITY_POLICY_VERSION) {
  if (!Number.isSafeInteger(count) || count < 1) return 0;
  const legacy = policyVersion === LEGACY_SITE_INTEGRITY_POLICY_VERSION;
  return Math.min(legacy ? 40 : SCORING_FAMILIES.site_integrity.cap,
    (legacy ? 17 : rule.identity!.first) + (count - 1) * (legacy ? 5 : rule.identity!.subsequentEach));
}

/** Concern-policy output, produced only from the verified typed projection. */
export function buildSiteIntegrityScoreEffects(projection: unknown, policyVersion: SiteIntegrityScoringPolicy = SITE_INTEGRITY_POLICY_VERSION): NormalizedConcernScoreEffect[] {
  if (!qualifiesSiteIntegrityReview(projection)) return [];
  const page = projection.contractVersion === "certscore.site-integrity-projection.v2" ? projection.pageId : "homepage";
  const observedActivity = projection.observation.links.map(link => JSON.stringify([projection.scanId, page, link.evidenceRef]));
  const targets: ScoreTarget[] = policyVersion === LEGACY_SITE_INTEGRITY_POLICY_VERSION ? ["certscore_overall"] : ["certscore_overall", "california_posture"];
  return targets.map(appliesTo => ({ appliesTo, framework: "site_integrity", policyKey: SITE_INTEGRITY_SCORE_POLICY_KEY,
    policyVersion, reasonCode: "verified_hidden_outbound_links",
    deductionPoints: hiddenLinkDeduction(observedActivity.length, policyVersion), observedActivity,
    evidenceRefs: [`${projection.scanId}:${projection.evidenceRef}`, `sha256:${projection.sourceHash}`, `sha256:${projection.observationHash}`] }));
}

export const siteIntegrityScoreEffectSchema = z.object({
  appliesTo: z.enum(["certscore_overall", "california_posture"]), framework: z.literal("site_integrity"),
  policyKey: z.literal(SITE_INTEGRITY_SCORE_POLICY_KEY), policyVersion: z.enum([SITE_INTEGRITY_POLICY_VERSION, LEGACY_SITE_INTEGRITY_POLICY_VERSION]),
  reasonCode: z.literal("verified_hidden_outbound_links"), deductionPoints: z.number().int().min(13).max(40),
  observedActivity: z.array(z.string()).min(1).max(SITE_INTEGRITY_LIMITS.retainedLinks), evidenceRefs: z.array(z.string().min(1)).min(3),
}).superRefine((effect, ctx) => {
  const identities = new Set(effect.observedActivity);
  if (effect.policyVersion === LEGACY_SITE_INTEGRITY_POLICY_VERSION && effect.appliesTo !== "certscore_overall" ||
      identities.size !== effect.observedActivity.length || hiddenLinkDeduction(identities.size, effect.policyVersion) !== effect.deductionPoints ||
      effect.observedActivity.some(identity => { try {
        const value = JSON.parse(identity);
        return !Array.isArray(value) || value.length !== 3 || value.some(part => typeof part !== "string" || !part) || !/^site_integrity:link:\d{1,6}$/.test(value[2]);
      } catch { return true; } })) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Invalid scored link identities"});
});

/** Union one version/target's approved identities; apply the allowance and cap once. */
export function siteIntegrityDeduction(effects: readonly unknown[], options: { appliesTo?: ScoreTarget; policyVersion?: SiteIntegrityScoringPolicy } = {}) {
  const parsed = effects.flatMap(effect => { const result = siteIntegrityScoreEffectSchema.safeParse(effect); return result.success ? [result.data] : []; });
  const appliesTo = options.appliesTo ?? "certscore_overall";
  const policyVersion = options.policyVersion ?? (parsed.some(effect => effect.policyVersion === SITE_INTEGRITY_POLICY_VERSION) ? SITE_INTEGRITY_POLICY_VERSION : LEGACY_SITE_INTEGRITY_POLICY_VERSION);
  const identities = new Set(parsed.filter(effect => effect.appliesTo === appliesTo && effect.policyVersion === policyVersion).flatMap(effect => effect.observedActivity));
  return hiddenLinkDeduction(identities.size, policyVersion);
}

/** Both scores consume the same source-bound, policy-projected unified finding. */
export function siteIntegrityFindingEffects(findings: readonly UnifiedFindingDisplayPacket[], scanId?: string) {
  return findings.flatMap(finding => {
    if (finding.unifiedFindingId !== SITE_INTEGRITY_FINDING_ID || finding.presentationDecision.status !== "surface" ||
        finding.surfacingDecision?.reportable !== true || !finding.concernContext?.promotionEligibilities.includes("eligible") ||
        !finding.concernContext?.externalSurfacingEligibilities.includes("eligible") || finding.details?.family !== "site_integrity" ||
        !qualifiesSiteIntegrityReview(finding.details.projection) || scanId && finding.details.projection.scanId !== scanId) return [];
    const projection = finding.details.projection;
    return (finding.scoreEffects ?? []).flatMap(effect => {
      const parsed = siteIntegrityScoreEffectSchema.safeParse(effect);
      if (!parsed.success) return [];
      const expected = buildSiteIntegrityScoreEffects(projection, parsed.data.policyVersion)
        .find(candidate => candidate.appliesTo === parsed.data.appliesTo);
      const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(value => b.includes(value));
      return expected && expected.deductionPoints === parsed.data.deductionPoints &&
        same(expected.observedActivity, parsed.data.observedActivity) && same(expected.evidenceRefs, parsed.data.evidenceRefs) ? [parsed.data] : [];
    });
  });
}

/** Customer evidence describes observations, without deduction formulas. */
export function siteIntegrityScoreDescription(effects: readonly unknown[]) {
  return effects.some(effect => siteIntegrityScoreEffectSchema.safeParse(effect).success)
    ? "Verified concealed outbound link occurrences were retained for review."
    : "Review the retained concealed outbound link evidence and capture coverage.";
}
