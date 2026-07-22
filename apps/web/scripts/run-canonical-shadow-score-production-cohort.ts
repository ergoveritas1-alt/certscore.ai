import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { closePools } from "@website-signal-risk-scanner/db";
import {
  buildCanonicalShadowScoreInput,
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS,
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
} from "../lib/scans/canonical-shadow-score-input";
import { summarizeCanonicalShadowScoreCohort } from "../lib/scans/canonical-shadow-score-cohort";
import { runCanonicalShadowScore } from "../lib/scans/canonical-shadow-score-run";
import type { CanonicalShadowScoreModel } from "../lib/scans/canonical-shadow-score";
import { deriveGdprEprivacyUsableCoverageSummary } from "../lib/scans/gdpr-eprivacy-review-summary";
import { getReportableGdprEprivacyCoverageItems } from "../lib/scans/gdpr-eprivacy-reportable-rows";

const MAX_COHORT_SCANS = 100;

type CohortScanInput = {
  comparisonGroupKey?: string | null;
  region?: string | null;
  scanId: string;
  scanSource?: string | null;
};

type CohortInput = {
  model: CanonicalShadowScoreModel;
  scans: CohortScanInput[];
};

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function loadServerModules() {
  const moduleLoader = Module as typeof Module & {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  if (originalLoad) {
    moduleLoader._load = function loadWithServerOnlyShim(request, parent, isMain) {
      if (request === "server-only") return {};
      return originalLoad.call(this, request, parent, isMain);
    };
  }
  try {
    const [projectionModule, scanModule, materializationModule] = await Promise.all([
      import("../lib/pulse/projection"),
      import("../server/scans/get-scan-by-id"),
      import("../server/scans/local-v2-dag-report")
    ]);
    return {
      buildCanonicalGdprEprivacyShadowProjection: projectionModule.buildCanonicalGdprEprivacyShadowProjection,
      getPublicScanByIdForReadOnlyAnalysis: scanModule.getPublicScanByIdForReadOnlyAnalysis,
      materializeLocalV2DagScanDetail: materializationModule.materializeLocalV2DagScanDetail
    };
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function parseInput(value: unknown): CohortInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cohort input must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.scans) || record.scans.length === 0 || record.scans.length > MAX_COHORT_SCANS) {
    throw new Error(`Cohort must contain between 1 and ${MAX_COHORT_SCANS} scans.`);
  }
  const scans = record.scans.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Cohort scan ${index + 1} must be an object.`);
    }
    const scan = entry as Record<string, unknown>;
    if (typeof scan.scanId !== "string" || !/^[0-9a-f-]{36}$/i.test(scan.scanId)) {
      throw new Error(`Cohort scan ${index + 1} has an invalid scanId.`);
    }
    return {
      comparisonGroupKey: typeof scan.comparisonGroupKey === "string" ? scan.comparisonGroupKey : null,
      region: typeof scan.region === "string" ? scan.region : null,
      scanId: scan.scanId,
      scanSource: typeof scan.scanSource === "string" ? scan.scanSource : null
    };
  });
  if (!record.model || typeof record.model !== "object" || Array.isArray(record.model)) {
    throw new Error("Cohort input requires a score model.");
  }
  return { model: record.model as CanonicalShadowScoreModel, scans };
}

function projectionFingerprint(input: ReturnType<typeof buildCanonicalShadowScoreInput>) {
  const canonical = {
    coverageRows: [...input.coverageRows].sort((left, right) => left.rowId.localeCompare(right.rowId)),
    findings: [...input.findings].sort((left, right) =>
      left.family.localeCompare(right.family) || left.findingId.localeCompare(right.findingId)
    )
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function comparisonTargetKey(scanConfig: Record<string, unknown> | null | undefined) {
  const rawUrl = typeof scanConfig?.normalizedUrl === "string" ? scanConfig.normalizedUrl.trim() : "";
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    if (url.pathname === "") url.pathname = "/";
    return createHash("sha256").update(url.toString()).digest("hex");
  } catch {
    return null;
  }
}

async function main() {
  const inputPath = argumentValue("--input");
  const outputPath = argumentValue("--out");
  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: tsx apps/web/scripts/run-canonical-shadow-score-production-cohort.ts --input <cohort.json> --out <artifact.json>"
    );
  }

  const input = parseInput(JSON.parse(await readFile(path.resolve(inputPath), "utf8")));
  const {
    buildCanonicalGdprEprivacyShadowProjection,
    getPublicScanByIdForReadOnlyAnalysis,
    materializeLocalV2DagScanDetail
  } = await loadServerModules();
  const generatedAt = new Date().toISOString();
  const artifacts = [];
  const failures: Array<{ reason: string; scanId: string }> = [];

  for (const scan of input.scans) {
    try {
      const storedRecord = await getPublicScanByIdForReadOnlyAnalysis(scan.scanId);
      if (!storedRecord) {
        failures.push({ reason: "scan_not_found", scanId: scan.scanId });
        continue;
      }
      const materializedRecord = await materializeLocalV2DagScanDetail(storedRecord).catch(() => storedRecord);
      const projection = buildCanonicalGdprEprivacyShadowProjection(materializedRecord);
      const scoreInput = buildCanonicalShadowScoreInput({
        checklistRows: projection.checklistRows,
        unifiedFindings: projection.unifiedFindings
      });
      const reportUsableCoverage = deriveGdprEprivacyUsableCoverageSummary(
        getReportableGdprEprivacyCoverageItems(projection.checklistRows)
      );
      artifacts.push(runCanonicalShadowScore({
        context: {
          comparisonGroupKey: scan.comparisonGroupKey,
          comparisonTargetKey: comparisonTargetKey(materializedRecord.scan.scanConfigJson),
          region: scan.region,
          scanSource: scan.scanSource
        },
        coverageRows: scoreInput.coverageRows,
        findings: scoreInput.findings,
        generatedAt,
        inputProjectionFingerprint: projectionFingerprint(scoreInput),
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
        model: input.model,
        scanId: scan.scanId,
        scoreEligibleCoverageRowIds: [...GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS],
        scoreEligibleFamilies: [...GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES]
      }));
    } catch {
      failures.push({ reason: "projection_or_scoring_failed", scanId: scan.scanId });
    }
  }

  const result = {
    artifacts,
    failures,
    generatedAt,
    inputScanCount: input.scans.length,
    schemaVersion: "canonical-shadow-score-production-cohort.v1",
    summary: summarizeCanonicalShadowScoreCohort(artifacts)
  };
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${artifacts.length} passive comparison artifacts (${failures.length} failures) to ${resolvedOutputPath}\n`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
