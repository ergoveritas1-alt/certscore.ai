import {resolveCanonicalCookieClassification} from "@certscore/vendor-resolver";
import type { PostRefusalReportProjection } from "@certscore/contracts";

/** Positive observations only. Cookie presence does not establish a write or
 * active use; service presence does not establish identifier transmission. */
export function retainedRejectPresence(p: PostRefusalReportProjection,cookiePurposePolicy?: "certscore.cookie-purpose.v6" | "certscore.cookie-purpose.v7") {
  const reclassify=!!cookiePurposePolicy;
  const proof=p.actionControlProof, s=p.scoringEvidence, c=p.afterActionCapture;
  const confirmed=p.productionProjectable && p.refusalExercised && p.registrationStatus==="confirmed" &&
    p.decisionEvidence?.basis==="verified_state" && p.decisionEvidence.decision==="denied";
  if (!p.packetSha256 || !proof?.authorizedTargetSha256 || !proof.frameIdentitySha256 || proof.action!=="reject" ||
    p.interactionDiagnostics?.click.outcome!=="completed" || !s || s.actionDispatchedAtMs===undefined ||
    proof.observedAtMs>s.actionDispatchedAtMs || p.captureCoverage?.requestsDroppedAfterAction!==0) return null;
  const start=s.actionDispatchedAtMs;
  if (!confirmed && (p.registrationStatus!=="unconfirmed" || p.status!=="unconfirmed" || !c ||
    c.policyVersion!=="bounded_after_action_capture.v2" || c.action!=="reject" || c.activationStatus!=="completed" ||
    c.stopReason!=="window_elapsed" || c.requestsDropped!==0 || c.actionDispatchedAtMs!==start || c.requestedWindowMs<=0)) return null;
  const completion=confirmed?p.registeredObservationCompletion:undefined;
  if (confirmed && !completion) return null;
  const end=confirmed?completion!.completedAtMs:c!.captureEndedAtMs;
  const window=confirmed?completion!.requiredWindowMs:c!.requestedWindowMs;
  if (window<=0 || end<start || !confirmed && end<start+window) return null;
  const postSnapshot=s.postActionCapturedAtMs;
  const snapshotUsable=postSnapshot!==undefined && postSnapshot>=(confirmed?completion!.startedAtMs:start+window) && postSnapshot<=end &&
    (confirmed || c!.storageSnapshotRetained && JSON.stringify(p.afterActionStorage)===JSON.stringify(s.postActionStorage));
  const cookies=snapshotUsable?s.postActionStorage.filter(row=>row.storageType==="cookie" && (reclassify?(()=>{const c=resolveCanonicalCookieClassification(row.name,{cookieDomain:row.hostname},cookiePurposePolicy);
      if(c.essentiality==="essential" || cookiePurposePolicy==="certscore.cookie-purpose.v7" && row.purposeAssessment?.essentiality==="essential")return false;
      return row.nonEssential&&row.purpose!==undefined&&row.purpose!=="unknown" ||
        (!row.purpose||row.purpose==="unknown")&&c.essentiality==="non_essential";
    })():row.nonEssential && row.purpose!==undefined && row.purpose!=="unknown")).map(row=>({name:row.name,...(row.hostname?{hostname:row.hostname}:{}),
      ...(row.identityHash?{identityHash:row.identityHash}:{}),valueHash:row.valueHash})):[];
  const requestIds=s.requests.flatMap(row=>{
    if (!row.nonEssential || !row.purpose || row.purpose==="unknown" || row.method==="OPTIONS" ||
      row.startedAtMs<=start || row.startedAtMs>end) return [];
    if (!confirmed) {
      const retained=p.afterActionRequests?.find(r=>r.requestId===row.requestId);
      const identity=(r:Pick<typeof row,"requestId"|"method"|"sanitizedUrl"|"hostname"|"resourceType"|"startedAtMs"|"rootStartedAtMs"|"purpose"|"nonEssential"|"vendor">)=>JSON.stringify([r.requestId,r.method,r.sanitizedUrl,r.hostname,r.resourceType,r.startedAtMs,r.rootStartedAtMs,r.purpose,r.nonEssential,r.vendor]);
      if (!retained || identity(retained)!==identity(row) || !c!.requestIds.includes(row.requestId)) return [];
    }
    const root=confirmed?row.rootStartedAtMs:c!.requestAncestry?.find(r=>r.requestId===row.requestId)?.rootStartedAtMs;
    return root!==undefined && root>start && root<=row.startedAtMs &&
      (row.rootStartedAtMs===undefined || row.rootStartedAtMs===root)?[row.requestId]:[];
  });
  return {reclassify,cookiePurposePolicy,confirmed,start,end,postSnapshot:snapshotUsable?postSnapshot:undefined,cookies,requestIds:[...new Set(requestIds)]};
}
