import { z } from "zod";

export const CALIFORNIA_REVIEW_FAMILIES = ["privacy_notice", "california_rights", "request_methods", "collection_notice", "sale_sharing", "privacy_choices"] as const;
export const CALIFORNIA_REVIEW_FAMILY_LABELS: Record<typeof CALIFORNIA_REVIEW_FAMILIES[number], string> = {
  privacy_notice: "Privacy notice", california_rights: "California rights disclosures", request_methods: "Privacy request methods",
  collection_notice: "Notice at collection", sale_sharing: "Sale/sharing disclosures", privacy_choices: "Sale/sharing choices",
};
export const CALIFORNIA_REVIEW_TOPICS = ["categories", "purposes", "retention", "right_to_know", "right_to_delete", "right_to_correct", "non_discrimination", "request_method", "sale_sharing_statement"] as const;
export const californiaCoverageV1Schema = z.object({
  contractVersion: z.literal("certscore.california-review-coverage.v1"),
  postureBasis: z.literal("assuming_ccpa_applies"),
  runtimeCoverage: z.enum(["complete", "limited"]),
  policyStatement: z.enum(["declares_no_sale_sharing", "describes_sale_sharing", "conflicting", "not_identified"]),
  sourceDocuments: z.array(z.object({ evidenceRef: z.string().min(1).max(240), url: z.string().url().max(800), sha256: z.string().regex(/^[a-f0-9]{64}$/), complete: z.boolean() }).strict()).max(8),
  topics: z.array(z.object({ topic: z.enum(CALIFORNIA_REVIEW_TOPICS), evidenceRef: z.string().min(1).max(240), excerpt: z.string().min(1).max(480) }).strict()).max(18),
  families: z.array(z.object({ id: z.enum(CALIFORNIA_REVIEW_FAMILIES), status: z.enum(["observed", "review", "unknown", "not_triggered_in_scope"]),
    reason: z.string().min(1).max(240), evidenceRefs: z.array(z.string().min(1).max(240)).max(8) }).strict()).length(6),
  scoreReady: z.boolean(),
}).strict().superRefine((row, ctx) => {
  if (new Set(row.families.map(family => family.id)).size !== 6) ctx.addIssue({code:"custom",message:"Every California coverage family must appear once."});
  const ready = row.runtimeCoverage === "complete" && row.sourceDocuments.length > 0 && row.sourceDocuments.every(document => document.complete) &&
    row.families.every(family => family.status === "observed" || family.status === "not_triggered_in_scope");
  if (row.scoreReady !== ready) ctx.addIssue({code:"custom",message:"California score readiness must match retained family coverage."});
  if (row.families.some(family => family.status === "observed" && family.evidenceRefs.length === 0)) ctx.addIssue({code:"custom",message:"Observed coverage requires retained evidence."});
  const documentRefs = new Set(row.sourceDocuments.map(document=>document.evidenceRef));
  if (row.topics.some(topic=>!documentRefs.has(topic.evidenceRef))) ctx.addIssue({code:"custom",message:"Policy passages must reference retained policy documents."});
  if (row.scoreReady && (["categories","purposes","retention","right_to_know","right_to_delete","right_to_correct","non_discrimination","sale_sharing_statement"].some(topic=>!row.topics.some(item=>item.topic === topic)) ||
      !["declares_no_sale_sharing","describes_sale_sharing"].includes(row.policyStatement))) ctx.addIssue({code:"custom",message:"Score-ready coverage requires separate core disclosure passages and an explicit sale/sharing statement."});
});
export const californiaCoverageV2Schema = z.object({
  ...californiaCoverageV1Schema.innerType().shape,
  contractVersion:z.literal("certscore.california-review-coverage.v2"),
  captureCoverage:z.object({policyTextComplete:z.boolean(),choiceInventoryComplete:z.boolean(),collectionInventoryComplete:z.boolean()}).strict(),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.families.map(family=>family.id)).size!==6) ctx.addIssue({code:"custom",message:"Every California coverage family must appear once."});
  const policyComplete=row.sourceDocuments.length>0 && row.sourceDocuments.every(document=>document.complete);
  const ready=row.runtimeCoverage === "complete" && policyComplete && Object.values(row.captureCoverage).every(Boolean);
  if(row.scoreReady!==ready || row.captureCoverage.policyTextComplete && !policyComplete) ctx.addIssue({code:"custom",message:"Score eligibility must match verified capture coverage."});
  const refs=new Set(row.sourceDocuments.map(document=>document.evidenceRef));
  if(row.topics.some(topic=>!refs.has(topic.evidenceRef)) || row.families.some(family=>family.status === "observed" && !family.evidenceRefs.length)) {
    ctx.addIssue({code:"custom",message:"Coverage and passages require retained source evidence."});
  }
});
export const californiaCoverageV3Schema=z.object({
  ...californiaCoverageV2Schema.innerType().shape,
  contractVersion:z.literal("certscore.california-review-coverage.v3"),
  families:z.array(z.object({id:z.enum(CALIFORNIA_REVIEW_FAMILIES),
    status:z.enum(["observed","assessed_gap","review","unknown","not_triggered_in_scope"]),
    reason:z.string().min(1).max(240),evidenceRefs:z.array(z.string().min(1).max(240)).max(8)}).strict()).length(6),
}).strict().superRefine((row,ctx)=>{
  const legacy=californiaCoverageV2Schema.safeParse({...row,contractVersion:"certscore.california-review-coverage.v2",
    families:row.families.map(family=>({...family,status:family.status === "assessed_gap"?"review":family.status}))});
  if(!legacy.success || row.families.some(family=>family.status === "assessed_gap" && !family.evidenceRefs.length))
    ctx.addIssue({code:"custom",message:"Assessed coverage requires complete capture and retained source evidence."});
});
export const CALIFORNIA_ASSESSMENT_STATES=["completed","partial","limited"] as const;
export const CALIFORNIA_FOLLOW_UPS=["none","purpose","notice_association","recipient_roles","applicability","choice_execution","interpretation","capture"] as const;
export type CaliforniaFollowUp=typeof CALIFORNIA_FOLLOW_UPS[number];
export const californiaCoverageV4Schema=z.object({
  ...californiaCoverageV3Schema.innerType().shape,contractVersion:z.literal("certscore.california-review-coverage.v4"),
  families:z.array(californiaCoverageV3Schema.innerType().shape.families.element.extend({
    assessmentState:z.enum(CALIFORNIA_ASSESSMENT_STATES),followUp:z.enum(CALIFORNIA_FOLLOW_UPS),
  }).strict()).length(6),
}).strict().superRefine((row,ctx)=>{
  const previous=californiaCoverageV3Schema.safeParse({...row,contractVersion:"certscore.california-review-coverage.v3",
    families:row.families.map(({assessmentState,followUp,...family})=>family)});
  if(!previous.success || row.families.some(family=>family.assessmentState === "completed" && (family.status === "unknown" || !family.evidenceRefs.length) ||
    family.status === "assessed_gap" && family.assessmentState!=="completed" || family.status === "review" && family.followUp === "none"))
    ctx.addIssue({code:"custom",message:"Assessment completion and follow-up must preserve evidence and unresolved review independently."});
});
export const californiaCoverageSchema=z.union([californiaCoverageV1Schema,californiaCoverageV2Schema,californiaCoverageV3Schema,californiaCoverageV4Schema]);
export type CaliforniaReviewCoverage = z.infer<typeof californiaCoverageSchema>;

