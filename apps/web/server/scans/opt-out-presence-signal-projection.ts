import {createHash} from "node:crypto";
import {reviewedOptOutPolicyRedirect,reviewedOptOutRouteCandidates,matchReviewedOptOutRoute,domOptOutLabelSchema,optOutInstructionLabel,optOutPresenceSignalSchema,matchScopedOptOutInstructions,policyTextEvidenceProjectionSchema,reviewedOptOutPolicyOwner,reviewedOptOutPolicyIndexLink,type CaliforniaPolicyDocument,type CaliforniaPrivacyReview,type CanonicalEvidenceBundle,type OptOutPresenceSignal} from "@certscore/contracts";
import type {CaliforniaPolicyEvidence} from "./california-review-coverage-projection";
function sameObservedProperty(left:string,right:string){
  try {const a=new URL(left),b=new URL(right);return ["http:","https:"].includes(a.protocol)&&["http:","https:"].includes(b.protocol)&&
    !a.username&&!a.password&&!b.username&&!b.password&&!a.port&&!b.port&&a.hostname.replace(/^www\./,"")===b.hostname.replace(/^www\./,"");}catch{return false;}
}
type BoundDocument=CaliforniaPolicyDocument&{sourceBinding?:OptOutPresenceSignal["sourceBinding"]};

