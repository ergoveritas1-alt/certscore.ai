import {z} from 'zod';

/** Stable terminal-gate codes. Counts are inspected-source events, not failures
 * of an opt-out action. Samples address the original source artifact by index. */
export const OPT_OUT_REJECTION_REASONS=[
 'no_opt_out_candidate_in_inspected_source','observation_document_identity_missing','observation_not_first_layer',
 'control_not_visible','control_visibility_unverified','control_not_first_layer',
 'observation_document_not_target','local_consent_context_missing','element_type_not_supported',
 'link_route_not_eligible','label_not_direct_opt_out','no_recipe_for_entrance_label',
 'selector_not_supported_by_matching_recipe','multiple_distinct_supported_candidates',
] as const;
export const OPT_OUT_BINDING_FAILURES={
 bound_controls_disabled:1,native_opt_out_binding_missing:2,binding_document_mismatch:4,
 binding_identity_mismatch:8,binding_label_mismatch:16,binding_selector_mismatch:32,
 binding_element_type_unsupported:64,box_model_visibility_unverified:128,
} as const;
/** [version, bound-controls mode, inspected observations, inspected controls,
 * truncation bits (observations=1, controls=2, samples=4), reason counts, samples]
 * Sample: [observation index, control index, terminal reason index, binding mask].
 * -1 addresses an observation/global event. Never retain labels, URLs or selectors. */
export const optOutDispatchRejectionSchema=z.tuple([
 z.literal(1),z.union([z.literal(0),z.literal(1)]),z.number().int().min(0).max(32),
 z.number().int().min(0).max(4096),z.number().int().min(0).max(7),
 z.array(z.number().int().min(0).max(4096)).length(OPT_OUT_REJECTION_REASONS.length),
 z.array(z.tuple([z.number().int().min(-1).max(31),z.number().int().min(-1).max(127),
  z.number().int().min(0).max(OPT_OUT_REJECTION_REASONS.length-1),z.number().int().min(0).max(255)])).max(8),
]).superRefine((v,ctx)=>{
 const seen=new Set<string>();
 for(const [o,c,reason,mask] of v[6]){
  const global=reason===0||reason===13,observation=reason===1||reason===2;
  const id=`${o}/${c}`;
  if(!v[5][reason]||seen.has(id)||o>=v[2]||
   (global?(o!==-1||c!==-1):observation?(o<0||c!==-1):(o<0||c<0))||
   ((global||observation||reason<6)&&mask!==0))ctx.addIssue({code:'custom',message:'Invalid rejection sample binding.'});
  seen.add(id);
 }
 if(JSON.stringify(v).length>512)ctx.addIssue({code:'custom',message:'Rejection receipt exceeds 512 bytes.'});
});
export type OptOutDispatchRejection=z.infer<typeof optOutDispatchRejectionSchema>;
