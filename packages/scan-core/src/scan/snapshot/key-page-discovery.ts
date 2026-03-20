import type {
  FetchStatus,
  KeyPageDiscoveryCandidate,
  KeyPageDiscoveryHostRelation,
  KeyPageDiscoveryPageSummary,
  KeyPageDiscoverySource,
  KeyPageDiscoverySummary,
  PageType
} from "@website-signal-risk-scanner/shared";
import type { RobotsPolicy } from "../robots/policy";
import { fetchTextPage, getRegisteredDomain } from "./extractors";
import {
  getLocalizedKeywords,
  getLocalizedPathGuesses,
  getSupportedKeyPageTypes,
  inferLocaleHints,
  normalizeLegalMatchText,
  scoreKeywordMatches,
  type KeyPageType
} from "./key-page-locale-config";

const CROSS_DOMAIN_KEY_PAGE_TYPES = new Set<KeyPageType>([
  "privacy_policy",
  "terms_of_service",
  "cookie_policy",
  "accessibility_statement",
  "contact"
]);

export const KEY_PAGE_DISCOVERY_BUDGETS = {
  maxAdditionalFetchAttempts: 8,
  maxCandidates: 20,
  maxCandidatesPerTypeBeforeGlobalTrim: 3,
  maxFetchAttemptsPerType: 3,
  maxSameBrandCandidatesPerType: 2,
  maxSameBrandSubdomainHosts: 3,
  maxSecondHopLegalHubFetchesPerMissingType: 1,
  maxSitemapFiles: 3,
  maxSitemapIndexChildren: 2
} as const;

const SAME_BRAND_SUBDOMAIN_PREFIXES = ["wiki", "help", "support", "legal", "docs", "privacy"] as const;
const MAX_SAME_BRAND_SUBDOMAIN_HUB_FETCHES_PER_HOST = 2;
const SAME_BRAND_SUBDOMAIN_HUB_GUESS_SOURCE_MIN_SCORE = 14;
const SAME_BRAND_SUBDOMAIN_HUB_FETCH_MIN_SCORE = 10;
const SAME_BRAND_SUBDOMAIN_HUB_KEYWORDS = [
  "service",
  "services",
  "servis",
  "support",
  "help",
  "docs",
  "documentation",
  "manual",
  "guide",
  "project",
  "projects",
  "proekty",
  "portal",
  "wiki"
] as const;
const SAME_BRAND_SUBDOMAIN_HUB_KEYWORD_WEIGHTS: Record<(typeof SAME_BRAND_SUBDOMAIN_HUB_KEYWORDS)[number], number> = {
  service: 10,
  services: 10,
  servis: 10,
  support: 8,
  help: 8,
  docs: 8,
  documentation: 8,
  manual: 6,
  guide: 6,
  project: 2,
  projects: 2,
  proekty: 2,
  portal: 4,
  wiki: 2
};

type LinkLike = {
  href: string;
  text: string;
};

type DiscoveryCandidateDraft = Omit<KeyPageDiscoveryCandidate, "fetchAttempted" | "fetchOutcome">;

export type KeyPageFetchAttempt = {
  candidateUrl: string;
  fetchOutcome: FetchStatus;
};

export type KeyPageDiscoveryState = {
  candidates: DiscoveryCandidateDraft[];
  legalHubCandidates: Array<{
    anchorText: string | null;
    candidateScore: number;
    candidateUrl: string;
    discoveredFrom: Exclude<KeyPageDiscoverySource, "guessed_slug">;
    localeHints: string[];
    sourceUrl: string | null;
  }>;
  localeHints: string[];
  sameBrandSubdomainHostsInspected: string[];
  sitemapFilesFetched: string[];
  sitemapIndexUrlsFetched: string[];
  sitemapUrls: string[];
};

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

function isKeyPageType(pageType: PageType): pageType is KeyPageType {
  return getSupportedKeyPageTypes().includes(pageType as KeyPageType);
}

function sameHostname(leftUrl: string, rightUrl: string) {
  try {
    return new URL(leftUrl).hostname === new URL(rightUrl).hostname;
  } catch {
    return false;
  }
}

function getHostRelation(candidateUrl: string, homepageUrl: string): KeyPageDiscoveryHostRelation | "external" {
  try {
    const candidateHost = new URL(candidateUrl).hostname;
    const homepageHost = new URL(homepageUrl).hostname;
    if (candidateHost === homepageHost) {
      return "same_host";
    }

    const candidateRegisteredDomain = getRegisteredDomain(candidateHost);
    const homepageRegisteredDomain = getRegisteredDomain(homepageHost);
    if (candidateRegisteredDomain === homepageRegisteredDomain) {
      return "same_brand_subdomain";
    }

    return "external";
  } catch {
    return "external";
  }
}

function isAllowedCrossDomainCandidate(pageType: KeyPageType, candidateUrl: string, homepageUrl: string) {
  const hostRelation = getHostRelation(candidateUrl, homepageUrl);
  return hostRelation === "same_host" || (hostRelation === "same_brand_subdomain" && CROSS_DOMAIN_KEY_PAGE_TYPES.has(pageType));
}

