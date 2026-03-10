import type { PolicyChunk } from "./types";

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
