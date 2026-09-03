import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { postRefusalEvidencePacketSchema } from "../packages/certscore-contracts/src/index.js";

type EnrichmentRow = {
  event?: { packet_uri?: string | null } | null;
  packet?: { reason?: string | null } | null;
  rejectObserved: boolean | null;
  scanId: string;
  verification: string;
};

type EnrichmentArtifact = {
  rows: EnrichmentRow[];
  summary: {
    failures: Array<{ scanId: string }>;
  };
};

type ExactTargetFallback = {
  exactTargetUrl: string;
  retainedEvidenceSha256: string;
  retainedEvidenceUri: string;
};

export type RejectPathLocalBatchTarget = {
  exactTargetUrl: string;
  normalizedDomain: string;
  packetUri: string;
  sourceOutcome: string;
  sourceScanId: string;
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
  const cached = clients.get(region);
  if (cached) return cached;
  const client = new S3Client({ region });
  clients.set(region, client);
  return client;
}

async function readPacket(uri: string) {
  const { bucket, key } = parseS3Uri(uri);
  const response = await clientForBucket(bucket).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await response.Body?.transformToString();
  if (!text) throw new Error(`Empty post-refusal packet: ${uri}`);
  return postRefusalEvidencePacketSchema.parse(JSON.parse(text));
}

export async function buildRejectPathFailureLocalBatch(input: {
  artifact: EnrichmentArtifact;
  limit: number;
  offset?: number;
  exactTargetFallbacks?: Record<string, ExactTargetFallback>;
  readPacket?: typeof readPacket;
}) {
  const rowByScan = new Map(input.artifact.rows.map((row) => [row.scanId, row]));
  const offset = input.offset ?? 0;
  const failures = input.artifact.summary.failures.slice(offset, offset + input.limit);
  const loadPacket = input.readPacket ?? readPacket;
  const selected: RejectPathLocalBatchTarget[] = [];
  for (const failure of failures) {
    const row = rowByScan.get(failure.scanId);
    const packetUri = row?.event?.packet_uri;
    if (!row || row.rejectObserved !== true) {
      throw new Error(`Failure ${failure.scanId} has no verified Reject-path packet.`);
    }
    const fallback = input.exactTargetFallbacks?.[failure.scanId];
    if (!packetUri && !fallback) {
      throw new Error(`Failure ${failure.scanId} has no verified Reject-path packet or exact-target fallback.`);
    }
    if (
      fallback &&
      (
        !/^https:\/\//.test(fallback.exactTargetUrl) ||
        !/^s3:\/\//.test(fallback.retainedEvidenceUri) ||
        !/^[a-f0-9]{64}$/.test(fallback.retainedEvidenceSha256)
      )
    ) {
      throw new Error(`Failure ${failure.scanId} has an invalid exact-target fallback.`);
    }
    const exactTargetUrl = packetUri
      ? (await loadPacket(packetUri)).targetUrl
      : fallback!.exactTargetUrl;
    selected.push({
      exactTargetUrl,
      normalizedDomain: new URL(exactTargetUrl).hostname.toLowerCase().replace(/^www\./, ""),
      packetUri: packetUri ?? fallback!.retainedEvidenceUri,
      sourceOutcome: row.packet?.reason ?? row.verification,
      sourceScanId: row.scanId,
    });
  }
  return selected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = JSON.parse(await readFile(path.resolve(args.input), "utf8")) as EnrichmentArtifact;
  const exactTargetFallbacks = args.fallbackTargets
    ? JSON.parse(await readFile(path.resolve(args.fallbackTargets), "utf8")) as Record<string, ExactTargetFallback>
    : undefined;
  const selected = await buildRejectPathFailureLocalBatch({
    artifact,
    exactTargetFallbacks,
    limit: args.limit,
    offset: args.offset,
  });
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    artifactVersion: "certscore.reject_path_failure_local_batch.v1",
    generatedAt: new Date().toISOString(),
    selected,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output, selected: selected.length }, null, 2));
}

function parseArgs(argv: string[]) {
  const parsed = {
    input: "artifacts/prod-reject-audit-20260831/reject-path-enrichment.json",
    fallbackTargets: "",
    limit: 10,
    offset: 0,
    output: "artifacts/prod-reject-audit-20260831/first-10-failed-selection.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = argv[++index];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--input") parsed.input = value;
    else if (arg === "--fallback-targets") parsed.fallbackTargets = value;
    else if (arg === "--limit") parsed.limit = Number(value);
    else if (arg === "--offset") parsed.offset = Number(value);
    else if (arg === "--output") parsed.output = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 50) {
    throw new Error("--limit must be an integer from 1 through 50");
  }
  if (!Number.isInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > 10_000) {
    throw new Error("--offset must be an integer from 0 through 10000");
  }
  return parsed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
