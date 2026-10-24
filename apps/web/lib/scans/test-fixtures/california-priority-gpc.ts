import {afterRejectClickProjection} from "./after-reject-scoring";
import {captureCaliforniaRejectRequest} from "../../../../../packages/certscore-scan-core/src/california-reject-request";
import {buildPostRefusalRuntimeProjection} from "../post-refusal-runtime-projection";
import {createHash} from "node:crypto";
import {gpcProductionRuntimeFixture} from "../../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import {gpcRuntimeFixture} from "../../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import {buildGpcProductionAssessment} from "../../../../../packages/certscore-scan-core/src/gpc-production-observation";
import {buildGpcResponseAssessment} from "../../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
export const ANALYTICS_URL = "https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture&sid=123&npa=1";
export const QUALIFIED_URL = "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture";
export const UNRESOLVED_AD_URL = "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/";
export function californiaPriorityGpcFixture(urls = [ANALYTICS_URL]) {
  const g = gpcProductionRuntimeFixture(), baseline = gpcRuntimeFixture({enabled:false}), event = g.networkEvents[1]!;
  g.networkEvents = [g.networkEvents[0]!, ...urls.map((url,i)=>({...event,eventId:`collection-${i}`,requestId:`collection-${i}`,url,requestUrl:url,collectionEndpointObserved:true}))];
  g.normalizedVendorObservations = g.networkEvents.slice(1).map(e=>resolveCanonicalVendor({type:"request",url:e.requestUrl,evidenceId:e.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!);
  g.gpcSignalObservation!.prototypeCaptureBinding = {captureId:g.gpcObservationSession!.captureId,documentToken:"fixture-loader",documentIdentitySource:"cdp_loader_id"};
  g.networkResponseEvents = g.networkEvents.slice(1).map(e=>({...e,eventId:`response-${e.eventId}`,eventType:"network_response",responseUrl:e.requestUrl,status:204})) as never;
  g.gpcObservationSession!.requests = g.networkEvents.map(e=>({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:createHash("sha256").update(e.requestUrl).digest("hex"),secGpc:"1"}));
  g.gpcObservationSession!.requestsObserved = g.networkEvents.length;
  g.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(g.gpcObservationSession)).digest("hex");
  const bytes=Buffer.from(JSON.stringify(g)), pointer={uri:"s3://fixture/gpc.json",sizeBytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
  return buildGpcProductionAssessment({scanId:g.scanId,comparison:buildGpcResponseAssessment({baseline, gpc:g,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"},gpcArtifact:pointer}),source:{bytes,pointer}});
}

export function californiaPriorityRejectFixture() {
  const p=afterRejectClickProjection(), hash=createHash("sha256").update("https://example.test/").digest("hex");
  p.actionControlProof!.authorizedTargetSha256=hash;
  p.sourceIdentity={policyVersion:"post_reject_source_identity.v1",scanId:"gpc-fixture",targetSha256:hash};
  const template=p.scoringEvidence!.requests[0]!;
  const request={...template,requestId:"qualified-reject",sanitizedUrl:"https://stats.g.doubleclick.net/g/collect",hostname:"stats.g.doubleclick.net",
    method:"GET",startedAtMs:200,rootStartedAtMs:200,measurementEvidence:undefined,googleConsentMode:undefined,
    californiaCollection:captureCaliforniaRejectRequest({url:QUALIFIED_URL,method:"GET",requestId:"qualified-reject",startedAtMs:200,httpStatus:204,hasBody:false})!};
  p.scoringEvidence!.requests=[request];p.afterActionRequests=[structuredClone(request)];
  p.afterActionCapture!.requestIds=[request.requestId];p.afterActionCapture!.requestAncestry=[{requestId:request.requestId,rootStartedAtMs:200}];
  return buildPostRefusalRuntimeProjection(p);
}
