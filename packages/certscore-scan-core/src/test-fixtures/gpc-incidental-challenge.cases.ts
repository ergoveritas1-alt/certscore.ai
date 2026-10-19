import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { gpcProductionRuntimeFixture } from "../../../certscore-contracts/src/test-fixtures/gpc-production";

/** Fictional visit with real registry endpoints; never a production evidence source. */
export function gpcIncidentalChallengeFixture(scanId?: string) {
  const bundle = gpcProductionRuntimeFixture();
  if (scanId) {
    bundle.scanId = scanId;
    bundle.gpcObservationSession!.scanId = scanId;
    bundle.gpcObservationSession!.semanticObservation!.scanId = scanId;
  }
  const template = bundle.networkEvents[1]!;
  const urls = ["https://px.ads.linkedin.com/collect/", "https://px.ads.linkedin.com/collect/", "https://snap.licdn.com/li.lms-analytics/insight.min.js"];
  bundle.networkEvents = [bundle.networkEvents[0]!, ...urls.map((url, index) => ({ ...template,
    eventId: `linkedin-${index}`, requestId: `linkedin-${index}`, requestUrl: url, url,
    collectionEndpointObserved: index < 2,
  }))];
  bundle.normalizedVendorObservations = bundle.networkEvents.slice(1).map(event =>
    resolveCanonicalVendor({ type: "request", url: event.requestUrl, evidenceId: event.eventId,
      sourceScanner: "fixture", matchSource: "network_request" }).observation!);
  bundle.networkResponseEvents = bundle.networkEvents.map(event => ({ ...event,
    eventId: `response-${event.eventId}`, eventType: "network_response" as const, responseUrl: event.requestUrl,
    status: event.isMainFrame ? 200 : 204, timestampMs: event.isMainFrame ? 1 : event.timestampMs,
    setCookieHeaders: [], setCookieMetadata: [], cookieNamesSet: [], cacheHeaders: {}, accessControlHeaders: {},
  }));
  bundle.gpcSignalObservation!.prototypeCaptureBinding = { captureId: bundle.gpcObservationSession!.captureId,
    documentToken: "fixture-loader", documentIdentitySource: "cdp_loader_id" };
  bundle.gpcObservationSession!.requests = bundle.networkEvents.map(event => ({ eventId: event.eventId,
    timestampMs: event.timestampMs, urlSha256: createHash("sha256").update(event.requestUrl).digest("hex"), secGpc: "1" }));
  bundle.gpcObservationSession!.requestsObserved = bundle.networkEvents.length;
  bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256")
    .update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
  bundle.scanNoGoAssessment = {
    status: "available", version: "scan-no-go-assessment-v1", decision: "continue_with_diagnostics", scanNoGoConfidence: 0.72,
    reasonCodes: ["potential_security_challenge", "scan_no_go_corroborated"],
    corroboratorCodes: ["network_security_challenge_request_observed", "network_cloudflare_challenge"],
    contradictorCodes: ["main_document_success", "substantive_retained_dom_volume_observed", "multiple_first_party_resources_loaded"],
    supportingSignals: { securityChallengeRequestObserved: true, challengeSignalsDetected: true,
      blockingFrameChallengeObserved: false, documentStatusBlocked: false, expectedOriginReached: true,
      successfulSettledMainDocument: true, mainDocumentStatus: 200,
      substantiveCapturedPageTextObserved: true, substantiveRetainedDomVolumeObserved: true,
      visualHardNoGoPageState: false, visualNoGo: false, visualPageState: "degraded_but_useful" }, evidenceRefs: [],
  };
  return canonicalEvidenceBundleSchema.parse(bundle);
}
