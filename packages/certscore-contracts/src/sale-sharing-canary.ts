import {z} from "zod";
import {saleSharingExactRouteAuthorization} from "./sale-sharing-redirect";

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const saleSharingCanaryAuthorizationSchema=z.object({
  version:z.literal("sale_sharing_canary.v1"),campaignId:id,slot:z.union([z.literal(0),z.literal(1)]),
  scanId:id,targetUrl:z.enum(["https://gimbal.com/","https://readcube.com/"]),
  region:z.literal("us-west-1"),functionName:z.string().regex(/^[a-zA-Z0-9_-]+:[1-9][0-9]*$/),
  buildGitSha:z.string().regex(/^[a-f0-9]{40}$/),releaseSha256:sha,
  issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),
  recipeVersion:z.enum(["onetrust.gimbal_settings.v2","onetrust.readcube_settings.v1"]),
}).strict().superRefine((a,ctx)=>{
  const duration=Date.parse(a.expiresAt)-Date.parse(a.issuedAt);
  if(duration<=0||duration>86400000)ctx.addIssue({code:"custom",message:"Canary expires within 24 hours."});
  if(a.recipeVersion!==(a.targetUrl==="https://gimbal.com/"?"onetrust.gimbal_settings.v2":"onetrust.readcube_settings.v1"))ctx.addIssue({code:"custom",message:"Canary recipe must match the original target."});
});
export type SaleSharingCanaryAuthorization=z.infer<typeof saleSharingCanaryAuthorizationSchema>;
export const saleSharingCanaryCampaignSchema=z.object({
  version:z.literal("sale_sharing_canary_campaign.v1"),
  bucket:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  budgetCapUsd:z.literal(0.25),budgetPreflightApproved:z.literal(true),
  slots:z.tuple([saleSharingCanaryAuthorizationSchema,saleSharingCanaryAuthorizationSchema]),
}).strict().superRefine((m,ctx)=>{
  const [a,b]=m.slots;
  if(a.slot!==0||b.slot!==1||a.scanId===b.scanId||a.targetUrl===b.targetUrl||
    ["campaignId","functionName","buildGitSha","releaseSha256","issuedAt","expiresAt"].some(k=>a[k as keyof typeof a]!==b[k as keyof typeof b]))
    ctx.addIssue({code:"custom",message:"Exactly two distinct, ordered targets share one release and expiry."});
});
export type SaleSharingCanaryCampaign=z.infer<typeof saleSharingCanaryCampaignSchema>;

// No campaign is active. Never read authorization from public scan options or
// environment flags. Activation is a separate reviewed server-side release.
export function activeSaleSharingCanaryCampaign():SaleSharingCanaryCampaign|null{return null;}

export function selectSaleSharingCanary(scanId:string,targetUrl:string,region:string,
  campaign:SaleSharingCanaryCampaign|null=activeSaleSharingCanaryCampaign(),now=Date.now()) {
  if(!campaign)return undefined;
  const m=saleSharingCanaryCampaignSchema.parse(campaign);
  const a=m.slots.find(a=>a.scanId===scanId);
  // A listed canary cannot fall back to an ordinary paid scan when stale or
  // mismatched. Unlisted scans alone retain their baseline dispatch behavior.
  if(a&&(a.targetUrl!==targetUrl||a.region!==region||now<Date.parse(a.issuedAt)||now>=Date.parse(a.expiresAt)))throw Error("sale_sharing_canary_not_authorized");
  return a;
}

export function assertSaleSharingCanary(input:{authorization:unknown;scanId:string;targetUrl:string;region:string;functionName:string;
  policyVersion:string;route:unknown;runtime?:{buildGitSha?:string;functionVersion?:string;region?:string;memoryMb?:number}},
  campaign:SaleSharingCanaryCampaign|null=activeSaleSharingCanaryCampaign(),now=Date.now()) {
  const a=saleSharingCanaryAuthorizationSchema.parse(input.authorization);
  const expected=selectSaleSharingCanary(input.scanId,input.targetUrl,input.region,campaign,now);
  if(!expected||JSON.stringify(a)!==JSON.stringify(saleSharingCanaryAuthorizationSchema.parse(expected))||input.functionName!==a.functionName||
    input.policyVersion!=="bounded_sale_sharing_opt_out.v3-exact-routes"||JSON.stringify(input.route)!==JSON.stringify(saleSharingExactRouteAuthorization(a.targetUrl)))throw Error("sale_sharing_canary_not_authorized");
  if(input.runtime&&(input.runtime.buildGitSha!==a.buildGitSha||input.runtime.functionVersion!==a.functionName.split(":")[1]||input.runtime.region!==a.region||input.runtime.memoryMb!==3008))throw Error("sale_sharing_canary_runtime_mismatch");
  return a;
}

