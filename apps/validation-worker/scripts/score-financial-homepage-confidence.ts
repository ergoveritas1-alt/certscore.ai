type DbModule = typeof import("@website-signal-risk-scanner/db");

type HostCohort = "positive" | "control";

type HostTarget = {
  cohort: HostCohort;
  hostname: string;
};

type RunRow = {
  completed_at: string | null;
  created_at: string;
  normalized_body_hash: string | null;
  run_id: string;
  scan_outcome: string | null;
};

type FindingRow = {
  rule_key: string;
  severity: string | null;
  validation_run_id: string;
};

type HostEvaluation = {
  cohort: HostCohort;
  financialFindings: string[];
  hasHomepageBody: boolean;
  hostname: string;
  latestRunId: string | null;
  scanOutcome: string | null;
  suspiciousFindings: string[];
};

const SUSPICIOUS_FINANCIAL_RULE_KEYS = new Set([
  "financial_review.earnings_claim_without_adjacent_disclosure",
  "financial_review.simulated_performance_without_disclosure",
  "financial_review.pricing_or_fee_transparency_unclear",
  "financial_review.unqualified_superlative_claim_detected",
  "financial_review.guaranteed_outcome_claim_detected"
]);

const DEFAULT_TARGETS: HostTarget[] = [
  { cohort: "positive", hostname: "learn2.trade" },
  { cohort: "positive", hostname: "bestforex-signals.com" },
  { cohort: "positive", hostname: "forexbanksignal.pro" },
  { cohort: "positive", hostname: "mydigitrade.com" },
  { cohort: "positive", hostname: "trader-dale.com" },
  { cohort: "positive", hostname: "marcosignals.com" },
  { cohort: "positive", hostname: "forexroboteasy.com" },
  { cohort: "positive", hostname: "forexmentoronline.com" },
  { cohort: "control", hostname: "betterment.com" },
  { cohort: "control", hostname: "robinhood.com" }
];

async function loadDb() {
  const dbModule = (await import("@website-signal-risk-scanner/db")) as DbModule & {
    default?: DbModule;
  };

  return dbModule.default ?? dbModule;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
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
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadLatestRuns(db: Awaited<ReturnType<typeof loadDb>>, hostnames: string[], lookbackDays: number) {
  const result = await db.query<RunRow & { hostname: string }>(
    `
      with ranked_runs as (
        select
          vr.hostname,
          vr.id as run_id,
          vr.created_at,
          vr.completed_at,
          ss.scan_outcome,
          ss.normalized_body_hash,
          row_number() over (
            partition by vr.hostname
            order by coalesce(vr.completed_at, vr.created_at) desc
          ) as row_num
        from validation_runs vr
        join scan_snapshots ss
          on ss.scan_id = vr.scan_id
        where vr.hostname = any($1::text[])
          and vr.created_at >= timezone('utc', now()) - ($2::int * interval '1 day')
      )
      select hostname, run_id, created_at, completed_at, scan_outcome, normalized_body_hash
      from ranked_runs
      where row_num = 1
    `,
    [hostnames, lookbackDays],
    { readOnly: true }
  );

  return new Map(result.rows.map((row) => [row.hostname, row]));
}

async function loadFindings(db: Awaited<ReturnType<typeof loadDb>>, runIds: string[]) {
  if (runIds.length === 0) {
    return new Map<string, string[]>();
  }

  const result = await db.query<FindingRow>(
    `
      select validation_run_id, rule_key, severity
      from validation_run_findings
      where validation_run_id = any($1::uuid[])
        and rule_key like 'financial_review.%'
      order by validation_run_id asc, rule_key asc
    `,
    [runIds],
    { readOnly: true }
  );

  const byRunId = new Map<string, string[]>();
  for (const row of result.rows) {
    const findings = byRunId.get(row.validation_run_id) ?? [];
    findings.push(`${row.rule_key}:${row.severity ?? "unknown"}`);
    byRunId.set(row.validation_run_id, findings);
  }

  return byRunId;
}

function sortCountEntries(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([key, count]) => ({ count, key }));
}

