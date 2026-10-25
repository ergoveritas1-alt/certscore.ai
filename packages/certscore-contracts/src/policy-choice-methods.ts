import {z} from "zod";
import {classifyPrivacySurface} from "./privacy-surface-classifier";
import {reviewedOptOutPolicyOwner} from "./policy-document-brand-relationships";

export const POLICY_CHOICE_METHOD_FINDING_ID = "california_policy_choice_method_observed";
const displayUrl = z.string().url().max(800).refine(value => {
  const url = new URL(value);
  return ["http:","https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});
export const policyChoiceMethodsSchema = z.object({
  version:z.enum(["policy_choice_methods.v1","policy_choice_methods.v2"]),
  scanId:z.string().min(1).max(100),
  reportDocumentUrl:z.string().url().max(800).refine(value=>{
    const url=new URL(value);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password;
  }),
  sourceBundleSha256:z.string().regex(/^[a-f0-9]{64}$/),
  scope:z.literal("linked_policy_document"),
  homepagePresence:z.literal("not_established"),
  saleSharingScope:z.literal("not_assessed"),
  effectiveness:z.literal("not_verified"),
  methods:z.array(z.object({
    label:z.string().min(1).max(200),
    kind:z.enum(["do_not_sell_or_share","your_privacy_choices"]),
    method:z.enum(["email","web_link"]),
    sourceDocumentUrl:displayUrl,
    sourceDocumentUrlSha256:z.string().regex(/^[a-f0-9]{64}$/),
    evidenceRef:z.string().regex(/^policy-surface:/).max(240),
    parentEvidenceRef:z.string().regex(/^policy-surface:/).max(240),
    ownerBinding:z.object({relationshipId:z.string().max(100),observedAt:z.string().datetime()}).strict().optional(),
    // Query/body/subject values are deliberately not copied into this projection.
    destination:z.string().max(800),
  }).strict()).min(1).max(4),
}).strict().superRefine((value,ctx)=>{
  if(new TextEncoder().encode(JSON.stringify(value)).length>4096)
    ctx.addIssue({code:"custom",message:"Policy methods exceed the 4 KiB limit."});
  const refs=new Set<string>();
  for(const row of value.methods){
    if(row.ownerBinding&&(value.version!=="policy_choice_methods.v2"||reviewedOptOutPolicyOwner(value.reportDocumentUrl,row.sourceDocumentUrl,row.ownerBinding.observedAt)?.id!==row.ownerBinding.relationshipId))
      ctx.addIssue({code:"custom",message:"Reviewed owner method must match the exact approved source, target and date."});
    if(refs.has(row.evidenceRef)||row.evidenceRef===row.parentEvidenceRef ||
       classifyPrivacySurface({linkText:row.label}).surfaceType!==row.kind)
      ctx.addIssue({code:"custom",message:"Policy method requires a unique supported label and parent reference."});
    refs.add(row.evidenceRef);
    const valid=row.method==="email" ? /^mailto:[a-z0-9.!#$%&'*+/=^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(row.destination)
      : displayUrl.safeParse(row.destination).success;
    if(!valid)ctx.addIssue({code:"custom",message:"Policy method destination must be safe and match its type."});
  }
});
