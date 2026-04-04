import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  createValidationRun,
  getValidationPipelineState,
  getValidationRun,
  loadValidationRunFindings,
  updateValidationRun
} from "../src/validation/repository";
import { processValidationRankJob, processValidationVerdictJob } from "../src/validation/pipeline";

type RepresentativeTarget = {
  expectedFindings?: Array<{
    ruleKey: string;
    severity: string;
  }>;
  hostname: string;
  label: string;
  maxValidationMs?: number;
  scanId: string;
};

type SmokeResult = {
  expectedFindings: Array<{
    ruleKey: string;
    severity: string;
  }> | null;
  findings: Array<{
    ruleKey: string;
    severity: string;
    title: string;
  }>;
  hostname: string;
  label: string;
  runId: string;
  runStatus: string;
  scanId: string;
  shapeMatchesExpectation: boolean | null;
  timingWithinBudget: boolean | null;
  timings: {
    queueToFinalMs: number | null;
    scanProcessingMs: number | null;
    validationMs: number | null;
  };
};

const REPRESENTATIVE_TARGETS: RepresentativeTarget[] = [
  {
    hostname: "lookout.com",
    label: "lookout",
    maxValidationMs: 15_000,
    scanId: "8ff70326-b21a-42c4-84f5-6e0f5c4e45ab",
    expectedFindings: [
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" },
      { ruleKey: "cookie_runtime.disclosure_gap", severity: "medium" },
      { ruleKey: "section_review.no_retention_periods_noted", severity: "medium" }
    ]
  },
  {
    hostname: "adidas.com",
    label: "adidas",
    maxValidationMs: 15_000,
    scanId: "eca7ea56-cf60-43dd-86af-71d2f71f776b",
    expectedFindings: [{ ruleKey: "access_review.public_access_blocked", severity: "high" }]
  },
  {
    hostname: "fujifilm.com",
    label: "fujifilm",
    maxValidationMs: 15_000,
    scanId: "50b237ba-33d6-41c6-8bea-7b535a0c6729",
    expectedFindings: [
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "access_review.legal_coverage_unverified", severity: "medium" }
    ]
  },
  {
    hostname: "hobbylobby.com",
    label: "hobbylobby",
    maxValidationMs: 15_000,
    scanId: "97cd1278-0756-4e2b-9838-598c49e1498a",
    expectedFindings: [
      { ruleKey: "access_review.public_access_blocked", severity: "high" },
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" }
    ]
  },
  {
    hostname: "dnb.com",
    label: "dnb",
    maxValidationMs: 15_000,
    scanId: "4f46389b-ab47-453b-bd8a-5555596ab099",
    expectedFindings: [
      { ruleKey: "access_review.legal_coverage_unverified", severity: "medium" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "medium" }
    ]
  },
  {
    hostname: "alz.org",
    label: "alz",
    maxValidationMs: 20_000,
    scanId: "22214ea0-f5cc-480e-8275-ac0c635a55e8",
    expectedFindings: [{ ruleKey: "section_review.no_retention_periods_noted", severity: "medium" }]
  },
  {
    hostname: "kurier.at",
    label: "kurier",
    maxValidationMs: 15_000,
    scanId: "bd98b16e-76cd-489a-ba75-81ebe7a8d242",
    expectedFindings: [{ ruleKey: "access_review.legal_coverage_unverified", severity: "medium" }]
  }
];

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

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function normalizeFindingShape(findings: Array<{ ruleKey: string; severity: string }>) {
  return [...findings]
    .map((finding) => `${finding.ruleKey}:${finding.severity}`)
    .sort((left, right) => left.localeCompare(right));
}

function findingShapeMatches(
  actual: Array<{ ruleKey: string; severity: string }>,
  expected: Array<{ ruleKey: string; severity: string }> | null | undefined
) {
  if (!expected) {
    return null;
  }

  const normalizedActual = normalizeFindingShape(actual);
  const normalizedExpected = normalizeFindingShape(expected);

  if (normalizedActual.length !== normalizedExpected.length) {
    return false;
  }

  return normalizedActual.every((value, index) => value === normalizedExpected[index]);
}

function timingWithinBudget(validationMs: number | null, maxValidationMs: number | null | undefined) {
  if (maxValidationMs == null) {
    return null;
  }

  if (validationMs == null) {
    return false;
  }

  return validationMs <= maxValidationMs;
}

