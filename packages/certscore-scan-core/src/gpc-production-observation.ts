import {qualifyGpcRequest,prioritizeGpcRecipients} from "./gpc-request-proof";
import {isCanonicalAdvertisingCollectionCandidate, resolveCanonicalVendor, CANONICAL_VENDOR_RESOLVER_VERSION,
  GPC_REQUEST_QUALIFICATION_POLICY} from "@certscore/vendor-resolver";
import { extractPropertySaleSharingSource, matchPropertySaleSharingRequest } from "@certscore/vendor-resolver/property-sale-sharing";
import { createHash } from "node:crypto";
import {
  isQualifyingSaleSharingRequest, canonicalEvidenceBundleSchema, gpcBoundedObservationSchema, gpcResponseAssessmentV3Schema,
  type CanonicalEvidenceBundle, type GpcBoundedObservation, type GpcResponseAssessmentV2,
} from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import { evaluateGpcObservationSession } from "./gpc-observation-completion.js";
import type { GpcPrototypeArtifact } from "./gpc-opt-out-assessment.js";
import { gpcEndpointEvidence } from "./gpc-vendor-evidence.js";

/** Verifies the original worker bytes, including its inline producer-bound session.
 * The resulting independent observation never upgrades the paired v2 comparison. */
export function buildGpcProductionObservation(input: { scanId: string; source?: GpcPrototypeArtifact; propertySource?: GpcPrototypeArtifact }): GpcBoundedObservation {
  let bundle: CanonicalEvidenceBundle | null = null;
  const source = input.source;
  try {
    if (source && source.bytes.byteLength <= 20_000_000 && source.bytes.byteLength === source.pointer.sizeBytes &&
      createHash("sha256").update(source.bytes).digest("hex") === source.pointer.sha256) {
      const parsed = canonicalEvidenceBundleSchema.parse(JSON.parse(Buffer.from(source.bytes).toString("utf8")));
      if (parsed.scanId === input.scanId) bundle = parsed;
    }
  } catch { /* Invalid evidence produces an explicit unavailable observation. */ }
  const session = bundle?.gpcObservationSession;
  let policyBundle = bundle;
  let policyHash = source?.pointer.sha256;
  if (input.propertySource) {
    policyBundle = null; policyHash = undefined;
    const s = input.propertySource;
    try {
      if (s.bytes.length <= 20_000_000 && s.bytes.length === s.pointer.sizeBytes && createHash("sha256").update(s.bytes).digest("hex") === s.pointer.sha256) {
        const candidate = canonicalEvidenceBundleSchema.parse(JSON.parse(Buffer.from(s.bytes).toString("utf8")));
        if (candidate.scanId === input.scanId && candidate.url === bundle?.url) { policyBundle = candidate; policyHash = s.pointer.sha256; }
      }
    } catch { /* A bad corroborating source cannot invalidate independent requests. */ }
  }
  const propertySource = policyBundle && policyHash && policyBundle.scanId === input.scanId
    ? extractPropertySaleSharingSource({ scanId: input.scanId, targetUrl: policyBundle.url, sourceBundleSha256: policyHash, observations: policyBundle.policySurfaceObservations }) : undefined;
  const result = evaluateGpcObservationSession({ scanId: input.scanId, bundle, session,
    sourceBound: Boolean(bundle?.gpcPrototypeSessionBinding), evidenceRefs: bundle && source ? [source.pointer] : [] });
  // An independently blocked GPC lane cannot borrow representative access from
  // the baseline lane. Keep its directly retained facts, but limit completion.
  const lane = bundle?.scanLaneRuns.find(run => run.laneId === "gpc_observation");
  const representative = bundle?.scanNoGoAssessment?.decision !== "no_go" &&
    bundle?.scanEvidenceLaneAssessment?.outcome !== "no_go" &&
    (lane ? lane.accessOutcome === "representative_page" && !lane.challengeDetected &&
      lane.executionOutcome !== "failed" : bundle?.scanEvidenceLaneAssessment?.lanes.homepageRuntime === "usable");
  const limitationKeys = [...result.limitations, ...(!representative ? ["representative_access_not_verified"] : [])];
  const semantic = result.documentBound ? session?.semanticObservation : null;
  const state = semantic?.gppStatus === "observed" ? result.currentSaleSharingState : null;
  const axis = (notice?: number, value?: number) => notice === 1 && value === 1 ? "opted_out" : notice === 1 && value === 2 ? "not_opted_out" : "unknown";
  const vendors = new Map<string, CanonicalEvidenceBundle["normalizedVendorObservations"]>();
  for (const vendor of bundle?.normalizedVendorObservations ?? []) {
    if (!["advertising", "marketing", "analytics", "session_replay"].includes(vendor.purpose)) continue;
    // Cookie association identifies transmitted storage, not this endpoint's purpose.
    for (const id of vendor.matchedEvidenceIds) {
      if (gpcEndpointEvidence(vendor, id) === "verified") vendors.set(id, [...(vendors.get(id) ?? []), vendor]);
    }
  }
  const eventCounts = new Map<string, number>();
  for (const event of bundle?.networkEvents ?? []) eventCounts.set(event.eventId, (eventCounts.get(event.eventId) ?? 0) + 1);
  const retained = new Map(session?.requests.map(r => [r.eventId, r]));
  const classified = (result.documentBound && result.delivery.httpHeaderRetained ? bundle?.networkEvents ?? [] : []).filter(event => {
    const request = retained.get(event.eventId);
    // Historical inventories can retain overlapping services belonging to the
    // same recipient. Product naming is not a recipient/purpose conflict.
    // Keep distinct entities, vendors and purposes fail-closed, and still
    // require unambiguous current endpoint attribution below for collection.
    const matches = new Set((vendors.get(event.eventId) ?? []).map(v =>
      `${v.registryAttribution?.entityId ?? v.entity}|${v.vendor}|${v.purpose}`));
    return matches.size === 1 && eventCounts.get(event.eventId) === 1 && request?.secGpc === "1" &&
      request.urlSha256 === gpcDocumentHash(event.requestUrl) && request.timestampMs === event.timestampMs &&
      event.timestampMs >= session!.mainDocument!.committedAtMs && event.timestampMs <= session!.captureEndedAtMs;
  });
  const collectionRecipients = new Map<string, {evidenceId:string;entityId:string;label:string;observedAtMs:number}>();
  const propertyCandidates = new Set<string>();
  const advertisingCollection = classified.filter(event => {
    const propertyEndpoint=Boolean(propertySource?.declarations.length) && /^https:\/\/(?:www\.)?google-analytics\.com\/g\/collect(?:[?]|$)/.test(event.requestUrl);
    if (!event.collectionEndpointObserved || !(isCanonicalAdvertisingCollectionCandidate(event.requestUrl, event.resourceType)||propertyEndpoint) || event.method === "OPTIONS" || !/^https:/.test(event.requestUrl)) return false;
    const status = bundle?.networkResponseEvents.find(row=>row.requestId === event.requestId)?.status;
    if (status === undefined || status < 200 || status >= 400) return false;
    const resolved=resolveCanonicalVendor({type:"request",url:event.requestUrl,sourceScanner:"gpc_observation",matchSource:"network_request"}).observation;
    const qualified = resolved && resolved.confidence >= 0.9 && (["advertising","marketing"].includes(resolved.purpose) ||
      resolved.purpose === "analytics" && Boolean(propertySource?.declarations.length) && /^https:\/\/(?:www\.)?google-analytics\.com\/g\/collect(?:[?]|$)/.test(event.requestUrl)) &&
      resolved.registryAttribution?.matchKind === "endpoint" &&
      (vendors.get(event.eventId) ?? []).every(v =>
        v.registryAttribution?.entityId === resolved.registryAttribution!.entityId && v.purpose === resolved.purpose);
    if (qualified) {
      collectionRecipients.set(event.eventId, { evidenceId:event.eventId, entityId:resolved.registryAttribution!.entityId, label:resolved.entity, observedAtMs:event.timestampMs });
      if (resolved.purpose === "analytics") propertyCandidates.add(event.eventId);
    }
    return qualified;
  });
  // Keep the existing 100-qualification compute cap as well as the output cap.
  // Choose distinct recipients before spending inspections on duplicates.
  const candidates=prioritizeGpcRecipients(advertisingCollection,event=>collectionRecipients.get(event.eventId)!.entityId,()=>false,100);
  const allQualifications = new Map(candidates.map(event => {
    const base = qualifyGpcRequest(event,session!, {gpcDelivered:true,requestAtMs:event.timestampMs,
      ...(state && semantic ? {cmp:{capturedAtMs:semantic.capturedAtMs,sectionId:semantic.usca?8 as const:7 as const,
        saleNotice:state.saleNotice,sharingNotice:state.sharingNotice,saleOptOut:state.saleOptOut,sharingOptOut:state.sharingOptOut,gpc:state.gpc}} : {})});
    let property = base.activity === "unresolved" ? matchPropertySaleSharingRequest(event.requestUrl, propertySource) : undefined;
    // Body-sourced property/identity digests may corroborate the same Request.
    // This adds discoveries; it never gates independently identified URL proof.
    if(!property && base.activity==="unresolved" && propertySource){
      const retained=session!.requestProofCapture?.rows.find(r=>r.eventId===event.eventId && r.documentToken===session!.mainDocument?.documentToken &&
        r.proof.requestId===event.requestId && r.proof.method===event.method && r.proof.startedAtMs===event.timestampMs && r.proof.urlSha256===gpcDocumentHash(event.requestUrl) &&
        r.proof.entity.entityId===collectionRecipients.get(event.eventId)?.entityId && r.proof.proof?.headersStatus==="complete" && ["absent","complete"].includes(r.proof.proof.bodyStatus));
      const declared=propertySource.declarations.find(d=>d.propertyIdSha256===retained?.proof.propertyBinding?.propertyIdSha256);
      if(retained && declared)property={policyVersion:"corroborated_property_collection.v1",sourceBundleSha256:propertySource.sourceBundleSha256,
        declarationId:declared.declarationId,propertyIdSha256:declared.propertyIdSha256,requestUrlSha256:retained.proof.urlSha256};
    }
    const declaration = propertySource?.declarations.find(d=>d.declarationId===property?.declarationId);
    return [event.eventId, property && declaration ? {...base, activity:"declared_sale_sharing_collection" as const, basis:declaration.basis, propertyEvidence:property} : base] as const;
  }));
  const supportedCandidates = candidates.filter(event => collectionRecipients.get(event.eventId) &&
    (!propertyCandidates.has(event.eventId) ||
      Boolean(allQualifications.get(event.eventId)?.propertyEvidence)));
  const selectedCollection=prioritizeGpcRecipients(supportedCandidates,event=>collectionRecipients.get(event.eventId)!.entityId,
    event=>isQualifyingSaleSharingRequest(allQualifications.get(event.eventId)!),100);
  const qualification=selectedCollection.map(event=>({evidenceId:event.eventId,...allQualifications.get(event.eventId)!}));
  // Review visibility has a lower purpose-attribution threshold than the full
  // recipient family. Reuse its qualification work and only unused inspection
  // slots; successful, source-bound collection is still required.
  const reviewRows: NonNullable<GpcBoundedObservation["requests"]["collectionReview"]>["rows"] = [];
  if (representative && result.delivery.httpHeaderRetained && result.delivery.mainNavigatorReadbackRetained) {
    const extra = prioritizeGpcRecipients(classified.filter(e => !allQualifications.has(e.eventId) && e.collectionEndpointObserved &&
      e.method !== "OPTIONS" && /^https:/.test(e.requestUrl) && !["script", "document", "stylesheet", "font"].includes(e.resourceType ?? "")),
      e => vendors.get(e.eventId)?.[0]?.registryAttribution?.entityId ?? e.eventId, () => false, Math.max(0, 100 - candidates.length));
    const reviewCandidates = [...candidates, ...extra];
    for (const event of reviewCandidates) {
      const status = bundle?.networkResponseEvents.find(r => r.requestId === event.requestId)?.status;
      if (!event.collectionEndpointObserved || status === undefined || status < 200 || status >= 400) continue;
      const resolved = resolveCanonicalVendor({type:"request",url:event.requestUrl,sourceScanner:"gpc_observation",matchSource:"network_request"}).observation;
      if (!resolved || resolved.confidence < .9 || resolved.registryAttribution?.matchKind !== "endpoint" ||
        !["analytics", "advertising", "marketing", "session_replay"].includes(resolved.purpose) ||
        !(vendors.get(event.eventId) ?? []).every(v => v.registryAttribution?.entityId === resolved.registryAttribution!.entityId && v.purpose === resolved.purpose)) continue;
      reviewRows.push({evidenceId:event.eventId,entityId:resolved.registryAttribution.entityId,label:resolved.entity,
        purpose:resolved.purpose as "analytics"|"advertising"|"marketing"|"session_replay",observedAtMs:event.timestampMs,httpStatus:status,
        qualification:allQualifications.get(event.eventId) ?? qualifyGpcRequest(event,session!,{gpcDelivered:true,requestAtMs:event.timestampMs})});
    }
  }
  const propagation: NonNullable<GpcBoundedObservation["requests"]["gppPropagation"]> = {
    contractVersion:"gpp_propagation_evidence.v1",rows:[],
  };
  for (const event of selectedCollection) {
    const decoded=qualification.find(row=>row.evidenceId===event.eventId)!.gpp;
    if (!decoded || decoded.status !== "invalid") continue;
    const missing=decoded.applicableSections.filter((id):id is 7|8=>[7,8].includes(id) && !decoded.sectionIds.includes(id));
    if (decoded.reasons.length === 1 && decoded.reasons[0] === "applicable_section_missing" && missing.length) {
      propagation.rows.push({evidenceId:event.eventId,reason:"applicable_section_missing",observedAtMs:event.timestampMs,applicableSections:missing});
      continue;
    }
    // Empty fields require an independently observed, prior same-document GPP
    // state. A terminal readback after the request cannot supply this proof.
    const q=new URL(event.requestUrl).searchParams;
    if (q.getAll("gpp").length !== 1 || q.get("gpp") !== "" || q.getAll("gpp_sid").length !== 1 || q.get("gpp_sid") !== "") continue;
    const prior=semantic?.stateTransitions?.filter(row=>row.observedAtMs <= event.timestampMs).at(-1);
    if (!prior || prior.status !== "observed" || prior.state?.gpc !== true || !prior.stateSha256 ||
      prior.observedAtMs < session!.mainDocument!.committedAtMs ||
      createHash("sha256").update(JSON.stringify(prior.state)).digest("hex") !== prior.stateSha256) continue;
    propagation.rows.push({evidenceId:event.eventId,reason:"empty_gpp_after_observed_cmp_state",observedAtMs:event.timestampMs,
      applicableSections:[prior.state.sectionId],cmpEvidence:{observedAtMs:prior.observedAtMs,sectionId:prior.state.sectionId,
        stateSha256:prior.stateSha256,gpc:true}});
  }
  return gpcBoundedObservationSchema.parse({
    contractVersion: "certscore.gpc-bounded-observation.v1", scanId:input.scanId, scope: "main_document_and_retained_http_requests",
    status: result.completed && representative ? "complete" : result.sourceVerified ? "limited" : "unavailable",
    sourceSha256: source?.pointer.sha256 ?? null,
    sessionSha256: result.sourceVerified ? bundle!.gpcPrototypeSessionBinding!.sessionSha256 : null,
    documentUrlSha256: result.documentBound ? session!.mainDocument!.documentUrlSha256 : null,
    positiveEvidence: { policyVersion: "gpc_positive_evidence.v1", representativeDocument: Boolean(result.sourceVerified && result.documentBound && representative) },
    delivery: result.delivery, semanticProbe: semantic?.gppStatus ?? "incomplete",
    registration: { basis: "current_recorded_state", sale: axis(state?.saleNotice, state?.saleOptOut), sharing: axis(state?.sharingNotice, state?.sharingOptOut),
      cmpGpcSignal: state?.gpc === true ? "received" : state?.gpc === false ? "not_received" : "unknown", causedByGpc: "not_established" },
    acknowledgment: { observed: result.acknowledgmentObserved, captureComplete: result.acknowledgmentCaptureComplete },
    requests: { count: result.requestCapture.count, blockedBeforeTransmissionCount: result.requestCapture.blockedBeforeTransmissionCount, complete: result.requestCapture.complete,
      fromMs: result.requestCapture.fromMs, documentCommittedAtMs: result.requestCapture.documentCommittedAtMs, throughMs: result.requestCapture.throughMs,
      advertisingCollectionCount: advertisingCollection.filter(event=>!propertyCandidates.has(event.eventId)).length + supportedCandidates.filter(event=>Boolean(allQualifications.get(event.eventId)?.propertyEvidence)).length,
      advertisingCollectionEvidenceIds: selectedCollection.map(row=>row.eventId),
      advertisingCollectionRecipients: { contractVersion: "canonical_collection_recipients.v1", resolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
        rows: selectedCollection.map(event => collectionRecipients.get(event.eventId)!) },
      advertisingCollectionQualification: { policyVersion: GPC_REQUEST_QUALIFICATION_POLICY, rows:qualification },
      ...(qualification.some(row=>row.propertyEvidence) ? {propertySaleSharingSource:propertySource} : {}),
      gppPropagation: propagation,
      classifiedCount: classified.length, collectionCount: classified.filter(r => r.collectionEndpointObserved).length,
      collectionReview: {policyVersion:"gpc_collection_review.v1",rows:prioritizeGpcRecipients(reviewRows,r=>r.entityId,()=>false,32)},
      evidenceIds: classified.slice(0, 100).map(r => r.eventId), samplesTruncated: classified.length > 100 },
    limitationKeys, scoreEffect: "none", legalInterpretation: "not_assessed",
  });
}
export function buildGpcProductionAssessment(input: { scanId: string; comparison: GpcResponseAssessmentV2; source?: GpcPrototypeArtifact; propertySource?: GpcPrototypeArtifact }) {
  return gpcResponseAssessmentV3Schema.parse({ ...input.comparison, contractVersion: "certscore.gpc-response-assessment.v3",
    observation: buildGpcProductionObservation(input) });
}
