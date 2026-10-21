import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, gpcImpactAssessmentSchema, type CanonicalEvidenceBundle, type GpcImpactCapture, type GpcImpactAssessment, type NetworkEvent } from "@certscore/contracts";
import { gpcImpactRequestSetHash, gpcImpactIdentityHash } from "./gpc-impact-capture.js";
import { evaluateGpcObservationSession } from "./gpc-observation-completion.js";
import { retainedFinalDocumentRequest } from "./gpc-response-assessment.js";
import { gpcEndpointEvidence } from "./gpc-vendor-evidence.js";

export type GpcImpactSource = { bytes: Uint8Array; pointer: { sha256: string; sizeBytes: number } };
export function readVerifiedGpcImpactSource(source: GpcImpactSource | undefined): CanonicalEvidenceBundle | null {
  try {
    if (!source || source.bytes.length > 20_000_000 || source.bytes.length !== source.pointer.sizeBytes ||
      createHash("sha256").update(source.bytes).digest("hex") !== source.pointer.sha256) return null;
    return canonicalEvidenceBundleSchema.parse(JSON.parse(Buffer.from(source.bytes).toString("utf8")));
  } catch { return null; }
}
function ledgerFor(bundle: CanonicalEvidenceBundle, ms:number) {
  const c=bundle.gpcImpactCapture;
  return c?.comparisonPolicy==="page_http_signal.v2" && c.document && c.requestLedger
    ? c.requestLedger.rows.filter(r=>r.timestampMs>=c.document!.committedAtMs && r.timestampMs<c.document!.committedAtMs+ms) : undefined;
}
function eventsFor(bundle: CanonicalEvidenceBundle, capture: GpcImpactCapture, ms: number) {
  const start = capture.document!.committedAtMs;
  return bundle.networkEvents.filter(e => e.timestampMs >= start && e.timestampMs < start + ms);
}
function validSignal(bundle: CanonicalEvidenceBundle, enabled: boolean, scanId: string, pageHttpOnly = false) {
  const c = bundle.gpcImpactCapture, p = bundle.gpcSignalObservation;
  return bundle.scanId === scanId && bundle.scanLaneRuns.length === 1 &&
    bundle.scanLaneRuns[0]?.laneId === (enabled ? "gpc_observation" : "runtime_evidence") &&
    bundle.scanLaneRuns[0]?.region === bundle.region && c && c.expectedEnabled === enabled && c.document && p && p.expectedEnabled === enabled &&
    c.document.urlSha256 === p.documentUrlSha256 && c.document.token === c.readbackDocumentToken &&
    (enabled ? c.document.secGpc === "1" : c.document.secGpc === null) &&
    (pageHttpOnly ? ["page_http_signal.v1", "page_http_signal.v2"].includes(c.comparisonPolicy ?? "") &&
      Boolean(retainedFinalDocumentRequest(bundle, p)?.requestHeaders) &&
      (enabled ? retainedFinalDocumentRequest(bundle, p)?.requestHeaders?.secGpc === "1" : retainedFinalDocumentRequest(bundle, p)?.requestHeaders?.secGpc === undefined) &&
      !p.limitationKeys.some(key => ["document_changed_during_readback", "prototype_document_identity_unverified"].includes(key)) :
      p.workerCount === 0 && p.frameCount === p.frames.length && p.frameCount > 0 && p.limitationKeys.length === 0) &&
    p.frames.filter(f => f.mainFrame && f.documentUrlSha256 === c.document!.urlSha256).length === 1 &&
    p.frames.filter(f => f.mainFrame).length === 1 && (pageHttpOnly ? p.frames.filter(f => f.mainFrame) : p.frames).every(f => f.navigatorValue === enabled) &&
    p.capturedAtMs >= c.document.committedAtMs && p.capturedAtMs <= c.capturedAtMs;
}
function inventory(bundle: CanonicalEvidenceBundle, events: NetworkEvent[], purposes: Set<string>) {
  const evidence = new Set(events.map(e => e.eventId));
  const vendors = bundle.normalizedVendorObservations.filter(v => purposes.has(v.purpose) && v.matchedEvidenceIds.some(id => evidence.has(id) && gpcEndpointEvidence(v, id) === "verified"));
  const classified = new Set(vendors.flatMap(v => v.matchedEvidenceIds.filter(id => evidence.has(id) && gpcEndpointEvidence(v, id) === "verified")));
  return {
    identities: new Set(vendors.map(v => JSON.stringify([v.vendor, v.product ?? "unspecified", v.purpose]))),
    requests: events.filter(e => classified.has(e.eventId)).length,
    collectionRequests: events.filter(e => classified.has(e.eventId) && e.collectionEndpointObserved === true).length,
  };
}