function formatDurationMs(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function loadScanContext(scanId: string) {
  const supabase = createAdminClient();
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("id, status, created_at, started_at, completed_at, domain_id")
    .eq("id", scanId)
    .maybeSingle();

  if (scanError || !scan) {
    throw new Error(`Failed to load scan ${scanId}: ${scanError?.message ?? "Not found"}`);
  }

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("hostname, normalized_url")
    .eq("id", scan.domain_id)
    .maybeSingle();

  if (domainError || !domain) {
    throw new Error(`Failed to load domain for scan ${scanId}: ${domainError?.message ?? "Not found"}`);
  }

  return {
    completedAt: scan.completed_at as string | null,
    createdAt: scan.created_at as string,
    hostname: domain.hostname as string,
    normalizedUrl: domain.normalized_url as string,
    scanId: scan.id as string,
    startedAt: scan.started_at as string | null,
    status: scan.status as string
  };
}

async function runSmokeForScan(input: {
  expectedFindings?: Array<{ ruleKey: string; severity: string }>;
  label: string;
  maxValidationMs?: number;
  scanId: string;
}) {
  const scan = await loadScanContext(input.scanId);
  if (scan.status !== "completed") {
    throw new Error(`Scan ${input.scanId} is ${scan.status}, expected completed.`);
  }

  const run = await createValidationRun({
    hostname: scan.hostname,
    normalizedUrl: scan.normalizedUrl,
    triggerMode: "manual"
  });

  const startedAt = new Date().toISOString();
  await updateValidationRun(run.id, {
    scan_id: scan.scanId,
    started_at: startedAt,
    status: "ranking"
  });

  await processValidationRankJob(run.id);

  let refreshedRun = await getValidationRun(run.id);
  if (!refreshedRun) {
    throw new Error(`Validation run ${run.id} disappeared after ranking.`);
  }

  if (refreshedRun.status === "validating") {
    await processValidationVerdictJob(run.id);
    refreshedRun = await getValidationRun(run.id);
  }

  if (!refreshedRun) {
    throw new Error(`Validation run ${run.id} disappeared after verdicting.`);
  }

  const findings = await loadValidationRunFindings(run.id);
  const validationMs = (() => {
    const start = parseIsoMs(refreshedRun.started_at);
    const end = parseIsoMs(refreshedRun.completed_at);
    return start !== null && end !== null ? end - start : null;
  })();
  const result: SmokeResult = {
    expectedFindings: input.expectedFindings ?? null,
    findings: findings.map((finding) => ({
      ruleKey: String(finding.rule_key ?? ""),
      severity: String(finding.severity ?? ""),
      title: String(finding.title ?? "")
    })),
    hostname: scan.hostname,
    label: input.label,
    runId: run.id,
    runStatus: String(refreshedRun.status ?? ""),
    scanId: scan.scanId,
    shapeMatchesExpectation: findingShapeMatches(
      findings.map((finding) => ({
        ruleKey: String(finding.rule_key ?? ""),
        severity: String(finding.severity ?? "")
      })),
      input.expectedFindings
    ),
    timingWithinBudget: timingWithinBudget(validationMs, input.maxValidationMs),
    timings: {
      queueToFinalMs: (() => {
        const start = parseIsoMs(scan.createdAt);
        const end = parseIsoMs(refreshedRun.completed_at);
        return start !== null && end !== null ? end - start : null;
      })(),
      scanProcessingMs: (() => {
        const start = parseIsoMs(scan.startedAt);
        const end = parseIsoMs(scan.completedAt);
        return start !== null && end !== null ? end - start : null;
      })(),
      validationMs: (() => {
        return validationMs;
      })()
    }
  };

  return result;
}

function printHuman(results: SmokeResult[]) {
  for (const result of results) {
    console.log(`\n${result.label} (${result.hostname})`);
    console.log(`scan ${result.scanId}`);
    console.log(`run ${result.runId} (${result.runStatus})`);
    console.log(
      `timings scan=${formatDurationMs(result.timings.scanProcessingMs)} validation=${formatDurationMs(result.timings.validationMs)} queue_to_final=${formatDurationMs(result.timings.queueToFinalMs)}`
    );
    if (result.shapeMatchesExpectation !== null) {
      console.log(`expected_shape ${result.shapeMatchesExpectation ? "match" : "mismatch"}`);
    }
    if (result.timingWithinBudget !== null) {
      console.log(`validation_budget ${result.timingWithinBudget ? "within" : "exceeded"}`);
    }

    if (result.findings.length === 0) {
      console.log("findings none");
      continue;
    }

    console.log("findings");
    for (const finding of result.findings) {
      console.log(`- [${finding.severity}] ${finding.ruleKey} :: ${finding.title}`);
    }
  }
}

async function main() {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    throw new Error(`Validation pipeline is ${state}; expected running.`);
  }

  const requestedScanIds = getArgValues("--scan-id");
  const allowMismatch = hasFlag("--allow-mismatch");
  const allowTimingRegression = hasFlag("--allow-timing-regression");
  const json = hasFlag("--json");
  const targets =
    requestedScanIds.length > 0
      ? requestedScanIds.map((scanId, index) => ({
          expectedFindings: undefined,
          label: `scan-${index + 1}`,
          maxValidationMs: undefined,
          scanId
        }))
      : REPRESENTATIVE_TARGETS.map(({ expectedFindings, label, maxValidationMs, scanId }) => ({
          expectedFindings,
          label,
          maxValidationMs,
          scanId
        }));

  const results: SmokeResult[] = [];
  for (const target of targets) {
    results.push(await runSmokeForScan(target));
  }

  const mismatches = results.filter((result) => result.shapeMatchesExpectation === false);
  const timingRegressions = results.filter((result) => result.timingWithinBudget === false);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    if ((mismatches.length > 0 && !allowMismatch) || (timingRegressions.length > 0 && !allowTimingRegression)) {
      process.exitCode = 1;
    }
    return;
  }

  printHuman(results);

  if (mismatches.length > 0) {
    console.error(
      `\nSmoke expectation mismatches: ${mismatches.map((result) => result.label).join(", ")}`
    );
    if (!allowMismatch) {
      process.exitCode = 1;
    }
  }

  if (timingRegressions.length > 0) {
    console.error(
      `\nSmoke timing regressions: ${timingRegressions
        .map((result) => `${result.label}=${formatDurationMs(result.timings.validationMs)}`)
        .join(", ")}`
    );
    if (!allowTimingRegression) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
