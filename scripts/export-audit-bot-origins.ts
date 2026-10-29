/** Explicit bounded read-only origin export; never scans or mutates production. */
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { botOriginSql, botOriginWindowSql, BOT_ORIGIN_VERSION, sha256 } from "./lib/audit-bot-origin";
import { runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff";
export async function exportOrigins(idsFile: string, out: string, start?: string, end?: string) {
  const ids: string[] = JSON.parse(readFileSync(idsFile,"utf8")), sql = start && end ? botOriginWindowSql(start,end) : botOriginSql(ids);
  const text = await runProdDbSqlOneoff({ marker:"MAC_MINI_AUDIT_ORIGINS", readOnly:true, sql });
  const exportedRows = text.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
  if (exportedRows.length>5000) throw Error("Origin export exceeds row bound");
  const rows=exportedRows.filter(row=>ids.includes(row.scanId));
  if (rows.length !== ids.length || new Set(rows.map(row=>row.scanId)).size !== ids.length || rows.some(row=>!ids.includes(row.scanId))) throw Error("Origin export incomplete or duplicate; do not infer missing origins");
  writeFileSync(out, JSON.stringify({ version:BOT_ORIGIN_VERSION, exportedAtUtc:new Date().toISOString(), querySha256:sha256(sql), idsSha256:sha256(JSON.stringify(ids)), readOnly:true, rows },null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({rows:rows.length, macMini:rows.filter(row=>row.isMacMini===true&&!row.isCanary).length, canaries:rows.filter(row=>row.isCanary).length, unknown:rows.filter(row=>row.isMacMini===null).length}));
}
if(process.argv[1]&&pathToFileURL(realpathSync(process.argv[1])).href===import.meta.url) {
  const [ids,out,start,end]=process.argv.slice(2); if(!ids||!out)throw Error("Supply scan-ids.json and a fresh output path");
  exportOrigins(ids,out,start,end).catch(error=>{console.error(String(error).split("\n").slice(-3).join("\n"));process.exitCode=1;});
}
