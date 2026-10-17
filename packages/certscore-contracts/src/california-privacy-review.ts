import { verifiedSaleSharingOptOutSchema } from "./sale-sharing-opt-out";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const safeUrl = z.string().url().max(800).refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});

/** Positive, narrowly named request routes; a link does not prove the method works. */
export function classifyCaliforniaRightsMethod(label: string): boolean {
  const normalized = label.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return /^(?:submit a privacy request|exercise your privacy rights|privacy rights request|submit a data (?:access|deletion|correction) request|request to (?:access|delete|correct) (?:my |your )?(?:personal )?(?:data|information))$/.test(normalized);
}

const rightsMethodSchema = z.object({
  label: z.string().min(1).max(200).refine(classifyCaliforniaRightsMethod),
  destinationUrl: safeUrl,
  accessibleNameSource: z.enum(["aria_label", "aria_labelledby", "text", "image_alt", "svg_title", "title"]),
}).strict();

/** Policy-lane DOM observation, independent of cookie controls and GPC. */
const privacyChoiceInspectionFields = {
  documentUrl: safeUrl,
  capturedAt: z.string().datetime(),
  sourceHash: hash,
  scope: z.literal("rendered_named_links_and_buttons"),
  coverage: z.enum(["complete", "limited"]),
  namedChoiceCandidateCount: z.number().int().min(0).max(1000),
  unnamedControlCount: z.number().int().min(0),
  candidateEnumerationTruncated: z.boolean(),
  uninspectedFrameCount: z.number().int().min(0),
  uninspectedShadowRootCount: z.number().int().min(0),
  supportedDocumentLanguage: z.boolean(),
  representativeDocument: z.boolean(),
  documentStable: z.boolean(),
  rightsMethods: rightsMethodSchema.array().max(12).optional(),
};
function validateChoiceInspectionCoverage(row: {
  coverage: "complete" | "limited";
  unnamedControlCount: number;
  candidateEnumerationTruncated: boolean;
  uninspectedFrameCount: number;
  uninspectedShadowRootCount: number;
  supportedDocumentLanguage: boolean;
  representativeDocument: boolean;
  documentStable: boolean;
}, ctx: z.RefinementCtx): void {
  if (row.coverage === "complete" && (row.unnamedControlCount || row.candidateEnumerationTruncated ||
      row.uninspectedFrameCount || row.uninspectedShadowRootCount || !row.supportedDocumentLanguage ||
      !row.representativeDocument || !row.documentStable)) ctx.addIssue({code: "custom", message: "Incomplete privacy-choice inspection cannot establish absence."});
}
/** V1 retains the original all-controls count for historical records. */
const privacyChoiceInspectionV1Schema = z.object({
  contractVersion: z.literal("certscore.privacy-choice-inspection.v1"),
  ...privacyChoiceInspectionFields,
}).strict().superRefine(validateChoiceInspectionCoverage);
/** V2 distinguishes hidden unnamed controls from visible, choice-capable ones. */
const privacyChoiceInspectionV2Schema = z.object({
  contractVersion: z.literal("certscore.privacy-choice-inspection.v2"),
  ...privacyChoiceInspectionFields,
  hiddenUnnamedControlCount: z.number().int().min(0),
}).strict().superRefine(validateChoiceInspectionCoverage);
export const privacyChoiceInspectionSchema = z.union([privacyChoiceInspectionV1Schema, privacyChoiceInspectionV2Schema]);
export type PrivacyChoiceInspection = z.infer<typeof privacyChoiceInspectionSchema>;

export const CALIFORNIA_CHOICE_ABSENCE_ID = "california_privacy_choice_not_observed";
export const CALIFORNIA_CHOICE_DESTINATION_ID = "california_privacy_choice_destination_error";
export const CALIFORNIA_OPT_OUT_ACTIVITY_ID = "california_sale_sharing_opt_out_activity";
export const CALIFORNIA_NOTICE_DESTINATION_ID = "california_notice_at_collection_destination_error";
export const CALIFORNIA_RIGHTS_DESTINATION_ID = "california_rights_information_destination_error";
export const CALIFORNIA_PRIVACY_REVIEW_IDS = [CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_CHOICE_DESTINATION_ID, CALIFORNIA_OPT_OUT_ACTIVITY_ID, CALIFORNIA_NOTICE_DESTINATION_ID, CALIFORNIA_RIGHTS_DESTINATION_ID] as const;
export const CALIFORNIA_PRIVACY_REVIEW_SIGNAL = "privacy.california_privacy_review";

const choiceSchema = z.object({
  label: z.string().min(1).max(200),
  kind: z.enum(["do_not_sell_or_share", "your_privacy_choices"]),
  evidenceRef: z.string().min(1).max(240),
  destinationUrl: safeUrl.nullable(),
  destinationStatus: z.enum(["not_tested", "retrieved", "http_error"]),
  httpStatus: z.union([z.literal(404), z.literal(410)]).optional(),
}).strict().superRefine((row, ctx) => {
  if (row.destinationStatus === "http_error" && (!row.httpStatus || !row.destinationUrl)) ctx.addIssue({code: "custom", message: "HTTP error requires an exact destination and retained status."});
  if (row.destinationStatus !== "http_error" && row.httpStatus) ctx.addIssue({code: "custom", message: "HTTP status does not match outcome."});
});
const noticeLinkSchema = z.object({
  kind: z.enum(["notice_at_collection", "california_notice"]),
  label: z.string().min(1).max(200),
  evidenceRef: z.string().min(1).max(240),
  destinationUrl: safeUrl,
  httpStatus: z.union([z.literal(404), z.literal(410)]),
}).strict();

