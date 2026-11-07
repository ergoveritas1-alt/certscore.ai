import "server-only";
import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rename, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { queryOne } from "@website-signal-risk-scanner/db";
import { scanCreatorSql } from "../../lib/admin/scan-creation-source";
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from "../../lib/admin/mac-mini-scan-bot";
import { projectScanReportNoGo } from "../../lib/scans/scan-report-disposition";
import { readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { PrivacyFormReceiptReference } from "./privacy-form-audit-receipt";

type LocalPrivacyFormInput = PrivacyFormReceiptReference & { file: string };

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const hex = /^[a-f0-9]{64}$/;
const maxListBytes = 16_000_000;
const maxEntries = 15_000;
const maxWindowMs = 32 * 86_400_000;
const fixtureClasses = new Set(["test", "synthetic", "fixture", "diagnostic", "internal", "routine_canary", "canary"]);

function localDatabase(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["postgres:", "postgresql:"].includes(url.protocol) && localHosts.has(url.hostname)
      && [...url.searchParams.keys()].every(key => key === "sslmode" || key === "application_name");
  } catch {
    return false;
  }
}

async function auditDirectory() {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return null;
  if (!localDatabase(process.env.DATABASE_URL) ||
      process.env.DATABASE_READ_URL && !localDatabase(process.env.DATABASE_READ_URL)) return null;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (!["http:", "https:"].includes(url.protocol) || !localHosts.has(url.hostname)) return null;
  } catch {
    return null;
  }
  if (process.env.NODE_ENV === "test") {
    const fixtureDir = process.env.CERTSCORE_PRIVACY_FORM_FIXTURE_DIR;
    if (!fixtureDir || !path.isAbsolute(fixtureDir) || path.basename(path.resolve(fixtureDir)) !== "fixture-inbox") return null;
    try {
      if (!(await lstat(fixtureDir)).isDirectory()) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return fixtureDir;
  }
  for (const root of [process.cwd(), path.resolve(process.cwd(), "../..")]) {
    const script = path.join(root, "scripts/prepare-audit-opt-out-inputs.ts");
    if (await stat(script).then(result => result.isFile(), () => false)) {
      return path.join(root, "artifacts/daily-scan-audit");
    }
  }
  return null;
}

function isFixtureTarget(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value.includes("://") ? value : "https://" + value);
    return localHosts.has(url.hostname) || /\.(test|invalid)$/.test(url.hostname)
      || /^(www\.)?ergoveritas\.com$/.test(url.hostname)
      || url.pathname.startsWith("/.well-known/certscore-canary/");
  } catch {
    return true;
  }
}

/** Every local publisher uses the same lock, including retries of a ready report. */
async function withListLock<T>(directory: string, run: () => Promise<T>) {
  const lock = path.join(directory, ".privacy-form-inputs.lock");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 39) throw error;
      await delay(25);
    }
  }
  try {
    return await run();
  } finally {
    await rmdir(lock);
  }
}

async function atomicWrite(file: string, bytes: Buffer, replace: boolean) {
  const temp = file + "." + randomUUID() + ".tmp";
  const handle = await open(temp, "wx", 0o600);
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (replace) await rename(temp, file);
    else {
      try {
        await link(temp, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" ||
            (await stat(file)).size !== bytes.length || !(await readFile(file)).equals(bytes)) throw error;
      }
    }
  } finally {
    await unlink(temp).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}

async function readIndex(file: string): Promise<LocalPrivacyFormInput[]> {
  let bytes: Buffer;
  try {
    if ((await stat(file)).size > maxListBytes) throw Error("Local audit receipt list exceeds the byte bound");
    bytes = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (bytes.length > maxListBytes) throw Error("Local audit receipt list exceeds the byte bound");
  const entries = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(entries) || entries.length > maxEntries) throw Error("Invalid local audit receipt list");
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = entry?.binding?.scanId;
    if (typeof id !== "string" || ids.has(id) || !Number.isFinite(Date.parse(entry.binding.createdAt)) ||
        !path.isAbsolute(entry.file ?? "") || !hex.test(entry.sha256 ?? "")) throw Error("Invalid local audit receipt reference");
    ids.add(id);
  }
  return entries;
}

