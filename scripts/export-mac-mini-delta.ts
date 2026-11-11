import {AUDIT_POLICY_PROVENANCE_VERSION,auditPolicyProvenanceSchema} from '../packages/certscore-contracts/src/audit-policy-provenance';
import {buildAuditDeltaQuery,fitAuditDeltaQuery,assertCurrentPriorityExtraction} from './lib/audit-delta-query';
import {CHOICE_AUDIT_VERSION} from './lib/audit-progress-choice';
import {verifyProgressPins} from './lib/audit-progress-pins';
import {existsSync,linkSync,readFileSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runProdDbSqlOneoff} from './lib/audit-prod-db-bounded';
import snapshotLimits from './lib/audit-progress-snapshot-limits.json';
const [root='',mode,...extra]=process.argv.slice(2);
if(!root||extra.length||(mode!==undefined&&mode!=='--recover'&&mode!=='--plan'))throw Error('Supply an audit run containing begin.json, with --recover for an existing task');
const recovering=mode==='--recover';
const b=JSON.parse(readFileSync(root+'/begin.json','utf8'));
const plannedPending:string[]=b.pendingRefreshIds??[];
let pending=plannedPending;
const privacyFormRequested = b.includePrivacyFormReceipts === true;

function saveOutput(file:string, contents:string) {
 const temporary = file + '.' + randomUUID() + '.tmp';
 try {
  writeFileSync(temporary,contents,{flag:'wx'});
  linkSync(temporary,file);
 } finally {
  if(existsSync(temporary))unlinkSync(temporary);
 }
}

