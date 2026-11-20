import { deriveCmpAuditAssessment } from "./cmp-audit-assessment-projector";
import { verifiedNarrowGeometry } from "./gdpr-narrow-geometry";
import {
  deriveConsentControlAssessment,
  deriveConsentSurfaceInspectionOutcome,
  classifyConsentControlLabel,
  classifyConsentInspectionRole,
  namesPrivacyChoiceEntrance,
  EXPLICIT_SALE_SHARING_LAUNCHER_LABEL,
  standaloneSaleSharingAnchorSchema,
  consentFooterOptOutCaptureSchema, type FooterCaptureResolution,
  consentFooterOptOutObservationSchema,
  footerStripSelectors,
  footerChoiceScopeForWitness,
  ONETRUST_FOOTER_SETTINGS_ID_SELECTOR,
  privacyChoiceInspectionSchema,
  isCurrentCaliforniaChoiceInspection,
  namesOptOutSettingsEntrance,
  namesNoticeBoundPrivacyRightsButton,
  optOutSettingsNoticeSentence,
  settingsEntranceNoticeSchema, verifiedInitialOptOutSwitch,
  originalInitialOptOutSwitchesSchema,
  originalOneTrustSettingsEntranceSchema,
  hasPositiveControlBox,
  consentControlInspectionSchema,
  consentControlVisualComparisonSchema,
  firstLayerOptOutGeometryDiagnosticSchema,
  verifyConsentControlInspection,
  verifiedMainFrameVisualCapture,
  isInitialNecessaryOnlySelection, isInitialSelectionSubmit,
  initialConsentSelectionSchema,
  consentSessionAccessLimited,
  hasUnresolvedConsentDecision,
  UNRESOLVED_CONSENT_DECISION,
  CONSENT_CONTROL_CAPTURE_POLICY_VERSION,
  isConsentControlInteractionEligible,
  isOneTrustConsentBannerWrapper,
  hasUnresolvedAdaptivePartialConsentInventory,
  isVerifiedTerminalConsentPacket,
  type CanonicalEvidenceBundle,
  type ConsentControlAssessment,
  type ConsentControlAssessmentCandidate,
  type ConsentControlAssessmentChannel,
  type ConsentControlAssessmentGeometry,
  type ConsentControlAssessmentInput,
  type ConsentControlInspection,
  type OptOutPlacementCorrection,
} from "@certscore/contracts";

type ConsentSurfaceInspectionLike = {
  actionableControlObserved?: boolean;
  consentSurfaceObserved?: boolean;
  coverageStatus?: string;
  evidenceChannels?: Array<{ channel?: string; status?: string }>;
  inspectionCompleted?: boolean;
  limitationKeys?: string[];
  observedAtMs?: number | null;
  outcome?: string;
};

const REQUIRED_CHANNELS: ConsentControlAssessmentChannel[] = ["dom_inventory", "geometry"];

/** Legacy captures may omit the explicit local-context flag. A retained native
 * decision beside a classified control still prevents a verified absence.
 * Classification here routes uncertainty; it never manufactures observed proof. */
function hasUnresolvedLegacyFirstLayerDecision(raw: Record<string, unknown> | null | undefined, bundle: CanonicalEvidenceBundle) {
  if (!raw || raw.controlInspection !== undefined || !Array.isArray(raw.candidates)) return false;
  const candidates = raw.candidates.slice(0, 160).filter((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value)));
  return candidates.some(candidate => {
    if (candidate.tagName !== "button" || candidate.layer !== "first_layer" ||
      candidate.enabled !== true || candidate.intersectsViewport !== true ||
      typeof candidate.containerId !== "string") return false;
    const frame = candidate.frameContext as Record<string, unknown> | undefined;
    const localDecisionContext = candidates.some(peer => peer !== candidate &&
      peer.containerId === candidate.containerId && peer.layer === "first_layer" &&
      ["accept_all", "reject_all", "manage_preferences"].includes(String(peer.actionType)) &&
      (peer.frameContext as Record<string, unknown> | undefined)?.frameUrl === frame?.frameUrl);
    if (!localDecisionContext) return false;
    const reasonCodes = Array.isArray(candidate.classifierReasonCodes)
      ? candidate.classifierReasonCodes.filter((code): code is string => typeof code === "string") : [];
    const label = typeof candidate.label === "string" ? candidate.label : undefined;
    const classification = classifyConsentControlLabel({ label, hasConsentContext: true,
      hasPreferenceContext: true, usage: "observation" });
    const unclassifiedRefusal = candidate.actionType === "other" && candidate.decisionStatus === "ambiguous" &&
      classification.intent === "reject" && classification.matchStrength === "direct";
    const retainedDefaultSelection = bundle.consentUiObservations.some(observation =>
      retainedDocumentToken(observation.documentIdentity) === retainedDocumentToken(raw.documentIdentity) &&
      retainedDocumentToken(raw.documentIdentity) !== null &&
      observation.layerInspected === "first_layer" &&
      observation.controls.some(control => control.label === label && control.actionType === "save_preferences" && control.visible === true) &&
      ((observation.defaultToggleStatesObserved === true && observation.nonEssentialDefaultsOff === true) ||
        observation.necessaryPreferenceSelectionObserved === true) &&
      (observation.precheckedOptionalPurposeCount ?? 0) === 0);
    const unverifiedSelection = (isInitialSelectionSubmit(label, reasonCodes) ||
      classification.variant === "save_preferences") &&
      !isInitialNecessaryOnlySelection(candidate.initialSelection) && !retainedDefaultSelection;
    return unclassifiedRefusal || unverifiedSelection;
  });
}

function retainedDocumentUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedDocumentId(value: string | null | undefined) {
  const retained = retainedDocumentUrl(value);
  if (!retained) return null;
  const url = new URL(retained);
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function retainedDocumentToken(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const token = (value as { token?: unknown }).token;
  return typeof token === "string" && token.length > 0 && token.length <= 160 ? token : null;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function artifactFileName(value: string | null | undefined) {
  return value?.split(/[\\/]/).at(-1)?.toLowerCase() ?? null;
}

function screenshotIsRetainedAndDisplayable(
  screenshot: CanonicalEvidenceBundle["screenshots"][number],
) {
  return screenshot.retentionStatus !== "withheld" && screenshot.displayStatus !== "withheld";
}

function retainedActionType(
  actionType: ConsentControlAssessmentCandidate["actionType"],
  classifierReasonCodes: string[] | undefined,
): ConsentControlAssessmentCandidate["actionType"] {
  if (
    actionType === "reject_all" &&
    (
      classifierReasonCodes?.includes("variant_reject_with_subscription") ||
      classifierReasonCodes?.includes("variant_reject_with_payment")
    )
  ) {
    return "other";
  }
  return actionType;
}

function retainedControlVariant(
  classifierReasonCodes: string[] | undefined,
): ConsentControlAssessmentCandidate["controlVariant"] {
  if (classifierReasonCodes?.includes("variant_reject_with_subscription")) {
    return "reject_with_subscription";
  }
  if (classifierReasonCodes?.includes("variant_reject_with_payment")) {
    return "reject_with_payment";
  }
  return null;
}
function inspectionChannel(value: string | undefined): ConsentControlAssessmentChannel | null {
  if (value === "page_script_inventory") return "dom_inventory";
  if (value === "viewport_screenshot") return "screenshot";
  if (value === "cmp_runtime") return "cmp_runtime";
  if (value === "navigation_network") return "network_cmp";
  if (value === "accessibility_tree" || value === "dom_inventory" || value === "dom_snapshot" || value === "geometry" || value === "network_cmp" || value === "screenshot") {
    return value;
  }
  return null;
}

function geometryObservedAtMs(
  raw: Record<string, unknown>,
  scanStartedAt: string | null | undefined,
) {
  if (typeof raw.observedAtMs === "number" && Number.isFinite(raw.observedAtMs)) {
    return Math.max(0, raw.observedAtMs);
  }
  if (typeof raw.capturedAt !== "string" || !scanStartedAt) return null;
  const capturedAtMs = Date.parse(raw.capturedAt);
  const scanStartedAtMs = Date.parse(scanStartedAt);
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(scanStartedAtMs)) return null;
  return Math.max(0, capturedAtMs - scanStartedAtMs);
}

function observedSettingsEntrance(row: Record<string, unknown>, pageUrl: string | null, mainFrameNoticeWitness: boolean): ConsentControlAssessmentCandidate["settingsEntranceSource"] {
  const frame = row.frameContext as { frameKind?: string; frameUrl?: string } | undefined;
  const style = row.computedStyle as { visibility?: string; display?: string; opacity?: string; pointerEvents?: string } | undefined;
  const reasons = row.classifierReasonCodes;
  // Retain the original action classification. This recovery supplies observation evidence only.
  const eligible = typeof row.candidateId === "string" && row.candidateId.length > 0 && row.candidateId.length <= 240 &&
    row.selectorHint === "#onetrust-pc-btn-handler" && row.tagName === "button" &&
    [row.title, row.value].every(text => text == null || text === "" || text === row.label || text === row.ariaLabel) &&
    (row.role == null || row.role === "button") && row.layer === "first_layer" && row.presentationType === "dedicated_button" &&
    row.semanticallyInteractive === true && row.enabled === true && row.consentContextConfirmed === true &&
    frame?.frameKind === "main_frame" && typeof frame.frameUrl === "string" && normalizedDocumentId(frame.frameUrl) === pageUrl &&
    row.intersectsViewport === true && row.clippedByScrollableAncestor === false &&
    (row.occlusion as {center?: boolean} | undefined)?.center === true && hasPositiveControlBox(row.boundingBox) &&
    style?.visibility === "visible" && typeof style.display === "string" && style.display !== "none" && Number(style.opacity) > 0 &&
    typeof style.pointerEvents === "string" && style.pointerEvents !== "none" &&
    ((row.actionType === "other" && row.decisionStatus === "ambiguous" &&
      Array.isArray(reasons) && reasons.length === 1 && reasons[0] === "visible_accessible_intent_conflict") ||
      ((row.actionType === "do_not_sell_share" || row.actionType === "manage_preferences" &&
       namesNoticeBoundPrivacyRightsButton(row.label, row.ariaLabel)) && row.decisionStatus === "confirmed_visible"));
  if (!eligible) return undefined;
  if (namesOptOutSettingsEntrance(row.label, row.ariaLabel)) return "accessible_name";
  const direct = row.actionType === "do_not_sell_share" && (row.ariaLabel == null || row.ariaLabel === "" || row.ariaLabel === row.label);
  const rights = row.actionType === "manage_preferences" && namesNoticeBoundPrivacyRightsButton(row.label, row.ariaLabel);
  if (!mainFrameNoticeWitness || (!direct && !rights) || row.decisionStatus !== "confirmed_visible") return undefined;
  const notice = settingsEntranceNoticeSchema.safeParse(row.settingsEntranceNotice);
  if (notice.success && optOutSettingsNoticeSentence(row.label, notice.data.sentence) === notice.data.sentence)
    return "same_banner_notice";
  return undefined;
}

function verifiedStandaloneSaleSharingAnchor(row: Record<string, unknown>, pageUrl: string | null): boolean {
  const frame = row.frameContext as {frameKind?: string; frameUrl?: string} | undefined;
  const style = row.computedStyle as {position?: string; display?: string; visibility?: string; opacity?: string; pointerEvents?: string} | undefined;
  const occlusion = row.occlusion as Record<string, unknown> | undefined;
  return standaloneSaleSharingAnchorSchema.safeParse(row.standaloneSaleSharingAnchor).success &&
    row.tagName === "a" && (row.role == null || row.role === "link") && row.linkDestination === "same_document" &&
    row.layer === "first_layer" && row.actionType === "do_not_sell_share" && row.matchStrength === "direct" &&
    row.enabled === true && row.semanticallyInteractive === true && row.decisionStatus === "confirmed_visible" &&
    row.intersectsViewport === true && row.clippedByScrollableAncestor === false && hasPositiveControlBox(row.boundingBox) &&
    typeof row.label === "string" && EXPLICIT_SALE_SHARING_LAUNCHER_LABEL.test(row.label) &&
    frame?.frameKind === "main_frame" && normalizedDocumentId(frame.frameUrl ?? null) === pageUrl &&
    style?.position === "fixed" && style.visibility === "visible" && style.display !== "none" &&
    Number(style.opacity) > 0 && style.pointerEvents !== "none" &&
    occlusion?.center === true && occlusion.checkedPoints === 5 &&
    [occlusion.topLeft, occlusion.topRight, occlusion.bottomLeft, occlusion.bottomRight].filter(hit => hit === true).length >= 2;
}

function footerInspection(bundle: CanonicalEvidenceBundle, documentUrl: string | null): NonNullable<ConsentControlAssessmentInput["optOutFooterInspection"]> {
  const run = bundle.modulesRun?.find(module => module.moduleName === "policySurfaceScanner");
  if (!run) return {status: "unavailable", reason: "no_policy_run"};
  const parsed = privacyChoiceInspectionSchema.safeParse(bundle.policySurfaceInspection?.privacyChoiceInspection);
  if (!parsed.success || !documentUrl || documentUrl.length > 500 || parsed.data.documentUrl !== documentUrl ||
      !isCurrentCaliforniaChoiceInspection(parsed.data)) return {status: "unavailable", reason: "missing_bound_inspection"};
  const inspection = parsed.data;
  return {status: run.status === "completed" ? inspection.coverage : "limited", documentUrl, inspectionHash: inspection.sourceHash};
}

function optOutTimingLimitation(bundle: CanonicalEvidenceBundle, raw: Record<string, unknown> | null | undefined,
  documentUrl: string | null, token: string | null, geometry: ConsentControlAssessmentGeometry | null): ConsentControlAssessmentInput["optOutTimingLimitation"] {
  if (!documentUrl || !token) return;
  // Report the nearest retained pre-choice screenshot from the same loader as the signal.
  // Its time explains the observation window. Pixels alone never establish a control.
  const screenshotAt = (signalToken: string, at: number) => {
    const shot = (bundle.screenshots ?? []).filter(s => s.documentIdentity?.source === "cdp_loader_id" &&
      s.documentIdentity.token === signalToken && s.url === documentUrl && s.consentStateAtTime === "pre_consent" &&
      screenshotIsRetainedAndDisplayable(s) && Number.isInteger(s.capturedAtMs))
      .sort((a,b) => Math.abs(a.capturedAtMs - at) - Math.abs(b.capturedAtMs - at))[0];
    return shot ? {screenshot: {artifactId: shot.artifactId, capturedAtMs: shot.capturedAtMs}} : {};
  };
  // An independently navigated recovery inventory cannot disprove a choice signal from the original visit.
  const recovery = bundle.consentUiObservations?.find(o => o.documentIdentity?.source === "cdp_loader_id" && o.documentIdentity.token === token &&
    o.layerInspected === "first_layer" && Number.isInteger(o.observedAtMs) &&
    o.documentUrl === documentUrl && o.basis?.includes("recovery:independent_consent_capture_completed"));
  if (recovery) {
    const original = bundle.domSnapshots?.find(s => s.artifactId === "dom_text_pre_consent" && s.url === documentUrl &&
      s.consentStateAtTime === "pre_consent" && s.documentIdentity?.source === "cdp_loader_id" && s.documentIdentity.token !== token &&
      s.capturedAtMs < recovery.observedAtMs && s.optOutSearch?.result === "specific_signal" && s.optOutSearch.documentToken === s.documentIdentity.token &&
      s.optOutSearch.documentUrl === documentUrl && s.optOutSearch.capturedAtMs === s.capturedAtMs &&
      s.optOutSearch.artifactId === s.artifactId);
    if (original?.documentIdentity) return {reason: "recovery_inventory_different_document", inventoryAtMs: recovery.observedAtMs,
      evidenceAtMs: original.capturedAtMs, evidenceRef: original.artifactId, ...screenshotAt(original.documentIdentity.token, original.capturedAtMs)};
  }
  const observedAt = geometry?.observedAtMs;
  if (geometry?.documentToken !== token || typeof observedAt !== "number" || !Number.isInteger(observedAt) || !raw ||
      raw.pageUrl !== documentUrl || !verifiedNarrowGeometry(raw, bundle.scanId)) return;
  const timing = raw.captureTiming as {version?: string; mainFrameCompletedAt?: string} | undefined;
  const mainFrameAt = timing?.version === "consent_geometry_capture_timing.v1" && timing.mainFrameCompletedAt
    ? Date.parse(timing.mainFrameCompletedAt) - Date.parse(bundle.startedAt) : NaN;
  const time = mainFrameAt >= 0 && mainFrameAt <= observedAt ? mainFrameAt : observedAt;
  const later = bundle.consentUiObservations?.find(o => o.documentIdentity?.source === "cdp_loader_id" && o.documentIdentity.token === token && o.documentUrl === documentUrl &&
    o.observedAtMs > time && o.layerInspected === "first_layer" && o.likelyPresent &&
    o.visibleChoiceLabels?.some(label => namesPrivacyChoiceEntrance(label)));
  if (later) return {reason: "choice_observed_after_inventory", inventoryAtMs: time, evidenceAtMs: later.observedAtMs,
    evidenceRef: later.observationId, ...screenshotAt(token, later.observedAtMs)};
  // Geometry can catch an entering banner before its button names become visible.
  const height = (raw.viewport as {height?:number} | undefined)?.height;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0 || !Array.isArray(raw.containers)) return;
  const partial = raw.containers.some(container => {
    if (container?.layer !== "first_layer" || container.intersectsViewport !== true ||
        !hasPositiveControlBox(container.boundingBox)) return false;
    const {y, height: boxHeight} = container.boundingBox;
    const visibleHeight = Math.min(height, y + boxHeight) - Math.max(0, y);
    if (typeof y !== "number" || boxHeight < 40 || visibleHeight <= 0 || visibleHeight >= Math.min(40, boxHeight / 3)) return false;
    return container.selectorHint === "#onetrust-banner-sdk" || (container.containerId && Array.isArray(raw.candidates) &&
      raw.candidates.some(row => row?.containerId === container.containerId && row.layer === "first_layer" &&
        row.tagName === "button" && row.consentContextConfirmed === true && typeof row.label === "string" &&
        namesPrivacyChoiceEntrance(row.label)));
  });
  if (partial) return {reason: "banner_partially_in_view", inventoryAtMs: time, evidenceAtMs: time, evidenceRef: "ConsentControlGeometryEvidence.json", ...screenshotAt(token, time)};
}

