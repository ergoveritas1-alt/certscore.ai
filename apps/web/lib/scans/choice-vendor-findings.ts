import { gpcPolicyCollectionEvidenceIds, type GpcResponseAssessment } from "@certscore/contracts";
import { deriveCaliforniaGpcResponsePolicy } from "./california-gpc-response-policy";
import type { AfterRejectScoringAssessment } from "./after-reject-scoring-contract";

/** Describe independently established path findings. Recipient deduplication
 * belongs to the CA score union, never to this per-path evidence projection. */
export function gpcVendorFindings(assessment: GpcResponseAssessment) {
  if (assessment.contractVersion !== "certscore.gpc-response-assessment.v3" || !assessment.observation.requests.advertisingCollectionQualification) return [];
  const policy = deriveCaliforniaGpcResponsePolicy(assessment);
  const recipients = new Set(policy.recipientIds ?? []);
  const evidenceIds = new Set(gpcPolicyCollectionEvidenceIds(assessment.observation));
  const groups = new Map<string, {entityId: string; entity: string; firstMs?: number; requestCount: number; evidenceIds: string[]}>();
  for (const row of assessment.observation.requests.advertisingCollectionRecipients?.rows ?? []) {
    if (!recipients.has(row.entityId) || !evidenceIds.has(row.evidenceId)) continue;
    const group = groups.get(row.entityId) ?? {entityId: row.entityId, entity: row.label, requestCount: 0, evidenceIds: []};
    group.requestCount++;
    group.evidenceIds.push(row.evidenceId);
    if (row.observedAtMs !== undefined) group.firstMs = Math.min(group.firstMs ?? row.observedAtMs, row.observedAtMs);
    groups.set(row.entityId, group);
  }
  return [...groups.values()].sort((a, b) => (a.firstMs ?? Infinity) - (b.firstMs ?? Infinity) || a.entityId.localeCompare(b.entityId));
}

export function gpcVendorFindingSummary(assessment: GpcResponseAssessment): string {
  const vendors = gpcVendorFindings(assessment);
  if (!vendors.length) return "";
  const shown = vendors.slice(0, 8).map(row => `${row.entity}${row.firstMs === undefined ? "" : ` (first observed +${row.firstMs} ms from GPC visit start)`}`);
  const declared=assessment.contractVersion==="certscore.gpc-response-assessment.v3" && assessment.observation.requests.advertisingCollectionQualification?.rows.some(row=>row.propertyEvidence);
  return `${declared?"Identified collection corroborated by property-specific sale/sharing declarations, or supported advertising, audience or synchronization activity":"Advertising identity, audience or synchronization activity"} with GPC enabled: ${shown.join("; ")}${vendors.length > shown.length ? `; ${vendors.length - shown.length} additional recipients in retained evidence` : ""}.`;
}

export function rejectVendorFindingSummary(assessment: AfterRejectScoringAssessment): string {
  const evidence = assessment.entityEvidence;
  if (!evidence) return "";
  const vendors = evidence.entities.map(entity => {
    const rows = evidence.observations.filter(row => row.entityId === entity.entityId);
    const first = rows.reduce<number | undefined>((at, row) => Math.min(at ?? row.msAfterClick, row.msAfterClick), undefined);
    const kinds = [...new Set(rows.map(row => row.kind === "cookie_snapshot" ? "cookie snapshot" : "service request"))];
    return `${entity.entity} (${kinds.join(" and ")}${first === undefined ? "" : `, first observed +${first} ms after Reject click`})`;
  });
  return vendors.length ? `Non-essential entities after Reject: ${vendors.slice(0, 8).join("; ")}${vendors.length > 8 ? `; ${vendors.length - 8} additional entities in retained evidence` : ""}.` : "";
}