function extractLanguage(html: string) {
  const match = html.match(/<html[^>]*\slang=["']?([^"'\s>]+)["']?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function stripTags(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractLinks(html: string, baseUrl: string): LinkLike[] {
  const matches = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const links: LinkLike[] = [];

  for (const match of matches) {
    const rawHref = match[1]?.trim();
    if (!rawHref) {
      continue;
    }

    try {
      const href = new URL(rawHref, baseUrl).toString();
      links.push({
        href,
        text: stripTags(match[2] ?? "").slice(0, 200)
      });
    } catch {
      continue;
    }
  }

  return links;
}

function toOriginUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return null;
  }
}

function shouldInspectSameBrandSubdomainHost(hostname: string, registeredDomain: string) {
  if (hostname === registeredDomain || hostname === `www.${registeredDomain}`) {
    return false;
  }

  const suffix = `.${registeredDomain}`;
  if (!hostname.endsWith(suffix)) {
    return false;
  }

  const subdomainLabel = hostname.slice(0, -suffix.length).split(".").filter(Boolean).pop() ?? "";
  if (!subdomainLabel) {
    return false;
  }

  if (subdomainLabel.length === 1) {
    return false;
  }

  return true;
}

function collectSameBrandSubdomainOrigins(input: {
  homepageUrl: string;
  sitemapUrls: string[];
  renderedLinks: LinkLike[];
}) {
  const homepageHost = new URL(input.homepageUrl).hostname;
  const registeredDomain = getRegisteredDomain(homepageHost);
  const candidates = new Map<string, { bonus: number; origin: string }>();

  const maybeAdd = (url: string, bonus: number) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === homepageHost) {
        return;
      }
      if (getRegisteredDomain(parsed.hostname) !== registeredDomain) {
        return;
      }
      if (!shouldInspectSameBrandSubdomainHost(parsed.hostname, registeredDomain)) {
        return;
      }
      const origin = `${parsed.protocol}//${parsed.hostname}/`;
      const existing = candidates.get(parsed.hostname);
      if (!existing || bonus > existing.bonus || (bonus === existing.bonus && parsed.protocol === "https:")) {
        candidates.set(parsed.hostname, { bonus, origin });
      }
    } catch {
      return;
    }
  };

  for (const link of input.renderedLinks) {
    maybeAdd(link.href, 100);
  }

  for (const sitemapUrl of input.sitemapUrls) {
    maybeAdd(sitemapUrl, 80);
  }

  const homepageProtocol = new URL(input.homepageUrl).protocol;
  for (const prefix of SAME_BRAND_SUBDOMAIN_PREFIXES) {
    maybeAdd(`${homepageProtocol}//${prefix}.${registeredDomain}/`, 40);
  }

  return [...candidates.values()]
    .sort((left, right) => right.bonus - left.bonus)
    .map((candidate) => candidate.origin)
    .slice(0, KEY_PAGE_DISCOVERY_BUDGETS.maxSameBrandSubdomainHosts);
}

function dedupeLinksByHref(links: LinkLike[]) {
  const deduped = new Map<string, LinkLike>();
  for (const link of links) {
    if (!deduped.has(link.href)) {
      deduped.set(link.href, link);
    }
  }

  return [...deduped.values()];
}

function toPascalCasePathSegment(value: string) {
  const cleaned = value.replace(/^\/+/, "").trim();
  if (!cleaned) {
    return cleaned;
  }

  return cleaned
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function getSameBrandGuessLocaleHints(sourceUrl: string, localeHints: string[]) {
  const inferred = new Set(inferLocaleHints({ homepageUrl: sourceUrl }));

  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    const tld = hostname.split(".").pop() ?? "";
    if (tld === "ru") {
      inferred.add("ru");
    }
  } catch {
    // Ignore malformed source URLs and fall back to provided hints.
  }

  if (!inferred.has("ru")) {
    return localeHints;
  }

  const filteredGlobalHints = localeHints.filter((locale) => locale === "ru" || locale === "en");
  return dedupe([...inferred, ...filteredGlobalHints]);
}

function buildRelativeGuessedUrls(sourceUrl: string, pageType: KeyPageType, localeHints: string[]) {
  try {
    const parsed = new URL(sourceUrl);
    const basePath = parsed.pathname.replace(/\/+$/, "");
    if (!basePath || basePath === "/") {
      return [] as string[];
    }

    const relativeGuesses = getLocalizedPathGuesses({
      homepageUrl: `${parsed.origin}/`,
      localeHints,
      pageType
    });

    const urls = new Set<string>();
    for (const guess of relativeGuesses) {
      const guessPath = new URL(guess).pathname.replace(/^\/+/, "");
      if (!guessPath) {
        continue;
      }

      urls.add(new URL(`${basePath}/${guessPath}`, parsed.origin).toString());
      urls.add(new URL(`${basePath}/${toPascalCasePathSegment(guessPath)}`, parsed.origin).toString());
    }

    return [...urls];
  } catch {
    return [] as string[];
  }
}

function buildSameBrandSubdomainGuessedCandidates(input: {
  homepageUrl: string;
  localeHints: string[];
  sourceUrls: string[];
}) {
  const candidates: DiscoveryCandidateDraft[] = [];

  for (const sourceUrl of dedupe(input.sourceUrls)) {
    const sourceLocaleHints = getSameBrandGuessLocaleHints(sourceUrl, input.localeHints);

    for (const pageType of getSupportedKeyPageTypes()) {
      const guessedUrls = buildRelativeGuessedUrls(sourceUrl, pageType, sourceLocaleHints);

      for (const guessedUrl of dedupe(guessedUrls)) {
        if (getHostRelation(guessedUrl, input.homepageUrl) !== "same_brand_subdomain") {
          continue;
        }

        const scored = scoreCandidate({
          anchorText: null,
          candidateUrl: guessedUrl,
          discoveredFrom: "same_brand_subdomain",
          localeHints: sourceLocaleHints,
          pageType,
          sourceUrl
        });

        candidates.push({
          anchorText: null,
          candidateScore: scored.candidateScore,
          candidateUrl: guessedUrl,
          discoveredFrom: "same_brand_subdomain",
          hostRelation: "same_brand_subdomain",
          localeHints: sourceLocaleHints,
          pageType,
          pageTypeConfidence: scored.pageTypeConfidence,
          sourceUrl
        });
      }
    }
  }

  return candidates;
}

