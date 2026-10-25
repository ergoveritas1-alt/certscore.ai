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
 proof:z.object({policyVersion:z.enum(["bounded_ca_request_proof.v1","bounded_ca_request_proof.v2","bounded_ca_request_proof.v3","bounded_ca_request_proof.v4","bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"]),
  bodyStatus:z.enum(["absent","complete","unavailable","unsupported","limited"]),
  bodyFormat:z.enum(["none","form","json","linkedin_wa_json","unknown"]),bodySha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bodyEncoding:z.enum(["identity","base64","base64_gzip"]).optional(),decodedBodySha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  headersStatus:z.enum(["complete","unavailable","limited"]),headersSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  identifiers:z.array(z.object({source:z.enum(["query","body","cookie_header"]),field:z.enum(["li_adsId","li_adsid","li_fat_id","liFatId","hem","ud[em]","ud[ph]","li_sugr","lms_ads","fbp","fbc","external_id","vid","msclkid","cid","auid","gacid","gclid","d_cid","d_cid_ic","d_uuid","vi","first_party_id","eid_pubcid.org","eid_sharedid.org","eid_id5-sync.com","eid_liveramp.com","uuid","click_id","ttp","ttclid","u_c1","epik"]),valueSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(8),
  identifierDispositions:z.array(z.object({field:z.enum(["liFatId","hem","liGiant"]),status:z.enum(["absent","null","empty","invalid","valid","excluded"])}).strict()).length(3).optional(),
  reasons:z.array(z.enum(["body_unavailable","unsupported_body","body_limit","duplicate_fields","unsupported_fields","headers_unavailable","header_limit","ambiguous_cookie","unsupported_privacy_header","cookie_opt_out_unresolved"])).max(10),
 }).strict().optional(),
 entity:z.object({entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),label:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(120)}).strict(),
 qualification:saleSharingRequestQualificationSchema,
 propertyBinding:z.object({policyVersion:z.literal("google_analytics_property.v1"),propertyIdSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
}).strict().superRefine((row,ctx)=>{
 if(row.proof?.policyVersion==="bounded_ca_request_proof.v7" && (row.origin!=="https://htlb.casalemedia.com" ||
  row.path!=="/openrtb/pbjs" || row.method!=="POST" || row.qualification.activity!=="unresolved" ||
  row.proof.bodyStatus==="complete" && row.proof.bodyFormat!=="json"))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Index Exchange v7 inspection remains exact-endpoint bound and purpose-unresolved."});
 if((row.contractVersion==="california_reject_request.v2")!==Boolean(row.proof) ||
  row.contractVersion==="california_reject_request.v1" && row.payload==="inspected_body" || row.proof && (
  (row.payload==="inspected_body")!==(row.proof.bodyStatus==="complete") || (row.payload==="no_body")!==(row.proof.bodyStatus==="absent") ||
  row.proof.bodyStatus==="complete" && !["form","json","linkedin_wa_json"].includes(row.proof.bodyFormat) ||
  row.proof.bodyFormat==="linkedin_wa_json" && (!["bounded_ca_request_proof.v2","bounded_ca_request_proof.v3","bounded_ca_request_proof.v4","bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion)||!row.proof.bodyEncoding||!row.proof.decodedBodySha256||row.method!=="POST"||row.origin!=="https://px.ads.linkedin.com"||!/^\/wa\/?$/.test(row.path)) ||
  row.proof.policyVersion==="bounded_ca_request_proof.v1" && (row.proof.bodyEncoding!==undefined||row.proof.decodedBodySha256!==undefined||row.proof.identifiers.some(id=>id.field==="liFatId")) ||
  row.proof.identifiers.some(id=>["liFatId","hem"].includes(id.field)&&(id.source!=="body"||row.proof?.bodyFormat!=="linkedin_wa_json"||row.origin!=="https://px.ads.linkedin.com"||!/^\/wa\/?$/.test(row.path))) ||
  !["bounded_ca_request_proof.v3","bounded_ca_request_proof.v4","bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion) && (row.proof.identifierDispositions!==undefined || row.proof.identifiers.some(id=>["hem","ud[em]","ud[ph]"].includes(id.field)) || ["linkedin_hashed_email","meta_advanced_matching_identifier"].includes(row.qualification.basis)) ||
  row.proof.identifierDispositions && (row.proof.bodyFormat!=="linkedin_wa_json" || new Set(row.proof.identifierDispositions.map(r=>r.field)).size!==3 || row.proof.identifierDispositions.some(r=>r.field==="liGiant"&&r.status==="valid" || r.field!=="liGiant"&&r.status==="excluded")) ||
  (row.proof.bodyStatus==="complete"&&row.proof.bodyFormat!=="linkedin_wa_json" || !(row.origin==="https://px.ads.linkedin.com"&&/^\/wa\/?$/.test(row.path))) && (row.proof.bodyEncoding!==undefined||row.proof.decodedBodySha256!==undefined) ||
  !["bounded_ca_request_proof.v4","bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion)&&row.proof.identifiers.some(id=>["first_party_id","eid_pubcid.org","eid_sharedid.org","eid_id5-sync.com","eid_liveramp.com"].includes(id.field)) ||
  !["bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion)&&row.proof.identifiers.some(id=>["uuid","click_id","ttp","ttclid","u_c1","epik"].includes(id.field)) ||
  row.proof.bodyStatus==="absent" && (row.proof.bodyFormat!=="none" || row.proof.bodySha256!==null) ||
  row.proof.headersStatus==="complete"&&!row.proof.headersSha256 || row.proof.bodyStatus==="complete"&&!row.proof.bodySha256))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"California v2 body/header proof must retain consistent dispositions and hashes."});
 if(row.proof?.policyVersion==="bounded_ca_request_proof.v3" && row.proof.bodyFormat==="linkedin_wa_json" && row.proof.bodyStatus==="complete" &&
  (!row.proof.identifierDispositions || row.proof.identifierDispositions.some(d=>d.field!=="liGiant" &&
   (d.status==="valid")!==row.proof!.identifiers.some(id=>id.source==="body"&&id.field===d.field))))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Decoded matching field dispositions must agree with retained positive identifiers."});
 const matchingBasis=["linkedin_hashed_email","meta_advanced_matching_identifier"].includes(row.qualification.basis);
 if(matchingBasis && (!row.proof || !["bounded_ca_request_proof.v3","bounded_ca_request_proof.v4","bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion) || !row.proof.identifiers.some(id=>
  row.qualification.basis==="linkedin_hashed_email" ? id.field==="hem"&&id.source==="body" : ["ud[em]","ud[ph]"].includes(id.field)&&id.source!=="cookie_header")))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Matching-identity qualification requires v3 retained field proof."});
 if(row.proof?.identifiers.some(id=>["ud[em]","ud[ph]"].includes(id.field) &&
  (id.source==="cookie_header" || !["https://facebook.com","https://www.facebook.com"].includes(row.origin) || !/^\/tr\/?$/.test(row.path))))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Meta matching identity must bind to the pixel endpoint."});
 const protocolIdentityByBasis:Record<string,string[]>={tiktok_pixel_identifier:["ttp","ttclid"],snap_pixel_identifier:["u_c1"],pinterest_tag_identifier:["epik","external_id"],reddit_pixel_identifier:["uuid","click_id"]};
 const protocolFields=protocolIdentityByBasis[row.qualification.basis];
 const protocolCarrier=row.qualification.basis==="tiktok_pixel_identifier"?row.origin==="https://analytics.tiktok.com"&&/^\/api\/v2\/pixel\/?$/.test(row.path):
  row.qualification.basis==="snap_pixel_identifier"?row.origin==="https://tr.snapchat.com"&&/^\/p\/?$/.test(row.path):
  row.qualification.basis==="pinterest_tag_identifier"?row.origin==="https://ct.pinterest.com"&&/^\/v3\/?$/.test(row.path):
  row.qualification.basis==="reddit_pixel_identifier"?row.origin==="https://alb.reddit.com"&&/^\/rp(?:\.gif)?$/.test(row.path):true;
 if(protocolFields&&(!protocolCarrier||!row.proof||!["bounded_ca_request_proof.v5","bounded_ca_request_proof.v6","bounded_ca_request_proof.v7"].includes(row.proof.policyVersion)||!row.proof.identifiers.some(id=>protocolFields.includes(id.field))))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Protocol advertising collection requires v5 endpoint-bound identity proof."});
 if(row.proof?.identifiers.some(id=>
  ["uuid","click_id"].includes(id.field)?row.origin!=="https://alb.reddit.com"||!/^\/rp(?:\.gif)?$/.test(row.path):
  id.field==="u_c1"?row.origin!=="https://tr.snapchat.com"||!/^\/p\/?$/.test(row.path):
  ["ttp","ttclid"].includes(id.field)?row.origin!=="https://analytics.tiktok.com"||!/^\/api\/v2\/pixel(?:\/(?:act|inter|perf))?\/?$/.test(row.path):
  id.field==="epik"?row.origin!=="https://ct.pinterest.com"||!/^\/v3\/?$/.test(row.path):false))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Protocol visitor identity must bind to its exact supported collector."});
 if(!row.qualification.gpp)ctx.addIssue({code:z.ZodIssueCode.custom,message:"California request proof requires explicit processing-signal inspection."});
 if(row.propertyBinding && (row.contractVersion!=="california_reject_request.v2" ||
  !["https://google-analytics.com","https://www.google-analytics.com"].includes(row.origin) || row.path!=="/g/collect" ||
  !row.proof?.identifiers.some(id=>id.field==="cid"&&id.source!=="cookie_header")))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Property binding requires identified Analytics collection on the exact request."});
});
export type CaliforniaRejectRequestEvidence=z.infer<typeof californiaRejectRequestEvidenceSchema>;

export function validateCaliforniaRejectRequest(row:{requestId:string;startedAtMs:number;sanitizedUrl:string;method?:string;californiaCollection?:CaliforniaRejectRequestEvidence},ctx:z.RefinementCtx) {
 const proof=row.californiaCollection;if(!proof)return;
 let url:URL;try{url=new URL(row.sanitizedUrl);}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid California request URL binding."});return;}
 if(proof.requestId!==row.requestId || proof.startedAtMs!==row.startedAtMs || proof.method!==row.method ||
  proof.origin!==url.origin || proof.path!==url.pathname)ctx.addIssue({code:z.ZodIssueCode.custom,message:"California collection proof must bind to its exact retained request."});
}

/** The same closed request-proof validator serves both lanes. The retained GPC
 * contract has its own identity; no Reject observation is manufactured. */
export const gpcRequestProofSchema=z.object({
 ...californiaRejectRequestEvidenceSchema.innerType().shape,
 contractVersion:z.literal("gpc_request_proof.v1"),
}).strict().superRefine((row,ctx)=>{
 const checked=californiaRejectRequestEvidenceSchema.safeParse({...row,contractVersion:"california_reject_request.v2"});
 if(!checked.success)for(const issue of checked.error.issues)ctx.addIssue(issue);
});
export type GpcRequestProof=z.infer<typeof gpcRequestProofSchema>;
