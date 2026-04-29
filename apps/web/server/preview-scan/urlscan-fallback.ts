type UrlscanRecord = Record<string, unknown>;

type UrlscanSearchHit = {
  _id?: string;
  page?: {
    domain?: string;
    url?: string;
    title?: string;
  };
  task?: {
    time?: string;
    uuid?: string;
  };
  result?: string;
};

export type UrlscanFallbackSource = {
  reportUrl: string | null;
  resultApiUrl: string | null;
  result: UrlscanRecord | null;
};

function getRecord(input: unknown): UrlscanRecord | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as UrlscanRecord)
    : null;
}

function getString(input: UrlscanRecord | null, key: string) {
  const value = input?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(input: UrlscanRecord | null, key: string) {
  const value = input?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getArray(input: UrlscanRecord | null, key: string) {
  const value = input?.[key];
  return Array.isArray(value) ? value : [];
}

function normalizeHostname(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function safeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function safePathname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return null;
  }
}

function countRequests(result: UrlscanRecord | null) {
  const stats = getRecord(result?.stats);
  const data = getRecord(result?.data);
  const requests = getArray(data, "requests").length;
  const totalRequests = getNumber(stats, "totalRequests") ?? 0;
  const domainStats = getArray(stats, "domainStats");
  const domainStatSum = domainStats.reduce((sum, row) => {
    const record = getRecord(row);
    const count = getNumber(record, "count") ?? 0;
    return sum + count;
  }, 0);

  return Math.max(requests, totalRequests, domainStatSum);
}

function countCookies(result: UrlscanRecord | null) {
  const data = getRecord(result?.data);
  const stats = getRecord(result?.stats);
  const directCount = getArray(data, "cookies").length;
  return Math.max(directCount, getNumber(stats, "cookies") ?? 0);
}

function countTechnologies(result: UrlscanRecord | null) {
  return getArray(result, "technologies").length;
}

function countDomains(result: UrlscanRecord | null) {
  const lists = getRecord(result?.lists);
  return getArray(lists, "domains").length;
}

function countIps(result: UrlscanRecord | null) {
  const lists = getRecord(result?.lists);
  return getArray(lists, "ips").length;
}

function computeUrlscanRichnessScore(result: UrlscanRecord | null, preferredHostname: string | null) {
  if (!result) {
    return Number.NEGATIVE_INFINITY;
  }

  const page = getRecord(result.page);
  const pageUrl = getString(page, "url");
  const pageTitle = (getString(page, "title") ?? "").toLowerCase();
  const pageHostname = safeHostname(pageUrl);
  const pagePathname = safePathname(pageUrl);

  let score = 0;
  const requestCount = countRequests(result);
  const cookieCount = countCookies(result);
  const technologyCount = countTechnologies(result);
  const domainCount = countDomains(result);
  const ipCount = countIps(result);

  score += Math.min(requestCount, 500);
  score += Math.min(cookieCount * 3, 180);
  score += Math.min(technologyCount * 12, 180);
  score += Math.min(domainCount * 2, 120);
  score += Math.min(ipCount, 120);

  if (preferredHostname && pageHostname === preferredHostname) {
    score += 180;
  }

  if (pagePathname === "/" || pagePathname === "") {
    score += 60;
  }

  if (pageTitle && !/(access denied|forbidden|region-error|something went wrong|error)/i.test(pageTitle)) {
    score += 40;
  }

  if (pagePathname?.includes("region-error")) {
    score -= 500;
  }

  if (/(access denied|forbidden|region-error|something went wrong|error)/i.test(pageTitle)) {
    score -= 250;
  }

  if (requestCount <= 5) {
    score -= 200;
  }

  if (technologyCount === 0) {
    score -= 40;
  }

  return score;
}

function buildReportUrl(resultApiUrl: string | null, taskUuid: string | null) {
  if (taskUuid) {
    return `https://urlscan.io/result/${taskUuid}/`;
  }

  if (!resultApiUrl) {
    return null;
  }

  const match = resultApiUrl.match(/\/result\/([^/]+)\/?$/i);
  return match ? `https://urlscan.io/result/${match[1]}/` : null;
}

export function isUrlscanResultThin(result: UrlscanRecord | null, preferredHostname?: string | null) {
  const score = computeUrlscanRichnessScore(result, normalizeHostname(preferredHostname));
  return score < 140;
}

export function choosePreferredUrlscanSource(input: {
  retained: UrlscanFallbackSource | null;
  candidates: UrlscanFallbackSource[];
  preferredHostname?: string | null;
}) {
  const preferredHostname = normalizeHostname(input.preferredHostname);
  const allCandidates = [
    ...(input.retained ? [input.retained] : []),
    ...input.candidates
  ].filter((candidate, index, array) => (
    array.findIndex((item) => item.resultApiUrl === candidate.resultApiUrl) === index
  ));

  if (allCandidates.length === 0) {
    return null;
  }

  return allCandidates.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }
    const bestScore = computeUrlscanRichnessScore(best.result, preferredHostname);
    const candidateScore = computeUrlscanRichnessScore(candidate.result, preferredHostname);
    return candidateScore > bestScore ? candidate : best;
  }, null as UrlscanFallbackSource | null);
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return getRecord(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchUrlscanResult(resultApiUrl: string | null) {
  if (!resultApiUrl) {
    return null;
  }

  return fetchJson(resultApiUrl);
}

export async function searchUrlscanCandidates(input: {
  hostname: string | null;
  limit?: number;
  searchMode?: "page_domain" | "submitted_domain";
}): Promise<UrlscanFallbackSource[]> {
  const hostname = normalizeHostname(input.hostname);
  if (!hostname) {
    return [];
  }

  const query = input.searchMode === "submitted_domain"
    ? `domain:${hostname}`
    : `page.domain:"${hostname}"`;
  const searchUrl = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(query)}&size=${input.limit ?? 5}`;
  const payload = await fetchJson(searchUrl);
  const hits = getArray(payload, "results") as UrlscanSearchHit[];

  const candidates: Array<UrlscanFallbackSource | null> = await Promise.all(hits.map(async (hit) => {
    const resultApiUrl =
      typeof hit.result === "string" && hit.result.trim().length > 0
        ? hit.result.trim()
        : hit._id
          ? `https://urlscan.io/api/v1/result/${hit._id}/`
          : null;

    if (!resultApiUrl) {
      return null;
    }

    const result = await fetchUrlscanResult(resultApiUrl);
    if (!result) {
      return null;
    }
    const task = getRecord(result?.task);
    const taskUuid = getString(task, "uuid") ?? hit._id ?? null;

    return {
      resultApiUrl,
      reportUrl: buildReportUrl(resultApiUrl, taskUuid),
      result
    } satisfies UrlscanFallbackSource;
  }));

  return candidates.filter((candidate): candidate is UrlscanFallbackSource => candidate !== null);
}
