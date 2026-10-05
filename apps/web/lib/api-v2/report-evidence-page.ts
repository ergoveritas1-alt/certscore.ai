import { createHash } from "node:crypto";
import type { ReportEvidencePage, ReportEvidenceSection } from "@certscore/api-contracts";

type Entry = ReportEvidencePage["entries"][number];
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
function canonical(value: unknown): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
function entriesFor(value: any, path = ""): Entry[] {
  if (bytes({ path, value }) <= 6000) return [{ path, value }];
  if (typeof value === "string") {
    // Code-point boundaries preserve Unicode; even escaped control characters fit.
    const parts: string[] = [];
    let part = "";
    for (const point of value) {
      if (bytes(part + point) > 4000) { parts.push(part); part = ""; }
      part += point;
    }
    if (part) parts.push(part);
    return parts.map((value, stringPart) => ({ path, value, stringPart, stringParts: parts.length }));
  }
  // Parent container markers preserve arrays, empty values and numeric object keys.
  return [{ path, value: Array.isArray(value) ? [] : {} }, ...Object.entries(value).flatMap(([key, child]) => entriesFor(child, `${path}/${escapePointer(key)}`))];
}
export class ReportPageCursorError extends Error {}
export function buildReportEvidencePage(input: { scanId: string; report: unknown; cursor?: string | null; section?: ReportEvidenceSection }): ReportEvidencePage {
  const report = canonical(input.report);
  const snapshot = createHash("sha256").update(JSON.stringify({ version: 1, scanId: input.scanId, report, ...(input.section ? { section: input.section } : {}) })).digest("hex");
  const entries = entriesFor(report);
  let offset = 0;
  if (input.cursor) {
    const match = /^v1\.([a-f0-9]{64})\.(0|[1-9]\d{0,9})$/.exec(input.cursor);
    if (!match || match[1] !== snapshot) throw new ReportPageCursorError("Invalid or changed report snapshot. Restart without a cursor; do not combine snapshots.");
    offset = Number(match[2]);
    if (offset >= entries.length) throw new ReportPageCursorError("Cursor is outside this report. Restart without a cursor.");
  }
  const page: Entry[] = [];
  for (let i = offset; i < entries.length; i++) {
    if (page.length && bytes([...page, entries[i]]) > 64000) break;
    page.push(entries[i]!);
  }
  const next = offset + page.length;
  return {
    type: "certscore_report_evidence_page", version: 1, scanId: input.scanId, snapshot,
    reportUrl: `https://certscore.ai/scan/${input.scanId}`,
    ...(input.section ? { section: input.section } : {}),
    entries: page,
    pagination: { offset, returned: page.length, total: entries.length, complete: next === entries.length, nextCursor: next < entries.length ? `v1.${snapshot}.${next}` : null },
    coverage: { scope: "public_report_projection", exportTruncated: false, observationCompleteness: "see_report_coverage", exclusions: ["raw_scanner_artifacts_not_shown_in_report", "diagnostic_json_downloads", "internal_runtime_graph", "image_binary_bytes", ...(input.section ? ["unselected_report_sections"] : [])] },
    reconstruction: `Apply entries in order at their RFC 6901 JSON Pointer paths (empty path is the root). Containers precede children. For stringPart entries concatenate value by stringPart, zero-based, through stringParts. Follow nextCursor until complete; keep one snapshot${input.section ? " and the same section selector" : ""}. Complete means ${input.section ? "the selected report sections" : "the report projection"} ${input.section ? "were" : "was"} fully exported, not that scan observations were complete. Report coverage, retained samples and limitations remain authoritative. Images remain report links, not binary data. reportContentRef values point to identical display records stored once in the reconstructed document; resolve these RFC 6901 pointers after reconstruction.`,
  };
}
