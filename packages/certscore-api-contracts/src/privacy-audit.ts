import { z } from "zod";

export const reportReviewFocusSchema = z.enum(["gdpr_eprivacy", "ccpa_cpra"]);
export type ReportReviewFocus = z.infer<typeof reportReviewFocusSchema>;

const evidenceUrl = z.string().url().max(800).refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Evidence URLs must be display-safe HTTP URLs without credentials, queries or fragments.");

export const privacyAuditEvidenceSchema = z.object({
  contractVersion: z.literal("certscore.privacy-audit-evidence.v1"),
  scanId: z.string().min(1),
  documentUrl: evidenceUrl,
  capturedAt: z.string().datetime(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  verificationStatus: z.literal("verified"),
  scoreEffect: z.literal("none"),
  passagePolicy: z.literal("california_notice_passages.v1"),
  controls: z.array(z.object({
    kind: z.enum(["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]),
    label: z.string().max(200),
    sourceUrl: evidenceUrl,
    destinationUrl: evidenceUrl.nullable(),
    placement: z.string().max(80),
    evidenceRef: z.string().min(1).max(240),
    retrieval: z.enum(["not_attempted", "fetched", "failed", "skipped_budget"]),
    interaction: z.literal("not_tested"),
  }).strict()).max(12),
  notices: z.array(z.object({
    kind: z.enum(["privacy_policy", "california_notice", "notice_at_collection"]),
    url: evidenceUrl,
    evidenceRef: z.string().min(1).max(240),
    directlyLinkedFromScannedPage: z.boolean(),
    coverage: z.enum(["complete", "partial"]),
    passages: z.array(z.object({
      topic: z.enum(["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"]),
      excerpt: z.string().min(1).max(480),
    }).strict()).max(5),
  }).strict()).max(4),
  // The existing privacy-policy search does not establish DNS/control absence.
  negativeControlCoverage: z.literal("not_verified"),
  collectionPointNoticeAssessment: z.literal("not_assessed"),
  truncated: z.boolean(),
}).strict();
export type PrivacyAuditEvidence = z.infer<typeof privacyAuditEvidenceSchema>;

/** Compact factual view; counts and source references refer to the retained workpaper. */
export const privacyAuditSummarySchema = privacyAuditEvidenceSchema.pick({
  contractVersion: true, scanId: true, capturedAt: true, sourceHash: true,
  verificationStatus: true, scoreEffect: true, negativeControlCoverage: true,
  collectionPointNoticeAssessment: true,
}).extend({
  retainedControlCount: z.number().int().nonnegative(),
  retainedNoticeCount: z.number().int().nonnegative(),
  controls: privacyAuditEvidenceSchema.shape.controls.element.array().max(3),
  notices: z.array(privacyAuditEvidenceSchema.shape.notices.element.omit({ passages: true }).extend({
    topics: z.array(privacyAuditEvidenceSchema.shape.notices.element.shape.passages.element.shape.topic).max(5),
  })).max(2),
  truncated: z.boolean(),
}).strict();