function boundSameVisitFooter(bundle: CanonicalEvidenceBundle, documentUrl: string | null, token: string | null, documentMismatch: boolean):
  Pick<ConsentControlAssessmentInput,"sameVisitFooter"|"footerOriginalVisit"|"sameVisitFooterCapture"> {
  const originals = (bundle.domSnapshots ?? []).filter(snapshot => snapshot.artifactId === "dom_text_pre_consent");
  let diagnostic: FooterCaptureResolution["diagnostic"];
  const status=(resolution:FooterCaptureResolution["resolution"])=>({sameVisitFooterCapture:{resolution,...(diagnostic ? {diagnostic} : {})}});
  if (!originals.length) return status("primary_snapshot_missing");
  if (originals.length!==1) return status("primary_snapshot_ambiguous");
  const snapshot=originals[0]!;
  if (snapshot.consentStateAtTime!=="pre_consent") return status("source_unavailable");
  if (snapshot.footerOptOutCapture !== undefined) {
    const result=consentFooterOptOutCaptureSchema.safeParse(snapshot.footerOptOutCapture);
    if (!result.success || result.data.artifactId!==snapshot.artifactId || result.data.documentUrl!==snapshot.url ||
        result.data.snapshotAtMs!==snapshot.capturedAtMs || result.data.documentToken!==
          (snapshot.documentIdentity?.source==="cdp_loader_id" ? snapshot.documentIdentity.token : undefined)) return status("invalid_packet");
    diagnostic=result.data;
  }
  if (documentMismatch || documentUrl && snapshot.url!==documentUrl || diagnostic?.outcome==="document_mismatch") return status("document_mismatch");
  if (diagnostic && diagnostic.outcome!=="captured") return status("capture_incomplete");
  if (!token || !documentUrl || documentUrl.length>500 || snapshot.documentIdentity?.source!=="cdp_loader_id") return status("source_unavailable");
  if (snapshot.footerOptOutObservation===undefined) return status(diagnostic ? "invalid_packet" : "not_retained");
  const parsed=consentFooterOptOutObservationSchema.safeParse(snapshot.footerOptOutObservation);
  if (!parsed.success) return status("invalid_packet");
  const packet=parsed.data;
  if (packet.artifactId!==snapshot.artifactId || packet.documentToken!==snapshot.documentIdentity.token ||
      packet.documentUrl!==documentUrl || packet.snapshotAtMs!==snapshot.capturedAtMs ||
      diagnostic && packet.capturedAtMs>diagnostic.completedAtMs) return status("invalid_packet");
  if (packet.documentToken===token) return {...status("available"),sameVisitFooter:packet};
  // A later banner inventory may own the canonical first-layer loader. Keep a
  // positive from the original footer only with independent witnesses to both visits.
  const shot = bundle.screenshots?.find(s => s.artifactId.startsWith("screenshot_pre_consent") &&
    s.url === documentUrl && s.consentStateAtTime === "pre_consent" && s.documentIdentity?.source === "cdp_loader_id" &&
    s.documentIdentity.token === packet.documentToken && s.path && screenshotIsRetainedAndDisplayable(s));
  const recovery = bundle.consentUiObservations?.find(o => o.documentUrl === documentUrl &&
    o.documentIdentity?.source === "cdp_loader_id" && o.documentIdentity.token === token && o.layerInspected === "first_layer" &&
    o.basis?.includes("recovery:independent_consent_capture_completed"));
  if (shot && recovery) return {...status("available"),sameVisitFooter: packet, footerOriginalVisit: {documentToken: packet.documentToken,
    screenshotRef: shot.artifactId, screenshotAtMs: shot.capturedAtMs, recoveryObservationRef: recovery.observationId, recoveryToken: token}};
  return status("document_mismatch");
}

function boundOriginalOptOutSwitches(bundle: CanonicalEvidenceBundle, documentUrl: string | null, token: string | null):
  ConsentControlAssessmentInput["originalOptOutSwitches"] {
  const originals = (bundle.domSnapshots ?? []).filter(snapshot => snapshot.artifactId === "dom_text_pre_consent");
  const [snapshot] = originals;
  if (originals.length !== 1 || !documentUrl || !token || !snapshot?.path ||
      snapshot.url !== documentUrl || snapshot.consentStateAtTime !== "pre_consent" ||
      snapshot.documentIdentity?.source !== "cdp_loader_id") return;
  const parsed = originalInitialOptOutSwitchesSchema.safeParse(snapshot.originalInitialOptOutSwitches);
  if (!parsed.success || parsed.data.documentUrl !== documentUrl ||
      parsed.data.documentToken !== snapshot.documentIdentity.token) return;
  const packet = parsed.data;
  if (packet.documentToken === token) return {packet};
  const recovery = bundle.consentUiObservations?.find(observation =>
    observation.layerInspected === "first_layer" && observation.documentUrl === documentUrl &&
    observation.documentIdentity?.source === "cdp_loader_id" && observation.documentIdentity.token === token &&
    observation.observedAtMs > packet.observedAtMs &&
    observation.basis?.includes("recovery:independent_consent_capture_completed"));
  if (recovery) return {packet, recovery: {observationRef: recovery.observationId, documentToken: token}};
}

