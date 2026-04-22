import { query } from "@website-signal-risk-scanner/db";

type CandidateRow = {
  access_posture_class: string | null;
  backoff_until: string | null;
  completed_at: string | null;
  cooldown_until: string | null;
  financial_services_site_likely: boolean | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  hostname: string;
  identity_key: string;
  last_run_at: string | null;
  last_status: string | null;
  normalized_body_hash: string | null;
  pages_scanned: number | null;
  prior_financial_finding_count: number;
  recovered_later: boolean;
  scan_id: string;
  scan_timestamp: string | null;
  target_id: string;
  validation_run_id: string | null;
};

function getArgValues(flag: string) {
  const values: string[] = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) {
      const value = process.argv[index + 1];
      if (value) {
        values.push(value);
      }
    }
  }

  return values;
}

function getArgValue(flag: string) {
  const values = getArgValues(flag);
  return values.length > 0 ? values[values.length - 1] ?? null : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesHostnameFilter(hostname: string, filters: string[]) {
  if (filters.length === 0) {
    return true;
  }

  const normalizedHostname = hostname.toLowerCase();
  return filters.some((filter) => normalizedHostname.includes(filter.toLowerCase()));
}

async function loadCandidates(input: {
  financeOnly: boolean;
  hostnameFilters: string[];
  includeRecovered: boolean;
  limit: number;
  lookbackDays: number;
}) {
  const result = await query<CandidateRow>(
    `
      with candidate_source as (
        select
          coalesce(vr.validation_target_id, vt.id) as target_id,
          coalesce(vt.hostname, vr.hostname) as hostname,
          coalesce(vt.cooldown_until, null) as cooldown_until,
          coalesce(vt.backoff_until, null) as backoff_until,
          coalesce(vt.last_status, null) as last_status,
          coalesce(vt.last_run_at, null) as last_run_at,
          vr.id as validation_run_id,
          vr.scan_id,
          vr.completed_at,
          ss.scan_timestamp,
          ss.homepage_fetch_status,
          ss.homepage_fetch_http_status,
          ss.access_posture_class,
          ss.normalized_body_hash,
          ss.pages_scanned,
          ss.financial_services_site_likely
        from validation_runs vr
        join scan_snapshots ss
          on ss.scan_id = vr.scan_id
        left join validation_targets vt
          on vt.hostname = vr.hostname
          and vt.active = true
          and vt.denylisted = false
        where vr.scan_id is not null
          and coalesce(vr.completed_at, ss.scan_timestamp, vr.created_at) >= timezone('utc', now()) - ($1::int * interval '1 day')
          and ss.homepage_fetch_status = 'ok'
          and coalesce(ss.homepage_fetch_http_status, 200) < 400
          and coalesce(ss.pages_scanned, 0) > 0
          and ss.access_posture_class = 'tolerant'
          and ss.normalized_body_hash is null
      ),
      degraded_runs as (
        select
          candidate_source.*,
          coalesce(candidate_source.target_id::text, candidate_source.hostname) as identity_key,
          row_number() over (
            partition by coalesce(candidate_source.target_id::text, candidate_source.hostname)
            order by coalesce(candidate_source.completed_at, candidate_source.scan_timestamp) desc nulls last
          ) as row_rank
        from candidate_source
      ),
      ranked_runs as (
        select *
        from degraded_runs
        where row_rank = 1
      ),
      later_recoveries as (
        select distinct ranked.identity_key
        from ranked_runs ranked
        join validation_runs vr
          on vr.hostname = ranked.hostname
        join scan_snapshots ss
          on ss.scan_id = vr.scan_id
        where coalesce(vr.completed_at, ss.scan_timestamp, vr.created_at)
          > coalesce(ranked.completed_at, ranked.scan_timestamp)
          and ss.normalized_body_hash is not null
      )
      select
        ranked.identity_key,
        ranked.target_id,
        ranked.hostname,
        ranked.cooldown_until,
        ranked.backoff_until,
        ranked.last_status,
        ranked.last_run_at,
        ranked.validation_run_id,
        ranked.scan_id,
        ranked.completed_at,
        ranked.scan_timestamp,
        ranked.homepage_fetch_status,
        ranked.homepage_fetch_http_status,
        ranked.access_posture_class,
        ranked.normalized_body_hash,
        ranked.pages_scanned,
        ranked.financial_services_site_likely,
        exists (
          select 1
          from later_recoveries recovery
          where recovery.identity_key = ranked.identity_key
        ) as recovered_later,
        (
          select count(*)
          from validation_runs prior_vr
          join validation_run_findings prior_vrf
            on prior_vrf.validation_run_id = prior_vr.id
          where prior_vr.hostname = ranked.hostname
            and prior_vrf.rule_key like 'financial_review.%'
        )::int as prior_financial_finding_count
      from ranked_runs ranked
      where ($3::boolean = true or not exists (
        select 1
        from later_recoveries recovery
        where recovery.identity_key = ranked.identity_key
      ))
      order by
        ranked.financial_services_site_likely desc nulls last,
        prior_financial_finding_count desc,
        coalesce(ranked.completed_at, ranked.scan_timestamp) desc nulls last
      limit $2
    `,
    [input.lookbackDays, input.limit, input.includeRecovered],
    { readOnly: true }
  );

  return result.rows.filter((row) => {
    if (input.financeOnly && row.financial_services_site_likely !== true && row.prior_financial_finding_count <= 0) {
      return false;
    }

    return matchesHostnameFilter(row.hostname, input.hostnameFilters);
  });
}

async function clearTargetCooldowns(targetIds: string[]) {
  if (targetIds.length === 0) {
    return 0;
  }

  const result = await query<{ id: string }>(
    `
      update validation_targets
         set cooldown_until = null,
             backoff_until = null,
             last_error = null
       where id = any($1::uuid[])
       returning id
    `,
    [targetIds]
  );

  return result.rowCount ?? result.rows.length;
}

function printSummary(rows: CandidateRow[]) {
  if (rows.length === 0) {
    console.log("No degraded-body retry candidates matched the current filters.");
    return;
  }

  const printableRows = rows.map((row) => ({
    hostname: row.hostname,
    identityKey: row.identity_key,
    targetId: row.target_id,
    scanId: row.scan_id,
    pagesScanned: row.pages_scanned ?? 0,
    homepageStatus:
      row.homepage_fetch_http_status !== null
        ? `${row.homepage_fetch_status ?? "unknown"}:${row.homepage_fetch_http_status}`
        : (row.homepage_fetch_status ?? "unknown"),
    financialLikely: row.financial_services_site_likely === true ? "yes" : "no",
    priorFinancialFindings: row.prior_financial_finding_count,
    recoveredLater: row.recovered_later ? "yes" : "no",
    completedAt: row.completed_at ?? row.scan_timestamp ?? "n/a",
    cooldownUntil: row.cooldown_until ?? "none",
    backoffUntil: row.backoff_until ?? "none"
  }));

  console.table(printableRows);
}

async function main() {
  const financeOnly = hasFlag("--finance-only");
  const apply = hasFlag("--clear-backoff");
  const asJson = hasFlag("--json");
  const includeRecovered = hasFlag("--include-recovered");
  const hostnameFilters = getArgValues("--hostname");
  const limit = parsePositiveInt(getArgValue("--limit"), 50);
  const lookbackDays = parsePositiveInt(getArgValue("--lookback-days"), 14);

  const candidates = await loadCandidates({
    financeOnly,
    hostnameFilters,
    includeRecovered,
    limit,
    lookbackDays
  });

  if (asJson) {
    console.log(JSON.stringify({ candidates }, null, 2));
  } else {
    printSummary(candidates);
  }

  if (!apply) {
    return;
  }

  const updatedCount = await clearTargetCooldowns(candidates.map((row) => row.target_id));
  console.log(`Cleared cooldown/backoff on ${updatedCount} validation target(s).`);
}

main().catch((error) => {
  console.error(
    "[validation-worker] failed to list degraded-body retry candidates",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
