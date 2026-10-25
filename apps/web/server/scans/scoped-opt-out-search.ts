import {createHash} from 'node:crypto';
import {projectRuntimeOptOutSearch} from './runtime-opt-out-search';
import {domOptOutSearchSchema,scopedOptOutSearchSchema,scopedOptOutSearchLimitations,scopedBodySearchLimitations,scopedBodyInspectionEligible,isCurrentCaliforniaChoiceInspection,saleSharingPresenceLinks,type CaliforniaPolicyDocument,type CaliforniaPrivacyReview,type CanonicalEvidenceBundle,type ScopedOptOutSearch} from '@certscore/contracts';

/** Only specific unresolved advertising/sale-choice hints block the scoped
 * observation. Generic cookie settings, email unsubscribe and analytics do not. */
function unresolvedChoice(text:string){
 return /(?:opt[ -]?out[^.!?\n]{0,220}(?:advertis|profiling|sell|selling|sale|sharing)|(?:advertis|profiling|sale|sharing)[^.!?\n]{0,220}opt[ -]?out|Your (?:California )?Privacy Choices[^.!?\n]{0,180}(?:opt[ -]?out|sell|shar)|opt[ -]?out preference signal|Global Privacy Control|行動ターゲティング広告[^。]{0,220}オプトアウト)/i.test(text);
}
/** Reuse source-bound typed observations. No policy retrieval or broader absence inference. */
export function projectScopedOptOutSearch(review:CaliforniaPrivacyReview,bundle:CanonicalEvidenceBundle,documents:CaliforniaPolicyDocument[]):ScopedOptOutSearch|undefined{
 if(review.contractVersion!=='certscore.california-privacy-review.v10'||review.scanId!==bundle.scanId||bundle.scanNoGoAssessment?.decision==='no_go'||
   review.optOutPresenceSignal||review.policyChoiceMethods?.methods.length||saleSharingPresenceLinks(review.choicePresence).length||review.controls.length||review.controlsTruncated)return;
 const i=review.inspection;
 const originalInspectionUsable=Boolean(isCurrentCaliforniaChoiceInspection(i)&&i&&i.documentStable&&i.representativeDocument&&i.supportedDocumentLanguage&&!i.candidateEnumerationTruncated&&i.namedChoiceCandidateCount===0&&(!('documentReadyState'in i)||i.documentReadyState!=='loading'));
 const ownBodyEligible=(!i||isCurrentCaliforniaChoiceInspection(i))&&scopedBodyInspectionEligible(i);
 // Search only the already-verified, bounded documents. Missing policies are a
 // disclosed limit; an unresolved specific choice is not a negative observation.
 const inspected=documents.slice(0,8);
 for(const d of inspected)if(d.text.length>160000||createHash('sha256').update(d.text).digest('hex')!==d.textSha256||unresolvedChoice(d.text))return;
 const runtime=projectRuntimeOptOutSearch(review,bundle,inspected.length);if(runtime)return runtime;
 if(!originalInspectionUsable&&!ownBodyEligible)return;
 for(const s of bundle.domSnapshots.slice(0,4)){
  const p=domOptOutSearchSchema.safeParse(s.optOutSearch);if(!p.success)continue;const o=p.data;
  if(o.version==='dom_opt_out_search.v3')continue;
  if(o.result!=='no_qualifying_signal'||o.truncated||s.consentStateAtTime!=='pre_consent'||s.url!==review.documentUrl||o.documentUrl!==s.url||
    s.artifactId!==o.artifactId||s.documentIdentity?.source!=='cdp_loader_id'||s.documentIdentity.token!==o.documentToken||
    s.capturedAtMs!==o.capturedAtMs||o.capturedAtMs>Date.parse(bundle.completedAt)-Date.parse(bundle.startedAt)||
    bundle.domSnapshots.filter(d=>d.artifactId===s.artifactId).length!==1)continue;
  const common={artifactId:o.artifactId,documentToken:o.documentToken,textSha256:o.textSha256,capturedAtMs:o.capturedAtMs,inspectedPolicyCount:inspected.length};
  if(originalInspectionUsable&&i)return scopedOptOutSearchSchema.parse({...common,version:'sale_sharing_opt_out_scoped_search.v1',scope:'captured_starting_page',inspectionSourceHash:i.sourceHash,
    limitations:scopedOptOutSearchLimitations(i,review.reviewCoverage.captureCoverage.policyTextComplete)});
  if(!ownBodyEligible||o.version!=='dom_opt_out_search.v2'||o.bodyUsability!=='substantive_public_page')continue;
  const checkpoint=(bundle.consentUiObservations??[]).slice(0,4).find(c=>c.observationId==='consent_ui_pre_consent'&&
    c.documentUrl===s.url&&c.documentIdentity?.source==='cdp_loader_id'&&c.documentIdentity.token===o.documentToken&&
    c.documentReadyState&&c.documentReadyState!=='loading'&&c.layerInspected==='first_layer'&&c.captureStatus==='no_evidence'&&
    ['complete_empty','partial','frame_inaccessible'].includes(c.inventoryOutcome??'')&&!c.controls?.length&&!c.visibleChoiceLabels?.length&&
    c.captureDiagnostics?.completedChannels.includes('dom_inventory')&&!c.captureDiagnostics.failedChannels.length&&!c.captureDiagnostics.timedOutChannels.length&&
    c.observedAtMs>=0&&c.observedAtMs<=Date.parse(bundle.completedAt)-Date.parse(bundle.startedAt)&&
    bundle.consentUiObservations.filter(other=>other.observationId===c.observationId).length===1);
  if(!checkpoint)continue;
  const proof=scopedOptOutSearchSchema.safeParse({...common,version:'sale_sharing_opt_out_scoped_search.v2',scope:'captured_main_document_text',
    bodyUsability:o.bodyUsability,inspectionSourceHash:i?.sourceHash,
    limitations:scopedBodySearchLimitations(i,review.reviewCoverage.captureCoverage.policyTextComplete,checkpoint.inventoryOutcome!),
    checkpoint:{observationId:checkpoint.observationId,documentUrl:checkpoint.documentUrl,documentToken:checkpoint.documentIdentity!.token,
      observedAtMs:checkpoint.observedAtMs,documentReadyState:checkpoint.documentReadyState,inventoryOutcome:checkpoint.inventoryOutcome}});
  if(proof.success)return proof.data;
 }
}
