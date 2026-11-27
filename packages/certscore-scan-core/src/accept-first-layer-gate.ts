import { scopedConsentActionWindowMs } from "./scoped-consent-action-window.js";
import { geometryConsentButtonLinkMatches, reviewedConsentAnchor } from "./exact-native-consent-button-selector.js";
import { consentGateDocument } from "./consent-gate-document.js";
import { DRUPAL_ACCEPT_RECIPE, DRUPAL_ACCEPT_SELECTOR, DRUPAL_CMP, drupalOverflowObservationMatches,
  hasVerifiedDrupalOverflowGeometry } from "./drupal-consent-overflow-geometry.js";
import { cookieInformationRenderedLabel, passiveButtonSelectorMatches, resideoTrustArcSourceLabel } from "./consent-accessibility-dom-binding.js";
import { COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR } from "./cookiescript-reject-selector.js";
import { createHash } from "node:crypto";
import type { CanonicalEvidenceBundle, ConsentActionControlProof, ConsentUiObservation } from "@certscore/contracts";
import {
  classifyConsentControlLabel, classifyDafitiAdoptAcceptLabel, DAFITI_ADOPT_ACCEPT_CONTROL, CAIA_ACCEPT_CONTROL, consentSessionAccessLimited, hasConsentControlSemanticVeto,
  isConsentControlInteractionEligible, REGISTERED_ONETRUST_ACCEPT_CONTROLS, verifyConsentControlInspection,
} from "@certscore/contracts";
import type { ConsentControlCandidateEvidence, ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

const hashPattern = /^[a-f0-9]{64}$/;
export { scopedConsentActionWindowMs };
export const ACCEPT_FIRST_LAYER_GATE_MS = 6_000;
const MAX_OBSERVATIONS = 32;
const MAX_CONTROLS = 128;
const MAX_GEOMETRY_BYTES = 2 * 1024 * 1024;
const LABEL_CONFLICT = "visible_accessible_intent_conflict";
const GEOMETRY_LABEL_CONFLICT = `geometry:${LABEL_CONFLICT}`;
const SEPARATE_NON_ACCEPT_INTENTS = new Set(["reject", "options", "privacy_opt_out", "dismiss"]);
const UNVERIFIED_INVENTORY_OUTCOMES = new Set(["timed_out", "document_mismatch", "geometry_unavailable", "frame_inaccessible", "no_go"]);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function targetHash(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = "";
    return hash(url.href);
  } catch {
    return undefined;
  }
}

function labelHash(label: string) {
  return hash(label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase());
}

export type AcceptFirstLayerProof = {
  version: "certscore.accept-first-layer-proof.v1";
  scanId: string;
  parentDispatchSha256: string;
  sourceSha256: string;
  requestedTargetSha256: string;
  documentSha256: string;
  labelSha256: string;
  geometrySha256?: string;
  selectorSha256?: string;
  exactSelector?: string;
  labelSource?: "aria_label";
  scopedLabelConflict?: true;
  drupalOverflow?: true;
  issuedAtMs: number;
  expiresAtMs: number;
};