function boundOriginalOptOutSettings(bundle: CanonicalEvidenceBundle, documentUrl: string | null, token: string | null):
  ConsentControlAssessmentInput["originalOptOutSettings"] {
  const originals = (bundle.domSnapshots ?? []).filter(snapshot => snapshot.artifactId === "dom_text_pre_consent");
  const [snapshot] = originals;
  if (originals.length !== 1 || !documentUrl || !token || !snapshot?.path || snapshot.url !== documentUrl ||
      snapshot.consentStateAtTime !== "pre_consent" || snapshot.documentIdentity?.source !== "cdp_loader_id") return;
  const parsed = originalOneTrustSettingsEntranceSchema.safeParse(snapshot.originalOneTrustSettingsEntrance);
  const diagnostic = consentFooterOptOutCaptureSchema.safeParse(snapshot.footerOptOutCapture);
  if (!parsed.success || !diagnostic.success || diagnostic.data.outcome !== "captured" || diagnostic.data.documentUrl !== documentUrl ||
      diagnostic.data.snapshotAtMs !== snapshot.capturedAtMs || diagnostic.data.documentToken !== snapshot.documentIdentity.token ||
      parsed.data.documentUrl !== documentUrl || parsed.data.documentToken !== snapshot.documentIdentity.token ||
      parsed.data.observedAtMs < snapshot.capturedAtMs || parsed.data.observedAtMs > diagnostic.data.completedAtMs) return;
  const packet = parsed.data;
  if (packet.documentToken === token) return {packet};
  const recovery = bundle.consentUiObservations?.find(observation => observation.layerInspected === "first_layer" &&
    observation.documentUrl === documentUrl && observation.documentIdentity?.source === "cdp_loader_id" &&
    observation.documentIdentity.token === token && observation.observedAtMs > packet.observedAtMs &&
    observation.basis?.includes("recovery:independent_consent_capture_completed"));
  const shot = bundle.screenshots?.find(s => s.artifactId.startsWith("screenshot_pre_consent") && s.url === documentUrl &&
    s.consentStateAtTime === "pre_consent" && s.documentIdentity?.source === "cdp_loader_id" &&
    s.documentIdentity.token === packet.documentToken && s.path && screenshotIsRetainedAndDisplayable(s));
  if (recovery && shot && shot.capturedAtMs <= recovery.observedAtMs) return {packet,recovery:{
    documentToken:packet.documentToken,screenshotRef:shot.artifactId,screenshotAtMs:shot.capturedAtMs,
    recoveryObservationRef:recovery.observationId,recoveryToken:token,
  }};
}

/** Correct placement only when verified main-frame geometry identifies the
 * same control below the viewport on the same loader. */
function verifiedNonBannerPlacements(raw: Record<string, unknown> | null | undefined,
  scanId: string, documentUrl: string | null, token: string | null) {
  const placements = new Map<string, {label: string; tagName: string}>();
  const identity = raw?.documentIdentity as {source?: unknown; token?: unknown} | undefined;
  const viewport = raw?.viewport as {height?: number} | undefined;
  const height = viewport?.height;
  if (!raw || !token || !documentUrl || raw.pageUrl !== documentUrl || identity?.source !== "cdp_loader_id" ||
      identity.token !== token || typeof height !== "number" || !Number.isFinite(height) || height <= 0 ||
      !verifiedNarrowGeometry(raw, scanId) || !Array.isArray(raw.candidates)) return placements;
  const knownSelectors = [...Object.values(footerStripSelectors), ONETRUST_FOOTER_SETTINGS_ID_SELECTOR];
  for (const selector of knownSelectors) {
    const isSettingsAnchor = selector === ONETRUST_FOOTER_SETTINGS_ID_SELECTOR;
    const tagName = isSettingsAnchor ? "a" : "button";
    const matches = raw.candidates.filter(row => row?.selectorHint === selector && row?.tagName === tagName &&
      row?.frameContext?.frameKind === "main_frame" && row.frameContext.frameUrl === documentUrl);
    const [row] = matches;
    if (matches.length !== 1 || row.intersectsViewport !== false || typeof row.label !== "string" ||
        !Number.isFinite(row.boundingBox?.y) || row.boundingBox.y < height || !hasPositiveControlBox(row.boundingBox)) continue;
    const placedAway = isSettingsAnchor ? row.layer === "footer" && row.decisionStatus === "footer_or_policy_link" :
      row.layer === "page_body" && row.decisionStatus === "dom_present_not_visible";
    if (placedAway) placements.set(selector, {label: row.label, tagName});
  }
  return placements;
}

type PlacementInventoryControl = CanonicalEvidenceBundle["consentUiObservations"][number]["controls"][number];

function verifiedOptOutPlacementGeometry(raw: Record<string, unknown> | null | undefined,
  scanId: string, documentUrl: string | null, token: string | null) {
  if (!raw || !documentUrl || !token || raw.pageUrl !== documentUrl || retainedDocumentToken(raw.documentIdentity) !== token ||
      !Array.isArray(raw.candidates)) return undefined;
  const source = verifiedNarrowGeometry(raw, scanId);
  const viewport = raw.viewport as {width?: unknown;height?: unknown} | undefined;
  const {width,height} = viewport ?? {};
  if (!source || typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) ||
      width <= 0 || height <= 0) return undefined;
  const inventory = firstLayerOptOutGeometryDiagnosticSchema.safeParse(raw.firstLayerOptOutGeometry);
  const coverage = inventory.success ? inventory.data.captureCoverage : undefined;
  const complete = inventory.success && inventory.data.retainedCandidateCount === raw.candidates.length &&
    inventory.data.frameOutcomes[0] === "captured" && coverage?.documentReadyState === "complete" &&
    coverage.mainFrameAvailable === true && coverage.documentAndFramesStable === true && coverage.inventoryTruncated === false;
  const rows = raw.candidates.filter(row => row?.frameContext?.frameKind === "main_frame" && row.frameContext.frameUrl === documentUrl);
  return {rows, complete, documentUrl, token, width, height, sourceSha256:source.sha256};
}

const normalizedPlacementLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");