export const californiaPrivacyReviewSchema = z.object({
  contractVersion: z.literal("certscore.california-privacy-review.v1"),
  policyVersion: z.literal("california-privacy-review.v1"),
  scanId: z.string().min(1),
  documentUrl: safeUrl,
  capturedAt: z.string().datetime(),
  sourceHash: hash,
  verificationStatus: z.literal("verified"),
  scoreEffect: z.literal("none"),
  applicability: z.literal("not_determined"),
  inspection: privacyChoiceInspectionSchema.nullable(),
  choiceSurface: z.enum(["observed", "not_observed_in_inspected_scope", "unknown"]),
  controls: choiceSchema.array().max(12),
  controlsTruncated: z.boolean(),
  failedNoticeLinks: noticeLinkSchema.array().max(8).optional(),
  optOutObservation: verifiedSaleSharingOptOutSchema.optional(),
  optOutEffectiveness: z.enum(["not_assessed", "bounded_observation"]),
  noticeAdequacy: z.literal("not_assessed"),
  noticeTopics: z.enum(["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"]).array().max(5),
  noticeEvidenceRefs: z.string().min(1).max(240).array().max(4),
}).strict().superRefine((row, ctx) => {
  if (row.optOutObservation && (row.optOutObservation.evidence.scanId !== row.scanId || row.optOutObservation.evidence.targetUrl !== row.documentUrl)) ctx.addIssue({code: "custom", message: "Opt-out observation binding mismatch."});
  if (row.optOutEffectiveness === "bounded_observation" && row.optOutObservation?.evidence.status !== "complete") ctx.addIssue({code: "custom", message: "Bounded assessment requires completed verified capture."});
  if (row.inspection && row.inspection.documentUrl !== row.documentUrl) ctx.addIssue({code: "custom", message: "Inspection document mismatch."});
  if (row.choiceSurface === "observed" && !row.controls.length) ctx.addIssue({code: "custom", message: "Observed choice requires retained control proof."});
  if (row.choiceSurface === "not_observed_in_inspected_scope" && (!row.inspection || row.inspection.coverage !== "complete" ||
      row.inspection.namedChoiceCandidateCount !== 0 || row.controls.length || row.controlsTruncated)) ctx.addIssue({code: "custom", message: "Choice absence requires complete dedicated inspection."});
});
export type CaliforniaPrivacyReview = z.infer<typeof californiaPrivacyReviewSchema>;

export function californiaPrivacyReviewFindingIds(value: unknown): string[] {
  const result = californiaPrivacyReviewSchema.safeParse(value);
  if (!result.success) return [];
  return [
    ...(result.data.optOutEffectiveness === "bounded_observation" && result.data.optOutObservation?.evidence.status === "complete" && result.data.optOutObservation.evidence.requests.length > 0 ? [CALIFORNIA_OPT_OUT_ACTIVITY_ID] : []),
    ...(result.data.choiceSurface === "not_observed_in_inspected_scope" ? [CALIFORNIA_CHOICE_ABSENCE_ID] : []),
    ...(result.data.controls.some(row => row.destinationStatus === "http_error") ? [CALIFORNIA_CHOICE_DESTINATION_ID] : []),
    ...(result.data.failedNoticeLinks?.some(row => row.kind === "notice_at_collection") ? [CALIFORNIA_NOTICE_DESTINATION_ID] : []),
    ...(result.data.failedNoticeLinks?.some(row => row.kind === "california_notice") ? [CALIFORNIA_RIGHTS_DESTINATION_ID] : []),
  ];
}

export function californiaPrivacyReviewCopy(id: string) {
  if (id === CALIFORNIA_NOTICE_DESTINATION_ID) return {
    title: "Notice-at-collection link returned an HTTP error",
    description: "A visible, named notice-at-collection link on the scanned page led to a retained HTTP 404 or 410 response. Whether another notice is provided at the relevant collection point is unassessed.",
    action: "Repair the named notice link and check that each applicable collection point provides the required information.",
  };
  if (id === CALIFORNIA_RIGHTS_DESTINATION_ID) return {
    title: "California rights-information link returned an HTTP error",
    description: "A visible, named California or state privacy-rights link led to a retained HTTP 404 or 410 response. Other request methods and notices may still be available.",
    action: "Repair the named rights-information link and verify that applicable privacy-request methods remain accessible.",
  };
  if (id === CALIFORNIA_OPT_OUT_ACTIVITY_ID) return {
    title: "Advertising requests after a recorded sale/sharing opt-out",
    description: "Advertising-classified requests received responses after a confirmed sale/sharing opt-out in the bounded visit. Review the recipients and data flows; this observation alone does not establish a legally defined sale or sharing.",
    action: "Check that the recorded choice reaches relevant services and governs applicable sale/sharing flows. Review the retained request purposes and contractual roles.",
  };
  return id === CALIFORNIA_CHOICE_ABSENCE_ID ? {
    title: "No named sale/sharing choice found in the inspected page",
    description: "The completed inspection did not identify a named sale/sharing choice among the rendered links and buttons. Review whether an opt-out method is required and whether an alternative method applies.",
    action: "Check applicable sale/sharing obligations and permitted alternatives. If a page control is required, provide a clearly named, accessible choice and verify its operation.",
  } : {
    title: "Privacy-choice destination returned an HTTP error",
    description: "A visible sale/sharing privacy-choice link led to a retained HTTP 404 or 410 response. Review the destination and the visitor’s available opt-out methods.",
    action: "Repair the referenced destination and verify that visitors can reach and use the intended privacy choice.",
  };
}
