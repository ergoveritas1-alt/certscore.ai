import "server-only";
import { createHash } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { query } from "@website-signal-risk-scanner/db";
import { getRuntimeVersionInfo } from "../runtime-version";

const compress = promisify(gzip), decompress = promisify(gunzip);
const MAX_BYTES = 512 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Filters and evidence requests keep their existing live, paginated read path. */
export function isDefaultFullSiteReport(params: URLSearchParams, exportAllPages: boolean) {
  if (exportAllPages || params.get("kind") !== "all") return false;
  const defaults: Record<string, string> = { kind: "all", stream: "1", offset: "0", sort: "priority", pageSort: "url" };
  return [...params].every(([key, value]) => value === "" || defaults[key] === value);
}

/** Hash compact inputs in Postgres: do not transfer page evidence just to validate a hit. */
export async function fullSiteReportSourceKey(scanId: string) {
  const { rows: [row] } = await query<{ fingerprint: string }>(`
    select md5(jsonb_build_array(
      to_jsonb(c) - 'policy_json', c.policy_json - 'fullSiteScore',
      s.report_projection_payload_sha256, s.report_projection_status, s.report_projection_version,
      (select jsonb_agg(jsonb_build_array(p.id,p.target_url,p.final_url,p.source,p.discovery_count,
        p.discovery_sources,p.selection_reason,p.status,p.limitation,p.attempt_count,p.attempt_id,
        p.completed_at,p.compact_json,p.created_at) order by p.id)
        from full_site_pages p where p.scan_id=c.scan_id),
      (select jsonb_agg(jsonb_build_array(a.id,a.status,a.artifact_json) order by a.id)
        from full_site_attempts a join full_site_pages p on p.id=a.page_id where p.scan_id=c.scan_id)
    )::text) as fingerprint
    from full_site_crawls c join scan_snapshots s on s.scan_id=c.scan_id
    where c.scan_id=$1 and c.status='completed'
      and not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status in ('queued','dispatching','active'))`, [scanId]);
  if (!row) return null;
  const revision = getRuntimeVersionInfo(process.env).gitSha ?? "local";
  return hash(JSON.stringify(["full-site-report-cache.v1", revision, scanId, row.fingerprint]));
}

export async function readFullSiteReportCache(scanId: string, sourceKey: string): Promise<unknown | null> {
  const { rows: [row] } = await query<{ payload: Buffer; payload_sha256: string }>(
    `select payload,payload_sha256 from full_site_report_cache where scan_id=$1 and source_key=$2
      and created_at > now() - interval '24 hours'`, [scanId, sourceKey]);
  if (!row || row.payload.length > MAX_BYTES || hash(row.payload) !== row.payload_sha256) return null;
  try {
    return JSON.parse((await decompress(row.payload, { maxOutputLength: MAX_JSON_BYTES })).toString("utf8"));
  } catch { return null; }
}

export async function writeFullSiteReportCache(scanId: string, sourceKey: string, report: unknown) {
  const json = JSON.stringify(report);
  if (Buffer.byteLength(json) > MAX_JSON_BYTES) return false;
  const payload = await compress(json);
  if (payload.length > MAX_BYTES) return false;
  // A changed source during assembly must never be saved under the earlier identity.
  if (await fullSiteReportSourceKey(scanId) !== sourceKey) return false;
  const slot = Number.parseInt(hash(scanId).slice(0, 8), 16) % 128;
  await query(`insert into full_site_report_cache(slot,scan_id,source_key,payload,payload_sha256)
    values($1,$2,$3,$4,$5) on conflict(slot) do update set scan_id=excluded.scan_id,
    source_key=excluded.source_key,payload=excluded.payload,payload_sha256=excluded.payload_sha256,created_at=now()`,
  [slot, scanId, sourceKey, payload, hash(payload)]);
  return true;
}
