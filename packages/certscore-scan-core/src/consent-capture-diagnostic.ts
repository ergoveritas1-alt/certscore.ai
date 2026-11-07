import {type ConsentCaptureDiagnostic, type ConsentUiObservation} from "@certscore/contracts";
import {sameDocumentCaptureBinding} from "./document-bound-capture";
import type {ConsentControlGeometryArtifact} from "./consent-control-geometry";

export type ConsentRefreshDiagnosticOutcome = Pick<ConsentCaptureDiagnostic, "outcome" | "skipReason" | "attempted" | "elapsedMs" | "eligibilityBlocker"> & {
  observationId: string; documentToken: string | null; inventoryObservedAtMs: number;
};

/** Uses retained facts only, with no browser read or scheduling side effect. */
export function buildConsentCaptureDiagnostic(input: {
  observation: ConsentUiObservation; geometry?: ConsentControlGeometryArtifact | null;
  scanStartedAtMs: number; refresh?: ConsentRefreshDiagnosticOutcome;
}): ConsentCaptureDiagnostic {
  const {observation: o, geometry: g, refresh: r} = input;
  const documentToken = o.documentIdentity?.token ?? null;
  const relative = g ? Date.parse(g.capturedAt) - input.scanStartedAtMs : NaN;
  const geometryObservedAtMs = Number.isSafeInteger(relative) && relative >= 0 ? relative : null;
  const geometryBinding = !g || !documentToken || !g.documentIdentity?.token ? "unavailable" :
    sameDocumentCaptureBinding({url: o.documentUrl ?? "", documentIdentity: o.documentIdentity},
      {url: g.pageUrl, documentIdentity: g.documentIdentity}) ? "matched" : "mismatched";
  const bound = r && r.observationId === o.observationId && r.documentToken === documentToken && r.inventoryObservedAtMs === o.observedAtMs;
  return {
    version: "consent_capture_diagnostic.v1", refreshPolicy: "final_consent_geometry_refresh.v3",
    observationId: o.observationId, documentToken, inventoryObservedAtMs: o.observedAtMs,
    geometryObservedAtMs, geometryBinding,
    geometryMinusInventoryMs: geometryBinding === "matched" && geometryObservedAtMs !== null ? geometryObservedAtMs - o.observedAtMs : null,
    outcome: bound ? r.outcome : "not_considered", skipReason: bound ? r.skipReason : r ? "observation_changed" : "stage_not_reached",
    ...(bound && r.eligibilityBlocker ? {eligibilityBlocker: r.eligibilityBlocker} : {}),
    attempted: bound ? r.attempted : false, elapsedMs: bound ? r.elapsedMs : 0,
  };
}
