import { readFileSync, writeFileSync } from "node:fs";
import { internalScanProvenanceSql } from "./lib/internal-scan-provenance";
import { runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff";

async function main() {
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes("--manifest")) throw new Error("A trusted --manifest is required");
  const runs = process.argv.flatMap((value, index) => {
    if (value !== "--manifest") return [];
    const manifest = JSON.parse(readFileSync(process.argv[index + 1], "utf8"));
    return [{
      runKey: manifest.runKey,
      source: "operator-post-reject-proof-verification",
      rows: manifest.rows.map((r: {scanId: string; sourceScanId: string}) => ({scanId: r.scanId, sourceScanId: r.sourceScanId})),
    }];
  });
  const corrections = runs.map(internalScanProvenanceSql).join("\n");
  const ids = runs.flatMap(run => run.rows.map((row: {scanId: string}) => `'${row.scanId}'::uuid`)).join(",");
  const sql = `begin; set local statement_timeout='30s';
    create temporary table internal_provenance_before as
      select s.id,s.scan_config_json,s.activity_traffic,
        (select md5(to_jsonb(ss)::text) from public.scan_snapshots ss where ss.scan_id=s.id) as snapshot_hash
      from public.scans s where s.id in (${ids});
    ${corrections}
    select jsonb_build_object('scans',count(*),
      'corrected',count(*) filter(where b.activity_traffic->>'class'='unknown' and s.activity_traffic->>'class'='internal'),
      'unknownRemaining',count(*) filter(where s.activity_traffic->>'class'='unknown'),
      'configsUnchanged',bool_and(b.scan_config_json is not distinct from s.scan_config_json),
      'snapshotsUnchanged',bool_and(b.snapshot_hash is not distinct from
        (select md5(to_jsonb(ss)::text) from public.scan_snapshots ss where ss.scan_id=s.id)))::text
      from internal_provenance_before b join public.scans s on s.id=b.id;
    commit;`;
  if (process.argv.includes("--sql")) writeFileSync(arg("--sql"), sql);
  console.log(JSON.stringify({runs: runs.map(run => ({runKey: run.runKey, scans: run.rows.length})), apply: process.argv.includes("--apply"), noScanDispatch: true}));
  if (!process.argv.includes("--apply")) return;
  const result = await runProdDbSqlOneoff({marker: "INTERNAL_VERIFICATION_PROVENANCE", sql});
  if (process.argv.includes("--summary")) writeFileSync(arg("--summary"), result + "\n");
  console.log(result);
}

main().catch(error => {console.error(error); process.exitCode = 1;});
