import { readBoundGpcCollectionComparison, gpcCollectionComparisonSchema, type GpcCollectionComparison, type CanonicalEvidenceBundle, type GpcBoundedObservation } from "@certscore/contracts";
import { inspectGpcRequestQualification, isCanonicalAdvertisingCollectionCandidate, resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { type GpcImpactSource } from "./gpc-impact-assessment.js";
import { prioritizeGpcRecipients } from "./gpc-request-proof.js";
import { gpcEndpointEvidence } from "./gpc-vendor-evidence.js";

/** Called only after the parent measured comparison has verified the pair.
 * The typed bundles are the parent builder's original size/SHA/schema-verified
 * values, as in the existing response assessment pattern. Never supply display
 * or merged bundles. The supplied GPC observation is already derived from those original bytes.
 * No new capture or object read. */
export function buildGpcCollectionComparison(input: { scanId: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource; observation?: GpcBoundedObservation }, durationMs: number, verified: { baseline: CanonicalEvidenceBundle; gpc: CanonicalEvidenceBundle }): GpcCollectionComparison | undefined {
  const { baseline, gpc } = verified;
  if (!baseline || !gpc || !input.baseline || !input.gpc || durationMs > 5000 || [baseline, gpc].some(b =>
    !b.gpcImpactCapture?.document || b.scanId !== input.scanId || b.gpcImpactCapture?.localRetention || b.gpcImpactCapture?.adaptiveObservation ||
    b.gpcImpactCapture?.requestLedger?.policyVersion === "gpc_compact_requests.local.v2")) return;
  // Reuse the coordinator's existing authoritative observation; never repeat
  // its bounded request-qualification pass to create contextual comparison.
  const observation = input.observation;
  if (!observation || observation.scanId !== input.scanId || observation.sourceSha256 !== input.gpc.pointer.sha256 ||
    observation.sessionSha256 !== gpc.gpcPrototypeSessionBinding?.sessionSha256 ||
    observation.documentUrlSha256 !== gpc.gpcImpactCapture?.document?.urlSha256) return;
  if (!observation.positiveEvidence?.representativeDocument || !observation.delivery.httpHeaderRetained ||
    !observation.delivery.mainNavigatorReadbackRetained || observation.requests.documentCommittedAtMs !== gpc.gpcImpactCapture?.document?.committedAtMs) return;
  const side = (b: CanonicalEvidenceBundle, enabled: boolean): GpcCollectionComparison["baseline"] => {
    const start = b.gpcImpactCapture!.document!.committedAtMs;
    const events = b.networkEvents.filter(e => e.timestampMs >= start && e.timestampMs < start + durationMs);
    const ids = new Map<string, number>(); for (const e of b.networkEvents) ids.set(e.eventId, (ids.get(e.eventId) ?? 0) + 1);
    const candidates = events.filter(e => e.collectionEndpointObserved && e.method !== "OPTIONS" &&
      /^https:/.test(e.requestUrl) && isCanonicalAdvertisingCollectionCandidate(e.requestUrl, e.resourceType));
    const rows: GpcCollectionComparison["baseline"]["rows"] = [];
    for (const e of candidates.slice(0, 100)) {
      if (ids.get(e.eventId) !== 1 || !e.requestId || b.networkEvents.filter(r => r.requestId === e.requestId).length !== 1 ||
        !e.requestHeaders || (enabled ? e.requestHeaders.secGpc !== "1" : e.requestHeaders.secGpc !== undefined)) continue;
      const responses = b.networkResponseEvents.filter(r => r.requestId === e.requestId);
      if (responses.length !== 1 || responses[0]!.status === undefined || responses[0]!.status! < 200 || responses[0]!.status! >= 400) continue;
      if (responses[0]!.responseUrl && responses[0]!.responseUrl !== e.requestUrl || responses[0]!.timestampMs < e.timestampMs) continue;
      const resolved = resolveCanonicalVendor({ type: "request", url: e.requestUrl, sourceScanner: "gpc_observation", matchSource: "network_request" }).observation;
      if (!resolved || resolved.confidence < .9 || !["advertising", "marketing"].includes(resolved.purpose) || resolved.registryAttribution?.matchKind !== "endpoint") continue;
      const vendors = b.normalizedVendorObservations.filter(v => v.matchedEvidenceIds.includes(e.eventId));
      if (!vendors.length || vendors.some(v => gpcEndpointEvidence(v, e.eventId) !== "verified" ||
        v.registryAttribution?.entityId !== resolved.registryAttribution!.entityId || v.purpose !== resolved.purpose)) continue;
      const gpcRecipient = observation.requests.advertisingCollectionRecipients?.rows.find(r => r.evidenceId === e.eventId);
      if (enabled && (!gpcRecipient || gpcRecipient.entityId !== resolved.registryAttribution.entityId || gpcRecipient.observedAtMs !== e.timestampMs)) continue;
      const qualification = enabled ? observation.requests.advertisingCollectionQualification?.rows.find(r => r.evidenceId === e.eventId)
        : inspectGpcRequestQualification(e.requestUrl, { gpcDelivered: false, requestAtMs: e.timestampMs });
      const activity = qualification?.activity;
      rows.push({ evidenceId: e.eventId, entityId: resolved.registryAttribution.entityId, label: resolved.entity.slice(0, 80),
        observedAfterDocumentCommitMs: e.timestampMs - start,
        identifierActivity: activity === "identity_sync" || activity === "audience_collection" || activity === "identified_advertising_collection" ? activity : "not_established",
        identifierBasis: activity === "identity_sync" || activity === "audience_collection" || activity === "identified_advertising_collection" ? qualification!.basis : null,
        processing: qualification?.processingSignals.length ? "privacy_context_observed" : "no_supported_privacy_context_observed" });
    }
    const selected = prioritizeGpcRecipients(rows, row => row.entityId, row => row.identifierActivity !== "not_established", 8);
    return { coverage: "retained_sample", identifierCoverage: enabled ? "canonical_qualification" : "url_only",
      rowsTruncated: rows.length > 8 || candidates.length > 100, rows: selected };
  };
  const b = side(baseline, false), g = side(gpc, true);
  if (!b.rows.length && !g.rows.length) return;
  const parsed = gpcCollectionComparisonSchema.safeParse({ contractVersion: "certscore.gpc-collection-comparison.v1", scanId: input.scanId,
    durationMs, sourceHashes: { baseline: input.baseline.pointer.sha256, gpc: input.gpc.pointer.sha256 },
    scope: "retained_successful_advertising_requests_in_matched_window", baseline: b, gpc: g,
    scoreEffect: "none", causedByGpc: "not_established", legalInterpretation: "not_assessed" });
  return parsed.success ? readBoundGpcCollectionComparison(parsed.data, { contractVersion: "certscore.gpc-response-assessment.v3",
    comparison: { baselineArtifact: input.baseline.pointer, gpcArtifact: input.gpc.pointer }, observation }, input.scanId) : undefined;
}
