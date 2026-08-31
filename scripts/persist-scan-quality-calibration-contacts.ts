import { closePools, query } from "../packages/db/src/postgres.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CalibrationTarget, CohortSummaryForLedger } from "./lib/scan-quality-calibration-ledger.js";
import { runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff.js";

type Manifest = { targets: CalibrationTarget[] };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const manifest = await readJson<Manifest>(path.resolve(root, args.manifest));
  const summary = await readJson<CohortSummaryForLedger>(path.resolve(root, args.summary));
  const targetUrls = new Set(manifest.targets.map((target) => target.url));
  const contacts = (summary.results ?? [])
    .filter((result) => result.url && result.status !== "skipped" && result.scannerRuntimeStarted === true)
    .map((result) => {
      if (!result.url || !targetUrls.has(result.url)) {
        throw new Error(`Cohort summary contains a URL outside the calibration inventory: ${result.url ?? "missing"}`);
      }
      const noGo = result.runtime?.noGoCandidate === true;
      return {
        contactAt: validTimestamp(result.startedAt, result.completedAt, summary.generatedAt) ?? new Date().toISOString(),
        noGo,
        noGoReasonCodes: noGo ? result.runtime?.noGoReasons ?? ["summary_no_go_candidate"] : [],
        normalizedDomain: normalizedDomain(result.url),
        scanStatus: result.status ?? "failed",
      };
    });

  if (contacts.length === 0) throw new Error("Cohort summary contains no attempted calibration contacts");

  const occurrencesByDomain = new Map<string, number>();
  const contactJson = JSON.stringify(contacts.map((contact) => {
    const occurrence = (occurrencesByDomain.get(contact.normalizedDomain) ?? 0) + 1;
    occurrencesByDomain.set(contact.normalizedDomain, occurrence);
    return {
      calibration_run_key: occurrence === 1
        ? args.runKey
        : `${args.runKey}.${occurrence}`,
      contact_at: contact.contactAt,
      no_go: contact.noGo,
      no_go_reason_codes: contact.noGoReasonCodes,
      normalized_domain: contact.normalizedDomain,
      scan_status: contact.scanStatus,
    };
  }));
  const persistSql = `with input as (
       select *
       from jsonb_to_recordset(${args.ecsOneoff ? `${sqlLiteral(contactJson)}::jsonb` : "$2::jsonb"}) as row(
         normalized_domain text,
         calibration_run_key text,
         contact_at timestamptz,
         scan_status text,
         no_go boolean,
         no_go_reason_codes text[]
       )
     ), upserted as (
       insert into public.scan_domain_contacts (
         calibration_run_key,
         normalized_domain,
         contact_at,
         source,
         scan_status,
         no_go,
         no_go_reason_codes
       )
       select calibration_run_key, normalized_domain, contact_at, 'scan_quality_calibration', scan_status, no_go, no_go_reason_codes
       from input
       on conflict (calibration_run_key, normalized_domain) where calibration_run_key is not null
       do update set
         contact_at = excluded.contact_at,
         scan_status = excluded.scan_status,
         no_go = excluded.no_go,
         no_go_reason_codes = excluded.no_go_reason_codes,
         updated_at = timezone('utc', now())
       returning normalized_domain
     )
     select public.refresh_scan_domain_contact_ledger(normalized_domain)
     from (select distinct normalized_domain from upserted) refreshed`;
  if (args.ecsOneoff) {
    await runProdDbSqlOneoff({ marker: "CALIBRATION_CONTACT_PERSIST", sql: persistSql });
  } else {
    await query(persistSql, [args.runKey, contactJson]);
  }
  console.log(`Persisted ${contacts.length} calibration contacts for run ${args.runKey}`);
}

function parseArgs(argv: string[]) {
  const parsed = {
    ecsOneoff: false,
    manifest: "docs/certscore-v2/scan-quality-calibration-manifest.json",
    runKey: "",
    summary: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ecs-oneoff") {
      parsed.ecsOneoff = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--manifest") parsed.manifest = value;
    else if (arg === "--run-key") parsed.runKey = value;
    else if (arg === "--summary") parsed.summary = value;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  if (!parsed.runKey) throw new Error("--run-key is required");
  if (!/^[A-Za-z0-9._-]+$/.test(parsed.runKey)) throw new Error("--run-key contains unsupported characters");
  if (!parsed.summary) throw new Error("--summary is required");
  return parsed;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizedDomain(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function validTimestamp(...values: Array<string | undefined>) {
  return values.find((value) => value && Number.isFinite(Date.parse(value)));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

void main().finally(() => closePools());
