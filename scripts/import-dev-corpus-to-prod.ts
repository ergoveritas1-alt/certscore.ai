import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { Client } from "pg";

const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:5432/certscore";
const IMPORT_ORG_SLUG = "certscore-corpus-import";
const IMPORT_ORG_NAME = "CertScore Corpus Import";
const IMPORT_BATCH_ID = "corpus-reviewability-2026-05-02";

const DEFAULT_SCAN_IDS = [
  "13f1ba08-9adf-44f8-8656-73f0a29c75d7",
  "de34f407-7f3f-4ea0-b598-c8874f431e63",
  "d056c766-9e25-46aa-8e52-6d67b0f6271f",
  "6346047e-cc39-43b9-bdb8-1d3b2fe98ffd",
  "680e65bd-78eb-466b-a42e-2b484305dd1a",
  "7bc6c27e-7f9e-4cd6-b499-2edbd19cb03f",
  "605224cd-567f-4174-ac13-37b22a7bf9b4",
  "2076680d-30ab-4718-bb2e-4dc12f89d10d",
  "6b5ee097-39da-4721-aff3-1721cdeb789d",
  "d742d133-b95b-4c19-aba2-9588e6375152",
  "c33c4f74-c735-4393-ba32-e6c31956210b",
  "5a5a343d-970a-4c6f-a64b-d5644fd4f8c5",
  "5c5ec5cd-ab15-407b-8d27-70b9a0591c7b",
  "04290b49-b22f-4f83-8ed5-309f592129e4",
  "42a7af11-519e-4f7c-9b09-575e100f77da",
  "2621c6bc-a74c-4f30-8dbe-002f71e47c82",
  "f4e8dc5c-3114-4b0c-875d-2017346aae2e",
  "c690b89a-4bd9-46a2-baf8-c74636aa49ac",
  "ebb3c454-4d03-4725-9846-b25906946b12",
  "7c63640e-3ad1-4bd1-88ac-88853fee7c11",
  "642fd09c-cded-4395-afed-ee4c6a5ec30e",
  "64fd3cd2-27b1-4151-8c25-b74096c7b99d",
  "9d4ebda8-b819-486b-b910-cb32fb2e82c7"
];

const TABLES = [
  "domains",
  "scans",
  "scan_snapshots",
  "policy_enrichment",
  "scan_runtime_artifacts",
  "scan_signals",
  "scan_events",
  "scan_preconsent_violations",
  "scan_tracker_vendors",
  "scan_accessibility_rule_counts",
  "scan_accessibility_rule_examples",
  "scan_pages",
  "scan_document_sources",
  "validation_runs",
  "validation_run_findings"
] as const;

type TableName = (typeof TABLES)[number];
type Row = Record<string, unknown>;
type Payload = {
  exportedAt: string;
  importBatchId: string;
  scanIds: string[];
  rows: Record<TableName, Row[]>;
};

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function pgClient(connectionString: string) {
  return new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: /sslmode=require|amazonaws\.com|rds\.amazonaws\.com/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined
  });
}

