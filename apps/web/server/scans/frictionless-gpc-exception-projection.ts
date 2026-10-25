import {deriveFrictionlessGpcContradiction} from "../../lib/scans/california-runtime-link-policy";
import {createHash} from "node:crypto";
import {FRICTIONLESS_GPC_DISCLOSURES,FRICTIONLESS_GPC_UNVERIFIED_REQUIREMENTS,frictionlessGpcExceptionSchema,isFrictionlessDisclosure,
  type CaliforniaPrivacyReview,type CaliforniaPolicyDocument} from "@certscore/contracts";

/** Retained, verified policy text only. Behavioral contradictions reuse the
 * existing canonical link proofs; silence and policy promises never prove an exception. */
export function projectFrictionlessGpcException(review:CaliforniaPrivacyReview,documents:CaliforniaPolicyDocument[],gpc?:unknown){
  const gpcContradiction=deriveFrictionlessGpcContradiction(review,gpc);
  const choice=review.contractVersion==="certscore.california-privacy-review.v10"?review.disclosureChoiceAssessment:undefined;
  const basis=gpcContradiction
    ? "qualifying_collection_under_gpc" : choice?.requiredLinkProof ? "required_signal_disclosures_missing" : "insufficient_evidence";
  const disclosures=FRICTIONLESS_GPC_DISCLOSURES.map(id=>({id,status:"not_established" as "declared"|"not_established",
    passage:undefined as {evidenceRef:string;textSha256:string;start:number;end:number;excerpt:string}|undefined}));
  for(const document of documents.slice(0,8)){
    if(document.text.length>160000||createHash("sha256").update(document.text).digest("hex")!==document.textSha256||
       review.contractVersion==="certscore.california-privacy-review.v1"||!review.reviewCoverage.sourceDocuments.some(source=>source.evidenceRef===document.evidenceRef&&source.sha256===document.textSha256))continue;
    let inspected=0;
    for(const match of document.text.matchAll(/[^.!?\n]+[.!?]?/g)){
      if(++inspected>256)break;
      const excerpt=match[0].trim();if(!excerpt||excerpt.length>240)continue;
      const start=match.index!+match[0].indexOf(excerpt);
      for(const row of disclosures){
        if(row.passage||!isFrictionlessDisclosure(row.id,excerpt))continue;
        row.status="declared";row.passage={evidenceRef:document.evidenceRef,textSha256:document.textSha256,start,end:start+excerpt.length,excerpt};
      }
    }
  }
  // This bounded evidence has no producer proof of the full statutory scope.
  // Even four positive declarations must remain unresolved without behavioral proof.
  const assessment={version:"frictionless_gpc_exception.v1",scanId:review.scanId,documentUrl:review.documentUrl,
    sourceHash:review.sourceHash,scope:"retained_website_evidence",basis,...(gpcContradiction?{gpcContradiction}:{}),
    status:basis==="insufficient_evidence"?"unresolved":"contradicted_in_assessed_scope",disclosures,
    unverifiedRequirements:FRICTIONLESS_GPC_UNVERIFIED_REQUIREMENTS};
  // Prefer the bound counterexample over optional declaration excerpts when
  // sharing the fixed metadata cap. Never discard proof to fit presentation.
  while(new TextEncoder().encode(JSON.stringify(assessment)).length>4096){
    const row=[...disclosures].reverse().find(row=>row.passage);if(!row)break;
    row.passage=undefined;row.status="not_established";
  }
  return frictionlessGpcExceptionSchema.parse(assessment);
}
