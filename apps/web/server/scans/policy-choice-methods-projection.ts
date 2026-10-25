import {createHash} from "node:crypto";
import {classifyPrivacySurface,policyChoiceMethodsSchema,reviewedOptOutPolicyOwner,type CanonicalEvidenceBundle} from "@certscore/contracts";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function displayUrl(value:string|undefined){
  try {const url=new URL(value??"");
    if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return undefined;
    url.search="";url.hash="";return url.href.length<=800?url.href:undefined;
  } catch {return undefined;}
}

/** Materialization only, after canonical bundle verification. This records a
 * labeled policy-page method, never homepage availability or sale/sharing scope. */
export function projectPolicyChoiceMethods(bundle:CanonicalEvidenceBundle,source:{sha256?:string;verificationStatus?:string}|undefined,documentUrl:string){
  if(source?.verificationStatus!=="verified"||!source.sha256||bundle.scanNoGoAssessment?.decision==="no_go")return undefined;
  const start=Date.parse(bundle.startedAt),end=Date.parse(bundle.completedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return undefined;
  const surfaces=bundle.policySurfaceObservations;
  const methods=[];
  for(const link of surfaces){
    if(methods.length===4)break;
    if(link.linkObservationState!=="observed"||link.discoveryMethod!=="page_text_link"||link.traversalDepth!==1||
       !link.parentObservationId||!link.linkSourcePageUrl||link.directlyLinkedFromScannedPage!==false||
       link.clickable!==true||link.linkVisibility==="hidden"||link.classifierProvenance!=="privacy_surface_classifier.v1"||
       !link.url?.trim()||/^(?:#|javascript:|data:|about:)/i.test(link.url.trim())||link.translationApplied===true||
       !link.linkText||link.linkText.length>200||!link.observationId||link.observationId.length>220)continue;
    const kind=classifyPrivacySurface({linkText:link.linkText}).surfaceType;
    if(!["do_not_sell_or_share","your_privacy_choices"].includes(kind)||kind!==link.surfaceType)continue;
    if(surfaces.filter(row=>row.observationId===link.observationId).length!==1)continue;
    const parents=surfaces.filter(row=>row.observationId===link.parentObservationId);
    const parent=parents.length===1?parents[0]:undefined;
    const reviewedOwner=parent?.finalUrl&&parent.retrievedAt?reviewedOptOutPolicyOwner(documentUrl,parent.finalUrl,parent.retrievedAt):undefined;
    if(!parent||!["privacy_policy","california_notice"].includes(parent.surfaceType)||parent.status!=="fetched"||
       parent.documentEvaluationState!=="usable"||parent.documentRole!=="policy_document"||parent.translationApplied===true||
       !["target_controller","first_party_brand"].includes(parent.targetRelationship??"")&&!reviewedOwner||
       parent.linkObservationState!=="observed"||parent.directlyLinkedFromScannedPage!==true||
       parent.parentObservationId||parent.traversalDepth||
       !["footer_link","header_link","page_text_link"].includes(parent.discoveryMethod)||
       (parent.linkSourcePageUrl!==undefined&&parent.linkSourcePageUrl!==documentUrl)||
       parent.finalUrl!==link.linkSourcePageUrl||link.parentSurfaceUrl!==parent.finalUrl||
       parent.finalUrl===documentUrl||!parent.textExcerpt?.includes(link.linkText)||
       !parent.retrievedAt||Date.parse(parent.retrievedAt)<start||Date.parse(parent.retrievedAt)>end||!Number.isFinite(Date.parse(parent.retrievedAt)))continue;
    const sourceDocumentUrl=displayUrl(parent.finalUrl);
    if(!sourceDocumentUrl)continue;
    let method:"email"|"web_link"="web_link",destination:string|undefined;
    try {const url=new URL(link.url??"",parent.finalUrl);
      if(url.protocol==="mailto:"){method="email";destination=`mailto:${url.pathname}`;}
      else destination=displayUrl(url.href);
    }catch{continue;}
    if(!destination)continue;
    const row={label:link.linkText,kind:kind as "do_not_sell_or_share"|"your_privacy_choices",method,destination,
      sourceDocumentUrl,sourceDocumentUrlSha256:hash(parent.finalUrl!),evidenceRef:`policy-surface:${link.observationId}`,
      parentEvidenceRef:`policy-surface:${parent.observationId}`,...(reviewedOwner?{ownerBinding:{relationshipId:reviewedOwner.id,observedAt:parent.retrievedAt!}}:{})};
    const candidate={version:reviewedOwner||methods.some(m=>m.ownerBinding)?"policy_choice_methods.v2":"policy_choice_methods.v1",scanId:bundle.scanId,reportDocumentUrl:documentUrl,sourceBundleSha256:source.sha256,scope:"linked_policy_document",
      homepagePresence:"not_established",saleSharingScope:"not_assessed",effectiveness:"not_verified",methods:[...methods,row]};
    if(policyChoiceMethodsSchema.safeParse(candidate).success)methods.push(row);
  }
  const parsed=policyChoiceMethodsSchema.safeParse({version:methods.some(m=>m.ownerBinding)?"policy_choice_methods.v2":"policy_choice_methods.v1",scanId:bundle.scanId,reportDocumentUrl:documentUrl,sourceBundleSha256:source.sha256,
    scope:"linked_policy_document",homepagePresence:"not_established",saleSharingScope:"not_assessed",effectiveness:"not_verified",methods});
  return parsed.success?parsed.data:undefined;
}
