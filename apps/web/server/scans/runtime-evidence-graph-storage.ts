import "server-only";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getStorageBucketName } from "@website-signal-risk-scanner/db";
import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";
import { z } from "zod";
import type { ScanDetailResponse } from "./get-scan-by-id";

const MAX_BYTES = 768 * 1024;
const digest = (body: Buffer) => createHash("sha256").update(body).digest("hex");
const referenceSchema = z.object({
  contractVersion: z.literal("certscore.runtime-graph-reference.v1"),
  scanId: z.string().uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  sourceBundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  registryVersion: z.string().max(600),
}).strict();
type GraphReference = z.infer<typeof referenceSchema>;
const objectKey = (reference: Pick<GraphReference, "scanId" | "sha256">) => `runtime-graphs/v1/${reference.scanId}/${reference.sha256}.json`;
const cache = new Map<string, Buffer>(); // Immutable serialized bytes; at most 24 MiB, never an unbounded graph cache.

async function readObject(reference: GraphReference, signal = AbortSignal.timeout(2000)): Promise<Buffer> {
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: getStorageBucketName(), Key: objectKey(reference) }), { abortSignal: signal });
  if (response.ContentLength !== undefined && response.ContentLength !== reference.sizeBytes) throw new Error("graph_size_mismatch");
  if (!response.Body || !(Symbol.asyncIterator in response.Body)) throw new Error("graph_body_unavailable");
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of response.Body) {
    const bytes = Buffer.from(chunk); total += bytes.byteLength;
    if (total > reference.sizeBytes || total > MAX_BYTES) throw new Error("graph_size_exceeded");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function writeObject(reference: GraphReference, body: Buffer) {
  const signal = AbortSignal.timeout(1500); // One total deadline, including idempotent-write verification.
  try {
    await getS3Client().send(new PutObjectCommand({ Bucket: getStorageBucketName(), Key: objectKey(reference), Body: body, ContentType: "application/json", IfNoneMatch: "*", ChecksumSHA256: Buffer.from(reference.sha256, "hex").toString("base64") }), { abortSignal: signal });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
    const existing = await readObject(reference, signal);
    if (existing.byteLength !== reference.sizeBytes || digest(existing) !== reference.sha256) throw new Error("graph_existing_object_unverified");
  }
}

function unavailable(projection: ApiRuntimeEvidenceGraphProjection, reason: string): ApiRuntimeEvidenceGraphProjection {
  const { details: _details, ...metadata } = projection;
  return { ...metadata, status: "unavailable", graphs: [], limitations: [...new Set([...projection.limitations, reason])].slice(-16) };
}

/** Called only by canonical publication. Full graph bytes never enter the database report payload.
 * One content-addressed object per scan projection, not one object per event. A failed optional
 * graph upload stays explicitly unavailable and cannot break legacy report publication.
 */
export async function externalizeRuntimeGraphForPersistence(record: ScanDetailResponse, dependencies: { write?: typeof writeObject } = {}): Promise<ScanDetailResponse> {
  const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(record.runtimeArtifacts?.runtimeEvidenceGraphProjection);
  if (record.runtimeArtifacts?.runtimeEvidenceGraphProjection === undefined && record.runtimeArtifacts?.runtimeEvidenceGraphReference === undefined) return record;
  const artifacts = { ...record.runtimeArtifacts };
  delete artifacts.runtimeEvidenceGraphReference;
  if (!parsed.success) {
    delete artifacts.runtimeEvidenceGraphProjection;
    return { ...record, runtimeArtifacts: artifacts };
  }
  const projection = parsed.data;
  if (!projection.graphs.length && !projection.details && projection.scanId === record.scan.id) return { ...record, runtimeArtifacts: artifacts };
  if (projection.details) {
    const reference = referenceSchema.safeParse(record.runtimeArtifacts?.runtimeEvidenceGraphReference);
    if (reference.success && reference.data.scanId === record.scan.id && projection.scanId === record.scan.id && reference.data.sha256 === projection.details.sha256 && reference.data.sourceBundleSha256 === projection.sourceBundle?.sha256 && reference.data.registryVersion === projection.registryVersion) return record;
  }
  try {
    if (projection.scanId !== record.scan.id || !projection.sourceBundle || projection.details) throw new Error("graph_persistence_identity_mismatch");
    const body = Buffer.from(JSON.stringify(projection));
    const reference = referenceSchema.parse({ contractVersion: "certscore.runtime-graph-reference.v1", scanId: record.scan.id, sha256: digest(body), sizeBytes: body.byteLength, sourceBundleSha256: projection.sourceBundle.sha256, registryVersion: projection.registryVersion });
    await (dependencies.write ?? writeObject)(reference, body);
    artifacts.runtimeEvidenceGraphReference = reference;
    artifacts.runtimeEvidenceGraphProjection = { ...projection, graphs: [], details: {
      href: `/api/scans/${record.scan.id}/runtime-evidence-graph`, sha256: reference.sha256,
      scenarioCount: projection.graphs.length, nodeCount: projection.graphs.reduce((sum, graph) => sum + graph.nodes.length, 0), edgeCount: projection.graphs.reduce((sum, graph) => sum + graph.edges.length, 0),
    } } satisfies ApiRuntimeEvidenceGraphProjection;
  } catch {
    artifacts.runtimeEvidenceGraphProjection = { ...unavailable(projection, "relationship_artifact_retention_unavailable"), scanId: record.scan.id };
  }
  return { ...record, runtimeArtifacts: artifacts };
}

/** Caller must establish scan access and claim the canonical read quota before loading bytes. */
export async function hydrateRuntimeGraphForRead(record: ScanDetailResponse, dependencies: { read?: typeof readObject; environment?: Record<string, string | undefined> } = {}): Promise<ScanDetailResponse> {
  if ((dependencies.environment ?? process.env).CERTSCORE_RUNTIME_GRAPH_PRESENTATION !== "on") {
    const artifacts = { ...record.runtimeArtifacts }; delete artifacts.runtimeEvidenceGraphProjection; delete artifacts.runtimeEvidenceGraphReference;
    return { ...record, runtimeArtifacts: artifacts };
  }
  const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(record.runtimeArtifacts?.runtimeEvidenceGraphProjection);
  if (!parsed.success || !parsed.data.details) return record;
  const projection = parsed.data;
  const parsedReference = referenceSchema.safeParse(record.runtimeArtifacts?.runtimeEvidenceGraphReference);
  let resolved = unavailable(projection, "relationship_artifact_unverified");
  if (parsedReference.success && parsedReference.data.scanId === record.scan.id && projection.scanId === record.scan.id && parsedReference.data.sha256 === projection.details?.sha256 && parsedReference.data.sourceBundleSha256 === projection.sourceBundle?.sha256 && parsedReference.data.registryVersion === projection.registryVersion) {
    const reference = parsedReference.data; const key = objectKey(reference);
    try {
      const body = dependencies.read ? await dependencies.read(reference) : cache.get(key) ?? await readObject(reference);
      if (body.byteLength !== reference.sizeBytes || digest(body) !== reference.sha256) throw new Error("graph_integrity_failed");
      const graph = apiRuntimeEvidenceGraphProjectionSchema.parse(JSON.parse(body.toString("utf8")));
      if (graph.details || graph.scanId !== reference.scanId || graph.sourceBundle?.sha256 !== reference.sourceBundleSha256 || graph.registryVersion !== reference.registryVersion) throw new Error("graph_identity_failed");
      if (graph.graphs.length !== projection.details!.scenarioCount || graph.graphs.reduce((sum, item) => sum + item.nodes.length, 0) !== projection.details!.nodeCount || graph.graphs.reduce((sum, item) => sum + item.edges.length, 0) !== projection.details!.edgeCount) throw new Error("graph_summary_mismatch");
      resolved = graph;
      if (!dependencies.read) { cache.delete(key); cache.set(key, body); while (cache.size > 32) cache.delete(cache.keys().next().value!); }
    } catch { /* Fail closed without logging untrusted body, URLs, or secrets. No automatic rescan/republication. */ }
  }
  return { ...record, runtimeArtifacts: { ...record.runtimeArtifacts, runtimeEvidenceGraphProjection: resolved } };
}
