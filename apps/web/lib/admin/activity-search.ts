export type AdminActivitySearch = {
  exclusions: AdminActivitySearchExclusions;
  query: string | null;
  source: string | null;
};

export type AdminActivitySearchExclusions = {
  domain: string[];
  email: string[];
  ip: string[];
  requester: string[];
  scanId: string[];
  source: string[];
};

function emptyExclusions(): AdminActivitySearchExclusions {
  return {
    domain: [],
    email: [],
    ip: [],
    requester: [],
    scanId: [],
    source: []
  };
}

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
  const exclusions = emptyExclusions();
  const fieldMap: Record<string, keyof AdminActivitySearchExclusions> = {
    domain: "domain",
    email: "email",
    ip: "ip",
    requester: "requester",
    scan_id: "scanId",
    scanid: "scanId",
    source: "source"
  };
  const exclusionPattern = /(?:^|\s)(domain|scan_?id|email|requester|ip|source)\s*!=\s*(?:"([^"]+)"|(\S+))/gi;
  const remaining = queryWithoutSource.replace(exclusionPattern, (match, rawField: string, quotedValue: string | undefined, unquotedValue: string | undefined) => {
    const field = fieldMap[rawField.toLowerCase()];
    const value = (quotedValue ?? unquotedValue ?? "").trim().slice(0, 120);
    if (!field || !value || (field === "source" && !options.source)) {
      return match;
    }
    exclusions[field].push(toIlikePattern(value));
    return " ";
  }).trim().replace(/\s+/g, " ");

  for (const field of Object.keys(exclusions) as Array<keyof AdminActivitySearchExclusions>) {
    exclusions[field] = [...new Set(exclusions[field])];
  }
  return { exclusions, query: remaining || null, source };
}
