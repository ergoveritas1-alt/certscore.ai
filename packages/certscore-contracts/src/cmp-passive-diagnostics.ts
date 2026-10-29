import { z } from "zod";
const time = z.number().finite().nonnegative();
/** Passive observations only. Neither event names nor HTTP status prove a choice. */
export const cmpPassiveDiagnosticsSchema = z.object({
  policyVersion:z.literal("cmp_passive_diagnostics.v1"), diagnosticOnly:z.literal(true),
  documentSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  startedAtEpochMs:time, frozenAtEpochMs:time,
  eventRead:z.enum(["not_read","read"]), eventReadAtEpochMs:time.optional(),
  events:z.array(z.object({name:z.enum(["OneTrustGroupsUpdated","OTConsentApplied"]),atEpochMs:time}).strict()).max(8),
  eventsTruncated:z.boolean(), networkTruncated:z.boolean(),
  network:z.array(z.object({role:z.literal("reviewed_receipt_endpoint"),requestedAtEpochMs:time,
    transport:z.enum(["xhr","fetch","ping","other"]),responseAtEpochMs:time.optional(),status:z.number().int().min(100).max(599).optional(),
    failed:z.boolean()}).strict()).max(8),
}).strict().superRefine((v,ctx)=>{
  if(v.frozenAtEpochMs<v.startedAtEpochMs || (v.eventRead === "read") !== (v.eventReadAtEpochMs !== undefined) ||
    (v.eventRead === "not_read" && (v.events.length>0 || v.eventsTruncated)) ||
    (v.eventReadAtEpochMs !== undefined && (v.eventReadAtEpochMs<v.startedAtEpochMs || v.eventReadAtEpochMs>v.frozenAtEpochMs)) ||
    v.events.some(e=>e.atEpochMs<v.startedAtEpochMs || e.atEpochMs>(v.eventReadAtEpochMs??0)) ||
    v.network.some(n=>n.requestedAtEpochMs<v.startedAtEpochMs || n.requestedAtEpochMs>v.frozenAtEpochMs ||
      (n.responseAtEpochMs !== undefined && (n.responseAtEpochMs<n.requestedAtEpochMs || n.responseAtEpochMs>v.frozenAtEpochMs)) ||
      (n.status !== undefined)!==(n.responseAtEpochMs !== undefined)))ctx.addIssue({code:z.ZodIssueCode.custom,message:"Passive diagnostics require bounded same-capture timing."});
});
export type CmpPassiveDiagnostics = z.infer<typeof cmpPassiveDiagnosticsSchema>;
