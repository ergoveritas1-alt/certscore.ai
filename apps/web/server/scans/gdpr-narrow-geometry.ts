import { createHash } from "node:crypto";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Attach a verified original geometry receipt without changing legacy visual
 * assessment behavior. The verified bundle/manifest chain remains caller-owned. */
export function bindNarrowGeometry(geometry: Record<string, unknown> | null, manifest: Record<string, unknown> | null,
  originalSha256: string | null, sizeBytes: number | null) {
  if (!geometry) return null;
  const { narrowSourceVerification: _untrusted, ...payload } = geometry;
  const entry = Array.isArray(manifest?.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts.find((a: Record<string, unknown>) =>
    a.fileName === "ConsentControlGeometryEvidence.json" && a.sha256 === originalSha256 && a.sizeBytes === sizeBytes) : null;
  if (!entry || typeof manifest?.scanId !== "string" || !originalSha256 || !sizeBytes) return payload;
  return { ...payload, narrowSourceVerification: { sha256: originalSha256, sizeBytes, scanId: manifest.scanId,
    payloadSha256: hash(payload) } };
}
export function verifiedNarrowGeometry(geometry: Record<string, unknown> | null | undefined, scanId: string) {
  if (!geometry) return null;
  const { narrowSourceVerification: proof, ...payload } = geometry;
  const p = proof as Record<string, unknown> | undefined;
  return p && p.scanId === scanId && typeof p.sha256 === "string" && /^[a-f0-9]{64}$/.test(p.sha256) &&
    typeof p.sizeBytes === "number" && p.sizeBytes > 0 && p.payloadSha256 === hash(payload)
    ? { geometry: payload, sha256: p.sha256, sizeBytes: p.sizeBytes } : null;
}
