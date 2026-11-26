import { z } from "zod";

export const CALIFORNIA_ADDITIONAL_REVIEW_VERSION = "california-additional-review.v1" as const;
export const CALIFORNIA_COLLECTION_NOTICE_FINDING = "california_collection_notice_gap" as const;
export const CALIFORNIA_CHOICE_FRICTION_FINDING = "california_privacy_choice_friction" as const;
export const CALIFORNIA_SENSITIVE_TRANSMISSION_FINDING = "california_sensitive_field_transmission" as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.string().min(1).max(240);
const documentUrl = z.string().url().max(800).refine(value => {
  const url = new URL(value);
  return /^https?:$/.test(url.protocol) && !url.username && !url.password;
});
const retainedDocument = z.object({ url: documentUrl, sha256: hash, evidenceRef: ref }).strict();
export const californiaSensitiveFieldCategories = [
  "health", "social_security_number", "government_id", "payment_card", "bank_account", "password",
] as const;

const californiaMandatoryAccountScope = (text: string) => {
  // Require an explicit instruction from the exact applicable destination.
  // An invitation to sign in or a form for other request types is insufficient.
  const match = /^(?:To|In order to) (opt out of (?:the )?(?:sale (?:or|and) sharing|sale or share|sale|sharing) of your personal information|limit the use (?:and|or) disclosure of your sensitive personal information), you (?:must|are required to) (?:create|register for|sign up for) an account[.!]?$/i.exec(text);
  return match?.[1]?.toLowerCase().startsWith("opt out") ? "sale_or_sharing" as const
    : match ? "sensitive_information_limit" as const : undefined;
};

export function findCaliforniaMandatoryAccountClause(text: string) {
  if (!text.length || text.length > 32_000 ||
      /\b(?:without (?:an? account|signing in|registering|logging in)|no account (?:is )?required|an account (?:is )?not required|account (?:creation )?is optional|as a guest|alternatively|another way to|you can also)\b/i.test(text)) return;
  for (const sentence of text.match(/[^.!?]+[.!?]?/g) ?? []) {
    const excerpt = sentence.trim();
    if (excerpt.length > 240) continue;
    const scope = californiaMandatoryAccountScope(excerpt);
    if (scope) return { scope, excerpt };
  }
}

const californiaMandatoryAccountClauseSchema = z.object({
  scope: z.enum(["sale_or_sharing", "sensitive_information_limit"]),
  excerpt: z.string().min(1).max(240),
}).strict();

export const californiaChoiceBarrierObservationSchema = californiaMandatoryAccountClauseSchema.extend({
  sourceDocumentUrl: documentUrl,
  destinationUrl: documentUrl,
  textSha256: hash,
}).strict().refine(row => californiaMandatoryAccountScope(row.excerpt) === row.scope);

export const californiaAdditionalReviewSchema = z.object({
  version: z.literal(CALIFORNIA_ADDITIONAL_REVIEW_VERSION),
  scanId: z.string().min(1).max(160),
  sourceBundleSha256: hash,
  documentUrl,
  notice: z.object({
    issue: z.enum(["no_notice_in_completed_inspection", "retention_missing_from_reviewed_notice"]),
    points: z.array(z.object({
      formRef: ref,
      categories: z.array(z.enum(["name", "email", "phone", "address", ...californiaSensitiveFieldCategories])).min(1).max(10),
      evidenceRefs: z.array(ref).min(1).max(4),
    }).strict()).min(1).max(10),
    documents: z.array(retainedDocument).max(8),
  }).strict().optional(),
  choiceFriction: californiaMandatoryAccountClauseSchema.extend({
    barrier: z.literal("account_creation_required"),
    controlEvidenceRef: ref,
    document: retainedDocument,
  }).strict().optional(),
  sensitiveTransmission: z.array(z.object({
    category: z.enum(californiaSensitiveFieldCategories),
    recipientHost: z.string().max(255).regex(/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i),
    responseStatus: z.number().int().min(200).max(299),
    requestEvidenceRef: ref,
    fieldEvidenceRef: ref,
  }).strict()).min(1).max(12).optional(),
}).strict().superRefine((proof, context) => {
  if (!proof.notice && !proof.choiceFriction && !proof.sensitiveTransmission ||
      proof.notice && (proof.notice.issue === "retention_missing_from_reviewed_notice") !== Boolean(proof.notice.documents.length) ||
      proof.choiceFriction && californiaMandatoryAccountScope(proof.choiceFriction.excerpt) !== proof.choiceFriction.scope) {
    context.addIssue({ code: "custom", message: "California review findings require corresponding retained evidence." });
  }
});

export type CaliforniaAdditionalReview = z.infer<typeof californiaAdditionalReviewSchema>;
