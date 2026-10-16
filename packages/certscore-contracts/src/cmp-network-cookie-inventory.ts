import { z } from "zod";
import { cmpInventoryManifestSchema } from "./cmp-inventory-manifest";

/** A bounded public cookie-list response the initial page already requested.
 * Source accounting is not proof of an exhaustive site or CMP inventory. */
export const cmpNetworkCookieInventorySchema = z.object({
  version: z.literal("termly_cookie_response.v1"),
  source: z.literal("already_requested_response"),
  documentToken: z.string().min(1).max(160),
  documentUrl: z.string().url().max(2000),
  tenantId: z.string().uuid(),
  scriptUrl: z.string().url().max(2000), responseUrl: z.string().url().max(2000),
  requestId: z.string().min(1).max(160), frameId: z.string().min(1).max(160),
  httpStatus: z.literal(200), mimeType: z.literal("application/json"),
  completedAtMs: z.number().int().nonnegative(),
  decodedBytes: z.number().int().min(1).max(65536),
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  inventoryManifest: cmpInventoryManifestSchema,
  records: z.array(z.object({
    technology:z.enum(["http_cookie","server_cookie"]),
    name:z.string().regex(/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/), purpose:z.string().max(240), duration:z.string().max(240),
    sourceRef:z.string().regex(/^category:[0-6]\/record:\d{1,3}$/),
  }).strict()).max(100),
  truncated:z.boolean(),
}).strict().superRefine((v,ctx)=>{
  let bound=false;
  try {
    const script=new URL(v.scriptUrl),response=new URL(v.responseUrl);
    bound=script.origin==="https://app.termly.io" && !script.username && !script.password && !script.hash &&
      script.pathname===`/resource-blocker/${v.tenantId}` &&
      [...script.searchParams].length<=1 && [...script.searchParams].every(([k,value])=>k==="autoBlock" && /^(on|off)$/.test(value)) &&
      response.origin===script.origin && !response.username && !response.password && !response.hash &&
      response.pathname===`/api/v1/snippets/websites/${v.tenantId}/cookies` &&
      [...response.searchParams].length<=1 && [...response.searchParams].every(([k,value])=>k==="lang" && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(value));
  }catch{}
  const manifest=v.inventoryManifest;
  if(!bound || manifest.source!==v.version || new Set(v.records.map(r=>r.sourceRef)).size!==v.records.length ||
      v.records.some(r=>!manifest.names.includes(r.name)) ||
      v.records.reduce((n,r)=>n+r.name.length+r.purpose.length+r.duration.length,0)>16000 ||
      manifest.truncated && !v.truncated)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Network cookie inventory requires exact bounded source and tenant binding."});
});
export type CmpNetworkCookieInventory=z.infer<typeof cmpNetworkCookieInventorySchema>;
export function projectNetworkCmpCookies(v:CmpNetworkCookieInventory){
  const rows:Array<{name:string;purpose:string;duration:string;source:"cmp_api_inventory"}>=[];
  for(const r of v.records)if(!rows.some(x=>x.name===r.name && x.purpose===r.purpose && x.duration===r.duration))
    rows.push({name:r.name,purpose:r.purpose,duration:r.duration,source:"cmp_api_inventory"});
  return rows;
}
