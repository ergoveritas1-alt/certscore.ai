import { basename } from "node:path";
import { consentControlVisualComparisonSchema } from "@certscore/contracts";

/** The enclosing manifest and geometry bytes must already be checksum verified. */
export function withVerifiedConsentVisualSource(geometry: Record<string, unknown> | null,
  manifest: Record<string, unknown> | null, geometrySha256: string | null): Record<string, unknown> | null {
  if (!geometry || geometry.visualComparison === undefined) return geometry;
  const visual = consentControlVisualComparisonSchema.safeParse(geometry.visualComparison);
  const pointers = Array.isArray(manifest?.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts : [];
  const pointer = (fileName: string, hash: string, maxBytes: number) =>
    pointers.filter(p => p && typeof p === "object" && p.fileName === fileName).length === 1 &&
    pointers.some(p => p && typeof p === "object" && p.fileName === fileName && p.sha256 === hash && typeof p.uri === "string" && p.uri.startsWith("s3://") &&
    Number.isSafeInteger(p.sizeBytes) && p.sizeBytes > 0 && p.sizeBytes <= maxBytes);
  if (visual.success && geometrySha256 && /^[a-f0-9]{64}$/.test(geometrySha256) &&
    pointer("ConsentControlGeometryEvidence.json", geometrySha256, 2 * 1024 * 1024) &&
    pointer(basename(visual.data.screenshotArtifactRef), visual.data.screenshotSha256, 8 * 1024 * 1024)) return geometry;
  const { visualComparison: _unverified, ...retainedGeometry } = geometry;
  return retainedGeometry;
}
