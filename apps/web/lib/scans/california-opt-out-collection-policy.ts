import { getCanonicalVendorRegistryManifest } from "@certscore/vendor-resolver";
import type { CaliforniaPrivacyReview } from "@certscore/contracts";
import { californiaChoiceEnforcementPoints } from "./california-choice-enforcement-policy";

// Keep registry resolution out of the small shared GPC presentation policy.
const entityByRule = new Map(getCanonicalVendorRegistryManifest().rules
  .filter(rule => ["advertising", "marketing"].includes(rule.purpose))
  .map(rule => [rule.ruleId, rule.entityId]));

/** The explicit observer already retained verified endpoint-rule provenance.
 * Resolve that provenance through the single registry, never labels or domains. */
export function californiaOptOutCollectionPolicy(assessment?: CaliforniaPrivacyReview) {
  const observation = assessment?.optOutObservation;
  const requests = observation?.verificationStatus === "verified" && observation.evidence.scanId === assessment?.scanId &&
    observation.evidence.registration === "confirmed"
    ? observation.evidence.requests.filter(row => row.collectionEvidence && row.httpStatus < 400) : [];
  const recipientIds = [...new Set(requests.flatMap(row => {
    const ids = [...new Set(row.collectionEvidence!.ruleIds.map(id => entityByRule.get(id)).filter((id): id is string => Boolean(id)))];
    return ids.length === 1 ? ids : [];
  }))].sort();
  return { recipientIds, supportedConcern: requests.length > 0,
    points: californiaChoiceEnforcementPoints(recipientIds, requests.length > 0) };
}
