type DbModule = typeof import("@website-signal-risk-scanner/db");

type RunRow = {
  completed_at: string | null;
  created_at: string;
  hostname: string;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  normalized_body_hash: string | null;
  run_id: string;
  scan_id: string;
  scan_outcome: string | null;
};

type FindingRow = {
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  title: string | null;
  validation_run_id: string;
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

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadRuns(db: Awaited<ReturnType<typeof loadDb>>, hostname: string, lookbackDays: number) {
  const result = await db.query<RunRow>(
    `
      select
        vr.id as run_id,
        vr.scan_id,
        vr.hostname,
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
    return new Map<string, FindingRow[]>();
  }

  const result = await db.query<FindingRow>(
    `
      select
        validation_run_id,
        rule_key,
        severity,
        title,
        page_url
      from validation_run_findings
      where validation_run_id = any($1::uuid[])
        and rule_key like 'financial_review.%'
      order by validation_run_id asc, rule_key asc
    `,
    [runIds],
    { readOnly: true }
  );

  const findingsByRunId = new Map<string, FindingRow[]>();
  for (const row of result.rows) {
    const existing = findingsByRunId.get(row.validation_run_id) ?? [];
    existing.push(row);
    findingsByRunId.set(row.validation_run_id, existing);
  }

  return findingsByRunId;
}

function pickLatestRun(rows: RunRow[], predicate: (row: RunRow) => boolean) {
  return rows.find(predicate) ?? null;
}

function toFindingKeys(rows: FindingRow[]) {
  return new Set(rows.map((row) => `${row.rule_key}:${row.severity ?? "unknown"}`));
}

async function main() {
  const hostname = getArgValue("--hostname");
  if (!hostname) {
    throw new Error("Missing required --hostname value.");
  }

  const lookbackDays = parsePositiveInt(getArgValue("--lookback-days"), 30);
  const db = await loadDb();
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

  if (!degradedRun) {
    throw new Error(`No degraded validation run found for ${hostname} in the last ${lookbackDays} day(s).`);
  }

  if (!retainedRun) {
    throw new Error(`No retained comparison run found for ${hostname} in the last ${lookbackDays} day(s).`);
  }

  const findingsByRunId = await loadFindings(db, [degradedRun.run_id, retainedRun.run_id]);
  const degradedFindings = findingsByRunId.get(degradedRun.run_id) ?? [];
  const retainedFindings = findingsByRunId.get(retainedRun.run_id) ?? [];
  const degradedKeys = toFindingKeys(degradedFindings);
  const retainedKeys = toFindingKeys(retainedFindings);

  const missingInDegraded = retainedFindings.filter(
    (finding) => !degradedKeys.has(`${finding.rule_key}:${finding.severity ?? "unknown"}`)
  );
  const retainedOnlyKeys = [...retainedKeys].filter((key) => !degradedKeys.has(key)).sort();
  const degradedOnlyKeys = [...degradedKeys].filter((key) => !retainedKeys.has(key)).sort();

  console.log(
    JSON.stringify(
      {
        hostname,
        degradedRun: {
          runId: degradedRun.run_id,
          scanId: degradedRun.scan_id,
          completedAt: degradedRun.completed_at ?? degradedRun.created_at,
          homepageStatus:
            degradedRun.homepage_fetch_http_status !== null
              ? `${degradedRun.homepage_fetch_status ?? "unknown"}:${degradedRun.homepage_fetch_http_status}`
              : (degradedRun.homepage_fetch_status ?? "unknown"),
          normalizedBodyMissing: degradedRun.normalized_body_hash === null,
          scanOutcome: degradedRun.scan_outcome
        },
        retainedRun: {
          runId: retainedRun.run_id,
          scanId: retainedRun.scan_id,
          completedAt: retainedRun.completed_at ?? retainedRun.created_at,
          homepageStatus:
            retainedRun.homepage_fetch_http_status !== null
              ? `${retainedRun.homepage_fetch_status ?? "unknown"}:${retainedRun.homepage_fetch_http_status}`
              : (retainedRun.homepage_fetch_status ?? "unknown"),
          normalizedBodyMissing: retainedRun.normalized_body_hash === null,
          scanOutcome: retainedRun.scan_outcome
        },
        degradedFindingCount: degradedFindings.length,
        retainedFindingCount: retainedFindings.length,
        missingInDegraded: missingInDegraded.map((finding) => ({
          pageUrl: finding.page_url,
          ruleKey: finding.rule_key,
          severity: finding.severity,
          title: finding.title
        })),
        degradedOnlyKeys,
        retainedOnlyKeys
      },
      null,
      2
    )
  );

  await db.closePools();
}

main().catch((error) => {
  console.error(
    "[validation-worker] failed to inspect financial claims retention",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
