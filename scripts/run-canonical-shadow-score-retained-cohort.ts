import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCanonicalShadowScoreInput,
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS,
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
} from "../apps/web/lib/scans/canonical-shadow-score-input";
import { summarizeCanonicalShadowScoreCohort } from "../apps/web/lib/scans/canonical-shadow-score-cohort";
import { runCanonicalShadowScore } from "../apps/web/lib/scans/canonical-shadow-score-run";
import type { CanonicalShadowScoreModel } from "../apps/web/lib/scans/canonical-shadow-score";
import { deriveGdprEprivacyUsableCoverageSummary } from "../apps/web/lib/scans/gdpr-eprivacy-review-summary";
import { getReportableGdprEprivacyCoverageItems } from "../apps/web/lib/scans/gdpr-eprivacy-reportable-rows";
import { GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS } from "../apps/web/lib/scans/canonical-shadow-score-model-proposals";

type JsonObject = Record<string, unknown>;

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") files.push(target);
  }
  return files.sort();
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hostname(value: unknown) {
  if (typeof value !== "string") return "unknown";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function loadServerModules() {
  const require = createRequire(import.meta.url);
  const Module = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = Module._load;
  Module._load = function loadWithServerOnlyShim(request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  return Promise.all([
    import("../apps/web/server/scans/local-v2-dag-report.ts"),
    import("../apps/web/lib/pulse/projection.ts")
  ]).then(([localModule, projectionModule]) => {
    Module._load = originalLoad;
    return {
      buildCanonicalGdprEprivacyShadowProjection: projectionModule.buildCanonicalGdprEprivacyShadowProjection,
      materializeLocalV2DagScanDetail: localModule.materializeLocalV2DagScanDetail
    };
  }).catch((error) => {
    Module._load = originalLoad;
    throw error;
  });
}

function scanRecord(bundle: JsonObject, outDir: string, index: number): JsonObject {
  const url = typeof bundle.url === "string" ? bundle.url : "https://unknown.invalid/";
  const domainHostname = hostname(url);
  const scanId = typeof bundle.scanId === "string" ? bundle.scanId : `retained-shadow-${index}`;
  const now = "2026-01-01T00:00:00.000Z";
  return {
    accessPostureSummary: {},
    domainBenchmark: null,
    events: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: null,
    runtimeArtifacts: {},
    signals: [],
    snapshot: {},
    trackerVendors: [],
    validationFindings: [],
    scan: {
      completedAt: bundle.completedAt ?? now,
      createdAt: bundle.startedAt ?? now,
      displayCreatedAt: bundle.startedAt ?? now,
      displayStatus: "completed",
      domainHostname,
      domainId: null,
      errorMessage: null,
      executionSummary: null,
      id: scanId,
      pagesRequested: 1,
      pagesScanned: 1,
      scanConfigJson: {
        hostname: domainHostname,
        normalizedUrl: url,
        processor: "local-certscore-v2-dag-parallel-v1",
        execution: {
          localV2Dag: { outDir },
          v2DagParallel: { artifactOnly: true, localOnly: true, productionFindingIntegration: false, profile: "standard" }
        }
      },
      scanFromLabel: "Retained evidence replay",
      scanFromValue: "retained_replay",
      scanType: "full",
      startedAt: bundle.startedAt ?? now,
      status: "completed",
      provenance: {
        lambdaAwsRegion: typeof bundle.region === "string" ? bundle.region : null,
        requestedScanFromValue: "retained_replay"
      }
    }
  };
}

async function main() {
  const inputPath = path.resolve(argumentValue("--input") ?? "artifacts/v2-scan-quality-calibration/consent-retention-06d7e04f-20260718/passive");
  const modelPath = path.resolve(argumentValue("--model") ?? "docs/scoring/gdpr-eprivacy-shadow-candidate-v2.json");
  const modelProposalId = argumentValue("--model-proposal");
  const outputPath = path.resolve(argumentValue("--out") ?? "artifacts/scoring/gdpr-eprivacy-shadow-retained-candidate-v2.json");
  const requestedLimit = Number(argumentValue("--limit") ?? "100");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 100;
  const modelProposal = modelProposalId
    ? GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS.find((entry) => entry.proposalId === modelProposalId)
    : null;
  if (modelProposalId && !modelProposal) {
    throw new Error(`Unknown canonical shadow score model proposal: ${modelProposalId}`);
  }
  const model = modelProposal?.model ?? JSON.parse(await readFile(modelPath, "utf8")) as CanonicalShadowScoreModel;
  const bundlePaths = (await walk(inputPath)).slice(0, limit);
  if (bundlePaths.length === 0) throw new Error(`No retained evidence bundles found under ${inputPath}.`);

  process.env.NODE_ENV = "development";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const { buildCanonicalGdprEprivacyShadowProjection, materializeLocalV2DagScanDetail } = await loadServerModules();
  const mirrorRoot = path.resolve(`artifacts/local-v2-dag-scans/canonical-shadow-${path.basename(inputPath)}`);
  await mkdir(mirrorRoot, { recursive: true });
  const generatedAt = new Date().toISOString();
  const artifacts = [];
  const failures: Array<{ reason: string; sourcePath: string }> = [];

  for (let index = 0; index < bundlePaths.length; index += 1) {
    const bundlePath = bundlePaths[index]!;
    try {
      const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as JsonObject;
      const localOutDir = path.dirname(bundlePath);
      const mirrorDir = path.join(mirrorRoot, String(index).padStart(3, "0"));
      try {
        await symlink(localOutDir, mirrorDir, "dir");
      } catch {
        // Existing deterministic mirrors are safe to reuse.
      }
      const detail = await materializeLocalV2DagScanDetail(scanRecord(bundle, mirrorDir, index) as never);
      const projection = buildCanonicalGdprEprivacyShadowProjection(detail);
      const scoreInput = buildCanonicalShadowScoreInput({
        checklistRows: projection.checklistRows,
        unifiedFindings: projection.unifiedFindings
      });
      const reportUsableCoverage = deriveGdprEprivacyUsableCoverageSummary(
        getReportableGdprEprivacyCoverageItems(projection.checklistRows)
      );
      const scanId = typeof bundle.scanId === "string" ? bundle.scanId : `retained-shadow-${index}`;
      artifacts.push(runCanonicalShadowScore({
        context: {
          comparisonGroupKey: hash(hostname(bundle.url)),
          region: typeof bundle.region === "string" ? bundle.region : null,
          scanSource: "retained_evidence_replay"
        },
        coverageRows: scoreInput.coverageRows,
        findings: scoreInput.findings,
        generatedAt,
        inputProjectionFingerprint: hash(JSON.stringify(scoreInput)),
        legacy: {
          coverageConfidence: projection.legacyScoreAssessment.coverageConfidence,
          coverageRatio: projection.legacyScoreAssessment.coverageRatio,
          reportInScopeRowCount: reportUsableCoverage.inScopeRowCount,
          reportUsableEvidenceRatio: reportUsableCoverage.ratio,
          reportUsableRowCount: reportUsableCoverage.usableRowCount,
          score: projection.legacyScoreAssessment.score,
          scoreKind: projection.legacyScoreAssessment.scoreKind,
          scoreSource: projection.legacyScoreAssessment.scoreSource,
          scoreVersion: projection.legacyScoreAssessment.scoreVersion
        },
        model,
        scanId,
        scoreEligibleCoverageRowIds: [...GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS],
        scoreEligibleFamilies: [...GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES]
      }));
    } catch {
      failures.push({ reason: "materialization_projection_or_scoring_failed", sourcePath: path.relative(inputPath, bundlePath) });
    }
  }

  const result = {
    artifacts,
    failures,
    generatedAt,
    inputBundleCount: bundlePaths.length,
    liveTraffic: false,
    productionIntegration: false,
    schemaVersion: "canonical-shadow-score-retained-cohort.v1",
    summary: summarizeCanonicalShadowScoreCohort(artifacts)
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, ...result.summary, failures: failures.length }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
