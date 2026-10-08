import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

// Server-to-server optimization only. These bytes never replace persisted
// artifact identities, evidence assessment, or the original S3 recovery path.
export const REPORT_ARTIFACT_TRANSFER_VERSION = "certscore.report-artifact-transfer.v1";
export const REPORT_ARTIFACT_TRANSFER_MAX_COMPRESSED_BYTES = 48 * 1024;
export const REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES = 8 * 1024 * 1024;
export const REPORT_ARTIFACT_TRANSFER_MAX_REQUEST_BYTES = 72 * 1024;
type Kind = "bundle" | "manifest";
export type ReportArtifactIdentity = { uri: string; sha256: string; sizeBytes: number };
export type ReportArtifactTransfer = {
  schemaVersion: typeof REPORT_ARTIFACT_TRANSFER_VERSION;
  scanId: string;
  artifacts: Array<{ kind: Kind; gzipBase64: string }>;
};

export function reportArtifactIdentityKey(identity: ReportArtifactIdentity) {
  return JSON.stringify([identity.uri, identity.sha256.toLowerCase(), identity.sizeBytes]);
}

export function buildReportArtifactTransfer(input: {
  scanId: string;
  bundle: Buffer;
  manifest: Buffer;
}): ReportArtifactTransfer | undefined {
  const artifacts: ReportArtifactTransfer["artifacts"] = [];
  let compressedBytes = 0;
  let rawBytes = 0;
  // A large screenshot-rich bundle still benefits from an early manifest:
  // dependent geometry/policy reads can start while the original bundle downloads.
  for (const kind of ["manifest", "bundle"] as const) {
    const body = input[kind];
    if (body.byteLength + rawBytes > REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES) continue;
    try {
      const compressed = gzipSync(body, { level: 1, maxOutputLength: REPORT_ARTIFACT_TRANSFER_MAX_COMPRESSED_BYTES });
      if (compressed.byteLength + compressedBytes > REPORT_ARTIFACT_TRANSFER_MAX_COMPRESSED_BYTES) continue;
      artifacts.push({ kind, gzipBase64: compressed.toString("base64") });
      compressedBytes += compressed.byteLength;
      rawBytes += body.byteLength;
    } catch {
      // A disposable transport failure must not fail verified ingestion.
    }
  }
  return artifacts.length ? { schemaVersion: REPORT_ARTIFACT_TRANSFER_VERSION, scanId: input.scanId, artifacts } : undefined;
}

/** Trust only identities loaded from the authorized scan's persisted result. */
export function verifyReportArtifactTransfer(input: {
  transfer: unknown;
  scanId: string;
  bundle: ReportArtifactIdentity | null;
  manifest: ReportArtifactIdentity | null;
}): ReadonlyMap<string, Buffer> {
  const verified = new Map<string, Buffer>();
  try {
    const transfer = input.transfer as ReportArtifactTransfer | undefined;
    if (!transfer || transfer.schemaVersion !== REPORT_ARTIFACT_TRANSFER_VERSION ||
        transfer.scanId !== input.scanId || !Array.isArray(transfer.artifacts) || (transfer.artifacts.length < 1 || transfer.artifacts.length > 2)) return verified;
    let compressedBytes = 0;
    let rawBytes = 0;
    const kinds = new Set<Kind>();
    for (const artifact of transfer.artifacts) {
      if (!artifact || (artifact.kind !== "bundle" && artifact.kind !== "manifest") || kinds.has(artifact.kind)) return new Map();
      kinds.add(artifact.kind);
      const identity = input[artifact.kind];
      if (!identity || !identity.uri.startsWith("s3://") || !/^[a-f0-9]{64}$/i.test(identity.sha256) ||
          !Number.isSafeInteger(identity.sizeBytes) || identity.sizeBytes <= 0 ||
          identity.sizeBytes > REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES) return new Map();
      if (typeof artifact.gzipBase64 !== "string" || artifact.gzipBase64.length > Math.ceil(REPORT_ARTIFACT_TRANSFER_MAX_COMPRESSED_BYTES / 3) * 4 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.gzipBase64)) return new Map();
      const compressed = Buffer.from(artifact.gzipBase64, "base64");
      compressedBytes += compressed.byteLength;
      rawBytes += identity.sizeBytes;
      if (compressedBytes > REPORT_ARTIFACT_TRANSFER_MAX_COMPRESSED_BYTES || rawBytes > REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES) return new Map();
      const body = gunzipSync(compressed, { maxOutputLength: identity.sizeBytes });
      if (body.byteLength !== identity.sizeBytes || createHash("sha256").update(body).digest("hex") !== identity.sha256.toLowerCase()) return new Map();
      const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      if (parsed.scanId !== input.scanId) return new Map();
      if (artifact.kind === "manifest" && (parsed.processor !== "local-certscore-v2-dag-parallel-v1" || parsed.targetEnvironment !== "production")) return new Map();
      if (artifact.kind === "bundle" && parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" && parsed.schemaVersion !== "certscore.v2.alpha.1") return new Map();
      verified.set(reportArtifactIdentityKey(identity), body);
    }
    return verified;
  } catch {
    // Invalid transport is never evidence. Both originals remain readable from
    // S3 under the existing checksum/schema checks; no retry is introduced.
    return new Map();
  }
}

/** Bounded, process-local, disposable optimization; durable recovery uses S3. */
export function createReportArtifactTransferCache(now = Date.now) {
  const entries = new Map<string, { transfer: ReportArtifactTransfer; expiresAt: number }>();
  return {
    retain(transfer: ReportArtifactTransfer | undefined) {
      if (!transfer) return;
      for (const [id, entry] of entries) if (entry.expiresAt <= now()) entries.delete(id);
      entries.delete(transfer.scanId);
      entries.set(transfer.scanId, { transfer, expiresAt: now() + 5 * 60_000 });
      while (entries.size > 32) entries.delete(entries.keys().next().value!);
    },
    take(scanId: string) {
      const entry = entries.get(scanId);
      entries.delete(scanId);
      return entry && entry.expiresAt > now() ? entry.transfer : undefined;
    },
  };
}