export function readAcceptFirstLayerProof(value: unknown): AcceptFirstLayerProof | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const proof = value as Partial<AcceptFirstLayerProof>;
  const geometryBound = Object.hasOwn(value, "geometrySha256") || Object.hasOwn(value, "selectorSha256");
  const nativeBound = Object.hasOwn(value, "exactSelector");
  const sourceBound = Object.hasOwn(value, "labelSource");
  const conflictBound = Object.hasOwn(value, "scopedLabelConflict");
  const drupalBound = Object.hasOwn(value, "drupalOverflow");
  if (Object.keys(value).length !== (geometryBound ? 11 : 9) + Number(sourceBound) + Number(conflictBound) + Number(nativeBound) + Number(drupalBound) ||
    (drupalBound && (proof.drupalOverflow !== true || !geometryBound || !nativeBound || sourceBound || conflictBound ||
      proof.exactSelector !== DRUPAL_ACCEPT_SELECTOR || proof.labelSha256 !== hash("Accept"))) ||
    (nativeBound && (!geometryBound || typeof proof.exactSelector !== "string" ||
      !proof.exactSelector || proof.exactSelector.length > 500 || hash(proof.exactSelector) !== proof.selectorSha256)) ||
    (sourceBound && (!geometryBound || proof.labelSource !== "aria_label")) ||
    (conflictBound && (!geometryBound || proof.scopedLabelConflict !== true)) ||
    (geometryBound && ![proof.geometrySha256, proof.selectorSha256]
      .every(field => typeof field === "string" && hashPattern.test(field))) || proof.version !== "certscore.accept-first-layer-proof.v1" ||
    typeof proof.scanId !== "string" || !proof.scanId || proof.scanId.length > 200 ||
    ![proof.parentDispatchSha256, proof.sourceSha256, proof.requestedTargetSha256, proof.documentSha256,
      proof.labelSha256].every(field => typeof field === "string" && hashPattern.test(field)) ||
    typeof proof.issuedAtMs !== "number" || typeof proof.expiresAtMs !== "number" ||
    !Number.isSafeInteger(proof.issuedAtMs) || !Number.isSafeInteger(proof.expiresAtMs) ||
    proof.issuedAtMs < 0 || proof.expiresAtMs <= proof.issuedAtMs ||
    proof.expiresAtMs - proof.issuedAtMs > (scopedConsentActionWindowMs("accept", proof.exactSelector, proof) ?? ACCEPT_FIRST_LAYER_GATE_MS)) return undefined;
  return proof as AcceptFirstLayerProof;
}

function classifyActionLabel(label: string) {
  return classifyConsentControlLabel({
    label, usage: "action", classifierProfile: "multilingual_v1", hasConsentContext: true,
  });
}

function isActionableAcceptLabel(label: string) {
  const result = classifyActionLabel(label);
  return result.intent === "accept" && result.confidence >= 0.8 && !hasConsentControlSemanticVeto(result);
}

function isSeparateNonAcceptConflict(
  conflict: ConsentControlCandidateEvidence,
  accept: ConsentControlCandidateEvidence,
  candidates: ConsentControlCandidateEvidence[],
) {
  if (conflict.selectorHint === accept.selectorHint || !conflict.selectorHint ||
    conflict.selectorHint === conflict.tagName || conflict.actionType !== "other" ||
    conflict.layer !== "first_layer" || conflict.decisionStatus !== "ambiguous" ||
    conflict.frameContext?.frameKind !== "main_frame" || conflict.frameContext.frameUrl !== accept.frameContext.frameUrl ||
    conflict.enabled !== true || conflict.intersectsViewport !== true || conflict.occlusion?.center !== true ||
    conflict.consentContextConfirmed !== true || !conflict.label || !conflict.ariaLabel ||
    candidates.filter(candidate => candidate.selectorHint === conflict.selectorHint).length !== 1) return false;
  const visible = classifyActionLabel(conflict.label);
  const accessible = classifyActionLabel(conflict.ariaLabel);
  const otherLabels = [conflict.title, conflict.value]
    .filter((label): label is string => typeof label === "string" && label.length > 0)
    .map(classifyActionLabel);
  return visible.intent !== accessible.intent && [visible, accessible, ...otherLabels].every(classification =>
    classification.confidence >= 0.8 && !hasConsentControlSemanticVeto(classification) &&
    SEPARATE_NON_ACCEPT_INTENTS.has(classification.intent));
}

export type AcceptFirstLayerGeometrySource = { bytes: Buffer; sha256: string; sizeBytes: number };

function readAcceptDocumentGeometry(
  source: AcceptFirstLayerGeometrySource,
  bundle: Parameters<typeof deriveAcceptFirstLayerProof>[0]["bundle"],
  document: NonNullable<CanonicalEvidenceBundle["domSnapshots"][number]>,
) {
  if (source.bytes.length === 0 || source.bytes.length > MAX_GEOMETRY_BYTES ||
    source.sizeBytes !== source.bytes.length || !hashPattern.test(source.sha256) ||
    createHash("sha256").update(source.bytes).digest("hex") !== source.sha256) return undefined;

  let geometry: ConsentControlGeometryArtifact;
  try {
    geometry = JSON.parse(source.bytes.toString("utf8"));
  } catch {
    return undefined;
  }
  if (geometry?.artifactVersion !== "consent_control_geometry.v1" ||
    geometry.sourceScanner !== "consent_control_geometry_diagnostic" ||
    consentSessionAccessLimited(bundle, geometry) || geometry.pageUrl !== document.url ||
    document.documentIdentity?.source !== "cdp_loader_id" || geometry.documentIdentity?.source !== "cdp_loader_id" ||
    geometry.documentIdentity.token !== document.documentIdentity.token) return undefined;
  return geometry;
}

