import { z } from "zod";
import { consentControlAssessmentTriStateSchema } from "./consent-control-assessment";

export const consentControlCalibrationAroSchema = z.object({
  accept: consentControlAssessmentTriStateSchema,
  reject: consentControlAssessmentTriStateSchema,
  options: consentControlAssessmentTriStateSchema,
});

export const consentControlGeometryHumanReviewRowSchema = z.object({
  scanId: z.string().min(1).max(240),
  website: z.string().url().max(500),
  scanner: consentControlCalibrationAroSchema,
  adjudicated: consentControlCalibrationAroSchema,
  surface: z.enum(["visible", "not_visible", "site_unavailable", "unclear"]),
  geometryIssue: z.enum(["none", "internal_scroll", "multiple_surfaces", "delayed_or_animated", "unclear"]),
  firstLayer: z.enum(["yes", "no", "ambiguous"]),
  documentMatch: z.enum(["yes", "no", "unknown"]),
  notes: z.string().max(1000).nullable(),
  disagreements: z.array(z.enum(["accept", "reject", "options"])).max(3),
});

export const consentControlGeometryHumanReviewCorpusSchema = z.object({
  artifactType: z.literal("consent_control_geometry_human_review_corpus"),
  artifactVersion: z.literal("1.0"),
  sourceWorksheetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewerRole: z.literal("product_owner"),
  reviewMethod: z.literal("live_chrome_incognito_eu_ir_vpn"),
  independentlyReviewed: z.literal(false),
  evidenceOnlyReview: z.literal(false),
  usage: z.literal("calibration_and_regression_only"),
  rows: z.array(consentControlGeometryHumanReviewRowSchema).min(1).max(500),
});

export const consentControlHumanAdjudicationRowSchema = z.object({
  reviewId: z.string().min(1).max(300),
  scanId: z.string().min(1).max(240),
  website: z.string().url().max(500),
  proposed: consentControlCalibrationAroSchema,
  adjudicated: consentControlCalibrationAroSchema.nullable(),
  override: z.string().max(80).nullable(),
  documentMatch: z.enum(["yes", "no", "unknown"]),
  notes: z.string().max(1000).nullable(),
  disposition: z.enum(["included", "pending", "excluded"]),
  releaseGateEligible: z.boolean(),
  releaseGateReasons: z.array(z.string().max(120)).max(16),
  dispositionReasons: z.array(z.string().max(120)).max(16),
  disagreements: z.array(z.enum(["accept", "reject", "options"])).max(3),
  evidence: z.object({
    artifactPath: z.string().max(1000).nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    scanId: z.string().max(240).nullable(),
    domain: z.string().max(300).nullable(),
    completedAt: z.string().datetime().nullable(),
    cmpVendor: z.string().max(240).nullable(),
    accessPosture: z.string().max(240).nullable(),
    language: z.string().max(40).nullable(),
    noGo: z.boolean().nullable(),
    homepageFetchStatus: z.string().max(120).nullable(),
    verifiedPublicSurfacesCount: z.number().int().nonnegative().nullable(),
    pagesScanned: z.number().int().nonnegative().nullable(),
    retainedVisualProof: z.boolean(),
  }),
  provenance: z.object({
    labelClass: z.literal("human_adjudication_candidate"),
    reviewMethod: z.literal("live_chrome_incognito_eu_ir_vpn"),
    reviewerRole: z.literal("product_owner"),
    reviewerAttestedLiveObservation: z.literal(true),
    independentlyReviewed: z.literal(false),
    evidenceOnlyReview: z.literal(false),
    sourceWorksheetSha256: z.string().regex(/^[a-f0-9]{64}$/),
    labelHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  }),
}).superRefine((row, context) => {
  if (row.disposition === "included" && !row.adjudicated) {
    context.addIssue({ code: "custom", message: "included rows require a complete adjudication", path: ["adjudicated"] });
  }
  if (row.releaseGateEligible && (row.disposition !== "included" || row.releaseGateReasons.length > 0)) {
    context.addIssue({ code: "custom", message: "release-gate eligibility requires an included row with no release-gate reasons", path: ["releaseGateEligible"] });
  }
});

export const consentControlHumanAdjudicationCorpusSchema = z.object({
  artifactType: z.literal("consent_control_human_adjudication_corpus"),
  artifactVersion: z.literal("1.1"),
  generatedAt: z.string().datetime(),
  sourceWorksheet: z.string().max(1000),
  sourceWorksheetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceEvidenceRoot: z.string().max(1000),
  provenancePolicy: z.string().max(1000),
  humanReviewAttestation: z.object({
    reviewerRole: z.literal("product_owner"),
    coverage: z.literal("all_worksheet_websites"),
    observationBasis: z.literal("live_site"),
    environment: z.literal("chrome_incognito_eu_ir_vpn"),
    attestedAt: z.string().datetime(),
  }),
  summary: z.object({
    totalWorksheetRows: z.number().int().nonnegative(),
    included: z.number().int().nonnegative(),
    releaseGateEligible: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    rowsWithDisagreement: z.number().int().nonnegative(),
  }),
  rows: z.array(consentControlHumanAdjudicationRowSchema).max(5000),
});

export type ConsentControlCalibrationAro = z.infer<typeof consentControlCalibrationAroSchema>;
export type ConsentControlGeometryHumanReviewRow = z.infer<typeof consentControlGeometryHumanReviewRowSchema>;
export type ConsentControlGeometryHumanReviewCorpus = z.infer<typeof consentControlGeometryHumanReviewCorpusSchema>;
export type ConsentControlHumanAdjudicationRow = z.infer<typeof consentControlHumanAdjudicationRowSchema>;
export type ConsentControlHumanAdjudicationCorpus = z.infer<typeof consentControlHumanAdjudicationCorpusSchema>;
