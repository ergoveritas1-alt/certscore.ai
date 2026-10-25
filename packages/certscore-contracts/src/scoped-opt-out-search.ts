import {z} from 'zod';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const GATE_RUNTIME_TEXT_TARGET='https://gate.cc/';
export const GATE_RUNTIME_TEXT_PAGE='https://celeb.gate.cc/';
export function isGateRuntimeTextTarget(targetUrl:string){return targetUrl===GATE_RUNTIME_TEXT_TARGET;}
const bodyFields={artifactId:z.string().min(1).max(160),documentUrl:z.string().url().max(800),
 documentToken:z.string().min(1).max(160),capturedAtMs:z.number().int().nonnegative(),textSha256:hash,
 textChars:z.number().int().positive().max(100000),truncated:z.boolean(),
 result:z.enum(['specific_signal','ambiguous_hint','capture_unusable','no_qualifying_signal'])};
/** v1 is historical. v2 separately retains usability for the narrower body basis. */
export const domOptOutSearchSchema=z.discriminatedUnion('version',[
 z.object({...bodyFields,version:z.literal('dom_opt_out_search.v1')}).strict(),
 z.object({...bodyFields,version:z.literal('dom_opt_out_search.v2'),bodyUsability:z.enum(['substantive_public_page','unusable_or_unverified'])}).strict(),
 z.object({...bodyFields,version:z.literal('dom_opt_out_search.v3'),sourceLane:z.literal('runtime_evidence'),targetUrl:z.literal(GATE_RUNTIME_TEXT_TARGET),
  documentUrl:z.literal(GATE_RUNTIME_TEXT_PAGE),artifactId:z.literal('dom_text_pre_consent'),documentReadyState:z.enum(['interactive','complete']),
  documentLanguage:z.string().regex(/^en(?:-[a-z]{2})?$/),
  bodyUsability:z.enum(['substantive_public_page','unusable_or_unverified'])}).strict(),
]).refine(row=>new TextEncoder().encode(JSON.stringify(row)).length<=1024,'DOM search proof exceeds 1 KiB.');
export type DomOptOutSearch=z.infer<typeof domOptOutSearchSchema>;
export const SCOPED_OPT_OUT_LIMITATIONS=['control_coverage_limited','frames_uninspected','unnamed_controls','shadow_roots_uninspected','policy_text_incomplete'] as const;
export const BODY_OPT_OUT_LIMITATIONS=[...SCOPED_OPT_OUT_LIMITATIONS,'choice_inspection_unavailable','choice_inventory_truncated','inspection_stability_limited','inspection_unrepresentative','inspection_loading','consent_checkpoint_limited'] as const;
export const RUNTIME_OPT_OUT_LIMITATIONS=[...BODY_OPT_OUT_LIMITATIONS,'separate_consent_capture_unusable'] as const;
export function scopedRuntimeTextLimitations(policyTextComplete:boolean){
 return ['control_coverage_limited',...(!policyTextComplete?['policy_text_incomplete' as const]:[]),'separate_consent_capture_unusable'] as Array<typeof RUNTIME_OPT_OUT_LIMITATIONS[number]>;
}
const scopedFields={artifactId:z.string().min(1).max(160),documentToken:z.string().min(1).max(160),
 textSha256:hash,capturedAtMs:z.number().int().nonnegative(),inspectedPolicyCount:z.number().int().min(0).max(8)};