function exactGeometryAccept(
  geometry: ConsentControlGeometryArtifact,
  document: CanonicalEvidenceBundle["domSnapshots"][number],
  requireExactSelector: boolean,
  drupalOverflow: boolean,
) {
  const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
  if (!inspection || inspection.captureCoverage.inventoryTruncated ||
    !inspection.captureCoverage.mainFrameAvailable ||
    (!inspection.captureCoverage.documentAndFramesStable && !drupalOverflow)) return undefined;

  const candidates = geometry.candidates.filter(candidate =>
    candidate.actionType === "accept_all" && candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible");
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0]!;
  const cookieScriptRole = requireExactSelector && candidate.exactCookieScriptAcceptVerified === true &&
    candidate.selectorHint === "#cookiescript_accept" && candidate.tagName === "div" && candidate.role === "button" &&
    geometry.cmp?.detections?.some(cmp => cmp.canonicalName === "CookieScript") === true;
  const caia = CAIA_ACCEPT_CONTROL;
  const caiaAccept = requireExactSelector && document.url === caia.targetUrl &&
    candidate.exactCaiaAcceptSelectorVerified === true && candidate.tagName === "span" &&
    candidate.selectorHint === caia.controlSelector && candidate.label === caia.label &&
    !candidate.ariaLabel && !candidate.title && !candidate.value && candidate.semanticallyInteractive === true;
  if ((requireExactSelector && ((inspection.structuralCoverage !== "complete" && !drupalOverflow) ||
      (!cookieScriptRole && !caiaAccept && (candidate.exactNativeAcceptSelectorVerified !== true ||
        !(candidate.tagName === "button" || geometryConsentButtonLinkMatches(candidate, geometry.cmp, "accept")))))) ||
    candidate.enabled !== true || candidate.intersectsViewport !== true || candidate.occlusion?.center !== true ||
    candidate.consentContextConfirmed !== true || candidate.frameContext?.frameKind !== "main_frame" ||
    candidate.frameContext.frameUrl !== document.url || !candidate.label || !candidate.selectorHint || !candidate.tagName ||
    candidate.selectorHint.toLowerCase() === candidate.tagName.toLowerCase() ||
    !isConsentControlInteractionEligible(candidate) ||
    !inspection.candidates.some(row => row.candidateId === candidate.candidateId &&
      row.role === "decision" && !row.unresolvedIntents.includes("accept"))) return undefined;
  const conflicts = geometry.candidates.filter(row => row.classifierReasonCodes?.includes(LABEL_CONFLICT));
  const separateConflicts = inspection.structuralCoverage === "complete" && conflicts.length > 0 &&
    geometry.candidates.filter(row => row.selectorHint === candidate.selectorHint).length === 1 &&
    conflicts.every(conflict => isSeparateNonAcceptConflict(conflict, candidate, geometry.candidates))
    ? conflicts : undefined;
  // These observation labels become actionable only with the registered
  // OneTrust banner, native button and original document proof.
  const registeredOneTrustAccept = requireExactSelector && candidate.tagName === "button" &&
    REGISTERED_ONETRUST_ACCEPT_CONTROLS.find(scope =>
      candidate.selectorHint === scope.controlSelector && candidate.label === scope.label &&
      [candidate.ariaLabel, candidate.title, candidate.value].every(label => !label || label === scope.label) &&
      (!("documentUrl" in scope) || document.url === scope.documentUrl) &&
      geometry.cmp?.detections?.some(detection => detection.canonicalName === scope.cmpId) === true &&
      Array.isArray(geometry.containers) && geometry.containers.some(container => container.selectorHint === scope.bannerSelector &&
        container.layer === "first_layer" && container.intersectsViewport) &&
      geometry.containers.some(container => container.selectorHint === scope.groupSelector &&
        container.layer === "first_layer" && container.intersectsViewport) &&
      geometry.containers.some(container => container.containerId === candidate.containerId &&
        container.selectorHint === candidate.containerSelectorHint &&
        (container.selectorHint === scope.groupSelector || ("documentUrl" in scope &&
          container.selectorHint === scope.groupSelector + " div")) &&
        container.layer === "first_layer" && container.intersectsViewport));
  const adopt = DAFITI_ADOPT_ACCEPT_CONTROL;
  const dafitiAdoptAccept = requireExactSelector && document.url === adopt.targetUrl &&
    candidate.tagName === "button" && candidate.selectorHint === adopt.controlSelector &&
    classifyDafitiAdoptAcceptLabel(candidate.label) !== undefined &&
    !candidate.ariaLabel && !candidate.title && !candidate.value &&
    candidate.containerSelectorHint === adopt.bannerSelector && Array.isArray(geometry.containers) &&
    geometry.containers.some(container => container.selectorHint === adopt.bannerSelector &&
      container.containerId === candidate.containerId && container.layer === "first_layer" && container.intersectsViewport);
  const reviewedAnchor = reviewedConsentAnchor("accept", candidate.selectorHint);
  const navigraphCaption = reviewedAnchor && !reviewedAnchor.id && reviewedAnchor.documentUrl === document.url &&
    candidate.label === "ACCEPT ALL COOKIES" ? "Accept all cookies" : undefined;
  const starfieldCaption = reviewedAnchor?.starfield && reviewedAnchor.documentUrl === document.url &&
    candidate.label === "ACCEPT" && !candidate.ariaLabel ? "Accept" : undefined;
  const binding = { cookieScriptRole, reviewedAnchor,
    selector: cookieScriptRole ? COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR : candidate.selectorHint, inventorySelector: candidate.selectorHint,
    sourceLabel: cookieScriptRole && !candidate.ariaLabel && candidate.cookieScriptUppercaseSourceLabel?.toUpperCase() === candidate.label
      ? candidate.cookieScriptUppercaseSourceLabel : navigraphCaption ?? starfieldCaption ?? resideoTrustArcSourceLabel(candidate, geometry, "accept"), tagName: candidate.tagName, separateConflicts, registeredOneTrustAccept, dafitiAdoptAccept, caiaAccept };
  if (candidate.ariaLabel) {
    // AX inventory can report the accessible name while geometry records the
    // rendered caption. Both must independently support Accept. The receipt
    // binds the exact ARIA label so a change of label source fails closed.
    if (!registeredOneTrustAccept && ![candidate.label, candidate.ariaLabel, candidate.title, candidate.value]
      .filter((label): label is string => typeof label === "string" && label.length > 0)
      .every(isActionableAcceptLabel)) return undefined;
    return { ...binding, sourceLabel: cookieInformationRenderedLabel(candidate, geometry.cmp),
      label: candidate.ariaLabel, labelSource: "aria_label" as const };
  }
  return { ...binding, label: candidate.label, labelSource: undefined };
}

