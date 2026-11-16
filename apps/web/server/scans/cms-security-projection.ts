import { assessCmsPluginSignals, assessCmsSignals, cmsSafeUrl, cmsSecurityProjectionSchema, runtimeCmsMetadataMatchesTerminal, runtimeCmsMetadataSnapshotSchema, siteMetadataSchema, type CanonicalEvidenceBundle, type CmsSecurityProjection, type CmsSignal } from "@certscore/contracts";
import { isDeepStrictEqual } from "node:util";
import { resolveRuntimeEvidenceClock } from "@certscore/contracts";
import { projectTechnologyInventory } from "./technology-inventory-projection";

export const CMS_PROJECTION_UNAVAILABLE_REASONS = [
  "cms_source_unverified", "cms_runtime_unavailable", "cms_document_unavailable", "cms_clock_unavailable", "cms_runtime_snapshot_missing",
  "cms_document_mismatch", "cms_capture_time_invalid", "cms_document_conflict", "cms_metadata_missing",
  "cms_metadata_invalid", "cms_metadata_conflict", "cms_version_evidence_unbound", "cms_projection_invalid",
] as const;
type CmsProjectionFailure = typeof CMS_PROJECTION_UNAVAILABLE_REASONS[number];
type CmsProjectionAssessment = { projection: CmsSecurityProjection; reason: null } |
  { projection: null; reason: CmsProjectionFailure };

export function projectCmsSecurity(
  bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null,
) {
  return assessCmsSecurityProjection(bundle, source, documentUrl).projection;
}

/** Only metadata from the already verified, document-bound runtime artifact. */
export function assessCmsSecurityProjection(
  bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null,
): CmsProjectionAssessment {
  const unavailable = (reason: CmsProjectionFailure) => ({ projection: null, reason } as const);
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) return unavailable("cms_source_unverified");
  const url = documentUrl && cmsSafeUrl(documentUrl);
  if (!url) return unavailable("cms_document_unavailable");
  const clock = resolveRuntimeEvidenceClock(bundle);
  const start = clock?.startMs ?? NaN, end = clock?.endMs ?? NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return unavailable("cms_clock_unavailable");
  const snapshots = bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots ?? [];
  const ordered = [...snapshots].filter(row => row.consentStateAtTime === "pre_consent")
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs || String(left.artifactId).localeCompare(String(right.artifactId)));
  const latest = ordered[0];
  if (!latest) return unavailable("cms_runtime_snapshot_missing");
  // Metadata may precede a lightweight snapshot of the same loader, but must
  // not survive a reload/navigation or borrow another lane's document proof.
  if (latest.url !== documentUrl || !latest.documentIdentity?.token) return unavailable("cms_document_mismatch");
  const validTime = (ms: number) => Number.isFinite(ms) && ms >= 0 && ms <= end - start;
  if (!validTime(latest.capturedAtMs)) return unavailable("cms_capture_time_invalid");
  const documentToken = latest.documentIdentity.token;
  // A tie does not establish that either loader won.
  if (ordered.some(row => row.capturedAtMs === latest.capturedAtMs &&
      (row.url !== latest.url || row.documentIdentity?.token !== documentToken))) return unavailable("cms_document_conflict");
  const currentMetadata = ordered.find(row => row.url === documentUrl && row.documentIdentity?.token === documentToken && row.siteMetadata);
  let snapshot: typeof currentMetadata | NonNullable<CanonicalEvidenceBundle["runtimeCmsMetadataSnapshot"]> = currentMetadata;
  if (!snapshot && bundle.runtimeMetadataSnapshots?.length === 1 && bundle.runtimeCmsMetadataSnapshot) {
    if (!bundle.runtimeEvidenceClock) return unavailable("cms_clock_unavailable");
    const companion = runtimeCmsMetadataSnapshotSchema.safeParse(bundle.runtimeCmsMetadataSnapshot);
    if (!companion.success) return unavailable("cms_metadata_invalid");
    if (!runtimeCmsMetadataMatchesTerminal(companion.data, latest, end - start, bundle.runtimeEvidenceClock.source.sha256)) return unavailable("cms_document_mismatch");
    snapshot = companion.data;
  }
  if (!snapshot) return unavailable("cms_metadata_missing");
  const metadata = siteMetadataSchema.safeParse(snapshot.siteMetadata);
  if (!metadata.success || !snapshot.artifactId) return unavailable("cms_metadata_invalid");
  if (!validTime(snapshot.capturedAtMs)) return unavailable("cms_capture_time_invalid");
  if (ordered.some(row => row.url === documentUrl && row.documentIdentity?.token === documentToken &&
      row.capturedAtMs === snapshot.capturedAtMs && row.siteMetadata && !isDeepStrictEqual(row.siteMetadata, snapshot.siteMetadata))) {
    return unavailable("cms_metadata_conflict");
  }
  const artifactRef = snapshot.artifactId;
  const signals: CmsSignal[] = metadata.data.generators.map((value, index) => ({
    evidenceRef: `site_integrity:dom:${index}`, kind: "meta_generator", value, sourceUrl: url, artifactRef,
  }));
  for (const [index, asset] of (metadata.data.cmsAssets ?? []).entries()) {
    const assetUrl = cmsSafeUrl(asset);
    if (!assetUrl || new URL(assetUrl).origin !== new URL(url).origin) continue;
    signals.push({ evidenceRef: `site_integrity:asset:${index}`, kind: "asset_path", value: new URL(assetUrl).pathname, sourceUrl: assetUrl, artifactRef });
  }
  for (const [index, proof] of (metadata.data.versionEvidence ?? []).entries()) {
    if (new URL(proof.sourceUrl).origin !== new URL(url).origin || proof.kind === "html_generator_comment" && proof.sourceUrl !== url ||
        proof.kind === "feed_generator" && (proof.linkedFrom !== url || !metadata.data.feedLinks?.includes(proof.sourceUrl))) return unavailable("cms_version_evidence_unbound");
    signals.push({ evidenceRef: `site_integrity:version:${index}`, kind: proof.kind, value: proof.value, sourceUrl: proof.sourceUrl, artifactRef, versionEvidence: proof });
  }
  const policy = metadata.data.versionEvidence !== undefined ? "v2" : "v1";
  const capturedAt = new Date(start + snapshot.capturedAtMs).toISOString();
  const result = cmsSecurityProjectionSchema.safeParse({
    contractVersion: `certscore.cms-security-projection.${policy}`, scanId: bundle.scanId, verificationStatus: "verified",
    sourceHash: source.sha256, documentUrl: url, documentToken: snapshot.documentIdentity!.token,
    capturedAt, evidenceRef: artifactRef, signals, assessment: assessCmsSignals(signals, capturedAt, undefined, policy),
    pluginInventory: assessCmsPluginSignals(signals),
    technologyInventory: projectTechnologyInventory({ bundle, metadata: metadata.data, signals, documentUrl: url, requestDocumentUrl: snapshot.url,
      documentToken, artifactRef, capturedAtMs: snapshot.capturedAtMs }),
  });
  return result.success ? { projection: result.data, reason: null } : unavailable("cms_projection_invalid");
}
