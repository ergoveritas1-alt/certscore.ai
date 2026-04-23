type DbModule = typeof import("@website-signal-risk-scanner/db");

type CandidateRow = {
  hostname: string;
};

type RunRow = {
  completed_at: string | null;
  created_at: string;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  normalized_body_hash: string | null;
  run_id: string;
  scan_id: string;
  scan_outcome: string | null;
};

type FindingRow = {
  rule_key: string;
  severity: string | null;
  validation_run_id: string;
};

type HostSummary = {
  degradedMissingFinancialFindings: number;
  degradedRunId: string;
  degradedScanId: string;
  hostname: string;
  missingFindingKeys: string[];
  retainedRunId: string;
  retainedScanId: string;
};

async function loadDb() {
  const dbModule = (await import("@website-signal-risk-scanner/db")) as DbModule & {
    default?: DbModule;
  };

  return dbModule.default ?? dbModule;
}

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

async function loadCandidateHostnames(db: Awaited<ReturnType<typeof loadDb>>, input: {
  hostnameFilters: string[];
  limit: number;
  lookbackDays: number;
}) {
  const result = await db.query<CandidateRow>(
    `
      select
        d.hostname
      from scan_snapshots ss
      join scans s
        on s.id = ss.scan_id
      join domains d
        on d.id = s.domain_id
      where ss.scan_timestamp >= timezone('utc', now()) - ($1::int * interval '1 day')
        and ss.scan_outcome = 'content_capture_degraded'
      group by d.hostname
      having bool_or(coalesce(ss.financial_services_site_likely, false))
        or exists (
          select 1
          from validation_runs vr
          join validation_run_findings vrf
            on vrf.validation_run_id = vr.id
          where vr.hostname = d.hostname
            and vrf.rule_key like 'financial_review.%'
        )
      order by count(*) desc, d.hostname asc
      limit $2
    `,
    [input.lookbackDays, input.limit],
    { readOnly: true }
  );

  return result.rows
    .filter((row) => matchesHostnameFilter(row.hostname, input.hostnameFilters))
    .map((row) => row.hostname);
}

async function loadRuns(db: Awaited<ReturnType<typeof loadDb>>, hostname: string, lookbackDays: number) {
  const result = await db.query<RunRow>(
    `
      select
        vr.id as run_id,
        vr.scan_id,
        vr.created_at,
        vr.completed_at,
        ss.scan_outcome,
        ss.homepage_fetch_status,
        ss.homepage_fetch_http_status,
        ss.normalized_body_hash
      from validation_runs vr
      join scan_snapshots ss
        on ss.scan_id = vr.scan_id
      where vr.hostname = $1
        and vr.scan_id is not null
        and vr.created_at >= timezone('utc', now()) - ($2::int * interval '1 day')
      order by coalesce(vr.completed_at, vr.created_at) desc
    `,
    [hostname, lookbackDays],
    { readOnly: true }
  );

  return result.rows;
}

async function loadFindings(db: Awaited<ReturnType<typeof loadDb>>, runIds: string[]) {
  if (runIds.length === 0) {
    return new Map<string, string[]>();
  }

  const result = await db.query<FindingRow>(
    `
      select
        validation_run_id,
        rule_key,
        severity
      from validation_run_findings
      where validation_run_id = any($1::uuid[])
        and rule_key like 'financial_review.%'
      order by validation_run_id asc, rule_key asc
    `,
    [runIds],
    { readOnly: true }
  );

  const findingsByRunId = new Map<string, string[]>();
  for (const row of result.rows) {
    const keys = findingsByRunId.get(row.validation_run_id) ?? [];
    keys.push(`${row.rule_key}:${row.severity ?? "unknown"}`);
    findingsByRunId.set(row.validation_run_id, keys);
  }

  return findingsByRunId;
}

function pickLatestRun(rows: RunRow[], predicate: (row: RunRow) => boolean) {
  return rows.find(predicate) ?? null;
}

