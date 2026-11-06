import {REDHAT_OPT_OUT_POLICY,REDHAT_OPT_OUT_RECIPE,REDHAT_OPT_OUT_DOCUMENT,saleSharingOptOutEvidenceSchema,type SaleSharingOptOutDispatch,type SaleSharingOptOutEvidence} from '@certscore/contracts';

/** Serialize observed worker facts only. Original and replacement documents stay
 * distinct; terminal CMP recording cannot create semantic GPP state or traffic. */
export function redHatObservationPacket(row:any,config:SaleSharingOptOutDispatch,parentDispatchSha256:string):SaleSharingOptOutEvidence {
 if(row.scanId!==config.scanId||row.url!==config.exactTargetUrl||row.sourceBundleSha256!==config.redHatAuthorization?.sourceSha256)throw Error('redhat_observation_binding_mismatch');
 const reload=row.samePageReload,events=row.postClickNavigation?.entries;
 const initial=row.documentTokenSha256??null;
 const reloadVerified=reload?.committed&&reload.responseVerified&&!reload.invalidated&&row.requests?.length===3&&row.requests[2].status===200&&
  ['scheduled','requested'].every(slot=>events?.[slot]?.reason==='reload'&&events[slot].isMainFrame&&events[slot].exactDestination===REDHAT_OPT_OUT_DOCUMENT&&events[slot].sourceDocumentSha256===initial&&events[slot].actionAtMs===row.dispatchedAtMs)&&
  events?.request?.method==='GET'&&events.request.isMainFrame&&events.request.exactDestination===REDHAT_OPT_OUT_DOCUMENT;
 const elapsed=Math.max(0,Math.min(3000,row.captureFinishedMs));
 const control=row.control&&row.actionability?.controlVisible&&row.actionability.controlEnabled&&row.actionability.boundingBoxInViewport&&row.actionability.centerHitTargetRelation==='control_or_descendant'
  ? {visibleLabel:row.control.visibleLabel,accessibleLabel:row.control.accessibleLabel,dialogId:row.control.dialogId,portalId:row.control.portalId,openShadow:row.control.openShadow,hitTargetVerified:true}:null;
 const proof={version:'redhat.opt-out-proof.v1',source:config.redHatAuthorization,initialDocumentSha256:initial,bindingVerified:row.stateBindingVerified===true&&row.captureFinishedMs<=3000,
  captureFinishedMs:elapsed,route:(row.requests??[]).map((r:any)=>({url:r.url,requestId:r.requestId,redirectedRequestId:r.redirectedRequestId??null,...(r.status===undefined?{}:{status:r.status})})),control,
  clickAtMs:row.dispatchedAtMs??null,reads:['before','after','terminal'].flatMap(phase=>row[phase]?.documentTokenSha256?[{phase,atMs:row[phase].atMs,documentSha256:row[phase].documentTokenSha256,status:row[phase].value.status,decision:row[phase].value.decision}]:[]),
  followUpMs:Math.min(3000,row.followUpMs??0),reload:reloadVerified?{requestId:reload.requestId,networkId:reload.networkId,sourceDocumentSha256:reload.sourceDocumentSha256,replacementDocumentSha256:reload.replacementDocumentSha256,
   requestedAtMs:reload.requestedAtMs,actionAtMs:reload.actionAtMs,reason:'reload',targetUrl:REDHAT_OPT_OUT_DOCUMENT,method:'GET',responseStatus:200,committed:true}:null};
 return saleSharingOptOutEvidenceSchema.parse({contractVersion:'certscore.sale-sharing-opt-out-evidence.v4',policyVersion:REDHAT_OPT_OUT_POLICY,scanId:config.scanId,parentDispatchSha256,targetUrl:config.exactTargetUrl,
  documentToken:initial,actionTargetUrl:initial?REDHAT_OPT_OUT_DOCUMENT:null,tlsValidated:Boolean(initial),startedAt:row.startedAt,completedAt:row.completedAt,
  status:'limited',recipeVersion:REDHAT_OPT_OUT_RECIPE,provider:'TrustArc',actionCount:row.actions??0,submitted:row.submitted===true,
  registration:row.submitted?'unconfirmed':'not_attempted',confirmedAt:null,before:null,after:null,observationWindowMs:0,captureComplete:false,truncated:false,requests:[],redHatChoice:proof,
  limitations:[row.error?'redhat_verification_limited':row.terminalCategoryChangeObserved?'post_confirmation_activity_not_measured':String(row.stop??'redhat_choice_unconfirmed').slice(0,100)]});
}
