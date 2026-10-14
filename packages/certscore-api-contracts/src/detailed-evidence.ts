import { z } from "zod";

const text = z.string().max(4000);
const ref = z.string().max(2048);
const count = z.number().int().nonnegative();
export const detailedEvidenceCountsSchema = z.object({
  checks: count, review: count, limited: count, observed: count, unsupported: count,
}).strict();
export const detailedEvidenceRowSchema = z.object({
  id: ref, title: text, summary: text.nullable(), status: z.string().max(80), displayStatus: z.string().max(80),
  description: text.optional(),
  correctionSteps: z.array(text).max(30), evidenceRefs: z.array(text).max(200),
  evidenceTarget: ref,
  source: z.object({ field: ref, rowId: ref }).strict(),
  sharedEvidence: z.object({ targetId: ref, label: text, showLink: z.boolean().optional() }).strict().optional(),
}).strict();
export const detailedEvidenceSectionSchema = z.object({
  id: z.enum(["cmp", "consent", "tracking", "policy", "runtime", "transport", "accessibility", "cms", "gpc", "privacy"]),
  title: text, recap: text, displayStatus: z.enum(["Review", "Limited"]).nullable(),
  counts: detailedEvidenceCountsSchema, rows: z.array(detailedEvidenceRowSchema).max(200),
}).strict();
export const detailedEvidenceReportSchema = z.object({
  version: z.literal("certscore.detailed-evidence.v1"), scanId: z.string(),
  sections: z.array(detailedEvidenceSectionSchema).max(10),
  interpretation: z.string(),
}).strict();

export const consentControlMeasurementSchema = z.object({
  candidateId: z.string().max(160), bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  fillContrast: z.number().min(1).max(21), outerEmphasisFraction: z.number().min(0).max(1),
  backgroundUniformity: z.number().min(0).max(1), interiorUniformity: z.number().min(0).max(1),
}).strict();
export const publicCmpAuditSchema = z.object({
  version: z.literal("cmp_audit_report.v1"), scanId: z.string(), scope: z.literal("starting_page"),
  assessmentSourceHash: z.string().nullable(),
  inspectionSupport: z.object({ state: z.enum(["supported", "partial", "unsupported", "unknown"]),
    provider: z.string().max(120).nullable(), recipeVersion: z.string().max(100).nullable(), reason: z.string().max(240) }).strict().optional(),
  rows: z.array(z.object({
    id: z.enum(["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"]), label: text, status: z.enum(["Observed", "Not observed", "Review recommended", "Not assessed", "Partially assessed", "Feature not supported", "Informational"]),
    detail: text.optional(), sourceIds: z.array(ref).max(30), evidenceAnchor: ref.optional(),
    supportingEvidence: z.object({
      prominence: z.object({ accept: consentControlMeasurementSchema, reject: consentControlMeasurementSchema, captureSkewMs: count }).strict().optional(),
      requests: z.array(z.object({ hostname: ref, path: ref.refine(value => !/[?#]/.test(value), "Request evidence must omit query and fragment values"), vendor: text, category: text, msAfterReject: count }).strict()).max(100).optional(),
      inventory: z.object({
        services: z.array(z.object({ name: z.string().min(1).max(240), source: z.enum(["cmp_api_inventory", "labelled_control"]) }).strict()).max(100).optional(),
        declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory"]) }).strict()).max(100).optional(),
        cookies: z.array(z.object({ name: z.string().min(1).max(160), matchedPattern: z.string().min(1).max(160).nullable(), observedIn: z.array(z.enum(["before_choice", "after_accept"])).min(1).max(2) }).strict()).max(100).optional(),
      }).strict().optional(),
      cookieComparison: z.object({ declarationPatternCount: count, observedCookieNameCount: count, unmatchedNameCount: count,
        unmatchedNames: z.array(z.string().max(160)).max(100), allUnmatchedOnlyAfterAccept: z.boolean() }).strict().optional(),
    }).strict().optional(),
  }).strict()).length(13),
}).strict().superRefine((audit, context) => {
  if (new Set(audit.rows.map(row => row.id)).size !== 13) context.addIssue({ code: z.ZodIssueCode.custom, message: "CMP criteria must be unique." });
});

export const publicCmsSecuritySchema = z.object({
  version: z.literal("certscore.cms-report.v1"), scanId: z.string(),
  assessmentContractVersion: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string(), documentUrl: z.string().url(), evidenceRef: ref,
  catalogueVersion: z.string(), catalogueReviewedAt: z.string(),
  detections: z.array(z.object({
    evidenceRef: ref, product: z.string(), name: text, version: z.string().nullable(),
    versionLabel: text, versionStatus: z.string(), versionBasis: z.string(), confidence: z.string(),
    observedVersions: z.array(z.string()).max(30), informationalOnly: z.boolean(), evidenceRefs: z.array(ref).max(30),
    branchVersion: z.string().optional(), versionGranularity: z.string().optional(), runtimeVersionConfirmed: z.literal(false),
  }).strict()).max(22),
  advisories: z.array(z.object({
    evidenceRef: ref, detectionRef: ref, observedVersion: z.string(), confidence: z.string(),
    advisoryId: z.string(), kind: z.enum(["lifecycle", "vulnerability"]), title: text, sourceUrl: z.string().url(),
    qualification: text, severity: z.enum(["medium", "high"]),
    fixedVersions: z.array(z.string()).max(30), matchedRange: text,
  }).strict()).max(100),
  plugins: z.array(z.object({
    evidenceRef: ref, id: z.string(), name: text, version: z.string().nullable(),
    observedVersions: z.array(z.string()).max(8), versionStatus: z.string(), evidenceRefs: z.array(ref).max(30),
  }).strict()).max(22),
  identification: z.array(z.object({ evidenceRef: ref, kind: z.string(), value: z.string().max(512), sourceUrl: z.string().url(), artifactRef: ref }).strict()).max(22),
}).strict();

export type DetailedEvidenceCounts = z.infer<typeof detailedEvidenceCountsSchema>;
export type DetailedEvidenceRow = z.infer<typeof detailedEvidenceRowSchema>;
export type DetailedEvidenceSection = z.infer<typeof detailedEvidenceSectionSchema>;
export type DetailedEvidenceReport = z.infer<typeof detailedEvidenceReportSchema>;
export type PublicCmpAudit = z.infer<typeof publicCmpAuditSchema>;
export type PublicCmsSecurity = z.infer<typeof publicCmsSecuritySchema>;
