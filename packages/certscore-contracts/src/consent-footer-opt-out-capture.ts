import {z} from "zod";

export const consentFooterOptOutCaptureSchema = z.object({
  version:z.literal("consent_footer_opt_out_capture.v1"), artifactId:z.literal("dom_text_pre_consent"),
  documentUrl:z.string().url().max(2000), documentToken:z.string().min(1).max(160).optional(),
  snapshotAtMs:z.number().int().nonnegative(), completedAtMs:z.number().int().nonnegative(),
  attempts:z.number().int().min(0).max(2),
  outcome:z.enum(["captured","no_budget","aborted","page_closed","source_unavailable","document_mismatch","timed_out","read_failed","invalid_packet","lane_stopped"]),
  recovery:z.enum(["none","same_document_retry","original_loader_verified","original_loader_not_verified"]),
  mismatch:z.object({stage:z.enum(["before_read","after_read"]),urlMatched:z.boolean(),loaderMatched:z.boolean(),
    observedDocumentToken:z.string().min(1).max(160).optional()}).strict().optional(),
}).strict().superRefine((p,ctx)=>{
  if(p.completedAtMs<p.snapshotAtMs || (p.outcome==="captured" && (!p.documentToken || p.attempts===0)) ||
    (p.outcome==="document_mismatch" && !p.mismatch) || (p.mismatch?.urlMatched && p.mismatch.loaderMatched) ||
    (p.recovery==="same_document_retry" && p.attempts!==2) ||
    (p.attempts===2 && p.recovery!=="same_document_retry") ||
    (p.recovery.startsWith("original_loader_") && (!p.documentToken || !p.mismatch)) ||
    (["no_budget","lane_stopped"].includes(p.outcome) && p.attempts!==0))
    ctx.addIssue({code:"custom",message:"Footer capture outcome must agree with its original source and read attempts."});
});
export type ConsentFooterOptOutCapture = z.infer<typeof consentFooterOptOutCaptureSchema>;

/** Resolution concerns only the original footer source. It cannot create a control finding. */
export const footerCaptureResolutionSchema=z.object({
  resolution:z.enum(["available","capture_incomplete","not_retained","primary_snapshot_missing","primary_snapshot_ambiguous","source_unavailable","document_mismatch","invalid_packet"]),
  diagnostic:consentFooterOptOutCaptureSchema.optional(),
}).strict();
export type FooterCaptureResolution=z.infer<typeof footerCaptureResolutionSchema>;
