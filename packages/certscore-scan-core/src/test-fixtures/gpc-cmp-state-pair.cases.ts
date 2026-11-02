import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle, type GpcOptOutObservation } from "@certscore/contracts";
import { gpcRuntimeFixture } from "../../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { gpcProductionRuntimeFixture } from "../../../certscore-contracts/src/test-fixtures/gpc-production";
import { createGpcImpactCapture } from "../gpc-impact-capture";

export const fixtureHash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
/** Receipts originate here from synthetic fixture bytes, never historical data. */
export function originalFixtureSource(bundle: CanonicalEvidenceBundle) {
  const bytes = Buffer.from(JSON.stringify(bundle));
  return {bytes, pointer: {uri: `fixture://${bundle.scanLaneRuns[0]!.laneId}.json`, sha256: fixtureHash(bytes), sizeBytes: bytes.length}};
}
export function cmpStatePairFixture(input: { scanId?: string; baselineSale?: 1 | 2; baselineSharing?: 1 | 2; gpcSale?: 1 | 2; gpcSharing?: 1 | 2; sectionId?: 7 | 8; sectionVersion?: 1 | 2 } = {}) {
  const baseline = gpcRuntimeFixture({enabled: false}), gpc = gpcProductionRuntimeFixture();
  if (input.scanId) {
    baseline.scanId = gpc.scanId = input.scanId;
    gpc.gpcObservationSession!.scanId = input.scanId;
    gpc.gpcObservationSession!.semanticObservation!.scanId = input.scanId;
  }
  gpc.networkEvents = gpc.networkEvents.filter(e => e.isMainFrame);
  gpc.normalizedVendorObservations = [];
  gpc.gpcObservationSession!.requests = gpc.gpcObservationSession!.requests.filter(e => e.eventId.endsWith('_document'));
  gpc.gpcObservationSession!.requestsObserved = 1;
  for (const [bundle, enabled] of [[baseline, false], [gpc, true]] as const) {
    const token = enabled ? "fixture-loader" : "independent-baseline-loader";
    const captureId = enabled ? gpc.gpcObservationSession!.captureId : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let now = 0;
    const capture = createGpcImpactCapture({expectedEnabled: enabled, now: () => now});
    capture.documentRequested({type: "Document", frameId: "main", loaderId: token, request: {url: bundle.url, headers: enabled ? {'Sec-GPC': '1'} : {}}}, 'main');
    capture.recordRequest(bundle.networkEvents[0]!);
    now = 1; capture.documentCommitted({loaderId: token, url: bundle.url});
    now = 1000;
    bundle.gpcSignalObservation!.prototypeCaptureBinding = {captureId, documentIdentitySource: "cdp_loader_id", documentToken: token};
    capture.bindReadback(token);
    bundle.gpcImpactCapture = capture.finish(bundle.gpcSignalObservation);
    bundle.completedAt = "2026-09-05T12:00:02.000Z";
    const state = {apiVersion: "1.1" as const, sectionId: input.sectionId ?? 8, sectionVersion: input.sectionVersion ?? 1,
      cmpStatus: "loaded" as const, signalStatus: "ready" as const, saleNotice: 1 as const, sharingNotice: 1 as const,
      saleOptOut: enabled ? input.gpcSale ?? 1 : input.baselineSale ?? 2,
      sharingOptOut: enabled ? input.gpcSharing ?? 1 : input.baselineSharing ?? 2, gpc: enabled};
    const semantic: GpcOptOutObservation = {...gpc.gpcObservationSession!.semanticObservation!, captureBinding: {captureId, documentIdentitySource: "cdp_loader_id", documentToken: token},
      navigatorGpc: enabled, gppStatus: "observed", usca: state.sectionId === 8 ? state as any : null,
      usnat: state.sectionId === 7 ? state as any : null, stateSha256: fixtureHash(JSON.stringify(state))};
    if (enabled) {
      bundle.gpcObservationSession!.semanticObservation = semantic;
      bundle.gpcPrototypeSessionBinding!.sessionSha256 = fixtureHash(JSON.stringify(bundle.gpcObservationSession));
    } else bundle.gpcImpactSemanticObservation = semantic;
  }
  return {baseline: canonicalEvidenceBundleSchema.parse(baseline), gpc: canonicalEvidenceBundleSchema.parse(gpc)};
}
