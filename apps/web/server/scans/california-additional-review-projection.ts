import {
  CALIFORNIA_ADDITIONAL_REVIEW_VERSION, californiaAdditionalReviewSchema, californiaChoiceBarrierObservationSchema,
  californiaSensitiveFieldCategories, collectionSurfaceInventorySchema, resolveRuntimeEvidenceClock,
  type CaliforniaAdditionalReview, type CaliforniaPolicyDocument, type CaliforniaPrivacyReview,
  type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import { isCompletePrivacyPolicyAbsence } from "../../lib/scans/privacy-policy-discovery";
import { projectFormDestinations } from "./form-destination-projection";

type Review = Extract<CaliforniaPrivacyReview, { contractVersion: "certscore.california-privacy-review.v10" }>;
const categories = ["name", "email", "phone", "address", ...californiaSensitiveFieldCategories] as const;

function isCategory<T extends string>(values: readonly T[], value: string): value is T {
  return values.some(item => item === value);
}

function noticeProof(bundle: CanonicalEvidenceBundle, review: Review, completeEnglishDocuments: CaliforniaPolicyDocument[]): CaliforniaAdditionalReview["notice"] {
  if (review.reviewCoverage.runtimeCoverage !== "complete" || !review.reviewCoverage.captureCoverage.collectionInventoryComplete)
    return;
  const result = collectionSurfaceInventorySchema.safeParse(bundle.collectionSurfaceInventory);
  if (!result.success || result.data.pageUrl !== review.documentUrl ||
      !["pre_consent", "fresh_pre_consent"].includes(result.data.scenario) ||
      result.data.coverage.status !== "complete" || result.data.coverage.candidateScanTruncated ||
      result.data.coverage.retentionTruncated) return;
  const points = result.data.forms.flatMap(form => {
    if (form.pageUrl !== review.documentUrl || form.fieldsTruncated || form.structure !== "native_form" ||
        form.directVsInferred !== "direct" || form.privacyDisclosure?.version !== 2 || form.privacyDisclosure.truncated ||
        !form.evidenceRefs.length || !["get", "post"].includes(form.method)) return [];
    const fields = [...new Set(form.fields.filter(field => !field.disabled && !field.readOnly &&
      field.directVsInferred === "direct" && field.confidence >= 0.9).map(field => field.semanticCategory))]
      .filter(value => isCategory(categories, value));
    return fields.length ? [{ form, point: {
      formRef: form.formRef, categories: fields, evidenceRefs: form.evidenceRefs.map(ref => ref.refId),
    } }] : [];
  });
  if (!points.length) return;

  // The full negative search and a completed, empty form-notice inspection
  // must agree. An unresolved frame, route, document or notice candidate
  // leaves the status unknown.
  const inspection = bundle.policySurfaceInspection;
  const negative = inspection?.negativeSearchEvidence;
  const possibleNotice = bundle.policySurfaceObservations.some(surface =>
    ["notice_at_collection", "california_notice"].includes(surface.surfaceType) &&
    (surface.linkObservationState === "observed" || surface.status === "fetched" || surface.status === "observed"));
  if (inspection && isCompletePrivacyPolicyAbsence(inspection) && negative?.renderedDocumentUrl === review.documentUrl && !possibleNotice) {
    const absent = points.filter(({ form }) => form.privacyDisclosure!.excerpts.length === 0).map(({ point }) => point);
    if (absent.length) return { issue: "no_notice_in_completed_inspection", points: absent, documents: [] };
  }

  if (!review.reviewCoverage.captureCoverage.policyTextComplete || !completeEnglishDocuments.length) return;
  // Retention can be stated as a period, a criterion or a lifecycle action
  // using varied wording. Treat any plausible wording as review-needed.
  const possibleRetention = /\b(?:retain\w*|retention|stor\w*|keep\w*|kept|delet\w*|destroy\w*|eras\w*|dispos\w*|purg\w*|anonymi[sz]\w*|archiv\w*|expir\w*|preserv\w*|remain\w*|durations?|as long as|how long|time periods?|lifetimes?|hour\w*|days?|weeks?|months?|years?|until|indefinit\w*|permanent\w*|temporary|for as long)\b/i;
  if (completeEnglishDocuments.some(doc => possibleRetention.test(doc.text))) return;
  const linked = points.flatMap(({ form, point }) => {
    const associated = review.collectionNoticeAssessment?.points.some(row => row.id === form.formRef &&
      row.kind === "form" && row.association === "form_notice" && row.status === "matched_text");
    if (!associated) return [];
    const excerpts = form.privacyDisclosure!.excerpts;
    if (excerpts.some(excerpt => possibleRetention.test(excerpt.text))) return [];
    const documents = completeEnglishDocuments.filter(doc => excerpts.some(excerpt => excerpt.links.some(link =>
      // A complete, specifically named collection notice must be bound to
      // this form. A generic footer or an unverified anchor is insufficient.
      /^(?:california )?notice at collection[.!]?$/i.test(link.label.trim()) && link.url === doc.url &&
      bundle.policySurfaceObservations.some(surface => surface.surfaceType === "notice_at_collection" &&
        surface.classifierProvenance === "privacy_surface_classifier.v1" &&
        doc.evidenceRef === `policy-text:${surface.observationId}` && surface.linkSourcePageUrl === review.documentUrl))));
    return documents.length ? [{ point, documents }] : [];
  });
  if (!linked.length) return;
  const refs = new Set(linked.flatMap(row => row.documents.map(doc => doc.evidenceRef)));
  return { issue: "retention_missing_from_reviewed_notice", points: linked.map(row => row.point),
    documents: review.reviewCoverage.sourceDocuments.filter(doc => doc.complete && refs.has(doc.evidenceRef))
      .map(({ url, sha256, evidenceRef }) => ({ url, sha256, evidenceRef })) };
}

function choiceFrictionProof(bundle: CanonicalEvidenceBundle, review: Review): CaliforniaAdditionalReview["choiceFriction"] {
  if (review.controlsTruncated || !review.reviewCoverage.captureCoverage.choiceInventoryComplete) return;
  for (const control of review.controls) {
    if (control.destinationStatus !== "retrieved" || !control.destinationUrl) continue;
    const surface = bundle.policySurfaceObservations.find(row => control.evidenceRef === `policy-surface:${row.observationId}`);
    const proof = californiaChoiceBarrierObservationSchema.safeParse(surface?.californiaChoiceBarrier);
    if (!surface || !proof.success || surface.linkSourcePageUrl !== review.documentUrl || surface.linkVisibility !== "visible" ||
        surface.linkObservationState !== "observed" || surface.directlyLinkedFromScannedPage !== true ||
        (surface.normalizedUrl ?? surface.url) !== control.destinationUrl || surface.finalUrl !== control.destinationUrl ||
        (surface.httpStatus ?? 0) < 200 || (surface.httpStatus ?? 0) >= 300 ||
        surface.redirectChain?.some(url => url !== control.destinationUrl) ||
        surface.classifierProvenance !== "privacy_surface_classifier.v1") continue;
    const { sourceDocumentUrl, destinationUrl, textSha256, scope, excerpt } = proof.data;
    if (sourceDocumentUrl !== review.documentUrl || destinationUrl !== control.destinationUrl ||
        scope === "sensitive_information_limit" && control.kind !== "your_privacy_choices") continue;
    return { scope, barrier: "account_creation_required", controlEvidenceRef: control.evidenceRef, excerpt,
      document: { url: destinationUrl, evidenceRef: control.evidenceRef, sha256: textSha256 } };
  }
}

function sensitiveTransmissionProof(bundle: CanonicalEvidenceBundle, review: Review): CaliforniaAdditionalReview["sensitiveTransmission"] {
  if (!bundle.formDestinationTrace?.requests.some(request => request.party === "third_party" &&
      request.status === "response_observed" && request.matches.length)) return;
  const duration = resolveRuntimeEvidenceClock(bundle)?.durationMs;
  if (duration === undefined) return;
  const projection = projectFormDestinations(bundle, { verificationStatus: "verified", sha256: review.sourceHash });
  if (!projection) return;
  const rows = new Map<string, NonNullable<CaliforniaAdditionalReview["sensitiveTransmission"]>[number]>();
  for (const request of projection.trace.requests) {
    if (request.party !== "third_party" || request.status !== "response_observed" ||
        request.relation !== "exact_field_value_match") continue;
    const event = projection.trace.events.find(row => row.evidenceRef === request.eventRef);
    if (event?.documentUrl !== review.documentUrl) continue;
    const recipient = new URL(request.url);
    const response = bundle.networkResponseEvents.find(row => row.requestId === request.networkRequestId &&
      row.directVsInferred === "direct" && (row.status ?? 0) >= 200 && (row.status ?? 0) < 300 &&
      row.timestampMs >= request.observedAtMs && row.timestampMs <= duration &&
      (row.documentUrl === undefined || row.documentUrl === event.documentUrl) &&
      URL.canParse(row.responseUrl) && new URL(row.responseUrl).origin === recipient.origin &&
      new URL(row.responseUrl).pathname === recipient.pathname);
    if (!response?.status) continue;
    for (const match of request.matches) {
      const field = event.fields.find(row => row.evidenceRef === match.fieldRef && row.personal);
      if (!field || !isCategory(californiaSensitiveFieldCategories, field.category)) continue;
      const key = `${recipient.hostname}:${field.category}`;
      if (!rows.has(key)) rows.set(key, { recipientHost: recipient.hostname, category: field.category,
        responseStatus: response.status, requestEvidenceRef: request.evidenceRef, fieldEvidenceRef: field.evidenceRef });
    }
  }
  return rows.size ? [...rows.values()].slice(0, 12) : undefined;
}

/** Materialize from the existing verified bundle. No extra capture or request. */
export function projectCaliforniaAdditionalReview(bundle: CanonicalEvidenceBundle, review: Review,
  completeEnglishDocuments: CaliforniaPolicyDocument[]) {
  if (bundle.policySurfaceInspection?.californiaAdditionalReview !== CALIFORNIA_ADDITIONAL_REVIEW_VERSION ||
      bundle.scanNoGoAssessment?.decision === "no_go") return;
  const parsed = californiaAdditionalReviewSchema.safeParse({
    version: CALIFORNIA_ADDITIONAL_REVIEW_VERSION,
    scanId: review.scanId, sourceBundleSha256: review.sourceHash, documentUrl: review.documentUrl,
    notice: noticeProof(bundle, review, completeEnglishDocuments),
    choiceFriction: choiceFrictionProof(bundle, review),
    sensitiveTransmission: sensitiveTransmissionProof(bundle, review),
  });
  return parsed.success ? parsed.data : undefined;
}
