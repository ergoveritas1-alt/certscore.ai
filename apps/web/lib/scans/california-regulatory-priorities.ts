import {buildCanonicalGpcResponseProjection} from "./gpc-response-projection";
import { californiaPrivacyReviewFindingIds, californiaPrivacyReviewCopy } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { SitePriorityFinding } from "./full-site-priority-review";

/** Consume policy-eligible persisted unified outputs, never lane labels or workpaper evidence. */
export function projectCaliforniaRegulatoryPriorities(findings: UnifiedFindingDisplayPacket[]): Omit<SitePriorityFinding, "pages" | "rank">[] {
  const eligible = findings.filter(finding => finding.presentationDecision.status === "surface" && finding.surfacingDecision?.reportable &&
    finding.concernContext?.promotionEligibilities.includes("eligible") &&
    finding.concernContext?.externalSurfacingEligibilities.includes("eligible"));
  const result: Omit<SitePriorityFinding, "pages" | "rank">[] = [];
  for (const finding of eligible) {
    if (finding.details?.family !== "california_privacy_review" || !californiaPrivacyReviewFindingIds(finding.details.projection).includes(finding.unifiedFindingId)) continue;
    const projection = finding.details.projection;
    const copy = californiaPrivacyReviewCopy(finding.unifiedFindingId, projection);
    result.push({ id: finding.unifiedFindingId, title: copy.title, summary: copy.description,
      status: "Partial concern", evidence: [
        ...((projection.contractVersion === "certscore.california-privacy-review.v5" || projection.contractVersion === "certscore.california-privacy-review.v6" || (projection.contractVersion === "certscore.california-privacy-review.v7" || (projection.contractVersion === "certscore.california-privacy-review.v8" || (projection.contractVersion === "certscore.california-privacy-review.v9" || projection.contractVersion === "certscore.california-privacy-review.v10")))) && projection.rightsAssessment ? [
          ...projection.rightsAssessment.topics.map(topic=>`${topic.topic.replaceAll("_"," ")}: ${topic.status.replaceAll("_"," ")} — ${topic.reason}`),
          ...projection.rightsAssessment.topics.flatMap(topic=>topic.passages.map(passage=>passage.excerpt)),
        ] : []),
        ...(projection.contractVersion === "certscore.california-privacy-review.v4" && projection.disclosureInspection ? [
          ...projection.disclosureInspection.topics.map(topic => `${topic.topic.replaceAll("_", " ")}: ${topic.status === "not_observed" ? "no candidate wording in complete retained English policy text" : "candidate wording retained; adequacy unassessed"}`),
          ...projection.disclosureInspection.documents.map(document => `${document.evidenceRef}: ${document.inspectedChars} characters inspected · SHA-256 ${document.textSha256}`),
        ] : []),
        ...projection.controls.map(row => `${row.label}: ${row.destinationStatus}${row.httpStatus ? ` ${row.httpStatus}` : ""}`),
        ...(projection.optOutObservation?.evidence.requests ?? []).map(row => `${row.vendor} (${row.hostname}): HTTP ${row.httpStatus}, ${row.msAfterConfirmation} ms after recorded opt-out`),
      ],
      evidenceJson: { findingId: finding.unifiedFindingId, californiaPrivacyReview: projection },
      correctionSteps: [copy.action] });
  }
  for(const finding of eligible) {
    if(finding.details?.family!=="california_collection_review")continue;
    result.push({id:finding.unifiedFindingId,title:finding.title,summary:finding.summary,status:"Partial concern",
      evidence:finding.details.assessments.flatMap(a=>a.rows.filter(r=>r.treatment==="potential_risk").map(r=>`${r.entity}: +${r.msFromAnchor} ms ${a.path==="gpc"?"from GPC visit start":"after Reject click"}; ${r.purpose} collection; sale/sharing purpose unresolved`)),
      evidenceJson:{findingId:finding.unifiedFindingId,assessments:finding.details.assessments},
      correctionSteps:["Review effective recipient settings, processing arrangements and privacy-choice enforcement."]});
  }
  const gpc=buildCanonicalGpcResponseProjection(eligible);
  if (gpc && gpc.californiaDeductionPoints > 0) result.push({id:"gpc_response",
    title:"GPC choice-enforcement risk observed",summary:gpc.summary,status:"Partial concern",
    evidence:gpc.observedFacts.map(row=>`${row.label}: ${row.value}`),
    evidenceJson:{findingId:"gpc_response",assessment:gpc.assessment},
    correctionSteps:["Check that GPC applies the relevant sale/sharing opt-out state and governs advertising collection."]});
  return result;
}
