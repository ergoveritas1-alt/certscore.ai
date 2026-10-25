import {californiaSignalDisclosureCandidateCount,isCurrentCaliforniaChoiceInspection,saleSharingPresenceLinks,type CaliforniaPolicyDocument,type CaliforniaPrivacyReview} from '@certscore/contracts';
import {createHash} from 'node:crypto';
/** A new broad negative needs complete original page and governing-policy
 * coverage. DNT is not GPC, but either possible alternative blocks absence. */
export function projectOptOutNegativeSearch(review:CaliforniaPrivacyReview,documents:Array<CaliforniaPolicyDocument&{language?:string}>){
 if(review.contractVersion!=='certscore.california-privacy-review.v10'||review.choiceSurface!=='not_observed_in_inspected_scope'||
   !isCurrentCaliforniaChoiceInspection(review.inspection)||review.inspection?.coverage!=='complete'||review.controlsTruncated||
   review.controls.length||review.optOutPresenceSignal||review.policyChoiceMethods||saleSharingPresenceLinks(review.choicePresence).length||
   !review.reviewCoverage.captureCoverage.policyTextComplete||!documents.length||documents.length>8||
   new Set(documents.map(d=>d.evidenceRef)).size!==documents.length||documents.length!==review.reviewCoverage.sourceDocuments.length)return undefined;
 for(const d of documents){
  const source=review.reviewCoverage.sourceDocuments.find(s=>s.evidenceRef===d.evidenceRef&&s.sha256===d.textSha256&&s.complete);
  if(!source||d.language?.toLowerCase().split('-')[0]!=='en'||d.text.length>160000||createHash('sha256').update(d.text).digest('hex')!==d.textSha256||
    californiaSignalDisclosureCandidateCount([d.text])||
    /opt[ -]?out|(?:privacy|cookie) (?:choices|settings|preferences)|browser signal|ad choices|personali[sz]ed advertising|targeted advertising|do not (?:sell|share).{0,25}\bmy\b/i.test(d.text))return undefined;
  let sentences=0;for(const _ of d.text.matchAll(/[^.!?\n]+[.!?]?/g))if(++sentences>256)return undefined;
 }
 return {version:'sale_sharing_opt_out_negative_search.v2' as const,scope:'starting_page_and_retained_policies' as const,
   inspectedPolicyCount:documents.length,inspectionSourceHash:review.inspection.sourceHash};
}
