import type { FetchStatus } from "@website-signal-risk-scanner/shared";

const CERTSCORE_BOT_USER_AGENT = "CertScoreBot";
const DOMAIN_REQUEST_DELAY_MIN_MS = 1_000;
const DOMAIN_REQUEST_DELAY_MAX_MS = 3_000;

type RobotsDirective = {
  kind: "allow" | "disallow";
  pattern: string;
};

type RobotsGroup = {
  crawlDelaySeconds: number | null;
  userAgents: string[];
  directives: RobotsDirective[];
};

type RobotsMatch = {
  length: number;
  kind: "allow" | "disallow";
};

export type RobotsPolicy = {
  crawlDelayMs(userAgent?: string): number | null;
  directiveCount: number;
  fetchedAt: string;
  groupCount: number;
  hasAllowRules: boolean;
  hasDisallowRules: boolean;
  rulesLoaded: boolean;
  status: number | null;
  url: string;
  allows(url: string, userAgent?: string): boolean;
};

const lastRequestStartedAtByDomain = new Map<string, number>();
const domainQueues = new Map<string, Promise<void>>();
const domainBackoffUntilByDomain = new Map<string, number>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomDomainDelayMs() {
  const spread = DOMAIN_REQUEST_DELAY_MAX_MS - DOMAIN_REQUEST_DELAY_MIN_MS;
  return DOMAIN_REQUEST_DELAY_MIN_MS + Math.floor(Math.random() * (spread + 1));
}

function normalizeUserAgent(input: string) {
  return input.trim().toLowerCase();
}

function toDomainKey(url: string) {
  return new URL(url).hostname.toLowerCase();
}

function getPathWithQuery(url: string) {
  const parsed = new URL(url);
  return `${parsed.pathname || "/"}${parsed.search}`;
}

function stripComment(line: string) {
  const commentStart = line.indexOf("#");
  return (commentStart >= 0 ? line.slice(0, commentStart) : line).trim();
}

function parseDirective(line: string) {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim().toLowerCase();
  const value = line.slice(separatorIndex + 1).trim();

  return { key, value };
}

function parseCrawlDelaySeconds(value: string) {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function patternToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const anchored = pattern.endsWith("$") ? escaped.slice(0, -2) + "$" : escaped;
  return new RegExp(`^${anchored}`);
}

function matchDirective(pathWithQuery: string, directive: RobotsDirective): RobotsMatch | null {
  if (directive.pattern === "") {
    return directive.kind === "allow"
      ? { kind: directive.kind, length: 0 }
      : null;
  }

  const normalizedPattern = directive.pattern.startsWith("/") ? directive.pattern : `/${directive.pattern}`;
  const matcher = patternToRegExp(normalizedPattern);

  if (!matcher.test(pathWithQuery)) {
    return null;
  }

  return {
    kind: directive.kind,
    length: normalizedPattern.replace(/\*/g, "").replace(/\$$/, "").length
  };
}

function parseRobotsGroups(body: string) {
  const lines = body.split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  let currentGroups: RobotsGroup[] = [];

  for (const rawLine of lines) {
    const line = stripComment(rawLine);

    if (!line) {
      currentGroups = [];
      continue;
    }

    const directive = parseDirective(line);

    if (!directive) {
      continue;
    }

    if (directive.key === "user-agent") {
      const userAgent = normalizeUserAgent(directive.value);
      const previousGroup = currentGroups.at(-1);
      const canAppendToExistingGroup =
        previousGroup !== undefined && previousGroup.directives.length === 0;

      if (canAppendToExistingGroup) {
        previousGroup.userAgents.push(userAgent);
        currentGroups = [previousGroup];
        continue;
      }

      const group: RobotsGroup = {
        crawlDelaySeconds: null,
        userAgents: [userAgent],
        directives: []
      };

      groups.push(group);
      currentGroups = [group];
      continue;
    }

    if (directive.key === "crawl-delay") {
      const crawlDelaySeconds = parseCrawlDelaySeconds(directive.value);

      if (crawlDelaySeconds !== null) {
        for (const group of currentGroups) {
          group.crawlDelaySeconds = crawlDelaySeconds;
        }
      }

      continue;
    }

    if (directive.key !== "allow" && directive.key !== "disallow") {
      continue;
    }

    if (currentGroups.length === 0) {
      continue;
    }

    for (const group of currentGroups) {
      group.directives.push({
        kind: directive.key,
        pattern: directive.value
      });
    }
  }

  return groups;
}

