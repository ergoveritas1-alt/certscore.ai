import type { ConsentUiObservation } from "@certscore/contracts";
import { DRUPAL_NO_THANKS_REJECT_CONTROL, verifyConsentControlInspection } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

export const CONSENT_GEOMETRY_FRAME_LIMIT = 12;
export const DRUPAL_OVERFLOW_FRAME_LIMIT = 32;
export const DRUPAL_CMP = DRUPAL_NO_THANKS_REJECT_CONTROL.cmpId;
export const DRUPAL_ACCEPT_SELECTOR = "button.agree-button";
export const DRUPAL_ACCEPT_RECIPE = `canonical-cmp:${DRUPAL_CMP}:accept:v2`;
export const DRUPAL_ACCEPT_BANNER_SELECTOR = "#sliding-popup .eu-cookie-compliance-banner #popup-buttons button.agree-button";

export type DrupalOverflowGeometry<Action extends "accept" | "reject" = "accept"> = {
  version: `drupal_overflow_${Action}_geometry.v1`;
  documentToken: string;
  capturedAt: string;
  nonRenderedFrameCount: number;
};

/** Only an independently named positive control can schedule overflow recovery. */
export function drupalScopedCandidate(geometry: ConsentControlGeometryArtifact, action: "accept" | "reject") {
  if (!Array.isArray(geometry.containers) || !geometry.cmp?.detections?.some(cmp => cmp.canonicalName === DRUPAL_CMP) ||
      !geometry.containers.some(container => container?.selectorHint === "#sliding-popup" &&
        container.layer === "first_layer" && container.intersectsViewport)) return undefined;
  const controls = geometry.candidates.filter(candidate => candidate.layer === "first_layer" &&
    candidate.actionType === `${action}_all` && candidate.decisionStatus === "confirmed_visible");
  const control = controls[0];
  const reject = DRUPAL_NO_THANKS_REJECT_CONTROL;
  if (controls.length !== 1 || !control || control.selectorHint !== (action === "accept" ? DRUPAL_ACCEPT_SELECTOR : reject.controlSelector) ||
      control.tagName !== "button" || control.frameContext?.frameKind !== "main_frame" ||
      control.frameContext.frameUrl !== geometry.pageUrl ||
      (control.containerSelectorHint !== "#popup-buttons" && control.containerSelectorHint !== "#sliding-popup div.eu-cookie-compliance-banner") ||
      control.label !== (action === "accept" ? "Accept" : reject.label) || control.ariaLabel || control.title || control.value ||
      !control.enabled || !control.intersectsViewport || !control.occlusion?.center ||
      control.consentContextConfirmed !== true ||
      (action === "accept" ? control.exactNativeAcceptSelectorVerified : control.exactNativeRejectSelectorVerified) !== true) return undefined;
  return control;
}

export function drupalOverflowObservationMatches(observation: ConsentUiObservation, geometry: ConsentControlGeometryArtifact, action: "accept" | "reject" = "accept") {
  const candidate = drupalScopedCandidate(geometry, action);
  return Boolean(candidate && observation.documentUrl === geometry.pageUrl &&
    observation.documentIdentity?.source === "cdp_loader_id" && geometry.documentIdentity?.source === "cdp_loader_id" &&
    observation.documentIdentity.token === geometry.documentIdentity.token && observation.captureStatus === "observed" &&
    observation.layerInspected === "first_layer" && !observation.inventoryDiagnostics?.blockingInaccessibleFrameCount &&
    observation.captureDiagnostics?.completedChannels.includes("dom_inventory") &&
    !observation.captureDiagnostics.failedChannels.length && !observation.captureDiagnostics.timedOutChannels.length &&
    observation.controls.filter(control => control.actionType === `${action}_all` && control.visible).length === 1 &&
    observation.controls.some(control => control.actionType === `${action}_all` && control.visible &&
      control.selectorHint === candidate.selectorHint && control.label === candidate.label && control.tagName === "button"));
}

/** Extends positive coverage for the specified control. The canonical inspection stays limited. */
export function hasVerifiedDrupalOverflowGeometry(geometry: ConsentControlGeometryArtifact, action: "accept" | "reject" = "accept"): boolean {
  const proof = action === "accept" ? geometry.drupalOverflowGeometry : geometry.drupalOverflowRejectGeometry;
  if (!proof || proof.version !== `drupal_overflow_${action}_geometry.v1`) return false;
  const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
  if (!inspection ||
      inspection.structuralCoverage !== "limited" || geometry.documentIdentity?.source !== "cdp_loader_id" ||
      proof.documentToken !== geometry.documentIdentity.token || proof.capturedAt !== geometry.capturedAt ||
      !Number.isFinite(Date.parse(proof.capturedAt)) || geometry.captureTiming?.version !== "consent_geometry_capture_timing.v1" ||
      geometry.captureTiming.mainFrameCompletedAt !== proof.capturedAt ||
      !Number.isFinite(Date.parse(geometry.captureTiming.completedAt)) ||
      Date.parse(geometry.captureTiming.completedAt) < Date.parse(proof.capturedAt) || !drupalScopedCandidate(geometry, action)) return false;
  const coverage = inspection.captureCoverage;
  return coverage.documentReadyState === "complete" && coverage.mainFrameAvailable && !coverage.inventoryTruncated &&
    coverage.frameCount > CONSENT_GEOMETRY_FRAME_LIMIT && coverage.frameCount <= DRUPAL_OVERFLOW_FRAME_LIMIT &&
    coverage.capturedFrameCount === CONSENT_GEOMETRY_FRAME_LIMIT &&
    proof.nonRenderedFrameCount === coverage.frameCount - coverage.capturedFrameCount;
}