/** Reviewed sources are positive-only and never enter governing policy coverage. */
export function projectReviewedOwnerOptOutDocuments(bundle:CanonicalEvidenceBundle,sourceHash:string,evidence?:CaliforniaPolicyEvidence,review?:CaliforniaPrivacyReview):BoundDocument[]{
  const parsed=policyTextEvidenceProjectionSchema.safeParse(evidence?.projection);
  if(!parsed.success||parsed.data.scanId!==bundle.scanId||parsed.data.sourceBundle.sha256!==sourceHash||parsed.data.sourceBundle.verificationStatus!=="verified")return [];
  return parsed.data.documents.slice(0,8).flatMap(doc=>{
    const surface=bundle.policySurfaceObservations.find(s=>s.observationId===doc.observationId);
    const url=doc.finalUrl??doc.requestedUrl;
    const owner=reviewedOptOutPolicyOwner(bundle.normalizedUrl,url,bundle.startedAt);
    // The original policy lane owns this observed source link and redirect
    // ancestry. No consent/recovery loader is borrowed, and no new artifact is read.
    const redirect=bundle.scanNoGoAssessment?.decision!=="no_go"&&review&&surface&&
      reviewedOptOutPolicyRedirect(review.documentUrl,surface.redirectChain??[],bundle.startedAt);
    const redirectedCookie=redirect&&bundle.normalizedUrl===redirect.targetUrl&&url===redirect.finalUrl&&doc.requestedUrl===surface?.url&&
      JSON.stringify(doc.redirectChain)===JSON.stringify(surface?.redirectChain)&&
      surface?.surfaceType==="cookie_policy"&&surface.linkSourcePageUrl===review?.documentUrl&&surface.clickable===true&&
      surface.directlyLinkedFromScannedPage===true&&!surface.parentObservationId&&!surface.traversalDepth&&
      surface.httpStatus===200&&surface.documentLanguage==="en-gb"&&surface.documentTextCoverage?.status==="complete"&&
      bundle.policySurfaceObservations.filter(s=>s.observationId===surface.observationId).length===1;
    const text=evidence?.texts.find(t=>t.observationId===doc.observationId)?.text;
    const parentSurface=surface?.parentObservationId?bundle.policySurfaceObservations.find(s=>s.observationId===surface.parentObservationId):undefined;
    const parentUrl=parentSurface?.finalUrl;
    const linked=surface?.targetRelationship==="target_controller"&&surface.ownershipConfidence!==undefined&&surface.ownershipConfidence>=0.9&&
      sameObservedProperty(url,bundle.normalizedUrl)&&
      surface.documentLanguage?.split("-")[0]==="es"&&surface.traversalDepth===1&&surface.directlyLinkedFromScannedPage===false&&
      parentSurface?.targetRelationship==="target_controller"&&parentSurface.directlyLinkedFromScannedPage===true&&!parentSurface.parentObservationId&&
      parentSurface.status==="fetched"&&parentSurface.documentRole==="policy_document"&&parentUrl===surface.linkSourcePageUrl&&parentUrl===surface.parentSurfaceUrl&&
      review?.contractVersion==="certscore.california-privacy-review.v10"&&review.reviewCoverage.sourceDocuments.some(s=>s.evidenceRef===`policy-text:${parentSurface.observationId}`&&s.url===parentUrl)&&
      text&&matchScopedOptOutInstructions(text.slice(Math.max(0,text.indexOf("Sus opciones de privacidad")-160),text.indexOf("Sus opciones de privacidad")+150),"",true)?.scope==="localized_page";
    const observedOrigin=surface?.directlyLinkedFromScannedPage===true&&!surface.parentObservationId&&!surface.traversalDepth&&(!surface.linkSourcePageUrl||surface.linkSourcePageUrl===review?.documentUrl)||
      surface?.traversalDepth===1&&parentSurface?.status==="fetched"&&parentSurface.directlyLinkedFromScannedPage===true&&parentSurface.linkObservationState==="observed"&&
      parentSurface.finalUrl===surface.linkSourcePageUrl&&parentSurface.finalUrl===surface.parentSurfaceUrl&&review?.contractVersion==="certscore.california-privacy-review.v10"&&
      review.reviewCoverage.sourceDocuments.some(d=>d.evidenceRef===`policy-text:${parentSurface.observationId}`);
    const owned=observedOrigin&&review?.contractVersion==="certscore.california-privacy-review.v10"&&surface&&surface.governingPolicySelection?.state!=="ineligible"&&
      ["target_controller","first_party_brand"].includes(surface.targetRelationship??"")&&(surface.ownershipConfidence??0)>=0.9&&
      sameObservedProperty(url,review.documentUrl)&&["privacy_policy","california_notice","cookie_policy"].includes(surface.surfaceType)&&
      doc.extractionStatus==="complete";
    const positiveCookie=owned&&surface?.surfaceType==="cookie_policy"||redirectedCookie;
    // This projection's unavailable state conflates text extraction with
    // ownership. Accept only that exact ownership limitation for the grant;
    // never repair the stored state or overlook other extraction failures.
    const completeRedirectText=redirectedCookie&&doc.extractionStatus==="unavailable"&&
      doc.limitationKeys.every(key=>key==="policy_document_target_ownership_unverified");
    if((!owner&&!linked&&!owned&&!redirectedCookie)||!surface||surface.translationApplied||surface.status!=="fetched"||surface.finalUrl!==url||
      surface.documentEvaluationState!=="usable"||!positiveCookie&&surface.documentRole!=="policy_document"||
      surface.linkObservationState!=="observed"||!["footer_link","header_link","page_text_link"].includes(surface.discoveryMethod)||
      !surface.retrievedAt||Date.parse(surface.retrievedAt)<Date.parse(bundle.startedAt)||Date.parse(surface.retrievedAt)>Date.parse(bundle.completedAt)||
      doc.artifactVerificationStatus!=="verified"||doc.documentFetchState!=="fetched"||doc.documentEvaluationState!=="usable"||!positiveCookie&&doc.documentRole!=="policy_document"||
      !owner&&doc.extractionStatus!=="complete"&&!completeRedirectText||doc.documentTextCoverage.status!=="complete"||!text||text.length>160000||text.length!==doc.retainedTextChars||
      doc.documentTextCoverage.retainedTextChars!==text.length||doc.documentTextCoverage.sourceTextChars!==text.length||doc.retainedTextSha256!==doc.artifactSha256||
      createHash("sha256").update(text).digest("hex")!==doc.retainedTextSha256)return [];
    const parent=surface.parentObservationId?bundle.policySurfaceObservations.find(s=>s.observationId===surface.parentObservationId):undefined;
    const direct=surface.directlyLinkedFromScannedPage===true&&!surface.parentObservationId&&!surface.traversalDepth&&(!surface.linkSourcePageUrl||surface.linkSourcePageUrl===bundle.normalizedUrl);
    const indexed=surface.traversalDepth===1&&surface.directlyLinkedFromScannedPage===false&&parent?.directlyLinkedFromScannedPage===true&&
      parent.linkObservationState==="observed"&&parent.documentRole==="policy_index"&&parent.status==="fetched"&&
      !parent.parentObservationId&&!parent.traversalDepth&&(!parent.linkSourcePageUrl||parent.linkSourcePageUrl===bundle.normalizedUrl)&&
      parent.retrievedAt&&Date.parse(parent.retrievedAt)>=Date.parse(bundle.startedAt)&&Date.parse(parent.retrievedAt)<=Date.parse(bundle.completedAt)&&
      parent.finalUrl===surface.linkSourcePageUrl&&surface.parentSurfaceUrl===parent.finalUrl&&parent.finalUrl&&
      reviewedOptOutPolicyIndexLink(bundle.normalizedUrl,parent.finalUrl,parent.linkText??"","footer")&&
      new URL(parent.finalUrl).origin===new URL(url).origin;
    if(!owned&&!linked&&!direct&&!indexed&&!redirectedCookie)return [];
    return [{evidenceRef:`policy-text:${doc.observationId}`,textSha256:doc.retainedTextSha256!,url,text,
      sourceBinding:redirectedCookie?{kind:"reviewed_policy_redirect" as const,relationshipId:redirect!.id,requestedUrl:redirect!.requestedUrl,surfaceEvidenceRef:`policy-surface:${doc.observationId}`,observedAt:surface.retrievedAt}:owner?{kind:"reviewed_owner_policy" as const,relationshipId:owner.id,surfaceEvidenceRef:`policy-surface:${doc.observationId}`,observedAt:surface.retrievedAt}:linked?{kind:"linked_policy_page" as const,surfaceEvidenceRef:`policy-surface:${doc.observationId}`,parentEvidenceRef:`policy-text:${parentSurface!.observationId}`,observedAt:surface.retrievedAt}:{kind:"owned_policy_surface" as const,surfaceEvidenceRef:`policy-surface:${doc.observationId}`,observedAt:surface.retrievedAt}}];
  });
}

