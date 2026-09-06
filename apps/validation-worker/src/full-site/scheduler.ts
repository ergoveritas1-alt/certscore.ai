import { startFullSiteCompletionEmails } from "./completion-emails";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { getDomain } from "tldts";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import {
  guardedPublicFetch,
  projectFullSiteInventory,
} from "@certscore/scan-core";
import {
  compactCrawlObservation,
  crawlExclusion,
  crawlSection,
  normalizeCrawlUrl,
  parseCrawlRobots,
  robotsAllows,
  robotsDisallowAll,
  getCrawlerProductToken,
  getCrawlerUserAgent,
  type FullSitePolicy,
  type RobotsPolicy,
} from "@website-signal-risk-scanner/shared";
import {
  query,
  withWriteTransaction,
  readFullSiteArtifact,
  reserveFullSiteDispatches,
  fullSiteInternalEnabled,
  type FullSiteCrawlRow,
} from "@website-signal-risk-scanner/db";

export async function fetchDiscoveryDocument(url: string, maxBytes: number) {
  const response = await guardedPublicFetch(
    url,
    {
      headers: { "User-Agent": getCrawlerUserAgent() },
      signal: AbortSignal.timeout(10000),
      redirect: "manual",
    },
    { maxRedirects: 0 },
  );
  const status = response.status;
  if (status >= 300) {
    await response.body?.cancel();
    return {
      status,
      text: "",
      retryAfter: response.headers.get("retry-after"),
    };
  }
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error("discovery_byte_limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  return {
    status,
    text: Buffer.concat(chunks).toString("utf8"),
    retryAfter: null,
  };
}
export function sitemapEntries(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unsupported sitemap entity declaration.");
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  const list = (v: unknown): Array<{ loc?: unknown }> =>
    Array.isArray(v)
      ? v
      : v && typeof v === "object"
        ? [v as { loc?: unknown }]
        : [];
  return {
    indexes: list(parsed.sitemapindex?.sitemap).flatMap((v) =>
      typeof v.loc === "string" ? [v.loc] : [],
    ),
    urls: list(parsed.urlset?.url).flatMap((v) =>
      typeof v.loc === "string" ? [v.loc] : [],
    ),
  };
}
export async function addFullSiteCandidates(
  scanId: string,
  candidates: Array<{ url: string; source: string }>,
) {
  return withWriteTransaction(async (client) => {
    const c = (
      await client.query<FullSiteCrawlRow>(
        `select * from full_site_crawls where scan_id=$1 for update`,
        [scanId],
      )
    ).rows[0];
    if (
      !c ||
      c.requested_json.maxPages <= 1 ||
      !["waiting_homepage", "running"].includes(c.status)
    )
      return;
    const policy = c.policy_json as FullSitePolicy;
    const existing = (
      await client.query<{ target_url: string; section: string }>(
        `select target_url,section from full_site_pages where scan_id=$1`,
        [scanId],
      )
    ).rows;
    const seen = new Set(existing.map((p) => p.target_url));
    const queryVariants = new Map<string, number>(),
      sections = new Map<string, number>();
    for (const row of existing) {
      const url = new URL(row.target_url);
      queryVariants.set(
        url.pathname,
        (queryVariants.get(url.pathname) ?? 0) + 1,
      );
      sections.set(row.section, (sections.get(row.section) ?? 0) + 1);
    }
    // Round-robin sections by already-selected count at dispatch; deterministic discovery order within a section.
    for (const item of candidates.sort((a, b) => a.url.localeCompare(b.url))) {
      if (seen.size >= policy.discoveredUrls) {
        await client.query(
          `update full_site_crawls set stop_reason=coalesce(stop_reason,'discovered_url_limit') where scan_id=$1`,
          [scanId],
        );
        break;
      }
      const normalized = normalizeCrawlUrl(item.url, `https://${c.hosts[0]}/`);
      if (!normalized) continue;
      if (seen.has(normalized)) {
        await client.query(
          `update full_site_pages set discovery_count=least(10000,discovery_count+1),
          discovery_sources=array(select distinct v from unnest(array_append(discovery_sources,$3::text)) v limit 10) where scan_id=$1 and target_url=$2`,
          [scanId, normalized, item.source],
        );
        continue;
      }
      let exclusion: string | null;
      try {
        exclusion = crawlExclusion(normalized, c.hosts);
      } catch {
        exclusion = "malformed_path";
      }
      const url = new URL(normalized),
        section = crawlSection(normalized);
      exclusion ??=
        c.robots_json &&
        !robotsAllows(normalized, c.robots_json as RobotsPolicy)
          ? "robots_disallowed"
          : null;
      exclusion ??=
        (queryVariants.get(url.pathname) ?? 0) >= policy.maxQueryVariants
          ? "query_variant_limit"
          : null;
      exclusion ??=
        (sections.get(section) ?? 0) >= policy.maxSectionPages
          ? "section_trap_limit"
          : null;
      await client.query(
        `insert into full_site_pages(id,scan_id,target_url,source,selection_reason,section,status,limitation)
        values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(scan_id,target_url) do nothing`,
        [
          randomUUID(),
          scanId,
          normalized,
          item.source,
          exclusion
            ? "Excluded by crawl scope or safety policy."
            : "Eligible public link; breadth-first section selection.",
          section,
          exclusion ? "excluded" : "queued",
          exclusion,
        ],
      );
      seen.add(normalized);
      queryVariants.set(
        url.pathname,
        (queryVariants.get(url.pathname) ?? 0) + 1,
      );
      sections.set(section, (sections.get(section) ?? 0) + 1);
    }
  });
}
async function initializeHomepage(
  c: FullSiteCrawlRow & {
    metadata_json: Record<string, any>;
    page_id: string;
    target_url: string;
    duration_ms: number | null;
  },
) {
  const pointer = c.metadata_json.artifactPointers?.scanArtifactUri;
  const metadata = c.metadata_json.artifactMetadata?.scanArtifactUri;
  if (typeof pointer !== "string" || !pointer.startsWith("s3://") || !metadata)
    throw new Error("homepage_evidence_unavailable");
  const artifact = new URL(pointer),
    key = artifact.pathname.slice(1),
    bucket = artifact.hostname;
  const bundle = canonicalEvidenceBundleSchema.parse(
    await readFullSiteArtifact({
      bucket,
      key,
      region: c.region,
      sha256: metadata.sha256,
      sizeBytes: metadata.sizeBytes,
      maxBytes: 64 * 1024 * 1024,
    }),
  );
  if (bundle.scanId !== c.scan_id)
    throw new Error("homepage_identity_mismatch");
  const context = bundle.resourceInventoryContext;
  if (!context) throw new Error("homepage_baseline_context_unavailable");
  const final = new URL(context.finalUrl),
    requested = new URL(c.target_url);
  const finalKey = getDomain(final.hostname) ?? final.hostname;
  // An alias must have been observed in the homepage's actual navigation chain and remain within the same registrable site.
  const hosts = [
    ...new Set([
      final.hostname,
      ...bundle.networkEvents
        .filter((e) => e.isMainFrame && e.resourceType === "document")
        .filter(
          (e) =>
            e.consentStateAtTime === "pre_consent" &&
            (!e.scenario || e.scenario === "fresh_pre_consent"),
        )
        .flatMap((e) => {
          try {
            const hostname = new URL(e.requestUrl).hostname;
            return (getDomain(hostname) ?? hostname) === finalKey
              ? [hostname]
              : [];
          } catch {
            return [];
          }
        }),
    ]),
  ];
  const homeModule = bundle.modulesRun.find(
    (module) => module.moduleName === "preConsentRuntimeScanner",
  );
  const runtimeLane = bundle.scanLaneRuns.find(
    (lane) => lane.laneId === "runtime_evidence",
  );
  const observation = projectFullSiteInventory({
    evidence: bundle,
    parentScanId: c.scan_id,
    pageJobId: c.page_id,
    attemptId: c.page_id,
    configurationHash: context.configurationHash,
    requestedUrl: c.target_url,
    finalUrl: context.finalUrl,
    startedAt: runtimeLane?.startedAt ?? bundle.startedAt,
    completedAt: runtimeLane?.completedAt ?? bundle.completedAt,
    profile: "homepage_baseline",
    sourceHash: metadata.sha256,
    links: context.links,
    status:
      runtimeLane?.executionOutcome === "success" &&
      runtimeLane.accessOutcome === "representative_page"
        ? "completed"
        : !runtimeLane && homeModule?.status === "completed"
          ? "completed"
          : "partial",
    limitations:
      runtimeLane?.executionOutcome === "success" &&
      runtimeLane.accessOutcome === "representative_page"
        ? []
        : ["homepage_baseline_coverage_limited"],
  });
  await withWriteTransaction(async (client) => {
    await client.query(
      `select scan_id from full_site_crawls where scan_id=$1 for update`,
      [c.scan_id],
    );
    await client.query(
      `update full_site_pages set status=$2,final_url=$3,observation_json=$4,compact_json=$5,completed_at=now(),attempt_count=1
      where id=$1 and observation_json is null`,
      [
        c.page_id,
        observation.status,
        observation.finalUrl,
        observation,
        compactCrawlObservation(observation),
      ],
    );
    await client.query(
      `update full_site_crawls set configuration_json=$2,configuration_hash=$3,hosts=$4,site_keys=$5,bucket=$6,artifact_prefix=$7,
      homepage_duration_ms=$8,status=$9,completed_at=case when $9='completed' then now() else null end,
      stop_reason=case when $9='completed' then 'max_pages_homepage_only' else stop_reason end,discovery_complete=($9='completed') where scan_id=$1 and status='waiting_homepage'`,
      [
        c.scan_id,
        context.configuration,
        context.configurationHash,
        hosts,
        [
          ...new Set([
            finalKey,
            getDomain(requested.hostname) ?? requested.hostname,
          ]),
        ],
        bucket,
        `${key.slice(0, key.lastIndexOf("/"))}/resource-crawl`,
        c.duration_ms,
        c.requested_json.maxPages === 1 ? "completed" : "running",
      ],
    );
  });
  if (c.requested_json.maxPages > 1) {
    if (["blocked", "failed"].includes(observation.status)) {
      await query(
        `update full_site_crawls set status='stopped',stop_reason='homepage_unavailable',completed_at=now() where scan_id=$1`,
        [c.scan_id],
      );
      return;
    }
    await addFullSiteCandidates(
      c.scan_id,
      context.links.map((url) => ({ url, source: "homepage_rendered_link" })),
    );
  }
}
export async function discoverSitemaps(
  c: FullSiteCrawlRow,
  fetchDocument = fetchDiscoveryDocument,
) {
  const policy = c.policy_json as FullSitePolicy;
  const base = `https://${c.hosts[0]}/`;
  const byHost: Record<string, RobotsPolicy> = {};
  for (const host of c.hosts) {
    const robots = await fetchDocument(
      `https://${host}/robots.txt`,
      policy.discoveryBytes,
    ).catch(() => {
      throw new Error("robots_unavailable_or_blocked");
    });
    if (
      (robots.status >= 300 && robots.status < 400) ||
      robots.status >= 500 ||
      robots.status === 429 ||
      robots.status === 401 ||
      robots.status === 403
    ) {
      if (robots.status === 429)
        await pauseDiscoveryRateLimit(c, robots.retryAfter);
      throw new Error("robots_unavailable_or_blocked");
    }
    try {
      byHost[host] = parseCrawlRobots(robots.text, getCrawlerProductToken());
    } catch {
      throw new Error("robots_unavailable_or_blocked");
    }
  }
  const robotPolicy: RobotsPolicy = {
    rules: [],
    byHost,
    crawlDelaySeconds: Math.max(
      0,
      ...Object.values(byHost).map((p) => p.crawlDelaySeconds),
    ),
    sitemaps: Object.values(byHost).flatMap((p) => p.sitemaps),
  };
  if (robotPolicy.crawlDelaySeconds > 300)
    throw new Error("robots_delay_exceeds_crawl_budget");
  await query(
    `update full_site_crawls set robots_json=$2,effective_wait_seconds=greatest(effective_wait_seconds,$3) where scan_id=$1`,
    [c.scan_id, robotPolicy, robotPolicy.crawlDelaySeconds],
  );
  // Re-evaluate rendered links only after robots has been retained; no dispatch occurs before discovery_complete.
  const candidates = (
    await query<{ id: string; target_url: string }>(
      `select id,target_url from full_site_pages where scan_id=$1 and status='queued' and source<>'homepage'`,
      [c.scan_id],
    )
  ).rows;
  for (const row of candidates)
    if (!robotsAllows(row.target_url, robotPolicy))
      await query(
        `update full_site_pages set status='excluded',limitation='robots_disallowed' where id=$1`,
        [row.id],
      );
  if (robotsDisallowAll(robotPolicy)) {
    await query(
      `update full_site_crawls set status='stopped',stop_reason='robots_disallowed_all',discovery_complete=true,completed_at=now() where scan_id=$1`,
      [c.scan_id],
    );
    return;
  }
  const queue = [
      ...robotPolicy.sitemaps,
      new URL("sitemap.xml", base).toString(),
    ],
    seen = new Set<string>();
  while (queue.length && seen.size < policy.sitemapDocuments) {
    const url = normalizeCrawlUrl(queue.shift()!, base);
    if (
      !url ||
      seen.has(url) ||
      !c.hosts.includes(new URL(url).hostname) ||
      !robotsAllows(url, robotPolicy)
    )
      continue;
    seen.add(url);
    const active = await query(
      `select 1 from full_site_crawls where scan_id=$1 and status='running' and started_at+((policy_json->>'wallClockSeconds')||' seconds')::interval>now()`,
      [c.scan_id],
    );
    if (!active.rowCount) return;
    const document = await fetchDocument(url, policy.discoveryBytes);
    if (document.status === 429) {
      await pauseDiscoveryRateLimit(c, document.retryAfter);
      throw new Error("sitemap_rate_limited");
    }
    if (document.status >= 300) continue;
    const parsed = sitemapEntries(document.text);
    queue.push(...parsed.indexes.slice(0, policy.sitemapDocuments));
    await addFullSiteCandidates(
      c.scan_id,
      parsed.urls.map((target) => ({ url: target, source: `sitemap:${url}` })),
    );
  }
  await query(
    `update full_site_crawls set discovery_complete=true,stop_reason=case when $2 then coalesce(stop_reason,'sitemap_document_limit') else stop_reason end where scan_id=$1`,
    [c.scan_id, queue.length > 0],
  );
}
async function pauseDiscoveryRateLimit(
  c: FullSiteCrawlRow,
  retryAfter: string | null,
) {
  const parsed = retryAfter
    ? /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : (Date.parse(retryAfter) - Date.now()) / 1000
    : 0;
  const seconds = Math.max(60, Number.isFinite(parsed) ? parsed : 0);
  await query(
    `insert into full_site_safety(site_key,backoff_until) select unnest($1::text[]),now()+($2::text||' seconds')::interval
    on conflict(site_key) do update set backoff_until=greatest(full_site_safety.backoff_until,excluded.backoff_until)`,
    [c.site_keys, seconds],
  );
}
export async function sweepFullSiteCrawls() {
  if (!fullSiteInternalEnabled()) return;
  await query(`update full_site_crawls c set status='stopped',stop_reason='wall_clock_limit',completed_at=now()
    where status in ('waiting_homepage','running') and started_at+((policy_json->>'wallClockSeconds')||' seconds')::interval<=now()`);
  await query(`update full_site_crawls c set status='cancelled',stop_reason='parent_cancelled_or_failed',completed_at=now() from scans s
    where s.id=c.scan_id and s.status in ('failed','cancelled') and c.status in ('waiting_homepage','running')`);
  await query(`update full_site_pages p set status='cancelled',limitation=c.stop_reason from full_site_crawls c
    where p.scan_id=c.scan_id and c.status in ('stopped','cancelled') and p.status in ('queued','dispatching') and p.source<>'homepage'`);
  await query(`update full_site_attempts a set status='failed',completed_at=now(),limitation='worker_lease_expired' from full_site_pages p
    where p.attempt_id=a.id and p.status='active' and p.worker_lease_until<=now() and a.status='active'`);
  await query(`update full_site_pages p set status=case when p.attempt_count<=(c.policy_json->>'maxRetries')::int and c.status='running' then 'queued' else 'failed' end,
    limitation='worker_lease_expired',completed_at=now(),token_hash=null,worker_lease_until=null,next_attempt_at=now()+interval '30 seconds'
    from full_site_crawls c where p.scan_id=c.scan_id and p.status='active' and p.worker_lease_until<=now()`);
  await query(
    `update full_site_pages set status='queued',token_hash=null,next_attempt_at=now()+interval '5 seconds' where status='dispatching' and dispatch_lease_until<=now()`,
  );
  const homes = (
    await query<
      FullSiteCrawlRow & {
        metadata_json: Record<string, any>;
        page_id: string;
        target_url: string;
        duration_ms: number | null;
      }
    >(`select c.*,e.metadata_json,p.id as page_id,p.target_url,s.duration_ms
    from full_site_crawls c join scans s on s.id=c.scan_id join full_site_pages p on p.scan_id=c.scan_id and p.source='homepage'
    join lateral(select metadata_json from scan_events where scan_id=c.scan_id and event_type='v2_lambda_result.received' and metadata_json->>'resultStatus'='completed' order by created_at desc limit 1)e on true
    where c.status='waiting_homepage' and s.status='completed' limit 3`)
  ).rows;
  for (const c of homes)
    try {
      await initializeHomepage(c);
    } catch {
      await query(
        `update full_site_crawls set status='stopped',stop_reason='homepage_baseline_unverifiable',completed_at=now() where scan_id=$1`,
        [c.scan_id],
      );
    }
  const discoveries = (
    await query<FullSiteCrawlRow>(`update full_site_crawls set discovery_lease_until=now()+interval '6 minutes'
    where scan_id in(select scan_id from full_site_crawls where status='running' and not discovery_complete and (discovery_lease_until is null or discovery_lease_until<now()) limit 2 for update skip locked) returning *`)
  ).rows;
  for (const c of discoveries)
    try {
      await discoverSitemaps(c);
    } catch (error) {
      const reason =
        error instanceof Error &&
        [
          "robots_unavailable_or_blocked",
          "robots_delay_exceeds_crawl_budget",
        ].includes(error.message)
          ? error.message
          : "discovery_unavailable_or_blocked";
      await query(
        `update full_site_crawls set status='stopped',stop_reason=$2,completed_at=now() where scan_id=$1`,
        [c.scan_id, reason],
      );
    }
  const linkPages = (
    await query<{
      id: string;
      scan_id: string;
      observation_json: { links: string[] };
    }>(`select p.id,p.scan_id,p.observation_json from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id
    where c.status='running' and c.discovery_complete and p.status in ('completed','partial') and p.source<>'homepage' and not p.links_processed and jsonb_array_length(coalesce(p.observation_json->'links','[]'::jsonb))>0 limit 10`)
  ).rows;
  for (const p of linkPages) {
    await addFullSiteCandidates(
      p.scan_id,
      p.observation_json.links.map((url) => ({
        url,
        source: `rendered_page:${p.id}`,
      })),
    );
    await query(`update full_site_pages set links_processed=true where id=$1`, [
      p.id,
    ]);
  }
  // Completed visits and exhausted discovery are independent. A page cap is explicitly a coverage limit.
  await query(`update full_site_crawls c set status='completed',completed_at=now(),
    discovery_exhausted=not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status='queued') and c.stop_reason is null,
    stop_reason=coalesce(c.stop_reason,case when exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status='queued') then 'max_pages' else 'all_discovered_eligible_targets_attempted' end)
    where c.status='running' and c.discovery_complete and not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.source<>'homepage' and (p.status in ('active','dispatching') or (p.status='queued' and p.scheduled)))
    and (not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status='queued') or (select count(*) from full_site_pages p where p.scan_id=c.scan_id and p.scheduled)>=(c.requested_json->>'maxPages')::int)
    and not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.source<>'homepage' and not p.links_processed and jsonb_array_length(coalesce(p.observation_json->'links','[]'::jsonb))>0)`);
  await query(
    `update full_site_pages p set status='cancelled',limitation='max_pages_unvisited' from full_site_crawls c where p.scan_id=c.scan_id and c.status='completed' and p.status='queued'`,
  );
}
export function startFullSiteScheduler(options: {
  enabled: boolean;
  queueUrls: Record<string, string | undefined>;
}) {
  if (!options.enabled) return;
  startFullSiteCompletionEmails();
  let running = false,
    nextIdleCheck = 0;
  const tick = async () => {
    if (!fullSiteInternalEnabled() || running || Date.now() < nextIdleCheck)
      return;
    running = true;
    try {
      const active = await query(
        `select 1 from full_site_crawls where status in ('waiting_homepage','running') union all select 1 from full_site_pages where status in ('active','dispatching') limit 1`,
      );
      if (!active.rowCount) {
        nextIdleCheck = Date.now() + 15000;
        return;
      }
      await sweepFullSiteCrawls();
      for (const job of await reserveFullSiteDispatches()) {
        const url = options.queueUrls[job.region];
        if (!url) continue;
        await new SQSClient({ region: job.region }).send(
          new SendMessageCommand({
            QueueUrl: url,
            MessageGroupId: job.pageId,
            MessageDeduplicationId: job.attemptId,
            MessageBody: JSON.stringify({
              contractVersion: "certscore.full-site-page-dispatch.v1",
              pageId: job.pageId,
              attemptId: job.attemptId,
              token: job.token,
            }),
          }),
          { abortSignal: AbortSignal.timeout(5000) },
        );
      }
    } catch (error) {
      console.error("[full-site] scheduler failure", {
        name: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
}
