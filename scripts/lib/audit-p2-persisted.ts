/** Existing local receipts only. Never build a customer report or infer missing CMP rows. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeProjectionJson} from '../../apps/web/server/scans/scan-report-projection-contract';
import {retainedArtifactContext} from './audit-progress-retained-artifacts';
import type {ProgressRow} from './audit-progress';
import {persistedP2Fields,stablePrivacyFormJson as json,type PersistedP2Source} from '../../apps/web/server/scans/privacy-form-audit-fields';
export {persistedP2Fields,PERSISTED_P2_IDS} from '../../apps/web/server/scans/privacy-form-audit-fields';

type Receipt={file:string;sha256:string;bytes?:number};
type RetainedReceipt=Receipt&{bytes:number;artifacts?:Receipt&{bytes:number}};
export type PersistedP2Inputs={rows:ProgressRow[];sources?:Receipt[];retainedReports?:RetainedReceipt[]};
const digest=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
function read(ref:Receipt){
 const bytes=readFileSync(ref.file);
 if(bytes.length>20_000_000||ref.bytes!==undefined&&bytes.length!==ref.bytes||digest(bytes)!==ref.sha256)throw Error('P2 retained source receipt mismatch: '+ref.file);
 return {bytes,doc:JSON.parse(bytes.toString('utf8'))};
}
export function loadPersistedP2Sources(data:PersistedP2Inputs){
 const rows=new Map(data.rows.filter(r=>r.reportable).map(r=>[r.scanId,r]));
 const candidates:Array<{ref:Receipt&{artifacts?:RetainedReceipt['artifacts']};kind:'retained_report'|'sealed_snapshot';row?:ProgressRow}>=[
  ...(data.retainedReports??[]).map(ref=>({ref,kind:'retained_report' as const})),
  ...[...rows.values()].flatMap(row=>row.refs.filter(ref=>ref.role==='checksum_verified_projection').map(ref=>({ref,kind:'sealed_snapshot' as const,row}))),
 ];
 if(candidates.length>10_000)throw Error('P2 retained source count exceeds bound');
 const originRefs=(data.sources??[]).filter(s=>s.file.endsWith('/bot-origins.json'));
 if(candidates.some(c=>c.kind==='sealed_snapshot')&&originRefs.length!==1)throw Error('P2 original creator receipt missing/ambiguous');
 const origins=new Map<string,any>();
 if(originRefs.length){const origin=read(originRefs[0]!).doc;if(origin.version!=='certscore.audit-bot-origin.v1'||origin.readOnly!==true||!Array.isArray(origin.rows))throw Error('P2 invalid original creator source');for(const o of origin.rows){if(origins.has(o.scanId)&&json(origins.get(o.scanId))!==json(o))throw Error('P2 conflicting original creator');origins.set(o.scanId,o);}}
 const byScan=new Map<string,PersistedP2Source>(),identities=new Map<string,{creator:string;digest:string}>(),receipts:any[]=[],rejected:Record<string,number>={};let duplicates=0;
 const reject=(reason:string,ref:Receipt)=>{rejected[reason]=(rejected[reason]??0)+1;receipts.push({...ref,status:reason});};
 for(const c of candidates){
  const {bytes,doc}=read(c.ref),s=c.kind==='retained_report'?doc.snapshot:doc,p=s?.report_projection_payload,row=c.row??rows.get(doc.scanId);
  const serialized=JSON.stringify(normalizeProjectionJson(p));
  if(!p||Buffer.byteLength(serialized)!==s.report_projection_payload_size_bytes||digest(serialized)!==s.report_projection_payload_sha256)throw Error('P2 persisted payload checksum mismatch');
  if(!row){reject('outside_reportable_cohort',c.ref);continue;}
  if(!row.publicProjectionSourceHash){reject('current_export_source_binding_missing',c.ref);continue;}
  if(s.report_projection_status!=='ready'||p.scan?.id!==row.scanId||!['completed','completed_limited'].includes(p.scan?.status)||s.report_projection_version!==row.projectionVersion||s.report_projection_source_hash!==row.publicProjectionSourceHash||Date.parse(p.scan?.createdAt)!==Date.parse(row.createdAt)){reject('generation_or_time_mismatch',c.ref);continue;}
  const origin=c.kind==='retained_report'?doc:origins.get(row.scanId);
  if(!origin||origin.isMacMini!==true||origin.isCanary!==false||!/^pulse_req_/.test(origin.originalRequestId)||origin.publicationRequestStatus==='terminal_failure'||row.originProof!=='original_credential_verified')throw Error('P2 original creator unavailable');
  if(/^pulse_req_/.test(row.originRequestId)&&origin.originalRequestId!==row.originRequestId)throw Error('P2 original creator conflict');
  if(c.kind==='sealed_snapshot'&&(doc.scan_id!==row.scanId||origin.originalRequestId!==row.originRequestId))throw Error('P2 sealed scan/creator mismatch');
  if(c.kind==='retained_report'&&(Date.parse(doc.created_at)!==Date.parse(row.createdAt)||doc.scanId!==row.scanId))throw Error('P2 retained envelope mismatch');
  const events=(p.events??[]).filter((e:any)=>e.eventType==='v2_lambda_result.received');if(events.length!==1)throw Error('P2 original result event ambiguous');const event=events[0].metadataJson;
  if(c.kind==='retained_report'){if(!retainedArtifactContext(p,row.scanId,c.ref.artifacts))throw Error('P2 retained ancestry missing');}
  else for(const kind of ['scanArtifactUri','manifestUri']){
   const refs=row.refs.filter(r=>r.role===kind);if(!refs.length||new Set(refs.map(r=>r.sha256)).size!==1)throw Error('P2 conflicting original ancestry');
   for(const ref of refs){const original=read(ref);if(ref.sha256!==event.artifactMetadata?.[kind]?.sha256||original.bytes.length!==event.artifactMetadata?.[kind]?.sizeBytes||original.doc.scanId!==row.scanId)throw Error('P2 original ancestry mismatch');}
  }
  const extracted=persistedP2Fields(p,row.scanId,event.artifactMetadata.scanArtifactUri.sha256),previous=identities.get(row.scanId);
  if(previous&&(previous.creator!==origin.originalRequestId||previous.digest!==extracted.valueDigest))throw Error('P2 conflicting retained values for same generation');
  if(previous)duplicates++;else{identities.set(row.scanId,{creator:origin.originalRequestId,digest:extracted.valueDigest});byScan.set(row.scanId,{sourceView:'persisted_assessment',schema:'certscore.audit-p2-persisted-source.v1',generation:row.projectionVersion,originProof:'original_credential_verified',fields:extracted.fields});}
  receipts.push({file:c.ref.file,sha256:c.ref.sha256,bytes:bytes.length,kind:c.kind,scanId:row.scanId,generation:row.projectionVersion,sourceHash:row.publicProjectionSourceHash,payloadSha256:s.report_projection_payload_sha256,originalRequestId:origin.originalRequestId,status:previous?'verified_duplicate_source':'verified_unique_source'});
 }
 return {byScan,summary:{version:'certscore.audit-p2-persisted-source.v1',status:'verified',filesExamined:candidates.length,matchingScans:byScan.size,consistentDuplicateSources:duplicates,rejected,receipts,originReceipt:originRefs[0]??null,scope:'Existing same-generation, original-creator-bound persisted assessments only. Initial passive form scope; not post-Accept/full-site. Exact CMP criteria are not derived. No customer views reconstructed or parity claims added.',productionQueries:0,newAcquisition:0}};
}
