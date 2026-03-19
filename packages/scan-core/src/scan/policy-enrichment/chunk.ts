import type { PolicyChunk, PolicyChunkSelection } from "./types";

function splitIntoWords(text: string) {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

export function chunkPolicyText(input: {
  chunkOverlapTokens?: number;
  chunkSizeTokens?: number;
  text: string;
}) {
  const chunkSize = input.chunkSizeTokens ?? 700;
  const overlap = input.chunkOverlapTokens ?? 80;
  const words = splitIntoWords(input.text);

  if (words.length === 0) {
    return [] satisfies PolicyChunk[];
  }

  const chunks: PolicyChunk[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < words.length) {
    const end = Math.min(words.length, cursor + chunkSize);
    const text = words.slice(cursor, end).join(" ");
    const prefixWordCount = words.slice(0, cursor).join(" ").length;
    const offsetStart = cursor === 0 ? 0 : prefixWordCount + 1;
    const offsetEnd = offsetStart + text.length;

    chunks.push({
      chunkId: `chunk-${chunkIndex + 1}`,
      offsetStart,
      offsetEnd,
      text
    });

    if (end >= words.length) {
      break;
    }

    cursor = Math.max(end - overlap, cursor + 1);
    chunkIndex += 1;
  }

  return chunks;
}

const CHUNK_PRIORITY_PATTERNS: Array<{ pattern: RegExp; reason: string; score: number }> = [
  { pattern: /\b(?:gdpr|general data protection regulation|ccpa|cpra|california consumer privacy)\b/i, reason: "regulatory_rights", score: 4 },
  { pattern: /\b(?:request access|request deletion|delete your data|data subject request|privacy request|consumer privacy request)\b/i, reason: "dsar", score: 6 },
  { pattern: /\b(?:do not sell|do not share|sell your personal information|share your personal information)\b/i, reason: "sale_sharing", score: 6 },
  { pattern: /\b(?:retain|retention|keep your data|store.*for|as long as necessary)\b/i, reason: "retention", score: 4 },
  { pattern: /\b(?:standard contractual clauses|scc|adequacy decision|international transfer|cross-border)\b/i, reason: "transfer", score: 4 },
  { pattern: /\b(?:privacy@|dpo@|privacy form|privacy portal|contact our privacy team)\b/i, reason: "contact_channel", score: 5 },
  { pattern: /\b(?:under 13|under 16|children under)\b/i, reason: "children", score: 3 },
  { pattern: /\b(?:session replay|record your interactions|replay your session|cookies?)\b/i, reason: "tracking_disclosure", score: 3 }
];

const TERMS_CHUNK_PRIORITY_PATTERNS: Array<{ pattern: RegExp; reason: string; score: number }> = [
  { pattern: /\b(?:governed by|governing law|laws of)\b/i, reason: "governing_law", score: 8 },
  { pattern: /\b(?:arbitration|binding arbitration|class action waiver|jury trial waiver|dispute resolution)\b/i, reason: "arbitration", score: 8 },
  { pattern: /\b(?:effective date|last updated|last revised)\b/i, reason: "effective_date", score: 6 }
];

function countPatternHits(text: string, pattern: RegExp) {
  const matches = text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  return matches?.length ?? 0;
}

export function selectPolicyChunksForLlm(input: {
  chunks: PolicyChunk[];
  maxChunks?: number;
  pageType?: string | null;
  preferLastChunk?: boolean;
}) {
  const maxChunks = input.maxChunks ?? 5;
  const isTermsPage = input.pageType === "terms_of_service";
  const preferLastChunk = input.preferLastChunk ?? true;
  const priorityPatterns = isTermsPage ? TERMS_CHUNK_PRIORITY_PATTERNS : CHUNK_PRIORITY_PATTERNS;

  if (input.chunks.length <= maxChunks) {
    return input.chunks.map((chunk, index) => ({
      ...chunk,
      reason: index === 0 ? "first_chunk" : index === input.chunks.length - 1 ? "last_chunk" : "all_chunks",
      score: index === 0 || index === input.chunks.length - 1 ? 1 : 0
    })) satisfies PolicyChunkSelection[];
  }

  const scored = input.chunks.map((chunk, index) => {
    const reasons = new Set<string>();
    let score = 0;

    if (index === 0) {
      reasons.add("first_chunk");
      score += 3;
    }

    if (index === input.chunks.length - 1) {
      reasons.add("last_chunk");
      score += 2;
    }

    for (const entry of priorityPatterns) {
      const hits = countPatternHits(chunk.text, entry.pattern);
      if (hits > 0) {
        reasons.add(entry.reason);
        score += entry.score * hits;
      }
    }

    return {
      ...chunk,
      reason: reasons.size > 0 ? [...reasons].join(",") : "coverage",
      score
    } satisfies PolicyChunkSelection;
  });

  const firstChunk = scored[0]!;
  const lastChunk = scored[scored.length - 1]!;
  const interiorSignalCount = scored
    .slice(1, -1)
    .filter((chunk) => chunk.score >= 4)
    .length;
  const shouldMandateLastChunk =
    !isTermsPage &&
    preferLastChunk &&
    !(
      input.pageType === "privacy_policy" &&
      scored.length >= Math.max(maxChunks + 1, 6) &&
      interiorSignalCount >= 2
    );
  const mandatoryIds = new Set(
    isTermsPage ? [firstChunk.chunkId] : shouldMandateLastChunk ? [firstChunk.chunkId, lastChunk.chunkId] : [firstChunk.chunkId]
  );
  const remainingBudget = Math.max(0, maxChunks - mandatoryIds.size);
  const selected = [
    ...scored
      .filter((chunk) => !mandatoryIds.has(chunk.chunkId))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.offsetStart - right.offsetStart;
      })
      .slice(0, remainingBudget),
    ...scored.filter((chunk) => mandatoryIds.has(chunk.chunkId))
  ]
    .sort((left, right) => left.offsetStart - right.offsetStart)
    .slice(0, maxChunks);

  return selected;
}