function correctedOptOutPlacement(geometry: ReturnType<typeof verifiedOptOutPlacementGeometry>, control: PlacementInventoryControl,
  inventory: PlacementInventoryControl[], evidenceRef: string): OptOutPlacementCorrection | undefined {
  if (!geometry || control.visible !== true || control.actionType !== "do_not_sell_share" || !control.tagName ||
      !control.selectorHint || !namesPrivacyChoiceEntrance(control.label)) return;
  const label = normalizedPlacementLabel(control.label);
  const sameName = (name: unknown) => typeof name === "string" && normalizedPlacementLabel(name) === label;
  const genericAnchor = control.tagName === "a" && control.selectorHint === "a";
  let candidates = geometry.rows.filter(row => row.tagName === control.tagName && sameName(row.label));
  if (genericAnchor) {
    // A tag-only inventory locator needs the complete geometry inventory and
    // a unique compatible owner on each side. A second same-name control can
    // be a genuine banner peer and makes the weak locator ambiguous.
    if (!geometry.complete || !control.linkDestination || control.linkDestination === "unverified" ||
        inventory.filter(row => row.tagName === control.tagName && sameName(row.label)).length !== 1 || candidates.length !== 1) return;
    candidates = candidates.filter(row => row.linkDestination === control.linkDestination &&
      typeof row.selectorHint === "string" && /(?:[ >])a$/.test(row.selectorHint));
  } else candidates = candidates.filter(row => row.selectorHint === control.selectorHint);
  const [row, second] = candidates;
  if (!row || second || row.actionType !== "do_not_sell_share" || row.semanticallyInteractive !== true || row.enabled !== true ||
      row.placementType !== "persistent_surface" || row.presentationType !== "persistent_link" ||
      !["footer", "preference_center", "page_body", "deeper_layer"].includes(row.layer) ||
      !["deeper_layer", "footer_or_policy_link", "dom_present_not_visible"].includes(row.decisionStatus) ||
      !hasPositiveControlBox(row.boundingBox) || typeof row.candidateId !== "string" || !row.candidateId) return;
  const below = row.intersectsViewport === false && row.boundingBox.y >= geometry.height;
  const hit = row.intersectsViewport === true && row.occlusion?.center === true &&
    Number.isInteger(row.occlusion.checkedPoints) && row.occlusion.checkedPoints >= 1 && row.occlusion.checkedPoints <= 5;
  if (!below && !hit) return;
  const scrollable = row.scrollableAncestor;
  const navigation = hit && typeof scrollable?.selectorHint === "string" &&
    /(?:^|[ .#_>:-])(?:nav|sidenav|sidebar)(?:$|[ .#_>:-])/i.test(scrollable.selectorHint) &&
    hasPositiveControlBox(scrollable.boundingBox) && scrollable.boundingBox.width <= geometry.width / 2;
  return {label:control.label,evidenceRef:evidenceRef.slice(0,240),geometryCandidateId:row.candidateId.slice(0,240),
    sourceSha256:geometry.sourceSha256,documentUrl:geometry.documentUrl,documentToken:geometry.token,
    placement:navigation ? "persistent_site_navigation" : "outside_initial_banner"};
}

function verifiedOneTrustFooterPlacement(geometry: ReturnType<typeof verifiedOptOutPlacementGeometry>,
  footer: NonNullable<ConsentControlAssessmentInput["sameVisitFooter"]> | undefined,
  candidate: NonNullable<ConsentControlAssessmentInput["sameVisitFooter"]>["candidates"][number] | undefined): OptOutPlacementCorrection | undefined {
  if (!geometry || !footer || !candidate || footer.documentToken !== geometry.token || footer.documentUrl !== geometry.documentUrl) return;
  const owners = geometry.rows.filter(row => row.tagName === "button" && row.selectorHint === ONETRUST_FOOTER_SETTINGS_ID_SELECTOR);
  const [row] = owners;
  if (owners.length !== 1 || row.actionType !== "do_not_sell_share" || row.enabled !== true || row.semanticallyInteractive !== true ||
      row.layer !== "first_layer" || typeof row.label !== "string" || normalizedPlacementLabel(row.label) !== normalizedPlacementLabel(candidate.label) ||
      typeof row.candidateId !== "string" || !row.candidateId || !hasPositiveControlBox(row.boundingBox)) return;
  return {label:candidate.label,evidenceRef:`${footer.artifactId}:${candidate.evidenceId}`,geometryCandidateId:row.candidateId.slice(0,240),
    sourceSha256:geometry.sourceSha256,documentUrl:geometry.documentUrl,documentToken:geometry.token,placement:"outside_initial_banner"};
}

function observedFooterLinks(bundle: CanonicalEvidenceBundle, documentUrl: string | null,
  sameVisitFooter?: ConsentControlAssessmentInput["sameVisitFooter"]) {
  const links: NonNullable<ConsentControlAssessmentInput["optOutFooterLinks"]> = [];
  const nativeLabels = new Set<string>();
  for (const row of sameVisitFooter?.candidates ?? []) {
    if (row.visibility !== "rendered_exposed" && row.visibility !== "covered") continue;
    const choiceScope = footerChoiceScopeForWitness(row.controlWitness);
    links.push({label: row.label, visibility: row.visibility, documentUrl: sameVisitFooter!.documentUrl,
      ...(row.placementWitness ? {placement: "document_end_strip" as const} : {}),
      ...(choiceScope ? {choiceScope} : {}),
      ...(row.controlWitness === "named_privacy_policy_entrance" ? {destinationKind: "privacy_policy" as const} : {}),
      evidenceRef: sameVisitFooter!.artifactId + ":" + row.evidenceId});
    nativeLabels.add(row.label.toLowerCase().replace(/\s+/g, " ").trim());
    if (links.length === 16) return links;
  }
  const inspectedDocument = bundle.policySurfaceInspection?.privacyChoiceInspection?.documentUrl;
  if (!documentUrl || (inspectedDocument && inspectedDocument !== documentUrl)) return links;
  const policyRan = bundle.modulesRun?.some(run => run.moduleName === "policySurfaceScanner" &&
    (run.status === "completed" || run.status === "partial"));
  for (const s of bundle.policySurfaceObservations ?? []) {
    // A rendered positive can survive a later inventory timeout. Keep the
    // scan's footer inspection status independent from that individual fact.
    if (!inspectedDocument && !(policyRan && s.sourceScanner === "policy_surface" &&
        s.scenario === "policy_surface_review" && s.selector)) continue;
    if (s.discoveryMethod !== "footer_link" || s.linkSourcePageUrl !== documentUrl ||
        s.traversalDepth !== 0 || s.parentObservationId || s.directlyLinkedFromScannedPage !== true ||
        s.linkObservationState !== "observed" || s.linkVisibility !== "visible" || s.clickable !== true ||
        !s.accessibleNameSource || s.accessibleNameSource === "none" || !s.linkText || s.linkText.length > 120 ||
        !s.observationId || s.observationId.length > 220 || documentUrl.length > 500) continue;
    if (!namesPrivacyChoiceEntrance(s.linkText) || nativeLabels.has(s.linkText.toLowerCase().replace(/\s+/g, " ").trim()) ||
        links.some(link => link.evidenceRef === "policy-surface:" + s.observationId)) continue;
    links.push({label: s.linkText, evidenceRef: "policy-surface:" + s.observationId, documentUrl});
    if (links.length === 16) break;
  }
  return links;
}

function geometryInput(
  raw: Record<string, unknown> | null | undefined,
  canonicalDocumentId: string | null,
  canonicalDocumentToken: string | null,
  scanStartedAt: string | null | undefined,
  scanId: string,
  allowSettingsEntrance: boolean,
  footerGeometryId?: string,
): ConsentControlAssessmentGeometry | null {
  if (!raw) return null;
  const observedAtMs = geometryObservedAtMs(raw, scanStartedAt);
  const summary = raw.summary && typeof raw.summary === "object" && !Array.isArray(raw.summary)
    ? raw.summary as Record<string, unknown>
    : null;
  const pageUrl = normalizedDocumentId(typeof raw.pageUrl === "string" ? raw.pageUrl : null);
  const documentToken = retainedDocumentToken(raw.documentIdentity);
  const tokenBoundToCanonicalDocument = Boolean(
    canonicalDocumentToken && documentToken === canonicalDocumentToken,
  );
  const verifiedEntranceSource = allowSettingsEntrance && tokenBoundToCanonicalDocument &&
    pageUrl === canonicalDocumentId && observedAtMs !== null && Boolean(verifiedNarrowGeometry(raw, scanId));
  const optOutGeometry = firstLayerOptOutGeometryDiagnosticSchema.safeParse(raw.firstLayerOptOutGeometry);
  // Same-URL child frames can share the legacy human-readable frameKind and frameUrl.
  const mainFrameOptOutOrdinals = new Set(optOutGeometry.success && Array.isArray(raw.candidates) &&
    optOutGeometry.data.retainedCandidateCount === raw.candidates.length && optOutGeometry.data.frameOutcomes[0] === "captured"
      ? optOutGeometry.data.candidates.filter(sample => sample.frameSlot === 0 && sample.confirmedVisible &&
        sample.role === "decision" && sample.coverage === "classified_opt_out").map(sample => sample.ordinal) : []);
  let legacyOptOutBannerWrapper = false;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.flatMap((candidate, ordinal): ConsentControlAssessmentCandidate[] => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const row = candidate as Record<string, unknown>;
        const boundFooter = footerGeometryId !== undefined && row.candidateId === footerGeometryId;
        const actionType = typeof row.actionType === "string" ? row.actionType : "other";
        const boundMainFrameOptOut = row.candidateId === `candidate_${ordinal}` && mainFrameOptOutOrdinals.has(ordinal);
        if (row.standaloneSaleSharingAnchor !== undefined && (!verifiedEntranceSource || !boundMainFrameOptOut ||
          (raw.documentIdentity as {source?: string})?.source !== "cdp_loader_id" || !verifiedStandaloneSaleSharingAnchor(row, pageUrl))) return [];
        if (actionType === "do_not_sell_share" && row.layer === "first_layer" && isOneTrustConsentBannerWrapper(row)) {
          legacyOptOutBannerWrapper = true;
          return [];
        }
        const classifierReasonCodes = Array.isArray(row.classifierReasonCodes)
          ? row.classifierReasonCodes.filter((value): value is string => typeof value === "string")
          : [];
        const selectionClaim = classifierReasonCodes.includes("initial_necessary_only_selection_observed");
        const selectionVerified = !selectionClaim || (row.tagName === "button" && isInitialNecessaryOnlySelection(row.initialSelection) &&
          isInitialSelectionSubmit(typeof row.label === "string" ? row.label : undefined, classifierReasonCodes, row.initialSelection));
        const supportedActionType = retainedActionType(
          selectionVerified && ["accept_all", "reject_all", "manage_preferences", "save_preferences", "do_not_sell_share", "other"].includes(actionType)
          ? actionType as ConsentControlAssessmentCandidate["actionType"]
          : "other",
          classifierReasonCodes,
        );
        const settingsEntrance = !boundFooter && verifiedEntranceSource && (raw.documentIdentity as {source?: string})?.source === "cdp_loader_id" &&
          observedSettingsEntrance(row, pageUrl, boundMainFrameOptOut);
        const initialSwitch = verifiedEntranceSource && pageUrl && (raw.documentIdentity as {source?: string})?.source === "cdp_loader_id" &&
          row.initialOptOutSwitch ? verifiedInitialOptOutSwitch(raw,ordinal,pageUrl) : undefined;
        const controlVariant = retainedControlVariant(classifierReasonCodes);
        const presentationType =
          row.presentationType === "dedicated_button" ||
          row.presentationType === "inline_link" ||
          row.presentationType === "persistent_link"
            ? row.presentationType
            : "unknown";
        const placementType =
          row.placementType === "action_cluster" ||
          row.placementType === "first_layer_body" ||
          row.placementType === "persistent_surface"
            ? row.placementType
            : "unknown";
        const visible = Boolean(settingsEntrance || initialSwitch) ||
          row.decisionStatus === "confirmed_visible" ||
          (presentationType === "persistent_link" && row.decisionStatus === "footer_or_policy_link");
        const selection = initialConsentSelectionSchema.safeParse(row.initialSelection);
        const projected: ConsentControlAssessmentCandidate = {
          tagName: typeof row.tagName === "string" ? row.tagName : undefined,
          role: typeof row.role === "string" ? row.role : undefined,
          semanticallyInteractive: typeof row.semanticallyInteractive === "boolean" ? row.semanticallyInteractive : undefined,
          consentContextConfirmed: typeof row.consentContextConfirmed === "boolean" ? row.consentContextConfirmed : undefined,
          ...(selection.success && selectionVerified ? { initialSelection: selection.data } : {}),
          evidenceId: typeof row.candidateId === "string" ? row.candidateId : undefined,
          actionType: supportedActionType,
          ...(initialSwitch ? {intent: "privacy_opt_out" as const, initialSwitchScope: initialSwitch.scope} : {}),
          ...(settingsEntrance ? {intent: "privacy_opt_out" as const, opensPreferenceCenter: true as const,
            settingsEntranceSource: settingsEntrance} : {}),
          controlVariant,
          label: initialSwitch?.label ?? (typeof row.label === "string" ? row.label : null),
          matchedTerm: typeof row.matchedTerm === "string" ? row.matchedTerm : null,
          locale: typeof row.matchedLocale === "string" ? row.matchedLocale as ConsentControlAssessmentCandidate["locale"] : null,
          matchStrength: typeof row.matchStrength === "string" ? row.matchStrength as ConsentControlAssessmentCandidate["matchStrength"] : null,
          classifierRegistryVersion: typeof row.classifierRegistryVersion === "string" ? row.classifierRegistryVersion : undefined,
          classifierReasonCodes,
          layer: boundFooter ? "deeper_layer" : row.layer === "first_layer"
            ? "first_layer"
            : row.layer === "footer" || row.layer === "preference_center" || row.layer === "page_body" || row.layer === "deeper_layer"
              ? "deeper_layer"
              : "unknown",
          presentationType,
          placementType,
          visible,
          actionable: visible && row.enabled !== false,
          observedAtMs: observedAtMs ?? undefined,
          documentId: tokenBoundToCanonicalDocument ? canonicalDocumentId : pageUrl,
          documentToken,
          channels: ["geometry"],
          // The geometry JSON is the retained proof; its optional screenshot
          // can be unavailable without turning this into a dangling image ref.
          artifactRefs: ["ConsentControlGeometryEvidence.json"],
        };
        if (settingsEntrance === "same_banner_notice" && actionType === "manage_preferences") {
          const {intent: _intent, opensPreferenceCenter: _opens, settingsEntranceSource: _source, ...options} = projected;
          return [options, {...projected, evidenceId: `${projected.evidenceId}:notice-opt-out`}];
        }
        return [projected];
      })
    : [];
  const complete =
    Boolean(summary) &&
    typeof summary?.firstLayerAccept === "boolean" &&
    typeof summary?.firstLayerReject === "boolean" &&
    typeof summary?.firstLayerOptions === "boolean" &&
    typeof summary?.confidence === "number" &&
    summary.confidence > 0 &&
    !(Array.isArray(summary.limitations) && summary.limitations.includes("visible_accessible_intent_conflict")) &&
    Boolean(pageUrl) &&
    Boolean(canonicalDocumentId);
  const assessmentStatus = !complete
    ? "incomplete"
    : canonicalDocumentToken && documentToken
      ? documentToken !== canonicalDocumentToken
        ? "document_mismatch"
        : "complete"
      : pageUrl !== canonicalDocumentId
      ? "document_mismatch"
      : "complete";
  const verifiedInspection = verifyConsentControlInspection(raw.controlInspection, raw.candidates);
  const optOutGeometrySource = optOutGeometry.success ? verifiedNarrowGeometry(raw, scanId) : null;
  const firstLayerOptOutGeometry = optOutGeometry.success && optOutGeometrySource && verifiedInspection && tokenBoundToCanonicalDocument &&
    pageUrl === canonicalDocumentId && optOutGeometry.data.retainedCandidateCount === verifiedInspection.retainedCandidateCount &&
    optOutGeometry.data.inspectedCandidateCount === verifiedInspection.candidates.length &&
    optOutGeometry.data.structuralCoverage === verifiedInspection.structuralCoverage &&
    JSON.stringify(optOutGeometry.data.captureCoverage) === JSON.stringify(verifiedInspection.captureCoverage)
    ? {sourceSha256: optOutGeometrySource.sha256, data: optOutGeometry.data} : undefined;
  const visual = consentControlVisualComparisonSchema.safeParse(raw.visualComparison);
  const visualComparison = visual.success && tokenBoundToCanonicalDocument && assessmentStatus === "complete" &&
    (visual.data.version === "consent_control_visual_comparison.v1" ||
      JSON.stringify(visual.data.mainFrameCapture) === JSON.stringify(verifiedMainFrameVisualCapture(raw))) &&
    (verifiedInspection?.structuralCoverage === "complete" || verifiedMainFrameVisualCapture(raw) &&
      JSON.stringify(visual.data.mainFrameCapture) === JSON.stringify(verifiedMainFrameVisualCapture(raw))) && visual.data.documentToken === documentToken &&
    visual.data.imageWidth === (raw.viewport as Record<string, unknown> | undefined)?.width &&
    visual.data.imageHeight === (raw.viewport as Record<string, unknown> | undefined)?.height &&
    ["accept", "reject"].every(intent => {
      const measurement = visual.data[intent as "accept" | "reject"];
      const candidate = (Array.isArray(raw.candidates) ? raw.candidates : []).find((row): row is Record<string, unknown> =>
        Boolean(row && typeof row === "object" && !Array.isArray(row) && row.candidateId === measurement.candidateId));
      const bounds = candidate?.boundingBox as Record<string, unknown> | undefined;
      const frame = candidate?.frameContext as Record<string, unknown> | undefined;
      return candidate?.actionType === `${intent}_all` && candidate.layer === "first_layer" &&
        candidate.decisionStatus === "confirmed_visible" && candidate.enabled === true && frame?.frameKind === "main_frame" &&
        normalizedDocumentId(typeof frame.frameUrl === "string" ? frame.frameUrl : null) === pageUrl &&
        (candidate.screenshotArtifactRef === visual.data.screenshotArtifactRef || raw.screenshotArtifactRef === visual.data.screenshotArtifactRef) &&
        ["x", "y", "width", "height"].every((key, index) => bounds?.[key] === measurement.bounds[index]);
    }) ? visual.data : undefined;
  return {
    ...(visualComparison ? { visualComparison } : {}),
    ...(firstLayerOptOutGeometry ? { firstLayerOptOutGeometry } : {}),
    ...(legacyOptOutBannerWrapper || (raw.controlInspection !== undefined && !verifiedInspection) ? { inspectionInvalid: true } : {}),
    ...(assessmentStatus === "complete" && tokenBoundToCanonicalDocument && verifiedInspection && !legacyOptOutBannerWrapper
      ? { controlInspection: verifiedInspection } : {}),
    artifactVersion: typeof raw.artifactVersion === "string" ? raw.artifactVersion : null,
    assessmentStatus,
    documentId: tokenBoundToCanonicalDocument ? canonicalDocumentId : pageUrl,
    documentToken,
    observedAtMs,
    completedChannels: assessmentStatus === "complete" ? ["geometry"] : [],
    incompleteChannels: assessmentStatus === "incomplete" ? ["geometry"] : [],
    evidenceRefs: candidates.flatMap((candidate) => candidate.artifactRefs ?? []),
    candidates,
  };
}

function hasPairedFirstLayerOptOut(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number],
  candidates: unknown[],
  documentUrl: string,
  inspection?: ConsentControlInspection,
): boolean {
  const positiveIds = new Set(inspection?.candidates.filter(row =>
    row.role === "decision" && row.unresolvedIntents.length === 0).map(row => row.candidateId));
  return observation.controls.some(control =>
    control.actionType === "do_not_sell_share" && control.matchStrength === "direct" && control.tagName === "button" && control.visible === true &&
    (control.layer ?? observation.layerInspected) === "first_layer" && control.selectorHint &&
    isConsentControlInteractionEligible(control) && candidates.some(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const candidate = value as Record<string, unknown>;
      const bounds = candidate.boundingBox as {width?: number; height?: number} | undefined;
      const frame = candidate.frameContext as {frameKind?: string; frameUrl?: string} | undefined;
      return candidate.actionType === "do_not_sell_share" && candidate.matchStrength === "direct" && candidate.tagName === "button" &&
        candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible" && candidate.enabled === true &&
        candidate.consentContextConfirmed === true && candidate.intersectsViewport === true &&
        typeof bounds?.width === "number" && bounds.width > 0 && typeof bounds.height === "number" && bounds.height > 0 &&
        candidate.selectorHint === control.selectorHint && candidate.label === control.label &&
        frame?.frameKind === "main_frame" && frame.frameUrl === documentUrl && isConsentControlInteractionEligible(candidate) &&
        (!inspection || (typeof candidate.candidateId === "string" && positiveIds.has(candidate.candidateId) &&
          classifyConsentInspectionRole(candidate, inspection.version).role === "decision"));
    }));
}

