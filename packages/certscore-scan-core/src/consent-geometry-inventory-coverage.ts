import type { ConsentUiObservation } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry";
import { sameDocumentCaptureBinding } from "./document-bound-capture";

export const STALE_CONSENT_GEOMETRY_BASIS = "geometry:checkpoint_precedes_latest_inventory";

/** Final coverage accounting only. Reusing an older artifact cannot complete a
 * later inventory. Keep its timestamp, positive controls and artifact references;
 * this function performs no capture, recovery, wait or observation reordering. */
export function reconcileConsentGeometryInventoryCoverage(input: {
  observation: ConsentUiObservation;
  geometry?: Pick<ConsentControlGeometryArtifact, "capturedAt" | "documentIdentity" | "pageUrl"> | null;
  scanStartedAtMs: number;
}): ConsentUiObservation {
  const { observation: o, geometry: g, scanStartedAtMs } = input;
  if (!g || !o.captureDiagnostics?.completedChannels.includes("geometry") ||
      !o.documentUrl || !sameDocumentCaptureBinding(
        { url: o.documentUrl, documentIdentity: o.documentIdentity },
        { url: g.pageUrl, documentIdentity: g.documentIdentity },
      )) return o;
  const capturedAtMs = Date.parse(g.capturedAt) - scanStartedAtMs;
  if (!Number.isFinite(capturedAtMs) || capturedAtMs < 0 ||
      !Number.isFinite(o.observedAtMs) || capturedAtMs >= o.observedAtMs) return o;
  return {
    ...o,
    inventoryOutcome: ["complete_empty", "complete_with_controls"].includes(o.inventoryOutcome ?? "")
      ? "partial" : o.inventoryOutcome,
    basis: [...new Set([...o.basis, STALE_CONSENT_GEOMETRY_BASIS])],
    captureDiagnostics: {
      ...o.captureDiagnostics,
      completedChannels: o.captureDiagnostics.completedChannels.filter(channel => channel !== "geometry"),
    },
  };
}
