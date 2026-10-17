import {z} from "zod";
import {californiaPassageSchema,californiaPolicyClauses,retainedCaliforniaPassage,type CaliforniaPolicyDocument} from "./california-clause-assessment";

export const CALIFORNIA_SALE_SHARING_TOPICS=["sale","cross_context_sharing","operational_disclosures","analytics"] as const;
export const californiaSaleSharingAssessmentSchema=z.object({
  contractVersion:z.literal("certscore.california-sale-sharing-clauses.v1"),
  sourceBundleSha256:z.string().regex(/^[a-f0-9]{64}$/),
  topics:z.array(z.object({
    topic:z.enum(CALIFORNIA_SALE_SHARING_TOPICS),
    status:z.enum(["described","denied","qualified","conflicting","not_observed","review"]),
    candidateClauseCount:z.number().int().nonnegative(),
    reason:z.string().min(1).max(300),passages:z.array(californiaPassageSchema).max(3),
  }).strict()).length(4),
  choiceBasis:z.enum(["declared_sale_or_sharing","declared_neither","unresolved"]),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.topics.map(topic=>topic.topic)).size!==4 || row.topics.some(topic=>
    topic.status === "not_observed" ? topic.candidateClauseCount!==0 || topic.passages.length>0 : !topic.candidateClauseCount || !topic.passages.length))
    {ctx.addIssue({code:"custom",message:"Every sale/sharing topic requires a unique, retained clause conclusion."});return;}
  const sale=row.topics.find(topic=>topic.topic === "sale")!,sharing=row.topics.find(topic=>topic.topic === "cross_context_sharing")!;
  const basis=[sale,sharing].some(topic=>topic.status === "described")?"declared_sale_or_sharing":
    [sale,sharing].every(topic=>topic.status === "denied")?"declared_neither":"unresolved";
  if(row.choiceBasis!==basis)ctx.addIssue({code:"custom",message:"Choice basis must follow separate sale and cross-context sharing claims."});
});
export type CaliforniaSaleSharingAssessment=z.infer<typeof californiaSaleSharingAssessmentSchema>;

/** Retained policy claims, not verified recipient roles or legal classifications.
 * All documents must already have passed the complete owned-English-text gate. */
export function assessCaliforniaSaleSharingClauses(documents:CaliforniaPolicyDocument[],sourceBundleSha256:string):CaliforniaSaleSharingAssessment {
  const clauses=californiaPolicyClauses(documents);
  const personal=/\b(?:personal (?:information|data)|your (?:information|data|details)|consumer (?:information|data)|data about you)\b/i;
  const sale=/\b(?:sell|sells|selling|sold|sale)\b/i;
  const cross=/\b(?:cross[ -]context(?:ual)?|behavio(?:u)?ral|targeted)\s+(?:behavio(?:u)?ral\s+)?advertis\w*\b/i;
  const operational=/\b(?:service providers?|third.party (?:partners?|providers?)|subcontractors?)\b/i;
  const disclosure=/\b(?:shar\w*|disclos\w*|provid\w*|transfer\w*)\b/i;
  const analytics=/\b(?:analytics|analy[sz]\w*.{0,45}(?:visitors?|web ?site|traffic)|track\w*.{0,45}(?:web ?site|user patterns))\b/i;
  const qualification=/\b(?:except|unless|however|other than|but|depending|certain circumstances|only when|subject to)\b/i;
  const qualifiedClause=(clause:typeof clauses[number])=>qualification.test(clause.text) ||
    /^\s*(?:except|unless|however|but|other than)\b/i.test(clause.document.text.slice(clause.start+clause.text.length,clause.start+clause.text.length+200));
  const topicRows=CALIFORNIA_SALE_SHARING_TOPICS.map(topic=>{
    const candidates=clauses.filter(clause=>{
      const text=clause.text;
      if(topic === "sale")return sale.test(text) && personal.test(text);
      if(topic === "cross_context_sharing")return personal.test(text) && (/\bshar\w*\b/i.test(text) && cross.test(text) || /\b(?:sell|sale).{0,50}(?:or|and) shar\w*\b/i.test(text) && /\b(?:california|ccpa|cpra)\b/i.test(text));
      if(topic === "operational_disclosures")return disclosure.test(text) && operational.test(text) && /\b(?:information|data|service)\b/i.test(text);
      return analytics.test(text);
    });
    const denied=candidates.filter(clause=>{
      if(qualifiedClause(clause))return false;
      const verb=topic === "sale"?"(?:sell|sold|selling)":topic === "analytics"?"(?:use|deploy)":"(?:shar\\w*|disclos\\w*)";
      return new RegExp(`\\b(?:we|(?:our )?(?:company|business))\\s+(?:do not|does not|don.t|never|will not)\\s+(?:${topic === "cross_context_sharing"?"sell (?:or|and) ":""})?${verb}\\b`,"i").test(clause.text);
    });
    const described=candidates.filter(clause=> !qualifiedClause(clause) && !/\b(?:not|never|don.t|opt.out|right to|you may|you can|whether|if we)\b/i.test(clause.text) &&
      (topic === "sale"? /\b(?:we|company|business)\s+(?:may |do |will )?(?:sell|sells)\b/i.test(clause.text) : topic === "cross_context_sharing"?
        /\b(?:we|company|business)\s+(?:may |do |will )?shar\w*\b/i.test(clause.text) : true));
    const qualified=candidates.some(qualifiedClause);
    const status=!candidates.length?"not_observed":denied.length && described.length?"conflicting":qualified?"qualified":denied.length?"denied":described.length?"described":"review";
    // Include both sides of a conflict before bounded supplementary examples.
    const selected=[...new Set([...denied,...described,...candidates])].slice(0,3);
    const reason=status === "not_observed"?"No explicit wording for this topic was found in the completely inspected policy text.":
      status === "conflicting"?"Both affirmative and negative claims were retained; scope or conflict needs review.":
      status === "qualified"?"Qualified wording was retained; exceptions or scope prevent a categorical conclusion.":
      status === "denied"?"An explicit negative policy claim was retained; observed practices and recipient roles are separate.":
      status === "described"?topic === "operational_disclosures"?"Operational/service-provider disclosure wording was retained; this does not establish a legal service-provider exception.":
      topic === "analytics"?"Analytics wording was retained; analytics alone does not establish sale or cross-context sharing.":"An affirmative policy claim was retained; legal classification and business applicability remain separate.":
      "Candidate wording was retained but does not establish a clear business claim.";
    return {topic,status,candidateClauseCount:candidates.length,reason,passages:selected.map(clause=>retainedCaliforniaPassage(clause,
      topic === "sale"?sale:topic === "cross_context_sharing"?cross:topic === "operational_disclosures"?operational:analytics))};
  });
  const decisionRows=topicRows.filter(topic=>topic.topic === "sale" || topic.topic === "cross_context_sharing");
  return californiaSaleSharingAssessmentSchema.parse({contractVersion:"certscore.california-sale-sharing-clauses.v1",sourceBundleSha256,topics:topicRows,
    choiceBasis:decisionRows.some(topic=>topic.status === "described")?"declared_sale_or_sharing":decisionRows.every(topic=>topic.status === "denied")?"declared_neither":"unresolved"});
}
