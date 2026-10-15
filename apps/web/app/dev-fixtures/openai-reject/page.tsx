import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ShadowScanReport } from "../../../components/scans/report-lab/shadow-scan-report";
import { buildTimelineReportModel } from "../../../components/scans/report-lab/timeline-report-model";
import { readPersistedScanReportProjection } from "../../../server/scans/scan-report-projection-contract";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";

export const dynamic = "force-dynamic";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

/** Read-only local replay of the saved report. No DB, scan or remote write. */
export default async function OpenaiRejectPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) notFound();
  const file = path.resolve(process.cwd(), "../../artifacts/openai-reject-local-2026-10-14/retained.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  const record = readPersistedScanReportProjection({ scan: saved.payload.scan, snapshot: {
    report_projection_payload: saved.payload,
    report_projection_payload_sha256: saved.payloadHash,
    report_projection_payload_size_bytes: Buffer.byteLength(JSON.stringify(canonical(saved.payload))),
    report_projection_status: saved.status, report_projection_version: saved.version,
    report_projection_computed_at: saved.computedAt,
  } } as Pick<ScanDetailResponse, "scan" | "snapshot">);
  if (!record || record.scan.id !== "14324058-98b5-4981-9f9c-cf5a76fb78d8") throw new Error("Saved OpenAI report failed verification");
  const report = buildTimelineReportModel(record);
  if (report.scan.visualEvidenceHref) report.scan.visualEvidenceHref = new URL(report.scan.visualEvidenceHref, "https://certscore.ai").href;
  return <><aside className="bg-amber-50 px-6 py-3 text-sm text-amber-950">Local preview of the saved EU-Ireland OpenAI scan. Findings and score preserved. Production unchanged.</aside><ShadowScanReport report={report} variant="timeline" reviewFocus="gdpr_eprivacy" /></>;
}
