import {z} from "zod";
import {saleSharingRequestQualificationSchema} from "./gpc-bounded-observation";
/** Observed on the exact browser Request before URL sanitization. No raw
 * visitor identifiers, payloads or GPP strings are added to retention. */
export const californiaRejectRequestEvidenceSchema=z.object({
 contractVersion:z.enum(["california_reject_request.v1","california_reject_request.v2"]),
 requestId:z.string().min(1).max(120),startedAtMs:z.number().int().nonnegative(),
 origin:z.string().url().max(300),path:z.string().min(1).max(500),method:z.string().min(1).max(16),
 urlSha256:z.string().regex(/^[a-f0-9]{64}$/),
 httpStatus:z.number().int().min(100).max(599).nullable(),
 payload:z.enum(["no_body","uninspected_body","inspected_body"]),
 proof:z.object({policyVersion:z.literal("bounded_ca_request_proof.v1"),
  bodyStatus:z.enum(["absent","complete","unavailable","unsupported","limited"]),
  bodyFormat:z.enum(["none","form","json","unknown"]),bodySha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  headersStatus:z.enum(["complete","unavailable","limited"]),headersSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  identifiers:z.array(z.object({source:z.enum(["query","body","cookie_header"]),field:z.enum(["li_adsId","li_adsid","li_fat_id","li_sugr","lms_ads","fbp","fbc","external_id","vid","msclkid","cid","auid","gacid","gclid","d_cid","d_cid_ic","d_uuid","vi"]),valueSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(8),
  reasons:z.array(z.enum(["body_unavailable","unsupported_body","body_limit","duplicate_fields","unsupported_fields","headers_unavailable","header_limit","ambiguous_cookie","unsupported_privacy_header","cookie_opt_out_unresolved"])).max(10),
 }).strict().optional(),
 entity:z.object({entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),label:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(120)}).strict(),
 qualification:saleSharingRequestQualificationSchema,
}).strict().superRefine((row,ctx)=>{
 if((row.contractVersion==="california_reject_request.v2")!==Boolean(row.proof) ||
  row.contractVersion==="california_reject_request.v1" && row.payload==="inspected_body" || row.proof && (
  (row.payload==="inspected_body")!==(row.proof.bodyStatus==="complete") || (row.payload==="no_body")!==(row.proof.bodyStatus==="absent") ||
  row.proof.bodyStatus==="complete" && !["form","json"].includes(row.proof.bodyFormat) ||
  row.proof.bodyStatus==="absent" && (row.proof.bodyFormat!=="none" || row.proof.bodySha256!==null) ||
  row.proof.headersStatus==="complete"&&!row.proof.headersSha256 || row.proof.bodyStatus==="complete"&&!row.proof.bodySha256))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"California v2 body/header proof must retain consistent dispositions and hashes."});
 if(!row.qualification.gpp)ctx.addIssue({code:z.ZodIssueCode.custom,message:"California request proof requires explicit processing-signal inspection."});
});
export type CaliforniaRejectRequestEvidence=z.infer<typeof californiaRejectRequestEvidenceSchema>;

export function validateCaliforniaRejectRequest(row:{requestId:string;startedAtMs:number;sanitizedUrl:string;method?:string;californiaCollection?:CaliforniaRejectRequestEvidence},ctx:z.RefinementCtx) {
 const proof=row.californiaCollection;if(!proof)return;
 let url:URL;try{url=new URL(row.sanitizedUrl);}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid California request URL binding."});return;}
 if(proof.requestId!==row.requestId || proof.startedAtMs!==row.startedAtMs || proof.method!==row.method ||
  proof.origin!==url.origin || proof.path!==url.pathname)ctx.addIssue({code:z.ZodIssueCode.custom,message:"California collection proof must bind to its exact retained request."});
}
