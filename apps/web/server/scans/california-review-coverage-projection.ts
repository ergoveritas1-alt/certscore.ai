import { createHash } from "node:crypto";
import {privacySupplementExclusion} from "@certscore/contracts";
import { californiaCoverageSchema, classifyPrivacySurface, collectionSurfaceInventorySchema, isCurrentCaliforniaChoiceInspection, locateCaliforniaReviewTopics, policyTextEvidenceProjectionSchema,
  type CaliforniaPrivacyReview, type CaliforniaReviewCoverage, type CanonicalEvidenceBundle, type PolicyTextEvidenceProjection } from "@certscore/contracts";

export type CaliforniaPolicyEvidence = {
  projection: PolicyTextEvidenceProjection;
  texts: Array<{observationId:string; text:string}>;
};

/** Runs during verified canonical materialization. Passage presence is not
 * adequacy, legal applicability, method functionality, or a negative finding. */
export function projectCaliforniaReviewCoverage(bundle: CanonicalEvidenceBundle, sourceHash: string,
  assessment: Pick<CaliforniaPrivacyReview,"documentUrl"|"inspection"|"choiceSurface"|"controls"|"optOutObservation">,
  evidence?: CaliforniaPolicyEvidence): CaliforniaReviewCoverage {
  const captureBasedPolicy = ["california-privacy-review.v3","california-privacy-review.v4","california-privacy-review.v5","california-privacy-review.v6","california-privacy-review.v7","california-privacy-review.v8","california-privacy-review.v9","california-privacy-review.v10"].includes(bundle.policySurfaceInspection?.californiaReviewPolicy ?? "");
  const parsed = policyTextEvidenceProjectionSchema.safeParse(evidence?.projection);
  const projection = parsed.success && parsed.data.scanId === bundle.scanId && parsed.data.sourceBundle.sha256 === sourceHash &&
    parsed.data.sourceBundle.verificationStatus === "verified" ? parsed.data : null;
  const excludedSupplement=(surface:CanonicalEvidenceBundle["policySurfaceObservations"][number])=>privacySupplementExclusion(surface,
    bundle.policySurfaceObservations.find(parent=>parent.observationId===surface.parentObservationId)?.normalizedUrl);
  const scopedDocuments=(projection?.documents ?? []).filter(document=>{
    const surface=bundle.policySurfaceObservations.find(row=>row.observationId===document.observationId);
    // Guessed paths that do not exist and unrelated terms do not make the
    // separately retained governing privacy notice incomplete. Unknown sources
    // still fail closed; this never waives an observed material supplement.
    return surface?.surfaceType!=="terms" && !(surface && excludedSupplement(surface)) && !(surface?.discoveryMethod==="guessed_common_path" &&
      surface.linkObservationState!=="observed" && surface.documentFetchState==="failed" && [404,410].includes(surface.httpStatus??0));
  });
  const documents = scopedDocuments.filter(document => document.artifactVerificationStatus === "verified" &&
    document.documentFetchState === "fetched" && document.documentEvaluationState === "usable" && document.documentRole === "policy_document" &&
    ["target_controller","first_party_brand"].includes(document.targetRelationship) && document.artifactSha256 && document.retainedTextSha256)
    .slice(0,8).flatMap(document => {
      const text = evidence?.texts.find(row => row.observationId === document.observationId)?.text;
      if (!text || text.length > 160_000 || text.length !== document.retainedTextChars ||
          createHash("sha256").update(text).digest("hex") !== document.retainedTextSha256) return [];
      let url: URL;
      try {url = new URL(document.finalUrl ?? document.requestedUrl);} catch {return [];}
      url.search="";url.hash="";url.username="";url.password="";
      if (!/^https?:$/.test(url.protocol) || url.toString().length > 800) return [];
      const located = locateCaliforniaReviewTopics(text,{californiaNotice:bundle.policySurfaceObservations?.some(surface=>surface.observationId === document.observationId && surface.surfaceType === "california_notice")});
      return [{evidenceRef:`policy-text:${document.observationId}`,url:url.toString(),sha256:document.artifactSha256!,
        complete:document.extractionStatus === "complete" && document.documentTextCoverage.status === "complete" &&
          document.documentTextCoverage.sourceTextChars === text.length && document.documentTextCoverage.retainedTextChars === text.length,
        ...located}];
    });
  const topics = documents.flatMap(document => document.topics.map(topic => ({...topic,evidenceRef:document.evidenceRef})))
    .filter((topic,index,rows)=>rows.findIndex(other=>other.topic === topic.topic && other.excerpt === topic.excerpt) === index).slice(0,18);
  const topic = (name:string) => topics.some(row => row.topic === name);
  const refs = documents.map(document => document.evidenceRef);
  const unresolvedSupplement = bundle.policySurfaceObservations?.some(surface=>surface.traversalDepth === 1 &&
    ["privacy_policy","california_notice","notice_at_collection"].includes(surface.surfaceType) &&
    !excludedSupplement(surface) &&
    !surface.selectionReasonCodes?.some(reason=>["policy_index_child_confirmed_irrelevant","specialized_notice_for_different_audience","not_material_to_target_privacy_notice"].includes(reason)) &&
    !documents.some(document=>document.evidenceRef === `policy-text:${surface.observationId}` && document.complete));
  const policyComplete = !unresolvedSupplement && documents.length > 0 && documents.every(document => document.complete) &&
    Boolean(projection) && scopedDocuments.length <= 8 &&
    scopedDocuments.every(document => documents.some(retained => retained.evidenceRef === `policy-text:${document.observationId}`));
  const statements = new Set(documents.map(document => document.policyStatement).filter(value => value !== "not_identified"));
  const policyStatement = statements.size > 1 || statements.has("conflicting") ? "conflicting" :
    statements.has("declares_no_sale_sharing") ? "declares_no_sale_sharing" : statements.has("describes_sale_sharing") ? "describes_sale_sharing" : "not_identified";
  const runtime = bundle.modulesRun?.filter(run => run.moduleName === "preConsentRuntimeScanner") ?? [];
  const runtimeLane = bundle.scanLaneRuns?.find(lane=>lane.laneId === "runtime_evidence");
  const runtimeCoverage = bundle.runtimeCoverage?.coverageStatus === "usable" &&
    (runtimeLane ? runtimeLane.executionOutcome === "success" : runtime.length === 1 && runtime[0]!.status === "completed") ? "complete" : "limited";
  const baselineEventIds = new Set((bundle.networkEvents ?? []).filter(event=>event.scenario === "pre_consent").map(event=>event.eventId));
  const advertisingReview = policyStatement === "declares_no_sale_sharing" && (bundle.normalizedVendorObservations ?? []).some(vendor=>
    vendor.purpose === "advertising" && vendor.matchSources.some(match=>match.scenario === "pre_consent" && match.sourceEventId && baselineEventIds.has(match.sourceEventId)));
  const families: Array<CaliforniaReviewCoverage["families"][number]> = [];
  const add = (id:CaliforniaReviewCoverage["families"][number]["id"], status:CaliforniaReviewCoverage["families"][number]["status"], reason:string, evidenceRefs:string[]=refs) => families.push({id,status,reason,evidenceRefs:evidenceRefs.slice(0,8)});
  add("privacy_notice", policyComplete && ["categories","purposes","retention"].every(topic) ? "observed" : documents.length ? "review" : "unknown",
    policyComplete ? "Verified policy text inspected for categories, purposes and retention; presence does not establish adequacy." : "Complete governing policy text and linked supplements were not verified.");
  add("california_rights", policyComplete && ["right_to_know","right_to_delete","right_to_correct","non_discrimination"].every(topic) ? "observed" : documents.length ? "review" : "unknown",
    "California-context know, delete, correct and nondiscrimination passages are checked separately; unlocated wording remains review.");
  const methods = assessment.inspection?.rightsMethods ?? [];
  add("request_methods", topic("request_method") || methods.length ? "observed" : documents.length ? "review" : "unknown",
    "Retained request instructions or a visible named route establish discoverability; submission functionality is untested.",
    [...refs,...methods.map((_,index)=>`privacy-choice-inspection:rights-method:${index}`)]);
  const namedCollectionNotice = bundle.policySurfaceObservations?.some(surface => surface.surfaceType === "notice_at_collection" &&
    surface.classifierProvenance === "privacy_surface_classifier.v1" && classifyPrivacySurface({linkText:surface.linkText??""}).surfaceType === "notice_at_collection" &&
    surface.linkObservationState === "observed" && !surface.parentObservationId && !surface.traversalDepth &&
    surface.linkSourcePageUrl === assessment.documentUrl && surface.linkVisibility === "visible" && surface.accessibleNameSource && surface.accessibleNameSource !== "none" &&
    surface.directlyLinkedFromScannedPage && surface.status === "fetched" && documents.some(document => document.evidenceRef === `policy-text:${surface.observationId}`));
  const inventoryResult = collectionSurfaceInventorySchema.safeParse(bundle.collectionSurfaceInventory);
  const inventory = inventoryResult.success && inventoryResult.data.pageUrl === assessment.documentUrl && ["pre_consent","fresh_pre_consent"].includes(inventoryResult.data.scenario) &&
    inventoryResult.data.coverage.status === "complete" && !inventoryResult.data.coverage.candidateScanTruncated && !inventoryResult.data.coverage.retentionTruncated ? inventoryResult.data : null;
  const formNoticesCovered = inventory?.forms.every(form=> {
    if (form.fieldsTruncated) return false;
    const fields=form.fields.filter(field=>!field.disabled && !field.readOnly);
    if (fields.every(field=>field.semanticCategory === "search")) return true;
    if (fields.some(field=>field.semanticCategory === "unknown") || !form.privacyDisclosure || form.privacyDisclosure.truncated) return false;
    return form.privacyDisclosure.excerpts.some(excerpt=>locateCaliforniaReviewTopics(excerpt.text).topics.some(row=>row.topic === "purposes") &&
      excerpt.links.some(link=>documents.some(document=>{
        try {const url=new URL(link.url);url.search="";url.hash="";return document.url === url.toString();} catch {return false;}
      })));
  }) === true;
  add("collection_notice", namedCollectionNotice && policyComplete && formNoticesCovered && topic("categories") && topic("purposes") && topic("retention") ? "observed" : captureBasedPolicy && inventory ? "review" : "unknown",
    captureBasedPolicy && inventory ? "Complete form inventory retained. Review captured collection points and associated notice text; complete capture does not establish notice adequacy." :
      "A named collection notice, retained categories/purposes/retention and complete form inspection are required; personal-data forms also need an associated purpose notice and retained policy destination.",
    [...refs,...(inventory?.evidenceRefs.map(ref=>ref.refId)??[])]);
  add("sale_sharing", policyComplete && !advertisingReview && ["declares_no_sale_sharing","describes_sale_sharing"].includes(policyStatement) ? "observed" : documents.length ? "review" : "unknown",
    advertisingReview ? "Advertising-classified baseline activity needs recipient-role review against the no-sale/sharing policy claim; legal sale/sharing is unproven." :
    "Explicit sale/sharing policy claims are retained; analytics or third-party requests alone do not establish legal sale or sharing.");
  const choiceComplete = isCurrentCaliforniaChoiceInspection(assessment.inspection) && assessment.inspection?.coverage === "complete" && assessment.choiceSurface !== "unknown";
  const noSaleClaim = policyComplete && !advertisingReview && policyStatement === "declares_no_sale_sharing";
  const observedOptOut = assessment.optOutObservation?.evidence.status === "complete";
  const brokenChoice = assessment.controls.some(control=>control.destinationStatus === "http_error");
  add("privacy_choices", choiceComplete && brokenChoice ? "observed" : choiceComplete && noSaleClaim ? "not_triggered_in_scope" : choiceComplete && assessment.choiceSurface === "observed" && observedOptOut ? "observed" :
    choiceComplete ? "review" : "unknown",
    brokenChoice ? "A visible named privacy-choice destination returned a verified HTTP 404 or 410 response." :
    noSaleClaim ? "Policy declares no sale/sharing; no mandatory page-link obligation is inferred. The declaration is not independently verified." :
    "Named-choice inspection and verified opt-out observation are separate; absent labels or an untested control do not prove an ineffective opt-out.",
    [...assessment.controls.map(control=>control.evidenceRef),...refs]);
  const sourceDocuments = documents.map(({evidenceRef,url,sha256,complete})=>({evidenceRef,url,sha256,complete}));
  const captureCoverage = {policyTextComplete:Boolean(policyComplete),choiceInventoryComplete:Boolean(choiceComplete),collectionInventoryComplete:Boolean(inventory)};
  return californiaCoverageSchema.parse({contractVersion:captureBasedPolicy ? "certscore.california-review-coverage.v2" : "certscore.california-review-coverage.v1",postureBasis:"assuming_ccpa_applies",
    runtimeCoverage,policyStatement,sourceDocuments,topics,families,
    ...(captureBasedPolicy ? {captureCoverage} : {}),
    scoreReady:runtimeCoverage === "complete" && policyComplete && (captureBasedPolicy ? Object.values(captureCoverage).every(Boolean) : families.every(family=>["observed","not_triggered_in_scope"].includes(family.status)))});
}
