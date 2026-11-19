import {CA_REJECT_IDENTIFIER_TRANSMISSION_POINTS} from "./scoring-policy";
import {isIdentifierEventRequest,isTrackingIdentifierCookie} from "./reject-tracking-identifier";
import {CALIFORNIA_VERIFIED_COLLECTION_TOTALS,CALIFORNIA_PRESENCE_REVIEW_TOTALS,CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS,californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
import {type GpcBoundedObservation,hasVerifiedChoiceReviewEvent,sanitizeRuntimeGraphUrl,readBoundMeasurementRequestEvidence,gpcResponseAssessmentSchema, postRefusalReportProjectionSchema, isQualifyingSaleSharingRequest} from "@certscore/contracts";
import {inspectGpcRequestQualification,resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {createHash} from "node:crypto";
import {retainedRejectEntityEvidence} from "./reject-presence-entities";
import {retainedCurrentRejectPresence,retainedRejectPresence} from "./reject-presence-evidence";
import {assessCaliforniaPostReject,PROPERTY_BOUND_POST_REJECT_POLICY} from "./california-post-reject-policy";

import { supportsPresence, CA_VERIFIED_COLLECTION_POLICY, presencePurposeSchema, CA_PRESENCE_RISK_POLICY, CA_PER_VISIT_RISK_POLICY, CA_IDENTIFIER_RISK_POLICY,  CA_RETAINED_SCOPE_RISK_POLICY, CA_POTENTIAL_RISK_LEGACY_POLICY, CA_POTENTIAL_RISK_POLICY, californiaPotentialRiskSchema, type CaliforniaPotentialRiskAssessment } from "./california-potential-risk-contract";
export * from "./california-potential-risk-contract";
/** Select the materialization policy while preserving each visit’s versioned weights. */
export function collectionReviewScorePolicy(assessments: readonly CaliforniaPotentialRiskAssessment[]) {
  const first = assessments[0]?.policyVersion;
  if (assessments.every(a => a.policyVersion === first)) return first;
  if (assessments.some(a => a.policyVersion === CA_VERIFIED_COLLECTION_POLICY) && assessments.every(a => a.policyVersion !== CA_POTENTIAL_RISK_LEGACY_POLICY && a.policyVersion !== "california.collection-review.v2")) return CA_VERIFIED_COLLECTION_POLICY;
  if (assessments.some(a => a.policyVersion === CA_PRESENCE_RISK_POLICY) && assessments.every(a => a.policyVersion !== CA_POTENTIAL_RISK_LEGACY_POLICY && a.policyVersion !== "california.collection-review.v2")) return CA_PRESENCE_RISK_POLICY;
  if (assessments.some(a => a.policyVersion === CA_PER_VISIT_RISK_POLICY) &&
      assessments.every(a => [CA_RETAINED_SCOPE_RISK_POLICY, CA_POTENTIAL_RISK_POLICY, CA_IDENTIFIER_RISK_POLICY, CA_PER_VISIT_RISK_POLICY].some(v => v === a.policyVersion))) return CA_PER_VISIT_RISK_POLICY;
  if (assessments.some(a=>a.policyVersion === CA_IDENTIFIER_RISK_POLICY) &&
      assessments.every(a=>[CA_RETAINED_SCOPE_RISK_POLICY, CA_POTENTIAL_RISK_POLICY, CA_IDENTIFIER_RISK_POLICY].some(v=>v===a.policyVersion))) return CA_IDENTIFIER_RISK_POLICY;
  if (assessments.every(a => a.policyVersion === CA_RETAINED_SCOPE_RISK_POLICY || a.policyVersion === CA_POTENTIAL_RISK_POLICY)) {
    return CA_POTENTIAL_RISK_POLICY;
  }
  return undefined;
}
export function potentialRiskPoints(ids:Iterable<string>,version:string=CA_POTENTIAL_RISK_POLICY):number {
 const count=new Set(ids).size;
 if (supportsPresence(version)) return CALIFORNIA_PRESENCE_REVIEW_TOTALS[Math.min(count,CALIFORNIA_PRESENCE_REVIEW_TOTALS.length-1)]!;
 return count===0?0:version===CA_POTENTIAL_RISK_LEGACY_POLICY?5:[0,7,11,13,15][Math.min(count,4)]!;
}
/** Bound the mixed increment by the full schedule for the same total recipient
 * inventory. Promotion then cannot improve a score or exceed the shared cap. */
export function potentialRiskIncrement(full:Iterable<string>,potential:Iterable<string>,supported:boolean,version:string=CA_POTENTIAL_RISK_POLICY):number {
 const qualified=new Set(full),remaining=[...new Set(potential)].filter(id=>!qualified.has(id));
 const points=potentialRiskPoints(remaining,version);
 if(version===CA_POTENTIAL_RISK_LEGACY_POLICY)return points;
 return Math.min(points,Math.max(0,californiaChoiceEnforcementPoints([...qualified,...remaining],supported||remaining.length>0)-californiaChoiceEnforcementPoints([...qualified],supported)));
}
export type CaliforniaVisitRecipients = {
  gpc: Set<string>;
  reject: Set<string>;
  explicitOptOut: Set<string>;
  supported: boolean;
};

/** Score each tested visit once. Explicit opt-out still shares recipient credit
 * with the tested choices and never starts a third schedule. */
export function scoreCaliforniaCollectionVisits(
  assessments: CaliforniaPotentialRiskAssessment[],
  full?: CaliforniaVisitRecipients,
) {
  const cap = CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS.at(-1)!;
  const fullIds = {gpc: new Set(full?.gpc), reject: new Set(full?.reject)};
  const explicitGroup = fullIds.reject.size && !fullIds.gpc.size ? fullIds.reject : fullIds.gpc;
  for (const id of full?.explicitOptOut ?? []) {
    if (!fullIds.gpc.has(id) && !fullIds.reject.has(id)) explicitGroup.add(id);
  }
  let fullPoints = 0;
  let reviewPoints = 0;
  const reviewIds = new Set<string>();
  for (const path of ["gpc", "reject"] as const) {
    const visit = assessments.filter(a => a.path === path);
    const qualified = fullIds[path];
    const excluded = new Set([...qualified, ...(full?.explicitOptOut ?? [])]);
    const ids = potentialRiskRecipients(visit, excluded);
    for (const id of ids) reviewIds.add(id);
    fullPoints += californiaChoiceEnforcementPoints([...qualified], false);
    const contradictionOnly = path === "gpc" && full?.supported === true && !fullIds.gpc.size && !fullIds.reject.size;
    const version = collectionReviewScorePolicy(visit);
    if (version === CA_VERIFIED_COLLECTION_POLICY) {
      const verified = new Set(visit.flatMap(a => a.rows.filter(r => r.verifiedCollection && ids.includes(r.entityId)).map(r => r.entityId)));
      const verifiedTotal = CALIFORNIA_VERIFIED_COLLECTION_TOTALS[Math.min(verified.size, CALIFORNIA_VERIFIED_COLLECTION_TOTALS.length - 1)]!;
      const presenceTotal = potentialRiskPoints(ids, version);
      const partial = presenceTotal + verifiedTotal - potentialRiskPoints(verified, version);
      const headroom = californiaChoiceEnforcementPoints([...qualified, ...ids], contradictionOnly) - californiaChoiceEnforcementPoints([...qualified], contradictionOnly);
      reviewPoints += Math.min(partial, headroom);
    } else {
      reviewPoints += potentialRiskIncrement(qualified, ids, contradictionOnly, version);
    }
  }
  // A supported contradiction retains the initial effect, including when the
  // same GPC evidence already contributes a recipient.
  fullPoints = Math.min(cap, Math.max(fullPoints, californiaChoiceEnforcementPoints([], Boolean(full?.supported))));
  if (assessments.some(a => a.path === "reject" && a.identifierTransmission)) {
    reviewPoints += CA_REJECT_IDENTIFIER_TRANSMISSION_POINTS;
  }
  reviewPoints = Math.min(CALIFORNIA_PRESENCE_REVIEW_TOTALS.at(-1)!, cap - fullPoints, reviewPoints);
  return {fullPoints, reviewPoints, reviewIds: reviewPoints ? [...reviewIds].sort() : []};
}

/** Compute the shared effect once, even when multiple cookies or repeated findings refer to the transmission. */
export function scoreCaliforniaCollectionReview(assessments: CaliforniaPotentialRiskAssessment[], full?: CaliforniaVisitRecipients) {
  const version = collectionReviewScorePolicy(assessments);
  if (!version) return {reviewPoints: 0, reviewIds: []};
  if (supportsPresence(version) || version === CA_PER_VISIT_RISK_POLICY) return scoreCaliforniaCollectionVisits(assessments, full);
  const fullIds = full ? [...full.gpc, ...full.reject, ...full.explicitOptOut] : [];
  const supported = full?.supported ?? false;
  const recipients = potentialRiskRecipients(assessments,fullIds);
  const points = potentialRiskIncrement(fullIds,recipients,supported,version);
  const hasIndependentTransmission = assessments.some(a=>a.identifierTransmission &&
    !assessments.some(other=>other.path==="reject" && other.sourceSha256===a.sourceSha256 &&
      other.rows.some(r=>r.evidenceId===a.identifierTransmission!.requestId)));
  if (!hasIndependentTransmission) return {reviewPoints: points, reviewIds: recipients};
  const remaining = CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS.at(-1)! - californiaChoiceEnforcementPoints(fullIds,supported);
  return {reviewPoints: Math.min(15, remaining, points + CA_REJECT_IDENTIFIER_TRANSMISSION_POINTS), reviewIds: recipients};
}
const restricted = new Set(["google_rdp", "google_limited_ads", "meta_ldu", "us_privacy_sale_opt_out", "gpp_opt_out", "gpp_service_provider"]);
function requestSignals(q:Parameters<typeof isQualifyingSaleSharingRequest>[0]):string[] {
  const signals=new Set<string>(q.processingSignals);
  // Keep decoded declarations authoritative even if a historical producer
  // omitted the redundant convenience flag.
  if(q.gpp?.status==="decoded")for(const section of q.gpp.sections){
    if(section.saleOptOut===1||section.sharingOptOut===1||section.targetedAdvertisingOptOut===1)signals.add("gpp_opt_out");
    if(section.serviceProviderMode===1)signals.add("gpp_service_provider");
  }
  return [...signals];
}
function treatment(signals:string[],qualified:boolean):CaliforniaPotentialRiskAssessment["rows"][number]["treatment"] {
  return qualified?"qualified_collection":signals.some(s=>restricted.has(s))?"declared_restriction":"potential_risk";
}
export function assessGpcPotentialRisk(value:unknown,policyVersion:CaliforniaPotentialRiskAssessment["policyVersion"]=CA_VERIFIED_COLLECTION_POLICY):CaliforniaPotentialRiskAssessment|null {
  const parsed=gpcResponseAssessmentSchema.safeParse(value);
  if(!parsed.success||parsed.data.contractVersion!=="certscore.gpc-response-assessment.v3")return null;
  return assessGpcCollectionReviewObservation(parsed.data.observation, policyVersion);
}

export function assessGpcCollectionReviewObservation(o: GpcBoundedObservation, policyVersion: CaliforniaPotentialRiskAssessment["policyVersion"]) {
  if(!o.scanId||!o.requests.collectionReview||!o.sourceSha256||!o.sessionSha256||!o.documentUrlSha256||
    (!o.delivery.httpHeaderRetained||!o.delivery.mainNavigatorReadbackRetained)||!o.positiveEvidence?.representativeDocument)return null;
  const rows:CaliforniaPotentialRiskAssessment["rows"]=o.requests.collectionReview.rows.map(r => {
      const signals = requestSignals(r.qualification);
      const declaredOptOutPageView = policyVersion !== CA_VERIFIED_COLLECTION_POLICY && (policyVersion === CA_POTENTIAL_RISK_POLICY || policyVersion === CA_PER_VISIT_RISK_POLICY || supportsPresence(policyVersion)) &&
        r.measurement === "google_ccm_document_page_view" && signals.includes("us_privacy_sale_opt_out") &&
        signals.every(signal => signal === "us_privacy_sale_opt_out" || signal === "google_npa");
      const tier = declaredOptOutPageView ? "potential_risk" : treatment(signals, isQualifyingSaleSharingRequest(r.qualification));
      const verified = policyVersion === CA_VERIFIED_COLLECTION_POLICY && r.httpStatus < 300 &&
        tier === "potential_risk" && signals.every(signal => signal === "google_npa") &&
        (r.entityId !== "ent_1a007e52f2d1" || r.measurement === "openai_pixel_measurement");
      return {...(verified ? {verifiedCollection:true as const} : {}),evidenceId:r.evidenceId, entityId:r.entityId, entity:r.label, msFromAnchor:r.observedAtMs,
        purpose:r.purpose, processingSignals:signals, treatment:tier};
    });
  if (supportsPresence(policyVersion)) {
    for (const row of o.presenceEvidence ?? []) {
      if (!rows.some(r => r.evidenceId === row.evidenceId)) rows.push({...row, treatment:treatment(row.processingSignals,false)});
    }
  }
  return californiaPotentialRiskSchema.parse({policyVersion,path:"gpc",scanId:o.scanId,sourceSha256:o.sourceSha256,
    rows:supportsPresence(policyVersion)?selectReviewRows(rows):rows,responseUnverified:0,legalConclusion:"not_established"});
}
function selectReviewRows(rows: CaliforniaPotentialRiskAssessment["rows"]) {
  if (rows.length <= 32) return rows;
  const first = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const previous = first.get(row.entityId);
    if (!previous || previous.treatment === "declared_restriction" && row.treatment !== "declared_restriction" || previous.treatment === "potential_risk" && row.verifiedCollection && !previous.verifiedCollection) first.set(row.entityId,row);
  }
  const selected = new Set(first.values());
  return [...selected,...rows.filter(row => !selected.has(row))].slice(0,32);
}
export function assessRejectPotentialRisk(value:unknown,requestedVersion?:CaliforniaPotentialRiskAssessment["policyVersion"]):CaliforniaPotentialRiskAssessment|null {
  const parsed=postRefusalReportProjectionSchema.safeParse(value);if(!parsed.success)return null;
  const p=parsed.data;
  const policyVersion=requestedVersion ?? CA_VERIFIED_COLLECTION_POLICY;
  const presence=supportsPresence(policyVersion)?retainedCurrentRejectPresence(p):retainedRejectPresence(p),full=(supportsPresence(policyVersion) || policyVersion===CA_PER_VISIT_RISK_POLICY || policyVersion===CA_IDENTIFIER_RISK_POLICY || policyVersion===CA_POTENTIAL_RISK_POLICY || policyVersion===CA_RETAINED_SCOPE_RISK_POLICY)?assessCaliforniaPostReject(p):assessCaliforniaPostReject(p,PROPERTY_BOUND_POST_REJECT_POLICY);
  if(!presence||!p.packetSha256||!p.sourceIdentity||p.sourceIdentity.targetSha256!==p.actionControlProof?.authorizedTargetSha256||full?.scope!=="cookie_tracking_rejection")return null;
  const rows:CaliforniaPotentialRiskAssessment["rows"]=[];let responseUnverified=0;
  const presenceSignals = new Map<string,string[]>();
  for(const id of presence.requestIds) {
    if(p.scoringEvidence!.requests.filter(r=>r.requestId===id).length!==1)continue;
    const r=p.scoringEvidence!.requests.find(r=>r.requestId===id)!;
    let url:URL;try{url=new URL(r.sanitizedUrl);}catch{continue;}
    if(url.protocol!=="https:")continue;
    const retained=p.afterActionRequests?.find(r=>r.requestId===id);
    if(retained && (JSON.stringify(retained.californiaCollection)!==JSON.stringify(r.californiaCollection)||
      JSON.stringify(retained.measurementEvidence)!==JSON.stringify(r.measurementEvidence)||retained.httpStatus!==r.httpStatus))continue;
    const m=r.measurementEvidence,f=r.californiaCollection;
    // No purpose or payload inference from a historical sanitized URL. The
    // typed inspector must have positively identified this collection endpoint.
    if(m && (m.requestId!==id||m.timestampMs!==r.startedAtMs||m.method!==r.method||
      url.origin!==m.requestOrigin||url.pathname!==m.requestPath))continue;
    if(f&&(f.requestId!==id||f.method!==r.method||f.startedAtMs!==r.startedAtMs||f.origin!==url.origin||f.path!==url.pathname))continue;
    const vendor=resolveCanonicalVendor({type:"request",url:r.sanitizedUrl,sourceScanner:"reject_observation",matchSource:"network_request"}).observation;
    if (f && (f.entity.entityId!==vendor?.registryAttribution?.entityId ||
        f.httpStatus!=null && r.httpStatus!==undefined && f.httpStatus!==r.httpStatus)) continue;
    if (supportsPresence(policyVersion) && vendor?.registryAttribution && vendor.purpose===r.purpose) {
      presenceSignals.set(id,f ? requestSignals(f.qualification) : requestSignals(inspectGpcRequestQualification(r.sanitizedUrl)));
    }
    if (!f && !m) continue;
    const reviewEvent = (supportsPresence(policyVersion) || policyVersion === CA_PER_VISIT_RISK_POLICY) && f && retained && f.httpStatus != null && f.httpStatus >= 200 && f.httpStatus < 300 &&
      hasVerifiedChoiceReviewEvent(f,p.sourceIdentity!.targetSha256);
    if(!vendor||vendor.confidence<.9||(!vendor.registryAttribution || (vendor.registryAttribution.matchKind!=="endpoint" && !reviewEvent))||vendor.purpose!==r.purpose||
      !["analytics","advertising","marketing","session_replay"].includes(vendor.purpose))continue;
    if(f&&f.entity.entityId!==vendor.registryAttribution.entityId)continue;
    if(f?.httpStatus!==undefined&&f.httpStatus!==null&&r.httpStatus!==undefined&&f.httpStatus!==r.httpStatus)continue;
    const status=f?.httpStatus??r.httpStatus;
    if(status===undefined||status===null||status<200||status>=400||r.completedAtMs===undefined||r.completedAtMs>presence.end){responseUnverified++;continue;}
    const signals = f ? requestSignals(f.qualification) : [...new Set([
      "processing_declarations_not_retained",
      ...(policyVersion === CA_VERIFIED_COLLECTION_POLICY ? requestSignals(inspectGpcRequestQualification(r.sanitizedUrl)) : []),
      ...(r.googleConsentMode?.nonPersonalizedAds === "declared" ? ["google_npa"] : []),
    ])];
    const tier = treatment(signals,full.requests.some(q=>q.requestId===id&&q.reason==="qualified_collection"));
    const verified = policyVersion === CA_VERIFIED_COLLECTION_POLICY && status < 300 && r.completedAtMs >= r.startedAtMs && tier === "potential_risk" &&
      !signals.some(signal => signal !== "google_npa" && signal !== "processing_declarations_not_retained") &&
      (reviewEvent ? f.reviewEvent?.kind === "google_ccm_page_view" ||
        f.reviewEvent?.kind === "openai_event_post" && f.reviewEvent.batchInspection === "measurement_observed" :
        m || f?.propertyBinding);
    rows.push({...(verified ? {verifiedCollection:true as const} : {}),evidenceId:id,entityId:vendor.registryAttribution.entityId,entity:vendor.entity,msFromAnchor:r.startedAtMs-presence.start,
      purpose:vendor.purpose as CaliforniaPotentialRiskAssessment["rows"][number]["purpose"],processingSignals:signals,
      treatment:tier});
  }
  if (supportsPresence(policyVersion)) {
    for (const item of retainedRejectEntityEvidence(p,presence).observations) {
      const purpose = presencePurposeSchema.safeParse(item.purpose);
      if (!item.entityId || !item.entity || !purpose.success) continue;
      const requestId = item.kind === "service_request" ? item.evidenceRef.slice("request:".length) : undefined;
      const id = requestId ?? "cookie:" + createHash("sha256").update(item.evidenceRef).digest("hex");
      if (rows.some(row => row.evidenceId === id)) continue;
      if (requestId && !presenceSignals.has(requestId)) continue;
      const signals = presenceSignals.get(id) ?? [];
      rows.push({evidenceId:id,entityId:item.entityId,entity:item.entity,msFromAnchor:item.msAfterClick,
        purpose:purpose.data,presenceBasis:item.kind,
        processingSignals:signals,treatment:treatment(signals,false)});
    }
  }
  // Prioritize distinct recipients without increasing the retained 32-row cap.
  const first=rows.filter((r,i)=>rows.findIndex(x=>x.entityId===r.entityId)===i);
  const selected=[...first,...rows.filter(r=>!first.includes(r))].slice(0,32);
  let identifierTransmission: CaliforniaPotentialRiskAssessment["identifierTransmission"];
  const ledger = p.scoringEvidence!;
  if (supportsPresence(policyVersion) || policyVersion === CA_PER_VISIT_RISK_POLICY || policyVersion === CA_IDENTIFIER_RISK_POLICY) for (const request of ledger.requests) {
    const graphProof = p.sentIdentifierWitness?.requestId === request.requestId ? p.sentIdentifierWitness : undefined;
    if (!graphProof && !request.measurementEvidence?.cookieIdentifierBinding) continue;
    if (rows.some(r=>r.evidenceId===request.requestId) || full.requests.some(r=>r.requestId===request.requestId && r.reason==="qualified_collection")) continue;
    const status = request.httpStatus;
    const endpoint = sanitizeRuntimeGraphUrl(request.sanitizedUrl);
    if (!endpoint?.startsWith("https://") || endpoint.length>2048 || !isIdentifierEventRequest(request) ||
        ledger.requests.filter(r=>r.requestId===request.requestId).length!==1 || status===undefined || status<200 || status>=300 ||
        request.rootStartedAtMs===undefined || request.rootStartedAtMs<=presence.start || request.rootStartedAtMs>request.startedAtMs ||
        request.completedAtMs===undefined || request.completedAtMs<request.startedAtMs || request.completedAtMs>presence.end ||
        p.receiptAvailability?.documentStable===false || p.interactionDiagnostics?.postClickNavigation) continue;
    if (!presence.confirmed && (!p.afterActionCapture?.requestAncestry?.some(a=>a.requestId===request.requestId && a.rootStartedAtMs===request.rootStartedAtMs) ||
        !p.afterActionRequests?.some(r=>r.requestId===request.requestId && r.sanitizedUrl===request.sanitizedUrl &&
          r.method===request.method && r.startedAtMs===request.startedAtMs && r.httpStatus===status))) continue;
    if (graphProof && graphProof.packetSha256===p.packetSha256 && graphProof.endpoint===endpoint &&
        graphProof.startedAtMs===request.startedAtMs && graphProof.httpStatus===status && isTrackingIdentifierCookie(graphProof.cookieName,graphProof.cookieDomain)) {
      identifierTransmission=graphProof;
      break;
    }
    const bound=readBoundMeasurementRequestEvidence(request.measurementEvidence, request, {...ledger,targetSha256:p.sourceIdentity.targetSha256})?.cookieIdentifierBinding;
    if (bound) {
      identifierTransmission={basis:"bound_measurement_parameter",packetSha256:p.packetSha256,requestId:request.requestId,endpoint,
        cookieName:bound.cookieName,cookieDomain:bound.hostname,startedAtMs:request.startedAtMs,httpStatus:status};
      break;
    }
  }
  return californiaPotentialRiskSchema.parse({identifierTransmission,policyVersion,path:"reject",scanId:p.sourceIdentity.scanId,
    sourceSha256:p.packetSha256,rows:supportsPresence(policyVersion)?selectReviewRows(rows):selected,responseUnverified,legalConclusion:"not_established"});
}
export function retainedPotentialRisk(runtime:Record<string,unknown>|null|undefined):CaliforniaPotentialRiskAssessment[] {
  const pairs=[['californiaGpcPotentialRiskAssessment',runtime?.gpcResponseAssessment,assessGpcPotentialRisk],
    ['californiaRejectPotentialRiskAssessment',runtime?.postRefusalEvidenceProjection,assessRejectPotentialRisk]] as const;
  const assessments=pairs.flatMap(([key,source,derive])=>{
    const parsed=californiaPotentialRiskSchema.safeParse(runtime?.[key]);
    if(!parsed.success)return [];
    const derived=derive(source,parsed.data.policyVersion);
    return derived&&JSON.stringify(derived)===JSON.stringify(parsed.data)?[parsed.data]:[];
  });
  return new Set(assessments.map(a=>a.scanId)).size>1?[]:assessments;
}
export function potentialRiskRecipients(assessments:CaliforniaPotentialRiskAssessment[],qualified:Iterable<string>=[]) {
  const full=new Set(qualified);
  assessments.forEach(a=>a.rows.filter(r=>r.treatment==="qualified_collection").forEach(r=>full.add(r.entityId)));
  return [...new Set(assessments.flatMap(a=>a.rows.filter(r=>r.treatment==="potential_risk"&&!full.has(r.entityId)).map(r=>r.entityId)))].sort();
}