function hasScopedLabelConflicts(observation: ConsentUiObservation, conflicts: ConsentControlCandidateEvidence[] | undefined) {
  // This qualifies one positive Accept control. Overall inventory coverage
  // stays partial and the affected rows remain unclassified.
  if (!conflicts || observation.inventoryOutcome !== "partial" ||
    !observation.basis.includes(GEOMETRY_LABEL_CONFLICT) ||
    observation.basis.includes("geometry:checkpoint_precedes_latest_inventory") ||
    (observation.boundedSameSessionRecoveryOutcome && observation.boundedSameSessionRecoveryOutcome !== "completed") ||
    !observation.captureDiagnostics?.completedChannels.includes("geometry") ||
    observation.inventoryDiagnostics?.blockingInaccessibleFrameCount !== 0) return false;

  const conflictRows = observation.controls.filter(control => control.classifierReasonCodes?.includes(LABEL_CONFLICT));
  return conflictRows.length === conflicts.length && conflicts.every(conflict =>
    conflictRows.filter(row => row.actionType === "other" && row.visible === true &&
      row.selectorHint === conflict.selectorHint && row.tagName === conflict.tagName && row.label === conflict.label).length === 1);
}

export type AcceptGateBlockReason =
  | "source_unavailable" | "source_binding_invalid" | "no_first_layer_accept" | "passive_capture_incomplete"
  | "label_conflict_unresolved" | "control_binding_unverified" | "control_ambiguous" | "proof_expired";