async function main(){
 verifyProgressPins();
 const marker='MACMINI_DELTA_IDS',readOnly=true;
 if(mode==='--plan'){
  const plan=fitAuditDeltaQuery(b,marker);
  console.log(JSON.stringify({planningOnly:true,pendingRefreshIds:plan.pendingRefreshIds,deferredPendingIds:plan.deferredPendingIds,
   override:plan.selected.override,querySha256:createHash('sha256').update(plan.selected.sql).digest('hex')}));return;
 }
 const inventoryFile=path.join(root,'delta-inventory.json');
 if(existsSync(inventoryFile))throw Error('Inventory already saved; reuse it for the remaining refresh stages');
 const transportFile=path.join(root,'delta-query-transport.json');
 const sqlFile=path.join(root,'delta-inventory.sql');
 let sql:string,operations:boolean,policyReceipt:boolean,controlAccessibility:boolean,californiaReject=true,technicalCounts=true,trackingReviews=true,comparisonMetadata=true;
 if(recovering){
  const transport=JSON.parse(readFileSync(transportFile,'utf8'));
  const original=transport.plannedPendingIds??plannedPending;
  if(JSON.stringify(original)!==JSON.stringify(plannedPending))throw Error('Recovery planned IDs changed');
  pending=transport.pendingRefreshIds??plannedPending;
  if(!Array.isArray(pending)||JSON.stringify(pending)!==JSON.stringify(plannedPending.slice(0,pending.length)))throw Error('Recovery selected IDs changed');
  comparisonMetadata=transport.comparisonMetadataProjected===true;
  policyReceipt=transport.policyReceiptProjected===true;
  operations=transport.operationsEvidenceProjected===true&&!policyReceipt;
  controlAccessibility=transport.controlAccessibilityProjected===true;
  californiaReject=transport.californiaRejectCoverageProjected===true;
  technicalCounts=transport.technicalCountsProjected===true;
  trackingReviews=transport.trackingReviewsProjected===true;
  if(transport.choiceAuditVersion!==CHOICE_AUDIT_VERSION||transport.pendingTargetCount!==pending.length||
     transport.privacyFormProjected!==privacyFormRequested||transport.fits!==true)throw Error('Recovery transport does not match the frozen daily query');
  sql=readFileSync(sqlFile,'utf8');
  if(sql!==buildAuditDeltaQuery({...b,pendingRefreshIds:pending},operations,privacyFormRequested,controlAccessibility,californiaReject,technicalCounts,trackingReviews,policyReceipt,comparisonMetadata))throw Error('Recovery SQL differs from the frozen query');
 }else{
  if(b.priorSnapshot&&statSync(path.join(b.priorSnapshot,'dashboard.json')).size>snapshotLimits['dashboard.json']){
   throw Error('Prior dashboard exceeds the local snapshot byte bound; no task started');
  }
  const plan=fitAuditDeltaQuery(b,marker);
  const {selected,expanded}=plan;
  pending=plan.pendingRefreshIds;
  ({sql,operations,policyReceipt,controlAccessibility}=selected);
  writeFileSync(transportFile,JSON.stringify({choiceAuditVersion:CHOICE_AUDIT_VERSION,pendingTargetCount:pending.length,plannedPendingIds:plannedPending,pendingRefreshIds:pending,deferredPendingIds:plan.deferredPendingIds,comparisonMetadataProjected:true,
   operationsEvidenceProjected:operations||policyReceipt,operationsEvidenceScope:'policy_provenance_only',
   policyReceiptProjected:policyReceipt,operationsEvidenceTransport:policyReceipt?'bounded_policy_receipt_column':'choice_summary',
   operationsOmissionReason:operations||policyReceipt?null:'ecs_launch_override_limit',
   controlAccessibilityProjected:controlAccessibility,controlAccessibilityOmissionReason:controlAccessibility?null:'ecs_launch_override_limit',
   cmpPairBlockersProjected:operations||controlAccessibility,
   californiaRejectCoverageProjected:true,
   technicalCountsProjected:true,
   trackingReviewsProjected:true,
   privacyFormRequested,privacyFormProjected:selected.privacyForm,
   privacyFormOmissionReason:privacyFormRequested&&!selected.privacyForm?'ecs_launch_override_limit':null,
   expandedOverrideBytes:expanded.bytes,...selected.override},null,2)+'\n',{flag:'wx'});
  if(!selected.override.fits)throw Error('The required v2 query and policy receipt exceed the ECS override planning cap; no task started');
  writeFileSync(sqlFile,sql,{flag:'wx'});
 }
 const output=await runProdDbSqlOneoff({marker,readOnly,sql,receiptDir:root,recoverStarted:recovering});
 const outputFile=path.join(root,'delta-inventory-output.txt');
 if(recovering&&existsSync(outputFile)){
  if(readFileSync(outputFile,'utf8')!==output)throw Error('Saved output differs from the checksum-verified task output');
 }else saveOutput(outputFile,output);
 const rows=output.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
 if(rows.length>5000||new Set(rows.map(r=>r.scanId)).size!==rows.length||rows.some(r=>r.cohort_total!==rows.length||r.isMacMini!==true||(!pending.includes(r.scanId)&&Date.parse(r.created_at)<Date.parse(b.overlapStartUtc))||Date.parse(r.created_at)>=Date.parse(b.windowEndUtc)))throw Error('Incomplete, duplicate or out-of-scope ID inventory');
 assertCurrentPriorityExtraction(rows);
 if(comparisonMetadata&&rows.some(row=>!Object.hasOwn(row,'auditComparison')))throw Error('Daily query omitted comparison metadata');
 if(californiaReject&&rows.some(row=>!Object.hasOwn(row,'caReject')))throw Error('Daily query omitted the California Reject coverage column');
 if(technicalCounts&&rows.some(row=>!Object.hasOwn(row,'technicalCounts')))throw Error('Daily query omitted the technical counts column');
 if(trackingReviews&&rows.some(row=>!Object.hasOwn(row,'trackingReviews')))throw Error('Daily query omitted the tracking reviews column');
 if(policyReceipt){
  if(rows.some(row=>!Object.hasOwn(row,'policyReceipt')))throw Error('Daily query omitted the producer policy receipt column');
  for(const row of rows)row.policyReceipt=auditPolicyProvenanceSchema.safeParse(row.policyReceipt).data??null;
 }
 const payload={version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:CHOICE_AUDIT_VERSION,scope:'Original-creator-verified Mac mini scan IDs in bounded recent window; not full production inventory',start:b.overlapStartUtc,end:b.windowEndUtc,pendingRefreshIds:pending,plannedPendingIds:plannedPending,deferredPendingIds:plannedPending.slice(pending.length),querySha256:createHash('sha256').update(sql).digest('hex'),rows};
 const stored={...payload,policyProvenanceOmissionReason:undefined as string|undefined,controlAccessibilityOmissionReason:undefined as string|undefined};
 let inventory = JSON.stringify(stored, null, 2) + '\n';
 if (operations && Buffer.byteLength(inventory) > 32_000_000) {
  for (const row of rows) {
    if (row.choice_audit?.operationsEvidence?.version === AUDIT_POLICY_PROVENANCE_VERSION) delete row.choice_audit.operationsEvidence;
  }
  stored.policyProvenanceOmissionReason='inventory_size_bound';
  inventory = JSON.stringify(stored, null, 2) + '\n';
 }
 // Required control accessibility and comparison receipts are never evicted.
 if(Buffer.byteLength(inventory)>32_000_000)throw Error('Required inventory exceeds byte bound; preserve the started task output');
 saveOutput(inventoryFile,inventory);
 console.log(JSON.stringify({rows:rows.length,newSincePriorCutoff:rows.filter(r=>Date.parse(r.created_at)>=Date.parse(b.newScanStartUtc)).length,canaries:rows.filter(r=>r.isCanary).length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
