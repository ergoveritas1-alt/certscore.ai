import {californiaRightsClauseAssessmentSchema,californiaCollectionNoticeAssessmentSchema,californiaCollectionNoticeV2Schema,californiaCollectionNoticeV3Schema,californiaCollectionNoticeV4Schema,californiaCollectionNoticeV5Schema} from "./california-clause-assessment";
import {californiaSaleSharingAssessmentSchema} from "./california-sale-sharing-assessment";
export * from "./california-sale-sharing-assessment";
export * from "./california-clause-assessment";
import { californiaDisclosureInspectionSchema, CALIFORNIA_RIGHTS_DISCLOSURE_ID } from "./california-disclosure-inspection";
export * from "./california-disclosure-inspection";
import { verifiedSaleSharingOptOutSchema } from "./sale-sharing-opt-out";
import { z } from "zod";
import { californiaCoverageV1Schema, californiaCoverageV2Schema,californiaCoverageV3Schema,californiaCoverageV4Schema } from "./california-review-coverage";
export * from "./california-review-coverage";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const safeUrl = z.string().url().max(800).refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});
// Provenance joins the exact original visit. Unlike public display links, its
// query/fragment cannot be discarded without changing document identity.
const documentIdentityUrl = z.string().url().max(800).refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
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
/** V3 records bounded same-session frame coverage without changing historical conclusions. */
const privacyChoiceInspectionV3Fields = {
  ...privacyChoiceInspectionFields,
  hiddenUnnamedControlCount: z.number().int().min(0),
  frameCount: z.number().int().min(0),
  inspectedSameOriginFrameCount: z.number().int().min(0),
  hiddenUninspectedFrameCount: z.number().int().min(0),
  inaccessibleFrameCount: z.number().int().min(0),
  unreadyFrameCount: z.number().int().min(0),
  unprojectableFrameCount: z.number().int().min(0),
  frameBudgetLimitedCount: z.number().int().min(0),
  namedFrameChoiceCandidateCount: z.number().int().min(0),
  frameInspectionWorkMs: z.number().int().min(0).max(10_000),
  frameProofWorkMs: z.number().int().min(0).max(10_000),
};
function validateFrameCoverage(row: z.infer<ReturnType<typeof frameInspectionSchema>>, ctx: z.RefinementCtx) {
  validateChoiceInspectionCoverage(row, ctx);
  if (row.frameCount !== row.inspectedSameOriginFrameCount + row.uninspectedFrameCount ||
      row.uninspectedFrameCount !== row.hiddenUninspectedFrameCount + row.inaccessibleFrameCount +
        row.unreadyFrameCount + row.unprojectableFrameCount + row.frameBudgetLimitedCount ||
      row.namedFrameChoiceCandidateCount > row.namedChoiceCandidateCount) {
    ctx.addIssue({code: "custom", message: "Frame coverage counts must reconcile."});
  }
}
function frameInspectionSchema() { return z.object(privacyChoiceInspectionV3Fields); }
const privacyChoiceInspectionV3Schema = frameInspectionSchema().extend({contractVersion:z.literal("certscore.privacy-choice-inspection.v3")}).strict().superRefine(validateFrameCoverage);
const privacyChoiceInspectionV4Schema = frameInspectionSchema().extend({contractVersion:z.literal("certscore.privacy-choice-inspection.v4"),
  homepageAccessPolicy:z.literal("representative_homepage.v1")}).strict().superRefine(validateFrameCoverage);
const privacyChoiceInspectionV5Schema = frameInspectionSchema().extend({
  contractVersion:z.literal("certscore.privacy-choice-inspection.v5"),
  homepageAccessPolicy:z.literal("representative_homepage.v1"),
  readinessPolicy:z.literal("document_bound_dom_inventory.v1"),
  documentReadyState:z.enum(["loading","interactive","complete"]),
  limitationKeys:z.array(z.enum(["document_loading","inventory_unavailable","document_not_representative","document_binding_unverified",
    "candidate_inventory_truncated","unnamed_controls","frame_inventory_incomplete","shadow_inventory_incomplete","unsupported_language"])).max(9),
}).strict().superRefine((row,ctx)=>{
  validateFrameCoverage(row,ctx);
  if (row.coverage === "complete" && (row.documentReadyState === "loading" || row.limitationKeys.length)) {
    ctx.addIssue({code:"custom",message:"Complete choice inventory requires a parsed, bound document without inspection limitations."});
  }
});
export const privacyChoiceInspectionSchema = z.union([privacyChoiceInspectionV1Schema, privacyChoiceInspectionV2Schema, privacyChoiceInspectionV3Schema, privacyChoiceInspectionV4Schema, privacyChoiceInspectionV5Schema]);
export type PrivacyChoiceInspection = z.infer<typeof privacyChoiceInspectionSchema>;
export function isCurrentCaliforniaChoiceInspection(inspection:PrivacyChoiceInspection|null|undefined) {
  return inspection?.contractVersion === "certscore.privacy-choice-inspection.v4" || inspection?.contractVersion === "certscore.privacy-choice-inspection.v5";
}

