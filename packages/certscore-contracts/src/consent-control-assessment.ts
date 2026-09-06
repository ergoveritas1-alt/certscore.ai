import { z } from "zod";
import type {
  ConsentControlIntent,
  ConsentControlMatchStrength,
  ConsentControlLocale,
} from "./consent-control-label-classifier";

export const CONSENT_CONTROL_ASSESSMENT_VERSION = "2.1" as const;
export const CONSENT_CONTROL_EVIDENCE_POLICY = "structured_control_evidence.v1" as const;
// Stored 2.0 assessments remain readable without silently changing their conclusions.
export const consentControlAssessmentVersionSchema = z.enum(["2.0", "2.1"]);
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
  layer: consentControlAssessmentLayerSchema,
  reasonCodes: z.array(z.string().max(120)).max(16),
  evidenceRefs: z.array(z.string().max(240)).max(24),
  firstObservedAtMs: z.number().int().nonnegative().nullable(),
  lastObservedAtMs: z.number().int().nonnegative().nullable(),
});

export const consentControlAssessmentEvidenceSchema = z.object({
  evidenceId: z.string().max(240),
  intent: z.enum(["accept", "reject", "options", "privacy_opt_out", "save_preferences", "dismiss", "other"]),
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

export const consentControlAssessmentSchema = z.object({
  artifactType: z.literal("consent_control_assessment"),
  artifactVersion: consentControlAssessmentVersionSchema,
  evidencePolicy: z.literal(CONSENT_CONTROL_EVIDENCE_POLICY).optional(),
  visualEvidence: consentControlVisualEvidenceSchema.optional(),
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
  if (assessment.artifactVersion !== assessment.provenance.contractVersion) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Assessment and provenance contract versions must match." });
  }
  if (assessment.artifactVersion === "2.1" && (
    !assessment.evidencePolicy || !assessment.visualEvidence ||
    assessment.coverage.requiredChannels.length === 0 ||
    [assessment.coverage.requiredChannels, assessment.coverage.completedChannels, assessment.coverage.incompleteChannels]
      .some((channels) => channels.includes("screenshot"))
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Assessment 2.1 requires structured evidence policy and separate, non-gating visual evidence." });
  }
  if (assessment.artifactVersion === "2.1" && assessment.assessmentStatus === "complete" && (
    assessment.scan.noGo || assessment.document.identityStatus !== "matched" ||
    assessment.coverage.status !== "complete" ||
    [assessment.controls.accept, assessment.controls.reject, assessment.controls.options].some((control) => control.state === "unknown")
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A complete structured assessment requires verified coverage, identity, and binary A/R/O states." });
  }
});

export type ConsentControlAssessment = z.infer<typeof consentControlAssessmentSchema>;
export type ConsentControlAssessmentControlResult = z.infer<typeof consentControlAssessmentControlResultSchema>;
export type ConsentControlAssessmentEvidence = z.infer<typeof consentControlAssessmentEvidenceSchema>;

export type ConsentControlAssessmentObservation = {
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
  evidenceId?: string;
  intent?: ConsentControlAssessmentEvidence["intent"] | "unknown";
  semanticRole?: "explicit_accept" | "ambiguous_acknowledgment" | "reject" | "necessary_only" | "preferences" | "dismiss" | "unknown";
  actionType?: "accept_all" | "reject_all" | "manage_preferences" | "save_preferences" | "do_not_sell_share" | "other";
  controlVariant?: "reject_with_subscription" | "reject_with_payment" | null;
  label?: string | null;
  locale?: ConsentControlLocale | null;
  matchedTerm?: string | null;
  matchStrength?: ConsentControlMatchStrength | null;
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

const PROJECTOR_VERSION = "2.1.0";
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
    evidenceId,
    intent,
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
      registryVersion: "consent-control-label-registry",
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
  const geometryEvidence = input.geometry?.assessmentStatus === "complete"
    ? (input.geometry.candidates ?? []).map((candidate) => eligibleCandidate(candidate, input.geometry?.observedAtMs ?? 0, input.geometry?.documentId ?? canonicalId, "geometry")).filter((candidate): candidate is ConsentControlAssessmentEvidence => candidate !== null)
    : [];
  const evidence = [...bundleEvidence, ...geometryEvidence]
    .filter((item) => documentStatus === "matched" && Boolean(canonicalId) && item.documentId === canonicalId)
    .sort((left, right) => left.observedAtMs - right.observedAtMs)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index)
    .slice(0, 96);

  const firstLayerEvidence = evidence.filter((item) => item.layer === "first_layer");
  const actionableConsentEvidence = firstLayerEvidence.filter((item) => item.intent !== "privacy_opt_out");
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
  const effectiveCoverageStatus = consentEvidenceCoverageComplete ? "complete" : coverageStatus;
  const effectiveCompletedChannels = unique([
    ...completedChannels,
    ...(firstLayerObservationRetained ? ["dom_inventory" as const] : []),
    ...(geometryComplete ? ["geometry" as const] : []),
  ]);
  const effectiveIncompleteChannels = completeConsentInventory
    ? []
    : incompleteChannels.filter((channel) => requiredChannels.includes(channel));
  const completeInventory = completeConsentInventory || (
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
  );
  const assessmentBlocked = noGo || documentStatus !== "matched";
  const surfaceStatus = assessmentBlocked
    ? "unknown"
    : actionable
      ? "observed_actionable"
      : surfaceObserved
        ? "observed_non_actionable"
        : input.surface?.status === "not_observed" || effectiveCoverageStatus === "complete"
          ? "not_observed"
          : "unknown";
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
  const firstLayerResults = {
    accept: resultFor("accept", evidence, completeInventory, reasons),
    reject: resultFor("reject", evidence, completeInventory, reasons),
    options: resultFor("options", evidence, completeInventory, reasons),
    privacyOptOut: resultFor("privacy_opt_out", evidence, completeInventory, reasons),
  };
  if (assessmentBlocked) {
    for (const result of Object.values(firstLayerResults)) {
      result.state = "unknown";
      result.layer = "unknown";
      result.reasonCodes = ["assessment_blocked", ...reasons].slice(0, 16);
    }
  }
  const containsUnknownControl = Object.values(firstLayerResults).some((result) => result.state === "unknown");
  const assessmentComplete = !assessmentBlocked &&
    effectiveCoverageStatus === "complete" &&
    completeInventory &&
    !containsUnknownControl;

  const firstObservedAtMs = observations.find((observation) => observation.likelyPresent)?.observedAtMs ?? null;
  const lastObservedAtMs = observations.at(-1)?.observedAtMs ?? input.geometry?.observedAtMs ?? null;
  const sourceInput = {
    evidencePolicy: CONSENT_CONTROL_EVIDENCE_POLICY,
    visualEvidence: input.visualEvidence ?? null,
    scan: input.scan,
    document: input.document,
    observations,
    geometry: input.geometry,
    surface: input.surface,
    coverage: input.coverage,
  };
  return consentControlAssessmentSchema.parse({
    artifactType: "consent_control_assessment",
    artifactVersion: CONSENT_CONTROL_ASSESSMENT_VERSION,
    evidencePolicy: CONSENT_CONTROL_EVIDENCE_POLICY,
    visualEvidence: input.visualEvidence ?? { status: "unavailable", artifactRefs: [], reasonCodes: ["visual_evidence_not_provided"] },
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
    coverage: {
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