export type AcceptGatePassiveDecision =
  | { outcome: "blocked"; reason: AcceptGateBlockReason; evaluatedAtMs: number }
  | { outcome: "qualified"; proof: AcceptFirstLayerProof; documentTokenSha256: string; passiveSelectorSha256?: string };

/** The caller supplies the verified consent_proof bundle and, if available, geometry from that worker's verified manifest. */
export function deriveAcceptFirstLayerProof(input: {
  bundle: Pick<CanonicalEvidenceBundle, "scanId" | "url" | "consentSurfaceInspection" | "consentUiObservations" | "domSnapshots" | "scanNoGoAssessment"> &
    Partial<Pick<CanonicalEvidenceBundle, "startedAt">>;
  scanId: string;
  targetUrl: string;
  parentDispatchSha256: string;
  sourceSha256: string;
  nowMs: number;
  deadlineAtMs: number;
  geometry?: AcceptFirstLayerGeometrySource;
  requireExactSelector?: boolean;
  onDecision?: (decision: AcceptGatePassiveDecision) => void;
}): AcceptFirstLayerProof | undefined {
  const { bundle, scanId, targetUrl, sourceSha256, parentDispatchSha256, nowMs, deadlineAtMs } = input;
  const note = (decision: AcceptGatePassiveDecision) => {
    try { input.onDecision?.(decision); } catch { /* Diagnostics cannot affect proof. */ }
  };
  const block = (reason: AcceptGateBlockReason) => {
    note({ outcome: "blocked", reason, evaluatedAtMs: nowMs });
    return undefined;
  };
  const requestedTarget = targetHash(targetUrl);
  const inspection = bundle.consentSurfaceInspection;
  const committedDocument = consentGateDocument(bundle.domSnapshots);
  const committedTarget = committedDocument && targetHash(committedDocument.url);
  const documentToken = committedDocument?.documentIdentity?.token;
  if (bundle.scanId !== scanId || !requestedTarget || targetHash(bundle.url) !== requestedTarget ||
    !committedTarget || !documentToken || committedDocument.consentStateAtTime !== "pre_consent") return block("source_binding_invalid");
  const documentGeometry = input.geometry && readAcceptDocumentGeometry(input.geometry, bundle, committedDocument);
  if (committedDocument !== bundle.domSnapshots.at(-1) && !documentGeometry) return block("source_binding_invalid");
  if (consentSessionAccessLimited(bundle) || !inspection?.inspectedPreInteraction ||
    bundle.consentUiObservations.length > MAX_OBSERVATIONS) return block("passive_capture_incomplete");
  if (!inspection.actionableControlObserved) {
    return block(inspection.inspectionCompleted ? "no_first_layer_accept" : "passive_capture_incomplete");
  }
  const drupalOverflow = input.requireExactSelector === true && documentGeometry !== undefined &&
    hasVerifiedDrupalOverflowGeometry(documentGeometry) && Date.parse(documentGeometry.captureTiming?.completedAt ?? "") <= nowMs;
  const scanStartedAtMs = drupalOverflow ? Date.parse(bundle.startedAt ?? "") : NaN;
  const nativeAccept = documentGeometry && exactGeometryAccept(documentGeometry, committedDocument, input.requireExactSelector === true, drupalOverflow);
  if (committedDocument !== bundle.domSnapshots.at(-1) && !nativeAccept) return block("control_binding_unverified");
  const matches: Array<{ document: string; label: string; selector?: string; passiveSelector?: string;
    labelSource?: "aria_label"; scopedLabelConflict?: true; backendNodeId?: number }> = [];
  let missing: AcceptGateBlockReason = "no_first_layer_accept";
  for (const observation of bundle.consentUiObservations) {
    if (observation.controls.length > MAX_CONTROLS) return block("passive_capture_incomplete");
    const document = observation.documentUrl && targetHash(observation.documentUrl);
    const capture = observation.captureDiagnostics;
    const verifiedDrupalCapture = drupalOverflow && documentGeometry &&
      Number.isSafeInteger(observation.observedAtMs) && observation.observedAtMs >= 0 &&
      Date.parse(documentGeometry.capturedAt) >= scanStartedAtMs + observation.observedAtMs &&
      drupalOverflowObservationMatches(observation, documentGeometry);
    if (document !== committedTarget || observation.documentIdentity?.token !== documentToken) {
      if (observation.acceptControlObserved) missing = "source_binding_invalid";
      continue;
    }
    if (observation.layerInspected !== "first_layer" ||
      UNVERIFIED_INVENTORY_OUTCOMES.has(observation.inventoryOutcome ?? "") ||
      observation.basis.includes("bounded_capture_timeout_or_failure") ||
      !capture?.completedChannels.includes("dom_inventory") ||
      (!verifiedDrupalCapture && !capture.completedChannels.some(channel => channel === "geometry" || channel === "accessibility_tree")) ||
      capture.failedChannels.length || capture.timedOutChannels.length ||
      (observation.inventoryDiagnostics?.blockingInaccessibleFrameCount ?? 0) > 0) {
      missing = "passive_capture_incomplete";
      continue;
    }
    const reportedConflict = observation.basis.includes(GEOMETRY_LABEL_CONFLICT) ||
      observation.controls.some(control => control.classifierReasonCodes?.includes(LABEL_CONFLICT));
    const scopedLabelConflict = reportedConflict &&
      (observation.captureStatus === "incomplete" || observation.captureStatus === "observed") &&
      hasScopedLabelConflicts(observation, nativeAccept?.separateConflicts);
    if (!scopedLabelConflict && (observation.captureStatus !== "observed" || reportedConflict)) {
      missing = reportedConflict ? "label_conflict_unresolved" : "passive_capture_incomplete";
      continue;
    }

    if (!observation.acceptControlObserved || (drupalOverflow && !verifiedDrupalCapture)) continue;

    const previouslyMatched = matches.length;
    for (const control of observation.controls) {
      if (control.actionType !== "accept_all" || !control.visible) continue;
      const direct = !scopedLabelConflict && control.layer === "first_layer" && control.consentContextEvidence === "local_surface";
      const handoff = (!direct || input.requireExactSelector) && nativeAccept && observation.documentUrl === committedDocument.url &&
        observation.documentIdentity.source === "cdp_loader_id" &&
        (control.layer === undefined || control.layer === "first_layer") &&
        (control.consentContextEvidence === undefined || control.consentContextEvidence === "local_surface") &&
        (control.label === nativeAccept.label || control.label === nativeAccept.sourceLabel) &&
        (!(nativeAccept.cookieScriptRole || nativeAccept.tagName === "a") || control.role === "button" ||
          (nativeAccept.reviewedAnchor !== undefined && !nativeAccept.reviewedAnchor.id)) &&
        control.tagName === nativeAccept.tagName &&
        passiveButtonSelectorMatches(control, nativeAccept.inventorySelector, "accept", committedDocument.url, documentToken);
      if ((!direct || input.requireExactSelector) && !handoff) {
        missing = "control_binding_unverified";
        if (control.layer === "first_layer" || (input.requireExactSelector && control.layer === undefined)) return block(missing);
        continue;
      }
      if (!isConsentControlInteractionEligible(control) ||
        !(control.semanticallyInteractive === true || control.tagName === "button" || control.role === "button") ||
        (control.domBinding && (targetHash(control.domBinding.documentUrl) !== document ||
          control.domBinding.documentIdentity.token !== observation.documentIdentity.token))) return block("control_binding_unverified");
      const namedOneTrust = handoff && nativeAccept.registeredOneTrustAccept;
      const namedOneTrustAuthorized = namedOneTrust && (!("requestedUrl" in namedOneTrust) ||
        targetUrl === namedOneTrust.requestedUrl || targetUrl === namedOneTrust.documentUrl);
      if (!(namedOneTrustAuthorized || (handoff && (nativeAccept.dafitiAdoptAccept || nativeAccept.caiaAccept))) && !isActionableAcceptLabel(control.label)) return block("control_binding_unverified");
      if (matches.length !== previouslyMatched) return block("control_ambiguous");
      matches.push(handoff
        ? { document, label: hash(nativeAccept.label), selector: hash(nativeAccept.selector), labelSource: nativeAccept.labelSource, backendNodeId: control.domBinding?.backendNodeId,
            ...(scopedLabelConflict ? { scopedLabelConflict: true } : {}) }
        : { document, label: labelHash(control.label), passiveSelector: control.selectorHint });
    }
  }
  if (!matches.length) return block(missing);
  const match = matches[0]!;
  // Repeated complete inventory observations can independently name the
  // same exact element in the already verified geometry. Keep ambiguity
  // for multiple controls in one observation and for conflicting bindings.
  if (matches.length > 1 && (!match.selector || !matches.every(other =>
    other.selector === match.selector && other.document === match.document &&
    other.label === match.label && other.labelSource === match.labelSource &&
    other.backendNodeId === match.backendNodeId && other.scopedLabelConflict === match.scopedLabelConflict))) return block("control_ambiguous");
  if (deadlineAtMs <= nowMs) return block("proof_expired");
  const proof = readAcceptFirstLayerProof({
    version: "certscore.accept-first-layer-proof.v1", scanId, sourceSha256, parentDispatchSha256,
    requestedTargetSha256: requestedTarget, documentSha256: match.document, labelSha256: match.label,
    ...(match.selector ? { geometrySha256: input.geometry!.sha256, selectorSha256: match.selector } : {}),
    ...(input.requireExactSelector && nativeAccept ? { exactSelector: nativeAccept.selector } : {}),
    ...(match.labelSource ? { labelSource: match.labelSource } : {}),
    ...(match.scopedLabelConflict ? { scopedLabelConflict: true } : {}),
    ...(drupalOverflow ? { drupalOverflow: true } : {}),
    issuedAtMs: nowMs, expiresAtMs: Math.min(deadlineAtMs, nowMs + ACCEPT_FIRST_LAYER_GATE_MS),
  });
  if (!proof) return block("source_binding_invalid");
  if (input.onDecision) note({
    outcome: "qualified", proof, documentTokenSha256: hash(documentToken),
    ...(match.passiveSelector ? { passiveSelectorSha256: hash(match.passiveSelector) } : {}),
  });
  return proof;
}

