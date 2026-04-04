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
  hostname: string;
  label: string;
  scanId: string;
};

type SmokeResult = {
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
    scanId: "8ff70326-b21a-42c4-84f5-6e0f5c4e45ab"
  },
  {
    hostname: "adidas.com",
    label: "adidas",
    scanId: "eca7ea56-cf60-43dd-86af-71d2f71f776b"
  },
  {
    hostname: "fujifilm.com",
    label: "fujifilm",
    scanId: "50b237ba-33d6-41c6-8bea-7b535a0c6729"
  },
  {
    hostname: "hobbylobby.com",
    label: "hobbylobby",
    scanId: "97cd1278-0756-4e2b-9838-598c49e1498a"
  },
  {
    hostname: "dnb.com",
    label: "dnb",
    scanId: "4f46389b-ab47-453b-bd8a-5555596ab099"
  },
  {
    hostname: "alz.org",
    label: "alz",
    scanId: "22214ea0-f5cc-480e-8275-ac0c635a55e8"
  },
  {
    hostname: "kurier.at",
    label: "kurier",
    scanId: "bd98b16e-76cd-489a-ba75-81ebe7a8d242"
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

async function runSmokeForScan(input: { label: string; scanId: string }) {
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
  const result: SmokeResult = {
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
        const start = parseIsoMs(refreshedRun.started_at);
        const end = parseIsoMs(refreshedRun.completed_at);
        return start !== null && end !== null ? end - start : null;
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
  const json = hasFlag("--json");
  const targets =
    requestedScanIds.length > 0
      ? requestedScanIds.map((scanId, index) => ({
          label: `scan-${index + 1}`,
          scanId
        }))
      : REPRESENTATIVE_TARGETS.map(({ label, scanId }) => ({ label, scanId }));

  const results: SmokeResult[] = [];
  for (const target of targets) {
    results.push(await runSmokeForScan(target));
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printHuman(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