export type SaleSharingCanaryStage="dispatch"|"coordinator"|"worker";
export type SaleSharingCanaryLedger={
  read(key:string):Promise<unknown|null>;
  // Must atomically fail if the key exists. Never overwrite or retry a claim.
  create(key:string,value:unknown):Promise<void>;
};
const prefix=(a:SaleSharingCanaryAuthorization)=>`sale-sharing-canary/${a.campaignId}/${a.slot}`;
/** Each stage burns its attempt before invocation/browser work. An uncertain
 * write consumes the slot; no automatic retry or reset is safe. */
export async function consumeSaleSharingCanary(a:SaleSharingCanaryAuthorization,stage:SaleSharingCanaryStage,ledger:SaleSharingCanaryLedger,parentDispatchSha256?:string) {
  if(await ledger.read(`sale-sharing-canary/${a.campaignId}/revoked.json`))throw Error("sale_sharing_canary_revoked");
  const matches=(record:unknown)=>{
    const r=record as {authorization?:unknown;parentDispatchSha256?:string}|null;
    return r&&JSON.stringify(r.authorization)===JSON.stringify(a)&&
      (stage!=="worker"||r.parentDispatchSha256===parentDispatchSha256);
  };
  if(stage!=="dispatch"&&!sha.safeParse(parentDispatchSha256).success)throw Error("sale_sharing_canary_parent_missing");
  if(stage==="dispatch"&&a.slot===1){
    const review=await ledger.read(`sale-sharing-canary/${a.campaignId}/0/review.json`) as {releaseSha256?:string;safeToContinue?:boolean;canonicalResultSha256?:string;terminalScanId?:string}|null;
    const first=await ledger.read(`sale-sharing-canary/${a.campaignId}/0/worker.json`) as {authorization?:unknown}|null;
    const prior=saleSharingCanaryAuthorizationSchema.safeParse(first?.authorization);
    if(!prior.success||prior.data.slot!==0||prior.data.campaignId!==a.campaignId||prior.data.releaseSha256!==a.releaseSha256||prior.data.targetUrl===a.targetUrl||review?.terminalScanId!==prior.data.scanId||review?.releaseSha256!==a.releaseSha256||review.safeToContinue!==true||!sha.safeParse(review.canonicalResultSha256).success)throw Error("sale_sharing_canary_prior_review_required");
  }
  if(stage!=="dispatch"&&!matches(await ledger.read(`${prefix(a)}/${stage==="coordinator"?"dispatch":"coordinator"}.json`)))throw Error("sale_sharing_canary_prior_claim_missing");
  await ledger.create(`${prefix(a)}/${stage}.json`,{authorization:a,...(parentDispatchSha256?{parentDispatchSha256}:{})});
}

/** Operator-only review receipt; callers must first inspect the terminal
 * canonical result. No worker or public API invokes this operation. */
export async function recordSaleSharingCanaryReview(a:SaleSharingCanaryAuthorization,ledger:SaleSharingCanaryLedger,
  review:{canonicalResultSha256:string;safeToContinue:boolean;terminalScanId:string}) {
  if(a.slot!==0||review.terminalScanId!==a.scanId||!sha.safeParse(review.canonicalResultSha256).success)throw Error("sale_sharing_canary_invalid_review");
  const worker=await ledger.read(`${prefix(a)}/worker.json`) as {authorization?:unknown}|null;
  if(JSON.stringify(worker?.authorization)!==JSON.stringify(a))throw Error("sale_sharing_canary_worker_claim_missing");
  await ledger.create(`${prefix(a)}/review.json`,{...review,releaseSha256:a.releaseSha256});
  if(!review.safeToContinue)await ledger.create(`sale-sharing-canary/${a.campaignId}/revoked.json`,{reason:"operator_review_failed"});
}

/** Transport must enforce atomic create (e.g. S3 If-None-Match: *) and bounded
 * reads. No fallback to in-memory state, overwrite, retry, or missing-on-error. */
export function saleSharingCanaryLedger(transport:{readText(key:string):Promise<string|null>;createText(key:string,body:string):Promise<void>}):SaleSharingCanaryLedger {
  return {
    async read(key){const raw=await transport.readText(key);if(raw===null)return null;if(raw.length>8192)throw Error("sale_sharing_canary_record_oversize");const record=JSON.parse(raw);if(!record||typeof record!=="object"||Array.isArray(record))throw Error("sale_sharing_canary_record_invalid");return record;},
    async create(key,value){const raw=JSON.stringify(value);if(raw.length>8192)throw Error("sale_sharing_canary_record_oversize");await transport.createText(key,raw);},
  };
}