/** Audit delivery is downstream of publication. A local I/O error leaves the ready report available for retry. */
export async function maybePublishLocalPrivacyFormAuditReceipt(
  scan: ScanDetailResponse["scan"], snapshot: Record<string, unknown> | null | undefined,
) {
  try {
    const directory = await auditDirectory();
    if (!directory || !snapshot || snapshot.report_projection_version !== SCAN_REPORT_PROJECTION_VERSION) return;
    if (snapshot.report_projection_status !== "ready" || scan.status !== "completed") return;
    if (process.env.NODE_ENV !== "test" && isFixtureTarget(scan.domainHostname)) return;

    const payloadSha = snapshot.report_projection_payload_sha256 as string;
    const sourceHash = snapshot.report_projection_source_hash as string;
    await withListLock(directory, async () => {
      // This bounded read runs only on the local development DB. Resolve the
      // original creator and recheck the exact ready generation under the list lock.
      const origin = await queryOne<{
        original_request_id: string; requested_url: string | null; traffic_class: string | null; created_at: Date | string;
        report_projection_computed_at: Date | string;
      }>(`select origin.public_id as original_request_id, origin.requested_url,
                s.activity_traffic->>'class' as traffic_class, s.created_at, p.report_projection_computed_at
           from public.scans s
           join public.scan_snapshots p on p.scan_id=s.id
           join lateral (${scanCreatorSql("s.id")}) origin on true
           join public.integration_api_keys k on k.public_id=origin.requested_by->>'apiKeyId'
          where s.id=$1::uuid and s.status in ('completed','completed_limited') and p.report_projection_status='ready'
            and p.report_projection_version=$2 and p.report_projection_source_hash=$3
            and p.report_projection_payload_sha256=$4 and k.name=any($5::text[])
            and not exists (select 1 from public.scan_score_materialization_requests r
              where r.scan_id=s.id and r.status='terminal_failure')
          limit 1`, [scan.id, SCAN_REPORT_PROJECTION_VERSION, sourceHash, payloadSha, MAC_MINI_SCAN_BOT_API_KEY_NAMES]);
      if (!origin || !/^pulse_req_[a-z0-9_-]+$/i.test(origin.original_request_id)) return;
      if (process.env.NODE_ENV !== "test" &&
          (fixtureClasses.has(origin.traffic_class ?? "") || isFixtureTarget(origin.requested_url))) return;
      const projection = readPersistedScanReportProjection({
        scan, snapshot: { ...snapshot, report_projection_computed_at: origin.report_projection_computed_at },
      } as Pick<ScanDetailResponse, "scan" | "snapshot">);
      if (!projection || projectScanReportNoGo(projection) || new Date(origin.created_at).toISOString() !== projection.scan.createdAt) return;
      const runtimeSource = projection.runtimeArtifacts?.gdprNarrowPostureSource as
        { scanId?: string; sha256?: string; verificationStatus?: string } | undefined;
      const results = projection.events.filter(event => event.eventType === "v2_lambda_result.received");
      const original = results[0]?.metadataJson as { artifactMetadata?: { scanArtifactUri?: { sha256?: string }; manifestUri?: { sha256?: string } } } | undefined;
      const bundle = original?.artifactMetadata?.scanArtifactUri?.sha256 ?? "";
      const manifest = original?.artifactMetadata?.manifestUri?.sha256 ?? "";
      if (results.length !== 1 || !hex.test(bundle) || !hex.test(manifest) || runtimeSource?.scanId !== scan.id ||
          runtimeSource.verificationStatus !== "verified" || runtimeSource.sha256 !== bundle) return;
      const { encodeVerifiedPrivacyFormReceipt, readPrivacyFormAuditReceipt, PRIVACY_FORM_RECEIPT_MAX_BYTES } =
        await import("./privacy-form-audit-receipt");
      const binding = {
        scanId: scan.id, createdAt: projection.scan.createdAt, generation: SCAN_REPORT_PROJECTION_VERSION,
        projectionSourceHash: sourceHash, projectionPayloadSha256: payloadSha, persistedSourceSha256: payloadSha,
        originalRequestId: origin.original_request_id, originalBundleSha256: bundle, originalManifestSha256: manifest,
      };
      const encoded = encodeVerifiedPrivacyFormReceipt(snapshot.report_projection_payload, binding);
      const index = path.join(directory, "privacy-form-inputs.json");
      const entries = await readIndex(index);
      const previous = entries.find(entry => entry.binding.scanId === scan.id);
      if (previous?.binding.projectionPayloadSha256 === payloadSha && previous.binding.projectionSourceHash === sourceHash) {
        if ((await stat(previous.file)).size > PRIVACY_FORM_RECEIPT_MAX_BYTES) throw Error("Existing receipt exceeds the byte bound");
        const row = { scanId: scan.id, createdAt: binding.createdAt, reportable: true, projectionVersion: binding.generation,
          publicProjectionSourceHash: sourceHash, originProof: "original_credential_verified", originRequestId: binding.originalRequestId };
        const prior = readPrivacyFormAuditReceipt(await readFile(previous.file), previous, row);
        const next = readPrivacyFormAuditReceipt(encoded.bytes, encoded.reference, row);
        if (previous.binding.originalBundleSha256 !== bundle || previous.binding.originalManifestSha256 !== manifest ||
            !isDeepStrictEqual(prior, next)) throw Error("Conflicting local receipts for the same persisted projection");
        return;
      }
      const receiptDir = path.join(directory, "privacy-form-receipts");
      const file = path.join(receiptDir, `${scan.id}-${encoded.reference.sha256}.json`);
      const remaining = entries.filter(entry => entry.binding.scanId !== scan.id &&
        Date.parse(entry.binding.createdAt) >= Date.now() - maxWindowMs);
      remaining.push({ file, ...encoded.reference });
      const listBytes = Buffer.from(JSON.stringify(remaining, null, 2) + "\n");
      if (remaining.length > maxEntries || listBytes.length > maxListBytes) throw Error("Local audit receipt list exceeds its bound");
      await mkdir(receiptDir, { mode: 0o700, recursive: true });
      await atomicWrite(file, encoded.bytes, false);
      await atomicWrite(index, listBytes, true);
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "scan.local_privacy_form_receipt.failed", scanId: scan.id,
      reason: error instanceof Error ? error.name : "UnknownError" }));
  }
}
