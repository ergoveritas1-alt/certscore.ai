#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CheckStatus = "pass" | "fail" | "pending";

interface ConsentCanaryReport {
  totals?: {
    total?: number;
    completed?: number;
    failed?: number;
    exactAgreementRate?: number;
    noGo?: number;
    p95DurationMs?: number | null;
  };
}

interface RetainedAuditReport {
  currentContractValidation?: {
    totalBundles?: number;
    validBundles?: number;
    loadedBundles?: number;
    loadedBundlesWithScreenshot?: number;
  };
  adjudicatedGateMetrics?: {
    totalSites?: number;
    loadedSites?: number;
    noGoSitesCount?: number;
    proofScreenshotsForLoadedSitesRate?: number;
    perFieldAgreementRate?: number;
  };
}

interface ReplayEvidenceReport {
  readiness?: {
    insufficientArtifacts?: number;
    networkPhaseMissing?: number;
    originalScanMissingCandidateNowDetected?: number;
    originalScanDetectedCandidateNowMissing?: number;
  };
}

interface ReplayCoverageReport {
  summary?: {
    qualityStatus?: "pass" | "warn" | "fail";
  };
  quality?: {
    status?: "pass" | "warn" | "fail";
  };
}

interface GoldQualityReport {
  status?: "pass" | "warn" | "fail";
  summary?: {
    needsAttention?: number;
    plannedOnly?: number;
  };
}

interface GateCheck {
  id: string;
  status: CheckStatus;
  message: string;
}

interface FastGateReport {
  reportVersion: "certscore.consent_capture_fast_release_gate.1";
  generatedAt: string;
  policy: {
    publicCooldownBypassed: false;
    livePublicValidationRequiredFor: "full_release_confidence";
    maxOwnedCanaryP95DurationMs: number;
  };
  status: "pass" | "fail";
  checks: GateCheck[];
  inputs: Record<string, string>;
  liveCalibration: {
    status: "pending";
    reason: string;
  };
}

