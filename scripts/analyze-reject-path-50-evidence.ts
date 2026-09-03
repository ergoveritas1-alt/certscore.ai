import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { postRefusalEvidencePacketSchema } from "../packages/certscore-contracts/src/index.js";

const ARTIFACT_DIR = path.resolve(
  "artifacts/scan-quality-calibration/2026-08-30-reject-path-50",
);

type SourceCacheRow = {
  packet_uri: string;
  scan_id: string;
};

type RescanResult = {
  exactTargetUrl: string;
  newOutcome: string;
  normalizedDomain: string;
  packetUri: string;
  sourceOutcome: string;
  sourceScanId: string;
};

type GeometryCandidate = {
  actionType?: string;
  classifierConfidence?: number;
  consentContextConfirmed?: boolean;
  containerSelectorHint?: string | null;
  decisionStatus?: string;
  enabled?: boolean;
  frameContext?: { frameKind?: string; frameUrl?: string };
  intersectsViewport?: boolean;
  label?: string;
  layer?: string;
  selectorHint?: string | null;
};

type GeometryArtifact = {
  candidates?: GeometryCandidate[];
  cmp?: {
    confidence?: number;
    detected?: boolean;
    name?: string;
  };
  egress?: unknown;
  pageUrl?: string;
};

function parseS3Uri(uri: string) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`Unsupported S3 URI: ${uri}`);
  return { bucket: match[1]!, key: match[2]! };
}

function regionForBucket(bucket: string) {
  return bucket.match(/(eu-central-1|eu-west-1|us-west-1)/)?.[1] ?? "eu-west-1";
}

const clients = new Map<string, S3Client>();
function clientForBucket(bucket: string) {
  const region = regionForBucket(bucket);
  const existing = clients.get(region);
  if (existing) return existing;
  const client = new S3Client({ region });
  clients.set(region, client);
  return client;
}

async function readS3Json(uri: string) {
  const { bucket, key } = parseS3Uri(uri);
  const response = await clientForBucket(bucket).send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
  const body = await response.Body?.transformToString();
  if (!body) throw new Error(`Empty S3 object: ${uri}`);
  return JSON.parse(body) as unknown;
}

function geometryUri(packetUri: string) {
  return packetUri.replace(
    /\/lanes\/reject_observation\/PostRefusalEvidencePacket\.json$/,
    "/auxiliary/ConsentControlGeometryEvidence.json",
  );
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await task(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function groupCount(values: string[]) {
  return Object.entries(values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {})).toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

async function main() {
  const sourceRows = JSON.parse(await readFile(
    path.join(ARTIFACT_DIR, "RejectPathSourceRecords.cache.json"),
    "utf8",
  )) as SourceCacheRow[];
  const resultsArtifact = JSON.parse(await readFile(
    path.join(ARTIFACT_DIR, "RejectPath50Results.json"),
    "utf8",
  )) as { results: RescanResult[] };
  const sourceById = new Map(sourceRows.map((row) => [row.scan_id, row]));

  const rows = await mapConcurrent(resultsArtifact.results, 10, async (result) => {
    const source = sourceById.get(result.sourceScanId);
    if (!source) throw new Error(`Missing source packet for ${result.sourceScanId}`);
    const [geometryValue, packetValue] = await Promise.all([
      readS3Json(geometryUri(source.packet_uri)),
      readS3Json(result.packetUri),
    ]);
    const geometry = geometryValue as GeometryArtifact;
    const packet = postRefusalEvidencePacketSchema.parse(packetValue);
    const rejectCandidates = (geometry.candidates ?? []).filter((candidate) =>
      candidate.actionType === "reject_all"
    ).map((candidate) => ({
      classifierConfidence: candidate.classifierConfidence ?? null,
      consentContextConfirmed: candidate.consentContextConfirmed ?? null,
      containerSelectorHint: candidate.containerSelectorHint ?? null,
      decisionStatus: candidate.decisionStatus ?? null,
      enabled: candidate.enabled ?? null,
      frameKind: candidate.frameContext?.frameKind ?? null,
      frameUrl: candidate.frameContext?.frameUrl ?? null,
      intersectsViewport: candidate.intersectsViewport ?? null,
      label: candidate.label ?? null,
      layer: candidate.layer ?? null,
      selectorHint: candidate.selectorHint ?? null,
    }));
    return {
      cmp: geometry.cmp?.name ?? "unknown",
      cmpConfidence: geometry.cmp?.confidence ?? null,
      domain: result.normalizedDomain,
      exactTargetUrl: result.exactTargetUrl,
      newClick: packet.interactionDiagnostics?.click ?? null,
      newNavigation: packet.interactionDiagnostics?.navigation ?? null,
      newOutcome: result.newOutcome,
      newResolver: packet.resolver,
      rejectCandidates,
      sourceGeometryPageUrl: geometry.pageUrl ?? null,
      sourceOutcome: result.sourceOutcome,
      sourceScanId: result.sourceScanId,
    };
  });

  const summary = {
    artifactVersion: "certscore.reject_path_50_evidence_analysis.v1",
    generatedAt: new Date().toISOString(),
    targetCount: rows.length,
    cmpCounts: groupCount(rows.map((row) => row.cmp)),
    selectorCounts: groupCount(rows.flatMap((row) =>
      row.rejectCandidates.map((candidate) => candidate.selectorHint ?? "missing")
    )),
    rejectCandidateCountDistribution: groupCount(rows.map((row) => String(row.rejectCandidates.length))),
    newOutcomeCounts: groupCount(rows.map((row) => row.newOutcome)),
    rows,
  };
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACT_DIR, "RejectPath50EvidenceAnalysis.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    cmpCounts: summary.cmpCounts,
    selectorCounts: summary.selectorCounts,
    rejectCandidateCountDistribution: summary.rejectCandidateCountDistribution,
    newOutcomeCounts: summary.newOutcomeCounts,
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
