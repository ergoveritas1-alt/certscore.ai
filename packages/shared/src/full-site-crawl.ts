import { z } from "zod";

export const FULL_SITE_CONTRACT = "certscore.full-site-inventory.v1" as const;
export const FULL_SITE_CONDITION = "Fresh visit, no consent action." as const;

/** One policy is serialized to forms and used again at every admission boundary. */
export function fullSitePolicy(env: Record<string, string | undefined> = {}) {
  function bounded(name: string, fallback: number, min: number, max: number) {
    const raw = env[`CERTSCORE_FULL_SITE_${name}`];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid CERTSCORE_FULL_SITE_${name}`);
    return value;
  }
  const maxPages = bounded("MAX_PAGES", 500, 10, 2000);
  const maxConcurrency = bounded("MAX_CONCURRENCY", 12, 4, 12);
  const minWait = bounded("MIN_WAIT_SECONDS", 5, 1, 60);
  return {
    maxPages: {
      min: 1,
      max: maxPages,
      default: bounded("DEFAULT_PAGES", 10, 1, maxPages),
    },
    concurrency: { min: 1, max: maxConcurrency, default: 4 },
    waitSeconds: { min: minWait, max: 300, default: Math.max(5, minWait) },
    discoveredUrls: bounded("MAX_DISCOVERED_URLS", 5000, maxPages, 20000),
    wallClockSeconds: bounded("MAX_SECONDS", 14400, 300, 86400),
    pageSeconds: 20,
    leaseSeconds: 30, // exceeds the inventory-only 25-second Lambda hard timeout
    maxRetries: bounded("MAX_RETRIES", 1, 0, 2),
    sitemapDocuments: 25,
    discoveryBytes: 2 * 1024 * 1024,
    maxQueryVariants: 20,
    maxSectionPages: 50,
    maxBackoffSeconds: 900,
  };
}
export type FullSitePolicy = ReturnType<typeof fullSitePolicy>;
export type CrawlOptions = {
  maxPages: number;
  concurrency: number;
  waitSeconds: number;
};
export function canUseFullSite(role: string | null | undefined) {
  return role === "admin" || role === "advanced";
}
export class FullSiteRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
    readonly field = "fullSite",
  ) {
    super(message);
  }
}
export function validateFullSiteRequest(
  input: { fullSite?: unknown; crawlOptions?: unknown },
  authorized: boolean,
  policy = fullSitePolicy(),
): { fullSite: false } | { fullSite: true; crawlOptions: CrawlOptions } {
  if (
    (input.fullSite !== undefined && input.fullSite !== false) ||
    input.crawlOptions !== undefined
  ) {
    if (!authorized)
      throw new FullSiteRequestError(
        "This scan option is unavailable.",
        403,
      );
  }
  if (input.fullSite !== undefined && typeof input.fullSite !== "boolean")
    throw new FullSiteRequestError("Invalid scan option.", 400);
  if (input.fullSite !== true) return { fullSite: false };
  const record = input.crawlOptions === undefined ? {} : input.crawlOptions;
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new FullSiteRequestError(
      "Invalid crawl options.",
      400,
      "crawlOptions",
    );
  if (
    Object.keys(record).some(
      (key) => !["maxPages", "concurrency", "waitSeconds"].includes(key),
    )
  )
    throw new FullSiteRequestError(
      "Unknown crawl option.",
      400,
      "crawlOptions",
    );
  const options = {} as CrawlOptions;
  for (const field of ["maxPages", "concurrency", "waitSeconds"] as const) {
    const raw = (record as Record<string, unknown>)[field];
    const value = raw === undefined ? policy[field].default : raw;
    const bounds = policy[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < bounds.min ||
      value > bounds.max ||
      (field !== "waitSeconds" && !Number.isSafeInteger(value))
    ) {
      throw new FullSiteRequestError(
        `${field} must be ${field === "waitSeconds" ? "a number" : "an integer"} between ${bounds.min} and ${bounds.max}.`,
        400,
        field,
      );
    }
    options[field] = value;
  }
  return { fullSite: true, crawlOptions: options };
}

const text = z.string().max(2000);
export const crawlOccurrenceSchema = z
  .object({
    id: text,
    identity: text,
    kind: z.enum([
      "service",
      "cookie",
      "request",
      "embed",
      "storage",
      "script",
    ]),
    label: text,
    vendor: text.nullable(),
    domain: text.nullable(),
    serviceId: text.nullable(),
    purpose: text,
    resourceType: text,
    relationship: text,
    confidence: text,
    assessment: text,
    eventCount: z.number().int().positive().default(1),
    firstSeenMs: z.number().finite().nonnegative().nullable(),
    evidenceRefs: z.array(text).max(20),
    graphNodeRefs: z.array(text).max(20).optional(),
    details: z.record(
      z.union([text, z.number().finite(), z.boolean(), z.null()]),
    ),
  })
  .strict();
export type CrawlOccurrence = z.infer<typeof crawlOccurrenceSchema>;
export const crawlObservationSchema = z
  .object({
    contractVersion: z.literal(FULL_SITE_CONTRACT),
    parentScanId: z.string().uuid(),
    pageJobId: z.string().uuid(),
    attemptId: z.string().uuid(),
    executionProfile: z.enum(["homepage_baseline", "inventory_only"]),
    condition: z.literal(FULL_SITE_CONDITION),
    configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestedUrl: text,
    finalUrl: text.nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    status: z.enum(["completed", "partial", "blocked", "failed"]),
    limitations: z.array(text).max(50),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    runtimeGraph: z.object({
      sourceSizeBytes: z.number().int().positive().max(64 * 1024 * 1024),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      nodeCount: z.number().int().nonnegative().max(1000),
      edgeCount: z.number().int().nonnegative().max(2000),
    }).strict().optional(),
    occurrences: z.array(crawlOccurrenceSchema).max(30000),
    links: z.array(text).max(5000),
    redirects: z.array(text).max(20),
    httpStatus: z.number().int().nullable(),
    retryAfterSeconds: z.number().nonnegative().nullable(),
    failureKind: z
      .enum([
        "rate_limit",
        "challenge",
        "http_error",
        "navigation_timeout",
        "collection_failure",
      ])
      .nullable(),
  })
  .strict();
export type CrawlObservation = z.infer<typeof crawlObservationSchema>;
export type CrawlPage = {
  id: string;
  url: string;
  finalUrl: string | null;
  source: string;
  selectionReason: string;
  status:
    | "queued"
    | "dispatching"
    | "active"
    | "completed"
    | "partial"
    | "blocked"
    | "failed"
    | "excluded"
    | "cancelled";
  discoveryCount?: number;
  discoverySources?: string[];
  limitation: string | null;
  attemptCount: number;
  observation: CrawlObservation | null;
};
export type CrawlState = {
  scanId: string;
  status:
    | "waiting_homepage"
    | "running"
    | "completed"
    | "cancelled"
    | "stopped";
  requested: CrawlOptions;
  effective: { concurrency: number; waitSeconds: number };
  region: string;
  configurationHash: string;
  startedAt: string;
  completedAt: string | null;
  homepageDurationMs: number | null;
  stopReason: string | null;
  robotsRestriction?: string | null;
  discoveryExhausted: boolean;
  discovered: number;
  peakWorkers: number | null;
  pauseMs: number | null;
};

/** Derived only from representative visits. Events and distinct identities remain different units. */
export function aggregateFullSite(state: CrawlState, pages: CrawlPage[]) {
  const home = pages.find((page) => page.source === "homepage");
  const comparable = (o: CrawlObservation) =>
    o.configurationHash === state.configurationHash &&
    o.condition === FULL_SITE_CONDITION;
  const baselineComplete =
    !!home?.observation &&
    home.observation.status === "completed" &&
    comparable(home.observation);
  const homeIds = new Set(
    home?.observation &&
    comparable(home.observation) &&
    ["completed", "partial"].includes(home.observation.status)
      ? home.observation.occurrences.map((o) => `${o.kind}:${o.identity}`)
      : [],
  );
  const resources = new Map<
    string,
    {
      key: string;
      occurrence: CrawlOccurrence;
      pageIds: string[];
      eventCount: number;
      partialPageIds: string[];
      homepage: "observed" | "not_observed" | "unknown";
      purposes: string[];
      relationships: string[];
      assessments: string[];
      confidences: string[];
    }
  >();
  const counts = {
    completed: 0,
    partial: 0,
    blockedFailed: 0,
    pending: 0,
    excluded: 0,
    active: 0,
    queued: 0,
  };
  const durations: number[] = [];
  for (const page of pages) {
    if (page.status === "completed") counts.completed++;
    else if (page.status === "partial") counts.partial++;
    else if (["blocked", "failed"].includes(page.status))
      counts.blockedFailed++;
    else if (["excluded", "cancelled"].includes(page.status)) counts.excluded++;
    else {
      counts.pending++;
      if (page.status === "active") counts.active++;
      else counts.queued++;
    }
    const obs = page.observation;
    if (
      !obs ||
      !comparable(obs) ||
      !["completed", "partial"].includes(obs.status)
    )
      continue;
    if (obs.status === "completed")
      durations.push(
        Math.max(0, Date.parse(obs.completedAt) - Date.parse(obs.startedAt)),
      );
    const eventIds = new Set<string>();
    for (const occurrence of obs.occurrences) {
      if (eventIds.has(`${occurrence.kind}:${occurrence.id}`)) continue;
      eventIds.add(`${occurrence.kind}:${occurrence.id}`);
      const key = `${occurrence.kind}:${occurrence.identity}`;
      let row = resources.get(key);
      if (!row) {
        row = {
          key,
          occurrence,
          pageIds: [],
          eventCount: 0,
          partialPageIds: [],
          homepage: homeIds.has(key)
            ? "observed"
            : baselineComplete
              ? "not_observed"
              : "unknown",
          purposes: [],
          relationships: [],
          assessments: [],
          confidences: [],
        };
        resources.set(key, row);
      }
      row.eventCount += occurrence.eventCount;
      if (!row.pageIds.includes(page.id)) row.pageIds.push(page.id);
      if (obs.status === "partial" && !row.partialPageIds.includes(page.id))
        row.partialPageIds.push(page.id);
      for (const [list, value] of [
        [row.purposes, occurrence.purpose],
        [row.relationships, occurrence.relationship],
        [row.assessments, occurrence.assessment],
        [row.confidences, occurrence.confidence],
      ] as const)
        if (!list.includes(value)) list.push(value);
    }
  }
  durations.sort((a, b) => a - b);
  const rows = [...resources.values()].sort(
    (a, b) => b.pageIds.length - a.pageIds.length || a.key.localeCompare(b.key),
  );
  const byKind = (kind: CrawlOccurrence["kind"]) =>
    rows.filter((row) => row.occurrence.kind === kind);
  const median = durations.length
    ? (durations[Math.floor((durations.length - 1) / 2)]! +
        durations[Math.floor(durations.length / 2)]!) /
      2
    : null;
  return {
    state,
    counts,
    baselineComplete,
    resources: rows,
    totals: {
      services: byKind("service").length,
      cookies: byKind("cookie").length,
      storage: byKind("storage").length,
      requestEvents: byKind("request").reduce(
        (sum, row) => sum + row.eventCount,
        0,
      ),
      embedInstances: byKind("embed").reduce(
        (sum, row) => sum + row.eventCount,
        0,
      ),
      embedServices: new Set(
        byKind("embed")
          .map((row) => row.occurrence.serviceId)
          .filter(Boolean),
      ).size,
      additionalServices: baselineComplete
        ? byKind("service").filter((row) => row.homepage === "not_observed")
            .length
        : null,
    },
    timing: {
      medianPageMs: median,
      slowestPageMs: durations.at(-1) ?? null,
      sampleCount: durations.length,
    },
  };
}
export type FullSiteAggregate = ReturnType<typeof aggregateFullSite>;

/** Compact per-page identities retain classifications and counts; raw evidence is loaded only on drill-down. */
export function compactCrawlObservation(
  observation: CrawlObservation,
): CrawlObservation {
  const groups = new Map<string, CrawlOccurrence>();
  const seen = new Set<string>();
  for (const row of observation.occurrences) {
    if (seen.has(`${row.kind}:${row.id}`)) continue;
    seen.add(`${row.kind}:${row.id}`);
    const key = JSON.stringify([
      row.kind,
      row.identity,
      row.purpose,
      row.relationship,
      row.assessment,
      row.confidence,
    ]);
    const existing = groups.get(key);
    if (existing) { existing.eventCount += row.eventCount; existing.graphNodeRefs = [...new Set([...(existing.graphNodeRefs ?? []), ...(row.graphNodeRefs ?? [])])].slice(0, 20); }
    else
      groups.set(key, {
        ...row,
        details: row.kind === "cookie" ? row.details : {},
        evidenceRefs: row.evidenceRefs.slice(0, 1),
      });
  }
  return { ...observation, links: [], occurrences: [...groups.values()] };
}
