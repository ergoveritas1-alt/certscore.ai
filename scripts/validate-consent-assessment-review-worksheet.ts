import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const required = [
  "retain_assessment", "adjudicated_accept_state", "adjudicated_reject_state", "adjudicated_options_state",
  "document_match_confirmed", "same_document_temporal_rule_applies", "false_to_unknown_repair_confirmed",
  "score_or_checklist_effect_reviewed",
];

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

function getArg(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export function validateConsentAssessmentWorksheet(csv: string) {
  const lines = csv.trimEnd().split("\n");
  if (lines.length < 2) return { ok: false, errors: ["worksheet has no data rows"], rows: 0, pendingFields: 0 };
  const header = parseCsvLine(lines[0] ?? "");
  const positions = new Map(header.map((name, index) => [name, index]));
  const errors: string[] = [];
  for (const field of required) if (!positions.has(field)) errors.push(`missing required column: ${field}`);
  let pendingFields = 0;
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const row = parseCsvLine(lines[rowIndex] ?? "");
    const reviewId = row[positions.get("review_id") ?? -1] ?? `row-${rowIndex}`;
    for (const field of required) {
      const value = row[positions.get(field) ?? -1]?.trim() ?? "";
      if (!value) { pendingFields += 1; if (errors.length < 20) errors.push(`${reviewId}: pending ${field}`); }
    }
  }
  return { ok: errors.length === 0 && pendingFields === 0, errors, rows: lines.length - 1, pendingFields };
}

async function main() {
  const worksheet = getArg("--worksheet", "artifacts/consent-control-assessment-review-worksheet-20260727.csv");
  const result = validateConsentAssessmentWorksheet(await readFile(worksheet, "utf8"));
  console.log(JSON.stringify({ worksheet, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
