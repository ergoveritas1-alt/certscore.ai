import { createHash } from "node:crypto";
import {
  canonicalEvidenceBundleSchema, retainedGpcOptOutObservationSchema, gpcOptOutPrototypeSchema,
  GPC_OPT_OUT_PROTOTYPE_VERSION, type CanonicalEvidenceBundle, type GpcOptOutObservation,
} from "@certscore/contracts";
import { buildGpcResponseAssessment, retainedFinalDocumentRequest, type GpcVerifiedArtifactPointer } from "./gpc-response-assessment.js";

export type GpcPrototypeArtifact = { bytes: Uint8Array; pointer: GpcVerifiedArtifactPointer };
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function verify(source: GpcPrototypeArtifact) {
  if (source.bytes.byteLength > 20_000_000 || source.bytes.byteLength !== source.pointer.sizeBytes || digest(source.bytes) !== source.pointer.sha256) {
    throw new Error("GPC prototype source checksum/size mismatch");
  }
  return JSON.parse(Buffer.from(source.bytes).toString("utf8"));
}
function bundle(source: GpcPrototypeArtifact | undefined) {
  if (!source) return null;
  try { return canonicalEvidenceBundleSchema.parse(verify(source)); } catch { return null; }
}
function facet(observed: boolean, refs: string[], limits: string[]) {
  return { status: observed ? "observed" as const : "unknown" as const, evidenceRefs: observed ? refs : [], limitationKeys: limits };
}

