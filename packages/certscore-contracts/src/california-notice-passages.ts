/** Versioned topic location only: these phrases do not assess adequacy, sale,
 * sharing, legal applicability, or eligibility for any finding or score. */
export const CALIFORNIA_NOTICE_PASSAGE_POLICY = "california_notice_passages.v1";
const TOPICS = [
  ["sale_sharing", /\b(?:sell|selling|sale of|share|sharing)\b/i],
  ["collection_purposes", /\b(?:purposes?|categories of (?:personal )?(?:information|data)|information we collect)\b/i],
  ["retention", /\b(?:retain|retention|how long we keep)\b/i],
  ["privacy_rights", /\b(?:right to (?:access|know|delete|correct)|privacy rights|exercise your rights)\b/i],
  ["opt_out_methods", /\b(?:opt[ -]out|do not sell|do not share|your privacy choices|global privacy control)\b/i],
] as const;

export function locateCaliforniaNoticePassages(text: string) {
  // Bound all matching to already retained text. No fetched or model-derived text.
  const bounded = text.slice(0, 40_000);
  return TOPICS.flatMap(([topic, pattern]) => {
    const match = pattern.exec(bounded);
    if (!match) return [];
    const start = Math.max(0, match.index - 100);
    return [{ topic, excerpt: bounded.slice(start, Math.min(bounded.length, start + 480)) }];
  });
}
