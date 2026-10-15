import { z } from "zod";

export const EMBED_SCORING_EVIDENCE_POLICY = "distinct_embed_exposure.v1" as const;
export const EMBED_SCORE_ROW_IDS = ["third_party_iframe_pre_consent", "social_media_embed_pre_consent", "embedded_content_pre_consent"] as const;
const schema = z.object({
  policyVersion: z.literal(EMBED_SCORING_EVIDENCE_POLICY),
  groups: z.array(z.object({
    host: z.string().regex(/^[a-z0-9.-]+$/).max(253),
    resource: z.string().url().max(2048),
    purpose: z.enum(["formOrChatWidget", "mapEmbed", "mediaEmbed", "otherEmbeddedContent", "socialEmbed", "videoAdSdk"]),
  }).strict().refine(group => {
    try {
      const url = new URL(group.resource);
      return /^https?:$/.test(url.protocol) && url.hostname === group.host && !url.search && !url.hash && !url.username && !url.password;
    } catch { return false; }
  })).max(64),
}).strict();
export type EmbedScoringEvidence = z.infer<typeof schema>;
/** Only canonical policy-admitted runtime rows may construct this projection. */
export function buildEmbedScoringEvidence(groups: EmbedScoringEvidence["groups"]): EmbedScoringEvidence {
  const parsed = schema.safeParse({ policyVersion: EMBED_SCORING_EVIDENCE_POLICY,
    groups: [...new Map(groups.map(group => [JSON.stringify([group.host, group.purpose, group.resource]), group])).values()].slice(0, 64) });
  return parsed.success ? parsed.data : { policyVersion: EMBED_SCORING_EVIDENCE_POLICY, groups: [] };
}
/** Undefined preserves legacy scoring. Invalid new proof is score-neutral. */
export function readEmbedScoringGroups(retained: Record<string, unknown>): string[] | undefined {
  if (!("embedScoringEvidence" in retained)) return undefined;
  const parsed = schema.safeParse(retained.embedScoringEvidence);
  return parsed.success ? parsed.data.groups.map(group => JSON.stringify([group.host, group.purpose, group.resource])) : [];
}
export function mergeEmbedScoringEvidence(records: Record<string, unknown>[]) {
  if (records.some(record => readEmbedScoringGroups(record) === undefined)) return undefined;
  return buildEmbedScoringEvidence(records.flatMap(record => {
    const parsed = schema.safeParse(record.embedScoringEvidence);
    return parsed.success ? parsed.data.groups : [];
  }));
}
