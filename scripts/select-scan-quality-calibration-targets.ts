import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  selectCalibrationTargets,
  validateCalibrationLedger,
  type CalibrationLedger,
  type CalibrationTarget,
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
  const ledgerPath = path.resolve(root, args.ledger ?? manifest.eligibilityLedger);
  const ledger = await readJson<CalibrationLedger>(ledgerPath);
  const errors = validateCalibrationLedger(ledger, new Set(manifest.targets.map((target) => target.url)));
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const selection = selectCalibrationTargets({
    ledger,
    limit: args.limit,
    minimumCooldownDays: manifest.publicContactPolicy.minimumCooldownDays,
    now: new Date(args.now ?? Date.now()),
    rotationKey: args.rotationKey,
    targets: manifest.targets,
  });

  await mkdir(path.dirname(path.resolve(root, args.outUrls)), { recursive: true });
  await mkdir(path.dirname(path.resolve(root, args.outSelection)), { recursive: true });
  await writeFile(path.resolve(root, args.outUrls), `${selection.selected.map((target) => target.url).join("\n")}\n`, "utf8");
  await writeFile(path.resolve(root, args.outSelection), `${JSON.stringify(selection, null, 2)}\n`, "utf8");

  console.log(`Selected ${selection.selected.length} eligible calibration targets:`);
  for (const target of selection.selected) console.log(`- ${target.url} (${target.role})`);
  console.log(`Excluded ${selection.excluded.length} targets from the current rotation.`);
}

function parseArgs(argv: string[]) {
  const parsed = {
    ledger: undefined as string | undefined,
    limit: 10,
    manifest: "docs/certscore-v2/scan-quality-calibration-manifest.json",
    now: undefined as string | undefined,
    outSelection: "artifacts/v2-scan-quality-calibration/CalibrationTargetSelection.json",
    outUrls: "artifacts/v2-scan-quality-calibration/selected-targets.txt",
    rotationKey: new Date().toISOString().slice(0, 10),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--ledger") parsed.ledger = value;
    else if (arg === "--limit") parsed.limit = positiveInteger(value, arg);
    else if (arg === "--manifest") parsed.manifest = value;
    else if (arg === "--now") parsed.now = value;
    else if (arg === "--out-selection") parsed.outSelection = value;
    else if (arg === "--out-urls") parsed.outUrls = value;
    else if (arg === "--rotation-key") parsed.rotationKey = value;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  return parsed;
}

function positiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

void main();
