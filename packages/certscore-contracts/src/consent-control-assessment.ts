import {footerCaptureResolutionSchema} from "./consent-footer-opt-out-capture";
import { cmpAuditAssessmentSchema, type CmpAuditAssessment } from "./cmp-audit-evidence";
import { consentFooterOptOutObservationSchema, footerChoiceScopeForWitness } from "./consent-footer-opt-out";
import { originalInitialOptOutSwitchesSchema } from "./initial-opt-out-switch";
import { originalOneTrustSettingsEntranceSchema } from "./explicit-opt-out-control";
import { californiaPrivacyReviewSchema } from "./california-privacy-review";
import { saleSharingPresenceLinks, privacyChoicePresenceTitle } from "./privacy-choice-presence";
import { CONTROL_INSPECTION_POLICY, CONTROL_INSPECTION_POLICIES, consentControlInspectionSchema, initialConsentSelectionSchema, isControlInspectionComplete, type InitialConsentSelection, type ConsentControlInspection } from "./consent-control-inspection";
import { z } from "zod";
import {consentCaptureDiagnosticSchema, firstLayerOptOutGeometryDiagnosticSchema, type ConsentCaptureDiagnostic} from "./consent-capture-diagnostic";
import { consentControlVisualComparisonSchema, type ConsentControlVisualComparison } from "./consent-control-visual-comparison";
import { CONSENT_CONTROL_LABEL_REGISTRY_VERSION } from "./consent-control-label-classifier";
import { CONSENT_CONTROL_CAPTURE_POLICY_VERSION, isConsentControlInteractionEligible } from "./consent-control-evidence-policy";
import type {
  ConsentControlIntent,
  ConsentControlMatchStrength,
  ConsentControlLocale,
} from "./consent-control-label-classifier";

export const CONSENT_CONTROL_ASSESSMENT_VERSION = "2.2" as const;
export const CONSENT_CONTROL_EVIDENCE_POLICY = "structured_control_evidence.v1" as const;
// Stored 2.0 assessments remain readable without silently changing their conclusions.
export const consentControlAssessmentVersionSchema = z.enum(["2.0", "2.1", "2.2"]);
export const consentControlVisualEvidenceSchema = z.object({
  status: z.enum(["available", "withheld", "unavailable"]),
  artifactRefs: z.array(z.string().max(240)).max(24),
  reasonCodes: z.array(z.string().max(120)).max(16),
});
export const consentControlAssessmentStatusSchema = z.enum(["complete", "limited", "not_applicable"]);
export const consentControlAssessmentTriStateSchema = z.enum(["observed", "not_observed", "unknown"]);
export const consentControlAssessmentLayerSchema = z.enum(["first_layer", "deeper_layer", "unknown"]);
export const consentControlAssessmentSurfaceStatusSchema = z.enum([
  "observed_actionable",
  "observed_non_actionable",
  "not_observed",
  "unknown",
]);

const assessmentControlFieldSchema = z.enum(["surface", "accept", "reject", "options", "privacy_opt_out"]);
const assessmentChannelSchema = z.enum([
  "screenshot",
  "accessibility_tree",
  "dom_inventory",
  "dom_snapshot",
  "geometry",
  "network_cmp",
  "cmp_runtime",
]);

export const consentControlAssessmentControlResultSchema = z.object({
  state: consentControlAssessmentTriStateSchema,
  inspection: z.object({
    policy: z.enum(CONTROL_INSPECTION_POLICIES),
    status: z.enum(["complete", "limited"]),
    evidenceRefs: z.array(z.string().max(240)).max(24),
  }).optional(),
  layer: consentControlAssessmentLayerSchema,
  reasonCodes: z.array(z.string().max(120)).max(16),
  evidenceRefs: z.array(z.string().max(240)).max(24),
  firstObservedAtMs: z.number().int().nonnegative().nullable(),
  lastObservedAtMs: z.number().int().nonnegative().nullable(),
});

export const consentControlAssessmentEvidenceSchema = z.object({
  initialSelection: initialConsentSelectionSchema.optional(),
  evidenceId: z.string().max(240),
  intent: z.enum(["accept", "reject", "options", "privacy_opt_out", "vendor_refusal", "save_preferences", "dismiss", "other"]),
  opensPreferenceCenter: z.literal(true).optional(),
  initialSwitchScope: z.enum(["sale","sharing"]).optional(),
  settingsEntranceSource: z.enum(["accessible_name", "same_banner_notice"]).optional(),
  controlVariant: z.enum(["reject_with_subscription", "reject_with_payment"]).nullable().default(null),
  label: z.string().max(120).nullable(),
  locale: z.string().max(16).nullable(),
  layer: consentControlAssessmentLayerSchema,
  visible: z.boolean().nullable(),
  actionable: z.boolean().nullable(),
  observedAtMs: z.number().int().nonnegative(),
  documentId: z.string().max(240).nullable(),
  documentToken: z.string().max(160).nullable().default(null),
  presentationType: z.enum(["dedicated_button", "inline_link", "persistent_link", "unknown"]).default("unknown"),
  placementType: z.enum(["action_cluster", "first_layer_body", "persistent_surface", "unknown"]).default("unknown"),
  channels: z.array(assessmentChannelSchema).max(8),
  artifactRefs: z.array(z.string().max(240)).max(24),
  classifier: z.object({
    registryVersion: z.string().max(80),
    matchedTerm: z.string().max(120).nullable(),
    matchStrength: z.string().max(40).nullable(),
    reasonCodes: z.array(z.string().max(120)).max(16),
  }).nullable(),
});

export const consentControlAssessmentContradictionSchema = z.object({
  reasonCode: z.string().max(120),
  earlierEvidenceId: z.string().max(240).nullable(),
  laterEvidenceId: z.string().max(240).nullable(),
  affectedFields: z.array(assessmentControlFieldSchema).max(5),
});

const optOutGeometryEvidenceSchema = z.object({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  data: firstLayerOptOutGeometryDiagnosticSchema,
}).strict();

const footerInspectionSchema = z.union([
  z.object({status: z.literal("unavailable"), reason: z.enum(["no_policy_run", "missing_bound_inspection"])}),
  z.object({status: z.enum(["limited", "complete"]), documentUrl: z.string().min(1).max(500),
    inspectionHash: z.string().regex(/^[a-f0-9]{64}$/)}),
]);

const optOutTimingSchema = z.object({
  reason: z.enum(["recovery_inventory_different_document", "banner_partially_in_view", "choice_observed_after_inventory"]),
  inventoryAtMs: z.number().int().nonnegative(),
  screenshot: z.object({artifactId: z.string().min(1).max(240), capturedAtMs: z.number().int().nonnegative()}).optional(),
  evidenceAtMs: z.number().int().nonnegative(),
  evidenceRef: z.string().min(1).max(240),
});

// The first-layer inventory can come from a separate recovery browser. In that
// case retain the original screenshot witness with the original footer loader.
const footerOriginalVisitSchema = z.object({
  screenshotRef: z.string().min(1).max(240),
  screenshotAtMs: z.number().int().nonnegative(),
  documentToken: z.string().min(1).max(160),
  recoveryObservationRef: z.string().min(1).max(240),
  recoveryToken: z.string().min(1).max(160),
});

const originalSwitchBindingSchema = z.object({
  packet: originalInitialOptOutSwitchesSchema,
  recovery: z.object({observationRef: z.string().min(1).max(240), documentToken: z.string().min(1).max(160)}).strict().optional(),
}).strict();
const originalSettingsBindingSchema = z.object({
  packet: originalOneTrustSettingsEntranceSchema,
  recovery: footerOriginalVisitSchema.optional(),
}).strict();
const ORIGINAL_SETTINGS_EVIDENCE_ID = "dom_text_pre_consent:onetrust-settings-entrance";

