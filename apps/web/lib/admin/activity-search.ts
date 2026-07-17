export type AdminActivitySearch = {
  query: string | null;
  requesterExclude: string | null;
};

function toIlikePattern(value: string) {
  const escaped = value.trim().replace(/[\\%_]/g, "\\$&").replaceAll("*", "%");
  return escaped.includes("%") ? escaped : `%${escaped}%`;
}

export function parseAdminActivitySearch(value: string | null | undefined): AdminActivitySearch {
  const normalized = value?.trim().slice(0, 160) ?? "";
  const requesterExclusion = normalized.match(/^requester\s*!=\s*(.+)$/i);
  if (requesterExclusion?.[1]) {
    return { query: null, requesterExclude: toIlikePattern(requesterExclusion[1]) };
  }
  return { query: normalized || null, requesterExclude: null };
}
