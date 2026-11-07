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
