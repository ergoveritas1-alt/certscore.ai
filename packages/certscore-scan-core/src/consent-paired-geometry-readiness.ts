import {
  normalizeConsentControlText,
  verifyConsentControlInspection,
  type BrowserDocumentIdentity,
  type ConsentUiObservation,
  type ScreenshotArtifact,
} from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

/** Timing eligibility only. Does not complete the later geometry diagnostic,
 * change an observation, or establish that an image is safe to serve. */
export function isPairedConsentGeometryReady(input: {
  geometry: ConsentControlGeometryArtifact;
  observation: ConsentUiObservation;
  screenshots: ScreenshotArtifact[];
  pageUrl: string;
  documentIdentity?: BrowserDocumentIdentity;
  framesStable: boolean;
}): boolean {
  const { geometry, observation, documentIdentity } = input;
  if (!input.framesStable || !documentIdentity?.token ||
    geometry.artifactVersion !== "consent_control_geometry.v1" ||
    geometry.sourceScanner !== "consent_control_geometry_diagnostic" ||
    !/^https?:\/\//.test(input.pageUrl) || geometry.pageUrl !== input.pageUrl ||
    observation.documentUrl !== input.pageUrl ||
    geometry.summary.confidence <= 0 || !Number.isFinite(geometry.summary.confidence) ||
    !Number.isFinite(Date.parse(geometry.capturedAt)) ||
    !Number.isFinite(geometry.viewport.width) || !Number.isFinite(geometry.viewport.height) ||
    geometry.viewport.width <= 0 || geometry.viewport.height <= 0 ||
    observation.captureStatus !== "observed" ||
    !["complete_with_controls", "partial"].includes(observation.inventoryOutcome ?? "") ||
    !observation.captureDiagnostics?.completedChannels.includes("dom_inventory") ||
    !observation.captureDiagnostics.completedChannels.includes("geometry") ||
    observation.captureDiagnostics.timedOutChannels.length > 0 ||
    observation.captureDiagnostics.failedChannels.length > 0) return false;
  for (const identity of [geometry.documentIdentity, observation.documentIdentity]) {
    if (!identity?.token || identity.source !== documentIdentity.source || identity.token !== documentIdentity.token) return false;
  }
  const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
  if (!inspection || inspection.structuralCoverage !== "complete" || inspection.reasonCodes.length > 0) return false;
  if (geometry.candidates.some(row => row.classifierReasonCodes.some(reason =>
    reason === "visible_accessible_intent_conflict" || reason === "conflicting_consent_decisions"))) return false;
  const screenshot = input.screenshots.find(row => row.artifactId === "screenshot_pre_consent_settled" &&
    row.path === geometry.screenshotArtifactRef && row.path.length > 0 && row.url === input.pageUrl &&
    row.documentIdentity?.source === documentIdentity.source && row.documentIdentity.token === documentIdentity.token &&
    row.consentStateAtTime === "pre_consent" && row.captureMethod !== undefined &&
    row.retentionStatus !== "withheld" &&
    ["primary_full_page", "primary_viewport_fallback"].includes(row.captureMethod));
  if (!screenshot) return false;
  const controls = observation.controls.filter(row => row.visible !== false);
  const positive = geometry.candidates.filter(row => row.layer === "first_layer" && row.decisionStatus === "confirmed_visible");
  if (!positive.some(row => ["accept_all", "reject_all", "manage_preferences"].includes(row.actionType))) return false;
  // The observation contract has no per-control frame binding. Limit this
  // optimization to an exact, unambiguous main-frame control inventory.
  if (controls.length === 0 || controls.length !== positive.length || positive.some(candidate =>
    candidate.frameContext.frameKind !== "main_frame" || candidate.frameContext.frameUrl !== input.pageUrl ||
    candidate.screenshotArtifactRef !== geometry.screenshotArtifactRef)) return false;
  const matched = new Set<string>();
  for (const control of controls) {
    if (!control.selectorHint || !control.tagName) return false;
    const matches = positive.filter(candidate => candidate.actionType === control.actionType &&
      normalizeConsentControlText(candidate.label) === normalizeConsentControlText(control.label) &&
      candidate.selectorHint === control.selectorHint && candidate.tagName === control.tagName &&
      candidate.role === control.role);
    const match = matches[0];
    if (matches.length !== 1 || !match || matched.has(match.candidateId)) return false;
    matched.add(match.candidateId);
  }
  return true;
}
