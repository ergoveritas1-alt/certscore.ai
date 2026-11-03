import { gpcGuidanceSchema, gpcPolicyCollectionEvidenceIds, type GpcBoundedObservation, type GpcCmpStateComparison, type GpcGuidanceItem, type GpcResponseAssessment } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { deriveCaliforniaGpcResponsePolicy } from "./california-gpc-response-policy";
import { deriveGppPropagationPolicy, GPP_PROPAGATION_FINDING_ID } from "./gpp-propagation-policy";
import { gpcVendorFindings } from "./choice-vendor-findings";
import { sanitizePublicReportEvidenceText } from "./compact-evidence-json";

const retest = "Compare independent fresh GPC-off and GPC-on visits to the same URL and region. Verify actual header/browser delivery, record each visit's CMP state and inspect the cited requests over equal windows, including later callbacks. Retain sanitized evidence; a current state or zero early-window activity alone does not establish honoring.";
function recipientLabel(value: string) {
  // Canonical labels only; reject URL/identifier-shaped text rather than retaining
  // paths, query keys or raw values. Reuse established public text sanitization.
  const label = sanitizePublicReportEvidenceText(value).trim();
  return /^[A-Za-z][A-Za-z .&()-]{0,79}$/.test(label) ? label : "Retained recipient";
}
function requestEvidence(row: { evidenceId: string; label: string; observedAtMs?: number }, prior?: number) {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(row.evidenceId)) return [];
  return [{evidenceId: row.evidenceId, recipient: recipientLabel(row.label),
    ...(row.observedAtMs !== undefined && row.observedAtMs <= 120_000 ? {observedAtMs: row.observedAtMs} : {}),
    ...(prior !== undefined && prior <= 120_000 ? {priorCmpObservedAtMs: prior} : {})}];
}

/** Descriptive only: the caller supplies existing surfaced canonical owners.
 * Neither neutral availability nor a paired CMP packet can create an owner. */
export function buildGpcGuidance(assessment: GpcResponseAssessment, findings: UnifiedFindingDisplayPacket[], cmpStateComparison?: GpcCmpStateComparison) {
  if (assessment.contractVersion !== "certscore.gpc-response-assessment.v3") return undefined;
  const o = assessment.observation, policy = deriveCaliforniaGpcResponsePolicy(assessment);
  const hasOwner = (id: string) => findings.some(f => f.unifiedFindingId === id && f.presentationDecision.status === "surface" &&
    f.details?.family === "privacy_signal" && f.details.assessment.comparison.gpcArtifact?.sha256 === assessment.comparison.gpcArtifact?.sha256 &&
    f.details.assessment.contractVersion === "certscore.gpc-response-assessment.v3" && f.details.assessment.observation.scanId === o.scanId);
  const items: GpcGuidanceItem[] = [];
  // The same authoritative verification gate handles collection and contradiction;
  // qualifying evidence IDs are separate so coexisting cases stay distinct.
  const contradiction = policy.reasonCode === "verified_gpc_choice_contradiction";
  if (hasOwner("gpc_response") && contradiction) items.push({kind: "adverse", code: "gpc_choice_contradiction", findingId: "gpc_response",
    observation: "Verified GPC delivery and site-recorded GPC receipt were observed while an applicable sale or sharing opt-out was recorded as off.",
    responsibleRole: "CMP owner + developer; privacy owner confirms applicability", evidence: [],
    whatToCheck: ["Reproduce the recorded receipt and applicable opt-out fields in the same document. Trace the CMP's GPC handler and its effective regional sale/sharing configuration; a visible acknowledgment alone is separate evidence.",
      "Confirm intended treatment with the privacy owner. Correct a verified mismatch in the CMP mapping or initialization order, then check dependent integrations receive the effective state."], retest});
  const ids = new Set(gpcPolicyCollectionEvidenceIds(o)), vendors = gpcVendorFindings(assessment);
  if (hasOwner("gpc_response") && vendors.length) items.push({
    kind: "adverse", code: "qualified_collection_under_gpc", findingId: "gpc_response",
    observation: "Qualified identified collection, advertising, audience or synchronization activity was observed under verified GPC delivery.",
    responsibleRole: "Developer + integration/tag-manager owner; privacy owner confirms purpose",
    evidence: (o.requests.advertisingCollectionRecipients?.rows ?? []).filter(r => ids.has(r.evidenceId) && vendors.some(v => v.evidenceIds.includes(r.evidenceId))).slice(0, 8).flatMap(r => requestEvidence(r)),
    whatToCheck: ["Locate each cited request in DevTools Network and inspect its Initiator to trace the integration, tag, SDK or server forwarding route. Inspect applicable purpose and effective privacy configuration using synthetic test data.",
      "Review request-local restrictions separately from independently qualifying requests. If behavior conflicts with the approved purpose or choice, correct the initiating integration's privacy settings and guard queued or delayed callbacks. Verify the resulting request fields and downstream configuration."], retest});
  const propagationOwner = findings.find(f => f.unifiedFindingId === GPP_PROPAGATION_FINDING_ID && f.presentationDecision.status === "surface" &&
    f.details?.family === "privacy_signal" && f.details.assessment.contractVersion === "certscore.gpc-response-assessment.v3" &&
    f.details.assessment.observation.scanId === o.scanId &&
    f.details.assessment.comparison.gpcArtifact?.sha256 === assessment.comparison.gpcArtifact?.sha256);
  const propagation = propagationOwner?.details?.family === "privacy_signal"
    ? deriveGppPropagationPolicy(propagationOwner.details.assessment) : undefined;
  if (propagation) for (const reason of ["applicable_section_missing", "empty_gpp_after_observed_cmp_state"] as const) {
    const rows = propagation.rows.filter(r => r.reason === reason);
    if (!rows.length) continue;
    items.push({kind: "adverse", findingId: GPP_PROPAGATION_FINDING_ID,
      code: reason === "applicable_section_missing" ? "gpp_applicable_section_missing" : "gpp_empty_after_prior_state",
      observation: reason === "applicable_section_missing" ? "A request explicitly declared an applicable GPP section that was missing from its payload." : "Empty GPP fields were retained after a usable prior same-document GPP state.",
      responsibleRole: "CMP owner + developer/integration owner",
      evidence: rows.slice(0, 8).flatMap(r => { const recipient = propagation.recipients.find(p => p.evidenceId === r.evidenceId); return recipient ? requestEvidence(recipient, r.cmpEvidence?.observedAtMs) : []; }),
      whatToCheck: [reason === "applicable_section_missing" ? "Trace the cited request's integration and compare its declared applicable sections with the sections actually serialized. Correct a verified section-selection or serialization mismatch." : "Trace the request's integration and its GPP serialization order against the retained prior CMP timestamp. Correct a verified stale/empty read or initialization race; a later terminal readback cannot establish earlier state.",
        "Inspect the integration's documented CMP interface and forwarding configuration, then verify the corrected request with sanitized test evidence."], retest});
  }
  items.push({kind: "neutral", code: "gpc_observation_availability", semanticProbe: o.semanticProbe,
    observation: `GPC delivery: ${o.delivery.httpHeaderRetained && o.delivery.mainNavigatorReadbackRetained ? "verified on the page request and browser property" : "not fully verified"}. CMP semantic observation: ${o.semanticProbe}.${readinessDescription(o)}`,
    responsibleRole: "Developer + CMP owner", evidence: [],
    whatToCheck: [o.semanticProbe === "observed" ? "Inspect current recorded sale/sharing state separately from site-recorded signal receipt, visible acknowledgment and request activity. These facts alone do not establish downstream treatment." : "Reproduce in a fresh visit and inspect the CMP's documented supported interface, readiness and document lifecycle. This availability result does not establish its cause or require a particular API.",
      ...(!cmpStateComparison ? [cmpComparisonOmission(assessment)] : [])], retest});
  return gpcGuidanceSchema.parse({contractVersion: "certscore.gpc-guidance.v1", items});
}

