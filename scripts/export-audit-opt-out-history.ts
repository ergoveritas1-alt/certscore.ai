/** Owner-authorized one-time read of retained control projections; never visits sites. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {historicalOptOutSql,OPT_OUT_EXTRACT_VERSION} from './lib/audit-progress-opt-out';
import {runProdDbSqlOneoff} from './lib/audit-prod-db-bounded';
const root=process.argv[2];if(!root)throw Error('Supply fresh historical run directory');
async function main(){
 const b=JSON.parse(readFileSync(root+'/begin.json','utf8'));
 if(existsSync(root+'/started-OPT_OUT_HISTORY.json'))throw Error('Historical task already started; recover retained logs instead of querying again');
 const sql=historicalOptOutSql(b.windowStartUtc,b.windowEndUtc);writeFileSync(root+'/opt-out-history.sql',sql,{flag:'wx'});
 const output=await runProdDbSqlOneoff({marker:'OPT_OUT_HISTORY',readOnly:true,sql,receiptDir:root});
 writeFileSync(root+'/opt-out-history-output.txt',output,{flag:'wx'});
 const rows=output.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
 if(rows.length>5000||new Set(rows.map(r=>r.scanId)).size!==rows.length||rows.some(r=>r.cohort_total!==rows.length))throw Error('Historical extract incomplete or duplicated');
 const payload={version:OPT_OUT_EXTRACT_VERSION,readOnly:true,start:b.windowStartUtc,end:b.windowEndUtc,querySha256:createHash('sha256').update(sql).digest('hex'),rows};
 writeFileSync(root+'/opt-out-history.json',JSON.stringify(payload)+'\n',{flag:'wx'});
 console.log(JSON.stringify({rows:rows.length,querySha256:payload.querySha256,newScans:0,productionWrites:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
