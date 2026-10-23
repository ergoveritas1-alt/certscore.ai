import {cmpPreferencesEvidenceSchema,hasBoundCmpPreferenceDocument} from "@certscore/contracts";
import {matchCaliforniaCollectionNotices,matchCaliforniaCollectionNoticesV2,matchCaliforniaCollectionNoticesV3,matchCaliforniaCollectionNoticesV4,matchCaliforniaCollectionNoticesV5} from "./california-collection-notice-matching";
import { createHash } from "node:crypto";
import { assessCaliforniaRightsClauses,assessCaliforniaSaleSharingClauses, inspectCaliforniaRightsConcepts, californiaDisclosureInspectionSchema, verifiedSaleSharingOptOutSchema } from "@certscore/contracts";
import { californiaPrivacyReviewSchema, classifyPrivacySurface, isCurrentCaliforniaChoiceInspection, privacyChoiceInspectionSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectPrivacyAuditEvidence } from "./privacy-audit-projection";
import { projectCaliforniaReviewCoverage, type CaliforniaPolicyEvidence } from "./california-review-coverage-projection";
import { projectCaliforniaObservedScoreBasis } from "./california-observed-score-basis";

/** Materialize only from the checksum-verified original policy-lane observations.
 * The workpaper supplies positive facts; its empty lists never establish absence. */
