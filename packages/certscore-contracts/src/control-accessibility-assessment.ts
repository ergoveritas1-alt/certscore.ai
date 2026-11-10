import {z} from 'zod';

export const CONTROL_ACCESSIBILITY_RULES = ['button-name','input-button-name','link-name','aria-command-name',
  'aria-input-field-name','aria-toggle-field-name','aria-hidden-focus','label','nested-interactive','color-contrast',
  'aria-allowed-attr','aria-valid-attr-value','aria-required-attr','aria-roles'] as const;
export const CONTROL_ACCESSIBILITY_REASONS = ['no_eligible_control','candidate_limit','control_limit','control_changed',
  'control_results_missing','rules_need_review','frames_outside_scope','audit_timeout','cancelled','document_unavailable',
  'document_changed','engine_identity_mismatch','audit_execution_failed','engine_injection_failed','evidence_size_limit',
  'evidence_binding_invalid','frames_changed','frames_unavailable','rule_limit','discovery_limit'] as const;
export const controlAccessibilityAssessmentSchema = z.object({
  version:z.literal('same_document_controls.v1'),
  scope:z.literal('visible_main_document_and_open_shadow_controls'),
  status:z.enum(['completed','partial','unavailable','no_controls']),
  reasons:z.array(z.enum(CONTROL_ACCESSIBILITY_REASONS)).max(CONTROL_ACCESSIBILITY_REASONS.length),
  controls:z.array(z.object({
    id:z.number().int().min(1).max(48), intent:z.enum(['accept','reject','options','privacy_opt_out','unclassified']),
    binding:z.enum(['stable','changed']),
    required:z.array(z.enum(CONTROL_ACCESSIBILITY_RULES)).min(1).max(CONTROL_ACCESSIBILITY_RULES.length),
    checks:z.array(z.tuple([z.enum(CONTROL_ACCESSIBILITY_RULES),z.enum(['pass','fail','review'])])).max(CONTROL_ACCESSIBILITY_RULES.length),
    complete:z.boolean(),
  }).strict()).max(8),
}).strict().superRefine((a,ctx)=>{
  const bad=(message:string)=>ctx.addIssue({code:'custom',message});
  if(new Set(a.reasons).size!==a.reasons.length||new Set(a.controls.map(c=>c.id)).size!==a.controls.length)bad('Duplicate control or reason');
  for(const c of a.controls){
    if(!c.required.includes('nested-interactive')||new Set(c.required).size!==c.required.length)bad('Invalid required control checks');
    if(new Set(c.checks.map(([r])=>r)).size!==c.checks.length)bad('Duplicate control check');
    if(c.binding==='changed'&&(c.checks.length||c.complete))bad('Changed controls cannot supply results');
    if(c.complete&&(!c.required.every(r=>c.checks.some(([id,s])=>id===r&&s!=='review'))||c.checks.some(([,s])=>s==='review')))bad('Complete controls require conclusive checks');
  }
  if(a.status==='completed'&&(!a.controls.length||a.reasons.length||a.controls.some(c=>!c.complete)))bad('Incomplete control coverage');
  if(a.status==='no_controls'&&(a.controls.length||!a.reasons.includes('no_eligible_control')))bad('Invalid empty control assessment');
  if(a.status==='unavailable'&&(a.controls.length||!a.reasons.length))bad('Unavailable assessment cannot supply controls');
  if(a.status==='partial'&&!a.reasons.length)bad('Partial assessment needs a reason');
});
export type ControlAccessibilityAssessment=z.infer<typeof controlAccessibilityAssessmentSchema>;
/** Compact private transport, independently bound to the ready report generation. */
export function controlAccessibilityReceipt(a:ControlAccessibilityAssessment){
  return [1,a.status,a.reasons.reduce((mask,r)=>mask|2**CONTROL_ACCESSIBILITY_REASONS.indexOf(r),0),a.controls.length,
    a.controls.filter(c=>c.complete).length,a.controls.filter(c=>c.checks.some(([,s])=>s==='fail')).length,
    a.controls.filter(c=>c.checks.some(([,s])=>s==='review')).length] as const;
}