function toMissingKeys(degradedKeys: string[], retainedKeys: string[]) {
  const degraded = new Set(degradedKeys);
  return retainedKeys.filter((key) => !degraded.has(key));
}

async function buildHostSummary(
  db: Awaited<ReturnType<typeof loadDb>>,
  hostname: string,
  lookbackDays: number
): Promise<HostSummary | null> {
  const runs = await loadRuns(db, hostname, lookbackDays);
  const degradedRun =
    pickLatestRun(runs, (row) => row.scan_outcome === "content_capture_degraded") ??
    pickLatestRun(runs, (row) => row.normalized_body_hash === null);
  const retainedRun = pickLatestRun(
    runs,
    (row) =>
      row.run_id !== degradedRun?.run_id &&
      row.normalized_body_hash !== null &&
      row.scan_outcome !== "content_capture_degraded"
  );

  if (!degradedRun || !retainedRun) {
    return null;
  }

  const findingsByRunId = await loadFindings(db, [degradedRun.run_id, retainedRun.run_id]);
  const degradedKeys = findingsByRunId.get(degradedRun.run_id) ?? [];
  const retainedKeys = findingsByRunId.get(retainedRun.run_id) ?? [];
  const missingFindingKeys = toMissingKeys(degradedKeys, retainedKeys);

  return {
    degradedMissingFinancialFindings: missingFindingKeys.length,
    degradedRunId: degradedRun.run_id,
    degradedScanId: degradedRun.scan_id,
    hostname,
    missingFindingKeys,
    retainedRunId: retainedRun.run_id,
    retainedScanId: retainedRun.scan_id
  };
}

async function main() {
  const asJson = hasFlag("--json");
  const hostnameFilters = getArgValues("--hostname");
  const limit = parsePositiveInt(getArgValue("--limit"), 50);
  const lookbackDays = parsePositiveInt(getArgValue("--lookback-days"), 60);
  const db = await loadDb();

  const hostnames = await loadCandidateHostnames(db, {
    hostnameFilters,
    limit,
    lookbackDays
  });

  const summaries = (
    await Promise.all(hostnames.map((hostname) => buildHostSummary(db, hostname, lookbackDays)))
  )
    .filter((summary): summary is HostSummary => summary !== null)
    .sort((left, right) => {
      if (right.degradedMissingFinancialFindings !== left.degradedMissingFinancialFindings) {
        return right.degradedMissingFinancialFindings - left.degradedMissingFinancialFindings;
      }

      return left.hostname.localeCompare(right.hostname);
    });

  const totals = {
    affectedHosts: summaries.filter((summary) => summary.degradedMissingFinancialFindings > 0).length,
    hostCount: summaries.length,
    missingFindingCount: summaries.reduce(
      (total, summary) => total + summary.degradedMissingFinancialFindings,
      0
    )
  };

  if (asJson) {
    console.log(JSON.stringify({ summaries, totals }, null, 2));
    await db.closePools();
    return;
  }

  if (summaries.length === 0) {
    console.log("No finance-relevant degraded-vs-retained retention comparisons matched the current filters.");
    await db.closePools();
    return;
  }

  console.table(
    summaries.map((summary) => ({
      hostname: summary.hostname,
      missingFinancialFindings: summary.degradedMissingFinancialFindings,
      degradedRunId: summary.degradedRunId,
      retainedRunId: summary.retainedRunId
    }))
  );
  console.log(
    `Hosts=${totals.hostCount} AffectedHosts=${totals.affectedHosts} MissingFinancialFindings=${totals.missingFindingCount}`
  );

  for (const summary of summaries.filter((entry) => entry.degradedMissingFinancialFindings > 0)) {
    console.log(`${summary.hostname}: ${summary.missingFindingKeys.join(", ")}`);
  }

  await db.closePools();
}

main().catch((error) => {
  console.error(
    "[validation-worker] failed to summarize financial claims retention",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
