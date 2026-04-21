import { queryOne } from "@website-signal-risk-scanner/db";
import {
  createValidationRun,
  getValidationPipelineState,
  getValidationRun,
  loadValidationRunFindings,
  updateValidationRun
} from "../src/validation/repository";
import { processValidationRankJob, processValidationVerdictJob } from "../src/validation/pipeline";

type FinancialSmokeTarget = {
  expectedFindings: Array<{
    ruleKey: string;
    severity?: string;
  }>;
  hostname: string;
  label: string;
  scanId: string;
};

type FinancialSmokeResult = {
  expectedFindings: Array<{
    ruleKey: string;
    severity?: string;
  }>;
  findings: Array<{
    ruleKey: string;
    severity: string;
    title: string;
  }>;
  hostname: string;
  label: string;
  missingFindings: Array<{
    ruleKey: string;
    severity?: string;
  }>;
  runId: string;
  runStatus: string;
  scanId: string;
  subsetMatchesExpectation: boolean;
};

const FINANCIAL_TARGETS: FinancialSmokeTarget[] = [
  {
    hostname: "backtestr.xyz",
    label: "backtestr",
    scanId: "6f8aab47-9bda-4ee4-83f9-c222655ae576",
    expectedFindings: [
      { ruleKey: "financial_review.simulated_performance_without_disclosure", severity: "high" }
    ]
  },
  {
    hostname: "fxculturetrading.com",
    label: "fxculturetrading",
    scanId: "933f0d2c-ff7f-4e15-97b3-0322f92ad48f",
    expectedFindings: [
      { ruleKey: "financial_review.earnings_claim_without_adjacent_disclosure", severity: "high" },
      { ruleKey: "financial_review.pricing_or_fee_transparency_unclear", severity: "medium" }
    ]
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

function matchesExpectedFinding(
  actual: Array<{ ruleKey: string; severity: string }>,
  expected: { ruleKey: string; severity?: string }
) {
  return actual.some((finding) => {
    if (finding.ruleKey !== expected.ruleKey) {
      return false;
    }

    if (expected.severity && finding.severity !== expected.severity) {
      return false;
    }

    return true;
  });
}

async function loadScanContext(scanId: string) {
  const scan = await queryOne<{
    domain_id: string;
    id: string;
    status: string;
  }>(
    `
      select id, status, domain_id
      from scans
      where id = $1
    `,
    [scanId],
    { readOnly: true }
  );

  if (!scan) {
    throw new Error(`Failed to load scan ${scanId}: Not found`);
  }

  const domain = await queryOne<{ hostname: string; normalized_url: string }>(
    `
      select hostname, normalized_url
      from domains
      where id = $1
    `,
    [scan.domain_id],
    { readOnly: true }
  );

  if (!domain) {
    throw new Error(`Failed to load domain for scan ${scanId}: Not found`);
  }

  return {
    hostname: domain.hostname as string,
    normalizedUrl: domain.normalized_url as string,
    scanId: scan.id as string,
    status: scan.status as string
  };
}

async function runFinancialSmokeForScan(target: FinancialSmokeTarget): Promise<FinancialSmokeResult> {
  const scan = await loadScanContext(target.scanId);
  if (scan.status !== "completed") {
    throw new Error(`Scan ${target.scanId} is ${scan.status}, expected completed.`);
  }

  const run = await createValidationRun({
    hostname: scan.hostname,
    normalizedUrl: scan.normalizedUrl,
    triggerMode: "manual"
  });

  await updateValidationRun(run.id, {
    scan_id: scan.scanId,
    started_at: new Date().toISOString(),
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
  const normalizedFindings = findings.map((finding) => ({
    ruleKey: String(finding.rule_key ?? ""),
    severity: String(finding.severity ?? ""),
    title: String(finding.title ?? "")
  }));
  const missingFindings = target.expectedFindings.filter(
    (expected) => !matchesExpectedFinding(normalizedFindings, expected)
  );

  return {
    expectedFindings: target.expectedFindings,
    findings: normalizedFindings,
    hostname: scan.hostname,
    label: target.label,
    missingFindings,
    runId: run.id,
    runStatus: String(refreshedRun.status ?? ""),
    scanId: scan.scanId,
    subsetMatchesExpectation: missingFindings.length === 0
  };
}

async function main() {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    throw new Error(`Validation pipeline state is ${state}, expected running.`);
  }

  const onlyLabels = new Set(getArgValues("--label"));
  const onlyHostnames = new Set(getArgValues("--hostname"));
  const targets = FINANCIAL_TARGETS.filter((target) => {
    if (onlyLabels.size > 0 && !onlyLabels.has(target.label)) {
      return false;
    }

    if (onlyHostnames.size > 0 && !onlyHostnames.has(target.hostname)) {
      return false;
    }

    return true;
  });

  if (targets.length === 0) {
    throw new Error("No financial smoke targets matched the provided filters.");
  }

  const results: FinancialSmokeResult[] = [];
  for (const target of targets) {
    results.push(await runFinancialSmokeForScan(target));
  }

  for (const result of results) {
    console.log(`\n[financial-smoke] ${result.label} (${result.hostname})`);
    console.log(`scan ${result.scanId}`);
    console.log(`run ${result.runId}`);
    console.log(`status ${result.runStatus}`);
    console.log(`expected_subset ${result.subsetMatchesExpectation ? "match" : "mismatch"}`);
    if (result.missingFindings.length > 0) {
      console.log(
        `missing ${result.missingFindings
          .map((finding) => `${finding.ruleKey}${finding.severity ? `:${finding.severity}` : ""}`)
          .join(", ")}`
      );
    }
    console.log(
      `findings ${result.findings.map((finding) => `${finding.ruleKey}:${finding.severity}`).sort((left, right) => left.localeCompare(right)).join(", ")}`
    );
  }

  const mismatches = results.filter((result) => !result.subsetMatchesExpectation);
  if (mismatches.length > 0) {
    throw new Error(`Financial smoke mismatches: ${mismatches.map((result) => result.label).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