export const CALIFORNIA_CHOICE_ABSENCE_ID = "california_privacy_choice_not_observed";
export const CALIFORNIA_CHOICE_DESTINATION_ID = "california_privacy_choice_destination_error";
export const CALIFORNIA_OPT_OUT_ACTIVITY_ID = "california_sale_sharing_opt_out_activity";
export const CALIFORNIA_NOTICE_DESTINATION_ID = "california_notice_at_collection_destination_error";
export const CALIFORNIA_RIGHTS_DESTINATION_ID = "california_rights_information_destination_error";
export const CALIFORNIA_PRIVACY_REVIEW_IDS = [CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_CHOICE_DESTINATION_ID, CALIFORNIA_OPT_OUT_ACTIVITY_ID, CALIFORNIA_NOTICE_DESTINATION_ID, CALIFORNIA_RIGHTS_DESTINATION_ID, CALIFORNIA_RIGHTS_DISCLOSURE_ID] as const;
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

const californiaPrivacyReviewFields = {
  scanId: z.string().min(1),
  documentUrl: documentIdentityUrl,
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
};
const californiaPrivacyReviewV1 = z.object({ ...californiaPrivacyReviewFields,
  contractVersion:z.literal("certscore.california-privacy-review.v1"), policyVersion:z.literal("california-privacy-review.v1") }).strict();
const californiaPrivacyReviewV2 = z.object({ ...californiaPrivacyReviewFields,
  contractVersion:z.literal("certscore.california-privacy-review.v2"), policyVersion:z.literal("california-privacy-review.v2"),
  reviewCoverage:californiaCoverageV1Schema }).strict();
const californiaPrivacyReviewV3 = z.object({...californiaPrivacyReviewFields,
  contractVersion:z.literal("certscore.california-privacy-review.v3"),policyVersion:z.literal("california-privacy-review.v3"),
  reviewCoverage:californiaCoverageV2Schema}).strict();
const californiaPrivacyReviewV4 = californiaPrivacyReviewV3.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v4"),policyVersion:z.literal("california-privacy-review.v4"),
  disclosureInspection:californiaDisclosureInspectionSchema.optional(),
}).strict();
const californiaPrivacyReviewV5=californiaPrivacyReviewV4.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v5"),policyVersion:z.literal("california-privacy-review.v5"),
  rightsAssessment:californiaRightsClauseAssessmentSchema.optional(),collectionNoticeAssessment:californiaCollectionNoticeAssessmentSchema,
}).strict();
const californiaPrivacyReviewV6=californiaPrivacyReviewV5.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v6"),policyVersion:z.literal("california-privacy-review.v6"),
  reviewCoverage:californiaCoverageV3Schema,collectionNoticeAssessment:californiaCollectionNoticeV2Schema,
  saleSharingAssessment:californiaSaleSharingAssessmentSchema.optional(),
}).strict();
const californiaPrivacyReviewV7=californiaPrivacyReviewV6.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v7"),policyVersion:z.literal("california-privacy-review.v7"),
  reviewCoverage:californiaCoverageV4Schema,collectionNoticeAssessment:californiaCollectionNoticeV3Schema,
}).strict();
const californiaPrivacyReviewV8=californiaPrivacyReviewV7.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v8"),policyVersion:z.literal("california-privacy-review.v8"),
  collectionNoticeAssessment:californiaCollectionNoticeV4Schema,
}).strict();
const californiaPrivacyReviewV9=californiaPrivacyReviewV8.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v9"),policyVersion:z.literal("california-privacy-review.v9"),
  collectionNoticeAssessment:californiaCollectionNoticeV5Schema,
}).strict();
/** Score availability is independent of policy/choice completeness. This proof
 * is materialized only from a verified, representative starting-page visit;
 * it never establishes a policy pass, absence, applicability or finding. */
