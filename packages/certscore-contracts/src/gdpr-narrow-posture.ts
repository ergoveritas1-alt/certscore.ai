import { z } from "zod";
import { classifyConsentPreferenceCategoryLabel } from "./consent-preference-category-classifier";

/** Explicit optional-advertising assent language, not general terms acceptance
 * or an analytics-only statement whose exemption context is unresolved. */
export function explicitAdvertisingBrowsingAssent(text: string) {
  // DOM text extraction can join a heading directly to this exact sentence.
  // Restore only its whitespace boundary, preserving the surrounding context.
  const bounded = text.slice(0, 1200).replace(/([a-z])(?=We use cookies\b)/g, "$1 ");
  for (const match of bounded.matchAll(/\bby\s+continuing\s+to\s+(?:browse|navigate|use|access)[^.!?\n]{0,120}\b(?:agree|consent)\b[^.!?\n]{0,100}\b(?:cookies?|this use)\b/gi)) {
    const context = bounded.slice(Math.max(0, match.index! - 220), Math.min(bounded.length, match.index! + match[0].length + 180));
    if (/\b(?:not|never|example|formerly|previously)\b/i.test(match[0]) ||
      /\b(?:example|formerly|previously|invalid|do not treat|does not constitute)\b/i.test(context) ||
      !/\bcookies?\b/i.test(context) ||
      !/\b(?:marketing|advertis(?:ing|ements?)|personalized content and ads|personalised content and ads)\b/i.test(context)) continue;
    // Require an affirmative purpose clause. Mere nearby advertising words,
    // including a statement that advertising cookies are blocked, are unknown.
    const affirmative = context.split(/[.!?\n]/).some(sentence =>
      /\b(?:we|(?:the|this|our)\s+(?:website|site))\s+uses?\s+cookies?\b[^.!?]{0,200}\b(?:marketing|advertising|ads)\b/i.test(sentence) &&
      !/\b(?:not|never|no|only|disabled|off|block(?:ed|s)?|prevent(?:ed|s)?|unless|until|after|if)\b/i.test(sentence));
    if (!affirmative || /\b(?:not|never|disabled|off|block(?:ed|s)?|prevent(?:ed|s)?)\b/i.test(context) ||
      /\bonly\s+(?:strictly\s+)?(?:essential|necessary)\s+cookies?\b/i.test(context) ||
      /\b(?:consent|agree)\b[^.!?]{0,80}\b(?:essential|necessary)\s+cookies?\b/i.test(match[0])) continue;
    return { clause: match[0], context };
  }
  return null;
}

/** Versioned paragraph recognition. The v1 reader above stays frozen for
 * historical assessments. Callers must bind this text to one visible container. */
export function explicitAdvertisingBrowsingAssentV2(text: string) {
  const bounded = text.slice(0, 1200).replace(/([a-z])(?=We use cookies\b)/g, "$1 ");
  if (/\b(?:not|never|no|only|without|example|formerly|previously|invalid|disabled|off|block(?:ed|s)?|prevent(?:ed|s)?|after|unless|until)\b/i.test(bounded) ||
    /\b(?:agree|consent)\s+(?:to|with)\s+(?:(?:our|the|this|these)\s+)?(?:terms\b|(?:privacy|cookie)\s+polic(?:y|ies)\b|cookie\s+notice\b)/i.test(bounded)) return null;
  const legacy = explicitAdvertisingBrowsingAssent(bounded);
  if (legacy) {
    const assent = /\b(?:agree|consent)\b/i.exec(legacy.clause);
    const tail = assent ? bounded.slice(bounded.indexOf(legacy.clause) + assent.index) : "";
    // Positive object binding avoids treating updated/qualified policy titles
    // or "agree that a policy applies" as consent to cookie use.
    return /^(?:agree|consent)\s+(?:to\s+)?(?:(?:our|the)\s+)?(?:use\s+of\s+cookies?\b|this\s+use\b|cookies?\b(?!\s+(?:policy|notice)\b)|stor(?:ing|age)\s+(?:of\s+)?cookies?\b)/i.test(tail) ? legacy : null;
  }
  // Continuation must be an independently sufficient OR branch of the actual
  // cookie-consent sentence; a click followed by browsing is not enough.
  const match = /\byou\s+(?:consent|agree)\s+to\s+(?:our|the|these)\s+cookies\s+if\s+you\s+(?:click|select)\s+[^.!?\n]{1,60}?\s+or\s+continue\s+to\s+(?:use|browse|navigate|access)\s+(?:our|the|this)\s+(?:website|site)\b/i.exec(bounded);
  if (!match) return null;
  const purpose = bounded.split(/[.!?\n]/).find(sentence =>
    /\b(?:we|(?:the|this|our)\s+(?:website|site))\s+uses?\s+cookies?\b[^.!?]{0,200}\b(?:marketing|advertising|ads)\b/i.test(sentence) &&
    !/\b(?:not|never|no|only|disabled|off|block(?:ed|s)?|prevent(?:ed|s)?|unless|until|after|if)\b/i.test(sentence));
  return purpose ? { clause: match[0], context: bounded } : null;
}