/** Internal bounded-window measurement, independent of legacy response eligibility
 * and scoring. Old captures cannot acquire stronger historical conclusions. */
export function buildGpcImpactAssessment(input: { scanId: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource; pageHttpOnly?: boolean }): GpcImpactAssessment {
  const pageHttpOnly = input.pageHttpOnly === true;
  const baseline = readVerifiedGpcImpactSource(input.baseline), gpc = readVerifiedGpcImpactSource(input.gpc);
  const limits: string[] = [];
  for (const [label, bundle, enabled, lane] of [["baseline", baseline, false, "runtime_evidence"], ["gpc", gpc, true, "gpc_observation"]] as const) {
    if (!bundle) { limits.push(`${label}_source_unverified`); continue; }
    if (bundle.scanId !== input.scanId || !bundle.scanLaneRuns.some(l => l.laneId === lane)) limits.push(`${label}_provenance_mismatch`);
    const capture = bundle.gpcImpactCapture;
    if (!capture) { limits.push(`${label}_impact_capture_missing`); continue; }
    if (!pageHttpOnly && capture.retentionStatus === "incomplete") limits.push(`${label}_retained_request_set_incomplete`);
    if (capture.limitationKeys.length || capture.requestsDropped || !capture.windows.length) limits.push(`${label}_capture_incomplete`);
    if (!validSignal(bundle, enabled, input.scanId, pageHttpOnly)) limits.push(`${label}_delivery_or_document_unverified`);
    if (capture.capturedAtMs > Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt)) limits.push(`${label}_capture_after_completion`);
    if (bundle.scanNoGoAssessment?.decision === "no_go" || bundle.scanEvidenceLaneAssessment?.outcome === "no_go" ||
      bundle.runtimeCoverage?.coverageStatus !== "usable" || !bundle.scanLaneRuns.some(l => l.laneId === lane && l.accessOutcome === "representative_page")) limits.push(`${label}_access_limited`);
  }
  if (baseline && gpc && (baseline.region !== gpc.region || baseline.gpcSignalObservation?.contextConfigSha256 !== gpc.gpcSignalObservation?.contextConfigSha256 ||
    baseline.gpcImpactCapture?.document?.urlSha256 !== gpc.gpcImpactCapture?.document?.urlSha256)) limits.push("paired_context_or_document_mismatch");
  const bc = baseline?.gpcImpactCapture, gc = gpc?.gpcImpactCapture;
  const adaptiveBaseline = bc?.adaptiveObservation, adaptiveGpc = gc?.adaptiveObservation;
  if ((adaptiveBaseline || adaptiveGpc) && (!adaptiveBaseline || !adaptiveGpc ||
      adaptiveBaseline.durationMs !== adaptiveGpc.durationMs || adaptiveBaseline.outcome !== adaptiveGpc.outcome ||
      adaptiveBaseline.peerDocumentToken !== gc?.document?.token || adaptiveGpc.peerDocumentToken !== bc?.document?.token)) limits.push("paired_adaptive_protocol_mismatch");
  const verifiedWindow = (b: CanonicalEvidenceBundle, ms: number) => {
    const c = b.gpcImpactCapture!, w = c.windows.find(w => w.durationMs === ms);
    if (!c.document || !w) return false;
    const ledger=ledgerFor(b,ms);
    if(ledger)return w.requestCount===ledger.length && new Set(ledger.map(r=>r.eventId)).size===ledger.length &&
      gpcImpactIdentityHash(ledger)===w.requestSetSha256 && (b.gpcSignalObservation?.capturedAtMs??-1)>=c.document.committedAtMs+ms &&
      ledger.every(r=>r.headersVerified && (c.expectedEnabled?r.secGpc==="1":r.secGpc===null));
    const events = eventsFor(b, c, ms);
    return w.requestCount === events.length && new Set(events.map(e => e.eventId)).size === events.length &&
      w.requestSetSha256 === gpcImpactRequestSetHash(events) && (b.gpcSignalObservation?.capturedAtMs ?? -1) >= c.document.committedAtMs + ms &&
      events.every(e => e.requestHeaders !== undefined && (c.expectedEnabled ? e.requestHeaders?.secGpc === "1" : e.requestHeaders?.secGpc === undefined));
  };
  const windows = bc?.windows.filter(w => gc?.windows.some(g => g.durationMs === w.durationMs) &&
    (!pageHttpOnly || baseline && gpc && verifiedWindow(baseline, w.durationMs) && verifiedWindow(gpc, w.durationMs))) ?? [];
  const horizon = windows.at(-1)?.durationMs;
  if (!horizon) limits.push("common_window_unavailable");
  if (adaptiveBaseline && horizon !== adaptiveBaseline.durationMs) limits.push("adaptive_full_window_unavailable");
  for (const [label, bundle] of [["baseline", baseline], ["gpc", gpc]] as const) {
    if (!bundle?.gpcImpactCapture?.document || !horizon) continue;
    const ledger=pageHttpOnly?ledgerFor(bundle,horizon):undefined;
    if(ledger){if(ledger.some(r=>r.attributionUnknown))limits.push(`${label}_endpoint_attribution_unverified`);continue;}
    const ids = new Set(eventsFor(bundle, bundle.gpcImpactCapture, horizon).map(event => event.eventId));
    if (bundle.normalizedVendorObservations.some(v => ["advertising", "marketing", "analytics", "session_replay"].includes(v.purpose) &&
      v.matchedEvidenceIds.some(id => ids.has(id) && gpcEndpointEvidence(v, id) === "unknown"))) limits.push(`${label}_endpoint_attribution_unverified`);
  }
  // Recompute every declared window from the full original event arrays. A
  // downstream truncation, duplicate, mutation or lost request fails closed.
  for (const [label, b] of [["baseline", baseline], ["gpc", gpc]] as const) {
    if (!b?.gpcImpactCapture?.document || pageHttpOnly) continue;
    const c = b.gpcImpactCapture;
    if (c.windows.some(w => {
      const events = eventsFor(b, c, w.durationMs);
      return w.requestCount !== events.length || new Set(events.map(e => e.eventId)).size !== events.length ||
        w.requestSetSha256 !== gpcImpactRequestSetHash(events) || (b.gpcSignalObservation?.capturedAtMs ?? -1) < c.document!.committedAtMs + w.durationMs;
    })) limits.push(`${label}_request_set_unverified`);
  }
  const semantic = evaluateGpcObservationSession({ scanId: input.scanId, bundle: gpc, session: gpc?.gpcObservationSession,
    sourceBound: Boolean(gpc?.gpcPrototypeSessionBinding), evidenceRefs: [] });
  const state = semantic.documentBound && semantic.semanticProbe.terminalStatus === "observed" ? semantic.currentSaleSharingState : null;
  const axis = (notice?: number, value?: number) => notice === 1 && value === 1 ? "opted_out" : notice === 1 && value === 2 ? "not_opted_out" : "unknown";
  const bs = baseline?.gpcImpactSemanticObservation;
  const baseState = bs?.usca ?? bs?.usnat;
  const baselineSemanticVerified = Boolean(baseline && validSignal(baseline, false, input.scanId) && bs && bc?.document &&
    baseline.scanId === input.scanId && bs.scanId === input.scanId && baseline.scanLaneRuns.some(l => l.laneId === "runtime_evidence" && l.accessOutcome === "representative_page") &&
    baseline.runtimeCoverage?.coverageStatus === "usable" && baseline.scanNoGoAssessment?.decision !== "no_go" &&
    bs.captureBinding?.documentToken === bc.document.token && bs.documentUrlSha256 === bc.document.urlSha256 && bs.navigatorGpc === false &&
    bs.capturedAtMs >= bc.document.committedAtMs && bs.capturedAtMs <= Date.parse(baseline.completedAt) - Date.parse(baseline.startedAt) &&
    bs.gppStatus === "observed" && bs.limitationKeys.length === 0 && baseState &&
    bs.stateSha256 === createHash("sha256").update(JSON.stringify(baseState)).digest("hex"));
  const cmpComparable = Boolean(baselineSemanticVerified && state && gpc && validSignal(gpc, true, input.scanId) &&
    gpc.runtimeCoverage?.coverageStatus === "usable" && gpc.scanNoGoAssessment?.decision !== "no_go" &&
    gpc.scanLaneRuns.some(l => l.laneId === "gpc_observation" && l.accessOutcome === "representative_page") &&
    baseline?.region === gpc.region && baseline?.gpcSignalObservation?.contextConfigSha256 === gpc.gpcSignalObservation?.contextConfigSha256 &&
    bc?.document?.urlSha256 === gc?.document?.urlSha256 && baseState?.sectionId === state.sectionId);
  const baselineSale = baselineSemanticVerified ? axis(baseState?.saleNotice, baseState?.saleOptOut) : "unknown";
  const baselineSharing = baselineSemanticVerified ? axis(baseState?.sharingNotice, baseState?.sharingOptOut) : "unknown";
  const change = (b: string, g: string) => !cmpComparable || b === "unknown" || g === "unknown" ? "unknown" : b === g ? "unchanged" : g === "opted_out" ? "opt_out_appeared" : "opt_out_disappeared";
  const common = { contractVersion: "certscore.gpc-impact-assessment.v1" as const, mode: "internal_only" as const,
    productionProjectable: false as const, scoreEffect: "none" as const, causedByGpc: "not_established" as const,
    scanId: input.scanId, sourceHashes: { baseline: baseline ? input.baseline!.pointer.sha256 : null, gpc: gpc ? input.gpc!.pointer.sha256 : null },
    delivery: { baselineVerified: Boolean(baseline && validSignal(baseline, false, input.scanId, pageHttpOnly)), gpcVerified: Boolean(gpc && validSignal(gpc, true, input.scanId, pageHttpOnly)) },
    cmpRecordedState: { basis: "current_gpc_session_state", baselineState: baselineSemanticVerified ? "captured" : bs ? "unverified" : "not_captured",
      received: state?.gpc === true ? "received" : state?.gpc === false ? "not_received" : "unknown",
      sale: axis(state?.saleNotice, state?.saleOptOut), sharing: axis(state?.sharingNotice, state?.sharingOptOut) },
    cmpComparison: { basis: "paired_current_recorded_states", comparable: cmpComparable,
      baseline: { sale: baselineSale, sharing: baselineSharing, received: baselineSemanticVerified ? baseState?.gpc === true ? "received" : baseState?.gpc === false ? "not_received" : "unknown" : "unknown" },
      saleChange: change(baselineSale, axis(state?.saleNotice, state?.saleOptOut)),
      sharingChange: change(baselineSharing, axis(state?.sharingNotice, state?.sharingOptOut)),
      limitationKeys: cmpComparable ? [] : ["paired_semantic_state_unverified"],
    },
  };
  if (limits.length || !horizon || !baseline || !gpc || !bc || !gc) return gpcImpactAssessmentSchema.parse({ ...common,
    status: "insufficient_evidence", durationMs: null, requestAttempts: null, activity: null, limitationKeys: limits });
  const be = eventsFor(baseline, bc, horizon), ge = eventsFor(gpc, gc, horizon);
  const measuredInventory=(bundle:CanonicalEvidenceBundle,events:NetworkEvent[],purposes:string[])=>{
    const ledger=pageHttpOnly?ledgerFor(bundle,horizon):undefined;
    if(!ledger)return inventory(bundle,events,new Set(purposes));
    const ids=(r:typeof ledger[number])=>[...(purposes.includes("advertising")?r.advertising:[]),...(purposes.includes("analytics")?r.analytics:[])];
    return {identities:new Set(ledger.flatMap(ids)),requests:ledger.filter(r=>ids(r).length>0).length,collectionRequests:ledger.filter(r=>ids(r).length>0&&r.collection).length};
  };
  const compare = (purposes: string[]) => {
    const b = measuredInventory(baseline,be,purposes), g = measuredInventory(gpc,ge,purposes);
    const sharedCount = [...b.identities].filter(id => g.identities.has(id)).length;
    const baselineCount = b.identities.size, gpcCount = g.identities.size;
    return { baselineCount, gpcCount, sharedCount, removedCount: baselineCount - sharedCount, newCount: gpcCount - sharedCount,
      netChange: gpcCount - baselineCount, relativeReduction: baselineCount ? (baselineCount - gpcCount) / baselineCount : null,
      outcome: !baselineCount ? (gpcCount ? "new_activity_observed" : "no_activity_observed") : gpcCount < baselineCount ? "lower" : gpcCount > baselineCount ? "higher" : "unchanged",
      baselineRequests: b.requests, gpcRequests: g.requests, baselineCollectionRequests: b.collectionRequests, gpcCollectionRequests: g.collectionRequests };
  };
  return gpcImpactAssessmentSchema.parse({ ...common, status: "measured", durationMs: horizon,
    requestAttempts: { baseline: (pageHttpOnly?ledgerFor(baseline,horizon)?.length:undefined)??be.length, gpc: (pageHttpOnly?ledgerFor(gpc,horizon)?.length:undefined)??ge.length }, activity: {
      advertisingMarketing: compare(["advertising", "marketing"]), analyticsReplay: compare(["analytics", "session_replay"]),
      trackers: compare(["advertising", "marketing", "analytics", "session_replay"]),
    }, limitationKeys: [] });
}