export const californiaObservedScoreBasisSchema = z.object({
  policyVersion:z.literal("usable_starting_page_score.v1"),
  scanId:z.string().min(1).max(160), documentUrl:documentIdentityUrl, sourceHash:hash,
  documentToken:z.string().min(1).max(256), domArtifactId:z.string().min(1).max(200),
  sourceLane:z.literal("runtime_evidence"), accessOutcome:z.literal("representative_page"),
  evidenceRef:z.literal("CanonicalEvidenceBundle.json#runtimeMetadataSnapshots"),
}).strict();
export type CaliforniaObservedScoreBasis = z.infer<typeof californiaObservedScoreBasisSchema>;
const californiaPrivacyReviewV10=californiaPrivacyReviewV9.extend({
  contractVersion:z.literal("certscore.california-privacy-review.v10"),policyVersion:z.literal("california-privacy-review.v10"),
  observedScoreBasis:californiaObservedScoreBasisSchema.optional(),
}).strict();
type CaliforniaPrivacyReviewShape = z.infer<typeof californiaPrivacyReviewV1> | z.infer<typeof californiaPrivacyReviewV2> | z.infer<typeof californiaPrivacyReviewV3> | z.infer<typeof californiaPrivacyReviewV4> | z.infer<typeof californiaPrivacyReviewV5> | z.infer<typeof californiaPrivacyReviewV6> | z.infer<typeof californiaPrivacyReviewV7> | z.infer<typeof californiaPrivacyReviewV8> | z.infer<typeof californiaPrivacyReviewV9> | z.infer<typeof californiaPrivacyReviewV10>;
const californiaPrivacyReviewValidatedSchema: z.ZodType<CaliforniaPrivacyReviewShape> = z.discriminatedUnion("contractVersion",[californiaPrivacyReviewV1,californiaPrivacyReviewV2,californiaPrivacyReviewV3,californiaPrivacyReviewV4,californiaPrivacyReviewV5,californiaPrivacyReviewV6,californiaPrivacyReviewV7,californiaPrivacyReviewV8,californiaPrivacyReviewV9,californiaPrivacyReviewV10]).superRefine((row, ctx) => {
  if (row.contractVersion === "certscore.california-privacy-review.v10" && row.observedScoreBasis &&
      (row.observedScoreBasis.scanId !== row.scanId || row.observedScoreBasis.documentUrl !== row.documentUrl ||
       row.observedScoreBasis.sourceHash !== row.sourceHash)) {
    ctx.addIssue({code:"custom",message:"Observed score availability must bind the same verified scan, document and source."});
  }
  if ((row.contractVersion === "certscore.california-privacy-review.v4" || row.contractVersion === "certscore.california-privacy-review.v5" || row.contractVersion === "certscore.california-privacy-review.v6" || (row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")))) && row.disclosureInspection) {
    const inspection = row.disclosureInspection;
    const coverage = row.reviewCoverage;
    if (inspection.sourceBundleSha256 !== row.sourceHash || !coverage.captureCoverage.policyTextComplete ||
        inspection.documents.length !== coverage.sourceDocuments.length ||
        inspection.documents.some(document => !coverage.sourceDocuments.some(source => source.evidenceRef === document.evidenceRef && source.complete))) {
      ctx.addIssue({code:"custom",message:"Disclosure inspection requires complete policy coverage and matching source provenance."});
    }
  }
  if(row.contractVersion === "certscore.california-privacy-review.v5" || row.contractVersion === "certscore.california-privacy-review.v6" || (row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")))) {
    if(row.rightsAssessment?.sourceCoverage?.documents.some(source=>!row.reviewCoverage.sourceDocuments.some(document=>document.evidenceRef===source.evidenceRef && document.complete)))ctx.addIssue({code:"custom",message:"Positive clauses require a complete retained source document."});
    const sources=[...(row.disclosureInspection?.documents ?? []),...(row.rightsAssessment?.sourceCoverage?.documents ?? [])];
    const sale=row.contractVersion === "certscore.california-privacy-review.v6" || (row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")))?row.saleSharingAssessment:undefined;
    const passages=[...(row.rightsAssessment?.topics.flatMap(topic=>[...topic.passages,...topic.excludedPassages])??[]),...row.collectionNoticeAssessment.points.flatMap(point=>point.passages),...(sale?.topics.flatMap(topic=>topic.passages)??[])];
    if(row.collectionNoticeAssessment.sourceBundleSha256 !== row.sourceHash || row.rightsAssessment && row.rightsAssessment.sourceBundleSha256 !== row.sourceHash ||
      row.rightsAssessment && !row.reviewCoverage.captureCoverage.policyTextComplete && !row.rightsAssessment.sourceCoverage ||
      sale && (sale.sourceBundleSha256!==row.sourceHash || !row.disclosureInspection || !row.reviewCoverage.captureCoverage.policyTextComplete) ||
      passages.some(passage=>!sources.some(source=>source.evidenceRef === passage.evidenceRef && source.textSha256 === passage.textSha256 && passage.end<=source.inspectedChars)))
      ctx.addIssue({code:"custom",message:"Clause and notice assessments require verified source and passage bindings."});
    if((row.contractVersion === "certscore.california-privacy-review.v6" || (row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")))) && row.reviewCoverage.families.some(family=>family.status === "assessed_gap" &&
      (family.id!=="california_rights" || !row.rightsAssessment || row.rightsAssessment.topics.some(topic=>topic.status === "review") || !row.rightsAssessment.topics.some(topic=>topic.status === "not_observed"))))
      ctx.addIssue({code:"custom",message:"An assessed rights gap requires completed topic conclusions and a supported omission."});
    if((row.contractVersion === "certscore.california-privacy-review.v6" || (row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")))) && row.rightsAssessment && !row.disclosureInspection && !row.rightsAssessment.sourceCoverage)
      ctx.addIssue({code:"custom",message:"Rights clause conclusions require a verified full-text inspection."});
    if((row.contractVersion === "certscore.california-privacy-review.v7" || (row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10"))) && row.reviewCoverage.families.some(family=>family.assessmentState === "completed" && (
      family.id === "privacy_choices" && !row.reviewCoverage.captureCoverage.choiceInventoryComplete ||
      family.id === "california_rights" && (!row.rightsAssessment || row.rightsAssessment.topics.some(topic=>topic.status === "review")) ||
      family.id === "sale_sharing" && (!sale || sale.topics.some(topic=>["review","qualified","conflicting"].includes(topic.status))) ||
      family.id === "collection_notice" && (!row.collectionNoticeAssessment.inventoryComplete || row.collectionNoticeAssessment.points.some(point=>point.assessmentScope === "category_purpose" && (point.status === "limited" || point.categoryMatch === "unresolved" || point.purposeMatch === "unresolved"))))))
      ctx.addIssue({code:"custom",message:"Completed assessment labels require resolved, evidence-bound checks in their stated scope."});
  }
  if((row.contractVersion === "certscore.california-privacy-review.v8" || (row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10"))&&row.collectionNoticeAssessment.runtimePurposeAssessment.retainedSources.some(source=>source.scanId!==row.scanId||source.documentUrl!==row.documentUrl))ctx.addIssue({code:"custom",message:"Runtime purpose source must belong to this scan document"});
  if((row.contractVersion === "certscore.california-privacy-review.v9" || row.contractVersion === "certscore.california-privacy-review.v10")){
    const purpose=row.collectionNoticeAssessment.runtimePurposeAssessment;
    if(purpose.retainedReadTrace&&(purpose.retainedReadTrace.scanId!==row.scanId||purpose.retainedReadTrace.captureId!==`${row.scanId}:runtime_evidence`))ctx.addIssue({code:"custom",message:"Storage read trace identity mismatch"});
    if(purpose.items.some(item=>item.readUse?.reads.some(read=>!purpose.retainedReadTrace?.observations.some(raw=>raw.id===read.evidenceRef&&raw.documentUrl===row.documentUrl))))ctx.addIssue({code:"custom",message:"Read-use observation must belong to this report document"});
    if(purpose.items.some(item=>item.declaredPurpose&&!row.disclosureInspection?.documents.some(source=>source.evidenceRef===item.declaredPurpose!.passage.evidenceRef&&source.textSha256===item.declaredPurpose!.passage.textSha256&&item.declaredPurpose!.passage.end<=source.inspectedChars)))ctx.addIssue({code:"custom",message:"Declared purposes require verified retained policy passages"});
  }
  if (row.optOutObservation && (row.optOutObservation.evidence.scanId !== row.scanId || row.optOutObservation.evidence.targetUrl !== row.documentUrl)) ctx.addIssue({code: "custom", message: "Opt-out observation binding mismatch."});
  if (row.optOutEffectiveness === "bounded_observation" && row.optOutObservation?.evidence.status !== "complete") ctx.addIssue({code: "custom", message: "Bounded assessment requires completed verified capture."});
  if (row.inspection && row.inspection.documentUrl !== row.documentUrl) ctx.addIssue({code: "custom", message: "Inspection document mismatch."});
  if (row.choiceSurface === "observed" && !row.controls.length) ctx.addIssue({code: "custom", message: "Observed choice requires retained control proof."});
  if (row.choiceSurface === "not_observed_in_inspected_scope" && (!row.inspection || row.inspection.coverage !== "complete" ||
      row.inspection.namedChoiceCandidateCount !== 0 || row.controls.length || row.controlsTruncated)) ctx.addIssue({code: "custom", message: "Choice absence requires complete dedicated inspection."});
  if (row.contractVersion !== "certscore.california-privacy-review.v1" && row.reviewCoverage.scoreReady &&
      (!isCurrentCaliforniaChoiceInspection(row.inspection) || row.inspection?.coverage !== "complete" || row.choiceSurface === "unknown")) {
    ctx.addIssue({code:"custom",message:"New California score readiness requires the versioned complete homepage inspection."});
  }
});
export type CaliforniaPrivacyReview = z.infer<typeof californiaPrivacyReviewValidatedSchema>;
export const californiaPrivacyReviewSchema:z.ZodType<CaliforniaPrivacyReview> = californiaPrivacyReviewValidatedSchema;

export function californiaPrivacyReviewFindingIds(value: unknown): string[] {
  const result = californiaPrivacyReviewSchema.safeParse(value);
  if (!result.success) return [];
  return [
    ...((result.data.contractVersion === "certscore.california-privacy-review.v5" || result.data.contractVersion === "certscore.california-privacy-review.v6" || (result.data.contractVersion === "certscore.california-privacy-review.v7" || (result.data.contractVersion === "certscore.california-privacy-review.v8" || (result.data.contractVersion === "certscore.california-privacy-review.v9" || result.data.contractVersion === "certscore.california-privacy-review.v10")))) && result.data.rightsAssessment?.topics.some(topic=>topic.status === "not_observed") ? [CALIFORNIA_RIGHTS_DISCLOSURE_ID] : []),
    ...(result.data.contractVersion === "certscore.california-privacy-review.v4" && result.data.disclosureInspection?.topics.some(topic => topic.status === "not_observed") ? [CALIFORNIA_RIGHTS_DISCLOSURE_ID] : []),
    ...(result.data.optOutEffectiveness === "bounded_observation" && result.data.optOutObservation?.evidence.status === "complete" && result.data.optOutObservation.evidence.requests.length > 0 ? [CALIFORNIA_OPT_OUT_ACTIVITY_ID] : []),
    ...(result.data.choiceSurface === "not_observed_in_inspected_scope" &&
      !(result.data.contractVersion !== "certscore.california-privacy-review.v1" && result.data.reviewCoverage.families.some(row=>row.id === "privacy_choices" && row.status === "not_triggered_in_scope")) ? [CALIFORNIA_CHOICE_ABSENCE_ID] : []),
    ...(result.data.controls.some(row => row.destinationStatus === "http_error") ? [CALIFORNIA_CHOICE_DESTINATION_ID] : []),
    ...(result.data.failedNoticeLinks?.some(row => row.kind === "notice_at_collection") ? [CALIFORNIA_NOTICE_DESTINATION_ID] : []),
    ...(result.data.failedNoticeLinks?.some(row => row.kind === "california_notice") ? [CALIFORNIA_RIGHTS_DESTINATION_ID] : []),
  ];
}

export function californiaPrivacyReviewCopy(id: string, assessment?: CaliforniaPrivacyReview) {
  const missingTopics=assessment?.contractVersion === "certscore.california-privacy-review.v5" || assessment?.contractVersion === "certscore.california-privacy-review.v6" || (assessment?.contractVersion === "certscore.california-privacy-review.v7" || (assessment?.contractVersion === "certscore.california-privacy-review.v8" || (assessment?.contractVersion === "certscore.california-privacy-review.v9" || assessment?.contractVersion === "certscore.california-privacy-review.v10"))) ? assessment.rightsAssessment?.topics :
    assessment?.contractVersion === "certscore.california-privacy-review.v4" ? assessment.disclosureInspection?.topics : undefined;
  const missingRights = missingTopics?.filter(topic=>topic.status === "not_observed").map(topic=>({
      right_to_know:"the right to know",right_to_delete:"the right to delete",right_to_correct:"the right to correct",
      non_discrimination:"non-discrimination when exercising privacy rights",
    })[topic.topic]) ?? [];
  if (id === CALIFORNIA_RIGHTS_DISCLOSURE_ID) return {
    title:missingRights.length === 1 && missingRights[0]!.startsWith("non-discrimination") ? "Non-discrimination disclosure not found in the inspected policy" : "Privacy-rights disclosure not found in the inspected policy",
    description:`A complete inspection of retained English policy text and material linked supplements found no consumer-rights disclosure for ${missingRights.length ? missingRights.join(" and ") : "one or more core California privacy-rights topics"}. This is a scoped disclosure finding, assessed assuming CCPA/CPRA applies; it does not prove requests would be refused.`,
    action:"Review the retained topic inspection and explain each applicable consumer right and how to exercise it. Check business applicability and any exemptions.",
  };
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
