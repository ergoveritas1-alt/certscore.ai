import { z } from "zod";

export const CONSENT_VISUAL_COMPARISON_VERSION = "consent_control_visual_comparison.v1" as const;
const measurementSchema = z.object({
  candidateId: z.string().min(1).max(160),
  bounds: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative(),
    z.number().finite().positive(), z.number().finite().positive()]),
  fillContrast: z.number().finite().min(1).max(21),
  outerEmphasisFraction: z.number().finite().min(0).max(1),
  backgroundUniformity: z.number().finite().min(0.6).max(1),
  interiorUniformity: z.number().finite().min(0.6).max(1),
}).strict();

/** Pixel measurements only. Scanner output does not decide finding eligibility. */
export const consentControlVisualComparisonSchema = z.object({
  version: z.literal(CONSENT_VISUAL_COMPARISON_VERSION),
  documentToken: z.string().min(1).max(160),
  screenshotArtifactRef: z.string().min(1).max(500),
  screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  imageWidth: z.number().int().positive().max(4096),
  imageHeight: z.number().int().positive().max(4096),
  captureSkewMs: z.number().int().nonnegative().max(500),
  accept: measurementSchema,
  reject: measurementSchema,
}).strict().superRefine((value, context) => {
  if (value.imageWidth * value.imageHeight > 4_000_000 || value.accept.candidateId === value.reject.candidateId ||
      [value.accept, value.reject].some(({ bounds: [x, y, w, h] }) => x < 12 || y < 12 ||
        x + w + 12 > value.imageWidth || y + h + 12 > value.imageHeight)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Visual comparison requires distinct, fully covered controls and surrounding pixels." });
  }
});
export type ConsentControlVisualComparison = z.infer<typeof consentControlVisualComparisonSchema>;

export const consentVisualProminenceProjectionSchema = z.object({
  version: z.literal("consent_visual_prominence_projection.v1"),
  assessmentSourceHash: z.string().regex(/^fnv1a-[a-f0-9]{8}$/),
  comparison: consentControlVisualComparisonSchema,
}).strict();
export function hasTypedConsentVisualProminence(value: unknown): boolean {
  const parsed = consentVisualProminenceProjectionSchema.safeParse(value);
  return parsed.success && hasMaterialAcceptVisualProminence(parsed.data.comparison);
}

/** Conservative material contrast/outline asymmetry; size alone is insufficient. */
export function hasMaterialAcceptVisualProminence(value: ConsentControlVisualComparison): boolean {
  const { accept, reject } = value;
  return (accept.fillContrast >= 3 && accept.fillContrast >= reject.fillContrast * 1.5 && reject.fillContrast <= 2) ||
    (accept.outerEmphasisFraction >= 0.18 && accept.outerEmphasisFraction >= reject.outerEmphasisFraction * 2.5 &&
      accept.outerEmphasisFraction - reject.outerEmphasisFraction >= 0.15);
}
