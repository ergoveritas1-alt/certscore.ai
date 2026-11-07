/** Full persisted projections remain separate from original runtime-bundle audits. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {extractProgressRow,type ProgressRow} from './audit-progress';
import {sealedSource} from './audit-progress-contracts';
import {retainedArtifactContext} from './audit-progress-retained-artifacts';
import type {OptOutReceipt} from './audit-progress-opt-out';
import {retainedInputCoverage,type RetainedReportInputState} from './audit-progress-input-coverage';
const require=createRequire(import.meta.url);require.cache[require.resolve('server-only')]={exports:{},loaded:true} as any;
const {normalizeProjectionJson}=require('../../apps/web/server/scans/scan-report-projection-contract');
type ReportReceipt=OptOutReceipt&{artifacts?:OptOutReceipt};
function readEnvelope(ref:ReportReceipt){
 const bytes=readFileSync(ref.file);if(bytes.length>20_000_000||bytes.length!==ref.bytes||createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Retained projection receipt mismatch');
 return JSON.parse(bytes.toString('utf8'));
}
function inputDisposition(row:ProgressRow,e:any):RetainedReportInputState|'matched'{
 if(!e.isMacMini||e.isCanary||!e.originalRequestId||e.publicationRequestStatus==='terminal_failure')return 'rejected_provenance';
 const p=e.snapshot;
 if(!p||!/^[a-f0-9]{64}$/.test(row.publicProjectionSourceHash??'')||!/^[a-f0-9]{64}$/.test(p.report_projection_source_hash??'')||
   !row.projectionVersion||!p.report_projection_version||!Number.isFinite(Date.parse(e.created_at))||!Number.isFinite(Date.parse(row.createdAt)))return 'generation_unverifiable';
 if(p.report_projection_source_hash!==row.publicProjectionSourceHash||p.report_projection_version!==row.projectionVersion||Date.parse(e.created_at)!==Date.parse(row.createdAt))return 'generation_mismatch';
 const serialized=JSON.stringify(normalizeProjectionJson(p.report_projection_payload));
 if(p.report_projection_status!=='ready'||Buffer.byteLength(serialized)!==p.report_projection_payload_size_bytes||createHash('sha256').update(serialized).digest('hex')!==p.report_projection_payload_sha256||p.report_projection_payload?.scan?.id!==row.scanId||!['completed','completed_limited'].includes(p.report_projection_payload.scan.status))throw Error('Persisted projection checksum/identity invalid');
 return 'matched';
}
export function applyRetainedReports(rows:ProgressRow[],receipts:(OptOutReceipt&{artifacts?:OptOutReceipt})[]){
 if(receipts.length>5000)throw Error('Retained projection count exceeds bound');
 const byId=new Map(rows.map(r=>[r.scanId,r]));if(byId.size!==rows.length)throw Error('Duplicate scan rows cannot establish retained input coverage');
 const matchedIds=new Set<string>(),seen=new Set<string>();let filled=0,duplicateReceipts=0;
 const candidates:{ref:ReportReceipt;row:ProgressRow;payloadHash:string}[]=[],hashes=new Map<string,Set<string>>();
 for(const row of rows){if(row.reportable)row.retainedReportInput='missing_input';else delete row.retainedReportInput;}
 // Preflight all candidates before supplementing any row. Keep only small
 // receipts/signatures in memory, not thousands of complete report payloads.
 for(const ref of receipts){
  const e=readEnvelope(ref),row=byId.get(e.scanId);if(!row?.reportable)continue;
  const disposition=inputDisposition(row,e);
  if(disposition!=='matched'){
   const order=['missing_input','rejected_provenance','generation_unverifiable','generation_mismatch'];
   if(order.indexOf(disposition)>order.indexOf(row.retainedReportInput!))row.retainedReportInput=disposition;
   continue;
  }
  const payloadHash=e.snapshot.report_projection_payload_sha256,set=hashes.get(row.scanId)??new Set<string>();set.add(payloadHash);hashes.set(row.scanId,set);
  candidates.push({ref,row,payloadHash});
 }
 for(const {ref,row,payloadHash} of candidates){
  if(hashes.get(row.scanId)!.size!==1){row.retainedReportInput='conflicting_generation';continue;}
  const key=JSON.stringify([row.scanId,payloadHash,ref.artifacts?.sha256??null]);
  if(seen.has(key)){duplicateReceipts++;continue;}seen.add(key);
  const e=readEnvelope(ref);if(inputDisposition(row,e)!=='matched')throw Error('Retained projection changed during import');
  const p=e.snapshot,record={...p.report_projection_payload,snapshot:{...p.report_projection_payload.snapshot,report_projection_version:p.report_projection_version,report_projection_source_hash:p.report_projection_source_hash}};
  const context=retainedArtifactContext(p.report_projection_payload,row.scanId,ref.artifacts);
  const raw=extractProgressRow({inventory:{id:row.scanId,hostname:row.site,created_at:row.createdAt,status:e.status,scan_from:row.region,lambda_config:p.report_projection_payload.scan.scanConfigJson?.execution?.v2DagLambda},origin:e,record,report:record,bundle:context?.bundle,sourceFacts:context?.sourceFacts,refs:context?.refs??[],exportState:context?'generation_matched':'persisted_generation_matched'});
  if(context){
   const policy=context.policy,privacy=policy.documents.filter(d=>d.surfaceType==='privacy_policy');
   raw.states.policy_fetch=policy.policyFetches===null?'unavailable':policy.policyFetches>0?'fetched':policy.inspection?.retrievalCoverage==='complete'?'no_fetch_returned':'unknown';
   raw.states.policy_owner=policy.metadataUsablePolicyCandidates===null?'unavailable':policy.metadataUsablePolicyCandidates>0?'producer_declared_usable':'unknown';
   raw.states.policy_full_text=privacy.some(d=>d.verification==='verified_local_bytes'&&d.textCoverage==='complete'&&!d.limitations.includes('retained_text_length_does_not_match_metadata'))?'verified_full_text':privacy.some(d=>d.verification==='invalid_local_bytes')?'invalid_local_bytes':privacy.some(d=>d.verification==='verified_local_bytes')?'verified_partial_or_unspecified':'unavailable';
   row.refs.push({file:ref.artifacts!.file,sha256:ref.artifacts!.sha256,role:'verified_original_artifact_ancestry'},...context.refs);
  }
  const source=context?sealedSource(raw):'persisted_report_projection/'+raw.assessmentVersion+'/'+row.projectionVersion;
  for(const [id,value] of Object.entries(raw.states)){
   if(value==='unavailable'&&!/^(registration|terminal)\./.test(id)||!(/^(evidence$|publication$|control\.|execution\.|click\.|registration\.|terminal\.|topic\.|privacy_policy$|policy_|gpc_|cmp_provider$|cmp_check\.|cmp_dispatch$|detail\.sealed\.|checklist\.|verdict\.)/.test(id)))continue;
   const key='sealed.'+id;if(row.states[key]!==undefined&&row.states[key]!=='unavailable'&&!(context&&id.startsWith('detail.sealed.')&&row.states[key]==='unverified_projection'))continue;
   row.states[key]=value;row.metricSources??={};row.metricSources[key]=source+(context&&raw.metricSources?.[id]?'/'+raw.metricSources[id]:'');filled++;
  }
  for(const [id,value] of Object.entries(raw.measurements??{})){if(!/^(site|technology|graph|form)\./.test(id)||row.measurements?.[id]!==undefined)continue;row.measurements??={};row.measurements[id]=value;row.metricSources??={};row.metricSources[id]=source+(id.startsWith('graph.')?'/'+raw.states['detail.sealed.relationships']:'');filled++;}
  row.retainedMetricLabels??={};Object.assign(row.retainedMetricLabels,raw.metricLabels??{});
  (row as any).originProof='original_credential_verified';
  row.refs.push({file:ref.file,sha256:ref.sha256,role:'checksum_verified_persisted_report_generation'});matchedIds.add(row.scanId);
  if(context||row.retainedReportInput!=='verified_originals')row.retainedReportInput=context?'verified_originals':'verified_report';
 }
 return {matched:matchedIds.size,filled,duplicateReceipts,inputCoverage:retainedInputCoverage(rows)};
}
