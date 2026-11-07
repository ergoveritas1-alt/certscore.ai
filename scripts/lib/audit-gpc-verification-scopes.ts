import {apiV2GpcResponseSchema} from '../../packages/certscore-api-contracts/src/scan-observation-results';
import {gpcResponseAssessmentSchema} from '../../packages/certscore-contracts/src/gpc-observation';
import {pairedGpcAudit} from './audit-progress-gpc';
import type {ValueSample} from './audit-master-values';
/** Compatibility item with named, non-interchangeable proof scopes. */
export function gpcVerificationScopes(doc:any):ValueSample[]{
 const g=doc.gpcResponse?.assessment?{...doc.gpcResponse.assessment,activityComparison:doc.gpcResponse.activityComparison,cmpStateComparison:doc.gpcResponse.cmpStateComparison}:doc.gpcResponse,scanId=doc.scanId??doc.scan?.id;
 if(!g)return [];
 const {activityComparison:_activity,cmpStateComparison:_cmp,...core}=g;
 const publicPacket=apiV2GpcResponseSchema.safeParse(g),parsed=publicPacket.success?publicPacket:gpcResponseAssessmentSchema.safeParse(core);
 if(!parsed.success||parsed.data.contractVersion==='certscore.gpc-response-assessment.v1')return [{recordKey:'scopes',value:null,qualification:'gpc-scoped-verification.v1',availability:'invalid_or_unbound'}];
 const a=parsed.data,values:ValueSample[]=[];
 const add=(recordKey:string,value:unknown,qualification:string,availability='available')=>values.push({recordKey,value,qualification,availability});
 if(a.contractVersion==='certscore.gpc-response-assessment.v3'&&'observation' in a&&a.observation){
  const o=a.observation;
  if(o.status!=='unavailable'&&o.scanId===scanId&&o.sourceSha256===a.comparison.gpcArtifact?.sha256&&o.sessionSha256&&o.documentUrlSha256&&o.positiveEvidence?.representativeDocument){
   add('bounded_main_document',{verified:o.delivery.httpHeaderRetained&&o.delivery.mainNavigatorReadbackRetained,httpHeader:o.delivery.httpHeaderRetained,navigator:o.delivery.mainNavigatorReadbackRetained},['gpc-bounded-delivery.v1',o.contractVersion,o.sourceSha256,o.sessionSha256,o.documentUrlSha256].join('/'));
  }else add('bounded_main_document',null,'gpc-bounded-delivery.v1','not_retained');
 }else add('bounded_main_document',null,'gpc-bounded-delivery.v1','unsupported_version');
 const pair=pairedGpcAudit({...doc,scanId,gpcResponse:{...g,...a}});
 if(pair.states['detail.gpc.paired_pair']==='measured')add('matched_paired_window',{deliveryStatus:a.comparison.delivery?.status??'unavailable',matchedWindow:pair.states['detail.gpc.paired_window'],durationMs:pair.measurements['gpc.paired.duration_ms']},['gpc-paired-delivery.v1',publicPacket.success?'public_retained_summary':'sealed_delivery_proof',a.contractVersion,a.comparison.baselineArtifact?.sha256,a.comparison.gpcArtifact?.sha256,pair.scope].join('/'));
 else add('matched_paired_window',null,'gpc-paired-delivery.v1',pair.states['detail.gpc.paired_pair']==='invalid_or_unbound'?'invalid_or_unbound':'not_retained');
 return values;
}
