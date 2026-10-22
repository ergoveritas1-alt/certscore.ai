import { isQualifyingSaleSharingRequest, type CanonicalEvidenceBundle } from "@certscore/contracts";

/** Retain already-observed pairs for distinct, canonically attributed collectors.
 * Selection is not qualification and creates no observation, status or finding. */
export function collectionRecipientPriorities(bundle: CanonicalEvidenceBundle, input: {
  requestLimit: number; responseLimit: number;
  navigationEventIds: ReadonlySet<string>; comparisonWindowEventIds: ReadonlySet<string>;
}): Set<string> {
  const attribution = new Map<string, Set<string>>();
  const advertising = new Set<string>();
  for (const vendor of bundle.normalizedVendorObservations) {
    if (vendor.confidence < .9 || vendor.registryAttribution?.matchKind !== "endpoint" ||
        !["advertising", "marketing", "analytics", "session_replay"].includes(vendor.purpose)) continue;
    for (const id of vendor.matchedEvidenceIds) {
      const entities = attribution.get(id) ?? new Set<string>();
      entities.add(vendor.registryAttribution.entityId); attribution.set(id, entities);
      if (["advertising", "marketing"].includes(vendor.purpose)) advertising.add(id);
    }
  }
  const requestCounts = new Map<string, number>(), eventCounts = new Map<string, number>();
  for (const event of bundle.networkEvents) {
    requestCounts.set(event.requestId, (requestCounts.get(event.requestId) ?? 0) + 1);
    eventCounts.set(event.eventId, (eventCounts.get(event.eventId) ?? 0) + 1);
  }
  const responses = new Map<string, typeof bundle.networkResponseEvents>();
  for (const response of bundle.networkResponseEvents) if (response.requestId) {
    const rows = responses.get(response.requestId) ?? []; rows.push(response); responses.set(response.requestId, rows);
  }
  const qualified = new Set((bundle.gpcObservationSession?.requestProofCapture?.rows ?? [])
    .filter(row => isQualifyingSaleSharingRequest(row.proof.qualification)).map(row => row.eventId));
  const fixed = new Set(bundle.networkEvents.filter(event => input.navigationEventIds.has(event.eventId) ||
    input.comparisonWindowEventIds.has(event.eventId)).map(event => event.eventId));
  let requestSlots = Math.max(0, input.requestLimit - fixed.size);
  let responseSlots = Math.max(0, input.responseLimit - bundle.networkResponseEvents.filter(event => input.navigationEventIds.has(event.eventId)).length);
  type Candidate = { eventId: string; responseId: string; score: number; index: number };
  const groups = new Map<string, Candidate[]>();
  for (const [index, event] of bundle.networkEvents.entries()) {
    const entities = attribution.get(event.eventId), response = responses.get(event.requestId);
    const observed = response?.length === 1 ? response[0] : undefined, status = observed?.status;
    if (!event.collectionEndpointObserved || !["GET", "POST"].includes(event.method) ||
        ["document", "script", "stylesheet", "font"].includes(event.resourceType ?? "") ||
        entities?.size !== 1 || requestCounts.get(event.requestId) !== 1 || eventCounts.get(event.eventId) !== 1 ||
        !observed || status === undefined || status < 200 || status >= 400 || observed.responseUrl !== event.requestUrl) continue;
    const entityId = [...entities][0]!, rows = groups.get(entityId) ?? [];
    rows.push({ eventId: event.eventId, responseId: observed.eventId, index,
      score: (qualified.has(event.eventId) ? 4 : 0) + (advertising.has(event.eventId) ? 2 : 0) + (fixed.has(event.eventId) ? 1 : 0) });
    groups.set(entityId, rows);
  }
  const compare = (a: Candidate, b: Candidate) => b.score - a.score || a.index - b.index;
  const ordered = [...groups.values()].map(rows => rows.sort(compare)).sort((a, b) => compare(a[0]!, b[0]!));
  const selected = new Set<string>();
  let recipients = 0;
  for (const rows of ordered) {
    if (recipients === 32 || responseSlots === 0) break;
    const row = rows.find(candidate => fixed.has(candidate.eventId) || requestSlots > 0);
    if (!row) continue;
    selected.add(row.eventId); selected.add(row.responseId); recipients++;
    if (!fixed.has(row.eventId)) requestSlots--;
    if (!input.navigationEventIds.has(row.responseId)) responseSlots--;
  }
  return selected;
}
