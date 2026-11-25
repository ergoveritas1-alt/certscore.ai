import type { ConsentUiObservation } from "@certscore/contracts";
import { verifyConsentControlInspection } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

export const CONSENT_GEOMETRY_FRAME_LIMIT = 12;
export const DRUPAL_OVERFLOW_FRAME_LIMIT = 32;
export const DRUPAL_CMP = "Drupal EU Cookie Compliance module, non-TCF";
export const DRUPAL_ACCEPT_SELECTOR = "button.agree-button";
export const DRUPAL_ACCEPT_RECIPE = `canonical-cmp:${DRUPAL_CMP}:accept:v2`;
export const DRUPAL_ACCEPT_BANNER_SELECTOR = "#sliding-popup .eu-cookie-compliance-banner #popup-buttons button.agree-button";

export type DrupalOverflowGeometry = {
  version: "drupal_overflow_accept_geometry.v1";
  documentToken: string;
  capturedAt: string;
  nonRenderedFrameCount: number;
};

/** Only an independently named positive control can schedule overflow recovery. */
export function drupalOverflowAcceptCandidate(geometry: ConsentControlGeometryArtifact) {
  if (!Array.isArray(geometry.containers) || !geometry.cmp?.detections?.some(cmp => cmp.canonicalName === DRUPAL_CMP) ||
      !geometry.containers.some(container => container?.selectorHint === "#sliding-popup" &&
        container.layer === "first_layer" && container.intersectsViewport)) return undefined;
  const controls = geometry.candidates.filter(candidate => candidate.layer === "first_layer" &&
    candidate.actionType === "accept_all" && candidate.decisionStatus === "confirmed_visible");
  const control = controls[0];
  if (controls.length !== 1 || !control || control.selectorHint !== DRUPAL_ACCEPT_SELECTOR ||
      control.tagName !== "button" || control.frameContext?.frameKind !== "main_frame" ||
      control.frameContext.frameUrl !== geometry.pageUrl ||
      (control.containerSelectorHint !== "#popup-buttons" && control.containerSelectorHint !== "#sliding-popup div.eu-cookie-compliance-banner") ||
      control.label !== "Accept" || control.ariaLabel || control.title || control.value ||
      !control.enabled || !control.intersectsViewport || !control.occlusion?.center ||
      control.consentContextConfirmed !== true || control.exactNativeAcceptSelectorVerified !== true) return undefined;
  return control;
}

export function drupalOverflowObservationMatches(observation: ConsentUiObservation, geometry: ConsentControlGeometryArtifact) {
  const candidate = drupalOverflowAcceptCandidate(geometry);
  return Boolean(candidate && observation.documentUrl === geometry.pageUrl &&
    observation.documentIdentity?.source === "cdp_loader_id" && geometry.documentIdentity?.source === "cdp_loader_id" &&
    observation.documentIdentity.token === geometry.documentIdentity.token && observation.captureStatus === "observed" &&
    observation.layerInspected === "first_layer" && !observation.inventoryDiagnostics?.blockingInaccessibleFrameCount &&
    observation.captureDiagnostics?.completedChannels.includes("dom_inventory") &&
    !observation.captureDiagnostics.failedChannels.length && !observation.captureDiagnostics.timedOutChannels.length &&
    observation.controls.filter(control => control.actionType === "accept_all" && control.visible).length === 1 &&
    observation.controls.some(control => control.actionType === "accept_all" && control.visible &&
      control.selectorHint === candidate.selectorHint && control.label === candidate.label && control.tagName === "button"));
}

/** Extends positive Accept coverage only. The canonical inspection stays limited. */
export function hasVerifiedDrupalOverflowGeometry(geometry: ConsentControlGeometryArtifact): boolean {
  const proof = geometry.drupalOverflowGeometry;
  if (!proof || proof.version !== "drupal_overflow_accept_geometry.v1") return false;
  const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
  if (!inspection ||
      inspection.structuralCoverage !== "limited" || geometry.documentIdentity?.source !== "cdp_loader_id" ||
      proof.documentToken !== geometry.documentIdentity.token || proof.capturedAt !== geometry.capturedAt ||
      !Number.isFinite(Date.parse(proof.capturedAt)) || geometry.captureTiming?.version !== "consent_geometry_capture_timing.v1" ||
      geometry.captureTiming.mainFrameCompletedAt !== proof.capturedAt ||
      !Number.isFinite(Date.parse(geometry.captureTiming.completedAt)) ||
      Date.parse(geometry.captureTiming.completedAt) < Date.parse(proof.capturedAt) || !drupalOverflowAcceptCandidate(geometry)) return false;
  const coverage = inspection.captureCoverage;
  return coverage.documentReadyState === "complete" && coverage.mainFrameAvailable && !coverage.inventoryTruncated &&
    coverage.frameCount > CONSENT_GEOMETRY_FRAME_LIMIT && coverage.frameCount <= DRUPAL_OVERFLOW_FRAME_LIMIT &&
    coverage.capturedFrameCount === CONSENT_GEOMETRY_FRAME_LIMIT &&
    proof.nonRenderedFrameCount === coverage.frameCount - coverage.capturedFrameCount;
}