function policySignal(review:CaliforniaPrivacyReview,document:BoundDocument,excerpt:string,start:number,contextStart=start,explicitContext?:{excerpt:string;start:number;end:number}){
  if(excerpt.length>480)return undefined;
  const legacy=optOutInstructionLabel(excerpt,"sale_sharing_opt_out_signal.v2"),context=explicitContext?.excerpt??document.text.slice(contextStart,start).trimEnd();
  const ukCookieRefusal=document.sourceBinding?.kind==="reviewed_policy_redirect";
  const scoped=matchScopedOptOutInstructions(excerpt,context,true),reviewed=matchReviewedOptOutRoute(excerpt,context,true,true,ukCookieRefusal);if(!legacy&&!scoped&&!reviewed)return undefined;
  const matched=scoped??reviewed!;
  const template=reviewed&&'evidenceLimitations'in reviewed?/\(COMPANY NAME\)/.exec(document.text):null;
  const quality=reviewed&&'evidenceLimitations'in reviewed?{evidenceLimitations:[...reviewed.evidenceLimitations,...(template?['template_wording_retained' as const]:[])],
    ...(template?{sourceQualityPassage:{evidenceRef:document.evidenceRef,textSha256:document.textSha256,start:template.index,end:template.index+template[0].length,excerpt:template[0]}}:{})}:{};
  const parsed=optOutPresenceSignalSchema.safeParse({...quality,version:ukCookieRefusal?"sale_sharing_opt_out_signal.v8":"sale_sharing_opt_out_signal.v7",scanId:review.scanId,documentUrl:review.documentUrl,
    sourceHash:review.sourceHash,state:"observed",basis:"specific_policy_opt_out_instructions",confidence:"signal",effectiveness:"not_verified",
    label:legacy??matched.label,scope:legacy?"named_route":matched.scope,scopeLabel:legacy?"Named sale/sharing opt-out route":matched.scopeLabel,
    sourceDocumentUrl:document.url,sourceBinding:document.sourceBinding,
    passage:{evidenceRef:document.evidenceRef,textSha256:document.textSha256,start,end:start+excerpt.length,excerpt},
    ...(!legacy&&matched.scope!=="named_route"&&context?{contextPassage:{evidenceRef:document.evidenceRef,textSha256:document.textSha256,start:explicitContext?.start??contextStart,end:explicitContext?.end??contextStart+context.length,excerpt:context}}:{})});
  return parsed.success?parsed.data:undefined;
}
/** Reuse verified policy text. Special URL/flattened-footer windows share the
 * existing 256-candidate, eight-document, 160k-character and 2 KiB caps. */