const optOutPlacementCorrectionSchema = z.object({
  label: z.string().min(1).max(120),
  evidenceRef: z.string().min(1).max(240),
  geometryCandidateId: z.string().min(1).max(240),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  documentUrl: z.string().url().max(500),
  documentToken: z.string().min(1).max(160),
  placement: z.enum(["outside_initial_banner", "persistent_site_navigation"]),
}).strict();
export type OptOutPlacementCorrection = z.infer<typeof optOutPlacementCorrectionSchema>;

const optOutFooterLinkSchema = z.object({
  placement: z.literal("document_end_strip").optional(),
  choiceScope: z.enum(["ads_privacy", "state_privacy", "california_privacy", "sale_sharing_and_targeted_advertising",
    "sale_and_targeted_advertising", "sale_sharing_and_sensitive_data"]).optional(),
  destinationKind: z.literal("privacy_policy").optional(),
  visibility: z.enum(["rendered_exposed", "covered"]).optional(),
  label: z.string().min(1).max(120),
  evidenceRef: z.string().min(1).max(240),
  documentUrl: z.string().min(1).max(500),
});

export const consentControlAssessmentSchema = z.object({
  artifactType: z.literal("consent_control_assessment"),
  artifactVersion: consentControlAssessmentVersionSchema,
  evidencePolicy: z.literal(CONSENT_CONTROL_EVIDENCE_POLICY).optional(),
  visualEvidence: consentControlVisualEvidenceSchema.optional(),
  cmpAudit: cmpAuditAssessmentSchema.optional(),
  // Independently versioned policy-lane assessment. Never changes A/R/O states,
  // their provenance hash, action authorization, or first-layer completeness.
  californiaPrivacyReview: californiaPrivacyReviewSchema.optional(),
  sameVisitFooter: consentFooterOptOutObservationSchema.optional(),
  sameVisitFooterCapture: footerCaptureResolutionSchema.optional(),
  footerOriginalVisit: footerOriginalVisitSchema.optional(),
  originalOptOutSwitches: originalSwitchBindingSchema.optional(),
  originalOptOutSettings: originalSettingsBindingSchema.optional(),
  optOutPlacementCorrections: z.array(optOutPlacementCorrectionSchema).max(24).optional(),
  optOutFooterInspection: footerInspectionSchema.optional(),
  optOutTimingLimitation: optOutTimingSchema.optional(),
  optOutFooterLinks: z.array(optOutFooterLinkSchema).max(16).optional(),
  visualComparison: consentControlVisualComparisonSchema.optional(),
  assessmentStatus: consentControlAssessmentStatusSchema,
  scan: z.object({
    scanId: z.string().max(240),
    requestedUrl: z.string().max(500).nullable(),
    finalUrl: z.string().max(500).nullable(),
    scanStatus: z.string().max(80),
    noGo: z.boolean(),
  }),
  document: z.object({
    identityStatus: z.enum(["matched", "mismatched", "unknown"]),
    canonicalDocumentId: z.string().max(240).nullable(),
    observedDocumentIds: z.array(z.string().max(240)).max(24),
    canonicalDocumentToken: z.string().max(160).nullable().default(null),
    observedDocumentTokens: z.array(z.string().max(160)).max(24).default([]),
    reasonCodes: z.array(z.string().max(120)).max(16),
  }),
  surface: z.object({
    status: consentControlAssessmentSurfaceStatusSchema,
    firstObservedAtMs: z.number().int().nonnegative().nullable(),
    lastObservedAtMs: z.number().int().nonnegative().nullable(),
    evidenceRefs: z.array(z.string().max(240)).max(24),
  }),
  controls: z.object({
    accept: consentControlAssessmentControlResultSchema,
    reject: consentControlAssessmentControlResultSchema,
    options: consentControlAssessmentControlResultSchema,
    privacyOptOut: consentControlAssessmentControlResultSchema,
  }),
  coverage: z.object({
    captureDiagnostic: consentCaptureDiagnosticSchema.optional(),
    firstLayerOptOutGeometry: optOutGeometryEvidenceSchema.optional(),
    status: z.enum(["complete", "limited", "none", "not_applicable"]),
    requiredChannels: z.array(assessmentChannelSchema).max(8),
    completedChannels: z.array(assessmentChannelSchema).max(8),
    incompleteChannels: z.array(assessmentChannelSchema).max(8),
    reasonCodes: z.array(z.string().max(120)).max(24),
  }),
  evidence: z.array(consentControlAssessmentEvidenceSchema).max(96),
  contradictions: z.array(consentControlAssessmentContradictionSchema).max(24),
  limitations: z.array(z.object({
    code: z.string().max(120),
    detail: z.string().max(500).nullable(),
    affectedFields: z.array(assessmentControlFieldSchema).max(5),
  })).max(24),
  provenance: z.object({
    projectorId: z.literal("wc01.consent-control-assessment"),
    projectorVersion: z.string().max(80),
    contractVersion: consentControlAssessmentVersionSchema,
    sourceBundleVersion: z.string().max(120).nullable(),
    sourceGeometryVersion: z.string().max(120).nullable(),
    sourceHash: z.string().regex(/^fnv1a-[0-9a-f]{8}$/),
    computedAt: z.string().datetime(),
  }),
}).superRefine((assessment, context) => {
  if (assessment.coverage.captureDiagnostic && (assessment.artifactVersion !== "2.2" ||
      assessment.document.identityStatus !== "matched" || !assessment.document.canonicalDocumentToken ||
      assessment.coverage.captureDiagnostic.documentToken !== assessment.document.canonicalDocumentToken)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "Capture diagnostics require the assessment's canonical document binding."});
  }
  if (assessment.coverage.firstLayerOptOutGeometry &&
      (assessment.coverage.captureDiagnostic?.geometryBinding !== "matched" ||
        assessment.coverage.captureDiagnostic.geometryObservedAtMs === null)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "Opt-out geometry requires a bound checkpoint."});
  }
  const nativeFooter = assessment.sameVisitFooter;
  if (assessment.optOutPlacementCorrections?.some(row => assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || row.documentUrl !== assessment.scan.finalUrl ||
      row.documentToken !== assessment.document.canonicalDocumentToken)) {
    context.addIssue({code:"custom",path:["optOutPlacementCorrections"],message:"Opt-out placement must match the verified starting document."});
  }
  const settings = assessment.originalOptOutSettings;
  const settingsRows = assessment.evidence.filter(row => row.evidenceId === ORIGINAL_SETTINGS_EVIDENCE_ID);
  if (!settings ? settingsRows.length > 0 : assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || settings.packet.documentUrl !== assessment.scan.finalUrl ||
      (settings.recovery ? settings.recovery.documentToken !== settings.packet.documentToken ||
        settings.recovery.recoveryToken !== assessment.document.canonicalDocumentToken ||
        settings.recovery.recoveryToken === settings.packet.documentToken : settings.packet.documentToken !== assessment.document.canonicalDocumentToken) ||
      settingsRows.length !== 1 || settingsRows.some(row => row.documentToken !== settings.packet.documentToken ||
        row.label !== settings.packet.label || row.observedAtMs !== settings.packet.observedAtMs || row.layer !== "first_layer" ||
        row.intent !== "privacy_opt_out" || row.opensPreferenceCenter !== true || row.settingsEntranceSource !== "accessible_name" ||
        row.visible !== true || row.actionable !== true)) {
    context.addIssue({code: "custom", path: ["originalOptOutSettings"], message: "Starting-document settings evidence requires its bound packet."});
  }
  const switches = assessment.originalOptOutSwitches;
  if (assessment.evidence.some(row => row.evidenceId.startsWith("dom_text_pre_consent:opt-out-switch:")) && !switches) {
    context.addIssue({code: "custom", path: ["originalOptOutSwitches"], message: "Original switch rows require their starting-document packet."});
  }
  if (switches && (assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || switches.packet.documentUrl !== assessment.scan.finalUrl ||
      (switches.recovery ? switches.packet.documentToken === switches.recovery.documentToken ||
        switches.recovery.documentToken !== assessment.document.canonicalDocumentToken :
        switches.packet.documentToken !== assessment.document.canonicalDocumentToken) ||
      switches.packet.rows.some(row => !assessment.evidence.some(e => e.evidenceId === `dom_text_pre_consent:opt-out-switch:${row.scope}` &&
        e.documentToken === switches.packet.documentToken && e.label === row.label && e.initialSwitchScope === row.scope &&
        e.observedAtMs === switches.packet.observedAtMs && e.visible === true && e.actionable === true &&
        e.layer === "first_layer" && e.intent === "privacy_opt_out")))) {
    context.addIssue({code: "custom", path: ["originalOptOutSwitches"], message: "Original switch evidence must match the bound starting document."});
  }
  const original = assessment.footerOriginalVisit;
  if (original && (!nativeFooter || original.documentToken !== nativeFooter.documentToken ||
      original.recoveryToken !== assessment.document.canonicalDocumentToken || original.recoveryToken === original.documentToken)) {
    context.addIssue({code: "custom", path: ["footerOriginalVisit"], message: "The original footer and recovery visit must have distinct, bound loaders."});
  }
  if (nativeFooter && (assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || (!original && nativeFooter.documentToken !== assessment.document.canonicalDocumentToken) ||
      nativeFooter.documentUrl !== assessment.scan.finalUrl)) {
    context.addIssue({code: "custom", path: ["sameVisitFooter"], message: "The footer checkpoint must match the consent document."});
  }
  for (const link of assessment.optOutFooterLinks ?? []) {
    if (link.placement || link.choiceScope || link.destinationKind || link.visibility || link.evidenceRef.startsWith("dom_text_pre_consent:")) {
      if (!link.visibility || !nativeFooter?.candidates.some(row =>
        link.evidenceRef === nativeFooter.artifactId + ":" + row.evidenceId &&
        link.label === row.label && link.visibility === row.visibility &&
        Boolean(link.placement) === Boolean(row.placementWitness) &&
        link.choiceScope === footerChoiceScopeForWitness(row.controlWitness) &&
        Boolean(link.destinationKind) === (row.controlWitness === "named_privacy_policy_entrance"))) {
        context.addIssue({code: "custom", path: ["optOutFooterLinks"], message: "Footer hit-test evidence must match its native control."});
      }
    }
  }
  const footerInspection = assessment.optOutFooterInspection;
  if (footerInspection && footerInspection.status !== "unavailable" && (assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || footerInspection.documentUrl !== assessment.scan.finalUrl)) {
    context.addIssue({code: "custom", path: ["optOutFooterInspection"], message: "Footer inspection requires the same usable starting document."});
  }
  if (assessment.optOutTimingLimitation && (assessment.controls.privacyOptOut.state === "not_observed" ||
      assessment.controls.privacyOptOut.inspection?.status === "complete")) {
    context.addIssue({code: "custom", path: ["optOutTimingLimitation"], message: "A timing-limited inspection cannot establish absence."});
  }
  if (assessment.optOutFooterLinks?.some(link => assessment.scan.noGo || assessment.document.identityStatus !== "matched" ||
      link.documentUrl !== assessment.scan.finalUrl)) {
    context.addIssue({code: "custom", path: ["optOutFooterLinks"], message: "Footer evidence must bind to the usable starting document."});
  }
  const california = assessment.californiaPrivacyReview;
  if (california && (assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      california.scanId !== assessment.scan.scanId || california.documentUrl !== assessment.scan.finalUrl)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["californiaPrivacyReview"], message: "California choice assessment must bind the same usable scan and final document."});
  }
  if (california?.contractVersion === "certscore.california-privacy-review.v10" &&
      california.observedScoreBasis?.policyVersion === "usable_starting_page_score.v5-browser-extension" &&
      (assessment.scan.scanStatus !== "completed" || assessment.document.identityStatus !== "matched" ||
       california.observedScoreBasis.documentToken !== assessment.document.canonicalDocumentToken)) {
    context.addIssue({code: "custom", path: ["californiaPrivacyReview"], message: "Browser score proof must match the retained starting document."});
  }
  if (assessment.cmpAudit && assessment.cmpAudit.scanId !== assessment.scan.scanId) context.addIssue({ code: z.ZodIssueCode.custom, message: "CMP audit must bind the assessment scan." });
  const visual = assessment.visualComparison;
  if (visual && (assessment.artifactVersion !== "2.2" || assessment.scan.noGo ||
      assessment.document.identityStatus !== "matched" || assessment.surface.status !== "observed_actionable" ||
      assessment.visualEvidence?.status !== "available" || visual.documentToken !== assessment.document.canonicalDocumentToken ||
      ["accept", "reject"].some(intent => assessment.controls[intent as "accept" | "reject"].state !== "observed" ||
        !assessment.evidence.some(row => row.evidenceId === visual[intent as "accept" | "reject"].candidateId &&
          row.intent === intent && row.layer === "first_layer" && row.visible && row.actionable &&
          row.documentToken === visual.documentToken && row.channels.includes("geometry"))))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Visual comparison requires available, document-bound evidence for both observed first-layer controls." });
  }
  if (assessment.artifactVersion !== assessment.provenance.contractVersion) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Assessment and provenance contract versions must match." });
  }
  if (["2.1", "2.2"].includes(assessment.artifactVersion) && (
    !assessment.evidencePolicy || !assessment.visualEvidence ||
    assessment.coverage.requiredChannels.length === 0 ||
    [assessment.coverage.requiredChannels, assessment.coverage.completedChannels, assessment.coverage.incompleteChannels]
      .some((channels) => channels.includes("screenshot"))
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Assessment 2.1 requires structured evidence policy and separate, non-gating visual evidence." });
  }
  if (assessment.artifactVersion === "2.2" && Object.values(assessment.controls).some(control =>
    !control.inspection || (control.state === "not_observed" && (control.inspection.status !== "complete" ||
      !control.inspection.evidenceRefs.some(ref => ["CanonicalEvidenceBundle.json", "ConsentControlGeometryEvidence.json"].includes(ref)) || assessment.scan.noGo || assessment.document.identityStatus !== "matched"))
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Assessment 2.2 requires control-specific inspection proof for negative states." });
  if (["2.1", "2.2"].includes(assessment.artifactVersion) && assessment.assessmentStatus === "complete" && (
    assessment.scan.noGo || assessment.document.identityStatus !== "matched" ||
    assessment.coverage.status !== "complete" ||
    [assessment.controls.accept, assessment.controls.reject, assessment.controls.options].some((control) => control.state === "unknown")
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A complete structured assessment requires verified coverage, identity, and binary A/R/O states." });
  }
});

export type ConsentControlAssessment = z.infer<typeof consentControlAssessmentSchema>;

export function readCaliforniaPrivacyReviewFromConsent(value: unknown) {
  const parsed = consentControlAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data.californiaPrivacyReview ?? null : null;
}
/** Read the persisted canonical child; raw labels and older workpapers cannot upgrade presence. */
export function readSaleSharingLinkPresence(value: unknown) {
  const review = readCaliforniaPrivacyReviewFromConsent(value);
  const links = saleSharingPresenceLinks(review?.choicePresence);
  return review && links.length ? {review, links, title: privacyChoicePresenceTitle(review.choicePresence)} : null;
}
export type ConsentControlAssessmentControlResult = z.infer<typeof consentControlAssessmentControlResultSchema>;
export type ConsentControlAssessmentEvidence = z.infer<typeof consentControlAssessmentEvidenceSchema>;

/** Bounded persisted-assessment projection; no screenshot/DOM inference on read. */
export function projectConsentVisualProminence(value: unknown) {
  const parsed = consentControlAssessmentSchema.safeParse(value);
  if (!parsed.success || !parsed.data.visualComparison) return undefined;
  return { version: "consent_visual_prominence_projection.v1" as const,
    assessmentSourceHash: parsed.data.provenance.sourceHash, comparison: parsed.data.visualComparison };
}

export type ConsentControlAssessmentObservation = {
  captureDiagnostic?: ConsentCaptureDiagnostic;
  observationId: string;
  observedAtMs: number;
  likelyPresent: boolean;
  layerInspected?: "first_layer" | "unknown";
  documentId?: string | null;
  documentToken?: string | null;
  captureStatus?: "observed" | "no_evidence" | "incomplete";
  inventoryOutcome?: "complete_with_controls" | "complete_empty" | "partial" | "timed_out" | "frame_inaccessible" | "document_mismatch" | "geometry_unavailable" | "no_go";
  completedChannels?: ConsentControlAssessmentChannel[];
  incompleteChannels?: ConsentControlAssessmentChannel[];
  evidenceRefs?: string[];
  controls: ConsentControlAssessmentCandidate[];
};

export type ConsentControlAssessmentCandidate = {
  tagName?: string;
  role?: string;
  semanticallyInteractive?: boolean;
  consentContextConfirmed?: boolean;
  consentContextEvidence?: string;
  initialSelection?: InitialConsentSelection;
  evidenceId?: string;
  intent?: ConsentControlAssessmentEvidence["intent"] | "unknown";
  opensPreferenceCenter?: true;
  initialSwitchScope?: "sale" | "sharing";
  settingsEntranceSource?: "accessible_name" | "same_banner_notice";
  semanticRole?: "explicit_accept" | "ambiguous_acknowledgment" | "reject" | "necessary_only" | "preferences" | "dismiss" | "unknown";
  actionType?: "accept_all" | "reject_all" | "manage_preferences" | "save_preferences" | "do_not_sell_share" | "other";
  controlVariant?: "reject_with_subscription" | "reject_with_payment" | null;
  label?: string | null;
  locale?: ConsentControlLocale | null;
  matchedTerm?: string | null;
  matchStrength?: ConsentControlMatchStrength | null;
  classifierRegistryVersion?: string;
  classifierReasonCodes?: string[];
  layer?: "first_layer" | "deeper_layer" | "unknown";
  visible?: boolean | null;
  actionable?: boolean | null;
  observedAtMs?: number;
  documentId?: string | null;
  documentToken?: string | null;
  presentationType?: "dedicated_button" | "inline_link" | "persistent_link" | "unknown";
  placementType?: "action_cluster" | "first_layer_body" | "persistent_surface" | "unknown";
  channels?: ConsentControlAssessmentChannel[];
  artifactRefs?: string[];
};

export type ConsentControlAssessmentChannel = z.infer<typeof assessmentChannelSchema>;

export type ConsentControlAssessmentGeometry = {
  visualComparison?: ConsentControlVisualComparison;
  controlInspection?: ConsentControlInspection;
  firstLayerOptOutGeometry?: z.infer<typeof optOutGeometryEvidenceSchema>;
  /** Retained typed inspection was present but could not be verified. */
  inspectionInvalid?: boolean;
  artifactVersion?: string | null;
  assessmentStatus?: "complete" | "incomplete" | "document_mismatch" | null;
  documentId?: string | null;
  documentToken?: string | null;
  observedAtMs?: number | null;
  completedChannels?: ConsentControlAssessmentChannel[];
  incompleteChannels?: ConsentControlAssessmentChannel[];
  evidenceRefs?: string[];
  candidates?: ConsentControlAssessmentCandidate[];
};

export type ConsentControlAssessmentInput = {
  optOutPlacementCorrections?: OptOutPlacementCorrection[];
  originalOptOutSwitches?: z.infer<typeof originalSwitchBindingSchema>;
  originalOptOutSettings?: z.infer<typeof originalSettingsBindingSchema>;
  footerOriginalVisit?: z.infer<typeof footerOriginalVisitSchema>;
  sameVisitFooter?: z.infer<typeof consentFooterOptOutObservationSchema>;
  sameVisitFooterCapture?: z.infer<typeof footerCaptureResolutionSchema>;
  optOutFooterInspection?: z.infer<typeof footerInspectionSchema>;
  optOutTimingLimitation?: z.infer<typeof optOutTimingSchema>;
  optOutFooterLinks?: Array<z.infer<typeof optOutFooterLinkSchema>>;
  cmpAudit?: CmpAuditAssessment;
  visualEvidence?: z.infer<typeof consentControlVisualEvidenceSchema>;
  scan: {
    scanId: string;
    requestedUrl?: string | null;
    finalUrl?: string | null;
    scanStatus?: string | null;
    noGo?: boolean;
    noGoReasonCodes?: string[];
  };
  document?: {
    canonicalDocumentId?: string | null;
    observedDocumentIds?: string[];
    canonicalDocumentToken?: string | null;
    observedDocumentTokens?: string[];
    identityStatus?: "matched" | "mismatched" | "unknown";
  };
  observations?: ConsentControlAssessmentObservation[];
  geometry?: ConsentControlAssessmentGeometry | null;
  surface?: {
    status?: z.infer<typeof consentControlAssessmentSurfaceStatusSchema>;
    firstObservedAtMs?: number | null;
    lastObservedAtMs?: number | null;
    evidenceRefs?: string[];
  };
  coverage?: {
    status?: "complete" | "limited" | "none" | "not_applicable";
    requiredChannels?: ConsentControlAssessmentChannel[];
    completedChannels?: ConsentControlAssessmentChannel[];
    incompleteChannels?: ConsentControlAssessmentChannel[];
    reasonCodes?: string[];
  };
  source?: {
    bundleVersion?: string | null;
    geometryVersion?: string | null;
    projectorVersion?: string;
    computedAt?: string;
  };
};

const PROJECTOR_VERSION = "2.2.38";
const DEFAULT_REQUIRED_CHANNELS: ConsentControlAssessmentChannel[] = ["dom_inventory", "geometry"];

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function bounded(values: string[] | undefined, limit = 24) {
  return unique((values ?? []).filter((value) => value.trim().length > 0)).slice(0, limit);
}

function boundedText(value: string | null | undefined, limit: number) {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function boundedIdentityText(value: string | null | undefined, limit: number) {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  const suffix = `~${fnv1a(normalized)}`;
  return `${normalized.slice(0, Math.max(0, limit - suffix.length))}${suffix}`;
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isPaidDeclineVariant(value: ConsentControlAssessmentCandidate["controlVariant"]): boolean {
  return value === "reject_with_subscription" || value === "reject_with_payment";
}

function candidateIntent(candidate: ConsentControlAssessmentCandidate): ConsentControlAssessmentEvidence["intent"] | null {
  if (candidate.actionType === "do_not_sell_share" && candidate.label?.trim().toLowerCase() === "abmelden") return null;
  if (candidate.actionType === "do_not_sell_share" &&
      candidate.classifierReasonCodes?.includes("vendor_specific_privacy_opt_out")) return "vendor_refusal";
  if (candidate.intent && candidate.intent !== "unknown") return candidate.intent;
  if (candidate.actionType === "accept_all" || candidate.semanticRole === "explicit_accept") return "accept";
  if (isPaidDeclineVariant(candidate.controlVariant)) return "reject";
  if (candidate.actionType === "reject_all" || candidate.semanticRole === "reject" || candidate.semanticRole === "necessary_only") return "reject";
  if (candidate.actionType === "manage_preferences" || candidate.actionType === "save_preferences" || candidate.semanticRole === "preferences") return "options";
  if (candidate.actionType === "do_not_sell_share") return "privacy_opt_out";
  if (candidate.semanticRole === "dismiss") return "dismiss";
  return null;
}

function canonicalDocumentId(input: ConsentControlAssessmentInput) {
  return boundedIdentityText(
    input.document?.canonicalDocumentId ?? input.scan.finalUrl ?? input.scan.requestedUrl ?? null,
    240,
  );
}

function eligibleCandidate(candidate: ConsentControlAssessmentCandidate, fallbackObservedAtMs: number, fallbackDocumentId: string | null, source: "bundle" | "geometry"): ConsentControlAssessmentEvidence | null {
  const intent = candidateIntent(candidate);
  const layer = candidate.layer ?? "unknown";
  const visible = candidate.visible ?? null;
  const actionable = candidate.actionable ?? null;
  // Positive control evidence must be explicit. Missing visibility or
  // actionability metadata is an evidence limitation, not permission to
  // promote a candidate into an observed first-layer control.
  const presentationType = candidate.presentationType ?? "unknown";
  const retainedPersistentOptionsLink =
    intent === "options" &&
    layer === "deeper_layer" &&
    presentationType === "persistent_link";
  if (
    !intent ||
    !isConsentControlInteractionEligible(candidate) ||
    (layer !== "first_layer" && !retainedPersistentOptionsLink) ||
    visible !== true ||
    actionable !== true
  ) return null;
  const observedAtMs = candidate.observedAtMs ?? fallbackObservedAtMs;
  const evidenceId = boundedIdentityText(
    candidate.evidenceId ?? `${source}:${observedAtMs}:${candidate.label ?? intent}`,
    240,
  ) ?? `${source}:${observedAtMs}:${intent}`;
  return {
    ...(candidate.initialSelection ? { initialSelection: candidate.initialSelection } : {}),
    evidenceId,
    intent,
    ...(candidate.initialSwitchScope && source === "geometry" && candidate.role === "switch" && intent === "privacy_opt_out" ? {initialSwitchScope:candidate.initialSwitchScope} : {}),
    ...(candidate.opensPreferenceCenter && intent === "privacy_opt_out" ? {opensPreferenceCenter: true as const,
      ...(candidate.settingsEntranceSource ? {settingsEntranceSource: candidate.settingsEntranceSource} : {})} : {}),
    controlVariant: candidate.controlVariant ?? null,
    label: boundedText(candidate.label, 120),
    locale: candidate.locale ?? null,
    layer,
    visible,
    actionable,
    observedAtMs,
    documentId: boundedIdentityText(candidate.documentId ?? fallbackDocumentId, 240),
    documentToken: boundedIdentityText(candidate.documentToken, 160),
    presentationType,
    placementType: candidate.placementType ?? "unknown",
    channels: unique(candidate.channels ?? (source === "geometry" ? ["geometry"] : ["dom_inventory"])),
    artifactRefs: bounded(candidate.artifactRefs ?? []),
    classifier: {
      registryVersion: candidate.classifierRegistryVersion ?? "consent-control-label-registry",
      matchedTerm: candidate.matchedTerm ?? null,
      matchStrength: candidate.matchStrength ?? null,
      reasonCodes: bounded(candidate.classifierReasonCodes, 16),
    },
  } satisfies ConsentControlAssessmentEvidence;
}

function resultFor(intent: ConsentControlIntent, evidence: ConsentControlAssessmentEvidence[], completeInventory: boolean, reasons: string[]): ConsentControlAssessmentControlResult {
  const matching = evidence.filter((item) =>
    item.intent === intent &&
    item.layer === "first_layer" &&
    !(intent === "reject" && isPaidDeclineVariant(item.controlVariant))
  );
  const first = matching[0]?.observedAtMs ?? null;
  const last = matching.at(-1)?.observedAtMs ?? null;
  if (matching.length > 0) {
    return {
      state: "observed",
      layer: "first_layer",
      reasonCodes: ["same_document_first_layer_control_observed", ...reasons].slice(0, 16),
      evidenceRefs: bounded(matching.flatMap((item) => [item.evidenceId, ...item.artifactRefs])),
      firstObservedAtMs: first,
      lastObservedAtMs: last,
    };
  }
  return {
    state: completeInventory ? "not_observed" : "unknown",
    layer: "first_layer",
    reasonCodes: [completeInventory ? "complete_first_layer_inventory_without_control" : "first_layer_inventory_incomplete", ...reasons].slice(0, 16),
    evidenceRefs: [],
    firstObservedAtMs: null,
    lastObservedAtMs: null,
  };
}

export function deriveConsentControlAssessment(input: ConsentControlAssessmentInput): ConsentControlAssessment {
  const observations = [...(input.observations ?? [])].sort((left, right) => left.observedAtMs - right.observedAtMs);
  const canonicalId = canonicalDocumentId(input);
  const bundleObservedIds = bounded([
    ...(input.document?.observedDocumentIds ?? []),
    ...observations.map((observation) => observation.documentId ?? ""),
  ].flatMap((value) => boundedIdentityText(value, 240) ?? []));
  const observedIds = bounded([
    ...bundleObservedIds,
    ...(input.geometry &&
    (input.geometry.assessmentStatus === "complete" || (input.geometry.candidates?.length ?? 0) > 0)
      ? [boundedIdentityText(input.geometry.documentId, 240) ?? ""]
      : []),
  ]);
  const canonicalDocumentToken = boundedIdentityText(input.document?.canonicalDocumentToken, 160);
  const observedDocumentTokens = bounded([
    ...(input.document?.observedDocumentTokens ?? []),
    ...observations.map((observation) => observation.documentToken ?? ""),
    input.geometry?.documentToken ?? "",
  ].flatMap((value) => boundedIdentityText(value, 160) ?? []));
  const documentStatus = input.document?.identityStatus ??
    (canonicalDocumentToken && observedDocumentTokens.length > 0
      ? observedDocumentTokens.some((token) => token !== canonicalDocumentToken)
        ? "mismatched"
        : "matched"
      : !canonicalId || bundleObservedIds.length === 0
      ? "unknown"
      : bundleObservedIds.some((id) => id !== canonicalId)
        ? "mismatched"
        : "matched");
  const noGo = input.scan.noGo === true;
  const geometryMismatch = input.geometry?.assessmentStatus === "document_mismatch";
  const parsedInspection = consentControlInspectionSchema.safeParse(input.geometry?.controlInspection);
  const inspection = parsedInspection.success ? parsedInspection.data : null;
  const inspectionDocumentBound = Boolean(canonicalDocumentToken && input.geometry?.documentToken === canonicalDocumentToken &&
    canonicalId && input.geometry?.documentId === canonicalId);
  // A supplemental capture cannot resolve a newer incomplete inventory. Empty
  // surfaces still need the established completed whole-inspection path; early
  // geometry before a CMP appears must not create a new absence shortcut.
  const inspectionCurrent = typeof input.geometry?.observedAtMs === "number" && Number.isFinite(input.geometry.observedAtMs) &&
    input.geometry.observedAtMs >= Math.max(0, ...observations.map(o => o.observedAtMs));
  const structuredAbsenceBlocked = inspectionCurrent && inspectionDocumentBound &&
    (input.geometry?.inspectionInvalid === true || inspection?.structuralCoverage === "limited");
  const incompleteInventoryOutcomes = unique(observations
    .map((observation) => observation.inventoryOutcome)
    .filter((outcome): outcome is NonNullable<ConsentControlAssessmentObservation["inventoryOutcome"]> =>
      outcome === "partial" ||
      outcome === "timed_out" ||
      outcome === "frame_inaccessible" ||
      outcome === "document_mismatch" ||
      outcome === "geometry_unavailable" ||
      outcome === "no_go"
    ));
  const typedInventoryOutcomeIncomplete = incompleteInventoryOutcomes.length > 0;
  const limitations: ConsentControlAssessment["limitations"] = [];
  const identityWasBounded =
    [input.scan.requestedUrl, input.scan.finalUrl]
      .some((value) => typeof value === "string" && value.trim().length > 500) ||
    [
      input.document?.canonicalDocumentId,
      ...(input.document?.observedDocumentIds ?? []),
      ...observations.map((observation) => observation.documentId),
      input.geometry?.documentId,
    ].some((value) => typeof value === "string" && value.trim().length > 240);
  const reasons = bounded([
    ...(input.scan.noGoReasonCodes ?? []),
    ...(input.coverage?.reasonCodes ?? []),
    ...(input.geometry?.assessmentStatus === "incomplete" ? ["geometry_capture_incomplete"] : []),
    ...(geometryMismatch ? ["geometry_document_mismatch"] : []),
  ]);

  if (noGo) limitations.push({ code: "scan_no_go", detail: "The scan did not retain a usable document for consent assessment.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (documentStatus === "mismatched") limitations.push({ code: "document_identity_mismatch", detail: "Observed consent evidence was not attributable to the canonical scanned document.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (documentStatus === "unknown") limitations.push({ code: "document_identity_unverified", detail: "The retained consent evidence was not explicitly bound to the canonical scanned document.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (geometryMismatch) limitations.push({ code: "geometry_document_mismatch", detail: "Geometry was retained for a different document identity and cannot erase bundle evidence.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (identityWasBounded) limitations.push({ code: "document_identity_bounded", detail: "An overlong retained URL or document identity was projected with a stable hash suffix.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (typedInventoryOutcomeIncomplete) limitations.push({
    code: "typed_inventory_incomplete",
    detail: `The retained first-layer inventory did not complete: ${incompleteInventoryOutcomes.join(", ")}.`,
    affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"],
  });
  const bundleEvidence = observations.flatMap((observation) => observation.controls
    .map((candidate) => eligibleCandidate(candidate, observation.observedAtMs, observation.documentId ?? canonicalId, "bundle"))
    .filter((candidate): candidate is ConsentControlAssessmentEvidence => candidate !== null));
  // A label conflict can limit the whole inventory even when one source-verified
  // settings entrance has its own conclusive geometry. Preserve all absence gates.
  const geometryEvidence = (input.geometry?.candidates ?? [])
    .filter(candidate => input.geometry?.assessmentStatus === "complete" ||
      (input.geometry?.assessmentStatus === "incomplete" && inspectionDocumentBound &&
       (candidate.opensPreferenceCenter === true || candidate.initialSwitchScope && candidate.role === "switch") && candidate.intent === "privacy_opt_out" &&
       candidate.documentToken === canonicalDocumentToken))
    .map(candidate => eligibleCandidate(candidate, input.geometry?.observedAtMs ?? 0, input.geometry?.documentId ?? canonicalId, "geometry"))
    .filter((candidate): candidate is ConsentControlAssessmentEvidence => candidate !== null);
  const originalOptOutSwitches = !noGo && documentStatus === "matched" ? input.originalOptOutSwitches : undefined;
  const originalOptOutSettings = !noGo && documentStatus === "matched" ? input.originalOptOutSettings : undefined;
  const optOutPlacementCorrections = !noGo && documentStatus === "matched" && input.optOutPlacementCorrections?.length
    ? input.optOutPlacementCorrections : undefined;
  const originalSettingsEvidence: ConsentControlAssessmentEvidence[] = originalOptOutSettings ? [{
    evidenceId: ORIGINAL_SETTINGS_EVIDENCE_ID, intent: "privacy_opt_out", controlVariant: null,
    label: originalOptOutSettings.packet.label, locale: "en", layer: "first_layer", visible: true, actionable: true,
    observedAtMs: originalOptOutSettings.packet.observedAtMs, documentId: canonicalId,
    documentToken: originalOptOutSettings.packet.documentToken, opensPreferenceCenter: true,
    settingsEntranceSource: "accessible_name", presentationType: "dedicated_button", placementType: "action_cluster",
    channels: ["dom_snapshot", "geometry"], artifactRefs: ["dom_text_pre_consent"], classifier: null,
  }] : [];
  const originalSwitchEvidence: ConsentControlAssessmentEvidence[] =
    (originalOptOutSwitches?.packet.rows ?? []).map(row => ({
      evidenceId: `dom_text_pre_consent:opt-out-switch:${row.scope}`, intent: "privacy_opt_out", controlVariant: null,
      label: row.label, locale: "en", layer: "first_layer", visible: true, actionable: true,
      observedAtMs: originalOptOutSwitches!.packet.observedAtMs, documentId: canonicalId,
      documentToken: originalOptOutSwitches!.packet.documentToken,
      initialSwitchScope: row.scope, presentationType: "dedicated_button", placementType: "first_layer_body",
      channels: ["dom_snapshot", "geometry"], artifactRefs: ["dom_text_pre_consent"], classifier: null,
    }));
  const primaryEvidence = [...bundleEvidence, ...geometryEvidence]
    .filter((item) => documentStatus === "matched" && Boolean(canonicalId) && item.documentId === canonicalId)
    .filter(item => !item.initialSwitchScope || !originalSwitchEvidence.some(original =>
      original.initialSwitchScope === item.initialSwitchScope && original.label === item.label))
    .filter(item => !item.opensPreferenceCenter || !originalSettingsEvidence.some(original => original.label === item.label))
    .sort((left, right) => left.observedAtMs - right.observedAtMs)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index)
    .slice(0, 96 - originalSwitchEvidence.length - originalSettingsEvidence.length);
  const evidence = [...primaryEvidence, ...originalSwitchEvidence, ...originalSettingsEvidence]
    .sort((left, right) => left.observedAtMs - right.observedAtMs);

  const firstLayerEvidence = evidence.filter((item) => item.layer === "first_layer");
  const actionableConsentEvidence = firstLayerEvidence.filter((item) => item.intent !== "privacy_opt_out" && item.intent !== "vendor_refusal");
  // A sale/share or advertising opt-out is retained consent-adjacent evidence,
  // but it does not prove that a GDPR/ePrivacy cookie-consent surface exists.
  // Keep the privacy choice observable without promoting it to actionable A/R/O.
  const actionable = actionableConsentEvidence.length > 0;
  const surfaceExplicitlyNotObserved = input.surface?.status === "not_observed";
  const verifiedRetainedSurfaceObservation = observations.some((observation) =>
    observation.captureStatus === "observed" &&
    observation.likelyPresent === true &&
    observation.layerInspected === "first_layer" &&
    (observation.incompleteChannels?.length ?? 0) === 0 &&
    Boolean(canonicalId) &&
    observation.documentId === canonicalId &&
    (observation.controls.length > 0 || (observation.evidenceRefs?.length ?? 0) > 0)
  );
  const surfaceObserved =
    input.surface?.status === "observed_actionable" ||
    input.surface?.status === "observed_non_actionable" ||
    actionable ||
    (
      !surfaceExplicitlyNotObserved &&
      verifiedRetainedSurfaceObservation
    );
  const coverageStatus = input.coverage?.status ?? "limited";
  const structuredRequiredChannels = unique(input.coverage?.requiredChannels ?? DEFAULT_REQUIRED_CHANNELS)
    .filter((channel) => channel !== "screenshot");
  const requiredChannels: ConsentControlAssessmentChannel[] = structuredRequiredChannels.length > 0
    ? structuredRequiredChannels
    : DEFAULT_REQUIRED_CHANNELS;
  const completedChannels: ConsentControlAssessmentChannel[] = unique(input.coverage?.completedChannels ?? observations.flatMap((observation) => observation.completedChannels ?? []))
    .filter((channel) => channel !== "screenshot");
  const incompleteChannels = unique(input.coverage?.incompleteChannels ?? observations.flatMap((observation) => observation.incompleteChannels ?? []))
    .filter((channel) => channel !== "screenshot");
  const geometryComplete = input.geometry?.assessmentStatus === "complete";
  const firstLayerObservationComplete = observations.some((observation) =>
    observation.captureStatus === "observed" &&
    observation.likelyPresent === true &&
    observation.layerInspected === "first_layer" &&
    !(observation.incompleteChannels ?? []).some((channel) => channel !== "screenshot") &&
    observation.controls.length > 0 &&
    observation.controls.every((control) =>
      control.visible === true &&
      control.actionable === true &&
      (control.layer ?? observation.layerInspected) === "first_layer"
    )
  );
  const firstLayerObservationRetained = observations.some((observation) =>
    observation.layerInspected === "first_layer" &&
    (
      observation.captureStatus === "observed" ||
      observation.captureStatus === "no_evidence" ||
      observation.controls.some((control) =>
        (control.layer ?? observation.layerInspected) === "first_layer"
      )
    )
  );
  const explicitCoverageAllowsCompleteness =
    input.coverage?.status === undefined || input.coverage.status === "complete";
  const consentEvidenceCoverageComplete =
    explicitCoverageAllowsCompleteness &&
    !typedInventoryOutcomeIncomplete &&
    !noGo &&
    documentStatus === "matched" &&
    (geometryComplete || firstLayerObservationComplete) &&
    (
      input.surface?.status === "not_observed" ||
      firstLayerObservationRetained ||
      (input.geometry?.candidates?.length ?? 0) > 0
    );
  const typedInventoryCoverageComplete =
    !noGo &&
    !typedInventoryOutcomeIncomplete &&
    documentStatus === "matched" &&
    coverageStatus === "complete" &&
    requiredChannels.length === 1 &&
    requiredChannels[0] === "dom_inventory" &&
    firstLayerObservationRetained &&
    bundleEvidence.length > 0;
  const completeConsentInventory = consentEvidenceCoverageComplete || typedInventoryCoverageComplete;
  // Explicit coordinator coverage is authoritative. Directly observed
  // controls remain observed under limited coverage, but an incomplete
  // inventory cannot be upgraded into factual negative control states.
  const effectiveCoverageStatus = structuredAbsenceBlocked ? "limited" : consentEvidenceCoverageComplete ? "complete" : coverageStatus;
  const effectiveCompletedChannels = unique([
    ...completedChannels,
    ...(firstLayerObservationRetained ? ["dom_inventory" as const] : []),
    ...(geometryComplete ? ["geometry" as const] : []),
  ]);
  const effectiveIncompleteChannels = completeConsentInventory
    ? []
    : incompleteChannels.filter((channel) => requiredChannels.includes(channel));
  const completeInventory = !structuredAbsenceBlocked && (completeConsentInventory || (
    !typedInventoryOutcomeIncomplete &&
    coverageStatus === "complete" &&
    requiredChannels.every((channel) => effectiveCompletedChannels.includes(channel)) &&
    effectiveIncompleteChannels.length === 0 &&
    !noGo &&
    documentStatus === "matched" &&
    (
      input.surface?.status === "not_observed" ||
      firstLayerObservationRetained
    )
  ));
  const assessmentBlocked = noGo || documentStatus !== "matched";
  let surfaceStatus = assessmentBlocked
    ? "unknown"
    : actionable
      ? "observed_actionable"
      : surfaceObserved
        ? "observed_non_actionable"
        : (!structuredAbsenceBlocked && input.surface?.status === "not_observed") || effectiveCoverageStatus === "complete"
          ? "not_observed"
          : "unknown";
  if (structuredAbsenceBlocked) limitations.push({ code: "structured_inspection_incomplete", detail: "The current retained control inspection did not verify complete structural coverage; a generic complete inventory cannot establish absence.", affectedFields: ["surface", "accept", "reject", "options", "privacy_opt_out"] });
  if (!surfaceObserved && effectiveCoverageStatus !== "complete") limitations.push({ code: "surface_inspection_incomplete", detail: "No complete pre-interaction surface inspection was retained.", affectedFields: ["surface", "accept", "reject", "options"] });

  const contradictionRows: ConsentControlAssessment["contradictions"] = [];
  if (actionable && input.surface?.status === "not_observed") {
    contradictionRows.push({
      reasonCode: "retained_actionable_control_overrides_later_surface_absence",
      earlierEvidenceId: actionableConsentEvidence[0]?.evidenceId ?? null,
      laterEvidenceId: null,
      affectedFields: ["surface"],
    });
  }
  if (geometryMismatch) {
    contradictionRows.push({ reasonCode: "geometry_document_mismatch_does_not_erase_bundle_evidence", earlierEvidenceId: bundleEvidence[0]?.evidenceId ?? null, laterEvidenceId: null, affectedFields: ["surface", "accept", "reject", "options"] });
  }
  const independentlyComplete = (intent: "accept" | "reject" | "options" | "privacy_opt_out") =>
    !assessmentBlocked && !geometryMismatch && geometryComplete && inspectionDocumentBound &&
    inspectionCurrent && Boolean(inspection && inspection.candidates.length > 0 && isControlInspectionComplete(inspection, intent));
  const resultWithInspection = (intent: "accept" | "reject" | "options" | "privacy_opt_out") => {
    const currentControlComplete = !inspection || !inspectionCurrent || !inspectionDocumentBound || isControlInspectionComplete(inspection, intent);
    const timing = intent === "privacy_opt_out" ? input.optOutTimingLimitation : undefined;
    const independentOriginal = intent === "privacy_opt_out" && Boolean(originalOptOutSwitches?.recovery || originalOptOutSettings?.recovery);
    const placementConflict = intent === "privacy_opt_out" && Boolean(optOutPlacementCorrections);
    const inspected = !timing && !independentOriginal && !placementConflict && ((completeInventory && currentControlComplete) || independentlyComplete(intent));
    const result = resultFor(intent, evidence, inspected, timing ? [timing.reason, ...reasons] :
      placementConflict ? ["verified_outside_initial_banner", ...reasons] : reasons);
    result.inspection = {
      policy: inspection?.version ?? CONTROL_INSPECTION_POLICY, status: inspected ? "complete" : "limited",
      evidenceRefs: inspected ? bounded(independentlyComplete(intent)
        ? ["ConsentControlGeometryEvidence.json", ...(input.geometry?.evidenceRefs ?? [])]
        : ["CanonicalEvidenceBundle.json", ...observations.flatMap(o => o.evidenceRefs ?? [])]) : [],
    };
    if (inspected && !completeInventory) result.reasonCodes = ["control_specific_inventory_complete", ...result.reasonCodes].slice(0, 16);
    return result;
  };
  const firstLayerResults = {
    accept: resultWithInspection("accept"), reject: resultWithInspection("reject"),
    options: resultWithInspection("options"), privacyOptOut: resultWithInspection("privacy_opt_out"),
  };
  if (assessmentBlocked) {
    for (const result of Object.values(firstLayerResults)) {
      result.state = "unknown";
      result.layer = "unknown";
      result.reasonCodes = ["assessment_blocked", ...reasons].slice(0, 16);
    }
  }
  // A verified first-layer control proves the surface exists even when other
  // frames prevent a complete negative inventory. Keep all unknown controls
  // and coverage limits; presence is independent of inspection completeness.
  if(surfaceStatus==="unknown" && !assessmentBlocked && documentStatus==="matched" &&
    Object.values(firstLayerResults).some(result=>result.state==="observed" && result.layer==="first_layer")) surfaceStatus="observed_actionable";
  const containsUnknownControl = Object.values(firstLayerResults).some((result) => result.state === "unknown");
  const assessmentComplete = !assessmentBlocked &&
    effectiveCoverageStatus === "complete" &&
    completeInventory &&
    !containsUnknownControl;

  const firstObservedAtMs = observations.find((observation) => observation.likelyPresent)?.observedAtMs ?? null;
  const lastObservedAtMs = observations.at(-1)?.observedAtMs ?? input.geometry?.observedAtMs ?? null;
  const sourceInput = {
    ...(originalOptOutSwitches ? {originalOptOutSwitches} : {}),
    ...(originalOptOutSettings ? {originalOptOutSettings} : {}),
    ...(optOutPlacementCorrections ? {optOutPlacementCorrections} : {}),
    ...(input.footerOriginalVisit ? {footerOriginalVisit: input.footerOriginalVisit} : {}),
    ...(input.sameVisitFooter ? {sameVisitFooter: input.sameVisitFooter} : {}),
    ...(input.sameVisitFooterCapture ? {sameVisitFooterCapture: input.sameVisitFooterCapture} : {}),
    ...(input.optOutFooterInspection ? {optOutFooterInspection: input.optOutFooterInspection} : {}),
    ...(input.optOutTimingLimitation ? {optOutTimingLimitation: input.optOutTimingLimitation} : {}),
    positiveSurfacePolicy:"verified_control_presence.v1",
    ...(input.optOutFooterLinks?.length ? {optOutFooterLinks: input.optOutFooterLinks} : {}),
    capturePolicyVersion: CONSENT_CONTROL_CAPTURE_POLICY_VERSION,
    registryVersion: CONSENT_CONTROL_LABEL_REGISTRY_VERSION,
    evidencePolicy: CONSENT_CONTROL_EVIDENCE_POLICY,
    visualEvidence: input.visualEvidence ?? null,
    ...(input.cmpAudit ? { cmpAudit: input.cmpAudit } : {}),
    scan: input.scan,
    document: input.document,
    observations,
    geometry: input.geometry,
    surface: input.surface,
    coverage: input.coverage,
  };
  const visual = input.geometry?.visualComparison;
  // Only the latest observation for this canonical document may explain capture.
  // Diagnostics never participate in presence, absence, finding or action rules.
  const latestObservation = observations.at(-1);
  const parsedDiagnostic = consentCaptureDiagnosticSchema.safeParse(latestObservation?.captureDiagnostic);
  const captureDiagnostic = parsedDiagnostic.success && documentStatus === "matched" && canonicalDocumentToken &&
    latestObservation?.documentToken === canonicalDocumentToken && latestObservation.documentId === canonicalId &&
    parsedDiagnostic.data.documentToken === canonicalDocumentToken &&
    parsedDiagnostic.data.observationId === latestObservation.observationId &&
    parsedDiagnostic.data.inventoryObservedAtMs === latestObservation.observedAtMs
      ? parsedDiagnostic.data : undefined;
  const parsedOptOutGeometry = optOutGeometryEvidenceSchema.safeParse(input.geometry?.firstLayerOptOutGeometry);
  const firstLayerOptOutGeometry = parsedOptOutGeometry.success && inspectionDocumentBound &&
    latestObservation?.layerInspected === "first_layer" && captureDiagnostic?.geometryBinding === "matched" &&
    captureDiagnostic.geometryObservedAtMs !== null && captureDiagnostic.geometryObservedAtMs === input.geometry?.observedAtMs
      ? parsedOptOutGeometry.data : undefined;
  const visualComparison = visual && input.visualEvidence?.status === "available" && !assessmentBlocked &&
    documentStatus === "matched" && surfaceStatus === "observed_actionable" && inspectionDocumentBound &&
    inspectionCurrent && input.geometry?.assessmentStatus === "complete" &&
    visual.documentToken === canonicalDocumentToken && ["accept", "reject"].every(intent =>
      firstLayerResults[intent as "accept" | "reject"].state === "observed" && evidence.some(row =>
        row.evidenceId === visual[intent as "accept" | "reject"].candidateId && row.intent === intent &&
        row.documentToken === canonicalDocumentToken && row.channels.includes("geometry")))
      ? visual : undefined;
  return consentControlAssessmentSchema.parse({
    ...(input.cmpAudit ? { cmpAudit: input.cmpAudit } : {}),
    artifactType: "consent_control_assessment",
    artifactVersion: CONSENT_CONTROL_ASSESSMENT_VERSION,
    evidencePolicy: CONSENT_CONTROL_EVIDENCE_POLICY,
    visualEvidence: input.visualEvidence ?? { status: "unavailable", artifactRefs: [], reasonCodes: ["visual_evidence_not_provided"] },
    ...(visualComparison ? { visualComparison } : {}),
    assessmentStatus: assessmentComplete ? "complete" : "limited",
    scan: {
      scanId: input.scan.scanId,
      requestedUrl: boundedIdentityText(input.scan.requestedUrl, 500),
      finalUrl: boundedIdentityText(input.scan.finalUrl, 500),
      scanStatus: input.scan.scanStatus ?? "unknown",
      noGo,
    },
    document: {
      identityStatus: documentStatus,
      canonicalDocumentId: canonicalId,
      observedDocumentIds: observedIds,
      canonicalDocumentToken,
      observedDocumentTokens,
      reasonCodes: documentStatus === "mismatched" ? ["document_identity_mismatch"] : [],
    },
    surface: {
      status: surfaceStatus,
      firstObservedAtMs: surfaceStatus.startsWith("observed_")
        ? input.surface?.firstObservedAtMs ?? firstObservedAtMs : null,
      lastObservedAtMs: surfaceStatus.startsWith("observed_")
        ? input.surface?.lastObservedAtMs ?? lastObservedAtMs : null,
      evidenceRefs: bounded(input.surface?.evidenceRefs ?? observations.flatMap((observation) => observation.evidenceRefs ?? [])),
    },
    controls: firstLayerResults,
    ...(originalOptOutSwitches ? {originalOptOutSwitches} : {}),
    ...(originalOptOutSettings ? {originalOptOutSettings} : {}),
    ...(optOutPlacementCorrections ? {optOutPlacementCorrections} : {}),
    ...(!assessmentBlocked && input.footerOriginalVisit ? {footerOriginalVisit: input.footerOriginalVisit} : {}),
    ...(!assessmentBlocked && input.sameVisitFooter ? {sameVisitFooter: input.sameVisitFooter} : {}),
    ...(!input.scan.noGo && input.sameVisitFooterCapture ? {sameVisitFooterCapture: input.sameVisitFooterCapture} : {}),
    ...(!assessmentBlocked && input.optOutFooterInspection ? {optOutFooterInspection: input.optOutFooterInspection} : {}),
    ...(!assessmentBlocked && input.optOutTimingLimitation ? {optOutTimingLimitation: input.optOutTimingLimitation} : {}),
    ...(!assessmentBlocked && input.optOutFooterLinks !== undefined ? {optOutFooterLinks: input.optOutFooterLinks} : {}),
    coverage: {
      ...(captureDiagnostic ? {captureDiagnostic} : {}),
      ...(firstLayerOptOutGeometry ? {firstLayerOptOutGeometry} : {}),
      status: assessmentBlocked
        ? "none"
        : assessmentComplete
          ? "complete"
          : "limited",
      requiredChannels,
      completedChannels: effectiveCompletedChannels,
      incompleteChannels: effectiveIncompleteChannels,
      reasonCodes: reasons,
    },
    evidence,
    contradictions: contradictionRows,
    limitations,
    provenance: {
      projectorId: "wc01.consent-control-assessment",
      projectorVersion: input.source?.projectorVersion ?? PROJECTOR_VERSION,
      contractVersion: CONSENT_CONTROL_ASSESSMENT_VERSION,
      sourceBundleVersion: input.source?.bundleVersion ?? null,
      sourceGeometryVersion: input.source?.geometryVersion ?? input.geometry?.artifactVersion ?? null,
      sourceHash: fnv1a(stableValue(sourceInput)),
      computedAt: input.source?.computedAt ?? new Date(0).toISOString(),
    },
  });
}

/** Shared eligibility for an absence conclusion, independent of unrelated controls. */
export function hasVerifiedConsentControlAbsence(
  assessment: ConsentControlAssessment,
  control: keyof ConsentControlAssessment["controls"],
): boolean {
  return !assessment.scan.noGo && assessment.document.identityStatus === "matched" &&
    assessment.controls[control].state === "not_observed" &&
    (assessment.artifactVersion === "2.2"
      ? assessment.controls[control].inspection?.status === "complete" && Boolean(assessment.controls[control].inspection?.evidenceRefs.length)
      : assessment.assessmentStatus === "complete" && assessment.coverage.status === "complete");
}