export function acceptFirstLayerProofMatches(proof: AcceptFirstLayerProof, scanId: string, targetUrl: string, nowMs: number) {
  return Boolean(readAcceptFirstLayerProof(proof) && proof.scanId === scanId &&
    proof.requestedTargetSha256 === targetHash(targetUrl) && nowMs >= proof.issuedAtMs && nowMs < proof.expiresAtMs);
}

/** The caller retains the original native handle and uses it for both reads and input. */
export async function dispatchWithAcceptFirstLayerProof(input: {
  proof: AcceptFirstLayerProof;
  initial: ConsentActionControlProof;
  assertCurrent: () => void;
  readCurrent: () => Promise<ConsentActionControlProof | undefined>;
  clickExact: () => Promise<void>;
  onFinalRecheck?: (outcome: "passed" | "failed") => void;
}) {
  const matches = (value: ConsentActionControlProof | undefined) => value?.action === "accept" &&
    value.authorizedTargetSha256 === input.proof.documentSha256 &&
    (!input.proof.drupalOverflow || (value.recipeId === DRUPAL_ACCEPT_RECIPE && value.cmpId === DRUPAL_CMP &&
      value.frameIdentitySha256 === input.proof.documentSha256 && value.labelSource === "visible_text")) &&
    (input.proof.selectorSha256
      ? hash(value.selectorHint) === input.proof.selectorSha256 && hash(value.accessibleLabel) === input.proof.labelSha256 &&
        (!input.proof.labelSource || input.proof.labelSource === value.labelSource)
      : labelHash(value.accessibleLabel) === input.proof.labelSha256);
  input.assertCurrent();
  if (!matches(input.initial)) throw new Error("accept_first_layer_control_mismatch");
  const notify = (outcome: "passed" | "failed") => {
    try { input.onFinalRecheck?.(outcome); } catch { /* Diagnostics cannot affect input. */ }
  };
  try {
    const current = await input.readCurrent();
    input.assertCurrent();
    if (!current || !matches(current) || current.labelSource !== input.initial.labelSource ||
      current.frameIdentitySha256 !== input.initial.frameIdentitySha256 ||
      current.selectorHint !== input.initial.selectorHint || current.recipeId !== input.initial.recipeId) {
      throw new Error("accept_first_layer_control_changed_before_click");
    }
  } catch (error) {
    notify("failed");
    throw error;
  }
  notify("passed");
  await input.clickExact();
}
