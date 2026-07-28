import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { replayBundle } from "./replay-consent-control-assessment.js";
import type { ConsentControlAssessment } from "../packages/certscore-contracts/src/index.js";

type BackfillRow = {
  scanId: string;
  artifactPath: string;
  idempotencyKey: string;
  assessmentVersion: string;
  assessmentStatus: ConsentControlAssessment["assessmentStatus"];
  computedAt: string;
  sourceHash: string;
  compatibility: {
    accept: boolean | null;
    reject: boolean | null;
    options: boolean | null;
  };
  assessment: ConsentControlAssessment;
  writeOperation: "upsert_scan_snapshot_assessment";
};

function parseArgs(argv: string[]) {
  const args = {
    root: "artifacts/local-v2-dag-scans",
    out: "artifacts/consent-control-assessment-backfill-plan-20260727.json",
    limit: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--root" && value) { args.root = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
    else if (arg === "--limit" && value) { args.limit = Number.parseInt(value, 10); index += 1; }
  }
  return args;
}

async function findBundlePaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await findBundlePaths(entryPath));
    else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") paths.push(entryPath);
  }
  return paths.sort();
}

function controlState(assessment: ConsentControlAssessment, key: "accept" | "reject" | "options") {
  const state = assessment.controls[key].state;
  return state === "observed" ? true : state === "not_observed" ? false : null;
}

function compareRows(left: BackfillRow, right: BackfillRow) {
  const byTime = left.computedAt.localeCompare(right.computedAt);
  return byTime !== 0 ? byTime : left.artifactPath.localeCompare(right.artifactPath);
}

export async function buildConsentAssessmentBackfillPlan(root: string, limit = Number.POSITIVE_INFINITY) {
  const rows: BackfillRow[] = [];
  const paths = (await findBundlePaths(root)).slice(0, limit);
  for (const artifactPath of paths) {
    const replay = await replayBundle(artifactPath);
    if (replay.status !== "projected" || !replay.assessment) continue;
    const assessment = replay.assessment;
    rows.push({
      scanId: replay.scanId,
      artifactPath,
      idempotencyKey: `${replay.scanId}:${assessment.provenance.sourceHash}:${assessment.provenance.projectorVersion}`,
      assessmentVersion: assessment.artifactVersion,
      assessmentStatus: assessment.assessmentStatus,
      computedAt: assessment.provenance.computedAt,
      sourceHash: assessment.provenance.sourceHash,
      compatibility: {
        accept: controlState(assessment, "accept"),
        reject: controlState(assessment, "reject"),
        options: controlState(assessment, "options"),
      },
      assessment,
      writeOperation: "upsert_scan_snapshot_assessment",
    });
  }

  const latestByScanId = new Map<string, BackfillRow>();
  for (const row of rows.sort(compareRows)) latestByScanId.set(row.scanId, row);
  return [...latestByScanId.values()].sort((left, right) => left.scanId.localeCompare(right.scanId));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  const out = path.resolve(args.out);
  const rows = await buildConsentAssessmentBackfillPlan(root, args.limit);
  const plan = {
    artifactType: "consent_control_assessment_backfill_plan",
    artifactVersion: "1.0",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writeRequested: false,
    sourceRoot: root,
    operation: "upsert_scan_snapshot_assessment",
    idempotency: "scan_id + source_hash + projector_version",
    compatibilityPolicy: "observed=true, not_observed=false, unknown=null",
    summary: {
      bundlesRead: (await findBundlePaths(root)).slice(0, args.limit).length,
      rows: rows.length,
      complete: rows.filter((row) => row.assessmentStatus === "complete").length,
      limited: rows.filter((row) => row.assessmentStatus === "limited").length,
      unknownAccept: rows.filter((row) => row.compatibility.accept === null).length,
      unknownReject: rows.filter((row) => row.compatibility.reject === null).length,
      unknownOptions: rows.filter((row) => row.compatibility.options === null).length,
    },
    rows,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out, summary: plan.summary, readOnly: plan.readOnly, writeRequested: plan.writeRequested }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
