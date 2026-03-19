type ComparisonFinding = {
  category: string;
  page_url?: string | null;
  rule_key: string;
};

function normalizePageIdentity(pageUrl: string | null | undefined) {
  if (!pageUrl) {
    return "site";
  }

  try {
    const url = new URL(pageUrl);
    url.hash = "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.hostname.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return pageUrl.trim().toLowerCase();
  }
}

export function buildFindingComparisonKey(finding: ComparisonFinding) {
  return `${finding.category}::${finding.rule_key}::${normalizePageIdentity(finding.page_url)}`;
}
