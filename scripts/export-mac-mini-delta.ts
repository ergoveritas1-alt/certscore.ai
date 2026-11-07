import {AUDIT_POLICY_PROVENANCE_VERSION} from '../packages/certscore-contracts/src/audit-policy-provenance';
import {planAuditDeltaQuery,assertCurrentPriorityExtraction} from './lib/audit-delta-query';
import {CHOICE_AUDIT_VERSION} from './lib/audit-progress-choice';
import {verifyProgressPins} from './lib/audit-progress-pins';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runProdDbSqlOneoff} from './lib/audit-prod-db-bounded';
const root:string=process.argv[2]??"";
if(!root)throw Error('Supply a fresh audit run containing begin.json');
const b=JSON.parse(readFileSync(root+'/begin.json','utf8'));
const pending:string[]=b.pendingRefreshIds??[];
const privacyFormRequested = b.includePrivacyFormReceipts === true;
async function main(){
 verifyProgressPins();
 const marker='MACMINI_DELTA_IDS',readOnly=true;
 const {selected,expanded}=planAuditDeltaQuery(b,marker);
 const { sql, override } = selected;
 writeFileSync(root+'/delta-query-transport.json',JSON.stringify({choiceAuditVersion:CHOICE_AUDIT_VERSION,pendingTargetCount:pending.length,
  operationsEvidenceProjected:selected.operations,operationsEvidenceScope:'policy_provenance_only',operationsOmissionReason:selected.operations?null:'ecs_launch_override_limit',
  controlAccessibilityProjected:selected.controlAccessibility,controlAccessibilityOmissionReason:selected.controlAccessibility?null:'ecs_launch_override_limit',
  cmpPairBlockersProjected:selected.operations||selected.controlAccessibility,
  privacyFormRequested,privacyFormProjected:selected.privacyForm,
  privacyFormOmissionReason:privacyFormRequested&&!selected.privacyForm?'ecs_launch_override_limit':null,
  expandedOverrideBytes:expanded.bytes,...override},null,2)+'\n',{flag:'wx'});
 if(!override.fits)throw Error('The v2 core and priority query exceeds the ECS override cap; no task started');
 writeFileSync(root+'/delta-inventory.sql',sql,{flag:'wx'});
 const output=await runProdDbSqlOneoff({marker,readOnly,sql,receiptDir:root});
 writeFileSync(root+'/delta-inventory-output.txt',output,{flag:'wx'});
 const rows=output.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
 if(rows.length>5000||new Set(rows.map(r=>r.scanId)).size!==rows.length||rows.some(r=>r.cohort_total!==rows.length||r.isMacMini!==true||(!pending.includes(r.scanId)&&Date.parse(r.created_at)<Date.parse(b.overlapStartUtc))||Date.parse(r.created_at)>=Date.parse(b.windowEndUtc)))throw Error('Incomplete, duplicate or out-of-scope ID inventory');
 assertCurrentPriorityExtraction(rows);
 const payload={version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:CHOICE_AUDIT_VERSION,scope:'Original-creator-verified Mac mini scan IDs in bounded recent window; not full production inventory',start:b.overlapStartUtc,end:b.windowEndUtc,pendingRefreshIds:pending,querySha256:createHash('sha256').update(sql).digest('hex'),rows};
 const stored={...payload,policyProvenanceOmissionReason:undefined as string|undefined,controlAccessibilityOmissionReason:undefined as string|undefined};
 let inventory = JSON.stringify(stored, null, 2) + '\n';
 if (selected.operations && Buffer.byteLength(inventory) > 32_000_000) {
  for (const row of rows) {
    if (row.choice_audit?.operationsEvidence?.version === AUDIT_POLICY_PROVENANCE_VERSION) delete row.choice_audit.operationsEvidence;
  }
  stored.policyProvenanceOmissionReason='inventory_size_bound';
  inventory = JSON.stringify(stored, null, 2) + '\n';
 }
 if(selected.controlAccessibility&&Buffer.byteLength(inventory)>32_000_000){
  for(const row of rows)delete row.controlAccessibility;
  stored.controlAccessibilityOmissionReason='inventory_size_bound';
  inventory=JSON.stringify(stored,null,2)+'\n';
 }
 if(Buffer.byteLength(inventory)>32_000_000)throw Error('Required inventory exceeds byte bound; preserve the started task output');
 writeFileSync(root+'/delta-inventory.json',inventory,{flag:'wx'});
 console.log(JSON.stringify({rows:rows.length,newSincePriorCutoff:rows.filter(r=>Date.parse(r.created_at)>=Date.parse(b.newScanStartUtc)).length,canaries:rows.filter(r=>r.isCanary).length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
