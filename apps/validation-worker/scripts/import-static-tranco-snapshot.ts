import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";

const STATIC_TRANCO_LIST_ID = "N29KW";
const STATIC_TRANCO_SNAPSHOT_DATE = "2026-07-21";
const STATIC_TRANCO_SOURCE_URL = `https://tranco-list.eu/download/${STATIC_TRANCO_LIST_ID}/1000000`;
const EXPECTED_ROW_COUNT = 1_000_000;
const BATCH_SIZE = 2_000;

type RankingRow = {
  hostname: string;
  tranco_rank: number;
};

export function parseTrancoCsvLine(line: string): RankingRow | null {
  const separator = line.indexOf(",");
  if (separator <= 0) return null;
  const trancoRank = Number.parseInt(line.slice(0, separator), 10);
  const hostname = line.slice(separator + 1).trim().toLowerCase().replace(/\.$/, "");
  if (!Number.isInteger(trancoRank) || trancoRank < 1 || trancoRank > EXPECTED_ROW_COUNT || !hostname) {
    return null;
  }
  return { hostname, tranco_rank: trancoRank };
}

async function insertBatch(rows: RankingRow[]) {
  await query(
    `insert into public.tranco_rankings (list_id, hostname, tranco_rank)
     select $1, value->>'hostname', (value->>'tranco_rank')::integer
       from jsonb_array_elements($2::jsonb) value
     on conflict (list_id, hostname) do update
       set tranco_rank = excluded.tranco_rank`,
    [STATIC_TRANCO_LIST_ID, JSON.stringify(rows)]
  );
}

async function backfillScanRanks() {
  const snapshotResult = await query(
    `update public.scan_snapshots snapshot
        set tranco_rank = ranking.tranco_rank
       from public.scans scan
       join public.domains domain on domain.id = scan.domain_id
       join public.tranco_rank_settings settings on settings.singleton = true
       join public.tranco_rankings ranking
         on ranking.list_id = settings.active_list_id
        and ranking.hostname = lower(regexp_replace(domain.hostname, '^www\\.', ''))
      where snapshot.scan_id = scan.id
        and snapshot.tranco_rank is distinct from ranking.tranco_rank`
  );

  const configResult = await query(
    `update public.scans scan
        set scan_config_json = jsonb_set(
          jsonb_set(
            coalesce(scan.scan_config_json, '{}'::jsonb),
            '{siteMetadata}',
            case
              when jsonb_typeof(scan.scan_config_json -> 'siteMetadata') = 'object'
                then scan.scan_config_json -> 'siteMetadata'
              else '{}'::jsonb
            end,
            true
          ),
          '{siteMetadata,tranco}',
          jsonb_build_object(
            'lookupHostname', lower(domain.hostname),
            'lookupRegistrableDomain', ranking.hostname,
            'matchType', case
              when lower(domain.hostname) = ranking.hostname then 'exact_hostname'
              else 'hostname_without_www'
            end,
            'matchedHostname', ranking.hostname,
            'rank', ranking.tranco_rank,
            'rankBand', null,
            'source', 'static_snapshot',
            'sourceListId', ranking.list_id,
            'sourceUpdatedAt', snapshot.imported_at
          ),
          true
        )
       from public.domains domain
       join public.tranco_rank_settings settings on settings.singleton = true
       join public.tranco_rank_snapshots snapshot on snapshot.list_id = settings.active_list_id
       join public.tranco_rankings ranking
         on ranking.list_id = settings.active_list_id
        and ranking.hostname = lower(regexp_replace(domain.hostname, '^www\\.', ''))
      where scan.domain_id = domain.id
        and (scan.scan_config_json #>> '{siteMetadata,tranco,rank}')::integer is distinct from ranking.tranco_rank`
  );

  return {
    scanConfigsBackfilled: configResult.rowCount ?? 0,
    snapshotsBackfilled: snapshotResult.rowCount ?? 0
  };
}

async function main() {
  const current = await queryOne<{ active_list_id: string | null; row_count: number | null }>(
    `select settings.active_list_id, snapshot.row_count
       from public.tranco_rank_settings settings
       left join public.tranco_rank_snapshots snapshot on snapshot.list_id = settings.active_list_id
      where settings.singleton = true`,
    [],
    { readOnly: true }
  );

  let imported = false;
  if (current?.active_list_id !== STATIC_TRANCO_LIST_ID || current.row_count !== EXPECTED_ROW_COUNT) {
    await query(
      `insert into public.tranco_rank_snapshots (list_id, source_url, snapshot_date, row_count)
       values ($1, $2, $3::date, 0)
       on conflict (list_id) do update
         set source_url = excluded.source_url,
             snapshot_date = excluded.snapshot_date,
             row_count = 0,
             imported_at = timezone('utc', now())`,
      [STATIC_TRANCO_LIST_ID, STATIC_TRANCO_SOURCE_URL, STATIC_TRANCO_SNAPSHOT_DATE]
    );
    await query(`delete from public.tranco_rankings where list_id = $1`, [STATIC_TRANCO_LIST_ID]);

    const response = await fetch(STATIC_TRANCO_SOURCE_URL, { headers: { "User-Agent": "CertScoreStaticTrancoImporter/1.0" } });
    if (!response.ok || !response.body) {
      throw new Error(`Static Tranco snapshot download failed: ${response.status}`);
    }

    const lines = createInterface({ input: Readable.fromWeb(response.body as never), crlfDelay: Infinity });
    let batch: RankingRow[] = [];
    let parsedCount = 0;
    let expectedRank = 1;
    for await (const line of lines) {
      const row = parseTrancoCsvLine(line);
      if (!row) continue;
      if (row.tranco_rank !== expectedRank) {
        throw new Error(`Static Tranco snapshot is not contiguous at rank ${expectedRank}.`);
      }
      expectedRank += 1;
      parsedCount += 1;
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await insertBatch(batch);
        batch = [];
      }
    }
    if (batch.length) await insertBatch(batch);
    if (parsedCount !== EXPECTED_ROW_COUNT) {
      throw new Error(`Static Tranco snapshot contained ${parsedCount} rows; expected ${EXPECTED_ROW_COUNT}.`);
    }

    await query(
      `with activated_snapshot as (
         update public.tranco_rank_snapshots
            set row_count = $2,
                imported_at = timezone('utc', now())
          where list_id = $1
          returning list_id
       )
       update public.tranco_rank_settings settings
          set active_list_id = activated_snapshot.list_id,
              updated_at = timezone('utc', now())
         from activated_snapshot
        where settings.singleton = true`,
      [STATIC_TRANCO_LIST_ID, EXPECTED_ROW_COUNT]
    );
    imported = true;
  }

  const backfill = await backfillScanRanks();
  console.log(JSON.stringify({
    ...backfill,
    imported,
    listId: STATIC_TRANCO_LIST_ID,
    rowCount: EXPECTED_ROW_COUNT,
    snapshotDate: STATIC_TRANCO_SNAPSHOT_DATE,
    status: "ok"
  }));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePools();
    });
}
