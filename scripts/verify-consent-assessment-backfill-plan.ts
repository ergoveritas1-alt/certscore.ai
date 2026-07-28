import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { consentControlAssessmentSchema, type ConsentControlAssessment } from "../packages/certscore-contracts/src/index.js";

type PlanRow = {
  scanId: string;
  idempotencyKey: string;
  sourceHash: string;
  assessment: ConsentControlAssessment;
  compatibility: { accept: boolean | null; reject: boolean | null; options: boolean | null };
};

type Plan = { readOnly: boolean; writeRequested: boolean; rows: PlanRow[]; summary: Record<string, unknown> };

function getArg(argv: string[], name: string, fallback: string) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function expectedCompatibility(assessment: ConsentControlAssessment, key: "accept" | "reject" | "options") {
  const state = assessment.controls[key].state;
  return state === "observed" ? true : state === "not_observed" ? false : null;
}

export function verifyConsentAssessmentBackfillPlan(plan: Plan) {
  const errors: string[] = [];
  if (plan.readOnly !== true) errors.push("plan must be readOnly");
  if (plan.writeRequested !== false) errors.push("plan must not request writes");
  const scanIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  for (const row of plan.rows) {
    if (scanIds.has(row.scanId)) errors.push(`duplicate scan_id: ${row.scanId}`);
    scanIds.add(row.scanId);
    if (idempotencyKeys.has(row.idempotencyKey)) errors.push(`duplicate idempotency key: ${row.idempotencyKey}`);
    idempotencyKeys.add(row.idempotencyKey);
    const assessment = consentControlAssessmentSchema.safeParse(row.assessment);
    if (!assessment.success) {
      errors.push(`invalid assessment ${row.scanId}: ${assessment.error.issues[0]?.message ?? "schema error"}`);
      continue;
    }
    if (assessment.data.provenance.sourceHash !== row.sourceHash) errors.push(`source hash mismatch: ${row.scanId}`);
    for (const key of ["accept", "reject", "options"] as const) {
      if (row.compatibility[key] !== expectedCompatibility(assessment.data, key)) errors.push(`compatibility mismatch: ${row.scanId}:${key}`);
    }
    if (assessment.data.scan.noGo && Object.values(assessment.data.controls).some((control) => control.state === "observed")) {
      errors.push(`no-go assessment contains observed control: ${row.scanId}`);
    }
  }
  return { ok: errors.length === 0, errors, rows: plan.rows.length, uniqueScanIds: scanIds.size, uniqueIdempotencyKeys: idempotencyKeys.size };
}

async function main() {
  const planPath = getArg(process.argv.slice(2), "--plan", "artifacts/consent-control-assessment-backfill-plan-20260727.json");
  const plan = JSON.parse(await readFile(planPath, "utf8")) as Plan;
  const result = verifyConsentAssessmentBackfillPlan(plan);
  console.log(JSON.stringify({ plan: planPath, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