export function projectOptOutPresenceSignal(review:CaliforniaPrivacyReview,documents:CaliforniaPolicyDocument[],reviewedDocuments:BoundDocument[]=[]){
  if(review.contractVersion!=="certscore.california-privacy-review.v10")return undefined;
  const inputs:BoundDocument[]=[...documents,...reviewedDocuments].filter((d,i,all)=>all.findIndex(p=>p.evidenceRef===d.evidenceRef)===i).slice(0,8);
  for(const document of inputs){
    const source=review.reviewCoverage.sourceDocuments.find(s=>s.evidenceRef===document.evidenceRef&&s.sha256===document.textSha256);
    if(!source&&!document.sourceBinding||document.text.length>160000||createHash("sha256").update(document.text).digest("hex")!==document.textSha256)continue;
    let inspected=0;
    for(const candidate of reviewedOptOutRouteCandidates(document.text,true,true,document.sourceBinding?.kind==="reviewed_policy_redirect")){
      if(++inspected>256)break;
      const found=policySignal(review,document,candidate.excerpt,candidate.start,candidate.start,candidate.context);if(found)return found;
    }
    const google=/Wenn Sie über einen Google-Account verfügen, können Sie der personalisierten Werbung unter folgendem Link widersprechen:\s*https:\/\/adssettings\.google\.com\/anonymous\?hl=de/i.exec(document.text);
    if(google){inspected++;const found=policySignal(review,document,google[0],google.index,Math.max(0,google.index-480));if(found)return found;}
    const footer=document.text.indexOf("Sus opciones de privacidad");
    if(footer>=0){inspected++;const start=Math.max(0,footer-160),excerpt=document.text.slice(start,footer+150);const found=policySignal(review,document,excerpt,start);if(found)return found;}
    const prior:Array<{start:number;end:number}>=[];
    for(const match of document.text.matchAll(/[^.!?\n]+[.!?]?/g)){
      if(++inspected>256)break;
      const excerpt=match[0].trim(),start=match.index!+match[0].indexOf(excerpt);
      const preceding=prior.filter(p=>p.end<=start&&start-p.start<=480);
      const found=policySignal(review,document,excerpt,start,preceding[0]?.start??start);
      prior.push({start,end:start+excerpt.length});if(prior.length>4)prior.shift();
      if(found)return found;
    }
  }
  return undefined;
}

/** A verified bundle owns this observation; never borrow a runtime loader for
 * an independently captured consent DOM, or turn a positive into absence. */
export function projectDomOptOutPresenceSignal(review:CaliforniaPrivacyReview,bundle:CanonicalEvidenceBundle,sourceHash:string){
  if(review.contractVersion!=="certscore.california-privacy-review.v10"||review.scanId!==bundle.scanId||review.sourceHash!==sourceHash||
    bundle.scanNoGoAssessment?.decision==="no_go")return undefined;
  for(const snapshot of bundle.domSnapshots.slice(0,4)){
    const parsed=domOptOutLabelSchema.safeParse(snapshot.optOutLabel);if(!parsed.success)continue;const o=parsed.data;
    if(snapshot.consentStateAtTime!=="pre_consent"||snapshot.artifactId!==o.artifactId||snapshot.url!==o.documentUrl||snapshot.capturedAtMs!==o.capturedAtMs||
      snapshot.documentIdentity?.source!=="cdp_loader_id"||snapshot.documentIdentity.token!==o.documentToken||
      o.capturedAtMs>Date.parse(bundle.completedAt)-Date.parse(bundle.startedAt)||
      !sameObservedProperty(snapshot.url,review.documentUrl)||
      bundle.domSnapshots.filter(d=>d.artifactId===o.artifactId).length!==1)continue;
    const result=optOutPresenceSignalSchema.safeParse({version:"sale_sharing_opt_out_signal.v7",scanId:review.scanId,documentUrl:review.documentUrl,sourceHash,
      state:"observed",basis:"visible_dom_opt_out_label",confidence:"signal",effectiveness:"not_verified",label:o.label,
      scope:o.scope??"observed_page",scopeLabel:o.scopeLabel??"Observed page only",sourceDocumentUrl:o.documentUrl,passage:o.passage,contextPassage:o.contextPassage,
      sourceBinding:{kind:"dom_snapshot",artifactId:o.artifactId,documentToken:o.documentToken,capturedAtMs:o.capturedAtMs,
        observedAt:new Date(Date.parse(bundle.startedAt)+o.capturedAtMs).toISOString()}});
    if(result.success)return result.data;
  }
  return undefined;
}
