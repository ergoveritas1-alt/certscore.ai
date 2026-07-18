export type AdminActivitySearch = {
  query: string | null;
  requesterExclude: string | null;
  source: string | null;
};

function toIlikePattern(value: string) {
  const escaped = value.trim().replace(/[\\%_]/g, "\\$&").replaceAll("*", "%");
  return escaped.includes("%") ? escaped : `%${escaped}%`;
}

export function normalizeAdminActivityFilter(
  value: string | null | undefined,
  ignoredValues: readonly string[] = []
) {
  const normalized = value?.trim() ?? "";
  return normalized && !ignoredValues.some((ignored) => ignored.toLowerCase() === normalized.toLowerCase())
    ? normalized
    : null;
}

export function parseAdminActivitySearch(
  value: string | null | undefined,
  options: { source?: boolean } = {}
): AdminActivitySearch {
  const normalized = value?.trim().slice(0, 160) ?? "";
  const sourceMatch = options.source
    ? normalized.match(/(?:^|\s)source\s*:\s*(?:"([^"]+)"|(\S+))/i)
    : null;
  const source = (sourceMatch?.[1] ?? sourceMatch?.[2] ?? "").trim().slice(0, 80) || null;
  const queryWithoutSource = sourceMatch
    ? normalized.replace(sourceMatch[0], " ").trim().replace(/\s+/g, " ")
    : normalized;
  const requesterExclusion = queryWithoutSource.match(/^requester\s*!=\s*(.+)$/i);
  if (requesterExclusion?.[1]) {
    return { query: null, requesterExclude: toIlikePattern(requesterExclusion[1]), source };
  }
  return { query: queryWithoutSource || null, requesterExclude: null, source };
}
