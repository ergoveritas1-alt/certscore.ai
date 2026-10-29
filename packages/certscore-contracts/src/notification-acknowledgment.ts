import { z } from "zod";

export const HUBSPOT_NOTIFY_COOKIE = "__hs_notify_banner_dismiss" as const;
export const HUBSPOT_NOTIFY_TRUE_SHA256 = "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b" as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const read = z.object({
  stateSha256: z.literal("5362aa3439fb26c6c7ea55f5b65b5e0c69a41cc87be328ab1d51de0bfea1aa9a"),
  eventSequence: z.number().int().positive(), eventObservedAtMs: z.number().nonnegative(), readAtMs: z.number().nonnegative(),
}).strict();
/** Positive notification-receipt observation, never consent or a scoring input. */
export const notificationAcknowledgmentSchema = z.object({
  policyVersion: z.literal("hubspot_notification_acknowledgment.v1"), provider: z.literal("HubSpot Consent Banner"),
  action: z.literal("accept"), documentSha256: sha, authorizedTargetSha256: sha,
  actionDispatchedAtMs: z.number().int().nonnegative(), writeObservedAtMs: z.number().int().nonnegative(),
  receiptIdentitySha256: sha, receiptValueSha256: z.literal(HUBSPOT_NOTIFY_TRUE_SHA256),
  before: read, after: read,
}).strict().superRefine((v,ctx) => {
  if (v.before.eventSequence !== v.after.eventSequence || v.before.eventObservedAtMs !== v.after.eventObservedAtMs ||
    v.before.eventObservedAtMs > v.before.readAtMs || v.before.readAtMs > v.actionDispatchedAtMs ||
    v.after.readAtMs < v.actionDispatchedAtMs || v.writeObservedAtMs < v.actionDispatchedAtMs) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Notification acknowledgment requires unchanged pre-existing consent and a post-click notification receipt."});
  }
});
export type NotificationAcknowledgment = z.infer<typeof notificationAcknowledgmentSchema>;

type Binding = {
  proof?: {action:string;cmpId?:string;frameIdentitySha256?:string;authorizedTargetSha256?:string};
  clickOutcome?:string; registrationStatus:string; decision?:{basis:string}; terminalDecision?:unknown; cancelled?:boolean;
  capture?:{action:string;activationStatus:string;stopReason:string;actionDispatchedAtMs:number;captureEndedAtMs:number;
    storageSnapshotRetained:boolean;storageWrites:Array<{storageType:string;name:string;observedAtMs:number}>};
  storage?:Array<{storageType:string;name:string;identityHash?:string;valueHash:string}>;
};
export function validateNotificationAcknowledgment(value: NotificationAcknowledgment | undefined, binding: Binding, ctx: z.RefinementCtx) {
  if (!value) return;
  const c=binding.capture, p=binding.proof;
  const receipts=(binding.storage??[]).filter(s=>s.storageType==="cookie"&&s.name===HUBSPOT_NOTIFY_COOKIE);
  if (p?.action!=="accept" || p.cmpId!==value.provider || p.frameIdentitySha256!==value.documentSha256 ||
    p.authorizedTargetSha256!==value.authorizedTargetSha256 || binding.clickOutcome!=="completed" ||
    binding.registrationStatus!=="unconfirmed" || binding.decision?.basis!=="unverified" || binding.terminalDecision || binding.cancelled ||
    !c || c.action!=="accept" || c.activationStatus!=="completed" || c.stopReason!=="window_elapsed" || !c.storageSnapshotRetained ||
    c.actionDispatchedAtMs!==value.actionDispatchedAtMs || value.after.readAtMs>c.captureEndedAtMs || value.writeObservedAtMs>c.captureEndedAtMs ||
    !c.storageWrites.some(w=>w.storageType==="cookie"&&w.name===HUBSPOT_NOTIFY_COOKIE&&w.observedAtMs===value.writeObservedAtMs) ||
    receipts.length!==1 || receipts[0]!.identityHash!==value.receiptIdentitySha256 || receipts[0]!.valueHash!==value.receiptValueSha256) {
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["notificationAcknowledgment"],message:"Notification acknowledgment must join the verified control, unchanged decision, bounded write and exact receipt snapshot."});
  }
}

/** For validated canonical projections. Historical unknowns are not reclassified. */
export function consentActionOutcome(projection: {
  packetSha256?:string; notificationAcknowledgment?:NotificationAcknowledgment;
  execution?:{clickCompleted:boolean;consentConfirmed:boolean};
}): "consent_decision_confirmed" | "notification_acknowledged" | "completed_unconfirmed" | "not_completed" | "unknown" {
  if (!projection.execution || !/^[a-f0-9]{64}$/.test(projection.packetSha256??"")) return "unknown";
  if (!projection.execution.clickCompleted) return "not_completed";
  if (projection.execution.consentConfirmed) return "consent_decision_confirmed";
  if (projection.notificationAcknowledgment && /^[a-f0-9]{64}$/.test(projection.packetSha256??"")) return "notification_acknowledged";
  return "completed_unconfirmed";
}
