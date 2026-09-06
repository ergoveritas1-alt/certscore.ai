import "server-only";
import {
  aggregateFullSite,
  robotsRestrictionMessage,
  type RobotsPolicy,
  crawlDisplayUrl,
  crawlObservationSchema,
  type CrawlPage,
  type CrawlState,
  type CrawlOccurrence,
} from "@website-signal-risk-scanner/shared";
import {
  loadFullSiteCrawl,
  loadFullSitePages,
  query,
} from "@website-signal-risk-scanner/db";

export async function loadFullSiteReport(
  scanId: string,
  params = new URLSearchParams(),
  exportAllPages = false,
) {
  const crawl = await loadFullSiteCrawl(scanId);
  if (!crawl) return null;
  const records = await loadFullSitePages(scanId);
  const state: CrawlState = {
    scanId,
    status: crawl.status as CrawlState["status"],
    requested: crawl.requested_json,
    effective: {
      concurrency: crawl.effective_concurrency,
      waitSeconds: crawl.effective_wait_seconds,
    },
    region: crawl.region,
    configurationHash: crawl.configuration_hash ?? "",
    startedAt: new Date(crawl.started_at).toISOString(),
    completedAt: crawl.completed_at
      ? new Date(crawl.completed_at).toISOString()
      : null,
    homepageDurationMs: crawl.homepage_duration_ms,
    stopReason: crawl.stop_reason,
    robotsRestriction:
      crawl.stop_reason === "robots_unavailable_or_blocked"
        ? "robots.txt could not be verified. Additional crawling was stopped."
        : crawl.stop_reason === "robots_delay_exceeds_crawl_budget"
          ? "robots.txt requires a crawl delay beyond this crawl’s budget. Additional crawling was stopped."
          : crawl.robots_json
            ? robotsRestrictionMessage(crawl.robots_json as RobotsPolicy)
            : null,
    discoveryExhausted: crawl.discovery_exhausted,
    discovered: records.length,
    peakWorkers: crawl.crawl_started_at ? crawl.peak_workers : null,
    pauseMs: null,
  };
  const pages: CrawlPage[] = records.map((row) => ({
    id: row.id,
    url: crawlDisplayUrl(row.target_url),
    finalUrl: row.final_url ? crawlDisplayUrl(row.final_url) : null,
    source: row.source.startsWith("sitemap:")
      ? `sitemap:${crawlDisplayUrl(row.source.slice(8))}`
      : row.source,
    selectionReason: row.selection_reason,
    discoveryCount: row.discovery_count,
    discoverySources: [row.source, ...row.discovery_sources].map((source) =>
      source.startsWith("sitemap:")
        ? `sitemap:${crawlDisplayUrl(source.slice(8))}`
        : source,
    ),
    status: row.status as CrawlPage["status"],
    limitation: row.limitation,
    attemptCount: row.attempt_count,
    observation: row.compact_json
      ? crawlObservationSchema.parse(row.compact_json)
      : null,
  }));
  const aggregate = aggregateFullSite(state, pages);
  const kind = (params.get("kind") ?? "service") as CrawlOccurrence["kind"];
  const q = (params.get("q") ?? "").toLowerCase().slice(0, 200),
    pageFilter = params.get("page"),
    status = params.get("status"),
    additional = params.get("additional") === "true";
  const matchesStatus = (value: string) =>
    !status ||
    (status === "observed"
      ? ["completed", "partial"].includes(value)
      : value === status);
  const allowedPages = new Set(
    pages
      .filter(
        (p) => (!pageFilter || p.id === pageFilter) && matchesStatus(p.status),
      )
      .map((p) => p.id),
  );
  const matchesCategory = (values: string[], filter: string | null) =>
    !filter ||
    (filter === "mixed"
      ? values.length > 1
      : values.length === 1 && values[0] === filter);
  let resources = aggregate.resources.filter(
    (row) =>
      row.occurrence.kind === kind &&
      row.pageIds.some((id) => allowedPages.has(id)) &&
      (!additional || row.homepage === "not_observed") &&
      matchesCategory(row.purposes, params.get("purpose")) &&
      matchesCategory(row.relationships, params.get("relationship")) &&
      (!params.get("assessment") ||
        row.assessments.includes(params.get("assessment")!)) &&
      (!params.get("confidence") ||
        row.confidences.includes(params.get("confidence")!)) &&
      (!params.get("persistence") ||
        String(row.occurrence.details.persistence ?? "unknown") ===
          params.get("persistence")) &&
      (!params.get("resourceType") ||
        row.occurrence.resourceType === params.get("resourceType")) &&
      (!q ||
        [
          row.occurrence.label,
          row.occurrence.vendor,
          row.occurrence.domain,
          ...pages.filter((p) => row.pageIds.includes(p.id)).map((p) => p.url),
        ].some((v) => v?.toLowerCase().includes(q))),
  );
  if (params.get("sort") === "label")
    resources = resources.sort((a, b) =>
      a.occurrence.label.localeCompare(b.occurrence.label),
    );
  if (params.get("sort") === "events")
    resources = resources.sort(
      (a, b) => b.eventCount - a.eventCount || a.key.localeCompare(b.key),
    );
  const offset = Math.max(
      0,
      Math.min(100000, Number.parseInt(params.get("offset") ?? "0", 10) || 0),
    ),
    limit = 50;
  const pageRows = pages.map((page) => {
    const rows = aggregate.resources.filter((row) =>
      row.pageIds.includes(page.id),
    );
    const obs =
      page.observation?.configurationHash === state.configurationHash
        ? page.observation
        : null;
    return {
      ...page,
      observation: undefined,
      evidence: page.observation
        ? {
            attemptId: page.observation.attemptId,
            sourceHash: page.observation.sourceHash,
            configurationHash: page.observation.configurationHash,
            executionProfile: page.observation.executionProfile,
          }
        : null,
      services:
        obs && ["completed", "partial"].includes(obs.status)
          ? rows.filter((r) => r.occurrence.kind === "service").length
          : null,
      cookies:
        obs && ["completed", "partial"].includes(obs.status)
          ? rows.filter((r) => r.occurrence.kind === "cookie").length
          : null,
      requestEvents:
        obs && ["completed", "partial"].includes(obs.status)
          ? obs.occurrences
              .filter((r) => r.kind === "request")
              .reduce((n, r) => n + r.eventCount, 0)
          : null,
      embedInstances:
        obs && ["completed", "partial"].includes(obs.status)
          ? obs.occurrences
              .filter((r) => r.kind === "embed")
              .reduce((n, r) => n + r.eventCount, 0)
          : null,
      additionalServices:
        aggregate.baselineComplete &&
        obs &&
        ["completed", "partial"].includes(obs.status)
          ? rows.filter(
              (r) =>
                r.occurrence.kind === "service" &&
                r.homepage === "not_observed",
            ).length
          : null,
      durationMs: obs
        ? Math.max(0, Date.parse(obs.completedAt) - Date.parse(obs.startedAt))
        : null,
      limitations: [
        ...new Set(
          [
            page.limitation,
            ...(obs?.limitations ?? []),
            ...(page.observation && !obs
              ? ["configuration_not_comparable"]
              : []),
          ].filter((v): v is string => !!v),
        ),
      ],
    };
  });
  const breakdown = (
    type: CrawlOccurrence["kind"],
    field: "purposes" | "resourceType" | "relationships" | "persistence",
  ) => {
    const counts = new Map<string, number>();
    for (const row of aggregate.resources.filter(
      (row) => row.occurrence.kind === type,
    )) {
      const label =
        field === "purposes"
          ? row.purposes.length > 1
            ? "mixed"
            : (row.purposes[0] ?? "unknown")
          : field === "relationships"
            ? row.relationships.length > 1
              ? "mixed"
              : (row.relationships[0] ?? "unknown")
            : field === "persistence"
              ? String(row.occurrence.details.persistence ?? "unknown")
              : row.occurrence.resourceType;
      counts.set(
        label,
        (counts.get(label) ?? 0) +
          (type === "request" || type === "embed" ? row.eventCount : 1),
      );
    }
    return [...counts]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  // Use the complete aggregate, independent of table filters and pagination.
  // Count each resource identity once; services group resources and scripts
  // duplicate request evidence, so neither belongs in this denominator.
  const inventoryRows = aggregate.resources.filter((row) =>
    ["cookie", "storage", "request", "embed"].includes(row.occurrence.kind),
  );
  const inventoryBreakdown = (field: "assessments" | "purposes" | "relationships") => {
    const counts = new Map<string, number>();
    for (const row of inventoryRows) {
      const values = row[field];
      const label = values.length > 1 ? "mixed" : values[0] || (field === "assessments" ? "Not assessed" : "unknown");
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const detailId = params.get("detailPage"),
    resourceKey = params.get("resource");
  let evidence: null | {
    pageId: string;
    page: (typeof pageRows)[number] | undefined;
    total: number;
    offset: number;
    rows: CrawlOccurrence[];
    attempts: unknown[];
  } = null;
  if (detailId && /^[a-f0-9-]{36}$/i.test(detailId)) {
    const [row] = await loadFullSitePages(scanId, detailId);
    if (row) {
      const observation = row.observation_json
        ? crawlObservationSchema.parse(row.observation_json)
        : null;
      const selected = (observation?.occurrences ?? []).filter(
        (o) =>
          !resourceKey ||
          `${o.kind}:${o.identity}` === resourceKey ||
          `service:${o.serviceId}` === resourceKey,
      );
      const detailOffset = Math.max(
        0,
        Number.parseInt(params.get("detailOffset") ?? "0", 10) || 0,
      );
      evidence = {
        pageId: detailId,
        page: pageRows.find((p) => p.id === detailId),
        total: selected.length,
        offset: detailOffset,
        rows: selected.slice(detailOffset, detailOffset + limit),
        attempts: (
          await query(
            `select id,ordinal,status,started_at,completed_at,limitation from full_site_attempts where page_id=$1 order by ordinal`,
            [detailId],
          )
        ).rows,
      };
    }
  }
  let filteredPages = pageRows.filter(
    (p) => (exportAllPages || p.status !== "excluded") && (!q || p.url.toLowerCase().includes(q)) && matchesStatus(p.status),
  );
  const pageSort = params.get("pageSort");
  filteredPages.sort((a, b) =>
    pageSort === "duration"
      ? (b.durationMs ?? -1) - (a.durationMs ?? -1)
      : pageSort === "services"
        ? (b.services ?? -1) - (a.services ?? -1)
        : pageSort === "status"
          ? a.status.localeCompare(b.status)
          : a.url.localeCompare(b.url),
  );
  return {
    summary: { ...aggregate, resources: undefined },
    resources: {
      rows: resources.slice(offset, offset + limit),
      total: resources.length,
      offset,
      limit,
    },
    pages: {
      rows: exportAllPages
        ? filteredPages
        : filteredPages.slice(offset, offset + limit),
      total: filteredPages.length,
      offset,
      limit,
    },
    pageChoices: pageRows
      .filter((p) => !["excluded", "cancelled"].includes(p.status))
      .map((p) => ({ id: p.id, url: p.url })),
    facets: {
      purposes: [
        ...new Set(
          aggregate.resources
            .filter((r) => r.occurrence.kind === kind)
            .flatMap((r) =>
              r.purposes.length > 1 ? [...r.purposes, "mixed"] : r.purposes,
            ),
        ),
      ].sort(),
      relationships: [
        ...new Set(
          aggregate.resources.flatMap((r) =>
            r.relationships.length > 1
              ? [...r.relationships, "mixed"]
              : r.relationships,
          ),
        ),
      ].sort(),
      confidences: [
        ...new Set(aggregate.resources.flatMap((r) => r.confidences)),
      ].sort(),
      assessments: [
        ...new Set(aggregate.resources.flatMap((r) => r.assessments)),
      ].sort(),
      resourceTypes: [
        ...new Set(
          aggregate.resources
            .filter((r) => r.occurrence.kind === kind)
            .map((r) => r.occurrence.resourceType),
        ),
      ].sort(),
    },
    inventoryMix: {
      evidence: inventoryBreakdown("assessments"),
      purpose: inventoryBreakdown("purposes"),
      relationship: inventoryBreakdown("relationships"),
    },
    charts: {
      cookies: breakdown("cookie", "purposes"),
      cookieRelationship: breakdown("cookie", "relationships"),
      cookiePersistence: breakdown("cookie", "persistence"),
      requests: breakdown("request", "resourceType"),
      requestPurpose: breakdown("request", "purposes"),
      embeds: breakdown("embed", "purposes"),
      services: breakdown("service", "purposes"),
    },
    discovery: {
      beyond: aggregate.baselineComplete
        ? aggregate.resources
            .filter(
              (r) =>
                r.occurrence.kind === "service" &&
                r.homepage === "not_observed",
            )
            .slice(0, 5)
        : [],
      widespread: aggregate.resources
        .filter((r) => r.occurrence.kind === "service")
        .slice(0, 5),
      review: pageRows
        .filter((p) => p.status !== "excluded" && ((p.additionalServices ?? 0) > 0 || p.limitations.length))
        .slice(0, 8),
    },
    evidence,
    selectedResource:
      aggregate.resources.find((r) => r.key === resourceKey) ?? null,
    timing: {
      crawlStartedAt: crawl.crawl_started_at
        ? new Date(crawl.crawl_started_at).toISOString()
        : null,
    },
  };
}
export type FullSiteReportResponse = NonNullable<
  Awaited<ReturnType<typeof loadFullSiteReport>>
>;

export async function loadFullSiteExport(scanId: string) {
  const report = await loadFullSiteReport(scanId, new URLSearchParams(), true);
  if (!report) return undefined;
  return {
    scope: "Full homepage audit plus additional-page resource inventories",
    scoreScope: "Homepage audit score",
    condition: "Fresh visit, no consent action.",
    countingScope:
      "Across observed pages; independent visits. Positive partial evidence included.",
    summary: report.summary,
    timing: report.timing,
    pages: report.pages.rows,
    inventoryHref: `/api/scans/${scanId}/full-site`,
    pageEvidenceHrefTemplate: `/api/scans/${scanId}/full-site?detailPage={pageId}`,
  };
}
export type FullSiteReportExport = NonNullable<
  Awaited<ReturnType<typeof loadFullSiteExport>>
>;
