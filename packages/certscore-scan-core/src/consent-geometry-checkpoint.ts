import type { ConsentControlGeometryArtifact } from "./consent-control-geometry";

// The existing timing-detail contract is 240 characters. A byte limit also
// prevents multi-byte names from expanding this diagnostic beyond that budget.
export const CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES = 240;

/** Counts are [all candidates, first-layer, confirmed-visible, Accept intents,
 * Reject intents]. This is an original completed-read diagnostic only: never a
 * geometry artifact, absence proof, action authorization or consent witness. */
export function consentGeometryCheckpoint(geometry: ConsentControlGeometryArtifact): string {
  const count = (predicate: (candidate: ConsentControlGeometryArtifact["candidates"][number]) => boolean) =>
    geometry.candidates.filter(predicate).length;
  const names = [...new Set(geometry.cmp.detections.map(detection => detection.canonicalName))];
  const capturedAt = Date.parse(geometry.capturedAt);
  const loader = geometry.documentIdentity?.source === "cdp_loader_id" && geometry.documentIdentity.token.length <= 64
    ? geometry.documentIdentity.token : undefined;
  const coverage = geometry.controlInspection?.captureCoverage;
  const checkpoint = {
    version: "consent_geometry_checkpoint.v1", diagnosticOnly: true,
    ...(Number.isFinite(capturedAt) ? {at: capturedAt} : {}),
    ...(loader ? {loader} : {}),
    cmp: names.filter(name => name.length <= 120).slice(0, 2),
    counts: [geometry.candidates.length, count(candidate => candidate.layer === "first_layer"),
      count(candidate => candidate.decisionStatus === "confirmed_visible"),
      count(candidate => candidate.layer === "first_layer" && candidate.actionType === "accept_all"),
      count(candidate => candidate.layer === "first_layer" && candidate.actionType === "reject_all")],
    limited: !loader || !Number.isFinite(capturedAt) || !coverage || coverage.inventoryTruncated ||
      !coverage.documentAndFramesStable || !coverage.mainFrameAvailable || coverage.documentReadyState !== "complete" ||
      names.length > 2 || names.some(name => name.length > 120),
  };
  let serialized = JSON.stringify(checkpoint);
  if (Buffer.byteLength(serialized, "utf8") > CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES) {
    // Omit an oversized name; do not truncate it into a different identity.
    serialized = JSON.stringify({...checkpoint, cmp: [], limited: true});
  }
  return Buffer.byteLength(serialized, "utf8") <= CONSENT_GEOMETRY_CHECKPOINT_MAX_BYTES ? serialized : JSON.stringify({
    version: checkpoint.version, diagnosticOnly: true, counts: checkpoint.counts, limited: true,
  });
}
