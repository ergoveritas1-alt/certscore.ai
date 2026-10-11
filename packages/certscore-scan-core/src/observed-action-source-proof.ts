import type { ActionMainDocumentWriteCoverage, ObservedActionSourceProof } from "@certscore/contracts";
import { OBSERVED_ACTION_EXCLUDED_CHANNELS } from "@certscore/contracts";

/** Uses existing frozen handler inventories; never performs capture or widens observation. */
export function buildObservedActionSourceProof(input: {
  authorization: ObservedActionSourceProof["authorization"]; scanClockOriginAtMs: number; writeCoverage: ActionMainDocumentWriteCoverage;
  hookInstalledAtMs?: number;
  actionDocumentStable: boolean; requestListenerInstalledBeforeAction: boolean;
  requestWindowStartedAtMs: number; configuredWindowMs: number; cancelled: boolean;
  semanticDecisionConfirmed: boolean;
  retention: { requestsObserved: number; requestsRetained: number };
  pendingCount: number; retainedRequestIds: string[];
  rows: Array<{ hostname?: string; purpose?: string }>;
}): ObservedActionSourceProof {
  const w = input.writeCoverage;
  return { authorization: input.authorization, policyVersion: "bounded_observed_action_sources.v1",
    scope: "primary_page_request_listener_and_main_document_setter_hooks",
    scanClockOriginAtMs: input.scanClockOriginAtMs, excludedChannels: [...OBSERVED_ACTION_EXCLUDED_CHANNELS], targetUrlSha256: w.targetUrlSha256,
    documentTimeOriginMs: w.documentTimeOriginMs, hookInstalledAtMs: Number.isFinite(input.hookInstalledAtMs) ? input.hookInstalledAtMs! : null,
    actionDocumentStable: input.actionDocumentStable, requestListenerInstalledBeforeAction: input.requestListenerInstalledBeforeAction,
    requestWindowStartedAtMs: input.requestWindowStartedAtMs, windowStartedAtMs: w.windowStartedAtMs, windowEndedAtMs: w.windowEndedAtMs,
    configuredWindowCompleted: w.windowCompleted && !input.cancelled &&
      w.windowEndedAtMs - w.windowStartedAtMs >= input.configuredWindowMs,
    semanticDecisionConfirmed: input.semanticDecisionConfirmed,
    requests: { retainedRequestIds: input.retainedRequestIds, handlerReceivedCount: input.retention.requestsObserved, retainedCount: input.retention.requestsRetained,
      droppedCount: input.retention.requestsObserved - input.retention.requestsRetained,
      // Vendor classification is synchronous; transport-pending is counted separately.
      pendingClassificationCount: 0, pendingCount: Math.min(input.pendingCount, input.retention.requestsRetained),
      unresolvedIdentityCount: input.rows.filter(r => !r.hostname).length,
      unresolvedClassificationCount: input.rows.filter(r => (!r.purpose || r.purpose === "unknown")).length,
      projectionOmittedCount: Math.max(0, input.retention.requestsRetained - input.rows.length) } };
}
