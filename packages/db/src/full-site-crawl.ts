import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, queryOne, withWriteTransaction } from "./postgres";

/** Private control-plane switch. Never read from request input or serialize to clients. */
export function fullSiteInternalEnabled() {
  return process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED === "1";
}

export type FullSiteCrawlRow = {
  scan_id: string;
  authorized_user_id: string;
  status: string;
  requested_json: {
    maxPages: number;
    concurrency: number;
    waitSeconds: number;
  };
  policy_json: {
    wallClockSeconds: number;
    leaseSeconds: number;
    maxRetries: number;
    maxBackoffSeconds: number;
    discoveredUrls: number;
  };
  region: string;
  configuration_json: Record<string, unknown> | null;
  configuration_hash: string | null;
  hosts: string[];
  site_keys: string[];
  robots_json: unknown;
  bucket: string | null;
  artifact_prefix: string | null;
  effective_concurrency: number;
  effective_wait_seconds: number;
  started_at: Date;
  crawl_started_at: Date | null;
  completed_at: Date | null;
  homepage_duration_ms: number | null;
  stop_reason: string | null;
  discovery_exhausted: boolean;
  discovery_complete: boolean;
  peak_workers: number;
  pause_ms: string;
};
export type FullSitePageRow = {
  id: string;
  scan_id: string;
  target_url: string;
  final_url: string | null;
  source: string;
  discovery_count: number;
  discovery_sources: string[];
  selection_reason: string;
  section: string;
  status: string;
  scheduled: boolean;
  limitation: string | null;
  attempt_count: number;
  attempt_id: string | null;
  token_hash: string | null;
  observation_json: unknown;
  compact_json: unknown;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function insertFullSiteCrawl(
  client: PoolClient,
  input: {
    scanId: string;
    userId: string;
    requested: FullSiteCrawlRow["requested_json"];
    policy: unknown;
    region: string;
    url: string;
    siteKey: string;
  },
) {
  if (!fullSiteInternalEnabled()) throw new Error("Scan option unavailable.");
  await client.query(
    `insert into full_site_crawls (scan_id,authorized_user_id,requested_json,policy_json,region,site_keys,effective_concurrency,effective_wait_seconds)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.scanId,
      input.userId,
      input.requested,
      input.policy,
      input.region,
      [input.siteKey],
      input.requested.concurrency,
      input.requested.waitSeconds,
    ],
  );
  await client.query(
    `insert into full_site_pages (id,scan_id,target_url,source,selection_reason,section,status,scheduled)
    values ($1,$2,$3,'homepage','Homepage consumes the first target slot.','/','queued',true)`,
    [randomUUID(), input.scanId, input.url],
  );
  await client.query(`insert into full_site_completion_emails(scan_id) values($1)`, [input.scanId]);
}
export async function loadFullSiteCrawl(scanId: string) {
  return queryOne<FullSiteCrawlRow>(
    `select * from full_site_crawls where scan_id=$1`,
    [scanId],
  );
}
export async function loadFullSitePages(scanId: string, detailPageId?: string) {
  return (
    await query<FullSitePageRow>(
      `select id,scan_id,target_url,final_url,source,discovery_count,discovery_sources,selection_reason,section,status,scheduled,limitation,attempt_count,attempt_id,
    ${detailPageId ? "observation_json" : "null::jsonb as observation_json"},compact_json from full_site_pages where scan_id=$1 ${detailPageId ? "and id=$2" : ""} order by created_at,id`,
      detailPageId ? [scanId, detailPageId] : [scanId],
    )
  ).rows;
}
export async function lockFullSiteKeys(client: PoolClient, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await client.query(
      `insert into full_site_safety(site_key) values ($1) on conflict do nothing`,
      [key],
    );
    await client.query(
      `select site_key from full_site_safety where site_key=$1 for update`,
      [key],
    );
  }
}
export async function claimFullSitePage(input: {
  pageId: string;
  attemptId: string;
  token: string;
  region: string;
}) {
  if (!fullSiteInternalEnabled()) return null;
  return withWriteTransaction(async (client) => {
    const initial = (
      await client.query<FullSiteCrawlRow>(
        `select c.* from full_site_crawls c join full_site_pages p on p.scan_id=c.scan_id where p.id=$1`,
        [input.pageId],
      )
    ).rows[0];
    if (!initial) return null;
    await lockFullSiteKeys(client, initial.site_keys);
    const c = (
      await client.query<FullSiteCrawlRow>(
        `select * from full_site_crawls where scan_id=$1 for update`,
        [initial.scan_id],
      )
    ).rows[0]!;
    const p = (
      await client.query<FullSitePageRow>(
        `select * from full_site_pages where id=$1 for update`,
        [input.pageId],
      )
    ).rows[0]!;
    if (
      p.attempt_id !== input.attemptId ||
      p.token_hash !== hash(input.token) ||
      p.status !== "dispatching" ||
      input.region !== c.region
    )
      return null;
    const membership = (
      await client.query(
        `select 1 from scans s join organization_members m on m.organization_id=s.organization_id
      where s.id=$1 and m.user_id=$2 and m.role in ('admin','advanced') and s.scan_config_json->>'fullSite'='true'`,
        [c.scan_id, c.authorized_user_id],
      )
    ).rowCount;
    if (!membership) {
      await stopCrawl(client, c.scan_id, "authorization_revoked");
      return null;
    }
    if (
      c.status !== "running" ||
      !c.configuration_hash ||
      !c.bucket ||
      !p.scheduled ||
      p.source === "homepage"
    )
      return null;
    const runtimeExceeded =
      Date.now() - new Date(c.started_at).getTime() >=
      c.policy_json.wallClockSeconds * 1000;
    if (runtimeExceeded) {
      await stopCrawl(client, c.scan_id, "wall_clock_limit");
      return null;
    }
    const active = (
      await client.query<{
        scan_id: string;
        requested_json: FullSiteCrawlRow["requested_json"];
        robots_json: { crawlDelaySeconds?: number } | null;
      }>(
        `select scan_id,requested_json,robots_json from full_site_crawls where site_keys && $1::text[] and status in ('waiting_homepage','running')`,
        [c.site_keys],
      )
    ).rows;
    const concurrency = Math.min(
      ...active.map((r) => r.requested_json.concurrency),
      c.requested_json.concurrency,
    );
    const wait = Math.max(
      ...active.map((r) =>
        Math.max(
          r.requested_json.waitSeconds,
          r.robots_json?.crawlDelaySeconds ?? 0,
        ),
      ),
      c.requested_json.waitSeconds,
    );
    const slots = (
      await client.query<{ count: string; own: string }>(
        `select count(*)::text as count,count(*) filter(where p.scan_id=$2)::text as own
      from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id where c.site_keys && $1::text[] and p.status='active' and p.worker_lease_until>now()`,
        [c.site_keys, c.scan_id],
      )
    ).rows[0]!;
    const pacing = (
      await client.query<{ ready: boolean }>(
        `select coalesce(bool_and((last_start_at is null or last_start_at+($2::text||' seconds')::interval<=now())
      and (backoff_until is null or backoff_until<=now())),true) as ready from full_site_safety where site_key=any($1::text[])`,
        [c.site_keys, wait],
      )
    ).rows[0]!;
    // Homepage/consent lanes have priority and keep their current complete audit topology.
    const homepages = (
      await client.query(
        `select 1 from scans s where s.status in ('queued','running') and exists
      (select 1 from unnest($1::text[]) k where s.scan_config_json->>'hostname'=k or s.scan_config_json->>'hostname' like '%.'||k) limit 1`,
        [c.site_keys],
      )
    ).rowCount;
    await client.query(
      `update full_site_crawls set effective_concurrency=$2,effective_wait_seconds=$3 where scan_id=$1`,
      [c.scan_id, concurrency, wait],
    );
    if (
      !pacing.ready ||
      homepages ||
      Number(slots.count) >= concurrency ||
      Number(slots.own) >= c.requested_json.concurrency
    ) {
      await client.query(
        `update full_site_pages set status='queued',token_hash=null,next_attempt_at=now()+($2::text||' seconds')::interval where id=$1`,
        [p.id, Math.max(wait, 1)],
      );
      return null;
    }
    await client.query(
      `update full_site_safety set last_start_at=now() where site_key=any($1::text[])`,
      [c.site_keys],
    );
    await client.query(
      `update full_site_pages set status='active',started_at=now(),worker_lease_until=now()+($2::text||' seconds')::interval,attempt_count=attempt_count+1 where id=$1`,
      [p.id, c.policy_json.leaseSeconds],
    );
    await client.query(
      `insert into full_site_attempts(id,page_id,ordinal,status,started_at) values ($1,$2,$3,'active',now())`,
      [input.attemptId, p.id, p.attempt_count + 1],
    );
    await client.query(
      `update full_site_crawls set peak_workers=greatest(peak_workers,$2),crawl_started_at=coalesce(crawl_started_at,now()) where scan_id=$1`,
      [c.scan_id, Number(slots.own) + 1],
    );
    return {
      scanId: c.scan_id,
      pageId: p.id,
      attemptId: input.attemptId,
      url: p.target_url,
      hosts: c.hosts,
      region: c.region,
      configuration: c.configuration_json,
      robots: c.robots_json,
      configurationHash: c.configuration_hash,
      bucket: c.bucket,
      artifactPrefix: c.artifact_prefix,
    };
  });
}
async function stopCrawl(client: PoolClient, scanId: string, reason: string) {
  await client.query(
    `update full_site_crawls set status='stopped',stop_reason=$2,completed_at=now() where scan_id=$1 and status in ('waiting_homepage','running')`,
    [scanId, reason],
  );
  await client.query(
    `update full_site_pages set status='cancelled',limitation=$2 where scan_id=$1 and source<>'homepage' and status in ('queued','dispatching')`,
    [scanId, reason],
  );
}
export async function completeFullSitePage(input: {
  pageId: string;
  attemptId: string;
  token: string;
  status: string;
  observation: unknown;
  compact: unknown;
  finalUrl: string | null;
  failureKind: string | null;
  retryAfterSeconds: number | null;
  artifact: unknown;
}) {
  return withWriteTransaction(async (client) => {
    const initial = (
      await client.query<FullSiteCrawlRow>(
        `select c.* from full_site_crawls c join full_site_pages p on p.scan_id=c.scan_id where p.id=$1`,
        [input.pageId],
      )
    ).rows[0];
    if (!initial) return false;
    await lockFullSiteKeys(client, initial.site_keys);
    const c = (
      await client.query<FullSiteCrawlRow>(
        `select * from full_site_crawls where scan_id=$1 for update`,
        [initial.scan_id],
      )
    ).rows[0]!;
    const p = (
      await client.query<FullSitePageRow>(
        `select * from full_site_pages where id=$1 for update`,
        [input.pageId],
      )
    ).rows[0]!;
    if (p.attempt_id !== input.attemptId || p.token_hash !== hash(input.token))
      return false;
    if (p.status !== "active")
      return ["completed", "partial", "blocked", "failed"].includes(p.status);
    const retry =
      c.status === "running" &&
      input.failureKind === "rate_limit" &&
      p.attempt_count <= c.policy_json.maxRetries;
    const backoff = Math.max(
      input.retryAfterSeconds ?? 0,
      Math.min(
        c.policy_json.maxBackoffSeconds,
        30 * 2 ** Math.min(p.attempt_count, 5),
      ),
    );
    await client.query(
      `update full_site_attempts set status=$2,completed_at=now(),artifact_json=$3,limitation=$4 where id=$1`,
      [input.attemptId, input.status, input.artifact, input.failureKind],
    );
    await client.query(
      `update full_site_pages set status=$2,completed_at=now(),final_url=$3,observation_json=$4,compact_json=$5,limitation=$6,
      worker_lease_until=null,next_attempt_at=now()+($7::text||' seconds')::interval where id=$1`,
      [
        p.id,
        retry ? "queued" : input.status,
        input.finalUrl,
        input.observation,
        input.compact,
        input.failureKind,
        backoff,
      ],
    );
    if (input.failureKind === "rate_limit") {
      await client.query(
        `update full_site_safety set backoff_until=greatest(coalesce(backoff_until,now()),now()+($2::text||' seconds')::interval) where site_key=any($1::text[])`,
        [c.site_keys, backoff],
      );
      await client.query(
        `update full_site_crawls set rate_limit_count=rate_limit_count+1,backoff_until=now()+($2::text||' seconds')::interval where scan_id=$1`,
        [c.scan_id, backoff],
      );
      if (!retry || backoff > c.policy_json.maxBackoffSeconds)
        await stopCrawl(client, c.scan_id, "rate_limit_retry_budget");
    }
    if (input.failureKind === "challenge") {
      const affected = (
        await client.query<{ scan_id: string }>(
          `select scan_id from full_site_crawls where site_keys && $1::text[] and status in ('waiting_homepage','running')`,
          [c.site_keys],
        )
      ).rows;
      for (const affectedCrawl of affected)
        await stopCrawl(
          client,
          affectedCrawl.scan_id,
          "confirmed_bot_challenge",
        );
    }
    if (
      input.failureKind === "http_error" &&
      input.status === "failed" &&
      (input.observation as { httpStatus?: number }).httpStatus === 403
    ) {
      const blocked = await client.query<{ blocked_count: number }>(
        `update full_site_crawls set blocked_count=blocked_count+1 where scan_id=$1 returning blocked_count`,
        [c.scan_id],
      );
      if (blocked.rows[0]!.blocked_count >= 3)
        await stopCrawl(client, c.scan_id, "repeated_http_blocking");
    }
    if (c.status !== "running")
      await client.query(
        `update full_site_crawls set completed_at=now() where scan_id=$1 and not exists(select 1 from full_site_pages where scan_id=$1 and status='active')`,
        [c.scan_id],
      );
    return true;
  });
}
export async function reserveFullSiteDispatches(limit = 12) {
  if (!fullSiteInternalEnabled()) return [];
  return withWriteTransaction(async (client) => {
    const rows = (
      await client.query<
        FullSitePageRow & {
          region: string;
          max_pages: number;
          site_keys: string[];
        }
      >(
        `select p.*,c.region,c.site_keys,(c.requested_json->>'maxPages')::int as max_pages
      from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id where c.status='running' and c.discovery_complete
      and p.source<>'homepage' and p.status='queued' and p.next_attempt_at<=now() and (c.backoff_until is null or c.backoff_until<=now())
      order by p.scheduled desc,(select count(*) from full_site_pages selected where selected.scan_id=p.scan_id and selected.section=p.section and selected.scheduled),p.created_at,p.target_url
      limit $1`,
        [limit],
      )
    ).rows;
    const dispatches: Array<{
      pageId: string;
      attemptId: string;
      token: string;
      region: string;
    }> = [];
    for (const row of rows) {
      await lockFullSiteKeys(client, row.site_keys);
      const restrictions = (
        await client.query<{ cap: number; wait: number }>(
          `select min((requested_json->>'concurrency')::int) as cap,
        max(greatest((requested_json->>'waitSeconds')::float,coalesce((robots_json->>'crawlDelaySeconds')::float,0))) as wait
        from full_site_crawls where site_keys && $1::text[] and status in ('waiting_homepage','running')`,
          [row.site_keys],
        )
      ).rows[0]!;
      const sharedOutstanding = Number(
        (
          await client.query<{ count: string }>(
            `select count(*)::text from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id
        where c.site_keys && $1::text[] and p.status in ('active','dispatching')`,
            [row.site_keys],
          )
        ).rows[0]!.count,
      );
      const ready = (
        await client.query<{ ready: boolean }>(
          `select coalesce(bool_and(
        (greatest(last_start_at,last_dispatch_at) is null or greatest(last_start_at,last_dispatch_at)+($2::text||' seconds')::interval<=now())
        and (backoff_until is null or backoff_until<=now())),true) as ready from full_site_safety where site_key=any($1::text[])`,
          [row.site_keys, restrictions.wait],
        )
      ).rows[0]!.ready;
      const homepages = (
        await client.query(
          `select 1 from scans s where status in ('queued','running') and exists
        (select 1 from unnest($1::text[]) k where s.scan_config_json->>'hostname'=k or s.scan_config_json->>'hostname' like '%.'||k) limit 1`,
          [row.site_keys],
        )
      ).rowCount;
      if (!ready || homepages || sharedOutstanding >= restrictions.cap)
        continue;
      const parentLock = await client.query(
        `select scan_id from full_site_crawls where scan_id=$1 and status='running' for update skip locked`,
        [row.scan_id],
      );
      if (!parentLock.rowCount) continue;
      const pageLock = await client.query(
        `select id from full_site_pages where id=$1 and status='queued' and next_attempt_at<=now() for update skip locked`,
        [row.id],
      );
      if (!pageLock.rowCount) continue;
      const outstanding = Number(
        (
          await client.query<{ count: string }>(
            `select count(*)::text from full_site_pages where scan_id=$1 and status in ('active','dispatching')`,
            [row.scan_id],
          )
        ).rows[0]!.count,
      );
      const caps = (
        await client.query<{ cap: number }>(
          `select (requested_json->>'concurrency')::int as cap from full_site_crawls where scan_id=$1`,
          [row.scan_id],
        )
      ).rows[0]!;
      if (outstanding >= caps.cap) continue;
      const used = Number(
        (
          await client.query<{ count: string }>(
            `select count(*)::text from full_site_pages where scan_id=$1 and scheduled`,
            [row.scan_id],
          )
        ).rows[0]!.count,
      );
      if (!row.scheduled && used >= row.max_pages) continue;
      const token = randomBytes(32).toString("hex"),
        attemptId = randomUUID();
      await client.query(
        `update full_site_pages set scheduled=true,status='dispatching',attempt_id=$2,token_hash=$3,dispatch_lease_until=now()+interval '120 seconds' where id=$1`,
        [row.id, attemptId, hash(token)],
      );
      await client.query(
        `update full_site_safety set last_dispatch_at=now() where site_key=any($1::text[])`,
        [row.site_keys],
      );
      dispatches.push({ pageId: row.id, attemptId, token, region: row.region });
    }
    return dispatches;
  });
}

/** A queued homepage fences new page admission; this barrier lets previously admitted workers drain. */
export async function homepageMayStartAlongsideFullSite(hostname: string) {
  return withWriteTransaction(async (client) => {
    const matches = (
      await client.query<{ site_key: string }>(
        `select site_key from full_site_safety where $1=site_key or $1 like '%.'||site_key`,
        [hostname],
      )
    ).rows;
    if (!matches.length) return true;
    const keys = matches.map((r) => r.site_key);
    await lockFullSiteKeys(client, keys);
    const active = await client.query(
      `select 1 from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id
      where c.site_keys && $1::text[] and p.status='active' and p.worker_lease_until>now() limit 1`,
      [keys],
    );
    return active.rowCount === 0;
  });
}
