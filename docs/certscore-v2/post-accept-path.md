# Post-Accept Path v1

Post-Accept Path is an additive, feature-gated fifth evidence lane for the sharded v2 DAG Lambda topology. The checked-in AWS deployment configuration enables it for the owned-canary rollout. It mirrors the safety and evidence discipline of Reject Path while retaining separate visitor state, artifacts, timing, and semantics.

## Operating boundary

- The lane starts 1,000 milliseconds after the three passive lanes. Reject Path retains its existing 500 millisecond delay.
- The canonical Accept observation window is 3,000 milliseconds. A first eligible request, storage write, or contradictory consent signal starts a 350 millisecond trailing settle, after which the worker returns without consuming the remainder of the window.
- The Accept observer has a four-second result budget, leaving one second between its delayed launch plus observation work and the earliest six-second coordinator deadline for packet upload and invocation return. Budget exhaustion after confirmed acceptance returns a verified, non-projectable limited packet instead of waiting for coordinator cancellation.
- Accept and Reject use fresh, isolated browser contexts and may each dispatch at most one deterministic, named-CMP action.
- The coordinator shares one absolute six-second tail deadline across both interaction lanes after the passive barrier. It does not wait six seconds per lane.
- The coordinator merges one canonical evidence bundle and publishes exactly once. Late worker output cannot reopen or regenerate a report.
- Complete consent inventory with no Accept control produces a score-neutral `not_applicable` outcome. Unsupported, ambiguous, unconfirmed, failed, and timed-out outcomes remain explicit coverage limitations and produce no finding or score effect.
- The checked-in AWS feature flag is enabled. `owned_canary` remains the rollout mode. `all_eligible` must remain disabled until a separate production-rollout approval after calibration.

## Evidence and projection

The worker accepts only a versioned canonical CMP recipe. Text or DOM guessing is prohibited. A banner transition is corroborating only; production-eligible evidence requires a separately confirmed CMP storage/cookie transition or TCF `useractioncomplete` state anchored after the click. Retained URLs are query-stripped, values are hashed, activity is bounded, and raw consent strings or cookie values are not retained.

The implemented canonical projection supports three score-neutral review semantics:

- `post_accept_consent_dependent_activity`: informational activity observed after confirmed acceptance.
- `accept_reject_outcomes_indistinguishable`: exact retained activity identities appeared after both choices; this corroborates the existing Reject review and never creates a duplicate score effect.
- `acceptance_signal_contradicts_action`: a retained consent signal contradicted the confirmed Accept action.

The Lambda worker requests production projection, but the retained evidence contract grants `productionProjectable: true` only when acceptance is semantically confirmed and the bounded observation window completes. Eligible packets enter the canonical persisted projection -> normalized concern -> concern policy -> unified finding path. Those findings are then shared by the scan report, report JSON, Pulse, API v2 finding routes, and MCP scan bundles. The dedicated API/MCP `postAcceptObservation` field also exposes the bounded observation outcome and intentional early-stop reason without requiring clients to interpret raw evidence.

Joined packets whose observation window was truncated remain explicit `limited` coverage downstream. They cannot create Accept concerns even if semantic acceptance was confirmed before the worker budget expired.

## Configuration

```text
CERTSCORE_POST_ACCEPT_WORKER_ENABLED=1
CERTSCORE_POST_ACCEPT_WORKER_ROLLOUT_MODE=owned_canary
```

The owned targets and expected outcomes are recorded in `post-accept-owned-live-canaries.json`. The implementation does not deploy those files or change an AWS feature flag.

Two joint root-path canaries exercise both interaction lanes in independent browser contexts. `testar1.html` confirms both actions but makes the outcomes deliberately distinguishable: only Accept produces direct post-registration analytics activity. `testar2.html` confirms Accept through a changed CMP cookie while retaining a contradictory denied TCF state, then emits the same exact post-registration storage and network identities after both Accept and Reject. It therefore exercises contradiction handling and the score-neutral indistinguishable-outcomes comparison. Both pages also initiate activity before semantic registration so temporal anchoring can prove that in-flight activity is excluded.

## Incremental cost estimate

At the repository default 3,008 MB Lambda memory setting, an additional browser worker running roughly 10–20 seconds is approximately **$0.49–$0.98 per 1,000 eligible scans** for Lambda duration, before small request, S3, logging, proxy, and network-egress charges. Monthly incremental duration cost is therefore approximately `eligible scans / 1,000 × $0.49–$0.98`. The product owner explicitly approved this incremental spend before implementation.