function quoteIdent(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function getColumns(client: Client, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function selectRows(client: Client, table: TableName, scanIds: string[], domainIds: string[], policyIds: string[]) {
  if (table === "domains") {
    return (await client.query(`select * from domains where id = any($1::uuid[])`, [domainIds])).rows;
  }
  if (table === "policy_enrichment") {
    if (policyIds.length === 0) return [];
    return (await client.query(`select * from policy_enrichment where id = any($1::uuid[])`, [policyIds])).rows;
  }
  if (table === "scans") {
    return (await client.query(`select * from scans where id = any($1::uuid[])`, [scanIds])).rows;
  }
  if (table === "validation_run_findings") {
    return (
      await client.query(
        `select vrf.*
           from validation_run_findings vrf
           join validation_runs vr on vr.id = vrf.validation_run_id
          where vr.scan_id = any($1::uuid[])`,
        [scanIds]
      )
    ).rows;
  }
  return (await client.query(`select * from ${quoteIdent(table)} where scan_id = any($1::uuid[])`, [scanIds])).rows;
}

async function exportPayload() {
  const outPath = resolve(getArg("--out") ?? "tmp/corpus-import/dev-corpus-payload.json");
  const scanIds = (getArg("--scan-ids")?.split(",").map((id) => id.trim()).filter(Boolean) ?? DEFAULT_SCAN_IDS);
  const client = pgClient(getArg("--local-url") ?? process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_URL);
  await client.connect();

  try {
    const scanResult = await client.query<{ id: string; domain_id: string | null }>(
      `select id, domain_id from scans where id = any($1::uuid[])`,
      [scanIds]
    );
    const foundScanIds = new Set(scanResult.rows.map((row) => row.id));
    const missing = scanIds.filter((id) => !foundScanIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Local DB is missing ${missing.length} scan(s): ${missing.join(", ")}`);
    }

    const domainIds = [...new Set(scanResult.rows.map((row) => row.domain_id).filter((id): id is string => Boolean(id)))];
    const policyResult = await client.query<{ policy_enrichment_id: string | null }>(
      `select distinct policy_enrichment_id from scan_snapshots where scan_id = any($1::uuid[])`,
      [scanIds]
    );
    const policyIds = policyResult.rows
      .map((row) => row.policy_enrichment_id)
      .filter((id): id is string => Boolean(id));

    const rows = Object.fromEntries(TABLES.map((table) => [table, []])) as Record<TableName, Row[]>;
    for (const table of TABLES) {
      rows[table] = await selectRows(client, table, scanIds, domainIds, policyIds);
      console.log(`[export] ${table}: ${rows[table].length}`);
    }

    const payload: Payload = {
      exportedAt: new Date().toISOString(),
      importBatchId: IMPORT_BATCH_ID,
      scanIds,
      rows
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload), "utf8");
    console.log(`[export] wrote ${outPath}`);
  } finally {
    await client.end();
  }
}

function remapRow(table: TableName, row: Row, orgId: string, domainIdMap: Map<string, string>): Row {
  const next = { ...row };
  if ("organization_id" in next) next.organization_id = orgId;
  if (typeof next.domain_id === "string" && domainIdMap.has(next.domain_id)) {
    next.domain_id = domainIdMap.get(next.domain_id) ?? next.domain_id;
  }
  if (table === "domains") {
    next.latest_scan_id = null;
  }
  if (table === "scan_snapshots") {
    next.policy_enrichment_id = null;
  }
  if (table === "scans") {
    next.submitted_by_user_id = null;
    next.scan_config_json = {
      ...((next.scan_config_json as Record<string, unknown> | null) ?? {}),
      corpus_import: {
        import_batch_id: IMPORT_BATCH_ID,
        source_environment: "dev",
        source_scan_id: row.id,
        imported_at: new Date().toISOString()
      }
    };
  }
  if (table === "scan_events") {
    next.metadata_json = {
      ...((next.metadata_json as Record<string, unknown> | null) ?? {}),
      corpus_import: {
        import_batch_id: IMPORT_BATCH_ID,
        source_environment: "dev"
      }
    };
  }
  return next;
}

function getDomainNormalizedKey(row: Row) {
  if (typeof row.normalized_url === "string" && row.normalized_url.trim().length > 0) {
    return row.normalized_url;
  }
  if (typeof row.hostname === "string" && row.hostname.trim().length > 0) {
    return `https://${row.hostname}`;
  }
  return typeof row.id === "string" ? row.id : null;
}

async function buildDomainIdMap(client: Client, domainRows: Row[], orgId: string) {
  const canonicalRows = new Map<string, Row>();
  const domainIdMap = new Map<string, string>();

  for (const row of domainRows) {
    const key = getDomainNormalizedKey(row);
    const sourceId = typeof row.id === "string" ? row.id : null;
    if (!key || !sourceId) {
      continue;
    }
    if (!canonicalRows.has(key)) {
      canonicalRows.set(key, row);
    }
    const canonicalId = canonicalRows.get(key)?.id;
    if (typeof canonicalId === "string") {
      domainIdMap.set(sourceId, canonicalId);
    }
  }

  const normalizedUrls = [...canonicalRows.keys()];
  if (normalizedUrls.length > 0) {
    const existing = await client.query<{ id: string; normalized_url: string }>(
      `select id, normalized_url
         from domains
        where organization_id = $1
          and normalized_url = any($2::text[])`,
      [orgId, normalizedUrls]
    );

    for (const row of existing.rows) {
      canonicalRows.delete(row.normalized_url);
      for (const source of domainRows) {
        const key = getDomainNormalizedKey(source);
        const sourceId = typeof source.id === "string" ? source.id : null;
        if (key === row.normalized_url && sourceId) {
          domainIdMap.set(sourceId, row.id);
        }
      }
    }
  }

  return {
    domainIdMap,
    rowsToInsert: [...canonicalRows.values()]
  };
}

async function insertRows(client: Client, table: TableName, rows: Row[], orgId: string, domainIdMap: Map<string, string>) {
  if (rows.length === 0) return 0;
  const targetColumns = await getColumns(client, table);
  const sourceColumns = Object.keys(rows[0] ?? {});
  const columns = sourceColumns.filter((column) => targetColumns.includes(column));
  if (columns.length === 0) return 0;

  const mappedRows = rows.map((row) => {
    const remapped = remapRow(table, row, orgId, domainIdMap);
    return Object.fromEntries(columns.map((column) => [column, remapped[column] ?? null]));
  });

  const colList = columns.map(quoteIdent).join(", ");
  const updateColumns = columns.filter((column) => column !== "id");
  const conflictClause = columns.includes("id")
    ? updateColumns.length > 0
      ? `on conflict (id) do update set ${updateColumns
          .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
          .join(", ")}`
      : "on conflict (id) do nothing"
    : "on conflict do nothing";
  await client.query(
    `insert into ${quoteIdent(table)} (${colList})
     select ${colList}
       from json_populate_recordset(null::${quoteIdent(table)}, $1::json)
     ${conflictClause}`,
    [JSON.stringify(mappedRows)]
  );
  return mappedRows.length;
}

async function restoreSnapshotPolicyLinks(client: Client, rows: Row[]) {
  const links = rows
    .map((row) => ({
      scan_id: row.scan_id,
      policy_enrichment_id: row.policy_enrichment_id
    }))
    .filter((row) => typeof row.scan_id === "string" && typeof row.policy_enrichment_id === "string");
  if (links.length === 0) return 0;
  await client.query(
    `update scan_snapshots ss
        set policy_enrichment_id = links.policy_enrichment_id::uuid
       from json_to_recordset($1::json) as links(scan_id uuid, policy_enrichment_id uuid)
      where ss.scan_id = links.scan_id`,
    [JSON.stringify(links)]
  );
  return links.length;
}

async function ensureImportOrg(client: Client) {
  const result = await client.query<{ id: string }>(
    `insert into organizations (name, slug, plan, plan_status)
     values ($1, $2, 'team', 'active')
     on conflict (slug) do update set name = excluded.name
     returning id`,
    [IMPORT_ORG_NAME, IMPORT_ORG_SLUG]
  );
  return result.rows[0]?.id;
}

async function importPayload() {
  const inputPath = getArg("--in");
  const payloadUrl = process.env.CORPUS_PAYLOAD_URL;
  const databaseUrl = getArg("--prod-url") ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Set DATABASE_URL or pass --prod-url.");
  if (!inputPath && !payloadUrl) throw new Error("Pass --in or set CORPUS_PAYLOAD_URL.");

  const raw = inputPath
    ? readFileSync(resolve(inputPath), "utf8")
    : await (async () => {
        const response = await fetch(payloadUrl!);
        if (!response.ok) throw new Error(`Failed to fetch payload: ${response.status} ${response.statusText}`);
        return response.text();
      })();
  const payload = JSON.parse(raw) as Payload;
  const client = pgClient(databaseUrl);
  await client.connect();

  try {
    await client.query("begin");
    await client.query("set constraints all deferred");
    const orgId = await ensureImportOrg(client);
    if (!orgId) throw new Error("Failed to create/find import organization.");
    const { domainIdMap, rowsToInsert: domainRowsToInsert } = await buildDomainIdMap(client, payload.rows.domains ?? [], orgId);

    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const rows = table === "domains" ? domainRowsToInsert : payload.rows[table] ?? [];
      counts[table] = await insertRows(client, table, rows, orgId, domainIdMap);
      console.log(`[import] ${table}: ${counts[table]}`);
    }
    const restoredPolicyLinks = await restoreSnapshotPolicyLinks(client, payload.rows.scan_snapshots ?? []);
    console.log(`[import] scan_snapshots.policy_enrichment_id restored: ${restoredPolicyLinks}`);

    for (const scanId of payload.scanIds) {
      await client.query(
        `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
         select s.id,
                s.domain_id,
                s.organization_id,
                'corpus_import.bootstrap',
                'Imported from dev corpus bootstrap for production-resident finding evidence.',
                $2::jsonb
           from scans s
          where s.id = $1
         on conflict do nothing`,
        [
          scanId,
          JSON.stringify({
            import_batch_id: payload.importBatchId,
            source_environment: "dev",
            source_scan_id: scanId,
            exported_at: payload.exportedAt,
            imported_at: new Date().toISOString()
          })
        ]
      );
    }

    await client.query("commit");
    console.log(`[import] complete batch=${payload.importBatchId} scans=${payload.scanIds.length}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyImport() {
  const databaseUrl = getArg("--prod-url") ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Set DATABASE_URL or pass --prod-url.");
  const client = pgClient(databaseUrl);
  await client.connect();
  try {
    const result = await client.query(
      `select
         (select id from organizations where slug = $1) as organization_id,
         (select count(*)::int from scans s join organizations o on o.id = s.organization_id where o.slug = $1) as scans,
         (select count(*)::int from scan_snapshots ss join organizations o on o.id = ss.organization_id where o.slug = $1) as snapshots,
         (select count(*)::int from scan_runtime_artifacts ra join organizations o on o.id = ra.organization_id where o.slug = $1) as runtime_artifacts,
         (select count(*)::int from scan_signals sig join organizations o on o.id = sig.organization_id where o.slug = $1) as signals,
         (select count(*)::int from scan_document_sources ds join scans s on s.id = ds.scan_id join organizations o on o.id = s.organization_id where o.slug = $1) as document_sources,
         (select count(*)::int from scan_events ev join organizations o on o.id = ev.organization_id where o.slug = $1 and ev.event_type = 'corpus_import.bootstrap') as import_events,
         (select count(*)::int from scans s join organizations o on o.id = s.organization_id where o.slug = $1 and s.scan_config_json->'corpus_import'->>'import_batch_id' = $2) as tagged_scans`,
      [IMPORT_ORG_SLUG, IMPORT_BATCH_ID]
    );
    console.log(`[verify] ${JSON.stringify(result.rows[0])}`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (hasFlag("--export")) {
    await exportPayload();
    return;
  }
  if (hasFlag("--import")) {
    await importPayload();
    return;
  }
  if (hasFlag("--verify")) {
    await verifyImport();
    return;
  }
  throw new Error("Pass --export, --import, or --verify.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
