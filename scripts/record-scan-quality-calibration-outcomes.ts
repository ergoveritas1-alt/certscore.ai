import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  recordCalibrationOutcomes,
  validateCalibrationLedger,
  type CalibrationLedger,
  type CalibrationTarget,
  type CohortSummaryForLedger,
} from "./lib/scan-quality-calibration-ledger.js";

type Manifest = {
  eligibilityLedger: string;
  publicContactPolicy: { minimumCooldownDays: number };
  targets: CalibrationTarget[];
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const manifest = await readJson<Manifest>(path.resolve(root, args.manifest));
  const ledger = await readJson<CalibrationLedger>(path.resolve(root, args.ledger ?? manifest.eligibilityLedger));
  const errors = validateCalibrationLedger(ledger, new Set(manifest.targets.map((target) => target.url)));
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const summary = await readJson<CohortSummaryForLedger>(path.resolve(root, args.summary));
  const updated = recordCalibrationOutcomes({
    ledger,
    minimumCooldownDays: manifest.publicContactPolicy.minimumCooldownDays,
    now: new Date(args.now ?? Date.now()),
    summary,
    targetUrls: new Set(manifest.targets.map((target) => target.url)),
  });

  const outputPath = path.resolve(root, args.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  console.log(`Wrote calibration eligibility ledger candidate with ${Object.keys(updated.entries).length} tracked targets to ${outputPath}`);
}

function parseArgs(argv: string[]) {
  const parsed = {
    ledger: undefined as string | undefined,
    manifest: "docs/certscore-v2/scan-quality-calibration-manifest.json",
    now: undefined as string | undefined,
    out: "artifacts/v2-scan-quality-calibration/scan-quality-calibration-ledger.candidate.json",
    summary: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--ledger") parsed.ledger = value;
    else if (arg === "--manifest") parsed.manifest = value;
    else if (arg === "--now") parsed.now = value;
    else if (arg === "--out") parsed.out = value;
    else if (arg === "--summary") parsed.summary = value;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  if (!parsed.summary) throw new Error("--summary is required");
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

void main();
