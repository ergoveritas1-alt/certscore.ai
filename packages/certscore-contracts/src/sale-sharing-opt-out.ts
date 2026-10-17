import { z } from "zod";
export const SALE_SHARING_OPT_OUT_POLICY = "bounded_sale_sharing_opt_out.v1" as const;
export const SALE_SHARING_OPT_OUT_WORKER_BUDGET_MS = 5_000;
export const SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS = 3_000;
// Preserve observation and five-second worker caps; reserve 500 ms for return.
export const SALE_SHARING_OPT_OUT_ARTIFACT_BUDGET_MS = 4_500;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const target = z.string().url().max(2000).refine(value => { const u=new URL(value); return !u.username && !u.password && !u.hash && (u.protocol==="https:" || (u.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname))); });
export const saleSharingOptOutDispatchSchema = z.object({
  policyVersion: z.literal(SALE_SHARING_OPT_OUT_POLICY), enabled: z.literal(true),
  scanId: z.string().min(1).max(160), exactTargetUrl: target,
}).strict();
export type SaleSharingOptOutDispatch = z.infer<typeof saleSharingOptOutDispatchSchema>;
const decision = z.object({sectionId:z.union([z.literal(7),z.literal(8)]),sale:z.union([z.literal(1),z.literal(2)]),sharing:z.union([z.literal(1),z.literal(2)])}).strict();
export const saleSharingOptOutEvidenceSchema = z.object({
  contractVersion:z.literal("certscore.sale-sharing-opt-out-evidence.v1"),policyVersion:z.literal(SALE_SHARING_OPT_OUT_POLICY),
  scanId:z.string().min(1).max(160),parentDispatchSha256:hash,targetUrl:target,documentToken:z.string().min(1).max(200).nullable(),
  startedAt:z.string().datetime(),completedAt:z.string().datetime(),status:z.enum(["complete","limited","unsupported"]),
  recipeVersion:z.string().min(1).max(100).nullable(),provider:z.string().max(100).nullable(),
  actionCount:z.number().int().min(0).max(2),submitted:z.boolean(),
  registration:z.enum(["confirmed","unconfirmed","not_attempted"]),confirmedAt:z.string().datetime().nullable(),
  before:decision.nullable(),after:decision.nullable(),
  observationWindowMs:z.number().int().min(0).max(500),captureComplete:z.boolean(),truncated:z.boolean(),
  requests:z.array(z.object({hostname:z.string().min(1).max(255).regex(/^[a-z0-9.-]+$/i), vendor:z.string().min(1).max(160),purpose:z.enum(["advertising","marketing"]), httpStatus:z.number().int().min(200).max(599), msAfterConfirmation:z.number().int().min(250).max(750),
    collectionEvidence:z.object({contractVersion:z.literal("canonical_advertising_collection.v1"),endpointSha256:hash,
      registryVersion:z.string().min(1).max(200),ruleIds:z.array(z.string().min(1).max(200)).min(1).max(16)}).strict().optional()}).strict()).max(32),
  limitations:z.array(z.string().min(1).max(100)).max(12),
}).strict().superRefine((p,ctx)=>{
  const confirmed=p.registration==="confirmed";
  if(confirmed && (!p.submitted || !p.documentToken || !p.recipeVersion || !p.provider || !p.confirmedAt || !p.before || !p.after || p.before.sectionId!==p.after.sectionId || p.after.sale!==1 || p.after.sharing!==1 || (p.before.sale!==2 && p.before.sharing!==2)))ctx.addIssue({code:"custom",message:"Registered sale/sharing opt-out requires a bound semantic transition."});
  if(!confirmed && (p.confirmedAt || p.requests.length || p.captureComplete))ctx.addIssue({code:"custom",message:"Unconfirmed decisions cannot establish post-opt-out activity."});
  if(p.status==="complete" && (Date.parse(p.completedAt)-Date.parse(p.startedAt)>SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS || !p.confirmedAt || Date.parse(p.completedAt)-Date.parse(p.confirmedAt)<750))ctx.addIssue({code:"custom",message:"Observation must complete within its budget and after the full anchored window."});
  if(p.status==="complete" && (!confirmed || !p.captureComplete || p.observationWindowMs!==500 || p.truncated || p.limitations.length))ctx.addIssue({code:"custom",message:"Complete observation requires confirmed decision and completed bounded capture."});
  if(p.requests.some(row=>row.collectionEvidence && row.httpStatus >= 400))ctx.addIssue({code:"custom",message:"Scorable collection requires a successful retained response."});
  if(p.submitted && (p.actionCount<1 || p.registration==="not_attempted"))ctx.addIssue({code:"custom",message:"Submission must retain its decision outcome."});
  if(p.confirmedAt && (Date.parse(p.confirmedAt)<Date.parse(p.startedAt) || Date.parse(p.confirmedAt)>Date.parse(p.completedAt)))ctx.addIssue({code:"custom",message:"Decision timestamp outside observation."});
  if(Date.parse(p.completedAt)<Date.parse(p.startedAt))ctx.addIssue({code:"custom",message:"Invalid observation interval."});
});
export type SaleSharingOptOutEvidence=z.infer<typeof saleSharingOptOutEvidenceSchema>;
export const verifiedSaleSharingOptOutSchema=z.object({
  evidence:saleSharingOptOutEvidenceSchema,sha256:hash,sizeBytes:z.number().int().positive().max(32000),verificationStatus:z.literal("verified"),
}).strict();
export type VerifiedSaleSharingOptOut=z.infer<typeof verifiedSaleSharingOptOutSchema>;

export const saleSharingOptOutLaneOutcomeSchema=z.object({status:z.enum(["joined","limited"]),startedAt:z.string().datetime(),completedAt:z.string().datetime(),limitationCode:z.enum(["opt_out_budget_exhausted","opt_out_worker_failed","opt_out_inspection_cancelled"]).optional()}).strict();
export type SaleSharingOptOutLaneOutcome=z.infer<typeof saleSharingOptOutLaneOutcomeSchema>;
