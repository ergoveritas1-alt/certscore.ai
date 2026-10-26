import { CALIFORNIA_AGENT_REGISTRATION_ID, californiaAgentRegistrationProjectionSchema } from "@certscore/contracts";
import {describeGpcObservedFacts} from "./gpc-observed-facts";
import {supportsCombinedOptOutRisk} from "./california-combined-opt-out-policy";
import {createHash} from "node:crypto";
import {buildCanonicalGpcResponseProjection} from "./gpc-response-projection";
import { CALIFORNIA_COMBINED_OPT_OUT_POLICY,californiaPrivacyReviewFindingIds, californiaPrivacyReviewCopy } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { SitePriorityFinding } from "./full-site-priority-review";

/** Consume policy-eligible persisted unified outputs, never lane labels or workpaper evidence. */
export function projectCaliforniaRegulatoryPriorities(findings: UnifiedFindingDisplayPacket[]): Omit<SitePriorityFinding, "pages" | "rank">[] {
  const eligible = findings.filter(finding => finding.presentationDecision.status === "surface" && finding.surfacingDecision?.reportable &&
    finding.concernContext?.promotionEligibilities.includes("eligible") &&
    finding.concernContext?.externalSurfacingEligibilities.includes("eligible"));
  const gpc=buildCanonicalGpcResponseProjection(eligible);
  const gpcObservation=gpc?.assessment.contractVersion === "certscore.gpc-response-assessment.v3" ? gpc.assessment.observation : undefined;
  const result: Omit<SitePriorityFinding, "pages" | "rank">[] = [];
  for (const finding of eligible) {
    if (finding.unifiedFindingId === CALIFORNIA_AGENT_REGISTRATION_ID && finding.details?.family === "california_agent_registration") {
      const parsed = californiaAgentRegistrationProjectionSchema.safeParse(finding.details.projection);
      if (!parsed.success) continue;
      const proof = parsed.data.assessment, copy = californiaPrivacyReviewCopy(CALIFORNIA_AGENT_REGISTRATION_ID);
      result.push({id: CALIFORNIA_AGENT_REGISTRATION_ID, title: copy.title, summary: copy.description,
        severity: finding.severity, status: "Partial concern",
        evidence: [proof.excerpt, `${proof.sourceDocumentUrl} · Evidence: ${proof.evidenceRef}`],
        evidenceJson: {findingId: CALIFORNIA_AGENT_REGISTRATION_ID, agentRegistrationProjection: parsed.data},
        correctionSteps: [copy.action]});
      continue;
    }
    if (finding.details?.family !== "california_privacy_review" || !californiaPrivacyReviewFindingIds(finding.details.projection).includes(finding.unifiedFindingId)) continue;
    const projection = finding.details.projection;
    const copy = californiaPrivacyReviewCopy(finding.unifiedFindingId, projection);
    const combined=finding.unifiedFindingId==="california_privacy_choice_not_observed" && supportsCombinedOptOutRisk(projection,finding.details.gpcAssessment);
    const documentUrlSha256=createHash("sha256").update(projection.documentUrl).digest("hex");
    const reject=eligible.flatMap(row=>row.unifiedFindingId === "california_post_reject_collection" && row.details?.family === "california_post_reject" ? [row.details.assessment] : [])
      .find(a=>a.scanId===projection.scanId && a.targetSha256===documentUrlSha256 && a.status==="qualified_collection" &&
        a.scope==="cookie_tracking_rejection" && a.sourcePacketSha256 && a.recipientIds.length>0);
    result.push({ id: finding.unifiedFindingId, title: copy.title, summary: copy.description,
      severity:finding.severity,
      priority: finding.severity==="high"?"high":undefined,
      status: "Partial concern", evidence: [
        ...(!combined && (projection.contractVersion === "certscore.california-privacy-review.v5" || projection.contractVersion === "certscore.california-privacy-review.v6" || (projection.contractVersion === "certscore.california-privacy-review.v7" || (projection.contractVersion === "certscore.california-privacy-review.v8" || (projection.contractVersion === "certscore.california-privacy-review.v9" || projection.contractVersion === "certscore.california-privacy-review.v10")))) && projection.rightsAssessment ? [
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
      evidenceJson: { findingId: finding.unifiedFindingId, californiaPrivacyReview: projection,
        ...(combined?{combinedGpcAssessment:finding.details.gpcAssessment,
          combinedGpcFacts:finding.details.gpcAssessment?.contractVersion==="certscore.gpc-response-assessment.v3"
            ? [{label:"Opt-out inspection",value:`Rendered named links and buttons on ${projection.documentUrl}`},
              {label:"Advertising activity",value:`${projection.contractVersion==="certscore.california-privacy-review.v10" && projection.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_COMBINED_OPT_OUT_POLICY ? projection.disclosureChoiceAssessment.optOutRisk?.advertisingEvidenceIds.length??0:0} successful advertising/marketing request records retained`},
              ...describeGpcObservedFacts(finding.details.gpcAssessment.observation)]:[],
          combinedGpcVendors:gpc?.vendorFindings?.map(row=>`${row.entity}${row.firstMs===undefined?"":` · first observed +${row.firstMs} ms from GPC visit start`}`)??[],
        }:{}),
        ...(finding.unifiedFindingId === "california_privacy_choice_not_observed" ? {californiaPriorityBinding: {
          version: "california_priority_binding.v1", scanId: projection.scanId, documentUrl: projection.documentUrl,
          documentUrlSha256, sourceHash: projection.sourceHash,
          ...(reject?{qualifiedPostReject:{sourcePacketSha256:reject.sourcePacketSha256,recipientIds:reject.recipientIds}}:{}),
        }} : {}),
      },
      correctionSteps: [copy.action] });
  }
  for(const finding of eligible) {
    if(finding.details?.family!=="california_collection_review")continue;
    result.push({id:finding.unifiedFindingId,title:finding.title,summary:finding.summary,status:"Partial concern",
      evidence:finding.details.assessments.flatMap(a=>a.rows.filter(r=>r.treatment==="potential_risk").map(r=>`${r.entity}: +${r.msFromAnchor} ms ${a.path==="gpc"?"from GPC visit start":"after Reject click"}; ${r.purpose} collection; sale/sharing purpose unresolved`)),
      evidenceJson:{findingId:finding.unifiedFindingId,assessments:finding.details.assessments,
        ...(gpcObservation?.scanId && gpcObservation.sourceSha256 && gpcObservation.sessionSha256 && gpcObservation.documentUrlSha256 ? {gpcPriorityBinding: {
          version:"california_gpc_priority_binding.v1",scanId:gpcObservation.scanId,sourceSha256:gpcObservation.sourceSha256,
          sessionSha256:gpcObservation.sessionSha256,documentUrlSha256:gpcObservation.documentUrlSha256,
        }} : {}),
      },
      correctionSteps:["Review effective recipient settings, processing arrangements and privacy-choice enforcement."]});
  }
  if (gpc && gpc.californiaDeductionPoints > 0 && !result.some(row=>row.id==="california_privacy_choice_not_observed" &&
    row.evidenceJson?.combinedGpcAssessment && eligible.some(f=>f.unifiedFindingId===row.id && f.details?.family==="california_privacy_review" && supportsCombinedOptOutRisk(f.details.projection,gpc.assessment)))) result.push({id:"gpc_response",
    title:"GPC choice-enforcement risk observed",summary:gpc.summary,status:"Partial concern",
    evidence:gpc.observedFacts.map(row=>`${row.label}: ${row.value}`),
    evidenceJson:{findingId:"gpc_response",assessment:gpc.assessment},
    correctionSteps:["Check that GPC applies the relevant sale/sharing opt-out state and governs advertising collection."]});
  return result;
}
