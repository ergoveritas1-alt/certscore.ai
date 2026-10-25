import { assessCmsPluginSignals, assessCmsSignals, cmsSafeUrl, cmsSecurityProjectionSchema, siteMetadataSchema, type CanonicalEvidenceBundle, type CmsSignal } from "@certscore/contracts";
import { isDeepStrictEqual } from "node:util";
import { projectTechnologyInventory } from "./technology-inventory-projection";

/** No fetches: only metadata in the already verified, document-bound runtime artifact. */
export function projectCmsSecurity(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null) {
  if (!documentUrl || source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) return null;
  const url = cmsSafeUrl(documentUrl);
  const start = Date.parse(bundle.startedAt), end = Date.parse(bundle.completedAt);
  if (!url || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const snapshots = bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots ?? [];
  const ordered = [...snapshots].filter(row => row.consentStateAtTime === "pre_consent")
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs || String(left.artifactId).localeCompare(String(right.artifactId)));
  const latest = ordered[0];
  // Metadata may precede a lightweight snapshot of the same loader, but must
  // not survive a reload/navigation or borrow another lane's document proof.
  if (!latest || latest.url !== documentUrl || !latest.documentIdentity?.token ||
      !Number.isFinite(latest.capturedAtMs) || latest.capturedAtMs < 0 || latest.capturedAtMs > end - start) return null;
  const documentToken = latest.documentIdentity.token;
  // Millisecond offsets can tie in legacy multi-snapshot captures. A tie is
  // not evidence that either loader won; source array order cannot resolve it.
  if (ordered.some(row => row.capturedAtMs === latest.capturedAtMs &&
      (row.url !== latest.url || row.documentIdentity?.token !== documentToken))) return null;
  const snapshot = ordered.find(row => row.url === documentUrl && row.documentIdentity?.token === documentToken && row.siteMetadata);
  const metadata = siteMetadataSchema.safeParse(snapshot?.siteMetadata);
  if (!snapshot || !metadata.success || !snapshot.artifactId || !Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs < 0 || snapshot.capturedAtMs > end - start) return null;
  if (ordered.some(row => row.url === documentUrl && row.documentIdentity?.token === snapshot.documentIdentity!.token &&
      row.capturedAtMs === snapshot.capturedAtMs && row.siteMetadata && !isDeepStrictEqual(row.siteMetadata, snapshot.siteMetadata))) return null;
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
        proof.kind === "feed_generator" && (proof.linkedFrom !== url || !metadata.data.feedLinks?.includes(proof.sourceUrl))) return null;
    signals.push({ evidenceRef: `site_integrity:version:${index}`, kind: proof.kind, value: proof.value, sourceUrl: proof.sourceUrl, artifactRef, versionEvidence: proof });
  }
  const policy = metadata.data.versionEvidence !== undefined ? "v2" : "v1";
  const capturedAt = new Date(start + snapshot.capturedAtMs).toISOString();
  const result = cmsSecurityProjectionSchema.safeParse({
    contractVersion: `certscore.cms-security-projection.${policy}`, scanId: bundle.scanId, verificationStatus: "verified",
    sourceHash: source.sha256, documentUrl: url, documentToken: snapshot.documentIdentity!.token,
    capturedAt, evidenceRef: artifactRef, signals, assessment: assessCmsSignals(signals, capturedAt, undefined, policy),
    pluginInventory: assessCmsPluginSignals(signals),
    technologyInventory: projectTechnologyInventory({ bundle, metadata: metadata.data, signals, documentUrl: url, requestDocumentUrl: documentUrl,
      documentToken, artifactRef, capturedAtMs: snapshot.capturedAtMs }),
  });
  return result.success ? result.data : null;
}