/** The verified consent lane owns its document, independently of runtime redirects.
 * URL equality alone cannot override the global document: require the retained
 * lane outcome and matching observation, DOM and geometry loader tokens. */
function verifiedConsentLaneDocument(bundle: CanonicalEvidenceBundle, rawGeometry: Record<string, unknown> | null | undefined,
  legacyFallbackUrl: string | null = null): { url: string; finalUrl: string; token: string; positiveOnly: boolean } | null {
  if (consentSessionAccessLimited(bundle, rawGeometry)) return null;
  const lane = bundle.scanLaneRuns?.find((run) => run.laneId === "consent_proof");
  const lanes = bundle.scanEvidenceLaneAssessment ?? bundle.scan_evidence_lane_assessment;
  const latest = [...(bundle.consentUiObservations ?? [])].sort((a, b) => b.observedAtMs - a.observedAtMs)[0];
  const degradedRepresentativeVisit = lane?.executionOutcome === "degraded" && lane.accessOutcome === "representative_page" && !lane.challengeDetected;
  const representativeDegraded=degradedRepresentativeVisit &&
    latest?.likelyPresent===true && latest.captureStatus==="observed" &&
    verifyConsentControlInspection(rawGeometry?.controlInspection,rawGeometry?.candidates)?.structuralCoverage==="complete" &&
    Array.isArray(rawGeometry?.candidates) && rawGeometry.candidates.some((candidate:unknown)=>{
      if(!candidate || typeof candidate!=="object")return false;
      const row=candidate as Record<string,unknown>;
      return row.layer==="first_layer" && ["accept_all","reject_all","manage_preferences"].includes(String(row.actionType)) &&
        ["covered","confirmed_visible"].includes(String(row.decisionStatus));
    });
  if (lane?.executionOutcome !== "success" && !representativeDegraded && !(legacyFallbackUrl && degradedRepresentativeVisit)) return null;
  const access = rawGeometry?.access as { status?: string; httpStatus?: number } | undefined;
  const retainedPositive = latest?.captureStatus === "observed" && latest.controls.some(control => isConsentControlInteractionEligible(control) && control.visible === true && ["accept_all", "reject_all", "manage_preferences"].includes(control.actionType) &&
    (control.tagName !== "ax-node" || control.visibilityEvidence === "box_model_verified" && control.consentContextEvidence === "local_surface"));
  if (lanes?.lanes.consent !== "usable" && !(lanes?.lanes.consent === "limited" && (retainedPositive || representativeDegraded) &&
    access?.status === "loaded" && typeof access.httpStatus === "number" && access.httpStatus < 400)) return null;
  const finalUrl = retainedDocumentUrl(typeof rawGeometry?.pageUrl === "string" ? rawGeometry.pageUrl : null);
  const geometryUrl = normalizedDocumentId(finalUrl);
  const geometryToken = retainedDocumentToken(rawGeometry?.documentIdentity);
  if (!finalUrl || !geometryUrl || !geometryToken || !["https:", "http:"].includes(new URL(geometryUrl).protocol)) return null;
  const observation = latest;
  if (!observation || normalizedDocumentId(observation.documentUrl) !== geometryUrl ||
    retainedDocumentToken(observation.documentIdentity) !== geometryToken ||
    !["observed", "no_evidence"].includes(observation.captureStatus ?? "")) return null;
  const snapshots = bundle.domSnapshots ?? [];
  const boundSnapshots = snapshots.filter(snapshot => snapshot.consentStateAtTime === "pre_consent" &&
    normalizedDocumentId(snapshot.url) === geometryUrl && retainedDocumentToken(snapshot.documentIdentity) === geometryToken);
  if (!boundSnapshots.length) return null;
  if (lane?.executionOutcome === "success" || representativeDegraded)
    return { url: geometryUrl, finalUrl, token: geometryToken, positiveOnly: false };

  // Some older degraded consent lanes have an exact positive control pair but
  // no structural inspection packet. An unbound later recovery on the scan's
  // requested apex/WWW route cannot replace the lane's original document.
  if (!legacyFallbackUrl || !degradedRepresentativeVisit || lanes?.lanes.consent !== "usable" ||
      !rawGeometry || rawGeometry.controlInspection !== undefined ||
      (rawGeometry.documentIdentity as {source?: unknown} | undefined)?.source !== "cdp_loader_id" ||
      access?.status !== "loaded" || typeof access.httpStatus !== "number" || !Number.isInteger(access.httpStatus) ||
      access.httpStatus < 200 || access.httpStatus >= 300) return null;
  const latestSnapshot = [...snapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  const requested = retainedDocumentUrl(bundle.normalizedUrl ?? bundle.url);
  const withoutWww = (url: string) => url.replace(/^https:\/\/www\./, "https://");
  if (!requested || requested !== legacyFallbackUrl || requested === finalUrl || !requested.startsWith("https://") ||
      withoutWww(finalUrl) !== withoutWww(requested) || latestSnapshot?.url !== requested ||
      latestSnapshot.artifactId !== "dom_text_pre_consent_recovery" || latestSnapshot.documentIdentity ||
      latestSnapshot.consentStateAtTime !== "pre_consent") return null;
  if (observation.documentUrl !== finalUrl || observation.documentIdentity?.source !== "cdp_loader_id" ||
      observation.likelyPresent !== true || observation.captureStatus !== "observed" || observation.layerInspected !== "first_layer" ||
      observation.inventoryOutcome !== "complete_with_controls" ||
      !observation.captureDiagnostics?.completedChannels.includes("dom_inventory") ||
      !observation.captureDiagnostics.completedChannels.includes("geometry") ||
      observation.captureDiagnostics.failedChannels.length || observation.captureDiagnostics.timedOutChannels.length) return null;
  const start = Date.parse(bundle.startedAt ?? "");
  const laneStart = Date.parse(lane.startedAt ?? "") - start;
  const laneEnd = Date.parse(lane.completedAt ?? "") - start;
  const geometryAt = Date.parse(typeof rawGeometry.capturedAt === "string" ? rawGeometry.capturedAt : "") - start;
  if (latestSnapshot.capturedAtMs <= laneEnd || !(Math.min(geometryAt, observation.observedAtMs) >= laneStart) ||
      !boundSnapshots.some(snapshot => snapshot.url === finalUrl && snapshot.documentIdentity?.source === "cdp_loader_id" &&
        snapshot.capturedAtMs <= laneEnd && snapshot.capturedAtMs >= Math.max(geometryAt, observation.observedAtMs))) return null;
  const summary = rawGeometry.summary as {limitations?: string[]} | undefined;
  if (!Array.isArray(rawGeometry.candidates) ||
      (Array.isArray(summary?.limitations) && summary.limitations.includes("visible_accessible_intent_conflict")) ||
      !verifiedNarrowGeometry(rawGeometry, bundle.scanId) || hasUnresolvedConsentDecision(rawGeometry) ||
      !hasPairedFirstLayerOptOut(observation, rawGeometry.candidates, finalUrl)) return null;
  return {url: geometryUrl, finalUrl, token: geometryToken, positiveOnly: true};
}

/** Older completed independent recoveries stamped the inventory and geometry
 * with their own loader but omitted it from the recovery text snapshot. Restore
 * only the positive evidence binding when all three checkpoint records agree. */
function retainedOptOutRecoveryToken(
  bundle: CanonicalEvidenceBundle,
  geometry: Record<string, unknown> | null | undefined,
  finalUrl: string | null,
): string | null {
  const snapshot = (bundle.domSnapshots ?? []).reduce<CanonicalEvidenceBundle["domSnapshots"][number] | null>(
    (latest, current) => !latest || current.capturedAtMs > latest.capturedAtMs ? current : latest, null);
  if (snapshot?.artifactId !== "dom_text_pre_consent_recovery" || snapshot.documentIdentity ||
      snapshot.consentStateAtTime !== "pre_consent" || !snapshot.path || !finalUrl ||
      snapshot.url !== finalUrl || geometry?.pageUrl !== finalUrl) return null;

  const observation = (bundle.consentUiObservations ?? []).reduce<CanonicalEvidenceBundle["consentUiObservations"][number] | null>(
    (latest, current) => !latest || current.observedAtMs > latest.observedAtMs ? current : latest, null);
  const identity = geometry.documentIdentity as {source?: unknown} | undefined;
  const token = retainedDocumentToken(identity);
  const access = geometry.access as {status?: unknown; httpStatus?: unknown} | undefined;
  const geometryAt = geometryObservedAtMs(geometry, bundle.startedAt);
  const candidates = geometry.candidates;
  const inspection = consentControlInspectionSchema.safeParse(geometry.controlInspection);
  if (identity?.source !== "cdp_loader_id" || !token || access?.status !== "loaded" ||
      typeof access.httpStatus !== "number" || access.httpStatus < 200 || access.httpStatus >= 300 ||
      !observation || observation.documentUrl !== finalUrl || observation.documentIdentity?.source !== "cdp_loader_id" ||
      observation.documentIdentity.token !== token || observation.captureStatus !== "observed" ||
      observation.inventoryOutcome !== "complete_with_controls" || observation.layerInspected !== "first_layer" ||
      !observation.basis.includes("recovery:independent_consent_capture_completed") ||
      !observation.captureDiagnostics?.completedChannels.includes("dom_inventory") ||
      !observation.captureDiagnostics.completedChannels.includes("geometry") ||
      observation.captureDiagnostics.failedChannels.length || observation.captureDiagnostics.timedOutChannels.length ||
      geometryAt === null || !(observation.observedAtMs <= geometryAt && geometryAt <= snapshot.capturedAtMs) ||
      !observation.evidenceRefs.some(ref => ref.artifactId === snapshot.artifactId && ref.path === snapshot.path) ||
      !observation.evidenceRefs.some(ref => ref.artifactId === "consent_control_geometry" && ref.refId === "consent_control_geometry_evidence" &&
        artifactFileName(ref.path) === "consentcontrolgeometryevidence.json") ||
      !Array.isArray(candidates) || !inspection.success || inspection.data.structuralCoverage !== "complete" ||
      inspection.data.retainedCandidateCount !== candidates.length ||
      new Set(candidates.map(candidate => candidate?.candidateId)).size !== candidates.length) return null;

  // Recheck this positive candidate independently. Legacy roles for unrelated
  // inventory rows can disagree with today's verifier, so they cannot prove absence.
  return hasPairedFirstLayerOptOut(observation, candidates, finalUrl, inspection.data) ? token : null;
}

/** Scope inspection coverage to the independently verified consent document.
 * A runtime-lane 403 or challenge is not evidence that the consent session was
 * blocked. Missing bindings and the consent session's own access failures still
 * use the fail-closed fallback. No stored assessment is repaired on read. */
export function deriveLaneOwnedConsentSurfaceInspection(
  bundle: CanonicalEvidenceBundle, geometry: Record<string, unknown> | null | undefined,
  fallback: Parameters<typeof deriveConsentSurfaceInspectionOutcome>[0],
) {
  const document = verifiedConsentLaneDocument(bundle, geometry);
  const access = geometry?.access as {status?: string; httpStatus?: number} | undefined;
  if (!document || access?.status !== "loaded" || typeof access.httpStatus !== "number" ||
      access.httpStatus >= 400 || consentSessionAccessLimited(bundle, geometry))
    return deriveConsentSurfaceInspectionOutcome(fallback);
  return deriveConsentSurfaceInspectionOutcome({ ...fallback,
    domSnapshots: (bundle.domSnapshots ?? []).filter(snapshot =>
      normalizedDocumentId(snapshot.url) === document.url && retainedDocumentToken(snapshot.documentIdentity) === document.token),
    runtimeCoverage: undefined, scanNoGoDecision: undefined,
  });
}

export function deriveMaterializedConsentControlAssessment(input: {
  bundle: CanonicalEvidenceBundle;
  consentControlGeometryEvidence?: Record<string, unknown> | null;
  consentSurfaceInspection?: ConsentSurfaceInspectionLike | null;
  finalUrl?: string | null;
  noGo: boolean;
  noGoReasonCodes?: string[];
  requestedUrl?: string | null;
  scanId?: string | null;
}): ConsentControlAssessment {
  const fallbackUrl = retainedDocumentUrl(input.finalUrl ?? input.bundle.domSnapshots?.at(-1)?.url ??
    input.bundle.normalizedUrl ?? input.bundle.url);
  const consentLaneDocument = verifiedConsentLaneDocument(input.bundle, input.consentControlGeometryEvidence,
    !input.noGo && (!input.scanId || input.scanId === input.bundle.scanId) ? fallbackUrl : null);
  const consentNoGo = input.noGo && !consentLaneDocument;
  const accessLimited = consentSessionAccessLimited(input.bundle, input.consentControlGeometryEvidence);
  const unresolvedDecision = hasUnresolvedConsentDecision(input.consentControlGeometryEvidence) ||
    hasUnresolvedLegacyFirstLayerDecision(input.consentControlGeometryEvidence, input.bundle);
  const unverifiedAccessibility = [...(input.bundle.consentUiObservations ?? [])].sort((a, b) => b.observedAtMs - a.observedAtMs).slice(0, 1).some((observation) => (observation.controls ?? []).some((control) =>
    (control.tagName === "ax-node" || control.selectorHint?.startsWith("ax:")) &&
    (control.visibilityEvidence !== "box_model_verified" || control.consentContextEvidence !== "local_surface")
  ));
  // Keep the captured URL for exact child-assessment binding. The normalized
  // document ID is only for the existing document/loader comparisons.
  const finalUrl = consentLaneDocument?.finalUrl ?? fallbackUrl;
  const canonicalDocumentId = normalizedDocumentId(finalUrl);
  const requestedUrl = normalizedDocumentId(input.requestedUrl ?? input.bundle.url);
  const observationTimestamp = (observation: { observedAtMs?: unknown }) =>
    typeof observation.observedAtMs === "number" ? observation.observedAtMs : 0;
  const retainedDocumentSnapshots = (input.bundle.domSnapshots ?? [])
    .map((snapshot) => ({
      capturedAtMs: snapshot.capturedAtMs,
      documentId: normalizedDocumentId(snapshot.url),
      documentToken: retainedDocumentToken(snapshot.documentIdentity),
    }))
    .filter((snapshot): snapshot is { capturedAtMs: number; documentId: string; documentToken: string | null } =>
      snapshot.documentId !== null
    )
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs);
  const screenshots = input.bundle.screenshots ?? [];
  const recoveryToken = consentLaneDocument || consentNoGo || accessLimited || (input.scanId && input.scanId !== input.bundle.scanId) ? null :
    retainedOptOutRecoveryToken(input.bundle, input.consentControlGeometryEvidence, finalUrl);
  const canonicalDocumentToken = consentLaneDocument?.token ?? recoveryToken ?? retainedDocumentSnapshots
    .filter((snapshot) => snapshot.documentId === canonicalDocumentId && snapshot.documentToken)
    .at(-1)?.documentToken ?? null;
  const sameUsableScan = !input.noGo && !accessLimited && (!input.scanId || input.scanId === input.bundle.scanId);
  const originalFooterCandidate = sameUsableScan ? boundSameVisitFooter(input.bundle, finalUrl, canonicalDocumentToken, false) : undefined;
  const sameLoaderFooter = originalFooterCandidate?.sameVisitFooter;
  const oneTrustFooterOwners = sameLoaderFooter?.documentToken === canonicalDocumentToken
    ? sameLoaderFooter?.candidates.filter(row => (row.controlWitness === "onetrust_footer_sell_data" ||
      row.controlWitness === "onetrust_reveal_footer_settings" || row.controlWitness === "onetrust_custom_legal_footer_settings") &&
      (row.visibility === "rendered_exposed" || row.visibility === "covered")) : undefined;
  const oneTrustFooterOwner = oneTrustFooterOwners?.length === 1 ? oneTrustFooterOwners[0] : undefined;
  const nonBannerPlacements = verifiedNonBannerPlacements(input.consentControlGeometryEvidence,
    input.bundle.scanId, finalUrl, canonicalDocumentToken);
  const placementGeometry = sameUsableScan ? verifiedOptOutPlacementGeometry(input.consentControlGeometryEvidence,
    input.bundle.scanId,finalUrl,canonicalDocumentToken) : undefined;
  const optOutPlacementCorrections = new Map<string,OptOutPlacementCorrection>();
  const oneTrustFooterPlacement = oneTrustFooterOwner?.controlWitness === "onetrust_reveal_footer_settings" ||
    oneTrustFooterOwner?.controlWitness === "onetrust_custom_legal_footer_settings"
      ? verifiedOneTrustFooterPlacement(placementGeometry,sameLoaderFooter,oneTrustFooterOwner) : undefined;
  if (oneTrustFooterPlacement) optOutPlacementCorrections.set(oneTrustFooterPlacement.geometryCandidateId,oneTrustFooterPlacement);
  const geometry = geometryInput(
    input.consentControlGeometryEvidence, canonicalDocumentId, canonicalDocumentToken, input.bundle.startedAt, input.scanId ?? input.bundle.scanId,
    !input.noGo && !accessLimited && (!input.scanId || input.scanId === input.bundle.scanId) &&
      (input.bundle.consentUiObservations ?? []).some(o => o.layerInspected === "first_layer" &&
        normalizedDocumentId(o.documentUrl) === canonicalDocumentId && o.documentIdentity?.source === "cdp_loader_id" &&
        o.documentIdentity.token === canonicalDocumentToken),
    oneTrustFooterPlacement?.geometryCandidateId,
  );
  // The recovery pair can confirm a sighting even when the older inspection
  // cannot independently verify absence or establish whole-layer coverage.
  if (geometry && (accessLimited || unverifiedAccessibility || recoveryToken)) delete geometry.controlInspection;
  const structuredGeometryBinding = {
    complete: geometry?.assessmentStatus === "complete",
    url: geometry?.documentId ?? "",
    ...(geometry?.documentToken
      ? { documentIdentity: { source: "cdp_loader_id" as const, token: geometry.documentToken } }
      : {}),
  };
  const retainedScreenshots = screenshots.filter(screenshotIsRetainedAndDisplayable);
  const retainedVisualDocumentArtifacts = retainedScreenshots
    .map((screenshot) => ({
      capturedAtMs: screenshot.capturedAtMs,
      documentId: normalizedDocumentId(screenshot.url),
      documentToken: retainedDocumentToken(screenshot.documentIdentity),
    }))
    .filter((artifact): artifact is { capturedAtMs: number; documentId: string; documentToken: string | null } =>
      artifact.documentId !== null
    )
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs);
  const geometryScreenshotRefs = unique([
    typeof input.consentControlGeometryEvidence?.screenshotArtifactRef === "string"
      ? input.consentControlGeometryEvidence.screenshotArtifactRef
      : null,
    ...(Array.isArray(input.consentControlGeometryEvidence?.candidates)
      ? input.consentControlGeometryEvidence.candidates.flatMap((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
          const reference = (candidate as Record<string, unknown>).screenshotArtifactRef;
          return typeof reference === "string" ? [reference] : [];
        })
      : []),
  ].filter((value): value is string => Boolean(value)));
  const representativeScreenshots = screenshots.filter((screenshot) => {
    if (screenshot.consentStateAtTime !== "pre_consent") return false;
    const screenshotToken = retainedDocumentToken(screenshot.documentIdentity);
    const documentMatches = canonicalDocumentToken || screenshotToken
      ? Boolean(canonicalDocumentToken && canonicalDocumentToken === screenshotToken)
      : normalizedDocumentId(screenshot.url) === canonicalDocumentId;
    return documentMatches && (geometryScreenshotRefs.length === 0 || geometryScreenshotRefs.some((reference) =>
      artifactFileName(reference) === artifactFileName(screenshot.path)
    ));
  });
  const availableRepresentativeScreenshots = representativeScreenshots.filter(screenshotIsRetainedAndDisplayable);
  const representativeConsentScreenshotAvailable = availableRepresentativeScreenshots.length > 0;
  const withheldScreenshots = representativeScreenshots.filter((screenshot) => !screenshotIsRetainedAndDisplayable(screenshot));
  const visualEvidence: NonNullable<ConsentControlAssessmentInput["visualEvidence"]> = {
    status: representativeConsentScreenshotAvailable ? "available" : withheldScreenshots.length > 0 ? "withheld" : "unavailable",
    artifactRefs: availableRepresentativeScreenshots.map((screenshot) => screenshot.artifactId).slice(0, 24),
    reasonCodes: representativeConsentScreenshotAvailable ? [] : unique([
      "representative_consent_screenshot_unavailable",
      ...withheldScreenshots.flatMap((screenshot) => [screenshot.safetyFailureCode, screenshot.withheldReason, screenshot.displayWithheldReason])
        .filter((reason): reason is NonNullable<typeof reason> => Boolean(reason)),
    ]).slice(0, 16),
  };
  // A comparison may only use its own retained, display-safe pre-consent image.
  if (geometry?.visualComparison && !availableRepresentativeScreenshots.some(screenshot =>
    artifactFileName(screenshot.path) === artifactFileName(geometry.visualComparison!.screenshotArtifactRef) &&
    Math.abs((geometry.observedAtMs ?? -Infinity) - screenshot.capturedAtMs) === geometry.visualComparison!.captureSkewMs)) {
    delete geometry.visualComparison;
  }
  const isCompletedTypedFirstLayerInventory = (
    observation: CanonicalEvidenceBundle["consentUiObservations"][number],
  ) => {
    const controls = observation.controls ?? [];
    const completedChannels = observation.captureDiagnostics?.completedChannels ?? [];
    const timedOutChannels = observation.captureDiagnostics?.timedOutChannels ?? [];
    const failedChannels = observation.captureDiagnostics?.failedChannels ?? [];
    const terminalVerifiedPacket = isVerifiedTerminalConsentPacket(observation, {
      expectedDocumentUrl: canonicalDocumentId,
      expectedDocumentIdentity: canonicalDocumentToken
        ? { source: "cdp_loader_id", token: canonicalDocumentToken }
        : undefined,
      structuredGeometry: structuredGeometryBinding,
    });
    const finalInventoryIncomplete = !terminalVerifiedPacket && (observation.basis ?? []).some((basis) =>
      basis === "recapture:paired_settled_frame_inventory_incomplete" ||
      basis === "recapture:post_settle_inventory_incomplete" ||
      basis === "recapture:post_settled_screenshot_inventory_incomplete" ||
      basis === "recapture:post_settle_inventory_budget_unavailable" ||
      basis === "recapture:immediate_timeout_recovery_budget_unavailable"
    );
    const blockingInaccessibleFrame =
      observation.inventoryOutcome === "frame_inaccessible" ||
      (observation.inventoryDiagnostics?.blockingInaccessibleFrameCount ?? 0) > 0;
    if (finalInventoryIncomplete || blockingInaccessibleFrame) return false;
    const completedTypedChannel = (["dom_inventory", "accessibility_tree"] as const).some((channel) =>
      completedChannels.includes(channel) &&
      !timedOutChannels.includes(channel) &&
      !failedChannels.includes(channel)
    );
    const legacyTypedChannelComplete =
      completedChannels.length === 0 &&
      timedOutChannels.length === 0 &&
      failedChannels.length === 0 &&
      (observation.basis ?? []).some((basis) =>
        /(?:^|:)(?:rapid|first_layer|accessibility_tree|dom_inventory|viewport)/i.test(basis)
      );
    const completedEmptyFirstLayerInventory =
      controls.length === 0 &&
      (
        observation.inventoryOutcome === "complete_empty" ||
        (observation.basis ?? []).includes("settled_control_inventory_completed")
      ) &&
      completedTypedChannel;
    const completedPositiveFirstLayerInventory =
      observation.captureStatus === "observed" &&
      observation.likelyPresent === true &&
      observation.layerInspected === "first_layer" &&
      controls.length > 0 &&
      (completedTypedChannel || legacyTypedChannelComplete);
    return (
      completedPositiveFirstLayerInventory ||
      (
        completedEmptyFirstLayerInventory &&
        (observation.captureStatus === "observed" || observation.captureStatus === "no_evidence")
      )
    ) && controls.every((control) =>
      control.visible === true &&
      (
        control.actionType !== "other" ||
        control.semanticRole === "dismiss" ||
        retainedControlVariant(control.classifierReasonCodes) !== null
      ) &&
      (control.layer ?? observation.layerInspected) === "first_layer"
    );
  };
  const typedFirstLayerInventoryIndexes = (input.bundle.consentUiObservations ?? [])
    .map((observation, index) => ({ index, observation }))
    .filter(({ observation }) => isCompletedTypedFirstLayerInventory(observation))
    .sort((left, right) => observationTimestamp(right.observation) - observationTimestamp(left.observation))
    .map(({ index }) => index);
  const hasTypedFirstLayerInventory = typedFirstLayerInventoryIndexes.length > 0;
  // A consent UI observation can be retained without a DOM snapshot. When
  // every retained pre-consent visual artifact points at the same document,
  // use that URL only to bind the already-typed control inventory to the
  // redirected document. Do not classify controls from the screenshot.
  const retainedVisualDocumentIds = hasTypedFirstLayerInventory
    ? unique(retainedVisualDocumentArtifacts.map((artifact) => artifact.documentId))
    : [];
  const singleRetainedVisualDocumentId = retainedVisualDocumentIds.length === 1
    ? retainedVisualDocumentIds[0] ?? null
    : null;
  const observations: ConsentControlAssessmentInput["observations"] = (input.bundle.consentUiObservations ?? []).map((observation) => {
    const explicitObservationDocumentUrlRetained = typeof observation.documentUrl === "string";
    const explicitObservationDocumentId = normalizedDocumentId(observation.documentUrl);
    const observationDocumentToken = retainedDocumentToken(observation.documentIdentity);
    const tokenBoundToCanonicalDocument = Boolean(
      canonicalDocumentToken && observationDocumentToken === canonicalDocumentToken,
    );
    const closestPriorDocumentArtifact = [
      ...retainedDocumentSnapshots,
      ...retainedVisualDocumentArtifacts,
    ]
      .filter((artifact) => artifact.capturedAtMs <= observationTimestamp(observation))
      .sort((left, right) => left.capturedAtMs - right.capturedAtMs)
      .at(-1)?.documentId ?? null;
    const observationDocumentId =
      tokenBoundToCanonicalDocument
        ? canonicalDocumentId
        : explicitObservationDocumentUrlRetained
        ? explicitObservationDocumentId
        : singleRetainedVisualDocumentId ??
          closestPriorDocumentArtifact ??
          (retainedDocumentSnapshots.length === 1 ? retainedDocumentSnapshots[0]?.documentId : null) ??
          null;
    const completedEmptyFirstLayerInventory =
      (observation.controls?.length ?? 0) === 0 &&
      (observation.basis ?? []).includes("settled_control_inventory_completed") &&
      (observation.captureDiagnostics?.completedChannels ?? []).some((channel) =>
        channel === "dom_inventory" || channel === "accessibility_tree"
      );
    const retainedLayer = observation.layerInspected === "first_layer" || completedEmptyFirstLayerInventory
      ? "first_layer" as const
      : observation.layerInspected;
    return {
      observationId: observation.observationId,
      ...(observation.captureDiagnostic ? {captureDiagnostic: observation.captureDiagnostic} : {}),
      observedAtMs: observationTimestamp(observation),
      likelyPresent: observation.likelyPresent,
      layerInspected: retainedLayer,
      documentId: observationDocumentId,
      documentToken: observationDocumentToken,
      captureStatus: observation.captureStatus,
      inventoryOutcome: observation.inventoryOutcome,
      completedChannels: observation.captureDiagnostics?.completedChannels,
      incompleteChannels: [
        ...(observation.captureDiagnostics?.timedOutChannels ?? []),
        ...(observation.captureDiagnostics?.failedChannels ?? []),
      ],
      evidenceRefs: (observation.evidenceRefs ?? []).map((reference) => reference.refId),
      controls: (observation.controls ?? []).flatMap((control) => {
        if ((control.tagName === "ax-node" || control.selectorHint?.startsWith("ax:")) &&
          (control.visibilityEvidence !== "box_model_verified" || control.consentContextEvidence !== "local_surface")) return [];
        const evidenceId = control.artifactRef ?? `${observation.observationId}:${control.label}`;
        const boundObservation = observation.documentIdentity?.source === "cdp_loader_id" &&
          observationDocumentToken === canonicalDocumentToken && observation.documentUrl === finalUrl;
        const correction = boundObservation && (control.layer ?? retainedLayer) === "first_layer"
          ? correctedOptOutPlacement(placementGeometry,control,observation.controls ?? [],evidenceId) : undefined;
        if (correction && optOutPlacementCorrections.size < 24)
          optOutPlacementCorrections.set(correction.geometryCandidateId,correction);
        const placement = control.selectorHint ? nonBannerPlacements.get(control.selectorHint) : undefined;
        const boundBelowViewport = control.actionType === "do_not_sell_share" && placement &&
          placement.tagName === control.tagName && placement.label === control.label &&
          observation.documentIdentity?.source === "cdp_loader_id" && observationDocumentToken === canonicalDocumentToken &&
          observation.documentUrl === finalUrl;
        const boundFooterSale = oneTrustFooterOwner && control.actionType === "do_not_sell_share" &&
          control.selectorHint === ONETRUST_FOOTER_SETTINGS_ID_SELECTOR && control.tagName === "button" &&
          normalizedPlacementLabel(control.label) === normalizedPlacementLabel(oneTrustFooterOwner.label) && boundObservation;
        const layer = correction || boundBelowViewport || boundFooterSale || control.presentationType === "persistent_link" || control.placementType === "persistent_surface"
          ? "deeper_layer" as const
          : control.layer ?? retainedLayer;
        const actionType = retainedActionType(control.actionType, control.classifierReasonCodes);
        const controlVariant = retainedControlVariant(control.classifierReasonCodes);
        const candidate: ConsentControlAssessmentCandidate = {
          tagName: control.tagName,
          role: control.role,
          semanticallyInteractive: control.semanticallyInteractive,
          consentContextEvidence: control.consentContextEvidence,
          evidenceId,
          actionType,
          controlVariant,
          semanticRole: control.semanticRole,
          label: control.label,
          locale: control.matchedLocale,
          matchedTerm: control.matchedTerm,
          matchStrength: control.matchStrength,
          classifierRegistryVersion: control.classifierRegistryVersion,
          classifierReasonCodes: control.classifierReasonCodes,
          presentationType: control.presentationType,
          placementType: control.placementType,
          layer,
          visible: control.visible,
          actionable:
            control.visible === true &&
            (actionType !== "other" || control.semanticRole === "dismiss" || controlVariant !== null),
          observedAtMs: observationTimestamp(observation),
          documentId: observationDocumentId,
          documentToken: observationDocumentToken,
          channels: observation.captureDiagnostics?.completedChannels,
          artifactRefs: ["CanonicalEvidenceBundle.json", ...(control.artifactRef ? [control.artifactRef] : [])],
        };
        const savesAllOptionalDefaultsOff =
          layer === "first_layer" &&
          control.visible === true &&
          actionType === "save_preferences" &&
          (
            (
              observation.defaultToggleStatesObserved === true &&
              observation.nonEssentialDefaultsOff === true
            ) ||
            observation.necessaryPreferenceSelectionObserved === true
          ) &&
          (observation.precheckedOptionalPurposeCount ?? 0) === 0;
        if (!savesAllOptionalDefaultsOff) {
          return [candidate];
        }
        return [
          candidate,
          {
            ...candidate,
            evidenceId: `${evidenceId}:necessary-only-defaults`,
            semanticRole: "necessary_only",
            classifierReasonCodes: unique([
              ...(candidate.classifierReasonCodes ?? []),
              observation.defaultToggleStatesObserved === true
                ? "save_preferences_with_all_optional_defaults_off"
                : "save_preferences_with_necessary_selection_observed",
            ]),
          },
        ];
      }),
    };
  });
  const typedFirstLayerInventoryIndex =
    typedFirstLayerInventoryIndexes.find((index) =>
      Boolean(canonicalDocumentId && observations[index]?.documentId === canonicalDocumentId)
    ) ??
    typedFirstLayerInventoryIndexes[0] ??
    null;
  const typedFirstLayerInventoryObservation = typedFirstLayerInventoryIndex === null
    ? null
    : input.bundle.consentUiObservations[typedFirstLayerInventoryIndex] ?? null;
  const typedFirstLayerProjectedObservation = typedFirstLayerInventoryIndex === null
    ? null
    : observations[typedFirstLayerInventoryIndex] ?? null;
  // Once a completed inventory is explicitly attributable to the canonical
  // final document, earlier redirect-document observations are historical
  // context, not contradictory evidence about the final page.
  const assessmentObservations =
    canonicalDocumentId && typedFirstLayerProjectedObservation?.documentId === canonicalDocumentId
      ? observations.filter((observation) => observation.documentId === canonicalDocumentId)
      : observations;
  const retainedInspection = input.bundle.consentSurfaceInspection;
  // Geometry may resolve missing auxiliary evidence, but cannot erase access,
  // partial inventory or document limitations retained by the consent lane.
  const blockingRetainedInspection = retainedInspection?.coverageStatus !== "complete" &&
    retainedInspection?.limitationKeys?.some((key) => ![
      "cmp_runtime_without_actionable_surface", "consent_surface_inspection_settled_inventory_missing",
    ].includes(key));
  const inspection = blockingRetainedInspection ? retainedInspection : input.consentSurfaceInspection ?? retainedInspection ?? null;
  const semanticCoverageLimited = unresolvedDecision || unverifiedAccessibility || accessLimited ||
    Boolean(recoveryToken || consentLaneDocument?.positiveOnly);
  const inspectionChannels = inspection?.evidenceChannels ?? [];
  const completedChannels: ConsentControlAssessmentChannel[] = unique([
    ...assessmentObservations.flatMap((observation) => observation.completedChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "observed")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "complete" ? ["geometry" as const] : []),
  ]).filter((channel) => channel !== "screenshot");
  const incompleteChannels = unique([
    ...assessmentObservations.flatMap((observation) => observation.incompleteChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "inspection_incomplete")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "incomplete" ? ["geometry" as const] : []),
  ]).filter((channel) => channel !== "screenshot");
  const observedDocumentIds = unique([
    ...assessmentObservations
      .filter((observation) =>
        (observation.controls?.length ?? 0) > 0 ||
        (
          observation.observationId === typedFirstLayerProjectedObservation?.observationId &&
          observation.observedAtMs === typedFirstLayerProjectedObservation.observedAtMs
        )
      )
      .map((observation) => observation.documentId)
      .filter((value): value is string => Boolean(value)),
    ...retainedDocumentSnapshots
      .map((snapshot) => snapshot.documentId)
      .filter((documentId) => documentId === canonicalDocumentId),
    ...retainedVisualDocumentArtifacts
      .map((artifact) => artifact.documentId)
      .filter((documentId) => documentId === canonicalDocumentId),
  ]);
  const primaryObservedDocumentTokens = unique(assessmentObservations
    .filter((observation) =>
      (observation.controls?.length ?? 0) > 0 ||
      (
        observation.observationId === typedFirstLayerProjectedObservation?.observationId &&
        observation.observedAtMs === typedFirstLayerProjectedObservation.observedAtMs
      )
    )
    .map((observation) => observation.documentToken)
    .filter((token): token is string => Boolean(token)));
  // Geometry is an auxiliary evidence source with its own document binding.
  // A mismatched geometry packet must remain limited and excluded from the
  // canonical evidence set, but it must not poison otherwise same-document
  // typed bundle evidence. deriveConsentControlAssessment retains the
  // geometry mismatch limitation and contradiction independently.
  const documentIdentityStatus =
    canonicalDocumentToken && primaryObservedDocumentTokens.length > 0
      ? primaryObservedDocumentTokens.some((token) => token !== canonicalDocumentToken)
        ? "mismatched"
        : "matched"
      : Boolean(canonicalDocumentId && observedDocumentIds.some((documentId) => documentId !== canonicalDocumentId))
      ? "mismatched"
      : canonicalDocumentId && observedDocumentIds.length > 0
        ? "matched"
        : "unknown";
  // The coordinator's inspection result is authoritative for negative
  // first-layer conclusions. A typed observation may retain directly
  // observed controls even when another required channel is limited, but it
  // must not turn an explicitly limited inspection into a complete inventory
  // or convert missing controls to `not_observed`.
  const latestInventory = (input.bundle.consentUiObservations ?? []).slice()
    .sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
  const loadingEmptyInventory = latestInventory?.documentReadyState === "loading" &&
    latestInventory.controls.length === 0;
  const coordinatorInspectionComplete = !semanticCoverageLimited && !loadingEmptyInventory && (!inspection || (
    inspection.inspectionCompleted === true &&
    inspection.coverageStatus === "complete"
  ));
  const unresolvedAdaptivePartialInventory = hasUnresolvedAdaptivePartialConsentInventory(
    input.bundle.consentUiObservations ?? [],
    {
      expectedDocumentUrl: canonicalDocumentId,
      expectedDocumentIdentity: canonicalDocumentToken
        ? { source: "cdp_loader_id", token: canonicalDocumentToken }
        : undefined,
      structuredGeometry: structuredGeometryBinding,
    },
  );
  const typedFirstLayerInventoryComplete =
    hasTypedFirstLayerInventory &&
    coordinatorInspectionComplete &&
    !unresolvedAdaptivePartialInventory;
  const explicitlyCompletedTypedInventoryChannels = (typedFirstLayerInventoryObservation?.captureDiagnostics?.completedChannels ?? [])
    .filter((channel): channel is "dom_inventory" | "accessibility_tree" =>
      channel === "dom_inventory" || channel === "accessibility_tree"
    );
  const retainedTypedInventoryChannels =
    explicitlyCompletedTypedInventoryChannels.length > 0
      ? explicitlyCompletedTypedInventoryChannels
      : typedFirstLayerInventoryObservation?.basis?.some((basis) => /accessibility_tree/i.test(basis))
        ? ["accessibility_tree" as const]
        : ["dom_inventory" as const];
  const baseRequiredChannels = typedFirstLayerInventoryComplete
    ? retainedTypedInventoryChannels
    : REQUIRED_CHANNELS;
  const requiredChannels = baseRequiredChannels;
  const coverageComplete =
    !semanticCoverageLimited &&
    !consentNoGo &&
    !loadingEmptyInventory &&
    !unresolvedAdaptivePartialInventory &&
    documentIdentityStatus === "matched" &&
    (
      typedFirstLayerInventoryComplete ||
      (
        inspection?.inspectionCompleted === true &&
        inspection.coverageStatus === "complete" &&
        REQUIRED_CHANNELS.every((channel) => completedChannels.includes(channel)) &&
        incompleteChannels.length === 0
      )
    );
  const verifiedInspectionComplete =
    !semanticCoverageLimited &&
    !loadingEmptyInventory &&
    !unresolvedAdaptivePartialInventory &&
    inspection?.inspectionCompleted === true &&
    inspection.coverageStatus === "complete";
  const surfaceStatus =
    verifiedInspectionComplete && inspection?.outcome === "actionable_surface_observed"
      ? "observed_actionable"
      : verifiedInspectionComplete && inspection?.outcome === "non_actionable_surface_observed"
        ? "observed_non_actionable"
        : verifiedInspectionComplete && inspection?.outcome === "no_surface_observed_complete_coverage"
          ? "not_observed"
          : typedFirstLayerInventoryComplete && (typedFirstLayerInventoryObservation?.controls.length ?? 0) > 0
            ? "observed_actionable"
            : typedFirstLayerInventoryComplete && typedFirstLayerInventoryObservation?.likelyPresent === true
              ? "observed_non_actionable"
              : typedFirstLayerInventoryComplete &&
                  typedFirstLayerInventoryObservation?.captureStatus === "no_evidence" &&
                  typedFirstLayerInventoryObservation.likelyPresent === false
                ? "not_observed"
          : "unknown";

  const originalFooter = documentIdentityStatus === "matched" ? originalFooterCandidate
    : sameUsableScan ? boundSameVisitFooter(input.bundle, finalUrl, null, documentIdentityStatus === "mismatched") : undefined;
  return deriveConsentControlAssessment({
    ...originalFooter,
    optOutPlacementCorrections:[...optOutPlacementCorrections.values()],
    originalOptOutSwitches: sameUsableScan && documentIdentityStatus === "matched"
      ? boundOriginalOptOutSwitches(input.bundle, finalUrl, canonicalDocumentToken) : undefined,
    originalOptOutSettings: sameUsableScan && documentIdentityStatus === "matched"
      ? boundOriginalOptOutSettings(input.bundle, finalUrl, canonicalDocumentToken) : undefined,
    optOutTimingLimitation: sameUsableScan ? optOutTimingLimitation(input.bundle, input.consentControlGeometryEvidence, finalUrl, canonicalDocumentToken, geometry) : undefined,
    optOutFooterInspection: sameUsableScan ? footerInspection(input.bundle, finalUrl) : undefined,
    optOutFooterLinks: sameUsableScan && documentIdentityStatus === "matched" ? observedFooterLinks(input.bundle, finalUrl, originalFooter?.sameVisitFooter) : [],
    cmpAudit: deriveCmpAuditAssessment(input.bundle, input.consentControlGeometryEvidence),
    visualEvidence,
    scan: {
      scanId: input.scanId ?? input.bundle.scanId,
      requestedUrl,
      finalUrl,
      scanStatus: "completed",
      noGo: consentNoGo,
      noGoReasonCodes: consentLaneDocument && !accessLimited ? [] : input.noGoReasonCodes,
    },
    document: {
      canonicalDocumentId,
      observedDocumentIds,
      canonicalDocumentToken,
      observedDocumentTokens: primaryObservedDocumentTokens,
      identityStatus: documentIdentityStatus,
    },
    observations: assessmentObservations,
    geometry,
    surface: {
      status: surfaceStatus,
      firstObservedAtMs: surfaceStatus.startsWith("observed_") ? inspection?.observedAtMs ?? null : null,
      lastObservedAtMs: surfaceStatus.startsWith("observed_") ? inspection?.observedAtMs ?? null : null,
      evidenceRefs: [],
    },
    coverage: {
      status: consentNoGo ? "none" : coverageComplete ? "complete" : "limited",
      requiredChannels,
      completedChannels,
      incompleteChannels,
      reasonCodes: unique([
        ...(inspection?.limitationKeys ?? []),
        CONSENT_CONTROL_CAPTURE_POLICY_VERSION,
        ...(unresolvedDecision ? [UNRESOLVED_CONSENT_DECISION] : []),
        ...(unverifiedAccessibility ? ["accessibility_control_proof_unverified"] : []),
        ...(accessLimited ? ["consent_session_access_limited"] : []),
        ...(loadingEmptyInventory ? ["consent_surface_inspection_document_still_loading"] : []),
        ...(!coverageComplete && !consentNoGo ? ["canonical_consent_coverage_incomplete"] : []),
      ]),
    },
    source: {
      bundleVersion: input.bundle.schemaVersion,
      geometryVersion: geometry?.artifactVersion ?? null,
      computedAt: input.bundle.completedAt,
    },
  });
}

