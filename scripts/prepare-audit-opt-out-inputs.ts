import {CHOICE_AUDIT_VERSION} from './lib/audit-progress-choice';
/** Carry verified local control extracts forward and append this run's existing query. */
import {readFileSync,writeFileSync,statSync,realpathSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {OPT_OUT_INPUT_VERSION,type OptOutReceipt} from './lib/audit-progress-opt-out';
import {collectPrivacyFormSelections,privacyFormSelectionMatches,type PrivacyFormInput} from './lib/audit-privacy-form-inputs';
import {privacyFormReceiptFromInventory} from './lib/audit-privacy-form-receipt';
const args=process.argv.slice(2);
const retainedOnly=args[0]==='--retained-only';
const [priorFile,currentFile,out,privacyFormFile]=retainedOnly?[args[1],undefined,args[2],args[3]]:args;
if(!priorFile||!out||(!retainedOnly&&!currentFile))throw Error('Supply prior dashboard, current ID/control export, and fresh output manifest, or --retained-only PRIOR_DASHBOARD OUT');
const read=(file:string,max:number)=>{if(statSync(file).size>max)throw Error('Input exceeds byte bound');return JSON.parse(readFileSync(file,'utf8'));};
const prior=read(priorFile,200_000_000);
const sources:OptOutReceipt[]=[...(prior.optOutExtracts??[])];
let currentStart:string|undefined;
let currentSource:OptOutReceipt|undefined;
const deliveries = new Map<string, NonNullable<ReturnType<typeof privacyFormReceiptFromInventory>>>();
if(currentFile){
 if(statSync(currentFile).size>32_000_000)throw Error('Current control extract exceeds byte bound');
 const bytes=readFileSync(currentFile);
 if(bytes.length>32_000_000)throw Error('Current control extract exceeds byte bound');
 const current=JSON.parse(bytes.toString('utf8'));
 if(current.readOnly!==true||!Array.isArray(current.rows)||!['certscore.audit-opt-out-extract.v1','certscore.mac-mini-direct-id-inventory.v1'].includes(current.version))throw Error('Verified current read-only control extract required');
 if(current.rows.some((r:any)=>['completed','completed_limited'].includes(r.status)&&!Object.hasOwn(r,'control_assessment')))throw Error('Daily query omitted opt-out control extracts');
 if(current.choiceAuditVersion!==CHOICE_AUDIT_VERSION||current.rows.some((r:any)=>['completed','completed_limited'].includes(r.status)&&r.choice_audit?.version!==CHOICE_AUDIT_VERSION))throw Error('Daily query omitted approved v2 GPC/opt-out summaries');
 currentStart=current.start;
 if(!Number.isFinite(Date.parse(currentStart??'')))throw Error('Control extract needs a frozen interval');
 currentSource={file:realpathSync(currentFile),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
 sources.push(currentSource);
}
if(retainedOnly&&!sources.length)throw Error('Retained-only intake requires original control-extract receipts');
const seen=new Set<string>(),retained:OptOutReceipt[]=[];
const monthStart=Date.parse(prior.windows.find((w:any)=>w.runId==='mac-mini-local-archive')?.start??currentStart);
if(!Number.isFinite(monthStart))throw Error('A frozen audit window is required');
const defaultPrivacyFormFile=fileURLToPath(new URL('../artifacts/daily-scan-audit/privacy-form-inputs.json',import.meta.url));
let incoming:unknown;
try{incoming=read(privacyFormFile??defaultPrivacyFormFile,16_000_000);}
catch(error){if(privacyFormFile||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;incoming=[];}
const candidates:PrivacyFormInput[]=[];
const wanted=new Set<string>();
for(const list of [prior.privacyFormReceipts??[],incoming]){
 if(!Array.isArray(list)||list.length>15_000)throw Error('Invalid privacy/form receipt list');
 const ids=new Set<string>();
 for(const ref of list){
  const id=ref?.binding?.scanId,time=Date.parse(ref?.binding?.createdAt);
  if(typeof id!=='string'||ids.has(id)||!Number.isFinite(time))throw Error('Invalid or duplicate privacy/form receipt identity');
  ids.add(id);
  if(time>=monthStart){candidates.push(ref);wanted.add(id);}
 }
}
const selections=new Map<string,{cutoff:number;value:any}>();
let deliverySizeBound = 0;
for(const source of sources){
 const bytes=readFileSync(source.file);if(bytes.length>32_000_000||bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Prior control extract hash/size mismatch');
 const value=JSON.parse(bytes.toString('utf8'));
 if(!Number.isFinite(Date.parse(value.end)))throw Error('Control extract needs a frozen interval');
 // Retain the rolling month, rather than only the current 48-hour query overlap.
 if((!retainedOnly&&Date.parse(value.end)<=monthStart)||seen.has(source.sha256))continue;
 seen.add(source.sha256);retained.push(source);
 if (source.sha256 === currentSource?.sha256 && value.version === 'certscore.mac-mini-direct-id-inventory.v1') {
  for (const row of value.rows) {
   if (row.auditPrivacyForm == null || row.isCanary !== false || row.isMacMini !== true ||
       !['completed','completed_limited'].includes(row.status) || row.projection_status !== 'ready' ||
       row.publicationRequestStatus === 'terminal_failure' || Date.parse(row.created_at) < monthStart) continue;
   const receipt = privacyFormReceiptFromInventory(row);
   if (!receipt) { deliverySizeBound++; continue; }
   deliveries.set(row.scanId, receipt);
   wanted.add(row.scanId);
  }
 }
 if(wanted.size)collectPrivacyFormSelections(value,wanted,selections);
}
if(retained.length>64)throw Error('Control history exceeds 64 source receipts');
const privacyFormReceipts=new Map<string,PrivacyFormInput>();
for(const ref of candidates){
 const id=ref.binding.scanId;
 // A receipt may arrive before the scan selection, or after its generation was replaced.
 if(!privacyFormSelectionMatches(ref,selections.get(id)?.value))continue;
 const previous=privacyFormReceipts.get(id);
 if(previous&&previous.sha256!==ref.sha256)throw Error('Conflicting privacy/form receipts for the same persisted projection');
 privacyFormReceipts.set(id,ref);
}
const receiptDirectory = path.resolve(path.dirname(out), 'privacy-form-receipts');
for (const [scanId, { bytes, reference }] of deliveries) {
 if (!privacyFormSelectionMatches(reference, selections.get(scanId)?.value)) continue;
 const previous = privacyFormReceipts.get(scanId);
 if (previous && previous.sha256 !== reference.sha256) throw Error('Conflicting inventory and local privacy/form receipts');
 if (previous?.delivery === 'delta_inventory') continue;
 const file = path.join(receiptDirectory, `${scanId}-${reference.sha256}.json`);
 mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
 try {
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
 } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || statSync(file).size !== bytes.length ||
      !readFileSync(file).equals(bytes)) throw error;
 }
 privacyFormReceipts.set(scanId, { file, ...reference, delivery: 'delta_inventory' });
}
if(privacyFormReceipts.size>15_000)throw Error('Too many rolling privacy/form receipts');
writeFileSync(out,JSON.stringify({version:OPT_OUT_INPUT_VERSION,sources:retained,reportProjections:prior.retainedReports??[],...(retainedOnly?{retainedOnly:true}:{}),...(privacyFormReceipts.size?{privacyFormReceipts:[...privacyFormReceipts.values()]}:{})},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sources:retained.length,privacyFormReceipts:privacyFormReceipts.size,unmatchedPrivacyFormIds:wanted.size-privacyFormReceipts.size,retainedOnly,newQueries:0,
 ...(currentFile?{inventoryPrivacyFormReceipts:deliveries.size,inventoryPrivacyFormSizeBound:deliverySizeBound}:{})}));
