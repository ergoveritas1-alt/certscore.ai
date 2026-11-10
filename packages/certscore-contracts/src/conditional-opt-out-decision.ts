import {z} from 'zod';
import {saleSharingOptOutLaneOutcomeSchema} from './sale-sharing-opt-out';
import {optOutDispatchRejectionSchema} from './opt-out-dispatch-rejection';

/** Operational dispatch facts, never evidence of action completion or honoring. */
export const conditionalOptOutDecisionSchema=z.object({
  // v2 counted only exact-target/local-action candidates. v3 counts observed
  // first-layer controls independently of whether their route is executable.
  version:z.enum(['conditional_opt_out_dispatch.v2','conditional_opt_out_dispatch.v3']),
  scanId:z.string().min(1).max(160),
  status:z.enum(['pending','skipped','dispatched']),
  reason:z.enum(['awaiting_verified_consent','worker_disabled','unsupported_or_unverified_control','ambiguous_control','target_changed','held_target','source_unverified','insufficient_remaining_time','cancelled','authorization_not_granted','supported_control']),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  observationId:z.string().min(1).max(160).optional(),
  recipeVersion:z.string().min(1).max(100).optional(),
  controlObserved:z.boolean().optional(),
  supportedRoute:z.boolean().optional(),
  decidedAtMs:z.number().int().min(0).max(600000).optional(),
  remainingTimeMs:z.number().int().min(0).max(600000).optional(),
  rejection:optOutDispatchRejectionSchema.optional(),
}).strict().superRefine((row,ctx)=>{
  if((row.controlObserved!==undefined||row.supportedRoute!==undefined)&&!row.sourceSha256 ||
    row.version==='conditional_opt_out_dispatch.v3'&&row.controlObserved===true&&!row.observationId ||
    row.supportedRoute===true&&(!row.controlObserved||!row.observationId||!row.recipeVersion) ||
    row.status==='dispatched'&&(row.reason!=='supported_control'||row.supportedRoute!==true||row.remainingTimeMs===undefined||row.remainingTimeMs<5000))
    ctx.addIssue({code:'custom',message:'Conditional dispatch facts require verified source and eligible-route proof.'});
  if(row.rejection&&(row.version!=='conditional_opt_out_dispatch.v3'||!row.sourceSha256||
    row.status!=='skipped'||row.supportedRoute!==false||
    !['unsupported_or_unverified_control','ambiguous_control'].includes(row.reason)))
    ctx.addIssue({code:'custom',message:'Rejection details require a source-bound skipped candidate decision.'});
});
export type ConditionalOptOutDecision=z.infer<typeof conditionalOptOutDecisionSchema>;

/** Caller must verify the original manifest and bundle hashes/scan identity first. */
export function retainedConditionalOptOutDecision(manifest: {privacyCaptureProfile?:unknown;conditionalOptOutDecision?:unknown}, scanId:string, lane:unknown):ConditionalOptOutDecision|undefined {
  if(manifest.privacyCaptureProfile!=='conditional_opt_out_seven_workers.v1')return undefined;
  const parsed=conditionalOptOutDecisionSchema.safeParse(manifest.conditionalOptOutDecision);
  if(!parsed.success||parsed.data.scanId!==scanId||parsed.data.status==='pending')return undefined;
  if((parsed.data.status==='dispatched')!==saleSharingOptOutLaneOutcomeSchema.safeParse(lane).success)return undefined;
  return parsed.data;
}
