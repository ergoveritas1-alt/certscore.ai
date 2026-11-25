import { parseCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
/** Read only exact retained objects, with result-event -> manifest -> byte ancestry. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectPolicyCapture} from './daily-policy-audit';
import {sourceFacets} from './daily-reliability-scorecard';
import type {OptOutReceipt} from './audit-progress-opt-out';
export function verifiedReceipt(ref:OptOutReceipt,max=20_000_000):Buffer {
 const b=readFileSync(ref.file);if(b.length>max||b.length!==ref.bytes||createHash('sha256').update(b).digest('hex')!==ref.sha256)throw Error('Retained artifact checksum/size mismatch');return b;
}
export function retainedArtifactContext(payload:any,scanId:string,ref?:OptOutReceipt){
 if(!ref)return null;
 const input=JSON.parse(verifiedReceipt(ref,2_000_000).toString());
 if(input.version!=='certscore.audit-retained-artifacts.v1'||input.scanId!==scanId||!Array.isArray(input.receipts)||input.receipts.length>50)throw Error('Invalid retained artifacts manifest');
 const events=(payload.events??[]).filter((e:any)=>e.eventType==='v2_lambda_result.received');
 if(events.length!==1)throw Error('Ambiguous original result event');
 const event=events[0].metadataJson,receipts=input.receipts;
 const load=(kind:string,expected:any,uri:string)=>{
  const matches=receipts.filter((r:any)=>r.kind===kind);if(matches.length!==1)throw Error('Missing/ambiguous artifact '+kind);
  const r=matches[0];if(r.uri!==uri||r.sha256!==expected?.sha256||r.bytes!==expected?.sizeBytes)throw Error('Artifact ancestry mismatch');
  return {bytes:verifiedReceipt(r),receipt:r};
 };
 const bundleRef=load('scanArtifactUri',event.artifactMetadata?.scanArtifactUri,event.artifactPointers?.scanArtifactUri);
 const manifestRef=load('manifestUri',event.artifactMetadata?.manifestUri,event.artifactPointers?.manifestUri);
 const bundle=parseCanonicalEvidenceArtifact(bundleRef.bytes) as any,manifest=JSON.parse(manifestRef.bytes.toString());
 if(bundle.scanId!==scanId||manifest.scanId!==scanId)throw Error('Artifact scan identity mismatch');
 const aux=manifest.auxiliaryArtifacts??[],policyReceipts:any[]=[];let support={};
 for(const r of receipts.filter((r:any)=>!['scanArtifactUri','manifestUri'].includes(r.kind))){
  const matches=aux.filter((a:any)=>a.fileName===r.kind);if(matches.length!==1)throw Error('Ambiguous manifest auxiliary');
  const a=matches[0];const v=load(r.kind,a,a.uri);
  if(r.kind==='LocalV2DagLambdaShardSummary.json'){support=JSON.parse(v.bytes.toString());if((support as any).scanId!==scanId)throw Error('Support scan identity mismatch');}
  else if(/^policy_surface_text_[a-z0-9_]+\.txt$/.test(r.kind))policyReceipts.push({scanId,kind:r.kind,localPath:r.file,verified:true,expected:{sha256:r.sha256,sizeBytes:r.bytes}});
  else throw Error('Unexpected retained artifact kind');
 }
 const policy=inspectPolicyCapture({root:input.root,scanId,site:'retained',region:'retained',status:'completed',bundle,receipts:policyReceipts});
 return {bundle,manifest,bundleSource:{sha256:bundleRef.receipt.sha256,sizeBytes:bundleRef.bytes.length},sourceFacts:{profile:manifest.privacyCaptureProfile,facets:sourceFacets(bundle,manifest,support)},policy,refs:receipts.map((r:any)=>({file:r.file,sha256:r.sha256,role:r.kind})),receipt:ref};
}

const consentActionStages = new Set([
 'not_started', 'gate_declined', 'not_dispatched', 'worker_failed', 'worker_deadline_exceeded',
 'packet_deadline_exceeded', 'packet_not_joined', 'exact_recheck_failed', 'packet_joined',
]);
const consentPassiveReasons = new Set([
 'source_unavailable', 'source_binding_invalid', 'passive_capture_incomplete', 'label_conflict_unresolved',
 'control_binding_unverified', 'control_ambiguous', 'proof_expired',
]);
const sha256Pattern = /^[0-9a-f]{64}$/;

// Called only after the result event binds the manifest bytes to this report generation.
export function retainedConsentActionStates(manifest: Record<string, any>, scanId: string): Record<string, string> {
 const stages = manifest.consentActionStages;
 const states: Record<string, string> = {};
 if (manifest.scanId !== scanId || stages?.scanId !== scanId ||
     stages.version !== 'certscore.consent-action-stages.v1') return states;
 for (const action of ['accept', 'reject'] as const) {
  const gate = manifest[action+'GateShadowReceipt'];
  if (gate?.scanId !== scanId || gate.version !== `certscore.${action}-gate-shadow-receipt.v1` ||
      gate.enforcementActive !== true || !consentActionStages.has(stages[action])) continue;
  const prefix = `sealed.detail.${action}.coordinator.`;
  states[prefix+'stage'] = stages[action];
  const {outcome, blockReason} = gate.passive ?? {};
  if (outcome === 'qualified') states[prefix+'passive'] = outcome;
  if (outcome === 'blocked' && (consentPassiveReasons.has(blockReason) || blockReason === `no_first_layer_${action}`)) {
   states[prefix+'passive'] = blockReason;
  }
  if (['would_allow', 'would_block', 'not_attempted'].includes(gate.dispatch?.outcome)) {
   states[prefix+'dispatch'] = gate.dispatch.outcome;
  }
  if (['passed', 'failed', 'not_run', 'unavailable'].includes(gate.finalRecheck?.outcome)) {
   states[prefix+'exact_recheck'] = gate.finalRecheck.outcome;
  }
  const receipt = manifest[action+'ClickCheckpoint'];
  if (outcome === 'qualified' && gate.dispatch?.outcome === 'would_allow' &&
      Number.isSafeInteger(gate.timing?.dispatchObservedAtMs) && Number.isSafeInteger(gate.timing?.proofExpiresAtMs) &&
      receipt?.scanId === scanId && receipt.version === `certscore.${action}-click-checkpoint.v1` &&
      sha256Pattern.test(receipt.receiptSha256 ?? '') && sha256Pattern.test(receipt.gateProofSha256 ?? '') &&
      [receipt.recheckedAtMs, receipt.dispatchedAtMs, receipt.completedAtMs, receipt.verifiedAtMs].every(Number.isSafeInteger) &&
      receipt.recheckedAtMs >= gate.timing.dispatchObservedAtMs && receipt.recheckedAtMs <= receipt.dispatchedAtMs &&
      receipt.dispatchedAtMs < gate.timing.proofExpiresAtMs && receipt.dispatchedAtMs <= receipt.completedAtMs &&
      receipt.completedAtMs <= receipt.verifiedAtMs) {
   states[prefix+'click_checkpoint'] = 'verified';
  }
 }
 return states;
}
