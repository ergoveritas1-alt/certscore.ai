import { z } from "zod";

export const REPORT_EVIDENCE_SECTIONS = ["consent", "gpc", "policy", "tracking", "transport", "forms", "accessibility"] as const;
export const reportEvidenceSectionSchema = z.enum(REPORT_EVIDENCE_SECTIONS);
export type ReportEvidenceSection = z.infer<typeof reportEvidenceSectionSchema>;

export const reportEvidencePageSchema = z.object({
  type: z.literal("certscore_report_evidence_page"),
  version: z.literal(1),
  scanId: z.string().uuid(),
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  reportUrl: z.string(),
  workpaper: z.literal("tracking").optional(),
  section: reportEvidenceSectionSchema.optional(),
  selection: z.object({
    version: z.literal("certscore.report-evidence-selection.v1"),
    fields: z.array(z.string()).max(30),
    notReturnedFields: z.array(z.string()).max(30),
    interpretation: z.string(),
  }).strict().optional(),
  download: z.object({
    url: z.string().url(),
    csvUrl: z.string().url().optional(),
    mediaType: z.literal("application/json"),
    expiresAt: z.string().datetime().optional(),
    bytes: z.number().int().nonnegative(),
    authentication: z.enum(["same_access_rules_as_mcp", "short_lived_report_link", "public"]),
    instructions: z.string(),
  }).strict().optional(),
  entries: z.array(z.object({
    path: z.string(),
    value: z.unknown(),
    stringPart: z.number().int().nonnegative().optional(),
    stringParts: z.number().int().positive().optional(),
  }).strict()),
  pagination: z.object({
    offset: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    complete: z.boolean(),
    nextCursor: z.string().nullable(),
  }).strict(),
  coverage: z.object({
    scope: z.literal("public_report_projection"),
    exportTruncated: z.literal(false),
    observationCompleteness: z.literal("see_report_coverage"),
    exclusions: z.array(z.string()),
  }).strict(),
  reconstruction: z.string(),
}).strict();
export type ReportEvidencePage = z.infer<typeof reportEvidencePageSchema>;