/** Artifact-only candidate. No current assessment, concern, finding or score consumes it. */
export function buildGpcOptOutPrototype(input: {
  scanId: string; generatedAt?: string; gpc?: GpcPrototypeArtifact; baseline?: GpcPrototypeArtifact; observation?: GpcPrototypeArtifact;
}) {
  const gpc = bundle(input.gpc), baseline = bundle(input.baseline);
  const proof = gpc?.gpcSignalObservation ?? null;
  const sourceValid = gpc?.scanId === input.scanId;
  const document = sourceValid ? retainedFinalDocumentRequest(gpc ?? undefined, proof) : undefined;
  const documentBound = Boolean(document && proof && proof.capturedAtMs >= proof.documentStartedAtMs);
  const http = documentBound && document?.requestHeaders?.secGpc === "1";
  const mainFrames = proof?.frames.filter(f => f.mainFrame) ?? [];
  const navigator = documentBound && proof?.expectedEnabled === true && mainFrames.length === 1 &&
    mainFrames[0]?.documentUrlSha256 === proof?.documentUrlSha256 && mainFrames[0]?.navigatorValue === true &&
    !proof.limitationKeys.includes("document_changed_during_readback");
  const fullContext = http && navigator && proof?.workerCount === 0 && proof.frames.length === proof.frameCount &&
    proof.frames.every(f => f.navigatorValue === true) && proof.limitationKeys.length === 0 &&
    gpc!.networkEvents.every(e => e.requestHeaders?.secGpc === "1");
  const sourceRef = input.gpc?.pointer.uri ?? "";
  const proofRefs = document ? [sourceRef, document.eventId] : [];
  let observation: GpcOptOutObservation | null = null;
  if (input.observation && http && proof && gpc) {
    try {
      const retained = retainedGpcOptOutObservationSchema.parse(verify(input.observation));
      const candidate = retained.observation;
      const binding = proof.prototypeCaptureBinding;
      const completedAtMs = Date.parse(gpc.completedAt) - Date.parse(gpc.startedAt);
      if (retained.gpcArtifactSha256 === input.gpc!.pointer.sha256 && binding &&
        candidate.captureBinding?.captureId === binding.captureId && candidate.captureBinding.documentToken === binding.documentToken &&
        candidate.scanId === input.scanId && candidate.documentUrlSha256 === proof.documentUrlSha256 &&
        candidate.documentStartedAtMs === proof.documentStartedAtMs && candidate.capturedAtMs >= document!.timestampMs &&
        candidate.capturedAtMs <= completedAtMs && candidate.navigatorGpc === true &&
        !candidate.limitationKeys.includes("document_changed_during_semantic_readback") &&
        (!(candidate.usca ?? candidate.usnat) || candidate.stateSha256 === digest(JSON.stringify(candidate.usca ?? candidate.usnat)))) observation = candidate;
    } catch { /* A bad sidecar never invalidates independent retained request facts. */ }
  }
  const state = observation?.gppStatus === "observed" ? (observation.usca ?? observation.usnat) : null;
  const axis = (notice: number | undefined, value: number | undefined) => notice === 1 && value === 1 ? "opted_out" as const :
    notice === 1 && value === 2 ? "not_opted_out" as const : "unknown" as const;
  const sale = axis(state?.saleNotice, state?.saleOptOut), sharing = axis(state?.sharingNotice, state?.sharingOptOut);
  const registrationStatus = sale === "opted_out" && sharing === "opted_out" ? "opt_out_recorded" :
    sale === "not_opted_out" && sharing === "not_opted_out" ? "opt_out_not_recorded" : state ? "mixed_or_incomplete" : "unknown";
  const semanticRefs = observation ? [input.observation!.pointer.uri] : [];
  const acknowledgment = Boolean(observation?.acknowledgment.length);
  const purposes = new Set(["advertising", "marketing", "analytics", "session_replay"]);
  const vendors = new Map<string, CanonicalEvidenceBundle["normalizedVendorObservations"]>();
  for (const vendor of gpc?.normalizedVendorObservations ?? []) {
    if (!purposes.has(vendor.purpose)) continue;
    for (const id of vendor.matchedEvidenceIds) vendors.set(id, [...(vendors.get(id) ?? []), vendor]);
  }
  const lane = gpc?.scanLaneRuns.find(r => r.laneId === "gpc_observation");
  const representative = lane?.accessOutcome === "representative_page";
  const requestIdCounts = new Map<string, number>();
  for (const event of gpc?.networkEvents ?? []) requestIdCounts.set(event.eventId, (requestIdCounts.get(event.eventId) ?? 0) + 1);
  const requests = (http && representative ? gpc!.networkEvents : []).flatMap(event => {
    const matches = vendors.get(event.eventId) ?? [];
    // Purpose identity must be unambiguous for this specific retained request.
    const unique = new Map(matches.map(v => [`${v.vendor}|${v.product}|${v.purpose}`, v]));
    const vendor = unique.size === 1 ? [...unique.values()][0] : undefined;
    if (!vendor || event.eventId.length > 160 || vendor.observationId.length > 160 || requestIdCounts.get(event.eventId) !== 1 ||
      event.timestampMs < document!.timestampMs || event.timestampMs > proof!.capturedAtMs || event.requestHeaders?.secGpc !== "1") return [];
    return [{ eventId: event.eventId, timestampMs: event.timestampMs, vendorObservationId: vendor.observationId,
      vendor: vendor.vendor, purpose: vendor.purpose, collectionEndpointObserved: event.collectionEndpointObserved }];
  });
  const runtime = gpc?.modulesRun.find(m => m.moduleName === "preConsentRuntimeScanner");
  const settled = runtime?.status === "completed" && runtime.timingBreakdown?.some(t => t.label === "passive evidence quiet wait" && t.outcome === "completed");
  const captureComplete = Boolean(fullContext && representative && gpc?.runtimeCoverage?.coverageStatus === "usable" && settled &&
    proof && proof.capturedAtMs - proof.documentStartedAtMs >= 250);
  let comparison = null;
  if (baseline && baseline.scanId === input.scanId && gpc && sourceValid) {
    comparison = buildGpcResponseAssessment({ baseline, baselineArtifact: input.baseline!.pointer, gpc,
      gpcArtifact: input.gpc!.pointer, generatedAt: input.generatedAt });
  }
  return gpcOptOutPrototypeSchema.parse({
    contractVersion: GPC_OPT_OUT_PROTOTYPE_VERSION, mode: "internal_only", productionProjectable: false,
    scoreEffect: "none", legalInterpretation: "not_assessed", scanId: input.scanId, generatedAt: input.generatedAt ?? new Date().toISOString(),
    sources: [...(sourceValid ? [{ ...input.gpc!.pointer, kind: "runtime_bundle", lane: "gpc_observation" }] : []),
      ...(baseline?.scanId === input.scanId ? [{ ...input.baseline!.pointer, kind: "runtime_bundle", lane: "runtime_evidence" }] : []),
      ...(observation ? [{ kind: "semantic_readback", sha256: input.observation!.pointer.sha256,
        sizeBytes: input.observation!.pointer.sizeBytes, uri: input.observation!.pointer.uri, gpcArtifactSha256: input.gpc!.pointer.sha256 }] : [])],
    documentUrlSha256: documentBound ? proof!.documentUrlSha256 : null,
    delivery: {
      http: facet(http, proofRefs, http ? [] : [sourceValid ? "main_document_delivery_unverified" : "gpc_artifact_unavailable_or_unverifiable"]),
      mainNavigator: facet(navigator, [sourceRef], navigator ? [] : ["main_navigator_unverified"]),
      fullContext: facet(fullContext, proofRefs, fullContext ? [] : ["full_context_delivery_unverified", ...(proof?.limitationKeys ?? [])]),
    },
    registration: { status: registrationStatus, basis: "current_recorded_state", causedByGpc: "not_established",
      cmpGpcSignal: state?.gpc === true ? "received" : state?.gpc === false ? "not_received" : "unknown",
      sale, sharing, observation: state ? observation : null,
      evidenceRefs: state ? semanticRefs : [], limitationKeys: state ? ["gpc_causation_not_established", ...(state.gpc !== true ? ["cmp_gpc_receipt_unverified"] : [])] : [observation ? `gpp_${observation.gppStatus}` : "sale_sharing_state_not_captured_or_unverifiable"] },
    acknowledgment: facet(acknowledgment, semanticRefs, acknowledgment ? [] : ["supported_live_status_not_observed"]),
    behavior: { status: requests.length ? "activity_observed" : captureComplete ? "no_qualified_activity_observed_in_capture" : "unknown",
      captureComplete, requestCount: requests.length, collectionRequestCount: requests.filter(r => r.collectionEndpointObserved).length,
      requests: requests.slice(0, 100), samplesTruncated: requests.length > 100,
      limitationKeys: [...(!captureComplete ? ["capture_incomplete_no_absence_conclusion"] : []), "sale_sharing_legal_meaning_not_established", "request_privacy_modes_not_decoded"] },
    baselineComparison: comparison,
    substantiveEvidence: { registration: sale !== "unknown" && sharing !== "unknown",
      collectionActivity: requests.some(r => r.collectionEndpointObserved) },
    release: { eligible: false, reasons: ["prototype_only", "fresh_public_calibration_required", "scoring_policy_not_integrated"] },
  });
}
