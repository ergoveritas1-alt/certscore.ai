import {z} from "zod";
const safeUrl=z.string().max(600).refine(value=>{try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}});
export const STORAGE_READ_TRACE_LIMITS=Object.freeze({attempts:64,sites:32});
/** Main-document passive reads: only outcome/emptiness and callsite, never values. */
export const storageReadTraceSchema=z.object({
  contractVersion:z.literal("certscore.storage-read-trace.v1"),scanId:z.string().min(1).max(160),captureId:z.string().min(1).max(240),scenario:z.literal("pre_consent"),
  limitReached:z.boolean(),
  observations:z.array(z.object({
    id:z.string().min(1).max(160),documentUrl:safeUrl,documentId:z.string().min(1).max(160),frameId:z.string().min(1).max(160),
    storageType:z.enum(["localStorage","sessionStorage"]),name:z.string().min(1).max(240),
    callerUrl:safeUrl,line:z.number().int().positive(),column:z.number().int().positive(),
    outcome:z.enum(["returned","threw"]),valueState:z.enum(["absent","empty","nonempty","unknown"]),count:z.number().int().min(1).max(64),
  }).strict()).max(STORAGE_READ_TRACE_LIMITS.sites),
}).strict();
export type StorageReadTrace=z.infer<typeof storageReadTraceSchema>;
