import { normalizeTextForHash, stableHash } from "../snapshot/hash";

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

export function normalizePolicyText(input: string) {
  const withoutBoilerplate = input
    .replace(/\b(cookie settings|skip to content|accept all cookies|manage preferences)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutBoilerplate;
}

export function hashNormalizedPolicyText(input: string) {
  return stableHash(normalizeTextForHash(input));
}

export function hashEvidenceSnippet(snippet: string) {
  return stableHash(normalizeTextForHash(snippet));
}

export function clampSnippet(input: string | null, limit = 240) {
  if (!input) {
    return null;
  }

  return truncate(input.trim(), limit);
}

export function findSnippetInText(text: string, snippet: string | null) {
  if (!snippet) {
    return null;
  }

  const index = text.indexOf(snippet);
  if (index >= 0) {
    return {
      offsetEnd: index + snippet.length,
      offsetStart: index
    };
  }

  return null;
}

export function extractSentenceSnippet(input: { matchIndex: number; source: string; window?: number }) {
  const window = input.window ?? 180;
  const start = Math.max(0, input.matchIndex - window);
  const end = Math.min(input.source.length, input.matchIndex + window);
  return clampSnippet(input.source.slice(start, end));
}