function selectMatchingGroups(groups: RobotsGroup[], userAgent: string) {
  const normalizedUserAgent = normalizeUserAgent(userAgent);
  const exactMatches = groups.filter((group) =>
    group.userAgents.some((agent) => agent !== "*" && normalizedUserAgent.includes(agent))
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return groups.filter((group) => group.userAgents.includes("*"));
}

export function createRobotsPolicy(input: {
  body: string;
  fetchedAt?: string;
  status: number | null;
  url: string;
}): RobotsPolicy {
  const groups = parseRobotsGroups(input.body);

  return {
    url: input.url,
    status: input.status,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    rulesLoaded: groups.length > 0,
    groupCount: groups.length,
    directiveCount: groups.reduce((total, group) => total + group.directives.length, 0),
    hasAllowRules: groups.some((group) => group.directives.some((directive) => directive.kind === "allow")),
    hasDisallowRules: groups.some((group) => group.directives.some((directive) => directive.kind === "disallow")),
    crawlDelayMs(userAgent = CERTSCORE_BOT_USER_AGENT) {
      if (groups.length === 0) {
        return null;
      }

      const matchingGroups = selectMatchingGroups(groups, userAgent);
      const delays = matchingGroups
        .map((group) => group.crawlDelaySeconds)
        .filter((delay): delay is number => delay !== null);

      if (!matchingGroups.length || delays.length === 0) {
        return null;
      }

      return Math.ceil(Math.max(...delays) * 1000);
    },
    allows(url: string, userAgent = CERTSCORE_BOT_USER_AGENT) {
      if (groups.length === 0) {
        return true;
      }

      const matchingGroups = selectMatchingGroups(groups, userAgent);

      if (matchingGroups.length === 0) {
        return true;
      }

      const pathWithQuery = getPathWithQuery(url);
      let bestMatch: RobotsMatch | null = null;

      for (const group of matchingGroups) {
        for (const directive of group.directives) {
          const match = matchDirective(pathWithQuery, directive);

          if (!match) {
            continue;
          }

          if (
            !bestMatch ||
            match.length > bestMatch.length ||
            (match.length === bestMatch.length && match.kind === "allow" && bestMatch.kind === "disallow")
          ) {
            bestMatch = match;
          }
        }
      }

      return bestMatch?.kind !== "disallow";
    }
  };
}

export function getRobotsFetchStatus(status: number | null): FetchStatus {
  if (status === null) {
    return "error";
  }

  if (status >= 200 && status < 300) {
    return "ok";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status === 401 || status === 403) {
    return "forbidden";
  }

  return "error";
}

export function isUrlAllowedByRobots(url: string, robotsPolicy?: RobotsPolicy | null) {
  return robotsPolicy ? robotsPolicy.allows(url, CERTSCORE_BOT_USER_AGENT) : true;
}

export async function waitForDomainRequestSlot(url: string, options?: { minDelayMs?: number | null }) {
  let domainKey: string;

  try {
    domainKey = toDomainKey(url);
  } catch {
    return;
  }

  const priorQueue = domainQueues.get(domainKey) ?? Promise.resolve();
  const scheduledWork = priorQueue.catch(() => undefined).then(async () => {
    const lastStartedAt = lastRequestStartedAtByDomain.get(domainKey) ?? 0;
    const now = Date.now();
    const targetDelayMs = Math.max(randomDomainDelayMs(), options?.minDelayMs ?? 0);
    const activeBackoffUntil = domainBackoffUntilByDomain.get(domainKey) ?? 0;
    const waitMs = Math.max(0, targetDelayMs - (now - lastStartedAt), activeBackoffUntil - now);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestStartedAtByDomain.set(domainKey, Date.now());
  });

  domainQueues.set(domainKey, scheduledWork);

  try {
    await scheduledWork;
  } finally {
    if (domainQueues.get(domainKey) === scheduledWork) {
      domainQueues.delete(domainKey);
    }
  }
}

export function recordDomainBackoff(url: string, options?: { attempt?: number; retryAfterMs?: number | null }) {
  let domainKey: string;

  try {
    domainKey = toDomainKey(url);
  } catch {
    return;
  }

  const attempt = Math.max(1, options?.attempt ?? 1);
  const exponentialDelayMs = Math.min(60_000, 1_000 * 2 ** (attempt - 1));
  const appliedDelayMs = Math.max(options?.retryAfterMs ?? 0, exponentialDelayMs);
  const backoffUntil = Date.now() + appliedDelayMs;
  const existing = domainBackoffUntilByDomain.get(domainKey) ?? 0;

  if (backoffUntil > existing) {
    domainBackoffUntilByDomain.set(domainKey, backoffUntil);
  }
}