export function projectCaliforniaPrivacyReview(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null, policyEvidence?: CaliforniaPolicyEvidence) {
  const workpaper = projectPrivacyAuditEvidence(bundle, source, documentUrl);
  const start = Date.parse(bundle.startedAt), end = Date.parse(bundle.completedAt);
  if (!workpaper || !documentUrl || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  // The workpaper sanitizes URLs for display. Typed provenance must retain the
  // original document identity, including query and fragment, to join its parent.
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
      ...(exactDestinationError ? {httpStatus: observed!.httpStatus as 404 | 410} : {}) };
  });
  // Independently verified, read-only linked settings can supply positive
  // named choice facts. They never establish homepage absence or execution.
  const linkedPacket=cmpPreferencesEvidenceSchema.safeParse(bundle.cmpPreferencesEvidence);
  if(linkedPacket.success) {
    const packet=linkedPacket.data;
    if(packet.linkedPreferenceNavigation && packet.scanId===bundle.scanId && packet.targetUrl===documentUrl &&
      hasBoundCmpPreferenceDocument(packet) && packet.checkpoints?.controls &&
      Date.parse(packet.startedAt)>=start-5000 && Date.parse(packet.completedAt)<=end &&
      !packet.limitations.includes("preference_document_changed")) {
      packet.controls.forEach((control,index)=>{
        const kind=classifyPrivacySurface({linkText:control.label}).surfaceType;
        if(control.enabled && ["do_not_sell_or_share","your_privacy_choices"].includes(kind) && controls.length<12 &&
          !controls.some(row=>row.label===control.label&&row.destinationUrl===packet.finalUrl)) {
          controls.push({label:control.label.slice(0,200),kind:kind as "do_not_sell_or_share"|"your_privacy_choices",
            evidenceRef:`CmpPreferencesEvidencePacket.json#controls.${index}`,destinationUrl:packet.finalUrl,destinationStatus:"retrieved"});
        }
      });
    }
  }
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
  const transferPolicy=bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v10";
  const readUsePolicy=transferPolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v9";
  const runtimePurposePolicy=readUsePolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v8";
  const categoryPolicy=runtimePurposePolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v7";
  const refinedPolicy=categoryPolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v6";
  const clausePolicy=refinedPolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v5";
  const disclosurePolicy = clausePolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v4";
  const captureBasedPolicy = disclosurePolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v3";
  const newCoverage = captureBasedPolicy || bundle.policySurfaceInspection?.californiaReviewPolicy === "california-privacy-review.v2" || isCurrentCaliforniaChoiceInspection(inspection);
  const reviewCoverage = newCoverage ? projectCaliforniaReviewCoverage(bundle, source!.sha256!, {
    documentUrl:documentUrl, inspection, choiceSurface, controls, ...(verifiedOptOut ? {optOutObservation:verifiedOptOut}:{}),
  }, policyEvidence) : undefined;
  // Negative conclusions require verified full source text, not a missing positive
  // passage. Unknown languages, translation, truncation and missing supplements
  // cannot support this English-only concept inventory.
  const inspectedDocuments = reviewCoverage?.sourceDocuments.map(document => {
    const observationId = document.evidenceRef.replace(/^policy-text:/, "");
    const surface = bundle.policySurfaceObservations.find(row => row.observationId === observationId);
    const text = policyEvidence?.texts.find(row => row.observationId === observationId)?.text;
    return surface?.documentLanguage?.split("-")[0] === "en" && !surface.translationApplied && text
      ? {document, text} : null;
  });
  const disclosureInspection = disclosurePolicy && reviewCoverage?.contractVersion === "certscore.california-review-coverage.v2" &&
    reviewCoverage.captureCoverage.policyTextComplete && inspectedDocuments?.length && inspectedDocuments.every(row => row !== null)
    ? californiaDisclosureInspectionSchema.parse({contractVersion:"certscore.california-disclosure-inspection.v1",sourceBundleSha256:source!.sha256,
      method:"complete_english_policy_concept_inventory.v1",documents:inspectedDocuments.map(row => ({evidenceRef:row!.document.evidenceRef,
        textSha256:createHash("sha256").update(row!.text).digest("hex"),inspectedChars:row!.text.length})),
      topics:inspectCaliforniaRightsConcepts(inspectedDocuments.map(row => row!.text))}) : undefined;
  const clauseDocuments=disclosureInspection ? inspectedDocuments!.map(row=>({evidenceRef:row!.document.evidenceRef,
    textSha256:createHash("sha256").update(row!.text).digest("hex"),text:row!.text,url:row!.document.url})) : [];
  // Positive clauses from verified, complete individual documents survive an
  // unresolved supplement. Only complete governing coverage permits negatives.
  let positivePassageLanguage = false;
  const positiveDocuments = (reviewCoverage?.sourceDocuments ?? []).flatMap(document => {
    if (!document.complete) return [];
    const observationId = document.evidenceRef.replace(/^policy-text:/, "");
    const surface = bundle.policySurfaceObservations.find(row => row.observationId === observationId);
    const text = policyEvidence?.texts.find(row => row.observationId === observationId)?.text;
    if (!surface || surface.translationApplied || !text ||
        createHash("sha256").update(text).digest("hex") !== document.sha256) return [];
    const language = surface.documentLanguage?.trim().toLowerCase();
    if (language && language.split("-")[0] !== "en") return [];
    // Current assessments may retain explicit English grant clauses even when
    // the document has no language tag. English-only deterministic passage
    // matching establishes positives; it cannot establish any missing right.
    if (!language) {
      if (!transferPolicy) return [];
      positivePassageLanguage = true;
    }
    return [{ evidenceRef: document.evidenceRef,
      textSha256: createHash("sha256").update(text).digest("hex"), text, url: document.url }];
  });
  const rightsAssessment = clausePolicy && (disclosureInspection || transferPolicy) && positiveDocuments.length
    ? assessCaliforniaRightsClauses(positiveDocuments, source!.sha256!, {
        completeCoverage: Boolean(disclosureInspection), positivePassageLanguage,
      }) : undefined;
  const saleSharingAssessment=refinedPolicy && disclosureInspection?assessCaliforniaSaleSharingClauses(clauseDocuments,source!.sha256!):undefined;
  const collectionNoticeAssessment=clausePolicy ? (readUsePolicy?matchCaliforniaCollectionNoticesV5:runtimePurposePolicy?matchCaliforniaCollectionNoticesV4:categoryPolicy?matchCaliforniaCollectionNoticesV3:refinedPolicy?matchCaliforniaCollectionNoticesV2:matchCaliforniaCollectionNotices)({bundle,sourceHash:source!.sha256!,documentUrl:documentUrl,
    documents:clauseDocuments,policyComplete:Boolean(disclosureInspection),inventoryComplete:reviewCoverage?.contractVersion === "certscore.california-review-coverage.v2" && reviewCoverage.captureCoverage.collectionInventoryComplete}) : undefined;
  if(clausePolicy && reviewCoverage) {
    const rights=reviewCoverage.families.find(family=>family.id === "california_rights")!;
    if(rightsAssessment) {
      const disclosed=rightsAssessment.topics.filter(topic=>topic.status === "disclosed").map(topic=>topic.topic.replaceAll("_"," "));
      const missing=rightsAssessment.topics.filter(topic=>topic.status === "not_observed").map(topic=>topic.topic.replaceAll("_"," "));
      rights.status=disclosed.length === 4 ? "observed":refinedPolicy && missing.length && rightsAssessment.topics.every(topic=>topic.status!=="review")?"assessed_gap":"review";
      rights.reason=`Clause inspection: ${disclosed.length?disclosed.join(", ")+" wording retained":"no resolved positive clauses"}${missing.length?"; "+missing.join(", ")+" not observed":""}. California adequacy remains separate.`.slice(0,240);
    }
    if(refinedPolicy && saleSharingAssessment) {
      const sale=reviewCoverage.families.find(family=>family.id === "sale_sharing")!;
      const rows=saleSharingAssessment.topics;
      const status=(topic:string)=>rows.find(row=>row.topic === topic)!.status.replaceAll("_"," ");
      const claim=saleSharingAssessment.choiceBasis;
      const baselineIds=new Set((bundle.networkEvents??[]).filter(event=>["pre_consent","fresh_pre_consent"].includes(event.scenario??"") && event.documentUrl===documentUrl).map(event=>event.eventId));
      const advertising=(bundle.normalizedVendorObservations??[]).some(vendor=>vendor.purpose === "advertising" && vendor.matchSources.some(match=>["pre_consent","fresh_pre_consent"].includes(match.scenario??"") && match.sourceEventId && baselineIds.has(match.sourceEventId)));
      const unresolved=rows.filter(row=>row.topic === "sale" || row.topic === "cross_context_sharing").some(row=>["qualified","conflicting","review","not_observed"].includes(row.status));
      sale.status=!unresolved && !(claim === "declared_neither" && advertising)?"observed":"review";
      sale.reason=`Sale: ${status("sale")}; cross-context sharing: ${status("cross_context_sharing")}; operational disclosures: ${status("operational_disclosures")}; analytics: ${status("analytics")}. Policy claims are separate from verified practices.`.slice(0,240);
      reviewCoverage.policyStatement=claim === "declared_neither"?"declares_no_sale_sharing":claim === "declared_sale_or_sharing"?"describes_sale_sharing":
        rows.some(row=>row.status === "conflicting")?"conflicting":"not_identified";
      const choices=reviewCoverage.families.find(family=>family.id === "privacy_choices")!;
      const complete=reviewCoverage.contractVersion!=="certscore.california-review-coverage.v1" && reviewCoverage.captureCoverage.choiceInventoryComplete;
      const noSale=claim === "declared_neither" && !advertising && !unresolved;
      choices.status=complete && noSale?"not_triggered_in_scope":complete && (controls.some(control=>control.destinationStatus === "http_error") || choiceSurface === "observed" && verifiedOptOut?.evidence.status === "complete")?"observed":complete?"review":"unknown";
      choices.reason=complete && noSale?"Policy expressly denies sale and cross-context sharing; no page-link obligation is inferred from the retained scope. Practices remain independently unverified.":
        choiceSurface === "not_observed_in_inspected_scope"?"Complete homepage inspection found no named choice. Sale/sharing obligation remains unresolved; no ineffective opt-out or legal breach is inferred.":
        "Named choice and policy claims retained separately; verified execution and applicable opt-out requirements remain distinct checks.";
    }
    const collection=reviewCoverage.families.find(family=>family.id === "collection_notice")!;
    if(collectionNoticeAssessment) {
      const points=collectionNoticeAssessment.points;
      collection.status=collectionNoticeAssessment.inventoryComplete && points.length>0 && points.every(point=>point.status === "matched_text")?"observed":"review";
      collection.reason=`${points.filter(point=>point.status === "matched_text").length} of ${points.length} observed collection/activity points have associated matching notice text. Form association, passive activity and notice adequacy are recorded separately.`;
      if((collectionNoticeAssessment.contractVersion === "certscore.california-collection-notice-matching.v3" || (collectionNoticeAssessment.contractVersion === "certscore.california-collection-notice-matching.v4" || collectionNoticeAssessment.contractVersion === "certscore.california-collection-notice-matching.v5"))) {
        const scoped=collectionNoticeAssessment.points.filter(point=>point.assessmentScope === "category_purpose");
        collection.status=collectionNoticeAssessment.inventoryComplete && scoped.length>0 && scoped.every(point=>point.status === "matched_text")?"observed":"review";
        collection.reason=`${scoped.filter(point=>point.categoryMatch === "wording_retained").length} of ${scoped.length} collection points have category wording; ${scoped.filter(point=>point.purposeMatch === "wording_retained").length} have relevant purpose wording. Product-name lookups are separate technical context.`;
      }
    }
  }
  const assessmentCoverage=categoryPolicy && reviewCoverage?{...reviewCoverage,contractVersion:"certscore.california-review-coverage.v4" as const,
    families:reviewCoverage.families.map(family=>{
      let assessmentState: "completed"|"partial"|"limited"=family.status === "unknown"?"limited":["observed","assessed_gap","not_triggered_in_scope"].includes(family.status)?"completed":"partial";
      let followUp:import("@certscore/contracts").CaliforniaFollowUp=family.status === "unknown"?"capture":family.status === "review"?"interpretation":"none";
      // Broad topic presence cannot complete the versioned clause assessment.
      // Preserve unrelated verified families when a policy lacks the language
      // or governing-scope proof required for these substantive conclusions.
      if ((family.id === "california_rights" && !rightsAssessment || family.id === "sale_sharing" && !saleSharingAssessment) &&
          assessmentState === "completed") {
        family = {...family, status:"review", reason:"Retained policy topics require a verified, resolved clause assessment before this family can be completed."};
        assessmentState = "partial";
        followUp = "interpretation";
      }
      if(family.id === "sale_sharing" && saleSharingAssessment) {
        assessmentState=saleSharingAssessment.topics.every(topic=>!["review","qualified","conflicting"].includes(topic.status))?"completed":"partial";
        followUp=family.status === "review"?assessmentState === "completed"?"recipient_roles":"interpretation":"none";
        if(assessmentState === "completed" && family.status === "review")family={...family,reason:"Policy wording assessed: operational/analytics claims and explicit sale/sharing statements are retained separately. Actual recipient roles and applicable obligations remain unresolved."};
      }
      if(family.id === "privacy_choices" && reviewCoverage.contractVersion!=="certscore.california-review-coverage.v1") {
        assessmentState=reviewCoverage.captureCoverage.choiceInventoryComplete?"completed":"limited";
        followUp=family.status === "review"?choiceSurface === "not_observed_in_inspected_scope"?"applicability":"choice_execution":family.status === "unknown"?"capture":"none";
      }
      if(family.id === "collection_notice" && (collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v3" || (collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v4" || collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v5"))) {
        const scoped=collectionNoticeAssessment.points.filter(point=>point.assessmentScope === "category_purpose");
        const captureLimited=!collectionNoticeAssessment.inventoryComplete || scoped.some(point=>point.status === "limited");
        const purposeUnresolved=scoped.some(point=>point.categoryMatch === "unresolved" || point.purposeMatch === "unresolved");
        assessmentState=captureLimited?"limited":purposeUnresolved?"partial":"completed";
        followUp=captureLimited?"capture":purposeUnresolved?"purpose":family.status === "review"?"notice_association":"none";
      }
      return {...family,assessmentState,followUp};
    })}:undefined;
  const result = californiaPrivacyReviewSchema.safeParse({
    contractVersion: transferPolicy ? "certscore.california-privacy-review.v10" : readUsePolicy ? "certscore.california-privacy-review.v9" : runtimePurposePolicy ? "certscore.california-privacy-review.v8" : categoryPolicy ? "certscore.california-privacy-review.v7" : refinedPolicy ? "certscore.california-privacy-review.v6" : clausePolicy ? "certscore.california-privacy-review.v5" : disclosurePolicy ? "certscore.california-privacy-review.v4" : captureBasedPolicy ? "certscore.california-privacy-review.v3" : newCoverage ? "certscore.california-privacy-review.v2" : "certscore.california-privacy-review.v1",
    policyVersion: transferPolicy ? "california-privacy-review.v10" : readUsePolicy ? "california-privacy-review.v9" : runtimePurposePolicy ? "california-privacy-review.v8" : categoryPolicy ? "california-privacy-review.v7" : refinedPolicy ? "california-privacy-review.v6" : clausePolicy ? "california-privacy-review.v5" : disclosurePolicy ? "california-privacy-review.v4" : captureBasedPolicy ? "california-privacy-review.v3" : newCoverage ? "california-privacy-review.v2" : "california-privacy-review.v1",
    scanId: bundle.scanId, documentUrl: documentUrl, capturedAt: bundle.completedAt,
    sourceHash: source!.sha256, verificationStatus: "verified", scoreEffect: "none", applicability: "not_determined",
    ...(transferPolicy ? {observedScoreBasis:projectCaliforniaObservedScoreBasis(bundle,source,documentUrl)} : {}),
    inspection, choiceSurface, controls, controlsTruncated: workpaper.truncated, failedNoticeLinks,
    ...(verifiedOptOut ? {optOutObservation: verifiedOptOut} : {}),
    optOutEffectiveness: verifiedOptOut?.evidence.status === "complete" ? "bounded_observation" : "not_assessed", noticeAdequacy: "not_assessed",
    noticeTopics: [...new Set(workpaper.notices.flatMap(notice => notice.passages.map(passage => passage.topic)))],
    noticeEvidenceRefs: workpaper.notices.map(notice => notice.evidenceRef),
    ...(reviewCoverage ? {reviewCoverage:assessmentCoverage??(refinedPolicy?{...reviewCoverage,contractVersion:"certscore.california-review-coverage.v3"}:reviewCoverage)} : {}),
    ...(disclosureInspection ? {disclosureInspection} : {}),
    ...(clausePolicy ? {rightsAssessment,collectionNoticeAssessment} : {}),
    ...(refinedPolicy?{saleSharingAssessment}:{}),
  });
  return result.success ? result.data : null;
}
