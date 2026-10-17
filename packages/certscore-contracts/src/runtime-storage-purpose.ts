import {storageReadTraceSchema} from "./storage-read-trace";
import {z} from "zod";
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const safeUrl=z.string().max(600).refine(value=>{try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}});
/** Structural source observations, never executable code or retained storage values. */
export const runtimeScriptEvidenceSchema=z.object({
  contractVersion:z.literal("certscore.runtime-script-evidence.v1"),scanId:z.string().min(1).max(160),scenario:z.literal("pre_consent"),
  documentUrl:safeUrl,documentId:z.string().min(1).max(160),frameId:z.string().min(1).max(160),scriptUrl:safeUrl,sourceKind:z.enum(["loaded_script","inline_script"]),sourceSha256:hash,
  sourceBytes:z.number().int().positive().max(1_048_576),
  facts:z.array(z.object({
    kind:z.enum(["storage_referrer_flow","cookie_parameter_setter","checkbox_preference_cookie_call","storage_read_context"]),
    name:z.string().min(1).max(160),storageType:z.enum(["localStorage","sessionStorage"]).optional(),
    keySource:z.literal("enumerated_storage_key").optional(),
    useContext:z.enum(["storage_enumeration","storage_cleanup_check","network_argument","unresolved"]).optional(),
    callsite:z.object({line:z.number().int().positive(),column:z.number().int().positive(),endLine:z.number().int().positive(),endColumn:z.number().int().positive()}).strict().optional(),
    helper:z.string().min(1).max(160).optional(),excerpts:z.array(z.object({start:z.number().int().nonnegative(),end:z.number().int().positive(),text:z.string().min(1).max(240)}).strict()).min(1).max(3),start:z.number().int().nonnegative(),end:z.number().int().positive(),expressionSha256:hash,
  }).strict()).max(8),
}).strict().superRefine((row,ctx)=>{if(row.facts.some(fact=>fact.end<=fact.start||fact.end>row.sourceBytes*2||fact.kind === "storage_referrer_flow"&&!fact.storageType||["cookie_parameter_setter","checkbox_preference_cookie_call"].includes(fact.kind)&&!fact.helper||fact.kind === "storage_read_context"&&(!fact.storageType||!fact.useContext||!fact.callsite)||fact.excerpts.some(excerpt=>excerpt.end-excerpt.start!==excerpt.text.length)||fact.excerpts[0]?.start!==fact.start||fact.excerpts[0]?.end!==fact.end))ctx.addIssue({code:"custom",message:"Invalid structural source fact binding"});});
export type RuntimeScriptEvidence=z.infer<typeof runtimeScriptEvidenceSchema>;
export const runtimeStoragePurposeAssessmentSchema=z.object({
  contractVersion:z.literal("certscore.runtime-storage-purpose.v1"),sourceBundleSha256:hash,
  retainedSources:z.array(runtimeScriptEvidenceSchema).max(8),
  items:z.array(z.object({
    kind:z.enum(["cookie","localStorage","sessionStorage"]),name:z.string().min(1).max(240),
    purpose:z.enum(["marketing","personalization","session_replay","consent_management","tag_management","infrastructure","performance_monitoring","customer_support","preferences","analytics","advertising","functional","security","unknown"]),
    dataOrigin:z.enum(["document_referrer","unknown"]),basis:z.enum(["canonical_registry","script_and_runtime","runtime_only"]),
    evidenceRefs:z.array(z.string().min(1).max(240)).min(1).max(8),sourceSha256:hash.optional(),
    reason:z.string().min(1).max(300),
  }).strict()).max(32),
 }).strict().superRefine((row,ctx)=>{
  if(new Set(row.items.map(item=>`${item.kind}:${item.name}`)).size!==row.items.length)ctx.addIssue({code:"custom",message:"Duplicate purpose item"});
  for(const item of row.items){
    const source=row.retainedSources.find(source=>source.sourceSha256===item.sourceSha256);
    if(item.basis === "script_and_runtime"&&(!source||!item.evidenceRefs.includes(`script-source:${source.sourceSha256}`)))ctx.addIssue({code:"custom",message:"Source-based purpose requires retained source binding"});
    if(item.dataOrigin === "document_referrer"&&(!source||!source.facts.some(fact=>fact.kind === "storage_referrer_flow"&&fact.name===item.name&&fact.storageType===item.kind)))ctx.addIssue({code:"custom",message:"Referrer origin requires matching source flow"});
    if(item.purpose === "preferences"&&item.basis === "script_and_runtime"&&(!source||!source.facts.some(fact=>fact.kind === "checkbox_preference_cookie_call"&&fact.name===item.name&&row.retainedSources.some(helper=>helper.documentId===source.documentId&&helper.frameId===source.frameId&&helper.facts.some(proof=>proof.kind === "cookie_parameter_setter"&&proof.helper===fact.helper)))))ctx.addIssue({code:"custom",message:"Preference purpose requires checked-state and cookie-writing source"});
    if(item.basis === "runtime_only"&&(item.purpose!=="unknown"||item.dataOrigin!=="unknown"))ctx.addIssue({code:"custom",message:"Runtime presence alone cannot establish semantics"});
  }
});
export type RuntimeStoragePurposeAssessment=z.infer<typeof runtimeStoragePurposeAssessmentSchema>;

