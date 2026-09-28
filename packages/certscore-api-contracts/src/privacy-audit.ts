import { z } from "zod";

export const reportReviewFocusSchema = z.enum(["gdpr_eprivacy", "ccpa_cpra"]);
export type ReportReviewFocus = z.infer<typeof reportReviewFocusSchema>;

const evidenceUrl = z.string().url().max(800).refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Evidence URLs must be display-safe HTTP URLs without credentials, queries or fragments.");

const controlSchema = z.object({
  kind: z.enum(["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]),
  label: z.string().max(200),
  sourceUrl: evidenceUrl,
  destinationUrl: evidenceUrl.nullable(),
  placement: z.string().max(80),
  evidenceRef: z.string().min(1).max(240),
  classificationProvenance: z.literal("privacy_surface_classifier.v1").optional(),
  accessibleNameSource: z.enum(["aria_label", "aria_labelledby", "text", "image_alt", "svg_title", "title"]).optional(),
  retrieval: z.enum(["not_attempted", "fetched", "failed", "skipped_budget"]),
  interaction: z.literal("not_tested"),
}).strict();

const controlCandidateSchema = z.object({
  kind: controlSchema.shape.kind,
  label: z.string().min(1).max(200),
  sourceUrl: evidenceUrl,
  destinationUrl: evidenceUrl,
  placement: z.string().max(80),
  evidenceRef: z.string().min(1).max(240),
  verification: z.enum(["visibility_unverified", "accessible_name_unverified"]),
}).strict();

const noticeSchema = z.object({
  kind: z.enum(["privacy_policy", "california_notice", "notice_at_collection"]),
  url: evidenceUrl,
  evidenceRef: z.string().min(1).max(240),
  directlyLinkedFromScannedPage: z.boolean(),
  coverage: z.enum(["complete", "partial"]),
  passages: z.array(z.object({
    topic: z.enum(["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"]),
    excerpt: z.string().min(1).max(480),
  }).strict()).max(5),
}).strict();

const privacyAuditBaseSchema = z.object({
  scanId: z.string().min(1),
  documentUrl: evidenceUrl,
  capturedAt: z.string().datetime(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  verificationStatus: z.literal("verified"),
  scoreEffect: z.literal("none"),
  passagePolicy: z.literal("california_notice_passages.v1"),
  controls: controlSchema.array().max(12),
  notices: noticeSchema.array().max(4),
  // The existing privacy-policy search does not establish DNS/control absence.
  negativeControlCoverage: z.literal("not_verified"),
  collectionPointNoticeAssessment: z.literal("not_assessed"),
  truncated: z.boolean(),
}).strict();
export const privacyAuditEvidenceV1Schema = privacyAuditBaseSchema.extend({
  contractVersion: z.literal("certscore.privacy-audit-evidence.v1"),
});
export const privacyAuditEvidenceV2Schema = privacyAuditBaseSchema.extend({
  contractVersion: z.literal("certscore.privacy-audit-evidence.v2"),
  controlCandidates: controlCandidateSchema.array().max(12),
});
export const privacyAuditEvidenceSchema = z.union([privacyAuditEvidenceV1Schema, privacyAuditEvidenceV2Schema]);
export type PrivacyAuditEvidence = z.infer<typeof privacyAuditEvidenceSchema>;
export type PrivacyAuditEvidenceV2 = z.infer<typeof privacyAuditEvidenceV2Schema>;

/** Compact factual view; counts and source references refer to the retained workpaper. */
export const privacyAuditSummarySchema = privacyAuditBaseSchema.pick({
  scanId: true, capturedAt: true, sourceHash: true,
  verificationStatus: true, scoreEffect: true, negativeControlCoverage: true,
  collectionPointNoticeAssessment: true,
}).extend({
  contractVersion: z.enum(["certscore.privacy-audit-evidence.v1", "certscore.privacy-audit-evidence.v2"]),
  retainedControlCount: z.number().int().nonnegative(),
  retainedNoticeCount: z.number().int().nonnegative(),
  controls: controlSchema.array().max(3),
  controlCandidates: controlCandidateSchema.array().max(3).optional(),
  notices: z.array(noticeSchema.omit({ passages: true }).extend({
    topics: z.array(noticeSchema.shape.passages.element.shape.topic).max(5),
  })).max(2),
  truncated: z.boolean(),
}).strict();
