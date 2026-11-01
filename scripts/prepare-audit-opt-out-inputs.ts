/** Carry verified local control extracts forward and append this run's existing query. */
import {readFileSync,writeFileSync,statSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OPT_OUT_INPUT_VERSION,type OptOutReceipt} from './lib/audit-progress-opt-out';
const [priorFile,currentFile,out]=process.argv.slice(2);
if(!priorFile||!currentFile||!out)throw Error('Supply prior dashboard, current ID/control export, and fresh output manifest');
const read=(file:string,max:number)=>{if(statSync(file).size>max)throw Error('Input exceeds byte bound');return JSON.parse(readFileSync(file,'utf8'));};
const prior=read(priorFile,160_000_000),current=read(currentFile,32_000_000);
if(current.readOnly!==true||!Array.isArray(current.rows)||!['certscore.audit-opt-out-extract.v1','certscore.mac-mini-direct-id-inventory.v1'].includes(current.version))throw Error('Verified current read-only control extract required');
if(current.rows.some((r:any)=>['completed','completed_limited'].includes(r.status)&&!Object.hasOwn(r,'control_assessment')))throw Error('Daily query omitted opt-out control extracts');
const bytes=readFileSync(currentFile),receipt={file:realpathSync(currentFile),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
const sources:OptOutReceipt[]=[...(prior.optOutExtracts??[]),receipt];
const seen=new Set<string>(),retained:OptOutReceipt[]=[];
const start=Date.parse(current.start);
for(const source of sources){
 const bytes=readFileSync(source.file);if(bytes.length>32_000_000||bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Prior control extract hash/size mismatch');
 const value=JSON.parse(bytes.toString('utf8'));
 if(!Number.isFinite(Date.parse(value.end))||!Number.isFinite(start))throw Error('Control extract needs a frozen interval');
 // Retain the rolling month, rather than only the current 48-hour query overlap.
 const monthStart=Date.parse(prior.windows.find((w:any)=>w.runId==='mac-mini-local-archive')?.start??current.start);
 if(Date.parse(value.end)<=monthStart||seen.has(source.sha256))continue;
 seen.add(source.sha256);retained.push(source);
}
if(retained.length>64)throw Error('Control history exceeds 64 source receipts');
writeFileSync(out,JSON.stringify({version:OPT_OUT_INPUT_VERSION,sources:retained,reportProjections:prior.retainedReports??[]},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sources:retained.length,newQueries:0}));
