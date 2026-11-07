import {mkdtemp, writeFile} from "node:fs/promises";
import {renameSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {hasUnresolvedConsentDecision, UNRESOLVED_CONSENT_DECISION, verifyConsentControlInspection, type ConsentCaptureDiagnostic, type ConsentUiObservation, type ScreenshotArtifact} from "@certscore/contracts";
import type {ConsentControlGeometryArtifact} from "./consent-control-geometry";
import type {ConsentGeometryAccessDiagnostic, ConsentGeometryEgressDiagnostic} from "./consent-geometry-access";
import {sameDocumentCaptureBinding, type DocumentCaptureBinding} from "./document-bound-capture";
import {reconcileConsentGeometryInventoryCoverage} from "./consent-geometry-inventory-coverage";

export const FINAL_CONSENT_GEOMETRY_REFRESH_POLICY = "final_consent_geometry_refresh.v3";
export const FINAL_CONSENT_GEOMETRY_REFRESH_MS = 1500;
export const FINAL_CONSENT_GEOMETRY_READ_MS = 1100;
const CLEANUP_RESERVE_MS = 250;
type State = DocumentCaptureBinding & {frameRevision: number; frames: readonly unknown[]};
export type PreparedConsentGeometry = {commitIfCurrent: (current: () => boolean) => string | undefined; dispose: () => void};
export type FinalConsentGeometryRefreshResult = {
  policyVersion: typeof FINAL_CONSENT_GEOMETRY_REFRESH_POLICY;
  attempted: boolean;
  outcome: "retained" | "already_considered" | "ineligible" | "budget_unavailable" | "cancelled" | "timed_out" | "invalid_capture" | "no_positive_control" | "document_changed" | "retention_failed";
  elapsedMs: number;
  eligibilityBlocker?: EligibilityBlocker;
  limitedPositiveOnly?: true;
  geometry?: ConsentControlGeometryArtifact;
  artifactPath?: string;
};

/** A private temporary file is never inside the uploaded artifact tree. The
 * asynchronous write cannot replace canonical evidence after a timeout. Only
 * a guarded synchronous atomic rename commits it; EXDEV fails closed. */
export async function prepareFinalConsentGeometryArtifact(target: string, geometry: ConsentControlGeometryArtifact, reusedContext?: {
  access: ConsentGeometryAccessDiagnostic;
  egress: ConsentGeometryEgressDiagnostic;
  domObservedAtMs: number;
  previousGeometryCapturedAt: string;
}): Promise<PreparedConsentGeometry> {
  const directory = await mkdtemp(join(tmpdir(), "certscore-consent-refresh-"));
  const temporary = join(directory, "geometry.json");
  const dispose = () => {try {rmSync(directory, {recursive: true, force: true});} catch { /* Private temporary cleanup is best effort. */ }};
  try {await writeFile(temporary, JSON.stringify({...geometry,
    ...(reusedContext ? {access: reusedContext.access, egress: reusedContext.egress,
      refresh: {policyVersion: FINAL_CONSENT_GEOMETRY_REFRESH_POLICY, accessSource: "previous_same_loader_geometry_access", domSource: "retained_same_loader_dom_inventory",
        domObservedAtMs: reusedContext.domObservedAtMs, previousGeometryCapturedAt: reusedContext.previousGeometryCapturedAt}} : {}),
    artifactOnly: true, productionFindingIntegration: false}, null, 2) + "\n");}
  catch (error) {dispose(); throw error;}
  return {dispose, commitIfCurrent(current) {
    if (!current()) return undefined;
    renameSync(temporary, target);
    return target;
  }};
}

function sameState(a: State, b: State) {
  return sameDocumentCaptureBinding(a, b) && a.frameRevision === b.frameRevision &&
    a.frames.length === b.frames.length && a.frames.every(frame => b.frames.includes(frame));
}

/** Scheduling only: old evidence never becomes complete here. A successful
 * fresh read must independently prove a complete, stable inventory of every
 * current frame. Semantic uncertainty remains in the canonical finalizer. */
type EligibilityBlocker = NonNullable<ConsentCaptureDiagnostic["eligibilityBlocker"]>;
type RefreshInput = {observation: ConsentUiObservation; geometry?: ConsentControlGeometryArtifact; scanStartedAtMs: number};
type Eligibility = {reason: "stale_geometry" | "limited_geometry"} | {blocker: EligibilityBlocker};

export function finalConsentGeometryRefreshReason(input: RefreshInput) {
  const eligibility = evaluateFinalConsentGeometryEligibility(input);
  return "reason" in eligibility ? eligibility.reason : null;
}

export function evaluateFinalConsentGeometryEligibility(input: RefreshInput): Eligibility {
  const {observation: o, geometry: g} = input;
  if (!g) return {blocker: "geometry_missing"};
  if (o.boundedSameSessionRecoveryOutcome !== undefined || o.basis.some(b =>
    b.startsWith("recovery:bounded_same_session_consent_packet_") || b === "recovery:bounded_same_session_inventory_completed"))
    return {blocker: "recovery_already_used"};
  if (o.layerInspected !== "first_layer") return {blocker: "first_layer_not_inspected"};
  if (!sameDocumentCaptureBinding({url: o.documentUrl ?? "", documentIdentity: o.documentIdentity},
    {url: g.pageUrl, documentIdentity: g.documentIdentity})) return {blocker: "geometry_document_mismatch"};
  if (o.captureStatus === "incomplete") return {blocker: "inventory_incomplete"};
  if (!["interactive", "complete"].includes(o.documentReadyState ?? "")) return {blocker: "inventory_document_not_ready"};
  if (!o.captureDiagnostics?.completedChannels.includes("dom_inventory")) return {blocker: "dom_inventory_unavailable"};
  if (o.captureDiagnostics.timedOutChannels.length || o.captureDiagnostics.failedChannels.length)
    return {blocker: "inventory_channels_failed"};
  if ((o.inventoryDiagnostics?.blockingInaccessibleFrameCount ?? 0) > 0) return {blocker: "blocking_frame_inaccessible"};
  const inspection = verifyConsentControlInspection(g.controlInspection, g.candidates);
  if (!inspection) return {blocker: "geometry_inspection_unverified"};
  const c = inspection.captureCoverage;
  if (c.frameCount > 12) return {blocker: "geometry_frame_cap_exceeded"};
  if (c.inventoryTruncated || !c.mainFrameAvailable || c.frameCount < 1 ||
      c.capturedFrameCount > c.frameCount || c.documentReadyState === "loading")
    return {blocker: "geometry_coverage_incomplete"};
  const readinessOnlyPartial = o.inventoryOutcome === "partial" && inspection.structuralCoverage === "limited" &&
    c.documentReadyState === "interactive" && c.documentAndFramesStable && c.frameCount === 1 && c.capturedFrameCount === 1;
  const semanticOnlyPartial = o.inventoryOutcome === "partial" && o.documentReadyState === "complete" &&
    inspection.structuralCoverage === "complete" && o.basis.includes("inventory:bounded_semantic_partial_channels") &&
    hasUnresolvedConsentDecision(g);
  // A settled DOM inventory can retain semantic uncertainty while an interactive
  // multi-frame geometry checkpoint is structurally limited. It may schedule the
  // same single read; neither its partial state nor its unresolved controls are
  // repaired by eligibility. Retention still requires fresh, complete frame proof.
  const multiFrameSemanticPartial = o.inventoryOutcome === "partial" && o.documentReadyState === "interactive" &&
    o.basis.includes("settled_control_inventory_completed") && o.basis.includes(UNRESOLVED_CONSENT_DECISION) &&
    inspection.structuralCoverage === "limited" && c.documentReadyState === "interactive" &&
    c.frameCount > 1 && c.capturedFrameCount > 0 && hasUnresolvedConsentDecision(g);
  if (!["complete_empty", "complete_with_controls"].includes(o.inventoryOutcome ?? "") &&
      !readinessOnlyPartial && !semanticOnlyPartial && !multiFrameSemanticPartial) return {blocker: "inventory_outcome_unsupported"};
  const capturedAt = Date.parse(g.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt < input.scanStartedAtMs) return {blocker: "geometry_timestamp_invalid"};
  if (reconcileConsentGeometryInventoryCoverage(input) !== o) return {reason: "stale_geometry"};
  return inspection.structuralCoverage === "limited" &&
    (c.documentReadyState === "interactive" || !c.documentAndFramesStable || c.capturedFrameCount < c.frameCount)
    ? {reason: "limited_geometry"} : {blocker: "geometry_current"};
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number, now: () => number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      abort = () => reject(new Error("cancelled"));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, {once: true});
      timer = setTimeout(() => reject(new Error("timed_out")), Math.max(0, deadline - now()));
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

/** One invocation-local optional refresh. Its only browser capability is the
 * existing geometry read: no wait, DOM inventory, screenshot, SDK or action.
 * A completed DOM channel and retained same-loader image must already exist;
 * an interactive source can only be repaired by a fresh complete geometry read. */
export function createFinalConsentGeometryRefresh(dependencies: {
  scanStartedAtMs: number;
  moduleDeadlineAtMs: number;
  signal?: AbortSignal;
  now?: () => number;
  readState: () => State;
  allowLimitedPositiveRefresh?: boolean;
  capture: (options: {timeoutMs: number; screenshotArtifactRef: string; documentIdentity: NonNullable<State["documentIdentity"]>}) => Promise<ConsentControlGeometryArtifact>;
  prepare: (geometry: ConsentControlGeometryArtifact) => Promise<PreparedConsentGeometry>;
}) {
  let considered = false;
  const now = dependencies.now ?? Date.now;
  return async (input: {observation: ConsentUiObservation; geometry?: ConsentControlGeometryArtifact; screenshot?: ScreenshotArtifact}): Promise<FinalConsentGeometryRefreshResult> => {
    const started = now();
    let returned: FinalConsentGeometryRefreshResult | undefined;
    const result = (outcome: FinalConsentGeometryRefreshResult["outcome"], attempted = false): FinalConsentGeometryRefreshResult =>
      (returned = {policyVersion: FINAL_CONSENT_GEOMETRY_REFRESH_POLICY, attempted, outcome, elapsedMs: Math.max(0, now() - started)});
    if (considered) return result("already_considered");
    considered = true;
    if (dependencies.signal?.aborted) return result("cancelled");
    const o = input.observation, image = input.screenshot;
    const ineligible = (eligibilityBlocker: EligibilityBlocker): FinalConsentGeometryRefreshResult =>
      ({...result("ineligible"), eligibilityBlocker});
    const eligibility = evaluateFinalConsentGeometryEligibility({...input, scanStartedAtMs: dependencies.scanStartedAtMs});
    const priorGeometry = input.geometry;
    const priorCoverage = priorGeometry?.controlInspection?.captureCoverage;
    const limitedPositiveOnly = dependencies.allowLimitedPositiveRefresh === true &&
      "blocker" in eligibility && eligibility.blocker === "geometry_frame_cap_exceeded" &&
      priorCoverage?.capturedFrameCount === 12 && priorCoverage.mainFrameAvailable &&
      priorCoverage.documentReadyState === "complete" && !priorCoverage.inventoryTruncated &&
      o.documentReadyState === "complete" && o.controls.length === 0 &&
      priorGeometry?.candidates.every(candidate => candidate.decisionStatus !== "confirmed_visible") === true &&
      reconcileConsentGeometryInventoryCoverage({...input, scanStartedAtMs: dependencies.scanStartedAtMs}) !== o;
    if ("blocker" in eligibility && !limitedPositiveOnly) return ineligible(eligibility.blocker);
    if (!priorGeometry) return ineligible("geometry_missing");
    const snapshot = dependencies.readState();
    const state: State = {...snapshot, documentIdentity: snapshot.documentIdentity ? {...snapshot.documentIdentity} : undefined, frames: [...snapshot.frames]};
    const observedBinding = {url: o.documentUrl ?? "", documentIdentity: o.documentIdentity};
    if (!image || !image.path) return ineligible("screenshot_missing");
    if (image.consentStateAtTime !== "pre_consent" || image.retentionStatus === "withheld" ||
        image.displayStatus === "withheld" || !["primary_full_page", "primary_viewport_fallback"].includes(image.captureMethod ?? ""))
      return ineligible("screenshot_unusable");
    if (!Number.isFinite(image.capturedAtMs) || image.capturedAtMs < 0 || image.capturedAtMs > now() - dependencies.scanStartedAtMs)
      return ineligible("screenshot_timestamp_invalid");
    if (!sameDocumentCaptureBinding(state, observedBinding)) return ineligible("live_document_mismatch");
    if (!sameDocumentCaptureBinding(state, {url: image.url, documentIdentity: image.documentIdentity}))
      return ineligible("screenshot_document_mismatch");
    if (!/^https?:\/\//.test(state.url) || state.documentIdentity?.source !== "cdp_loader_id")
      return ineligible("live_document_unsupported");
    if (!Number.isFinite(o.observedAtMs) || o.observedAtMs < 0 || o.observedAtMs > started - dependencies.scanStartedAtMs ||
        Date.parse(priorGeometry.capturedAt) > started) return ineligible("checkpoint_timestamp_invalid");
    if (state.frames.length === 0) return ineligible("live_frames_missing");
    if (limitedPositiveOnly && image.capturedAtMs < o.observedAtMs) return ineligible("screenshot_timestamp_invalid");
    if (state.frames.length > 12 && !limitedPositiveOnly) return ineligible("live_frame_cap_exceeded");
    if (dependencies.moduleDeadlineAtMs - started < FINAL_CONSENT_GEOMETRY_REFRESH_MS) return result("budget_unavailable");
    const deadline = Math.min(dependencies.moduleDeadlineAtMs, started + FINAL_CONSENT_GEOMETRY_REFRESH_MS);
    const commitDeadline = deadline - CLEANUP_RESERVE_MS;
    const current = () => !dependencies.signal?.aborted && now() < commitDeadline && sameState(state, dependencies.readState());
    let prepared: PreparedConsentGeometry | undefined;
    try {
      const geometry = await beforeDeadline(dependencies.capture({timeoutMs: FINAL_CONSENT_GEOMETRY_READ_MS,
        screenshotArtifactRef: image.path, documentIdentity: state.documentIdentity!}),
      started + FINAL_CONSENT_GEOMETRY_READ_MS, now, dependencies.signal);
      if (now() >= started + FINAL_CONSENT_GEOMETRY_READ_MS) return result("timed_out", true);
      if (!current()) return result(dependencies.signal?.aborted ? "cancelled" : now() >= commitDeadline ? "timed_out" : "document_changed", true);
      const capturedAt = Date.parse(geometry.capturedAt);
      const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
      if (!sameDocumentCaptureBinding(state, {url: geometry.pageUrl, documentIdentity: geometry.documentIdentity}) ||
        !Number.isFinite(capturedAt) || capturedAt < started || capturedAt > now() ||
        capturedAt < dependencies.scanStartedAtMs + o.observedAtMs ||
        geometry.screenshotArtifactRef !== image.path || geometry.summary.confidence <= 0 ||
        geometry.viewport.width <= 0 || geometry.viewport.height <= 0 || !inspection ||
        inspection.captureCoverage.frameCount !== state.frames.length) return result("invalid_capture", true);
      if (limitedPositiveOnly) {
        const coverage = inspection.captureCoverage;
        if (inspection.structuralCoverage !== "limited" || coverage.frameCount <= 12 ||
            coverage.capturedFrameCount !== 12 || coverage.documentReadyState !== "complete" ||
            !coverage.mainFrameAvailable || coverage.inventoryTruncated) return result("invalid_capture", true);
        if (!geometry.summary.firstLayerAccept && !geometry.summary.firstLayerReject && !geometry.summary.firstLayerOptions)
          return result("no_positive_control", true);
      } else if (inspection.structuralCoverage !== "complete") {
        return result("invalid_capture", true);
      }
      const staging = dependencies.prepare(geometry);
      // A stage finishing after the caller exits may only clean up its private file.
      void staging.then(value => {if (!current()) value.dispose();}, () => undefined);
      prepared = await beforeDeadline(staging, commitDeadline, now, dependencies.signal);
      if (!current()) return result(dependencies.signal?.aborted ? "cancelled" : now() >= commitDeadline ? "timed_out" : "document_changed", true);
      const artifactPath = prepared.commitIfCurrent(current);
      if (!artifactPath) return result("retention_failed", true);
      const retained = result("retained", true);
      if (limitedPositiveOnly) retained.limitedPositiveOnly = true;
      retained.geometry = geometry;
      retained.artifactPath = artifactPath;
      return retained;
    } catch (error) {
      return result(dependencies.signal?.aborted ? "cancelled" : error instanceof Error && error.message === "timed_out" ? "timed_out" : "retention_failed", true);
    } finally {
      prepared?.dispose();
      if (returned) returned.elapsedMs = Math.max(0, now() - started);
    }
  };
}
