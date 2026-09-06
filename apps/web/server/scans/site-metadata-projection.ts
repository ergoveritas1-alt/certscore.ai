import { siteMetadataProjectionSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";

export function projectSiteMetadata(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null) {
  if (!documentUrl || source?.verificationStatus !== "verified" || !source.sha256) return null;
  const snapshot = (bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots ?? []).find(row => row.siteMetadata && row.url === documentUrl && row.consentStateAtTime === "pre_consent" && row.documentIdentity);
  if (!snapshot) return null;
  const result = siteMetadataProjectionSchema.safeParse({
    contractVersion: "certscore.site-metadata-projection.v1", sourceHash: source.sha256,
    documentUrl: snapshot.url, evidenceRef: snapshot.artifactId, capturedAtMs: snapshot.capturedAtMs,
    observation: snapshot.siteMetadata,
  });
  return result.success ? result.data : null;
}
