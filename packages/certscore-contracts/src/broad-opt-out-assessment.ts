import {z} from 'zod';
import {SCOPED_OPT_OUT_LIMITATIONS,BODY_OPT_OUT_LIMITATIONS,RUNTIME_OPT_OUT_LIMITATIONS} from './scoped-opt-out-search';
import {saleSharingPresenceLinks} from './privacy-choice-presence';
import type {CaliforniaPrivacyReview} from './california-privacy-review';
export const BROAD_OPT_OUT_FINDING_ID='california_sale_sharing_opt_out_assessment';
const base={scanId:z.string().min(1).max(160),documentUrl:z.string().url().max(800),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
 state:z.enum(['observed','not_observed','unknown']),evidenceRefs:z.array(z.string().min(1).max(240)).max(4)};
export const broadOptOutAssessmentSchema=z.discriminatedUnion('version',[
 z.object({...base,version:z.literal('sale_sharing_opt_out_assessment.v1'),basis:z.enum(['specific_signal','complete_negative_search','insufficient_evidence'])}).strict(),
 z.object({...base,version:z.literal('sale_sharing_opt_out_assessment.v2'),basis:z.enum(['specific_signal','complete_negative_search','scoped_negative_search','insufficient_evidence']),
  limitations:z.array(z.enum(SCOPED_OPT_OUT_LIMITATIONS)).max(5).optional(),
 }).strict(),
 z.object({...base,version:z.literal('sale_sharing_opt_out_assessment.v3'),basis:z.enum(['specific_signal','complete_negative_search','scoped_negative_search','insufficient_evidence']),
  scope:z.enum(['captured_starting_page','captured_main_document_text']).optional(),limitations:z.array(z.enum(BODY_OPT_OUT_LIMITATIONS)).max(11).optional(),
 }).strict(),
 z.object({...base,version:z.literal('sale_sharing_opt_out_assessment.v4'),basis:z.enum(['specific_signal','complete_negative_search','scoped_negative_search','insufficient_evidence']),
  scope:z.enum(['captured_starting_page','captured_main_document_text','captured_runtime_main_document_text']).optional(),limitations:z.array(z.enum(RUNTIME_OPT_OUT_LIMITATIONS)).max(12).optional(),
 }).strict(),
]);
export type BroadOptOutAssessment=z.infer<typeof broadOptOutAssessmentSchema>;
/** New materialization only; scoped observation does not alter strict scoring proof. */
export function assessBroadOptOutPresence(review:CaliforniaPrivacyReview,requestedVersion?:BroadOptOutAssessment['version']):BroadOptOutAssessment|undefined{
 if(review.contractVersion!=='certscore.california-privacy-review.v10')return undefined;
 const version=requestedVersion??(review.scopedOptOutSearch?.version==='sale_sharing_opt_out_scoped_search.v3'?'sale_sharing_opt_out_assessment.v4':'sale_sharing_opt_out_assessment.v3');
 const links=saleSharingPresenceLinks(review.choicePresence);
 let refs=review.optOutPresenceSignal?[review.optOutPresenceSignal.passage.evidenceRef]:review.policyChoiceMethods?.methods.map(m=>m.evidenceRef)??links.map(l=>l.evidenceRef);
 const positive=Boolean(review.optOutPresenceSignal||review.policyChoiceMethods?.methods.length||links.length);
 const negative=review.optOutNegativeSearch?.version==='sale_sharing_opt_out_negative_search.v2';
 const scoped=version==='sale_sharing_opt_out_assessment.v4'?review.scopedOptOutSearch:version==='sale_sharing_opt_out_assessment.v3'&&review.scopedOptOutSearch?.version!=='sale_sharing_opt_out_scoped_search.v3'?review.scopedOptOutSearch:version==='sale_sharing_opt_out_assessment.v2'&&review.scopedOptOutSearch?.version==='sale_sharing_opt_out_scoped_search.v1'?review.scopedOptOutSearch:undefined;
 if(!positive&&!negative&&scoped)refs=[`dom-text:${scoped.artifactId}`,...(version==='sale_sharing_opt_out_assessment.v3'&&scoped.version==='sale_sharing_opt_out_scoped_search.v2'?[`consent-ui:${scoped.checkpoint.observationId}`]:[])];
 if(!positive&&!negative&&scoped?.version==='sale_sharing_opt_out_scoped_search.v3')refs=[`runtime-dom-text:${scoped.artifactId}`,`dom-text:${scoped.consentCapture.artifactId}`,`consent-ui:${scoped.consentCapture.observationId}`];
 return broadOptOutAssessmentSchema.parse({version,scanId:review.scanId,documentUrl:review.documentUrl,sourceHash:review.sourceHash,
  state:positive?'observed':negative||scoped?'not_observed':'unknown',basis:positive?'specific_signal':negative?'complete_negative_search':scoped?'scoped_negative_search':'insufficient_evidence',
  ...(!positive&&!negative&&scoped?{limitations:scoped.limitations,...(version==='sale_sharing_opt_out_assessment.v3'||version==='sale_sharing_opt_out_assessment.v4'?{scope:scoped.scope}:{})}:{}),evidenceRefs:refs.slice(0,4)});
}