function limitSameBrandCandidatesPerType(candidates: DiscoveryCandidateDraft[]) {
  const direct = candidates.filter((candidate) => candidate.discoveredFrom !== "same_brand_subdomain");
  const sameBrand = candidates.filter((candidate) => candidate.discoveredFrom === "same_brand_subdomain");
  const grouped = new Map<KeyPageType, DiscoveryCandidateDraft[]>();

  for (const candidate of sameBrand) {
    grouped.set(candidate.pageType, [...(grouped.get(candidate.pageType) ?? []), candidate]);
  }

  const selectedSameBrand = [...grouped.entries()].flatMap(([, group]) =>
    group
      .sort((left, right) => {
        const leftHasAnchor = left.anchorText && left.anchorText.trim().length > 0 ? 1 : 0;
        const rightHasAnchor = right.anchorText && right.anchorText.trim().length > 0 ? 1 : 0;
        if (leftHasAnchor !== rightHasAnchor) {
          return rightHasAnchor - leftHasAnchor;
        }

        const leftDepth = getSourceUrlDepth(left.sourceUrl);
        const rightDepth = getSourceUrlDepth(right.sourceUrl);
        if (leftDepth !== rightDepth) {
          return rightDepth - leftDepth;
        }

        return right.candidateScore - left.candidateScore;
      })
      .slice(0, KEY_PAGE_DISCOVERY_BUDGETS.maxSameBrandCandidatesPerType)
  );

  return [...direct, ...selectedSameBrand];
}

function getSourceUrlDepth(sourceUrl: string | null) {
  if (!sourceUrl) {
    return 0;
  }

  try {
    return new URL(sourceUrl).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function isSameDocumentLink(candidateUrl: string, pageUrl: string) {
  try {
    const candidate = new URL(candidateUrl);
    const page = new URL(pageUrl);
    return candidate.hostname === page.hostname && candidate.pathname.replace(/\/+$/, "") === page.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

async function fetchSameBrandSubdomainCandidates(input: {
  homepageUrl: string;
  localeHints: string[];
  renderedLinks: LinkLike[];
  robotsPolicy?: RobotsPolicy | null;
  sitemapUrls: string[];
}) {
  const hosts = collectSameBrandSubdomainOrigins({
    homepageUrl: input.homepageUrl,
    renderedLinks: input.renderedLinks,
    sitemapUrls: input.sitemapUrls
  });
  const states: KeyPageDiscoveryState[] = [];

  for (const originUrl of hosts) {
    const fetched = await fetchTextPage(originUrl, 2, {
      bypassRobots: true,
      robotsPolicy: null
    }).catch(() => null);

    if (!fetched || (fetched.status ?? 0) < 200 || (fetched.status ?? 0) >= 400 || !fetched.body.trim()) {
      continue;
    }

    const subdomainLinks = extractLinks(fetched.body, fetched.finalUrl || originUrl);
    if (subdomainLinks.length === 0) {
      continue;
    }
    const dedupedSubdomainLinks = dedupeLinksByHref(subdomainLinks);

    const subdomainLocaleHints = dedupe([
      ...input.localeHints,
      ...inferLocaleHints({
        homepageLanguage: extractLanguage(fetched.body),
        homepageUrl: fetched.finalUrl || originUrl,
        links: dedupedSubdomainLinks
      })
    ]);

    const renderedDiscovery = buildRenderedLinkCandidates({
      discoveredFrom: "same_brand_subdomain",
      homepageUrl: input.homepageUrl,
      links: dedupedSubdomainLinks,
      localeHints: subdomainLocaleHints,
      sourceUrl: fetched.finalUrl || originUrl
    });

    const secondHopHubs = dedupedSubdomainLinks
      .filter((link) => !isSameDocumentLink(link.href, fetched.finalUrl || originUrl))
      .map((link) => ({
        href: link.href,
        text: link.text,
        score: scoreSameBrandSubdomainHubCandidate({
          anchorText: link.text,
          candidateUrl: link.href,
          originUrl: fetched.finalUrl || originUrl
        })
      }))
      .filter((candidate) => candidate.score >= SAME_BRAND_SUBDOMAIN_HUB_FETCH_MIN_SCORE)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_SAME_BRAND_SUBDOMAIN_HUB_FETCHES_PER_HOST);

    let secondHopCandidates: DiscoveryCandidateDraft[] = [];
    const eligibleSecondHopSourceUrls: string[] = [];
    const eligibleGuessedSourceUrls = new Set<string>();
    for (const secondHopHub of secondHopHubs) {
      const secondHopFetched = await fetchTextPage(secondHopHub.href, 2, {
        bypassRobots: true,
        robotsPolicy: null
      }).catch(() => null);

      if (
        !secondHopFetched ||
        (secondHopFetched.status ?? 0) < 200 ||
        (secondHopFetched.status ?? 0) >= 400 ||
        !secondHopFetched.body.trim()
      ) {
        continue;
      }
      const secondHopLinks = extractLinks(secondHopFetched.body, secondHopFetched.finalUrl || secondHopHub.href);
      for (const guessSourceUrl of collectSameBrandSubdomainGuessSourceUrls({
        homepageUrl: input.homepageUrl,
        links: secondHopLinks,
        originUrl: secondHopFetched.finalUrl || secondHopHub.href
      })) {
        eligibleGuessedSourceUrls.add(guessSourceUrl);
      }
      const secondHopLocaleHints = dedupe([
        ...subdomainLocaleHints,
        ...inferLocaleHints({
          homepageLanguage: extractLanguage(secondHopFetched.body),
          homepageUrl: secondHopFetched.finalUrl || secondHopHub.href,
          links: secondHopLinks
        })
      ]);
      const secondHopRenderedDiscovery = buildRenderedLinkCandidates({
        discoveredFrom: "same_brand_subdomain",
        homepageUrl: input.homepageUrl,
        links: secondHopLinks,
        localeHints: secondHopLocaleHints,
        sourceUrl: secondHopFetched.finalUrl || secondHopHub.href
      });
      if (secondHopRenderedDiscovery.candidates.length > 0) {
        eligibleSecondHopSourceUrls.push(secondHopFetched.finalUrl || secondHopHub.href);
      }
      secondHopCandidates = [
        ...secondHopCandidates,
        ...secondHopRenderedDiscovery.candidates
      ];
    }

    const subdomainGuessedCandidates = buildSameBrandSubdomainGuessedCandidates({
      homepageUrl: input.homepageUrl,
      localeHints: subdomainLocaleHints,
      sourceUrls: [
        fetched.finalUrl || originUrl,
        ...eligibleSecondHopSourceUrls,
        ...eligibleGuessedSourceUrls
      ]
    });

    states.push({
      candidates: [...renderedDiscovery.candidates, ...secondHopCandidates, ...subdomainGuessedCandidates],
      legalHubCandidates: [],
      localeHints: subdomainLocaleHints,
      sameBrandSubdomainHostsInspected: [originUrl],
      sitemapFilesFetched: [],
      sitemapIndexUrlsFetched: [],
      sitemapUrls: []
    });
  }

  if (states.length === 0) {
    return {
      candidates: [] as DiscoveryCandidateDraft[],
      hostsInspected: [] as string[],
      localeHints: input.localeHints
    };
  }

  const merged = mergeKeyPageDiscoveryStates(states);
  return {
    candidates: limitSameBrandCandidatesPerType(merged.candidates),
    hostsInspected: merged.sameBrandSubdomainHostsInspected,
    localeHints: merged.localeHints
  };
}

function parseSitemapUrlsFromRobotsBody(body: string) {
  return dedupe(
    [...body.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)]
      .map((match) => match[1]?.trim() ?? "")
      .filter((value) => value.length > 0)
  );
}

function extractLocUrls(body: string) {
  return dedupe(
    [...body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gim)]
      .map((match) => match[1]?.trim() ?? "")
      .filter((value) => value.length > 0)
  );
}

function extractTextSitemapUrls(body: string) {
  return dedupe(
    body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line))
  );
}

