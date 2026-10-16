import { z } from "zod";
import { isExplicitCmpProviderName } from "./cmp-visible-inventory";

/** Already-loaded public declaration cards. These may be collapsed: this
 * contract deliberately carries no visibility or complete-inventory claim. */
export const cmpLoadedInventorySchema = z.object({
  version: z.literal("cookiebot_loaded_declarations.v1"),
  records: z.array(z.object({
    name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240),
    storageType: z.enum(["cookie", "local_storage", "indexed_db", "pixel", "unknown"]),
    provider: z.string().min(1).max(240).nullable(),
    sourceRef: z.string().regex(/^provider:\d{1,3}\/record:\d{1,3}$/),
  }).strict()).max(100),
  truncated: z.boolean(), unresolvedRecords: z.number().int().nonnegative().max(10000),
}).strict().superRefine((inventory, context) => {
  if (new Set(inventory.records.map(row => row.sourceRef)).size !== inventory.records.length)
    context.addIssue({code: z.ZodIssueCode.custom, message: "Loaded declaration references must be unique."});
  if (inventory.records.reduce((sum, row) => sum + row.name.length + row.purpose.length + row.duration.length + (row.provider?.length ?? 0), 0) > 16000)
    context.addIssue({code: z.ZodIssueCode.custom, message: "Loaded declaration text exceeds its bounded allowance."});
});

export type CmpLoadedInventory = z.infer<typeof cmpLoadedInventorySchema>;

export function projectLoadedCmpInventory(inventory: CmpLoadedInventory) {
  const declarations: Array<{name:string;purpose:string;duration:string;source:"cmp_loaded_inventory"}> = [];
  const services: Array<{name:string;source:"cmp_loaded_inventory";sourceRef:string}> = [];
  for (const record of inventory.records) {
    // An explicitly declared storage key or pixel is not a cookie identity.
    if (record.storageType === "cookie" && !declarations.some(row => row.name === record.name && row.purpose === record.purpose && row.duration === record.duration))
      declarations.push({name:record.name,purpose:record.purpose,duration:record.duration,source:"cmp_loaded_inventory"});
    if (record.provider && isExplicitCmpProviderName(record.provider) && !services.some(row => row.name === record.provider))
      services.push({name:record.provider,source:"cmp_loaded_inventory",sourceRef:record.sourceRef});
  }
  return {declarations, services};
}