const defaults = {
  canary: "artifacts/owned-consent-canary-gate-20260723/consent-controls-canary-gate.json",
  retained: "artifacts/retained-consent-cohort-audit-20260723-rerun.json",
  replay: "artifacts/retained-gold-replay-evidence-20260723/ReplayEvidenceReport.json",
  coverage: "artifacts/retained-gold-replay-coverage-20260723/ReplayGoldCorpusCoverage.json",
  gold: "artifacts/gold-corpus/v2-current/quality-gate/GoldCorpusQualityGate.json",
  out: "artifacts/consent-capture-fast-release-gate",
  maxP95Ms: 5000,
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputs = {
    canary: await readJson<ConsentCanaryReport>(args.canary),
    retained: await readJson<RetainedAuditReport>(args.retained),
    replay: await readJson<ReplayEvidenceReport>(args.replay),
    coverage: await readJson<ReplayCoverageReport>(args.coverage),
    gold: await readJson<GoldQualityReport>(args.gold),
  };

  const checks: GateCheck[] = [];
  const canaryTotals = inputs.canary.totals ?? {};
  checks.push(check(
    "owned_canary_exact_agreement",
    canaryTotals.total !== undefined && canaryTotals.total > 0 && canaryTotals.exactAgreementRate === 1,
    `Owned canaries exact agreement: ${formatRate(canaryTotals.exactAgreementRate)}.`,
  ));
  checks.push(check(
    "owned_canary_completion",
    canaryTotals.failed === 0 && canaryTotals.completed === canaryTotals.total,
    `Owned canaries completed: ${canaryTotals.completed ?? "—"}/${canaryTotals.total ?? "—"}; failed=${canaryTotals.failed ?? "—"}.`,
  ));
  checks.push(check(
    "owned_canary_no_go",
    canaryTotals.noGo === 0,
    `Owned canary no-go-equivalent failures: ${canaryTotals.noGo ?? "—"}.`,
  ));
  checks.push(check(
    "owned_canary_latency",
    typeof canaryTotals.p95DurationMs === "number" && canaryTotals.p95DurationMs <= args.maxP95Ms,
    `Owned canary p95: ${canaryTotals.p95DurationMs ?? "—"}ms; limit=${args.maxP95Ms}ms.`,
  ));

  const retained = inputs.retained.currentContractValidation ?? {};
  const historical = inputs.retained.adjudicatedGateMetrics ?? {};
  checks.push(check(
    "retained_bundle_integrity",
    retained.totalBundles !== undefined && retained.validBundles === retained.totalBundles,
    `Retained bundles valid: ${retained.validBundles ?? "—"}/${retained.totalBundles ?? "—"}.`,
  ));
  checks.push(check(
    "retained_screenshot_coverage",
    retained.loadedBundles !== undefined && retained.loadedBundlesWithScreenshot === retained.loadedBundles,
    `Retained loaded bundles with screenshots: ${retained.loadedBundlesWithScreenshot ?? "—"}/${retained.loadedBundles ?? "—"}.`,
  ));
  checks.push(check(
    "retained_adjudicated_baseline",
    historical.perFieldAgreementRate !== undefined && historical.perFieldAgreementRate >= 0.95 && historical.proofScreenshotsForLoadedSitesRate === 1,
    `Historical retained baseline: per-field=${formatRate(historical.perFieldAgreementRate)}, screenshots=${formatRate(historical.proofScreenshotsForLoadedSitesRate)}.`,
  ));

  const replayReadiness = inputs.replay.readiness ?? {};
  checks.push(check(
    "replay_artifact_completeness",
    replayReadiness.insufficientArtifacts === 0 && replayReadiness.networkPhaseMissing === 0,
    `Replay artifact gaps: insufficient=${replayReadiness.insufficientArtifacts ?? "—"}, network=${replayReadiness.networkPhaseMissing ?? "—"}.`,
  ));
  checks.push(check(
    "replay_classification_stability",
    replayReadiness.originalScanMissingCandidateNowDetected === 0 && replayReadiness.originalScanDetectedCandidateNowMissing === 0,
    `Replay classification deltas: missing-now-detected=${replayReadiness.originalScanMissingCandidateNowDetected ?? "—"}, detected-now-missing=${replayReadiness.originalScanDetectedCandidateNowMissing ?? "—"}.`,
  ));
  checks.push(check(
    "replay_quality",
    inputs.coverage.summary?.qualityStatus === "pass",
    `Replay coverage quality: ${inputs.coverage.summary?.qualityStatus ?? "missing"}.`,
  ));
  checks.push(check(
    "current_gold_quality",
    inputs.gold.status === "pass" && inputs.gold.summary?.needsAttention === 0 && inputs.gold.summary?.plannedOnly === 0,
    `Current gold quality: status=${inputs.gold.status ?? "missing"}, needs-attention=${inputs.gold.summary?.needsAttention ?? "—"}, planned-only=${inputs.gold.summary?.plannedOnly ?? "—"}.`,
  ));

  const report: FastGateReport = {
    reportVersion: "certscore.consent_capture_fast_release_gate.1",
    generatedAt: new Date().toISOString(),
    policy: {
      publicCooldownBypassed: false,
      livePublicValidationRequiredFor: "full_release_confidence",
      maxOwnedCanaryP95DurationMs: args.maxP95Ms,
    },
    status: checks.every((item) => item.status === "pass") ? "pass" : "fail",
    checks,
    inputs: {
      canary: args.canary,
      retained: args.retained,
      replay: args.replay,
      coverage: args.coverage,
      gold: args.gold,
    },
    liveCalibration: {
      status: "pending",
      reason: "Public target selection remains cooldown-aware and fail-closed; no public cooldown was bypassed.",
    },
  };
  await mkdir(args.out, { recursive: true });
  const outputPath = path.join(args.out, "ConsentCaptureFastReleaseGate.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: report.status, checks }, null, 2));
  if (report.status === "fail") process.exitCode = 1;
}

function check(id: string, passed: boolean, message: string): GateCheck {
  return { id, status: passed ? "pass" : "fail", message };
}

function formatRate(value: number | undefined): string {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "missing";
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parseArgs(argv: string[]) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--canary" && value) { args.canary = value; index += 1; }
    else if (flag === "--retained" && value) { args.retained = value; index += 1; }
    else if (flag === "--replay" && value) { args.replay = value; index += 1; }
    else if (flag === "--coverage" && value) { args.coverage = value; index += 1; }
    else if (flag === "--gold" && value) { args.gold = value; index += 1; }
    else if (flag === "--out" && value) { args.out = value; index += 1; }
    else if (flag === "--max-p95-ms" && value) { args.maxP95Ms = Number(value); index += 1; }
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  return args;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
