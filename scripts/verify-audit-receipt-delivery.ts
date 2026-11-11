import assert from 'node:assert/strict';
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {readAuditComparisonDelivery} from '../packages/certscore-contracts/src/audit-comparison';
import {auditPolicyProvenanceSchema} from '../packages/certscore-contracts/src/audit-policy-provenance';
import {retainedGenerationMatches} from './lib/audit-progress-opt-out';
/** Consume the existing sealed refresh only. Never fetch or query evidence. */
export function verifyPolicyReceiptDelivery(release:any,rows:any[],extracts:any[]){
 assert.equal(release.version,'certscore.audit-receipt-release.v1');
 assert.equal(release.status,'passed');assert.equal(release.configurationVerified,true);
 assert.ok(Number.isFinite(Date.parse(release.verifiedAtUtc)));
 const expected=release.configuration?.CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED==='1';
 const eligible=rows.filter(r=>r.reportable&&Date.parse(r.createdAt)>=Date.parse(release.verifiedAtUtc));
 const missing:string[]=[];
 for(const row of eligible){
  const receipts=extracts.filter(e=>retainedGenerationMatches(e,row)&&
   (row.originProof!=='original_credential_verified'||row.originRequestId===e.originalRequestId));
  const bound=receipts.some(e=>{
   const p=auditPolicyProvenanceSchema.safeParse(e.policyReceipt);
   return p.success&&p.data.binding.scanId===row.scanId&&p.data.binding.generation===row.projectionVersion&&
    p.data.binding.sourceHash===row.publicProjectionSourceHash&&Date.parse(p.data.binding.createdAt)===Date.parse(row.createdAt);
  });
  if(!bound)missing.push(row.scanId);
 }
 return {version:'certscore.audit-receipt-delivery.v1',status:!expected?'not_expected':!eligible.length?'pending':missing.length?'failed':'passed',
  reason:!expected?'policy_receipts_not_enabled':!eligible.length?'no_post_release_reportable_scans':missing.length?'missing_generation_bound_policy_receipts':'bound_receipts_delivered',
  eligible:eligible.length,available:eligible.length-missing.length,missingIds:missing,
  scope:'Receipt delivery only; no inference of completed policy checks or effectiveness.'};
}

/** Independent delivery/availability counts. A reason receipt never becomes a
 * measured profile, and an absent historical receipt never gains a reason. */
export function verifyAuditReceiptDelivery(release:any,rows:any[],extracts:any[]){
 const policy=verifyPolicyReceiptDelivery(release,rows,extracts);
 const eligible=rows.filter(r=>r.reportable&&Date.parse(r.createdAt)>=Date.parse(release.verifiedAtUtc));
 const byScan=new Map<string,any[]>();
 for(const extract of extracts){const list=byScan.get(extract.scanId)??[];list.push(extract);byScan.set(extract.scanId,list);}
 const details=eligible.map(row=>{
  const matched=(byScan.get(row.scanId)??[]).filter(e=>retainedGenerationMatches(e,row)&&
   (row.originProof!=='original_credential_verified'||row.originRequestId===e.originalRequestId));
  const arrivals=matched.filter(e=>e.auditComparison!=null).map(e=>e.auditComparison);
  const parsed=arrivals.map(readAuditComparisonDelivery);
  let state:'available'|'unavailable'|'missing'|'invalid'|'conflicting'='available';
  if(!arrivals.length)state='missing';
  else if(arrivals.length!==matched.length)state='conflicting';
  else if(parsed.some(p=>!p||p.scanId!==row.scanId||Date.parse(p.createdAt)!==Date.parse(row.createdAt)))state='invalid';
  else if(parsed.some(p=>!isDeepStrictEqual(p,parsed[0])))state='conflicting';
  else if('reason' in parsed[0]!)state='unavailable';
  const receipt=parsed[0];
  return {scanId:row.scanId,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date(row.createdAt)),
   generation:row.projectionVersion,state,receiptVersion:state==='conflicting'?'conflicting':receipt?.version??'not_exported',
   receiptVersions:[...new Set(parsed.map(p=>p?.version??'unrecognized'))].sort(),
   reason:state==='unavailable'&&receipt&&'reason' in receipt?receipt.reason:null};
 });
 const count=(state:string)=>details.filter(d=>d.state===state).length;
 const comparisonStatus=!eligible.length?'pending':details.some(d=>['missing','invalid','conflicting'].includes(d.state))?'failed':count('unavailable')?'degraded':'passed';
 const groups=new Map<string,any>();
 for(const d of details){
  const key=JSON.stringify([d.date,d.generation,d.receiptVersion]);
  const group=groups.get(key)??{date:d.date,generation:d.generation,receiptVersion:d.receiptVersion,available:0,unavailable:0,missing:0,invalid:0,conflicting:0,reasons:{}};
  group[d.state]++;if(d.reason)group.reasons[d.reason]=(group.reasons[d.reason]??0)+1;groups.set(key,group);
 }
 const comparison={status:comparisonStatus,eligible:eligible.length,available:count('available'),unavailable:count('unavailable'),
  missing:count('missing'),invalid:count('invalid'),conflicting:count('conflicting'),byDateAndVersion:[...groups.values()],details};
 const status=policy.status==='failed'||comparisonStatus==='failed'?'failed':comparisonStatus==='pending'?'pending':comparisonStatus==='degraded'?'degraded':'passed';
 return {version:'certscore.audit-receipt-delivery.v2',status,policy,comparison,
  scope:'Post-release receipt delivery and comparison availability only; no policy effectiveness, production completeness or causal improvement claim.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [releaseFile,directory,out]=process.argv.slice(2);assert.ok(releaseFile&&directory&&out);
 const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 const read=(file:string,limit:number)=>{assert.ok(statSync(file).size<=limit);return readFileSync(file);};
 const releaseBytes=read(releaseFile,1_000_000),bytes=read(directory+'/dashboard.json',320_000_000);
 const seal=JSON.parse(read(directory+'/dashboard-seal.json',1_000_000).toString());
 assert.ok(seal.files.some((f:any)=>f.file===directory+'/dashboard.json'&&f.sha256===sha(bytes)),'Unsealed dashboard');
 const validation=JSON.parse(read(directory+'/dashboard-validation.json',2_000_000).toString());
 assert.equal(validation.status,'passed');assert.equal(validation.snapshotHashes?.['dashboard.json'],sha(bytes),'Validation does not bind dashboard');
 const data=JSON.parse(bytes.toString()),extracts:any[]=[];
 assert.ok(Array.isArray(data.optOutExtracts)&&data.optOutExtracts.length<=64);
 for(const ref of data.optOutExtracts??[]){
  const b=read(ref.file,32_000_000);assert.equal(b.length,ref.bytes);assert.equal(sha(b),ref.sha256);
  const inventory=JSON.parse(b.toString());assert.equal(inventory.readOnly,true);assert.ok(inventory.rows.length<=5000);
  extracts.push(...inventory.rows);
 }
 const result=verifyAuditReceiptDelivery(JSON.parse(releaseBytes.toString()),data.rows,extracts);
 writeFileSync(out,JSON.stringify({...result,releaseSha256:sha(releaseBytes),dashboardSha256:sha(bytes)},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));if(result.status==='failed')process.exitCode=1;else if(result.status==='degraded')process.exitCode=2;
}
