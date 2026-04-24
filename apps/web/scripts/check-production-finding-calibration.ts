import process from "node:process";
import {
  summarizeFinancialCommercialClaimsDataset,
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
  PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS,
  summarizePrivacyRuntimeFindingsDataset,
  type FinancialCommercialClaimsEmittableFindingId,
  type PrivacyRuntimeFindingDatasetExample,
  type PrivacyRuntimeFindingId
} from "@website-signal-risk-scanner/validation-shared";
import { buildProductionFindingFrequencyReport } from "./report-production-finding-frequency";

type CalibrationEntry = {
  auditOnlyPressurePct: number;
  borderlineExamples: number;
  corpusExamples: number;
  demotionPressurePct: number;
  findingId: PrivacyRuntimeFindingId;
  negativeExamples: number;
  positiveExamples: number;
  status: "pass" | "review";
  suppressedScans: number;
  surfaceFrequencyPct: number;
  surfaceScans: number;
};

type CurrentTopFindingEntry = {
  calibrated: boolean;
  calibrationSource: "financial_claims_corpus" | "privacy_runtime_corpus" | "none";
  findingId: string;
  rank: number;
  surfaceFrequencyPct: number;
  surfaceScans: number;
};

function countScenarioMix(examples: PrivacyRuntimeFindingDatasetExample[], findingId: PrivacyRuntimeFindingId) {
  const counts = {
    borderline: 0,
    negative: 0,
    positive: 0,
    total: 0
  };

  for (const example of examples) {
    if (example.findingId !== findingId) {
      continue;
    }

    counts.total += 1;
    if (example.scenarioType === "negative_control") {
      counts.negative += 1;
    } else if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
      counts.borderline += 1;
    } else {
      counts.positive += 1;
    }
  }

  return counts;
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const value = getArgValue(flag);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function renderMarkdown(input: {
  currentTopFindings: CurrentTopFindingEntry[];
  entries: CalibrationEntry[];
  generatedAt: string;
  scanCount: number;
}) {
  const lines = [
    "# Production Finding Calibration",
    "",
    `Generated: ${input.generatedAt}`,
    `Scope: ${input.scanCount} completed org-backed full scans`,
    "",
    "| Finding | Surface scans | Surface frequency | Audit-only pressure | Suppressed scans | Demotion pressure | Corpus | Pos | Neg | Borderline | Status |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"
  ];

  for (const entry of input.entries) {
    lines.push(
      `| \`${entry.findingId}\` | ${entry.surfaceScans} | ${entry.surfaceFrequencyPct.toFixed(1)}% | ${entry.auditOnlyPressurePct.toFixed(1)}% | ${entry.suppressedScans} | ${entry.demotionPressurePct.toFixed(1)}% | ${entry.corpusExamples} | ${entry.positiveExamples} | ${entry.negativeExamples} | ${entry.borderlineExamples} | ${entry.status} |`
    );
  }

  const uncalibratedTopFindings = input.currentTopFindings.filter((entry) => !entry.calibrated);
  lines.push(
    "",
    "## Current Top Surface Drift",
    "",
    "| Rank | Finding | Surface scans | Surface frequency | Calibrated | Source |",
    "|---:|---|---:|---:|---|---|"
  );
  for (const entry of input.currentTopFindings) {
    lines.push(
      `| ${entry.rank} | \`${entry.findingId}\` | ${entry.surfaceScans} | ${entry.surfaceFrequencyPct.toFixed(1)}% | ${entry.calibrated ? "yes" : "no"} | ${entry.calibrationSource} |`
    );
  }
  if (uncalibratedTopFindings.length > 0) {
    lines.push(
      "",
      `Uncalibrated current-top findings: ${uncalibratedTopFindings.map((entry) => `\`${entry.findingId}\``).join(", ")}`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const minExamples = getNumberArg("--min-examples", 30);
  const minScenarioExamples = getNumberArg("--min-scenario-examples", 10);
  const report = await buildProductionFindingFrequencyReport({
    includeNonSurface: true,
    limit: 100,
    scanType: getArgValue("--scan-type") ?? "full"
  });
  const currentTopLimit = getNumberArg("--current-top-limit", 18);
  const corpusSummary = summarizePrivacyRuntimeFindingsDataset(PRIVACY_RUNTIME_FINDINGS_DATASET_SEED);
  const financialCorpusSummary = summarizeFinancialCommercialClaimsDataset();
  const frequencyByFinding = new Map(report.topFindings.map((finding) => [finding.findingId, finding]));
  const calibratedFindingIds = new Set<string>(PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS);
  const financialFindingCounts = financialCorpusSummary.emittableFindingCounts as Partial<Record<FinancialCommercialClaimsEmittableFindingId, number>>;
  const financialCorpusCalibratedFindingIds = new Set(
    Object.entries(financialFindingCounts)
      .filter(([, count]) => (count ?? 0) >= minExamples)
      .map(([findingId]) => findingId)
  );
  const currentTopFindings = [...report.topFindings]
    .filter((finding) => finding.scanCount > 0)
    .sort((left, right) => right.scanCount - left.scanCount || right.surfaceCount - left.surfaceCount || left.findingId.localeCompare(right.findingId))
    .slice(0, currentTopLimit)
    .map((finding, index) => {
      const privacyCalibrated = calibratedFindingIds.has(finding.findingId);
      const financialCalibrated = financialCorpusCalibratedFindingIds.has(finding.findingId);
      return {
        calibrated: privacyCalibrated || financialCalibrated,
        calibrationSource: privacyCalibrated
          ? "privacy_runtime_corpus"
          : financialCalibrated
            ? "financial_claims_corpus"
            : "none",
        findingId: finding.findingId,
        rank: index + 1,
        surfaceFrequencyPct: finding.scanPct,
        surfaceScans: finding.scanCount
      } satisfies CurrentTopFindingEntry;
    });
  const entries: CalibrationEntry[] = PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS.map((findingId) => {
    const mix = countScenarioMix(PRIVACY_RUNTIME_FINDINGS_DATASET_SEED, findingId);
    const frequency = frequencyByFinding.get(findingId);
    const surfaceScans = frequency?.scanCount ?? 0;
    const anyStatusScans = frequency?.anyStatusScanCount ?? surfaceScans;
    const auditOnlyPressurePct =
      anyStatusScans > 0 ? Number((((frequency?.auditOnlyScanCount ?? 0) / anyStatusScans) * 100).toFixed(1)) : 0;
    const suppressedScans = frequency?.suppressedScanCount ?? 0;
    const demotionPressurePct =
      anyStatusScans > 0
        ? Number(((((frequency?.auditOnlyScanCount ?? 0) + suppressedScans) / anyStatusScans) * 100).toFixed(1))
        : 0;
    const corpusPass =
      mix.total >= minExamples &&
      mix.positive >= minScenarioExamples &&
      mix.negative >= minScenarioExamples &&
      mix.borderline >= minScenarioExamples;
    const status = corpusPass ? "pass" : "review";

    return {
      auditOnlyPressurePct,
      borderlineExamples: mix.borderline,
      corpusExamples: corpusSummary.findingCounts[findingId],
      demotionPressurePct,
      findingId,
      negativeExamples: mix.negative,
      positiveExamples: mix.positive,
      status,
      suppressedScans,
      surfaceFrequencyPct: frequency?.scanPct ?? 0,
      surfaceScans
    };
  });
  const uncalibratedTopFindings = currentTopFindings.filter((entry) => !entry.calibrated);
  const output = {
    currentTopFindings,
    entries,
    generatedAt: report.generatedAt,
    scanCount: report.scope.scanCount
  };
  const reviewEntries = entries.filter((entry) => entry.status === "review");

  if (hasFlag("--json")) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(output));
  }

  if (hasFlag("--fail-on-review") && (reviewEntries.length > 0 || uncalibratedTopFindings.length > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
