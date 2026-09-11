import { createHash } from "node:crypto";
import {
  canonicalEvidenceBundleSchema, gpcBoundedObservationSchema, gpcResponseAssessmentV3Schema,
  type CanonicalEvidenceBundle, type GpcBoundedObservation, type GpcResponseAssessmentV2,
} from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import { evaluateGpcObservationSession } from "./gpc-observation-completion.js";
import type { GpcPrototypeArtifact } from "./gpc-opt-out-assessment.js";

/** Verifies the original worker bytes, including its inline producer-bound session.
 * The resulting independent observation never upgrades the paired v2 comparison. */
export function buildGpcProductionObservation(input: { scanId: string; source?: GpcPrototypeArtifact }): GpcBoundedObservation {
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
  const result = evaluateGpcObservationSession({ scanId: input.scanId, bundle, session,
    sourceBound: Boolean(bundle?.gpcPrototypeSessionBinding), evidenceRefs: bundle && source ? [source.pointer] : [] });
  // An independently blocked GPC lane cannot borrow representative access from
  // the baseline lane. Keep its directly retained facts, but limit completion.
  const representative = bundle?.scanNoGoAssessment?.decision !== "no_go" &&
    bundle?.scanEvidenceLaneAssessment?.outcome !== "no_go" &&
    bundle?.scanEvidenceLaneAssessment?.lanes.homepageRuntime === "usable";
  const limitationKeys = [...result.limitations, ...(!representative ? ["representative_access_not_verified"] : [])];
  const semantic = result.documentBound ? session?.semanticObservation : null;
  const state = semantic?.gppStatus === "observed" ? result.currentSaleSharingState : null;
  const axis = (notice?: number, value?: number) => notice === 1 && value === 1 ? "opted_out" : notice === 1 && value === 2 ? "not_opted_out" : "unknown";
  const vendors = new Map<string, CanonicalEvidenceBundle["normalizedVendorObservations"]>();
  for (const vendor of bundle?.normalizedVendorObservations ?? []) {
    if (!["advertising", "marketing", "analytics", "session_replay"].includes(vendor.purpose)) continue;
    for (const id of vendor.matchedEvidenceIds) vendors.set(id, [...(vendors.get(id) ?? []), vendor]);
  }
  const eventCounts = new Map<string, number>();
  for (const event of bundle?.networkEvents ?? []) eventCounts.set(event.eventId, (eventCounts.get(event.eventId) ?? 0) + 1);
  const retained = new Map(session?.requests.map(r => [r.eventId, r]));
  const classified = (result.documentBound && result.delivery.httpHeaderRetained ? bundle?.networkEvents ?? [] : []).filter(event => {
    const request = retained.get(event.eventId);
    const matches = new Set((vendors.get(event.eventId) ?? []).map(v => `${v.vendor}|${v.product}|${v.purpose}`));
    return matches.size === 1 && eventCounts.get(event.eventId) === 1 && request?.secGpc === "1" &&
      request.urlSha256 === gpcDocumentHash(event.requestUrl) && request.timestampMs === event.timestampMs &&
      event.timestampMs >= session!.mainDocument!.committedAtMs && event.timestampMs <= session!.captureEndedAtMs;
  });
  return gpcBoundedObservationSchema.parse({
    contractVersion: "certscore.gpc-bounded-observation.v1", scope: "main_document_and_retained_http_requests",
    status: result.completed && representative ? "complete" : result.sourceVerified ? "limited" : "unavailable",
    sourceSha256: source?.pointer.sha256 ?? null,
    sessionSha256: result.sourceVerified ? bundle!.gpcPrototypeSessionBinding!.sessionSha256 : null,
    documentUrlSha256: result.documentBound ? session!.mainDocument!.documentUrlSha256 : null,
    delivery: result.delivery, semanticProbe: semantic?.gppStatus ?? "incomplete",
    registration: { basis: "current_recorded_state", sale: axis(state?.saleNotice, state?.saleOptOut), sharing: axis(state?.sharingNotice, state?.sharingOptOut),
      cmpGpcSignal: state?.gpc === true ? "received" : state?.gpc === false ? "not_received" : "unknown", causedByGpc: "not_established" },
    acknowledgment: { observed: result.acknowledgmentObserved, captureComplete: result.acknowledgmentCaptureComplete },
    requests: { count: result.requestCapture.count, blockedBeforeTransmissionCount: result.requestCapture.blockedBeforeTransmissionCount, complete: result.requestCapture.complete,
      fromMs: result.requestCapture.fromMs, documentCommittedAtMs: result.requestCapture.documentCommittedAtMs, throughMs: result.requestCapture.throughMs,
      classifiedCount: classified.length, collectionCount: classified.filter(r => r.collectionEndpointObserved).length,
      evidenceIds: classified.slice(0, 100).map(r => r.eventId), samplesTruncated: classified.length > 100 },
    limitationKeys, scoreEffect: "none", legalInterpretation: "not_assessed",
  });
}
export function buildGpcProductionAssessment(input: { scanId: string; comparison: GpcResponseAssessmentV2; source?: GpcPrototypeArtifact }) {
  return gpcResponseAssessmentV3Schema.parse({ ...input.comparison, contractVersion: "certscore.gpc-response-assessment.v3",
    observation: buildGpcProductionObservation(input) });
}