const declaredPurposeSchema=z.object({
  purpose:z.enum(["functional","preferences","unknown"]),declarationRef:z.string().min(1).max(240),
  passage:z.object({evidenceRef:z.string().min(1).max(240),textSha256:hash,start:z.number().int().nonnegative(),end:z.number().int().positive(),excerpt:z.string().min(1).max(480)}).strict(),
}).strict();
export const runtimeStoragePurposeV2Schema=z.object({
  ...runtimeStoragePurposeAssessmentSchema.innerType().shape,
  contractVersion:z.literal("certscore.runtime-storage-purpose.v2"),
  retainedReadTrace:storageReadTraceSchema.optional(),
  inventoryLimited:z.boolean().optional(),
  items:z.array(runtimeStoragePurposeAssessmentSchema.innerType().shape.items.element.extend({
    cookieScope:z.object({domain:z.string().min(1).max(240),path:z.string().min(1).max(240)}).strict().optional(),
    declaredPurpose:declaredPurposeSchema.optional(),
    readUse:z.object({coverageLimited:z.boolean(),status:z.enum(["observed","not_observed_in_window","limited"]),
      reads:z.array(z.object({evidenceRef:z.string().min(1).max(160),context:z.enum(["storage_enumeration","storage_cleanup_check","network_argument","unresolved"]),
        sourceSha256:hash.optional(),callerUrl:safeUrl,line:z.number().int().positive(),column:z.number().int().positive(),
        valueState:z.enum(["absent","empty","nonempty","unknown"]),count:z.number().int().min(1).max(64),
      }).strict()).max(8),reason:z.string().min(1).max(300),
    }).strict().optional(),
  }).strict()).max(32),
}).strict().superRefine((row,ctx)=>{
  const {retainedReadTrace:_,inventoryLimited:___,...base}=row;
  const v1={...base,contractVersion:"certscore.runtime-storage-purpose.v1",items:row.items.map(({declaredPurpose:_,readUse:__,cookieScope:___,...item})=>item)};
  if(!runtimeStoragePurposeAssessmentSchema.safeParse(v1).success)ctx.addIssue({code:"custom",message:"Invalid original purpose bindings"});
  for(const item of row.items){
    const passage=item.declaredPurpose?.passage;
    if(passage&&(passage.end-passage.start!==passage.excerpt.length||item.kind!=="cookie"||!passage.excerpt.startsWith(`${item.name} `)))ctx.addIssue({code:"custom",message:"Invalid declaration passage offsets"});
    if(item.readUse?.reads.some(read=>!row.retainedReadTrace?.observations.some(raw=>raw.id===read.evidenceRef&&raw.name===item.name&&raw.storageType===item.kind&&raw.callerUrl===read.callerUrl&&raw.line===read.line&&raw.column===read.column&&raw.valueState===read.valueState&&raw.count===read.count&&raw.outcome === "returned")))ctx.addIssue({code:"custom",message:"Read use requires retained read observation"});
    if(item.readUse?.status === "not_observed_in_window"&&(item.readUse.coverageLimited||item.readUse.reads.length))ctx.addIssue({code:"custom",message:"A bounded no-read result requires usable trace coverage"});
    if(item.readUse?.reads.some(read=>read.context!=="unresolved"&&!row.retainedSources.some(source=>source.sourceSha256===read.sourceSha256&&source.scriptUrl===read.callerUrl&&row.retainedReadTrace?.observations.some(raw=>raw.id===read.evidenceRef&&raw.documentId===source.documentId&&raw.frameId===source.frameId)&&source.facts.some(fact=>fact.kind === "storage_read_context"&&(fact.name===item.name||fact.keySource === "enumerated_storage_key")&&fact.storageType===item.kind&&fact.useContext===read.context&&fact.callsite&&read.line>=fact.callsite.line&&read.line<=fact.callsite.endLine&&(read.line!==fact.callsite.line||read.column>=fact.callsite.column)&&(read.line!==fact.callsite.endLine||read.column<fact.callsite.endColumn)))))ctx.addIssue({code:"custom",message:"Read-use context needs a matching retained source site"});
    if(item.readUse?.status === "observed"&&!item.readUse.reads.length)ctx.addIssue({code:"custom",message:"Observed reads require a retained observation"});
  }
});
export type RuntimeStoragePurposeV2=z.infer<typeof runtimeStoragePurposeV2Schema>;
