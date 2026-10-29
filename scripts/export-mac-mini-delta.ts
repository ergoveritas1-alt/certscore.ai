import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {botOriginWindowSql,botOriginSql} from './lib/audit-bot-origin';
import {runProdDbSqlOneoff} from './lib/audit-prod-db-bounded';
const root:string=process.argv[2]??"";
if(!root)throw Error('Supply a fresh audit run containing begin.json');
const b=JSON.parse(readFileSync(root+'/begin.json','utf8'));
const origin=botOriginWindowSql(b.overlapStartUtc,b.windowEndUtc);
const pending:string[]=b.pendingRefreshIds??[];
if(!Array.isArray(pending)||pending.length>100||new Set(pending).size!==pending.length||pending.some(id=>!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))throw Error('At most 100 distinct pending scan UUIDs required');
function innerSql(value:string){
 const marker='select row_to_json(result) from (';
 if(!value.includes(marker)||!value.includes(') result;'))throw Error('Unsupported canonical origin SQL');
 return value.slice(value.indexOf(marker)+marker.length,value.lastIndexOf(') result;')).replace(/order by s.id(?: limit 5001)?\s*$/,'');
}
const inner=[innerSql(origin),...(pending.length?[innerSql(botOriginSql(pending))]:[])].join('\nunion\n');
const sql=`set statement_timeout='45s';
with origins as materialized (${inner})
select row_to_json(r) from (
 select o.*,s.created_at,s.updated_at,s.status,d.hostname,
 s.scan_config_json->>'scanFrom' as scan_from,
 p.report_projection_source_hash as projection_source_hash,
 p.report_projection_payload_sha256 as projection_payload_sha256,
 count(*) over() as cohort_total
 from origins o join public.scans s on s.id=o."scanId"
 left join public.domains d on d.id=s.domain_id
 left join public.scan_snapshots p on p.scan_id=s.id
 where o."isMacMini" is true
 order by s.created_at,s.id limit 5001
) r;`;
async function main(){
 writeFileSync(root+'/delta-inventory.sql',sql,{flag:'wx'});
 const output=await runProdDbSqlOneoff({marker:'MACMINI_DELTA_IDS',readOnly:true,sql,receiptDir:root});
 writeFileSync(root+'/delta-inventory-output.txt',output,{flag:'wx'});
 const rows=output.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
 if(rows.length>5000||new Set(rows.map(r=>r.scanId)).size!==rows.length||rows.some(r=>r.cohort_total!==rows.length||r.isMacMini!==true||(!pending.includes(r.scanId)&&Date.parse(r.created_at)<Date.parse(b.overlapStartUtc))||Date.parse(r.created_at)>=Date.parse(b.windowEndUtc)))throw Error('Incomplete, duplicate or out-of-scope ID inventory');
 const payload={version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,scope:'Original-creator-verified Mac mini scan IDs in bounded recent window; not full production inventory',start:b.overlapStartUtc,end:b.windowEndUtc,querySha256:createHash('sha256').update(sql).digest('hex'),rows};
 writeFileSync(root+'/delta-inventory.json',JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({rows:rows.length,newSincePriorCutoff:rows.filter(r=>Date.parse(r.created_at)>=Date.parse(b.newScanStartUtc)).length,canaries:rows.filter(r=>r.isCanary).length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
