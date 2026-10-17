import { z } from "zod";

export const CALIFORNIA_RIGHTS_DISCLOSURE_ID = "california_rights_disclosure_not_observed";
export const CALIFORNIA_RIGHTS_TOPICS = ["right_to_know", "right_to_delete", "right_to_correct", "non_discrimination"] as const;
export const californiaDisclosureInspectionSchema = z.object({
  contractVersion: z.literal("certscore.california-disclosure-inspection.v1"),
  sourceBundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  method: z.literal("complete_english_policy_concept_inventory.v1"),
  documents: z.array(z.object({
    evidenceRef: z.string().min(1).max(240), textSha256: z.string().regex(/^[a-f0-9]{64}$/),
    inspectedChars: z.number().int().positive().max(160_000),
  }).strict()).min(1).max(8),
  topics: z.array(z.object({topic: z.enum(CALIFORNIA_RIGHTS_TOPICS),
    status: z.enum(["candidate_present", "not_observed"]), candidateCount: z.number().int().min(0),
  }).strict()).length(4),
}).strict().superRefine((row, ctx) => {
  if (new Set(row.topics.map(topic => topic.topic)).size !== 4 ||
      new Set(row.documents.map(document => document.evidenceRef)).size !== row.documents.length ||
      row.topics.some(topic => (topic.status === "not_observed") !== (topic.candidateCount === 0))) {
    ctx.addIssue({code: "custom", message: "Disclosure inspection counts and identities must reconcile."});
  }
});
export type CaliforniaDisclosureInspection = z.infer<typeof californiaDisclosureInspectionSchema>;

// Broad concepts intentionally exceed the positive-passage locator. Any possible
// equivalent wording keeps the topic in review; a failed positive regex is not
// negative evidence. Destruction/erasure in retention text also blocks a deletion
// absence conclusion, even though it does not establish the consumer right.
const CANDIDATE_CONCEPTS = {
  right_to_know: /\b(?:access\w*|know\w*|portab\w*|cop(?:y|ies)|disclos\w*)\b/gi,
  right_to_delete: /\b(?:delet\w*|eras\w*|destroy\w*|destruc\w*|remov\w*|forg(?:e|o)t\w*)\b/gi,
  right_to_correct: /\b(?:correct\w*|rectif\w*|accura\w*|updat\w*|amend\w*|fix\w*|mistak\w*)\b/gi,
  non_discrimination: /\b(?:discrimin\w*|retaliat\w*|penal\w*|equal\w*|same (?:prices?|services?|quality|treatment)|different (?:prices?|rates?|quality)|adverse treatment|less favou?rable|(?:deny|denying|refuse|refusing) (?:you )?(?:goods|services)|(?:worse|lower) (?:service|quality)|(?:treat\w*|charg\w*|prices?|fees?|incentiv\w*|benefit\w*).{0,160}(?:exercis\w*|privacy (?:rights|request))|(?:exercis\w*|using|use of).{0,60}(?:rights|choices).{0,160}(?:affect\w*|chang\w*|modif\w*|influenc\w*|impact\w*|alter\w*|result\w*|prejudic\w*|consequenc\w*))\b/gi,
} as const;

/** Call only after verifying complete, owned, untranslated English source text
 * and all material linked supplements. Outputs scoped content observations,
 * never a claim that a right is unavailable or that a business violated law. */
export function inspectCaliforniaRightsConcepts(texts: string[]) {
  return CALIFORNIA_RIGHTS_TOPICS.map(topic => {
    const candidateCount = texts.reduce((sum, text) => sum + [...text.normalize("NFKC").matchAll(new RegExp(CANDIDATE_CONCEPTS[topic]))].length, 0);
    return {topic, status: candidateCount ? "candidate_present" as const : "not_observed" as const, candidateCount};
  });
}
