import { buildGpcActivityComparison } from "../../../../../packages/certscore-scan-core/src/gpc-activity-comparison";
import { canonicalEvidenceBundleSchema, gpcObservationSessionSchema } from "@certscore/contracts";
import { cmpStatePairFixture, originalFixtureSource, fixtureHash } from "../../../../../packages/certscore-scan-core/src/test-fixtures/gpc-cmp-state-pair.cases";
import { buildGpcCmpStateComparison } from "../../../../../packages/certscore-scan-core/src/gpc-cmp-state-comparison";
import { buildGpcResponseAssessment } from "../../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import { buildGpcProductionAssessment } from "../../../../../packages/certscore-scan-core/src/gpc-production-observation";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { gpcImpactRequestSetHash } from "../../../../../packages/certscore-scan-core/src/gpc-impact-capture";

export function gpcProductFixture(options: {scanId?: string; urls?: string[]; contradiction?: boolean; priorCmpState?: boolean;
  notReady?: "synchronous_ping_unavailable" | "cmp_status_not_loaded" | "signal_status_not_ready" | "both";
  apiUnavailable?: boolean;
  baselineReadbackIncomplete?: boolean} = {}) {
  const pair = cmpStatePairFixture({scanId:options.scanId,gpcSale:options.contradiction ? 2 : 1});
  const g = pair.gpc, session = g.gpcObservationSession!, semantic = session.semanticObservation!;
  if (options.urls?.length) {
    g.networkEvents.push(...options.urls.map((url,i) => ({...g.networkEvents[0]!,eventId:`product-${i}`,requestId:`product-${i}`,
      timestampMs:500+i,requestUrl:url,url,resourceType:"fetch",isMainFrame:false,collectionEndpointObserved:true})));
    g.normalizedVendorObservations = g.networkEvents.slice(1).map(e => resolveCanonicalVendor({type:"request",url:e.requestUrl,
      evidenceId:e.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!).filter(Boolean);
    g.networkResponseEvents = g.networkEvents.slice(1).map(e => ({...e,eventId:`response-${e.eventId}`,eventType:"network_response",responseUrl:e.requestUrl,status:204})) as never;
    session.requests = g.networkEvents.map(e => ({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:fixtureHash(e.requestUrl),secGpc:"1"}));
    session.requestsObserved = g.networkEvents.length;
    for (const w of g.gpcImpactCapture!.windows) {
      const events = g.networkEvents.filter(e => e.timestampMs >= 1 && e.timestampMs < 1+w.durationMs);
      w.requestCount = events.length;w.requestSetSha256 = gpcImpactRequestSetHash(events);
    }
  }
  if (options.priorCmpState) semantic.stateTransitions = [{observedAtMs:100,status:"observed",state:semantic.usca!,stateSha256:semantic.stateSha256}];
  if (options.notReady) {
    semantic.gppStatus = "not_ready";
    semantic.usca = semantic.usnat = null;
    semantic.stateSha256 = null;
    semantic.stateTransitions = [];
    semantic.limitationKeys = [];
    const synchronous = options.notReady === "synchronous_ping_unavailable";
    semantic.gppDiagnostics = {reason:synchronous ? "synchronous_ping_unavailable" : "cmp_or_signal_not_ready",
      callbackCount:synchronous ? 0 : 1, applicableSections:[], sectionList:[],
      diagnosticCodes:synchronous ? ["cmp_status_not_loaded"] : options.notReady === "both"
        ? ["cmp_status_not_loaded", "signal_status_not_ready"] : [options.notReady]};
  }
  if (options.baselineReadbackIncomplete) {
    pair.baseline.gpcSignalObservation!.limitationKeys = ["frame_signal_readback_incomplete"];
  }
  if (options.apiUnavailable) {
    semantic.gppStatus="unavailable";semantic.usca=semantic.usnat=null;semantic.stateSha256=null;
    semantic.stateTransitions=[];semantic.limitationKeys=[];
    semantic.gppDiagnostics={reason:"api_unavailable",callbackCount:0,applicableSections:[],sectionList:[],diagnosticCodes:["api_unavailable"]};
  }
  g.gpcObservationSession = gpcObservationSessionSchema.parse(session);
  g.gpcPrototypeSessionBinding!.sessionSha256 = fixtureHash(JSON.stringify(g.gpcObservationSession));
  canonicalEvidenceBundleSchema.parse(g);
  const baseline = originalFixtureSource(pair.baseline), gpc = originalFixtureSource(g);
  const comparison = buildGpcResponseAssessment({baseline:pair.baseline,gpc:g,baselineArtifact:baseline.pointer,gpcArtifact:gpc.pointer});
  const assessment = buildGpcProductionAssessment({scanId:g.scanId,comparison,source:gpc});
  const cmpStateComparison = buildGpcCmpStateComparison({scanId:g.scanId,targetUrl:g.normalizedUrl,baseline,gpc});
  const activityComparison = buildGpcActivityComparison({scanId:g.scanId,baseline,gpc,observation:assessment.observation});
  return {...pair,baselineSource:baseline,gpcSource:gpc,assessment,cmpStateComparison,activityComparison};
}
