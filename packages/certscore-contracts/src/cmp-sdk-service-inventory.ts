import { z } from "zod";
import { isExplicitCmpProviderName } from "./cmp-visible-inventory";

/** Configured named vendors from the already-ready public SDK. No visitor
 * state, cookie declarations, control visibility or exhaustive coverage. */
export const cmpSdkServiceInventorySchema = z.object({
  version: z.literal("didomi_required_vendors.v1"),
  getter: z.literal("Didomi.getRequiredVendors"),
  readiness: z.literal("already_ready_callback"),
  documentToken: z.string().min(1).max(160),
  rootSelector: z.literal("#didomi-host"),
  noticeSelector: z.literal(".didomi-notice-banner, .didomi-notice-popup, #didomi-notice"),
  sourceRecordCount: z.number().int().min(0).max(10000),
  inspectedRecordCount: z.number().int().min(0).max(100),
  unresolvedRecordCount: z.number().int().min(0).max(100),
  truncated: z.boolean(),
  records: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/),
    name: z.string().min(1).max(160).refine(isExplicitCmpProviderName, "Only literal named vendors qualify"),
  }).strict()).max(100),
}).strict().superRefine((inventory, ctx) => {
  if (inventory.inspectedRecordCount !== Math.min(inventory.sourceRecordCount, 100) ||
      inventory.records.length + inventory.unresolvedRecordCount !== inventory.inspectedRecordCount ||
      inventory.sourceRecordCount > inventory.inspectedRecordCount && !inventory.truncated ||
      new Set(inventory.records.map(record => record.id)).size !== inventory.records.length ||
      inventory.records.reduce((sum, record) => sum + record.id.length + record.name.length, 0) > 16000)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "SDK service inventory requires bounded exact source accounting and unique identities"});
});
export type CmpSdkServiceInventory = z.infer<typeof cmpSdkServiceInventorySchema>;
export function projectSdkCmpServices(inventory: CmpSdkServiceInventory) {
  return [...new Set(inventory.records.map(record => record.name))];
}
