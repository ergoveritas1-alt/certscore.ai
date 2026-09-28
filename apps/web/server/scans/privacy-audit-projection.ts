import { CALIFORNIA_NOTICE_PASSAGE_POLICY, classifyPrivacySurface, locateCaliforniaNoticePassages, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { privacyAuditEvidenceSchema, type PrivacyAuditEvidence, type PrivacyAuditEvidenceV2 } from "@certscore/api-contracts";

function safeUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.toString().length <= 800 ? url.toString() : null;
  } catch { return null; }
}

function observedDestination(rawHref: string | undefined, pageUrl: string): string | null {
  if (!rawHref || /^(?:#|javascript:|data:|about:)/i.test(rawHref.trim())) return null;
  try {
    const resolved = new URL(rawHref, pageUrl);
    const destination = safeUrl(resolved.toString());
    return destination && destination !== pageUrl ? destination : null;
  } catch { return null; }
}

/** Called only during canonical materialization after original bundle checksum
 * verification. This is an observational workpaper, never a finding generator. */
export function projectPrivacyAuditEvidence(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null): PrivacyAuditEvidence | null {
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "") || !documentUrl) return null;
  const pageUrl = safeUrl(documentUrl);
  if (!pageUrl) return null;
  const controls: PrivacyAuditEvidence["controls"] = [];
  const controlCandidates: PrivacyAuditEvidenceV2["controlCandidates"] = [];
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
    const kind = surface.surfaceType;
    const destinationUrl = observedDestination(surface.url, pageUrl);
    const privacyChoice = kind === "do_not_sell_or_share" || kind === "your_privacy_choices" || kind === "cookie_settings";
    const sourceMatches = surface.linkSourcePageUrl === undefined || safeUrl(surface.linkSourcePageUrl) === pageUrl;
    const visibleControl = directLink && surface.linkVisibility === "visible" &&
      surface.accessibleNameSource && surface.accessibleNameSource !== "none" &&
      sourceMatches &&
      surface.classifierProvenance === "privacy_surface_classifier.v1" &&
      classification.surfaceType === kind;
    if (visibleControl && privacyChoice &&
        surface.linkText && !controls.some(row => row.kind === kind && row.destinationUrl === destinationUrl && row.label === surface.linkText?.slice(0, 200))) {
      controls.push({ kind, label: surface.linkText.slice(0, 200), sourceUrl: pageUrl,
        destinationUrl, placement: surface.discoveryMethod,
        evidenceRef, classificationProvenance: surface.classifierProvenance,
        accessibleNameSource: surface.accessibleNameSource === "none" ? undefined : surface.accessibleNameSource,
        retrieval: surface.documentFetchState ?? "not_attempted", interaction: "not_tested" });
    }
    // A directly linked HTML candidate is useful review context, but it is not
    // an observed visitor-facing choice until browser visibility/name proof is
    // retained. Hidden, guessed, and document-mismatched links stay excluded.
    if (!visibleControl && directLink && privacyChoice && surface.clickable === true &&
        destinationUrl && sourceMatches && surface.linkText &&
        surface.classifierProvenance === "privacy_surface_classifier.v1" && classification.surfaceType === kind &&
        (surface.linkVisibility === undefined || surface.linkVisibility === "visible") &&
        !controlCandidates.some(row => row.kind === kind && row.destinationUrl === destinationUrl && row.label === surface.linkText?.slice(0, 200))) {
      controlCandidates.push({ kind, label: surface.linkText.slice(0, 200), sourceUrl: pageUrl,
        destinationUrl, placement: surface.discoveryMethod, evidenceRef,
        verification: surface.linkVisibility === undefined ? "visibility_unverified" : "accessible_name_unverified" });
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
    contractVersion: "certscore.privacy-audit-evidence.v2", scanId: bundle.scanId, documentUrl: pageUrl,
    capturedAt: bundle.completedAt, sourceHash: source.sha256, verificationStatus: "verified", scoreEffect: "none",
    passagePolicy: CALIFORNIA_NOTICE_PASSAGE_POLICY,
    controls: controls.slice(0, 12),
    controlCandidates: controlCandidates.filter(candidate => !controls.some(control =>
      control.kind === candidate.kind && control.destinationUrl === candidate.destinationUrl && control.label === candidate.label
    )).slice(0, 12),
    notices: notices.slice(0, 4), negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: controls.length > 12 || controlCandidates.length > 12 || notices.length > 4,
  });
  return result.success ? result.data : null;
}

/** Preserve a persisted, source-bound v1 workpaper when reading a historical
 * bundle that predates typed link-visibility capture. New bundles project
 * solely from their verified observations. */
export function projectPrivacyAuditEvidenceForMaterialization(
  bundle: CanonicalEvidenceBundle,
  source: { sha256?: string; verificationStatus?: string } | undefined,
  documentUrl: string | null,
  existing: unknown,
): PrivacyAuditEvidence | null {
  const projected = projectPrivacyAuditEvidence(bundle, source, documentUrl);
  if (!projected || bundle.policySurfaceObservations?.some((surface) => surface.linkVisibility !== undefined)) return projected;
  const persisted = privacyAuditEvidenceSchema.safeParse(existing);
  if (!persisted.success) return projected;
  const workpaper = persisted.data;
  return workpaper.scanId === bundle.scanId &&
    workpaper.sourceHash === projected.sourceHash &&
    workpaper.documentUrl === projected.documentUrl &&
    workpaper.capturedAt === projected.capturedAt
    ? workpaper : projected;
}