function readinessDescription(o: GpcBoundedObservation) {
  if (o.semanticProbe !== "not_ready" && o.semanticProbe !== "unavailable") return "";
  const r = o.semanticReadiness;
  if (!r) return o.semanticProbe === "not_ready" ? " A more specific readiness reason was not retained in this report."
    : " A more specific interface-availability reason was not retained in this report.";
  const reason = r.reason === "api_unavailable"
    ? "The supported GPP API was not callable in the main document at the terminal checkpoint. CMP identification is separate evidence and does not establish this interface's availability."
    : r.reason === "synchronous_ping_unavailable"
    ? "The single bounded GPP ping did not yield a successful synchronous callback; CMP and signal readiness were not established."
    : `The GPP ping reported ${[!r.cmpStatusLoaded ? "CMP status other than loaded" : "", !r.signalStatusReady ? "signal status other than ready" : ""].filter(Boolean).join(" and ")}.`;
  return ` ${reason} Observed +${r.observedAfterDocumentCommitMs} ms from this visit's document commit.`;
}

function cmpComparisonOmission(assessment: GpcResponseAssessment) {
  const limits = new Set(assessment.comparison.limitationKeys);
  const observation = assessment.contractVersion === "certscore.gpc-response-assessment.v3" ? assessment.observation : undefined;
  const semanticReason = observation && ({
    unavailable: observation.semanticReadiness?.reason === "api_unavailable"
      ? "the supported main-document GPP API was not callable in the GPC visit"
      : "a usable GPC-session CMP state was not retained (semantic probe unavailable)",
    not_ready: "a usable GPC-session CMP state was not verified because the supported semantic probe was not ready at the checkpoint",
    unsupported: "the GPC-session semantic probe did not yield a supported CMP state",
    invalid: "the GPC-session semantic probe did not yield a valid CMP state",
    incomplete: "the GPC-session semantic probe did not complete with verified document-bound state",
    observed: observation.registration.sale === "unknown" || observation.registration.sharing === "unknown"
      ? "both applicable sale and sharing opt-out values were not explicitly known in the GPC-session snapshot" : "",
  })[observation.semanticProbe];
  const reasons = [
    semanticReason,
    limits.has("baseline_signal_readback_unverified") ? "full-context GPC-off browser readback was not verified" : "",
    limits.has("gpc_signal_readback_unverified") ? "full-context GPC-on browser readback was not verified" : "",
    limits.has("baseline_gpc_off_not_verified") ? "actual GPC-off delivery was not verified in the baseline visit" : "",
    limits.has("paired_scan_context_mismatch") || limits.has("browser_protocol_mismatch") || limits.has("baseline_gpc_document_mismatch")
      ? "the paired scan, browser or document context did not match the comparison requirements" : "",
    limits.has("baseline_not_representative") || limits.has("gpc_not_representative") ? "representative page access was not verified for both visits" : "",
    limits.has("baseline_settle_not_completed") || limits.has("gpc_settle_not_completed") ? "the paired document-settling checks did not complete" : "",
  ].filter(Boolean);
  return `Site-recorded opt-out settings comparison is unavailable${reasons.length ? `: ${reasons.slice(0,3).join("; ")}${reasons.length > 3 ? "; additional paired prerequisites remain unverified" : ""}` : ": a verified pair of ready, supported sale and sharing snapshots is not available in this report"}. No baseline setting or unchanged state is inferred. Current GPC-session facts and any request-activity comparison remain separate evidence.`;
}
