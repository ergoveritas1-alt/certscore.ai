import {z} from "zod";

/** Compact source accounting, independent of the detailed description sample.
 * Loaded DOM and selected SDK lists never prove the entire CMP inventory. */
export const cmpInventoryManifestSchema = z.object({
  version:z.literal("cmp_inventory_manifest.v1"),
  source:z.enum(["cookieyes_category_configuration.v1","onetrust_group_cookie_lists.v1","cookiebot_loaded_declarations.v1"]),
  names:z.array(z.string().regex(/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/)).max(256),
  sourceRecordCount:z.number().int().min(0).max(10000),
  resolvedRecordCount:z.number().int().min(0).max(10000),
  unresolvedRecordCount:z.number().int().min(0).max(10000),
  unresolvedSources:z.number().int().min(0).max(10000),
  truncated:z.boolean(),
}).strict().superRefine((value,ctx)=>{
  if (value.resolvedRecordCount+value.unresolvedRecordCount!==value.sourceRecordCount ||
      value.names.length>value.resolvedRecordCount || new Set(value.names).size!==value.names.length ||
      value.names.join("").length>8192)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Inventory manifest requires bounded exact source accounting."});
});
export type CmpInventoryManifest=z.infer<typeof cmpInventoryManifestSchema>;

export function completeConfiguredCmpNames(manifest:CmpInventoryManifest|undefined) {
  // Only the enumerated category configuration currently has an exhaustive
  // source contract. Other adapters retain breadth without an absence claim.
  return manifest?.source==="cookieyes_category_configuration.v1" && !manifest.truncated &&
    manifest.unresolvedRecordCount===0 && manifest.unresolvedSources===0 && manifest.names.length>0 &&
    manifest.sourceRecordCount===manifest.resolvedRecordCount;
}

export const cmpCaptureProgressSchema=z.object({
  version:z.literal("cmp_capture_checkpoints.v1"),documentToken:z.string().min(1).max(160),
  controlsAtMs:z.number().int().nonnegative().optional(),
  declarationsAtMs:z.number().int().nonnegative().optional(),
  privacyLinksAtMs:z.number().int().nonnegative().optional(),
}).strict();
