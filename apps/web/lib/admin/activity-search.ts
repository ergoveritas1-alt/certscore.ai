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

export function normalizeAdminExactHostname(value: string | null | undefined) {
  if (!value || /\s|[*%_]/.test(value)) return null;

  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    if (parsed.username || parsed.password || parsed.port || (parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return hostname.includes(".") && /^[a-z0-9.-]+$/.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

export function normalizeAdminExactScanId(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
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
