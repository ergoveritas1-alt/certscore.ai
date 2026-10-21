import { postRefusalReportProjectionSchema } from "@certscore/contracts";
import { captureGoogleConsentModeRequest, inspectMeasurementRequest } from "@certscore/vendor-resolver";
import { readAfterRejectScoringAssessment } from "../after-reject-scoring-policy";

export function highRiskAfterRejectAssessment() {
  return readAfterRejectScoringAssessment({ policyVersion: "after_reject_measurement_tiers.v1", sourcePacketSha256: "b".repeat(64),
    registration: "confirmed", tier: "high_risk", deductionPoints: 15, requestIds: ["request-1"], reasons: ["verified_optional_activity"] })!;
}
export function afterRejectProjection(profile: "advertising" | "measurement" | "performance" = "measurement") {
  const url = profile === "measurement" ? "https://www.google-analytics.com/g/collect?v=2&tid=G-FIXTURE&gcs=G100&en=page_view"
    : profile === "performance" ? "https://cloudflareinsights.com/cdn-cgi/rum" : "https://www.facebook.com/tr/";
  const body = profile === "performance" ? JSON.stringify({ eventType: 1, startTime: 100, firstContentfulPaint: 200, nt: { responseEnd: 100 } }) : null;
  const request = { requestId: "request-1", method: "POST", sanitizedUrl: url, hostname: new URL(url).hostname,
    resourceType: "fetch", responseCookieNamesSet: [], startedAtMs: 200, rootStartedAtMs: 200, completedAtMs: 220,
    inFlightAtRefusalRegistration: false, msOffsetFromRefusal: 80, nonEssential: true,
    purpose: profile === "advertising" ? "advertising" as const : "analytics" as const,
    vendor: profile === "advertising" ? "Facebook" : profile === "performance" ? "Cloudflare" : "Google Analytics",
    googleConsentMode: captureGoogleConsentModeRequest({ url, requestId: "request-1", timestampMs: 200 }),
    measurementEvidence: inspectMeasurementRequest({ url, body, method: "POST", requestId: "request-1", timestampMs: 200, headers: {} }),
  };
  const channels = { policyVersion: "action_storage_collection_diagnostics.v1", ...Object.fromEntries(
    ["cookies", "localStorage", "sessionStorage"].map(key => [key, { status: "empty", retainedCount: 0, droppedCount: 0, sampleLimit: 96 }])) };
  return postRefusalReportProjectionSchema.parse({ contractVersion: "certscore.post_refusal_report_projection.v1", completedAt: "2026-10-14T10:00:01.000Z",
    packetSha256: "b".repeat(64), registrationStatus: "confirmed", refusalExercised: true, refusalRegisteredAtMs: 120,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "denied", basis: "verified_state",
      observedStateSha256: "c".repeat(64), observedAtMs: 120, timestampBasis: "instrumented_state_write" },
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v1", action: "reject", observedAtMs: 100,
      accessibleLabel: "Reject all", labelSource: "visible_text", actionSemantics: "direct_label", classifierIntent: "reject",
      classifierConfidence: 1, recipeId: "fixture", selectorHint: "#reject", visible: true, enabled: true, uniquelyActionable: true,
      authorizedTargetSha256: "a".repeat(64), frameIdentitySha256: "d".repeat(64) },
    registeredObservationCompletion: { policyVersion: "registered_action_observation_completion.v1", action: "reject",
      startedAtMs: 120, completedAtMs: 620, requiredWindowMs: 500, termination: "window_elapsed" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
    productionProjectable: true, evidenceDisposition: "confirmed", indeterminateReason: null, contradictionObserved: false,
    observationCount: 1, observationWindowMs: 500, resolverMethod: "cmp_registry_recipe", status: "confirmed_observation",
    postRefusalActivity: [{ activityType: "network_request", category: request.purpose, consentState: "post_reject",
      hostname: request.hostname, msAfterReject: 80, nonEssential: true, requestId: request.requestId, url, vendor: request.vendor }],
    preConsentStorageNotCleared: [], scoringEvidence: { version: "post_reject_scoring_evidence.v1", actionDispatchedAtMs: 110, preActionCapturedAtMs: 90, postActionCapturedAtMs: 620, requests: [request], storageWrites: [], preActionStorage: [], postActionStorage: [] },
    storageCollectionDiagnostics: { preAction: channels, postAction: channels },
  });
}

export function afterRejectClickProjection(profile: Parameters<typeof afterRejectProjection>[0] = "advertising") {
  const p = afterRejectProjection(profile);
  const {inFlightAtRefusalRegistration: _inFlight, msOffsetFromRefusal: _offset, ...request} = p.scoringEvidence!.requests[0]!;
  return postRefusalReportProjectionSchema.parse({...p, registrationStatus:"unconfirmed", status:"unconfirmed",
    refusalExercised:false, refusalRegisteredAtMs:undefined, productionProjectable:false,
    evidenceDisposition:"indeterminate", indeterminateReason:"refusal_registration_not_confirmed",
    decisionEvidence:{policyVersion:"semantic_consent_registration.v2",decision:"unknown",basis:"unverified"},
    registeredObservationCompletion:undefined, postRefusalActivity:[], observationCount:0,
    interactionDiagnostics:{navigation:{outcome:"completed",documentCommitted:true,finalUrlAuthorized:true},
      click:{outcome:"completed",reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}},
    afterActionCapture:{policyVersion:"bounded_after_action_capture.v2",action:"reject",activationStatus:"completed",
      actionDispatchedAtMs:110,captureEndedAtMs:620,requestedWindowMs:500,stopReason:"window_elapsed",requestsDropped:0,
      storageSnapshotRetained:true,storageWriteCoverage:"bounded_main_document_sample",storageWrites:[],
      requestIds:[request.requestId],requestAncestry:[{requestId:request.requestId,rootStartedAtMs:request.rootStartedAtMs}]},
    afterActionRequests:[request],afterActionStorage:[],
  });
}
