import { reconcileStorageInventory } from "../../lib/scans/storage-inventory-reconciliation";
import { fullSiteFinalizationStartedAt } from "../../lib/scans/full-site-finalization";
import { serviceEvidencePageIds } from "../../lib/scans/service-evidence-pages";
import { serviceIntegrationGroup, groupedOrigin } from "../../lib/scans/service-integration-group";
import { summarizeDiscoveredCoverage } from "../../lib/scans/full-site-coverage";
import "server-only";
import { inventoryPurposeGroups } from "../../lib/scans/inventory-purpose-presentation";
import { identifyCrawlService, describeCrawlService } from "../../lib/scans/full-site-resource-context";
import { loadFullSiteReviewedPolicies } from "./full-site-reviewed-policies";
import { loadFullSiteRelationshipCounts } from "./full-site-relationship-counts";
import { loadFullSiteScore } from "./full-site-score";
import { wasPageNotScannedForRobots } from "../../lib/scans/full-site-crawl-limitation";
import { classifyCrawlInventoryResource } from "../../lib/scans/full-site-inventory-classification";
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
    region: (crawl.policy_json as { localExecution?: boolean }).localExecution ? "Local" : crawl.region,
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
    status: wasPageNotScannedForRobots(crawl, row)
      ? "excluded" : row.status as CrawlPage["status"],
    limitation: wasPageNotScannedForRobots(crawl, row)
      ? "not_scanned_crawl_permission_unverified" : row.limitation,
    attemptCount: row.attempt_count,
    observation: row.compact_json
      ? crawlObservationSchema.parse(row.compact_json)
      : null,
  }));
  const aggregate = aggregateFullSite(state, pages);
  const score = await loadFullSiteScore(crawl, pages);
  const storageReconciliation = reconcileStorageInventory(score?.assessedStorageRecords ?? [], aggregate.resources);
  const additionalServiceIds = new Set(aggregate.resources.filter(row => row.occurrence.kind === "service" && row.homepage === "not_observed").map(row => row.occurrence.serviceId).filter(Boolean));
  const inventoryClassification = (row: (typeof aggregate.resources)[number]) =>
    ["cookie", "storage"].includes(row.occurrence.kind) && storageReconciliation.matched.has(row.occurrence.identity) ? "Non-essential" :
    row.occurrence.kind !== "embed" && row.purposes.length > 1 ? "Review" : classifyCrawlInventoryResource(row.occurrence);
  const kind = (params.get("kind") ?? "service") as CrawlOccurrence["kind"] | "all";
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
      (kind === "all" ? ["cookie", "storage", "request", "embed"].includes(row.occurrence.kind) : kind === "cookie" ? ["cookie", "storage"].includes(row.occurrence.kind) : row.occurrence.kind === kind) &&
      row.pageIds.some((id) => allowedPages.has(id)) &&
      (!additional || row.homepage === "not_observed") &&
      matchesCategory(inventoryPurposeGroups(row.purposes, row.relationships), params.get("purpose") ? inventoryPurposeGroups([params.get("purpose")!], [])[0]! : null) &&
      matchesCategory(row.relationships, params.get("relationship")) &&
      (!params.get("assessment") ||
        inventoryClassification(row) === params.get("assessment")!) &&
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
  const reviewedPolicies = await loadFullSiteReviewedPolicies(scanId);
  const serviceContexts = new Map<string, ReturnType<typeof describeCrawlService>>();
  const resourceContext = (row: (typeof aggregate.resources)[number]) => {
    const identity = identifyCrawlService(row.occurrence);
    const key = identity ? JSON.stringify([identity.entity, identity.vendor, identity.product]) : "unclassified";
    if (!serviceContexts.has(key)) serviceContexts.set(key, describeCrawlService(identity, reviewedPolicies));
    return { key, context: serviceContexts.get(key)! };
  };
  const sort = params.get("sort") ?? "priority";
  const field = sort.replace(/_desc$/, "");
  const direction = sort.endsWith("_desc") ? -1 : 1;
  const priorityRank: Record<string, number> = { "Non-essential": 0, Review: 1, Contextual: 2, Essential: 3 };
  const sortValue = (row: (typeof resources)[number]): string | number | null => {
    switch (field) {
      case "priority": return priorityRank[inventoryClassification(row)] ?? 4;
      case "vendor": return row.occurrence.vendor ?? row.occurrence.domain;
      case "label": return row.occurrence.label;
      case "purpose": return row.purposes.join(", ");
      case "policy": return resourceContext(row).context.policy.status;
      case "transfer": {
        return row.destinations.map(destination => destination.countryCode ?? destination.country ?? "").filter(Boolean).sort().join(", ") || "Location unavailable";
      }
      case "time": return row.occurrence.firstSeenMs;
      case "page": return pages.find(page => page.id === row.pageIds[0])?.url ?? null;
      case "events": return -row.eventCount;
      default: return -row.pageIds.length;
    }
  };
  // Sort the complete result before slicing, with stable ties across scroll batches.
  resources.sort((a, b) => {
    const left = sortValue(a), right = sortValue(b);
    if (left === null || right === null) return left === right ? a.key.localeCompare(b.key) : left === null ? 1 : -1;
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return direction * comparison || a.key.localeCompare(b.key);
  });
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
      httpStatus: obs?.httpStatus ?? null,
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
  const inventoryBreakdown = (field: "kind" | "assessments" | "purposes" | "relationships") => {
    const counts = new Map<string, number>();
    for (const row of inventoryRows) {
      const values = field === "kind" ? [row.occurrence.kind] : field === "purposes" ? inventoryPurposeGroups(row.purposes, row.relationships) : row[field];
      const label = field === "assessments" ? inventoryClassification(row) : values.length > 1 ? "mixed" : values[0] || "unknown";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, count]) => ({ label, count }))
      .sort((a, b) => Number(a.label.toLowerCase().startsWith("unknown")) - Number(b.label.toLowerCase().startsWith("unknown")) || b.count - a.count || a.label.localeCompare(b.label));
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
    (p) => (exportAllPages || !["excluded", "cancelled"].includes(p.status)) && (!q || p.url.toLowerCase().includes(q)) && matchesStatus(p.status),
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
  const inventoriedPages = pages.filter(page => ["completed", "partial"].includes(page.status));
  const collectionSurfaces = {
    pagesWithoutInventory: pages.filter(page => !["excluded", "cancelled", "queued", "active"].includes(page.status) && (!page.observation?.collectionSurfaces || page.observation.configurationHash !== state.configurationHash)).length,
    limitedPages: inventoriedPages.filter(page => page.observation?.collectionSurfaces?.inventory.coverage.status !== "complete" && page.observation?.collectionSurfaces).length,
    rows: inventoriedPages.flatMap(page => {
      const retained = page.observation?.collectionSurfaces;
      if (!retained || page.observation?.configurationHash !== state.configurationHash) return [];
      return retained.inventory.forms.map(form => {
        const snapshot = retained.snapshots.find(item => item.formRef === form.formRef);
        return {
          id: `${page.id}:${form.formRef}`,
          form: { ...form, pageUrl: crawlDisplayUrl(form.pageUrl) },
          capturedAt: snapshot?.capturedAt ?? page.observation!.completedAt,
          snapshot: snapshot?.status === "available" && retained.sourceSizeBytes
            ? { status: "available" as const, url: `/api/scans/${scanId}/full-site?formPage=${encodeURIComponent(page.id)}&formRef=${encodeURIComponent(form.formRef)}` }
            : { status: snapshot?.status === "withheld" ? "withheld" as const : "unavailable" as const },
        };
      });
    }),
  };
  const serviceGroups = new Map<string, { key: string; name: string; context: ReturnType<typeof describeCrawlService>; pageIds: string[]; purposes: string[]; resources: Array<{context: ReturnType<typeof describeCrawlService>; key: string; name: string; kind: string; pageIds: string[]; occurrence: (typeof resources)[number]["occurrence"]; purposes: string[]; relationships: string[]; eventCount: number; inventoryEvidence: string}> }>();
  for (const row of resources) {
    const { context } = resourceContext(row);
    const { key, name } = serviceIntegrationGroup(context.identity);
    const group = serviceGroups.get(key) ?? { key, name, context, pageIds: [], purposes: [], resources: [] };
    group.pageIds = [...new Set([...group.pageIds, ...row.pageIds])];
    group.purposes = [...new Set([...group.purposes, ...row.purposes])];
    group.resources.push({ context, key: row.key, name: row.occurrence.label, kind: row.occurrence.kind, pageIds: row.pageIds, occurrence: row.occurrence, purposes: row.purposes, relationships: row.relationships, eventCount: row.eventCount, inventoryEvidence: inventoryClassification(row) });
    serviceGroups.set(key, group);
  }
  const displayedResources = exportAllPages ? resources : resources.slice(offset, offset + limit);
  const relationshipCounts = await loadFullSiteRelationshipCounts(scanId, pages, serviceEvidencePageIds({
    localAudit: process.env.NODE_ENV !== "production" && Boolean((crawl.policy_json as {localExecution?: boolean}).localExecution),
    pages, displayedPageIds: displayedResources.map(row => row.pageIds[0]!).filter(Boolean), detailId,
  }), state.configurationHash);
  const resourcesByKey = new Map(resources.map(row => [row.key, row]));
  const destinationSummary = (row: (typeof resources)[number]) => ({
    destinations: row.destinationAssessedCount > 0 ? row.destinations : relationshipCounts.get(row.pageIds[0] ?? "")?.get(row.occurrence.id)?.destinations ?? [],
    destinationAssessedCount: row.destinationAssessedCount,
    destinationMissingCount: row.destinationMissingCount,
    destinationsTruncated: row.destinationsTruncated,
  });
  const originsByService = new Map<string, Array<import("../../lib/scans/service-origins").ServiceOrigin & { pageId: string; resourceKey: string; occurrenceId: string; eventCount: number }>>();
  for (const page of pages) {
    const summaries = relationshipCounts.get(page.id);
    if (!summaries) continue;
    for (const occurrence of page.observation?.occurrences ?? []) {
      const origins = summaries.get(occurrence.id)?.origins ?? [];
      if (!origins.length) continue;
      const identity = identifyCrawlService(occurrence);
      if (!identity) continue;
      const key = serviceIntegrationGroup(identity).key;
      const existing = originsByService.get(key) ?? [];
      for (const origin of origins) {
        const grouped = groupedOrigin(origin);
        if (grouped.key !== key) existing.push({ ...origin, ...grouped, pageId: page.id, occurrenceId: occurrence.id, eventCount: occurrence.eventCount, resourceKey: `${occurrence.kind}:${occurrence.identity}` });
      }
      originsByService.set(key, existing);
    }
  }
  return {
    finalizationStartedAt: fullSiteFinalizationStartedAt(crawl, records),
    services: [...serviceGroups.values()].map(service => ({ ...service,
      context: { ...service.context, policy: {
        ...service.context.policy,
        status: service.resources.every(row => row.context.policy.status === "mentioned") ? "mentioned" as const : service.resources.every(row => row.context.policy.status === "not_found") ? "not_found" as const : "unknown" as const,
        mentions: [...new Map(service.resources.flatMap(row => row.context.policy.mentions).map(mention => [JSON.stringify(mention), mention])).values()],
      } },
      origins: originsByService.get(service.key) ?? [],
      resources: service.resources.map(resource => {
        const aggregateRow = resourcesByKey.get(resource.key)!;
        return { ...resource, ...destinationSummary(aggregateRow) };
      }),
    })).sort((a,b) => a.name.localeCompare(b.name)),
    collectionSurfaces,
    score,
    storageReconciliation: { matched: storageReconciliation.matched.size, unmatched: storageReconciliation.unmatched },
    summary: { ...aggregate, resources: undefined },
    priorityTotals: Object.fromEntries((["cookies", "requests", "embeds"] as const).map(group => {
      const rows = aggregate.resources.filter(row => group === "cookies"
        ? ["cookie", "storage"].includes(row.occurrence.kind)
        : row.occurrence.kind === (group === "requests" ? "request" : "embed"));
      const count = (priority: string) => rows.reduce((total, row) => total +
        (inventoryClassification(row) === priority ? group !== "cookies" ? row.eventCount : 1 : 0), 0);
      return [group, { nonEssential: count("Non-essential"), review: count("Review"), contextual: count("Contextual"), essential: count("Essential") }];
    })),
    resources: {
      rows: displayedResources.map(row => ({ ...row, relationshipCount: relationshipCounts.get(row.pageIds[0] ?? "")?.get(row.occurrence.id)?.count, context: resourceContext(row).context, ...destinationSummary(row), inventoryEvidence: inventoryClassification(row), serviceOnlyAdditional: !!row.occurrence.serviceId && additionalServiceIds.has(row.occurrence.serviceId) })),
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
      .map((p) => { const observation = pages.find(page => page.id === p.id)?.observation; return { id: p.id, url: p.url, source: p.source, status: p.status, httpStatus: p.httpStatus, graphSource: observation?.runtimeGraph && observation.configurationHash === state.configurationHash ? { href: `/api/scans/${scanId}/full-site?graphPage=${p.id}`, scanId: p.id, sha256: observation.sourceHash } : undefined }; }),
    facets: {
      purposes: [
        ...new Set(
          aggregate.resources
            .filter((r) => kind === "all" ? ["cookie", "storage", "request", "embed"].includes(r.occurrence.kind) : kind === "cookie" ? ["cookie", "storage"].includes(r.occurrence.kind) : r.occurrence.kind === kind)
            .flatMap((r) =>
              r.purposes.length > 1 ? [...inventoryPurposeGroups(r.purposes, r.relationships), "mixed"] : inventoryPurposeGroups(r.purposes, r.relationships),
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
        ...new Set(aggregate.resources.map((r) => inventoryClassification(r))),
      ].sort(),
      resourceTypes: [
        ...new Set(
          aggregate.resources
            .filter((r) => kind === "all" ? ["cookie", "storage", "request", "embed"].includes(r.occurrence.kind) : kind === "cookie" ? ["cookie", "storage"].includes(r.occurrence.kind) : r.occurrence.kind === kind)
            .map((r) => r.occurrence.resourceType),
        ),
      ].sort(),
    },
    resourceGroups: Object.fromEntries(["cookie", "request", "embed"].map(kind => {
      const rows = aggregate.resources.filter(row => kind === "cookie" ? ["cookie", "storage"].includes(row.occurrence.kind) : row.occurrence.kind === kind);
      return [kind, {
        services: new Set(rows.map(row => row.occurrence.serviceId).filter(Boolean)).size,
        additionalServices: new Set(rows.filter(row => !!row.occurrence.serviceId && additionalServiceIds.has(row.occurrence.serviceId)).map(row => row.occurrence.serviceId).filter(Boolean)).size,
      }];
    })),
    inventoryMix: {
      type: inventoryBreakdown("kind"),
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
    selectedResourceDetails: resourceKey && evidence?.rows[0] ? { key: resourceKey, pageId: detailId,
      context: describeCrawlService(identifyCrawlService(evidence.rows[0]), reviewedPolicies),
      destinations: relationshipCounts.get(detailId ?? "")?.get(evidence.rows[0].id)?.destinations ?? [] } : null,
    selectedResource:
      aggregate.resources.find((r) => r.key === resourceKey) ?? null,
    coverage: summarizeDiscoveredCoverage(records.map(row => row.target_url), crawl.robots_json as RobotsPolicy | null),
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
  const report = await loadFullSiteReport(scanId, new URLSearchParams({ kind: "all" }), true);
  if (!report) return undefined;
  return {
    scope: "Full homepage audit plus additional-page resource inventories",
    scoreScope: "Full-site score",
    score: report.score,
    condition: "Fresh visit, no consent action.",
    countingScope:
      "Across observed pages; independent visits. Positive partial evidence included.",
    summary: report.summary,
    timing: report.timing,
    pages: report.pages.rows,
    resources: report.resources.rows,
    inventoryHref: `/api/scans/${scanId}/full-site`,
    pageEvidenceHrefTemplate: `/api/scans/${scanId}/full-site?detailPage={pageId}`,
  };
}
export type FullSiteReportExport = NonNullable<
  Awaited<ReturnType<typeof loadFullSiteExport>>
>;