export const scopedOptOutSearchSchema=z.discriminatedUnion('version',[
 z.object({...scopedFields,version:z.literal('sale_sharing_opt_out_scoped_search.v1'),scope:z.literal('captured_starting_page'),
  inspectionSourceHash:hash,limitations:z.array(z.enum(SCOPED_OPT_OUT_LIMITATIONS)).max(5)}).strict(),
 z.object({...scopedFields,version:z.literal('sale_sharing_opt_out_scoped_search.v2'),scope:z.literal('captured_main_document_text'),
  bodyUsability:z.literal('substantive_public_page'),inspectionSourceHash:hash.optional(),limitations:z.array(z.enum(BODY_OPT_OUT_LIMITATIONS)).max(11),
  checkpoint:z.object({observationId:z.literal('consent_ui_pre_consent'),documentUrl:z.string().url().max(800),documentToken:z.string().min(1).max(160),
   observedAtMs:z.number().int().nonnegative(),documentReadyState:z.enum(['interactive','complete']),
   inventoryOutcome:z.enum(['complete_empty','partial','frame_inaccessible'])}).strict(),
 }).strict(),
 z.object({...scopedFields,version:z.literal('sale_sharing_opt_out_scoped_search.v3'),scope:z.literal('captured_runtime_main_document_text'),
  sourceLane:z.literal('runtime_evidence'),targetUrl:z.literal(GATE_RUNTIME_TEXT_TARGET),documentUrl:z.literal(GATE_RUNTIME_TEXT_PAGE),
  bodyUsability:z.literal('substantive_public_page'),documentReadyState:z.enum(['interactive','complete']),
  documentLanguage:z.string().regex(/^en(?:-[a-z]{2})?$/),
  limitations:z.array(z.enum(RUNTIME_OPT_OUT_LIMITATIONS)).max(12),
  consentCapture:z.object({artifactId:z.literal('dom_text_pre_consent'),documentToken:z.string().min(1).max(160),textSha256:hash,capturedAtMs:z.number().int().nonnegative(),
   observationId:z.literal('consent_ui_pre_consent'),observedAtMs:z.number().int().nonnegative()}).strict(),
 }).strict(),
]).refine(row=>new TextEncoder().encode(JSON.stringify(row)).length<=2048,'Scoped search proof exceeds 2 KiB.');
export type ScopedOptOutSearch=z.infer<typeof scopedOptOutSearchSchema>;

/** Reviewed short interstitials; ordinary security prose is excluded. */
export function isOptOutSearchAccessShell(text:string){
 const body=text.replace(/\s+/g,' ').trim();
 return body.length<2500&&(
  /Performing security verification/i.test(body)&&/website verifies you are not a bot|Ray ID:/i.test(body)||
  /^TRAFFIC VERIFICATION/i.test(body)&&/verify that you are a human being/i.test(body)
 );
}

type InspectionLimits={coverage:string;uninspectedFrameCount:number;unnamedControlCount:number;uninspectedShadowRootCount:number;
 candidateEnumerationTruncated:boolean;documentStable:boolean;representativeDocument:boolean;documentReadyState?:string};
export function scopedOptOutSearchLimitations(i:Pick<InspectionLimits,'coverage'|'uninspectedFrameCount'|'unnamedControlCount'|'uninspectedShadowRootCount'>,policyTextComplete:boolean){
 const limits:Array<typeof SCOPED_OPT_OUT_LIMITATIONS[number]>=[];
 if(i.coverage!=='complete')limits.push('control_coverage_limited');
 if(i.uninspectedFrameCount)limits.push('frames_uninspected');
 if(i.unnamedControlCount)limits.push('unnamed_controls');
 if(i.uninspectedShadowRootCount)limits.push('shadow_roots_uninspected');
 if(!policyTextComplete)limits.push('policy_text_incomplete');
 return limits;
}
export function scopedBodySearchLimitations(i:InspectionLimits|null,policyTextComplete:boolean,outcome:string){
 const limits:Array<typeof BODY_OPT_OUT_LIMITATIONS[number]>=i?scopedOptOutSearchLimitations(i,policyTextComplete):['choice_inspection_unavailable',...(!policyTextComplete?['policy_text_incomplete' as const]:[])];
 if(i?.candidateEnumerationTruncated)limits.push('choice_inventory_truncated');
 if(i&&!i.documentStable)limits.push('inspection_stability_limited');
 if(i&&!i.representativeDocument)limits.push('inspection_unrepresentative');
 if(i?.documentReadyState==='loading')limits.push('inspection_loading');
 if(outcome!=='complete_empty')limits.push('consent_checkpoint_limited');
 return limits;
}

/** This is eligibility for a separately bound text observation, not an upgrade
 * of the dedicated named-choice inspection or its scoring eligibility. */
export function scopedBodyInspectionEligible(i:{namedChoiceCandidateCount:number;representativeDocument:boolean;supportedDocumentLanguage:boolean;documentReadyState?:string;limitationKeys?:string[]}|null){
 return !i||i.namedChoiceCandidateCount===0&&i.supportedDocumentLanguage&&(
  i.representativeDocument||i.documentReadyState==='loading'&&Boolean(i.limitationKeys?.includes('inventory_unavailable'))
 );
}