async function main() {
  const asJson = hasFlag("--json");
  const lookbackDays = parsePositiveInt(getArgValue("--lookback-days"), 7);
  const db = await loadDb();
  const positiveHostnames = getArgValues("--positive-hostname");
  const controlHostnames = getArgValues("--control-hostname");
  const targets =
    positiveHostnames.length > 0 || controlHostnames.length > 0
      ? [
          ...positiveHostnames.map((hostname) => ({ cohort: "positive" as const, hostname })),
          ...controlHostnames.map((hostname) => ({ cohort: "control" as const, hostname }))
        ]
      : DEFAULT_TARGETS;

  const latestRuns = await loadLatestRuns(
    db,
    targets.map((target) => target.hostname),
    lookbackDays
  );
  const runIds = [...latestRuns.values()].map((row) => row.run_id);
  const findingsByRunId = await loadFindings(db, runIds);

  const evaluations: HostEvaluation[] = targets.map((target) => {
    const latestRun = latestRuns.get(target.hostname) ?? null;
    const financialFindings = latestRun ? findingsByRunId.get(latestRun.run_id) ?? [] : [];
    const suspiciousFindings = financialFindings.filter((finding) =>
      SUSPICIOUS_FINANCIAL_RULE_KEYS.has(finding.split(":")[0] ?? "")
    );

    return {
      cohort: target.cohort,
      financialFindings,
      hasHomepageBody: Boolean(latestRun?.normalized_body_hash),
      hostname: target.hostname,
      latestRunId: latestRun?.run_id ?? null,
      scanOutcome: latestRun?.scan_outcome ?? null,
      suspiciousFindings
    };
  });

  const positiveHosts = evaluations.filter((entry) => entry.cohort === "positive");
  const controlHosts = evaluations.filter((entry) => entry.cohort === "control");
  const positiveSuspiciousHits = positiveHosts.filter((entry) => entry.suspiciousFindings.length > 0).length;
  const controlSuspiciousMisses = controlHosts.filter((entry) => entry.suspiciousFindings.length === 0).length;
  const retainedHosts = evaluations.filter((entry) => entry.hasHomepageBody).length;
  const suspiciousRuleCounts = new Map<string, number>();

  for (const evaluation of evaluations) {
    for (const finding of evaluation.suspiciousFindings) {
      suspiciousRuleCounts.set(finding, (suspiciousRuleCounts.get(finding) ?? 0) + 1);
    }
  }

  const summary = {
    controlCount: controlHosts.length,
    controlSuspiciousSuppressionRate: controlHosts.length > 0 ? controlSuspiciousMisses / controlHosts.length : null,
    controlSuspiciousSuppressed: controlSuspiciousMisses,
    homepageRetentionRate: evaluations.length > 0 ? retainedHosts / evaluations.length : null,
    retainedHosts,
    totalHosts: evaluations.length,
    positiveCount: positiveHosts.length,
    positiveSuspiciousDetectionRate: positiveHosts.length > 0 ? positiveSuspiciousHits / positiveHosts.length : null,
    positiveSuspiciousHits,
    suspiciousRuleCounts: sortCountEntries(suspiciousRuleCounts)
  };

  if (asJson) {
    console.log(JSON.stringify({ evaluations, summary }, null, 2));
    await db.closePools();
    return;
  }

  console.table(
    evaluations.map((entry) => ({
      cohort: entry.cohort,
      financialFindingCount: entry.financialFindings.length,
      hasHomepageBody: entry.hasHomepageBody ? "yes" : "no",
      hostname: entry.hostname,
      suspiciousFindingCount: entry.suspiciousFindings.length,
      suspiciousFindings: entry.suspiciousFindings.join(", ") || "none"
    }))
  );

  console.log(
    `HomepageRetention=${retainedHosts}/${evaluations.length} PositiveSuspiciousDetection=${positiveSuspiciousHits}/${positiveHosts.length} ControlSuspiciousSuppression=${controlSuspiciousMisses}/${controlHosts.length}`
  );

  if (summary.suspiciousRuleCounts.length > 0) {
    console.table(summary.suspiciousRuleCounts);
  }

  await db.closePools();
}

main().catch((error) => {
  console.error(
    "[validation-worker] failed to score financial homepage confidence",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