export const GDPR_NARROW_POSTURE_VERSION = "certscore.gdpr-narrow-posture.v1" as const;
export const GDPR_NARROW_RULES = {
  optional_defaults: { rowId: "consent_optional_defaults_on", title: "Optional cookie purposes selected by default", consent: true },
  implied_consent: { rowId: "consent_browsing_as_consent", title: "Browsing presented as consent to optional cookies", consent: true },
  legal_basis: { rowId: "legal_basis_disclosure_observed", title: "Processing legal-basis explanation not stated", consent: false },
  retention: { rowId: "retention_disclosure_observed", title: "Personal-data retention period or criteria not stated", consent: false },
  complaint: { rowId: "supervisory_authority_complaint_disclosure", title: "Supervisory-authority complaint right not stated", consent: false },
} as const;
export type GdprNarrowKind = keyof typeof GDPR_NARROW_RULES;
export const GDPR_NARROW_KINDS = Object.keys(GDPR_NARROW_RULES) as GdprNarrowKind[];
/** Current local authorization. All five contracts remain readable for audit;
 * candidates 3–5 must not create new findings or effects. */
export const GDPR_NARROW_ACTIVE_KINDS = ["optional_defaults", "implied_consent"] as const;
export function isActiveGdprNarrowKind(kind: GdprNarrowKind | undefined): kind is typeof GDPR_NARROW_ACTIVE_KINDS[number] {
  return (GDPR_NARROW_ACTIVE_KINDS as readonly string[]).includes(kind ?? "");
}
export const gdprNarrowFindingId = (kind: GdprNarrowKind) => `gdpr_narrow_${kind}`;
export const GDPR_NARROW_SIGNAL = "privacy.gdpr_narrow";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const url = z.string().url().max(2000).refine(value => /^https?:\/\//.test(value));
const documentSchema = z.object({
  observationId: z.string().min(1).max(160), url, textSha256: hash,
  textChars: z.number().int().min(1000).max(100_000), locale: z.literal("en"),
}).strict();
/** A completed substantive review, not a keyword/topic no-match. Source
 * verification and document-set hashing belong to the materializer. */
export const gdprNoticeOmissionReviewSchema = z.object({
  contractVersion: z.literal("certscore.gdpr-notice-omission-review.v1"),
  scanId: z.string().min(1).max(160), sourceBundleSha256: hash, targetUrl: url,
  documentSetSha256: hash, documents: z.array(documentSchema).min(1).max(8),
  provenance: z.object({
    method: z.enum(["model_review", "human_review"]), reviewer: z.string().min(3).max(100),
    evaluatorVersion: z.string().min(3).max(100), reviewId: z.string().min(1).max(160),
    reviewedAt: z.string().datetime(),
  }).strict(),
  scope: z.object({
    governingNoticeConfirmed: z.literal(true), materialSupplementsResolved: z.literal(true),
    equivalentLanguageReviewed: z.literal(true),
    supplementDispositions: z.array(z.object({ url, disposition: z.enum(["reviewed", "irrelevant"]),
      rationale: z.string().min(20).max(500) }).strict()).max(16),
  }).strict(),
  verdicts: z.array(z.object({
    topic: z.enum(["legal_basis", "retention", "complaint"]),
    verdict: z.enum(["omission_confirmed", "present", "unknown"]),
    rationale: z.string().min(40).max(700),
  }).strict()).min(1).max(3),
}).strict().refine(review => new Set(review.verdicts.map(v => v.topic)).size === review.verdicts.length);
export type GdprNoticeOmissionReview = z.infer<typeof gdprNoticeOmissionReviewSchema>;
export const gdprNarrowIssueSchema = z.object({
  kind: z.enum(["optional_defaults", "implied_consent", "legal_basis", "retention", "complaint"]),
  method: z.enum(["observed_optional_states.v1", "explicit_advertising_assent.v1", "explicit_advertising_assent.v2-paragraph", "reviewed_notice_omission.v1"]),
  sourceUrl: url, evidenceRef: z.string().min(1).max(240),
  evidenceText: z.string().min(1).max(1200),
  mechanismId: z.string().min(1).max(240).optional(),
  optionalLabels: z.array(z.string().min(1).max(120)).max(10).optional(),
  documentToken: z.string().min(1).max(200).optional(),
  geometrySha256: hash.optional(), geometrySizeBytes: z.number().int().positive().optional(),
  geometryContainerId: z.string().min(1).max(160).optional(),
  geometryContainerSelector: z.string().min(1).max(1000).optional(),
  observedAtMs: z.number().nonnegative().finite().optional(),
  documents: z.array(documentSchema).max(8).optional(),
  documentSetSha256: hash.optional(),
  scope: z.literal("complete_governing_notice_and_material_supplements").optional(),
}).strict().superRefine((issue, ctx) => {
  const consent = GDPR_NARROW_RULES[issue.kind].consent;
  const valid = consent
    ? Boolean(issue.mechanismId && issue.documentToken && issue.geometrySha256 && issue.geometrySizeBytes && issue.observedAtMs !== undefined &&
      (issue.kind === "optional_defaults" ? issue.method === "observed_optional_states.v1" && issue.optionalLabels?.length &&
        issue.optionalLabels.every(label => classifyConsentPreferenceCategoryLabel(label) === "optional")
        : issue.method === "explicit_advertising_assent.v1" ? explicitAdvertisingBrowsingAssent(issue.evidenceText)
          : issue.method === "explicit_advertising_assent.v2-paragraph" && issue.geometryContainerId && issue.geometryContainerSelector &&
            explicitAdvertisingBrowsingAssentV2(issue.evidenceText)))
    : issue.method === "reviewed_notice_omission.v1" && Boolean(issue.documents?.length && issue.documentSetSha256 && issue.scope);
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing source-bound narrow assessment proof" });
}).refine(value => JSON.stringify(value).length <= 24_000, "Bounded narrow assessment exceeded");
export const gdprNarrowPostureSchema = z.object({
  contractVersion: z.literal(GDPR_NARROW_POSTURE_VERSION), scanId: z.string().min(1).max(160),
  sourceBundleSha256: hash, targetUrl: url,
  noticeReview: gdprNoticeOmissionReviewSchema.optional(),
  issues: z.array(gdprNarrowIssueSchema).max(5),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.issues.map(issue => issue.kind)).size !== value.issues.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A narrow rule may occur only once per assessment" });
  for (const issue of value.issues.filter(i => !GDPR_NARROW_RULES[i.kind].consent)) {
    const review = value.noticeReview;
    if (!review || review.scanId !== value.scanId || review.sourceBundleSha256 !== value.sourceBundleSha256 ||
      review.targetUrl !== value.targetUrl || review.documentSetSha256 !== issue.documentSetSha256 ||
      JSON.stringify(review.documents) !== JSON.stringify(issue.documents) ||
      !review.verdicts.some(v => v.topic === issue.kind && v.verdict === "omission_confirmed" && v.rationale === issue.evidenceText))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Omission requires its matching completed substantive review" });
  }
}).refine(value => JSON.stringify(value).length <= 24_000, "Bounded narrow assessment exceeded");
export type GdprNarrowPostureAssessment = z.infer<typeof gdprNarrowPostureSchema>;
export type GdprNarrowIssue = z.infer<typeof gdprNarrowIssueSchema>;
export function readGdprNarrowPosture(value: unknown) {
  const parsed = gdprNarrowPostureSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