export function californiaCoverageFamilyLabel(row:CaliforniaReviewCoverage["families"][number]) {
  if(!("assessmentState" in row))return row.status === "observed"?"Evidence retained":row.status === "assessed_gap"?"Assessed: disclosure gaps found":row.status === "review"?"Review":row.status === "unknown"?"Limited":"Not triggered in assessed scope";
  if(row.status === "assessed_gap")return "Assessed: disclosure gaps found";
  const assessment=row.assessmentState === "completed"?row.id === "sale_sharing"?"Policy text assessed":row.id === "privacy_choices"?"Page inspection complete":"Assessed":row.assessmentState === "partial"?"Partly assessed":"Limited capture";
  const followUp={none:"",purpose:"purpose unresolved",notice_association:"notice association unresolved",recipient_roles:"recipient roles unresolved",applicability:"obligation unresolved",choice_execution:"choice execution untested",interpretation:"wording needs interpretation",capture:"capture incomplete"}[row.followUp];
  return followUp?`${assessment} · ${followUp}`:assessment;
}

/** Positive passage location only. Absence never establishes a missing disclosure.
 * Keep California rights separate from generic Canadian/EU access language. */
export function locateCaliforniaReviewTopics(text: string, options: {californiaNotice?:boolean} = {}) {
  const bounded = text.slice(0, 160_000).replace(/\s+/g, " ").trim();
  const sentences = bounded.split(/(?<=[.!?])\s+(?=[A-Z])/u);
  const rules = [
    ["categories", /\b(?:categories of (?:personal |sensitive personal )?(?:information|data)|(?:personal )?information (?:we|that we) collect|(?:such|personal) information includes)\b/i],
    ["purposes", /\b(?:purposes? (?:for|of)|(?:we|[a-z]+) (?:use|uses|collect|collects|process|processes) (?:your |the |this )?(?:personal )?(?:information|data) (?:to|for))\b/i],
    ["retention", /\b(?:retain|keep|store)\b.{0,120}\b(?:for (?:as long|\d+|the (?:time|period))|(?:only )?as long as (?:is )?(?:necessary|needed)|until|as necessary)|\bretention (?:periods?|criteria|schedule)\b/i],
    ["right_to_know", /\b(?:right to (?:know|access)|request (?:access to|a copy of|that we disclose))\b.{0,140}\b(?:personal (?:information|data)|information (?:we|that))\b/i],
    ["right_to_delete", /\b(?:right to (?:request )?(?:delete|deletion)|request (?:that we |us to )?delete)\b.{0,140}\b(?:personal (?:information|data)|your (?:information|data))\b/i],
    ["right_to_correct", /\b(?:right to (?:request )?(?:correct|correction)|request (?:that we |us to )?correct)\b.{0,140}\b(?:personal (?:information|data)|inaccurate (?:information|data))\b/i],
    ["non_discrimination", /\b(?:will not|do not|won.t) discriminate\b.{0,180}\b(?:privacy rights|ccpa|cpra|rights)|\bright to (?:non.discrimination|not be discriminated)\b/i],
    ["request_method", /\b(?:submit|exercise|make|send|request|contact)\b.{0,180}\b(?:privacy|rights|access|deletion|correction)\b.{0,180}(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:call|phone|telephone|online form|request form|web form)\b)|\b(?:privacy|rights|access|deletion|correction)\b.{0,180}\b(?:submit|exercise|request|contact)\b.{0,180}(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:call|phone|telephone|online form|request form|web form)\b)/i],
  ] as const;
  const topics: Array<{topic:typeof CALIFORNIA_REVIEW_TOPICS[number];excerpt:string}> = rules.flatMap(([topic, pattern]) => {
    const rightsTopic = ["right_to_know", "right_to_delete", "right_to_correct", "non_discrimination"].includes(topic);
    const sentence = sentences.find(sentence => {
      if (!pattern.test(sentence) || /\b(?:do not have|does not provide|do not provide|have no|waive your|not entitled to|cannot exercise)\b/i.test(sentence)) return false;
      const offset = bounded.indexOf(sentence);
      return !rightsTopic || options.californiaNotice || /\b(?:california|ccpa|cpra)\b/i.test(bounded.slice(Math.max(0,offset-1200),offset+sentence.length));
    });
    const match = sentence ? pattern.exec(sentence) : null;
    return sentence && match ? [{topic, excerpt: sentence.slice(Math.max(0,match.index-40),Math.max(0,match.index-40)+480).trim()}] : [];
  });
  // These are policy claims, never verified legal sale/sharing classifications.
  const negativePattern = /\bwe (?:do not|don.t|never) (?:sell (?:or|and) share|sell.{0,60}and.{0,20}(?:do not|don.t) share)\b.{0,100}\bpersonal (?:information|data)\b/i;
  const positivePattern = /\bwe (?:(?:may|do) )?(?:sell|share)\b.{0,120}\bpersonal (?:information|data)\b/i;
  const negative = sentences.find(sentence => negativePattern.test(sentence) && !/\b(?:except|unless|however|but|other than)\b/i.test(sentence));
  const positive = sentences.find(sentence => positivePattern.test(sentence) &&
    !/\b(?:not|never|don.t)\b/i.test(sentence) && /\b(?:sell|cross.context|behavioral advertising|ccpa|cpra)\b/i.test(sentence));
  const policyStatement = negative && positive ? "conflicting" as const : negative ? "declares_no_sale_sharing" as const : positive ? "describes_sale_sharing" as const : "not_identified" as const;
  for (const [sentence,pattern] of [[negative,negativePattern],[positive,positivePattern]] as const) if (sentence) {
    const offset = Math.max(0,(pattern.exec(sentence)?.index ?? 0)-40);
    topics.push({topic:"sale_sharing_statement", excerpt:sentence.slice(offset,offset+480).trim()});
  }
  return {topics, policyStatement};
}
