import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function countBy(values: string[]) {
  return Object.fromEntries([...values.reduce(
    (counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
    new Map<string, number>(),
  ).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeBundle(
  bundle: JsonObject,
  projectedRowStatuses: JsonObject,
  canonicalFirstBrokenStage: string | null,
) {
  const surfaces = array(bundle.policySurfaceObservations).map(object);
  const policySurfaceInspection = object(bundle.policySurfaceInspection);
  const fetched = surfaces.filter((surface) =>
    surface.status === "fetched" || surface.documentFetchState === "fetched"
  );
  const usable = fetched.filter((surface) => surface.documentEvaluationState === "usable");
  const targetRelevant = usable.filter((surface) =>
    surface.documentRole === "policy_document" &&
    (
      surface.targetRelationship === "target_controller" ||
      surface.targetRelationship === "first_party_brand"
    )
  );
  const topicCandidateCount = targetRelevant.reduce(
    (count, surface) => count + array(surface.gdprTransparencyTopicCandidates).length,
    0,
  );
  const article13SignalCount = targetRelevant.reduce(
    (count, surface) => count + array(surface.article13DisclosureSignals).length,
    0,
  );
  const retainedPolicyArtifactCount = targetRelevant.reduce(
    (count, surface) => count + array(surface.artifactRefs).filter((value) =>
      /policy_(?:surface_text|excerpt)/.test(string(object(value).artifactId) ?? "")
    ).length,
    0,
  );
  const maxTextExcerptChars = targetRelevant.reduce(
    (max, surface) => Math.max(max, string(surface.textExcerpt)?.length ?? 0),
    0,
  );
  const topicObservedCount = Object.entries(projectedRowStatuses).filter(([rowId, status]) =>
    rowId !== "privacy_notice_availability" && status === "Observed"
  ).length;

  const firstBrokenStage = surfaces.length === 0
    ? "ws01.policy_surface_not_observed"
    : fetched.length === 0
      ? "ws01.policy_document_not_fetched"
      : usable.length === 0
        ? "ws01.policy_document_not_usable"
        : targetRelevant.length === 0
          ? "retained_evidence.target_ownership_or_governing_document_unverified"
          : topicObservedCount > 0 && canonicalFirstBrokenStage
            ? "wc01.observed_without_verified_persisted_policy_projection"
            : (topicCandidateCount > 0 || article13SignalCount > 0) && topicObservedCount === 0
            ? "wc01.retained_topic_evidence_not_projected"
            : topicCandidateCount === 0 && article13SignalCount === 0
              ? "ws01.usable_policy_without_topic_evidence"
              : "canonical_projection_has_observed_topic_evidence";

  return {
    article13SignalCount,
    canonicalFirstBrokenStage,
    fetchedSurfaceCount: fetched.length,
    fetchStateCounts: countBy(surfaces.map((surface) =>
      string(surface.documentFetchState) ?? "unknown"
    )),
    firstBrokenStage,
    maxTextExcerptChars,
    policySurfaceCount: surfaces.length,
    projectedTopicObservedCount: topicObservedCount,
    relationshipCounts: countBy(usable.map((surface) => string(surface.targetRelationship) ?? "unknown")),
    inspectionCoverageStatus: string(policySurfaceInspection.coverageStatus),
    inspectionLimitationKeys: array(policySurfaceInspection.limitationKeys)
      .map(string)
      .filter((value): value is string => Boolean(value)),
    retainedPolicyArtifactCount,
    targetRelevantUsableSurfaceCount: targetRelevant.length,
    topicCandidateCount,
    usableSurfaceCount: usable.length,
    surfaceStatusCounts: countBy(surfaces.map((surface) => string(surface.status) ?? "unknown")),
  };
}

async function downloadJson(uri: string) {
  const result = await execFileAsync("aws", ["s3", "cp", uri, "-", "--no-progress"], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(result.stdout) as JsonObject;
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, fn: (value: T, index: number) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(values[index]!, index);
    }
  }));
  return results;
}

async function main() {
  const inputPath = path.resolve(stringArg("--input") ?? "artifacts/gdpr-transparency-policy-evidence-audit-current-18h.json");
  const outPath = path.resolve(stringArg("--out") ?? "artifacts/gdpr-transparency-retained-bundle-audit-current-18h.json");
  const input = JSON.parse(await readFile(inputPath, "utf8")) as JsonObject;
  const rows = array(input.rows).map(object);
  const results = await mapConcurrent(rows, 8, async (row) => {
    const uri = string(row.scanArtifactUri);
    if (!uri?.startsWith("s3://")) {
      return { ...row, bundleReadStatus: "pointer_unavailable", firstBrokenStage: "retained_evidence.bundle_pointer_unavailable" };
    }
    try {
      const bundle = await downloadJson(uri);
      return {
        completedAt: row.completedAt,
        hostname: row.hostname,
        scanArtifactUri: uri,
        scanId: row.scanId,
        bundleReadStatus: "verified_readable_json",
        ...summarizeBundle(
          bundle,
          object(row.rowStatuses),
          string(row.firstBrokenStage),
        ),
      };
    } catch (error) {
      return {
        completedAt: row.completedAt,
        hostname: row.hostname,
        scanArtifactUri: uri,
        scanId: row.scanId,
        bundleReadStatus: "unavailable_or_malformed",
        firstBrokenStage: "retained_evidence.bundle_unavailable_or_malformed",
        errorCategory: error instanceof SyntaxError ? "invalid_json" : "artifact_read_failed",
      };
    }
  });
  const stageCounts = countBy(results.map((row) => string(row.firstBrokenStage) ?? "unknown"));
  const report = {
    reportVersion: "certscore.gdpr_transparency_retained_bundle_audit.1",
    generatedAt: new Date().toISOString(),
    inputPath,
    readOnly: true,
    guardrails: [
      "Canonical bundles are read and summarized without emitting retained policy text.",
      "This audit does not create or change findings, concerns, policy outcomes, or projections.",
      "Only verified target-relevant usable evidence can qualify as a WC01 projection-loss candidate.",
    ],
    rows: results,
    stageCounts,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, rowCount: results.length, stageCounts }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
