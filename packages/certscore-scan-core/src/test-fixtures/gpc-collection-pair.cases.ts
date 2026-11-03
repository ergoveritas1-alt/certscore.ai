import { createHash } from "node:crypto";
import { networkResponseEventSchema, canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import { gpcProductionRuntimeFixture } from "../../../certscore-contracts/src/test-fixtures/gpc-production";
import { createGpcImpactCapture } from "../gpc-impact-capture";
export const hash = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
export function collectionPairFixture(url = "https://bcp.crwdcntrl.net/6/map?xcid=fixture", scanId = "gpc-fixture", gpcAtMs = 500) {
  const make = (enabled: boolean) => {
    const b = gpcProductionRuntimeFixture(); b.scanId = scanId;
    b.gpcObservationSession!.scanId = scanId;
    b.gpcObservationSession!.semanticObservation!.scanId = scanId;
    if (!enabled) {
      b.scanLaneRuns[0]!.laneId = "runtime_evidence";
      b.gpcSignalObservation!.expectedEnabled = false;
      b.gpcSignalObservation!.frames.forEach(f => { f.navigatorValue = false; });
      b.networkEvents.forEach(e => { e.requestHeaders = { cookieHeaderPresent: false, cookieNames: [], authorizationHeaderPresent: false }; });
      delete b.gpcObservationSession; delete b.gpcPrototypeSessionBinding;
    }
    const e = b.networkEvents[1]!; e.timestampMs = enabled ? gpcAtMs : 500; e.requestUrl = e.url = url; e.collectionEndpointObserved = true;
    b.networkResponseEvents = [networkResponseEventSchema.parse({ ...e, eventType: "network_response", eventId: "response", responseUrl: url, status: 200 })];
    b.normalizedVendorObservations = resolveVendorObservations([{ type: "request", url, evidenceId: e.eventId, sourceScanner: "pre_consent_runtime", matchSource: "network_request" }]);
    const token = enabled ? "fixture-loader" : "independent-baseline";
    let now = 0;
    const capture = createGpcImpactCapture({ expectedEnabled: enabled, now: () => now });
    capture.documentRequested({ type: "Document", frameId: "main", loaderId: token, request: { url: b.url, headers: enabled ? { "Sec-GPC": "1" } : {} } }, "main");
    now = 1; capture.documentCommitted({ loaderId: token, url: b.url });
    capture.recordRequest(e); now = 6000;
    b.gpcSignalObservation!.capturedAtMs = now;
    capture.bindReadback(token); b.gpcImpactCapture = capture.finish(b.gpcSignalObservation);
    b.completedAt = "2026-09-05T12:00:07.000Z";
    if (b.gpcObservationSession) {
      const session = b.gpcObservationSession;
      session.captureEndedAtMs = now;
      session.requests[1]!.urlSha256 = hash(url); session.requests[1]!.timestampMs = e.timestampMs;
      b.gpcSignalObservation!.prototypeCaptureBinding = { captureId: session.captureId, documentToken: token, documentIdentitySource: "cdp_loader_id" };
      b.gpcPrototypeSessionBinding!.sessionSha256 = hash(JSON.stringify(session));
    }
    return canonicalEvidenceBundleSchema.parse(b);
  };
  return { baseline: make(false), gpc: make(true) };
}
/** New synthetic originals only; never replace an historical receipt. */
export function collectionFixtureSource(b: CanonicalEvidenceBundle) {
  const bytes = Buffer.from(JSON.stringify(b));
  return { bytes, pointer: { uri: "fixture-original", sha256: hash(bytes), sizeBytes: bytes.length } };
}
