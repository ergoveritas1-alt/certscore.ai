import { query } from "../packages/db/src/postgres.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mergeCentralContactLedger,
  validateCalibrationLedger,
  type CalibrationEligibilityState,
  type CalibrationLedger,
  type CalibrationTarget,
} from "./lib/scan-quality-calibration-ledger.js";
import { parseSingleJsonOutput, runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff.js";

type Manifest = {
  eligibilityLedger: string;
  targets: CalibrationTarget[];
};

type CentralLedgerRow = {
  consecutive_no_go_count: number;
  cooldown_until: string;
  effective_state: CalibrationEligibilityState;
  last_contact_at: string;
  last_no_go_reason_codes: string[] | null;
  last_outcome: string;
  last_source: string;
  manual_note: string | null;
  normalized_domain: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const manifest = await readJson<Manifest>(path.resolve(root, args.manifest));
  const canonicalLedger = await readJson<CalibrationLedger>(
    path.resolve(root, args.ledger ?? manifest.eligibilityLedger),
  );
  const targetUrls = new Set(manifest.targets.map((target) => target.url));
  const validationErrors = validateCalibrationLedger(canonicalLedger, targetUrls);
  if (validationErrors.length > 0) throw new Error(validationErrors.join("\n"));

  const domains = manifest.targets.map((target) => normalizedDomain(target.url));
  const selectSql = `select
       normalized_domain,
       last_contact_at,
       last_source,
       last_outcome,
       last_no_go_reason_codes,
       consecutive_no_go_count,
       cooldown_until,
       coalesce(manual_state, automatic_state) as effective_state,
       manual_note
     from public.scan_domain_contact_ledger
     where normalized_domain = any($1::text[])`;
  const centralRows = args.ecsOneoff
    ? await loadCentralRowsViaEcs(domains)
    : (await query<CentralLedgerRow>(selectSql, [domains], { readOnly: true })).rows;
  const effectiveLedger = mergeCentralContactLedger({
    centralRecords: centralRows.map((row) => ({
      consecutiveNoGoCount: row.consecutive_no_go_count,
      cooldownUntil: row.cooldown_until,
      effectiveState: row.effective_state,
      lastContactAt: row.last_contact_at,
      lastNoGoReasons: row.last_no_go_reason_codes ?? [],
      lastOutcome: row.last_outcome,
      lastSource: row.last_source,
      manualNote: row.manual_note ?? undefined,
      normalizedDomain: row.normalized_domain,
    })),
    ledger: canonicalLedger,
    now: new Date(),
    targets: manifest.targets,
  });
  const effectiveErrors = validateCalibrationLedger(effectiveLedger, targetUrls);
  if (effectiveErrors.length > 0) throw new Error(effectiveErrors.join("\n"));

  const outputPath = path.resolve(root, args.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(effectiveLedger, null, 2)}\n`, "utf8");
  console.log(`Exported ${centralRows.length} central contact records into ${outputPath}`);
}

async function loadCentralRowsViaEcs(domains: string[]) {
  const domainList = domains.map(sqlLiteral).join(", ");
  const output = await runProdDbSqlOneoff({
    marker: "CALIBRATION_LEDGER_EXPORT",
    readOnly: true,
    sql: `select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)::text
          from (
            select normalized_domain, last_contact_at, last_source, last_outcome,
                   last_no_go_reason_codes, consecutive_no_go_count, cooldown_until,
                   coalesce(manual_state, automatic_state) as effective_state, manual_note
            from public.scan_domain_contact_ledger
            where normalized_domain in (${domainList})
          ) rows`,
  });
  return parseSingleJsonOutput<CentralLedgerRow[]>(output);
}

function parseArgs(argv: string[]) {
  const parsed = {
    ecsOneoff: false,
    ledger: undefined as string | undefined,
    manifest: "docs/certscore-v2/scan-quality-calibration-manifest.json",
    out: "artifacts/v2-scan-quality-calibration/effective-eligibility-ledger.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ecs-oneoff") {
      parsed.ecsOneoff = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--ledger") parsed.ledger = value;
    else if (arg === "--manifest") parsed.manifest = value;
    else if (arg === "--out") parsed.out = value;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  return parsed;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizedDomain(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

void main();
