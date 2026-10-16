import { createHash } from "node:crypto";
import { verifiedSaleSharingOptOutSchema } from "@certscore/contracts";
import { californiaPrivacyReviewSchema, classifyPrivacySurface, privacyChoiceInspectionSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectPrivacyAuditEvidence } from "./privacy-audit-projection";

/** Materialize only from the checksum-verified original policy-lane observations.
 * The workpaper supplies positive facts; its empty lists never establish absence. */
export function projectCaliforniaPrivacyReview(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null) {
  const workpaper = projectPrivacyAuditEvidence(bundle, source, documentUrl);
  const start = Date.parse(bundle.startedAt), end = Date.parse(bundle.completedAt);
  if (!workpaper || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const parsedInspection = privacyChoiceInspectionSchema.safeParse(bundle.policySurfaceInspection?.privacyChoiceInspection);
  const inspection = parsedInspection.success && parsedInspection.data.documentUrl === documentUrl &&
    Date.parse(parsedInspection.data.capturedAt) >= start && Date.parse(parsedInspection.data.capturedAt) <= end
      ? parsedInspection.data : null;
  const controls = workpaper.controls.filter(control => control.kind !== "cookie_settings").map(control => {
    const observed = bundle.policySurfaceObservations.find(row => `policy-surface:${row.observationId}` === control.evidenceRef);
    // Fetch errors, access blocks and redirects alone do not establish a broken
    // visitor-facing path. Only retain exact-destination HTTP 404/410 responses.
    const exactDestinationError = observed?.linkSourcePageUrl === documentUrl && control.destinationUrl &&
      observed.finalUrl === control.destinationUrl && observed.url === control.destinationUrl &&
      observed.fetchFailureReason === "http_error" && observed.status === "failed" &&
      [404, 410].includes(observed.httpStatus ?? 0);
    return { label: control.label, kind: control.kind as "do_not_sell_or_share" | "your_privacy_choices",
      evidenceRef: control.evidenceRef, destinationUrl: control.destinationUrl,
      destinationStatus: exactDestinationError ? "http_error" as const : control.retrieval === "fetched" ? "retrieved" as const : "not_tested" as const,
      ...(exactDestinationError ? {httpStatus: observed!.httpStatus} : {}) };
  });
  const choiceSurface = controls.length ? "observed" : inspection?.coverage === "complete" && inspection.namedChoiceCandidateCount === 0 &&
    !workpaper.truncated && !(workpaper.contractVersion === "certscore.privacy-audit-evidence.v2" && workpaper.controlCandidates.some(row => row.kind !== "cookie_settings"))
      ? "not_observed_in_inspected_scope" : "unknown";
  const failedNoticeLinks = (bundle.policySurfaceObservations ?? []).flatMap(surface => {
    if (surface.surfaceType !== "notice_at_collection" && surface.surfaceType !== "california_notice") return [];
    if (!surface.observationId || surface.observationId.length > 220 || !surface.linkText ||
        classifyPrivacySurface({linkText: surface.linkText}).surfaceType !== surface.surfaceType ||
        surface.classifierProvenance !== "privacy_surface_classifier.v1" ||
        surface.linkObservationState !== "observed" || surface.directlyLinkedFromScannedPage !== true ||
        surface.parentObservationId || surface.traversalDepth ||
        !["footer_link", "header_link", "page_text_link"].includes(surface.discoveryMethod) ||
        surface.linkSourcePageUrl !== documentUrl || surface.linkVisibility !== "visible" ||
        !surface.accessibleNameSource || surface.accessibleNameSource === "none" ||
        surface.status !== "failed" || surface.fetchFailureReason !== "http_error" ||
        ![404, 410].includes(surface.httpStatus ?? 0) || surface.url !== surface.finalUrl) return [];
    return [{kind: surface.surfaceType, label: surface.linkText.slice(0, 200),
      evidenceRef: `policy-surface:${surface.observationId}`, destinationUrl: surface.url,
      httpStatus: surface.httpStatus}];
  }).slice(0, 8);
  const parsedOptOut = verifiedSaleSharingOptOutSchema.safeParse(bundle.saleSharingOptOut);
  const optOut = parsedOptOut.success ? parsedOptOut.data : null;
  const bytes = optOut ? Buffer.from(JSON.stringify(optOut.evidence)) : null;
  const verifiedOptOut = optOut && bytes && optOut.evidence.scanId === bundle.scanId && optOut.evidence.targetUrl === documentUrl &&
    Date.parse(optOut.evidence.completedAt) <= end && Date.parse(optOut.evidence.startedAt) >= start - 5000 &&
    bytes.byteLength === optOut.sizeBytes && createHash("sha256").update(bytes).digest("hex") === optOut.sha256 ? optOut : null;
  const result = californiaPrivacyReviewSchema.safeParse({
    contractVersion: "certscore.california-privacy-review.v1", policyVersion: "california-privacy-review.v1",
    scanId: bundle.scanId, documentUrl: workpaper.documentUrl, capturedAt: bundle.completedAt,
    sourceHash: source!.sha256, verificationStatus: "verified", scoreEffect: "none", applicability: "not_determined",
    inspection, choiceSurface, controls, controlsTruncated: workpaper.truncated, failedNoticeLinks,
    ...(verifiedOptOut ? {optOutObservation: verifiedOptOut} : {}),
    optOutEffectiveness: verifiedOptOut?.evidence.status === "complete" ? "bounded_observation" : "not_assessed", noticeAdequacy: "not_assessed",
    noticeTopics: [...new Set(workpaper.notices.flatMap(notice => notice.passages.map(passage => passage.topic)))],
    noticeEvidenceRefs: workpaper.notices.map(notice => notice.evidenceRef),
  });
  return result.success ? result.data : null;
}