function getUrlTokens(url: string) {
  try {
    const parsed = new URL(url);
    return normalizeLegalMatchText(`${decodeURIComponent(parsed.pathname)} ${decodeURIComponent(parsed.search)}`);
  } catch {
    return normalizeLegalMatchText(url);
  }
}

function getUrlPathDepth(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function scoreCandidate(input: {
  anchorText: string | null;
  candidateUrl: string;
  discoveredFrom: KeyPageDiscoverySource;
  localeHints: string[];
  pageType: KeyPageType;
  sourceUrl: string | null;
}) {
  const localizedKeywords = getLocalizedKeywords(input.pageType, input.localeHints);
  const guessedPaths = getLocalizedPathGuesses({
    homepageUrl: input.sourceUrl ?? input.candidateUrl,
    localeHints: input.localeHints,
    pageType: input.pageType
  });
  const urlTokens = getUrlTokens(input.candidateUrl);
  const anchorTokens = normalizeLegalMatchText(input.anchorText ?? "");
  const exactGuessMatch = guessedPaths.some((guess) => {
    try {
      return new URL(guess).pathname === new URL(input.candidateUrl).pathname;
    } catch {
      return false;
    }
  });
  const urlKeywordScore = scoreKeywordMatches(urlTokens, localizedKeywords);
  const anchorKeywordScore = scoreKeywordMatches(anchorTokens, localizedKeywords);

  let sourceBonus = 0;
  switch (input.discoveredFrom) {
    case "rendered_link":
      sourceBonus = 22;
      break;
    case "second_hop_legal_hub":
      sourceBonus = 16;
      break;
    case "sitemap":
      sourceBonus = 12;
      break;
    case "same_brand_subdomain":
      sourceBonus = 14;
      break;
    case "guessed_slug":
      sourceBonus = -18;
      break;
  }

  let sameBrandPathBonus = 0;
  if (input.discoveredFrom === "same_brand_subdomain") {
    const pathDepth = getUrlPathDepth(input.candidateUrl);
    if (pathDepth === 2) {
      sameBrandPathBonus = 12;
    } else if (pathDepth >= 3) {
      sameBrandPathBonus = -12;
    }
  }

  let sameBrandSourceContextBonus = 0;
  if (input.discoveredFrom === "same_brand_subdomain" && input.sourceUrl) {
    const sourceTokens = getUrlTokens(input.sourceUrl);
    if (sourceTokens.includes("servis") || sourceTokens.includes("service") || sourceTokens.includes("services")) {
      sameBrandSourceContextBonus += 10;
    }
    if (sourceTokens.includes("proekty") || sourceTokens.includes("project") || sourceTokens.includes("projects")) {
      sameBrandSourceContextBonus -= 10;
    }
  }

  const candidateScore =
    sourceBonus +
    sameBrandPathBonus +
    sameBrandSourceContextBonus +
    urlKeywordScore * 2 +
    anchorKeywordScore * 3 +
    (exactGuessMatch ? 12 : 0) +
    (input.anchorText && input.anchorText.trim().length > 0 ? 4 : 0);
  const pageTypeConfidence = Math.max(
    0.1,
    Math.min(1, (urlKeywordScore * 2 + anchorKeywordScore * 3 + (exactGuessMatch ? 10 : 0)) / 120)
  );

  return {
    candidateScore,
    pageTypeConfidence
  };
}

function classifyKeyPageType(input: {
  anchorText: string | null;
  candidateUrl: string;
  localeHints: string[];
}) {
  const pageTypes = getSupportedKeyPageTypes();
  const byType = pageTypes.map((pageType) => {
    const localizedKeywords = getLocalizedKeywords(pageType, input.localeHints);
    const urlScore = scoreKeywordMatches(getUrlTokens(input.candidateUrl), localizedKeywords);
    const anchorScore = scoreKeywordMatches(input.anchorText ?? "", localizedKeywords);

    return {
      pageType,
      score: urlScore * 2 + anchorScore * 3
    };
  });

  byType.sort((left, right) => right.score - left.score);
  const best = byType[0];

  return best && best.score >= 10 ? best.pageType : null;
}

function scoreLegalHubCandidate(input: {
  anchorText: string | null;
  candidateUrl: string;
  localeHints: string[];
}) {
  const keywords = getLocalizedKeywords("legal_hub", input.localeHints);
  const urlScore = scoreKeywordMatches(getUrlTokens(input.candidateUrl), keywords);
  const anchorScore = scoreKeywordMatches(input.anchorText ?? "", keywords);
  return urlScore * 2 + anchorScore * 3;
}

function scoreSameBrandSubdomainHubCandidate(input: {
  anchorText: string | null;
  candidateUrl: string;
  originUrl: string;
}) {
  try {
    const candidate = new URL(input.candidateUrl);
    const origin = new URL(input.originUrl);
    if (candidate.hostname !== origin.hostname) {
      return -1;
    }

    const pathname = normalizeLegalMatchText(decodeURIComponent(candidate.pathname));
    if (!pathname || pathname === "/") {
      return -1;
    }

    if (candidate.search && candidate.search.length > 48) {
      return -1;
    }

    const segmentCount = candidate.pathname.split("/").filter(Boolean).length;
    const tokens = normalizeLegalMatchText(`${candidate.pathname} ${input.anchorText ?? ""}`);
    const keywordScore = SAME_BRAND_SUBDOMAIN_HUB_KEYWORDS.reduce((score, keyword) => {
      return tokens.includes(keyword) ? score + SAME_BRAND_SUBDOMAIN_HUB_KEYWORD_WEIGHTS[keyword] : score;
    }, 0);

    return keywordScore + (segmentCount <= 2 ? 10 : segmentCount === 3 ? 4 : 0);
  } catch {
    return -1;
  }
}

function collectSameBrandSubdomainGuessSourceUrls(input: {
  homepageUrl: string;
  links: LinkLike[];
  originUrl: string;
}) {
  return input.links
    .filter((link) => getHostRelation(link.href, input.homepageUrl) === "same_brand_subdomain")
    .filter((link) => !isSameDocumentLink(link.href, input.originUrl))
    .map((link) => ({
      href: link.href,
      score: scoreSameBrandSubdomainHubCandidate({
        anchorText: link.text,
        candidateUrl: link.href,
        originUrl: input.originUrl
      })
    }))
    .filter((candidate) => candidate.score >= SAME_BRAND_SUBDOMAIN_HUB_GUESS_SOURCE_MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.href);
}

function mergeCandidates(candidates: DiscoveryCandidateDraft[]) {
  const merged = new Map<string, DiscoveryCandidateDraft>();

  for (const candidate of candidates) {
    const key = `${candidate.pageType}:${candidate.candidateUrl}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, candidate);
      continue;
    }

    merged.set(key, {
      ...existing,
      anchorText: existing.anchorText ?? candidate.anchorText,
      candidateScore: Math.max(existing.candidateScore, candidate.candidateScore),
      discoveredFrom: existing.candidateScore >= candidate.candidateScore ? existing.discoveredFrom : candidate.discoveredFrom,
      hostRelation: existing.candidateScore >= candidate.candidateScore ? existing.hostRelation : candidate.hostRelation,
      localeHints: dedupe([...existing.localeHints, ...candidate.localeHints]),
      pageTypeConfidence: Math.max(existing.pageTypeConfidence, candidate.pageTypeConfidence),
      sourceUrl: existing.sourceUrl ?? candidate.sourceUrl
    });
  }

  return [...merged.values()].sort(compareDiscoveryCandidates);
}

function trimCandidatesWithTypeCoverage(candidates: DiscoveryCandidateDraft[]) {
  const selected = new Map<string, DiscoveryCandidateDraft>();
  const byType = new Map<KeyPageType, DiscoveryCandidateDraft[]>();

  for (const candidate of candidates) {
    byType.set(candidate.pageType, [...(byType.get(candidate.pageType) ?? []), candidate]);
  }

  for (const pageType of getSupportedKeyPageTypes()) {
    const group = (byType.get(pageType) ?? []).slice(0, KEY_PAGE_DISCOVERY_BUDGETS.maxCandidatesPerTypeBeforeGlobalTrim);
    for (const candidate of group) {
      selected.set(`${candidate.pageType}:${candidate.candidateUrl}`, candidate);
    }
  }

  for (const candidate of candidates) {
    if (selected.size >= KEY_PAGE_DISCOVERY_BUDGETS.maxCandidates) {
      break;
    }
    selected.set(`${candidate.pageType}:${candidate.candidateUrl}`, candidate);
  }

  return [...selected.values()].sort(compareDiscoveryCandidates).slice(0, KEY_PAGE_DISCOVERY_BUDGETS.maxCandidates);
}

function compareDiscoveryCandidates(left: DiscoveryCandidateDraft, right: DiscoveryCandidateDraft) {
  if (left.candidateScore !== right.candidateScore) {
    return right.candidateScore - left.candidateScore;
  }

  const leftCandidateDepthPreference = getPreferredPolicyPathDepth(left.candidateUrl);
  const rightCandidateDepthPreference = getPreferredPolicyPathDepth(right.candidateUrl);
  if (leftCandidateDepthPreference !== rightCandidateDepthPreference) {
    return rightCandidateDepthPreference - leftCandidateDepthPreference;
  }

  const leftSourceDepth = getSourceUrlDepth(left.sourceUrl);
  const rightSourceDepth = getSourceUrlDepth(right.sourceUrl);
  if (leftSourceDepth !== rightSourceDepth) {
    return rightSourceDepth - leftSourceDepth;
  }

  const leftFinalSegment = getFinalPathSegment(left.candidateUrl);
  const rightFinalSegment = getFinalPathSegment(right.candidateUrl);
  if (leftFinalSegment.length !== rightFinalSegment.length) {
    return leftFinalSegment.length - rightFinalSegment.length;
  }

  const leftPascalCase = isPascalCaseSegment(leftFinalSegment) ? 1 : 0;
  const rightPascalCase = isPascalCaseSegment(rightFinalSegment) ? 1 : 0;
  if (leftPascalCase !== rightPascalCase) {
    return rightPascalCase - leftPascalCase;
  }

  return left.candidateUrl.localeCompare(right.candidateUrl);
}

function getPreferredPolicyPathDepth(url: string) {
  const depth = getUrlPathDepth(url);
  if (depth === 2) {
    return 3;
  }
  if (depth === 1) {
    return 2;
  }
  if (depth === 0) {
    return 1;
  }
  return 0;
}

function getFinalPathSegment(url: string) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

function isPascalCaseSegment(value: string) {
  if (!/^[A-Z][A-Za-z0-9]+$/.test(value)) {
    return false;
  }

  const uppercaseCount = [...value].filter((character) => /[A-Z]/.test(character)).length;
  return uppercaseCount >= 2;
}

function mergeLegalHubCandidates(
  candidates: KeyPageDiscoveryState["legalHubCandidates"]
) {
  const merged = new Map<string, KeyPageDiscoveryState["legalHubCandidates"][number]>();

  for (const candidate of candidates) {
    const existing = merged.get(candidate.candidateUrl);
    if (!existing || candidate.candidateScore > existing.candidateScore) {
      merged.set(candidate.candidateUrl, candidate);
    }
  }

  return [...merged.values()].sort((left, right) => right.candidateScore - left.candidateScore);
}

function buildRenderedLinkCandidates(input: {
  discoveredFrom: Exclude<KeyPageDiscoverySource, "guessed_slug" | "sitemap">;
  homepageUrl: string;
  links: LinkLike[];
  localeHints: string[];
  sourceUrl: string | null;
}) {
  const candidates: DiscoveryCandidateDraft[] = [];
  const legalHubCandidates: KeyPageDiscoveryState["legalHubCandidates"] = [];

  for (const link of input.links) {
    const pageType = classifyKeyPageType({
      anchorText: link.text,
      candidateUrl: link.href,
      localeHints: input.localeHints
    });

    if (pageType && isAllowedCrossDomainCandidate(pageType, link.href, input.homepageUrl)) {
      const scored = scoreCandidate({
        anchorText: link.text,
        candidateUrl: link.href,
        discoveredFrom: input.discoveredFrom,
        localeHints: input.localeHints,
        pageType,
        sourceUrl: input.sourceUrl
      });
      candidates.push({
        anchorText: link.text,
        candidateScore: scored.candidateScore,
        candidateUrl: link.href,
        discoveredFrom: input.discoveredFrom,
        hostRelation: getHostRelation(link.href, input.homepageUrl) === "same_brand_subdomain" ? "same_brand_subdomain" : "same_host",
        localeHints: input.localeHints,
        pageType,
        pageTypeConfidence: scored.pageTypeConfidence,
        sourceUrl: input.sourceUrl
      });
      continue;
    }

    if (!sameHostname(link.href, input.homepageUrl)) {
      continue;
    }

    const hubScore = scoreLegalHubCandidate({
      anchorText: link.text,
      candidateUrl: link.href,
      localeHints: input.localeHints
    });

    if (hubScore >= 18) {
      legalHubCandidates.push({
        anchorText: link.text,
        candidateScore: hubScore,
        candidateUrl: link.href,
        discoveredFrom: input.discoveredFrom,
        localeHints: input.localeHints,
        sourceUrl: input.sourceUrl
      });
    }
  }

  return {
    candidates,
    legalHubCandidates
  };
}

function buildGuessedCandidates(input: {
  homepageUrl: string;
  localeHints: string[];
}) {
  const candidates: DiscoveryCandidateDraft[] = [];

  for (const pageType of getSupportedKeyPageTypes()) {
    for (const guessedUrl of getLocalizedPathGuesses({
      homepageUrl: input.homepageUrl,
      localeHints: input.localeHints,
      pageType
    })) {
      const scored = scoreCandidate({
        anchorText: null,
        candidateUrl: guessedUrl,
        discoveredFrom: "guessed_slug",
        localeHints: input.localeHints,
        pageType,
        sourceUrl: input.homepageUrl
      });

      candidates.push({
        anchorText: null,
        candidateScore: scored.candidateScore,
        candidateUrl: guessedUrl,
        discoveredFrom: "guessed_slug",
        hostRelation: "same_host",
        localeHints: input.localeHints,
        pageType,
        pageTypeConfidence: scored.pageTypeConfidence,
        sourceUrl: input.homepageUrl
      });
    }
  }

  return candidates;
}

async function fetchSitemapCandidates(input: {
  homepageUrl: string;
  localeHints: string[];
  robotsPolicy?: RobotsPolicy | null;
  sitemapUrls: string[];
}) {
  const rootQueue = [...input.sitemapUrls];
  const sitemapFilesFetched: string[] = [];
  const sitemapIndexUrlsFetched: string[] = [];
  const candidates: DiscoveryCandidateDraft[] = [];
  const childSitemapQueue: string[] = [];

  while (
    (rootQueue.length > 0 || childSitemapQueue.length > 0) &&
    sitemapFilesFetched.length < KEY_PAGE_DISCOVERY_BUDGETS.maxSitemapFiles &&
    candidates.length < KEY_PAGE_DISCOVERY_BUDGETS.maxCandidates
  ) {
    const currentUrl =
      rootQueue.length > 0 ? rootQueue.shift() ?? null : childSitemapQueue.shift() ?? null;

    if (!currentUrl) {
      break;
    }

    const fetched = await fetchTextPage(currentUrl, 2, {
      bypassRobots: true,
      robotsPolicy: sameHostname(currentUrl, input.homepageUrl) ? input.robotsPolicy : null
    }).catch(() => null);

    if (!fetched || (fetched.status ?? 0) < 200 || (fetched.status ?? 0) >= 400) {
      continue;
    }

    sitemapFilesFetched.push(currentUrl);
    const body = fetched.body.trim();

    if (/<sitemapindex[\s>]/i.test(body)) {
      sitemapIndexUrlsFetched.push(currentUrl);
      for (const childUrl of extractLocUrls(body)) {
        if (
          childSitemapQueue.length >= KEY_PAGE_DISCOVERY_BUDGETS.maxSitemapIndexChildren ||
          sitemapFilesFetched.length + childSitemapQueue.length >= KEY_PAGE_DISCOVERY_BUDGETS.maxSitemapFiles
        ) {
          break;
        }

        childSitemapQueue.push(childUrl);
      }
      continue;
    }

    const discoveredUrls = /<urlset[\s>]/i.test(body) ? extractLocUrls(body) : extractTextSitemapUrls(body);
    for (const discoveredUrl of discoveredUrls) {
      const pageType = classifyKeyPageType({
        anchorText: null,
        candidateUrl: discoveredUrl,
        localeHints: input.localeHints
      });

      if (!pageType || !isAllowedCrossDomainCandidate(pageType, discoveredUrl, input.homepageUrl)) {
        continue;
      }

      const scored = scoreCandidate({
        anchorText: null,
        candidateUrl: discoveredUrl,
        discoveredFrom: "sitemap",
        localeHints: input.localeHints,
        pageType,
        sourceUrl: currentUrl
      });

      candidates.push({
        anchorText: null,
        candidateScore: scored.candidateScore,
        candidateUrl: discoveredUrl,
        discoveredFrom: "sitemap",
        hostRelation: getHostRelation(discoveredUrl, input.homepageUrl) === "same_brand_subdomain" ? "same_brand_subdomain" : "same_host",
        localeHints: input.localeHints,
        pageType,
        pageTypeConfidence: scored.pageTypeConfidence,
        sourceUrl: currentUrl
      });

      if (candidates.length >= KEY_PAGE_DISCOVERY_BUDGETS.maxCandidates) {
        break;
      }
    }
  }

  return {
    candidates,
    sitemapFilesFetched,
    sitemapIndexUrlsFetched
  };
}

export async function buildKeyPageDiscoveryState(input: {
  homepageLanguage?: string | null;
  homepageUrl: string;
  renderedLinks: LinkLike[];
  robotsPolicy?: RobotsPolicy | null;
  robotsTxtBody?: string | null;
  sitemapUrls?: string[] | null;
  sourceUrl?: string | null;
  renderedSource: Exclude<KeyPageDiscoverySource, "guessed_slug" | "sitemap">;
}) : Promise<KeyPageDiscoveryState> {
  const localeHints = inferLocaleHints({
    homepageLanguage: input.homepageLanguage,
    homepageUrl: input.homepageUrl,
    links: input.renderedLinks
  });
  const explicitSitemapUrls = dedupe([...(input.sitemapUrls ?? []), ...parseSitemapUrlsFromRobotsBody(input.robotsTxtBody ?? "")]);
  const renderedDiscovery = buildRenderedLinkCandidates({
    discoveredFrom: input.renderedSource,
    homepageUrl: input.homepageUrl,
    links: input.renderedLinks,
    localeHints,
    sourceUrl: input.sourceUrl ?? input.homepageUrl
  });
  const sitemapDiscovery = explicitSitemapUrls.length
    ? await fetchSitemapCandidates({
        homepageUrl: input.homepageUrl,
        localeHints,
        robotsPolicy: input.robotsPolicy,
        sitemapUrls: explicitSitemapUrls
      })
    : { candidates: [] as DiscoveryCandidateDraft[], sitemapFilesFetched: [] as string[], sitemapIndexUrlsFetched: [] as string[] };
  const sameBrandSubdomainDiscovery = await fetchSameBrandSubdomainCandidates({
    homepageUrl: input.homepageUrl,
    localeHints,
    renderedLinks: input.renderedLinks,
    robotsPolicy: input.robotsPolicy,
    sitemapUrls: explicitSitemapUrls
  });

  const guessedCandidates = buildGuessedCandidates({
    homepageUrl: input.homepageUrl,
    localeHints
  });

  return {
    candidates: trimCandidatesWithTypeCoverage(mergeCandidates([
      ...renderedDiscovery.candidates,
      ...sitemapDiscovery.candidates,
      ...sameBrandSubdomainDiscovery.candidates,
      ...guessedCandidates
    ])),
    legalHubCandidates: mergeLegalHubCandidates(renderedDiscovery.legalHubCandidates),
    localeHints: dedupe([...localeHints, ...sameBrandSubdomainDiscovery.localeHints]),
    sameBrandSubdomainHostsInspected: sameBrandSubdomainDiscovery.hostsInspected,
    sitemapFilesFetched: sitemapDiscovery.sitemapFilesFetched,
    sitemapIndexUrlsFetched: sitemapDiscovery.sitemapIndexUrlsFetched,
    sitemapUrls: explicitSitemapUrls
  };
}

export function mergeKeyPageDiscoveryStates(states: KeyPageDiscoveryState[]) {
  return {
    candidates: trimCandidatesWithTypeCoverage(mergeCandidates(states.flatMap((state) => state.candidates))),
    legalHubCandidates: mergeLegalHubCandidates(states.flatMap((state) => state.legalHubCandidates)),
    localeHints: dedupe(states.flatMap((state) => state.localeHints)),
    sameBrandSubdomainHostsInspected: dedupe(states.flatMap((state) => state.sameBrandSubdomainHostsInspected)),
    sitemapFilesFetched: dedupe(states.flatMap((state) => state.sitemapFilesFetched)),
    sitemapIndexUrlsFetched: dedupe(states.flatMap((state) => state.sitemapIndexUrlsFetched)),
    sitemapUrls: dedupe(states.flatMap((state) => state.sitemapUrls))
  } satisfies KeyPageDiscoveryState;
}

export function toKeyPageFetchTargets(input: {
  attemptedUrls: Set<string>;
  candidates: DiscoveryCandidateDraft[];
  fetchedPages: Array<{ fetchStatus: FetchStatus; pageType: PageType; pageUrl: string }>;
  maxAttemptsPerType: number;
  maxTotalAttempts: number;
}) {
  const successfulTypes = new Set(
    input.fetchedPages
      .filter((page) => page.fetchStatus === "ok" || page.fetchStatus === "redirected")
      .map((page) => page.pageType)
      .filter((pageType): pageType is KeyPageType => isKeyPageType(pageType))
  );
  const attemptCountsByType = new Map<KeyPageType, number>();
  for (const candidate of input.candidates) {
    if (!input.attemptedUrls.has(candidate.candidateUrl)) {
      continue;
    }
    attemptCountsByType.set(candidate.pageType, (attemptCountsByType.get(candidate.pageType) ?? 0) + 1);
  }

  const missingTypes = getSupportedKeyPageTypes().filter((pageType) => !successfulTypes.has(pageType));
  const selected: DiscoveryCandidateDraft[] = [];

  for (const pageType of missingTypes) {
    const bestCandidate = input.candidates.find(
      (candidate) =>
        candidate.pageType === pageType &&
        !input.attemptedUrls.has(candidate.candidateUrl) &&
        (attemptCountsByType.get(pageType) ?? 0) < input.maxAttemptsPerType
    );
    if (bestCandidate) {
      selected.push(bestCandidate);
      attemptCountsByType.set(pageType, (attemptCountsByType.get(pageType) ?? 0) + 1);
    }
    if (selected.length >= input.maxTotalAttempts) {
      return selected;
    }
  }

  for (const candidate of input.candidates) {
    if (selected.length >= input.maxTotalAttempts) {
      break;
    }
    if (successfulTypes.has(candidate.pageType) || input.attemptedUrls.has(candidate.candidateUrl)) {
      continue;
    }
    if ((attemptCountsByType.get(candidate.pageType) ?? 0) >= input.maxAttemptsPerType) {
      continue;
    }
    selected.push(candidate);
    attemptCountsByType.set(candidate.pageType, (attemptCountsByType.get(candidate.pageType) ?? 0) + 1);
  }

  return selected;
}

export function buildKeyPageDiscoverySummary(input: {
  attemptedUrls: Set<string>;
  candidates: DiscoveryCandidateDraft[];
  fetchAttempts: Map<string, KeyPageFetchAttempt>;
  fetchedPages: Array<{ fetchStatus: FetchStatus; pageType: PageType; pageUrl: string }>;
  homepageUrl: string;
  localeHints: string[];
  sameBrandSubdomainHostsInspected: string[];
  sitemapFilesFetched: string[];
  sitemapIndexUrlsFetched: string[];
  sitemapUrls: string[];
}) : KeyPageDiscoverySummary {
  const successfulPagesByType = new Map<KeyPageType, string>();
  for (const page of input.fetchedPages) {
    if (!isKeyPageType(page.pageType)) {
      continue;
    }
    if ((page.fetchStatus === "ok" || page.fetchStatus === "redirected") && !successfulPagesByType.has(page.pageType)) {
      successfulPagesByType.set(page.pageType, page.pageUrl);
    }
  }

  const candidates = input.candidates.map((candidate) => {
    const fetchAttempt = input.fetchAttempts.get(candidate.candidateUrl);
    return {
      ...candidate,
      fetchAttempted: input.attemptedUrls.has(candidate.candidateUrl),
      fetchOutcome: fetchAttempt?.fetchOutcome ?? null
    } satisfies KeyPageDiscoveryCandidate;
  });

  const pageSummaries: KeyPageDiscoveryPageSummary[] = getSupportedKeyPageTypes().map((pageType) => {
    const typedCandidates = candidates.filter((candidate) => candidate.pageType === pageType);
    const attemptedCandidates = typedCandidates.filter((candidate) => candidate.fetchAttempted);
    const surfaceDetected = typedCandidates.some((candidate) => candidate.discoveredFrom !== "guessed_slug");
    const guessedOnly = typedCandidates.length > 0 && !surfaceDetected;
    const bestCandidate = typedCandidates[0] ?? null;
    const repeatedHardFailures =
      attemptedCandidates.filter((candidate) =>
        candidate.fetchOutcome && ["blocked", "error", "forbidden", "not_found", "timeout"].includes(candidate.fetchOutcome)
      ).length >= 2;
    const successfulUrl = successfulPagesByType.get(pageType) ?? null;

    let stopReason: KeyPageDiscoveryPageSummary["stopReason"];
    if (successfulUrl) {
      stopReason = "covered";
    } else if (typedCandidates.length === 0) {
      stopReason = "no_surface";
    } else if (guessedOnly) {
      stopReason = "guessed_only";
    } else if (repeatedHardFailures) {
      stopReason = "repeated_failures";
    } else if (attemptedCandidates.length > 0) {
      stopReason = "all_attempts_failed";
    } else {
      stopReason = "budget_exhausted";
    }

    return {
      attemptCount: attemptedCandidates.length,
      attemptedUrls: attemptedCandidates.map((candidate) => candidate.candidateUrl),
      bestDiscoverySource: bestCandidate?.discoveredFrom ?? null,
      guessedOnly,
      pageType,
      stopReason,
      successfulUrl,
      successfulHostRelation: successfulUrl
        ? getHostRelation(successfulUrl, input.homepageUrl) === "same_brand_subdomain"
          ? "same_brand_subdomain"
          : "same_host"
        : null,
      surfaceDetected
    };
  });

  return {
    budgets: {
      maxAdditionalFetchAttempts: KEY_PAGE_DISCOVERY_BUDGETS.maxAdditionalFetchAttempts,
      maxCandidates: KEY_PAGE_DISCOVERY_BUDGETS.maxCandidates,
      maxFetchAttemptsPerType: KEY_PAGE_DISCOVERY_BUDGETS.maxFetchAttemptsPerType,
      maxSameBrandCandidatesPerType: KEY_PAGE_DISCOVERY_BUDGETS.maxSameBrandCandidatesPerType,
      maxSameBrandSubdomainHosts: KEY_PAGE_DISCOVERY_BUDGETS.maxSameBrandSubdomainHosts,
      maxSecondHopLegalHubFetchesPerMissingType: KEY_PAGE_DISCOVERY_BUDGETS.maxSecondHopLegalHubFetchesPerMissingType,
      maxSitemapFiles: KEY_PAGE_DISCOVERY_BUDGETS.maxSitemapFiles,
      maxSitemapIndexChildren: KEY_PAGE_DISCOVERY_BUDGETS.maxSitemapIndexChildren
    },
    candidates,
    localeHints: input.localeHints,
    pageSummaries,
    sameBrandSubdomainHostsInspected: input.sameBrandSubdomainHostsInspected,
    sitemapFilesFetched: input.sitemapFilesFetched,
    sitemapIndexUrlsFetched: input.sitemapIndexUrlsFetched,
    sitemapUrls: input.sitemapUrls
  };
}
