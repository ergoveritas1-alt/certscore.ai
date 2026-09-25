import { CALIFORNIA_NOTICE_PASSAGE_POLICY, classifyPrivacySurface, locateCaliforniaNoticePassages, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { privacyAuditEvidenceSchema, type PrivacyAuditEvidence } from "@certscore/api-contracts";

function safeUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.toString().length <= 800 ? url.toString() : null;
  } catch { return null; }
}

/** Called only during canonical materialization after original bundle checksum
 * verification. This is an observational workpaper, never a finding generator. */
export function projectPrivacyAuditEvidence(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null): PrivacyAuditEvidence | null {
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "") || !documentUrl) return null;
  const pageUrl = safeUrl(documentUrl);
  if (!pageUrl) return null;
  const controls: PrivacyAuditEvidence["controls"] = [];
  const notices: PrivacyAuditEvidence["notices"] = [];
  for (const surface of bundle.policySurfaceObservations ?? []) {
    const url = safeUrl(surface.normalizedUrl ?? surface.url);
    if (!url || !surface.observationId || surface.observationId.length > 220) continue;
    const evidenceRef = `policy-surface:${surface.observationId}`;
    // A fetched common path or a text mention cannot prove a visitor-facing link.
    const directLink = surface.linkObservationState === "observed" && surface.directlyLinkedFromScannedPage === true &&
      !surface.parentObservationId && !surface.traversalDepth &&
      ["footer_link", "header_link", "page_text_link"].includes(surface.discoveryMethod);
    const classification = classifyPrivacySurface({ linkText: surface.linkText ?? "" });
    const kind = classification.surfaceType;
    if (directLink && (kind === "do_not_sell_or_share" || kind === "your_privacy_choices" || kind === "cookie_settings") &&
        surface.linkText && !controls.some(row => row.kind === kind && row.destinationUrl === url && row.label === surface.linkText?.slice(0, 200))) {
      controls.push({ kind, label: surface.linkText.slice(0, 200), sourceUrl: pageUrl,
        destinationUrl: surface.fetchable === false ? null : url, placement: surface.discoveryMethod,
        evidenceRef, retrieval: surface.documentFetchState ?? "not_attempted", interaction: "not_tested" });
    }
    // Ownership and retained usable text are required independently of discovery.
    if ((surface.surfaceType === "privacy_policy" || surface.surfaceType === "california_notice" || surface.surfaceType === "notice_at_collection") &&
        surface.status === "fetched" && surface.documentEvaluationState === "usable" && surface.documentRole === "policy_document" &&
        ["target_controller", "first_party_brand"].includes(surface.targetRelationship ?? "") && surface.textExcerpt?.trim()) {
      notices.push({ kind: surface.surfaceType, url, evidenceRef,
        directlyLinkedFromScannedPage: directLink,
        coverage: surface.contentCoverage?.status === "complete" && (surface.contentCoverage.sourceTextChars <= surface.textExcerpt.length) ? "complete" : "partial",
        passages: locateCaliforniaNoticePassages(surface.textExcerpt),
      });
    }
  }
  // The consent-proof lane also retains visible JavaScript controls without a
  // navigable URL. Require positive geometry and document-bound typed evidence;
  // never borrow its first-layer completeness to claim sitewide DNS absence.
  for (const observation of bundle.consentUiObservations ?? []) {
    if (observation.documentUrl !== documentUrl || !observation.documentIdentity || observation.captureStatus !== "observed") continue;
    const document = bundle.domSnapshots?.at(-1);
    if (document?.url !== documentUrl || document.documentIdentity?.token !== observation.documentIdentity.token) continue;
    if (observation.inventoryOutcome === "document_mismatch" || observation.inventoryOutcome === "no_go") continue;
    for (const control of observation.controls) {
      if (!control.visible || control.visibilityEvidence !== "box_model_verified" || !control.artifactRef || control.artifactRef.length > 240) continue;
      const kind = classifyPrivacySurface({ linkText: control.label }).surfaceType;
      if (kind !== "do_not_sell_or_share" && kind !== "your_privacy_choices" && kind !== "cookie_settings") continue;
      if (controls.some(row => row.kind === kind && row.label === control.label)) continue;
      controls.push({ kind, label: control.label.slice(0, 200), sourceUrl: pageUrl, destinationUrl: null,
        placement: control.placementType ?? "unknown", evidenceRef: control.artifactRef,
        retrieval: "not_attempted", interaction: "not_tested" });
    }
  }
  const result = privacyAuditEvidenceSchema.safeParse({
    contractVersion: "certscore.privacy-audit-evidence.v1", scanId: bundle.scanId, documentUrl: pageUrl,
    capturedAt: bundle.completedAt, sourceHash: source.sha256, verificationStatus: "verified", scoreEffect: "none",
    passagePolicy: CALIFORNIA_NOTICE_PASSAGE_POLICY,
    controls: controls.slice(0, 12), notices: notices.slice(0, 4), negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: controls.length > 12 || notices.length > 4,
  });
  return result.success ? result.data : null;
}