export function deriveWs01ConsentControlAssessment(input: {
  completedAt?: string | null;
  firstLayerConsentChoices: Record<string, unknown> | null | undefined;
  requestedUrl?: string | null;
  scanId: string;
  scanStatus: string;
}): ConsentControlAssessment | null {
  const choices = input.firstLayerConsentChoices;
  if (!choices) return null;
  const documentId = normalizedDocumentId(
    typeof choices.documentUrl === "string"
      ? choices.documentUrl
      : typeof choices.document_url === "string"
        ? choices.document_url
        : null,
  );
  const capturedBeforeInteraction = choices.capturedBeforeInteraction === true ||
    choices.captured_before_interaction === true;
  const inventoryComplete = choices.controlInventoryComplete === true ||
    choices.control_inventory_complete === true;
  const layerInspected = choices.layerInspected === "first_layer" ||
    choices.layer_inspected === "first_layer";
  const sameSurface = choices.sameSurfaceCandidates === true ||
    choices.same_surface_candidates === true;
  if (!documentId || !capturedBeforeInteraction || !inventoryComplete || !layerInspected || !sameSurface) {
    return null;
  }

  const rawChoices = Array.isArray(choices.normalizedChoices)
    ? choices.normalizedChoices
    : Array.isArray(choices.normalized_choices)
      ? choices.normalized_choices
      : [];
  const controls = rawChoices.flatMap((value, index): ConsentControlAssessmentCandidate[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    if (row.sameSurface !== true && row.same_surface !== true) return [];
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 120) : "";
    if (!label) return [];
    const action = typeof row.action === "string" ? row.action : "unknown";
    const intent: ConsentControlAssessmentCandidate["intent"] =
      action === "accept" ? "accept" :
      action === "reject" ? "reject" :
      action === "settings" ? "options" :
      action === "dismiss" ? "dismiss" : "other";
    const actionType: ConsentControlAssessmentCandidate["actionType"] =
      action === "accept" ? "accept_all" :
      action === "reject" ? "reject_all" :
      action === "settings" ? "manage_preferences" : "other";
    return [{
      evidenceId: `ws01:first-layer:${index}:${label.toLowerCase()}`,
      intent,
      semanticRole: action === "dismiss" ? "dismiss" : undefined,
      actionType,
      label,
      layer: "first_layer",
      visible: true,
      actionable: true,
      observedAtMs: typeof choices.capturedAtMs === "number"
        ? Math.max(0, Math.round(choices.capturedAtMs))
        : typeof choices.captured_at_ms === "number"
          ? Math.max(0, Math.round(choices.captured_at_ms))
          : 0,
      documentId,
      channels: ["dom_inventory"],
      artifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
    }];
  });
  // A complete empty array is meaningful negative evidence. A non-empty array
  // whose rows cannot be validated is malformed evidence and must fail closed.
  if (rawChoices.length > 0 && controls.length === 0) return null;
  const requestedUrl = normalizedDocumentId(input.requestedUrl) ?? documentId;
  const observedAtMs = controls[0]?.observedAtMs ??
    (typeof choices.capturedAtMs === "number"
      ? Math.max(0, Math.round(choices.capturedAtMs))
      : typeof choices.captured_at_ms === "number"
        ? Math.max(0, Math.round(choices.captured_at_ms))
        : 0);
  const completedEmptyInventory = controls.length === 0;
  return deriveConsentControlAssessment({
    scan: {
      scanId: input.scanId,
      requestedUrl,
      finalUrl: documentId,
      scanStatus: input.scanStatus,
      noGo: false,
    },
    document: {
      canonicalDocumentId: documentId,
      observedDocumentIds: [documentId],
      identityStatus: "matched",
    },
    observations: [{
      observationId: "ws01-first-layer-consent-choices",
      observedAtMs,
      likelyPresent: !completedEmptyInventory,
      layerInspected: "first_layer",
      documentId,
      captureStatus: completedEmptyInventory ? "no_evidence" : "observed",
      inventoryOutcome: completedEmptyInventory ? "complete_empty" : "complete_with_controls",
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
      evidenceRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
      controls,
    }],
    surface: {
      status: completedEmptyInventory ? "not_observed" : "observed_actionable",
      firstObservedAtMs: observedAtMs,
      lastObservedAtMs: observedAtMs,
      evidenceRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
    },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory"],
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
      reasonCodes: ["ws01_complete_first_layer_control_inventory"],
    },
    source: {
      bundleVersion: "ws01.hybrid_runtime_evidence.v1",
      projectorVersion: "2.1.0-ws01",
      computedAt: input.completedAt ?? new Date(0).toISOString(),
    },
  });
}

export function projectAssessmentCompatibility(assessment: ConsentControlAssessment) {
  const compatibilityState = (key: "accept" | "reject" | "options") =>
    assessment.controls[key].state === "observed"
      ? true
      : assessment.controls[key].state === "not_observed"
        ? false
        : null;
  return {
    accept: compatibilityState("accept"),
    reject: compatibilityState("reject"),
    options: compatibilityState("options"),
  };
}
