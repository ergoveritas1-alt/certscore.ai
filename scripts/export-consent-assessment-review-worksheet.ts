import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Row = {
  reviewId: string;
  category: string;
  scanId: string;
  url: string;
  legacy: { accept: boolean | null; reject: boolean | null; options: boolean | null };
  assessment: { accept: boolean | null; reject: boolean | null; options: boolean | null };
  geometryStatus: string;
  assessmentStatus: string;
  surfaceStatus: string;
  coverageStatus: string;
  limitationCodes: string[];
  artifacts: { bundle: string; geometry: string | null };
};

function csv(value: unknown) {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function main() {
  const packetPath = process.argv.includes("--packet")
    ? process.argv[process.argv.indexOf("--packet") + 1]
    : "artifacts/consent-control-assessment-adjudication-packet-20260727.json";
  const outPath = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : process.argv.includes("--review-only")
      ? "artifacts/consent-control-assessment-review-only-20260727.csv"
      : "artifacts/consent-control-assessment-review-worksheet-20260727.csv";
  if (!packetPath || !outPath) throw new Error("packet and out paths are required");
  const packet = JSON.parse(await readFile(packetPath, "utf8")) as { rows: Row[] };
  const reviewOnly = process.argv.includes("--review-only");
  const header = reviewOnly ? [
    "review_id", "category", "scan_id", "url", "geometry_status", "assessment_status", "surface_status", "coverage_status",
    "retain_assessment", "adjudicated_accept_state", "adjudicated_reject_state", "adjudicated_options_state",
    "document_match_confirmed", "same_document_temporal_rule_applies", "false_to_unknown_repair_confirmed",
    "score_or_checklist_effect_reviewed", "reviewer_notes",
  ] : [
    "review_id", "category", "scan_id", "url", "legacy_accept", "legacy_reject", "legacy_options",
    "assessment_accept", "assessment_reject", "assessment_options", "geometry_status", "assessment_status",
    "surface_status", "coverage_status", "limitation_codes", "bundle_artifact", "geometry_artifact",
    "retain_assessment", "adjudicated_accept_state", "adjudicated_reject_state", "adjudicated_options_state",
    "document_match_confirmed", "same_document_temporal_rule_applies", "false_to_unknown_repair_confirmed",
    "score_or_checklist_effect_reviewed", "reviewer_notes",
  ];
  const rows = [...packet.rows].sort((left, right) => left.reviewId.localeCompare(right.reviewId)).map((row) => (reviewOnly ? [
    row.reviewId, row.category, row.scanId, row.url, row.geometryStatus, row.assessmentStatus, row.surfaceStatus, row.coverageStatus,
    "", "", "", "", "", "", "", "", "",
  ] : [
    row.reviewId, row.category, row.scanId, row.url,
    row.legacy.accept, row.legacy.reject, row.legacy.options,
    row.assessment.accept, row.assessment.reject, row.assessment.options,
    row.geometryStatus, row.assessmentStatus, row.surfaceStatus, row.coverageStatus,
    row.limitationCodes, row.artifacts.bundle, row.artifacts.geometry,
    "", "", "", "", "", "", "", "", "",
  ]).map(csv).join(","));
  const output = `${header.map(csv).join(",")}\n${rows.join("\n")}\n`;
  const absoluteOut = path.resolve(outPath);
  await mkdir(path.dirname(absoluteOut), { recursive: true });
  await writeFile(absoluteOut, output, "utf8");
  console.log(JSON.stringify({ out: absoluteOut, rows: rows.length, readOnly: true }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
