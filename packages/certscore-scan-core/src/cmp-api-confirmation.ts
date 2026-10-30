import type { ConsentConfirmationReason } from "@certscore/contracts";
import type { CmpApiConsentProvider, CmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

export type CmpApiConfirmationBaseline = {
  canonicalState?: string;
  configurationSha256?: string;
  eventSequence: number;
};

// These adapters establish a decision using a saved-event witness, not a
// changed getter alone. Keep the same policy for Accept and Reject. Borlabs'
// existing event protocol has no event clock; its original sequence gate stays.
const SAVED_EVENT_PROVIDERS = new Set<CmpApiConsentProvider>([
  "borlabs", "osano", "hubspot", "drupal_eu_cookie", "didomi",
  "cookie_information", "cookiescript", "finsweet",
]);

/** Eligibility for an already-read API snapshot. This does not read an SDK,
 * confirm a click or replace the observer's source/document/target/deadline
 * checks. Provider decoders remain responsible for complete applicable scope.
 */
export function evaluateCmpApiConfirmation(input: {
  provider: CmpApiConsentProvider;
  baseline: CmpApiConfirmationBaseline;
  snapshot: CmpApiConsentSnapshot;
  decision: "granted" | "denied";
  actionDispatchedAtEpochMs: number;
}): { eligible: true } | { eligible: false; reason: ConsentConfirmationReason } {
  const { provider, baseline, snapshot, decision, actionDispatchedAtEpochMs } = input;
  if (snapshot.configurationSha256 !== baseline.configurationSha256) {
    return { eligible: false, reason: "configuration_changed" };
  }
  if (snapshot.decision !== decision) {
    return { eligible: false, reason: snapshot.decision === "unknown"
      ? "no_registered_complete_decision" : "opposite_or_mixed_decision" };
  }
  const freshEvent = snapshot.eventSequence > baseline.eventSequence;
  const actionBoundEvent = snapshot.eventObservedAtEpochMs === undefined ||
    snapshot.eventObservedAtEpochMs >= actionDispatchedAtEpochMs;
  if (!actionBoundEvent || SAVED_EVENT_PROVIDERS.has(provider) &&
    (baseline.canonicalState === undefined || !freshEvent ||
      provider !== "borlabs" && snapshot.eventObservedAtEpochMs === undefined)) {
    return { eligible: false, reason: "api_saved_event_unverified" };
  }
  if (!snapshot.canonicalState || snapshot.canonicalState === baseline.canonicalState && !freshEvent) {
    return { eligible: false, reason: "no_fresh_decision" };
  }
  return { eligible: true };
}
