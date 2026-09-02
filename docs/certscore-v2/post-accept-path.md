# Post-Accept Path v1

Post-Accept Path is an additive, feature-gated fifth evidence lane for the sharded v2 DAG Lambda topology. The checked-in AWS deployment configuration enables it for all eligible exact-target scans. It mirrors the safety and evidence discipline of Reject Path while retaining separate visitor state, artifacts, timing, and semantics.

## Operating boundary

- The lane starts 1,000 milliseconds after the three passive lanes. Reject Path retains its existing 500 millisecond delay.
- The canonical Accept observation window is 3,000 milliseconds. A first eligible request, storage write, or contradictory consent signal starts a 350 millisecond trailing settle, after which the worker returns without consuming the remainder of the window.
- The Accept observer has a 20-second result budget so deterministic named-CMP controls that settle late can still be resolved, confirmed, and observed. Its six-second post-passive coordinator tail remains authoritative: a worker that misses that deadline is retained as a coverage limitation, and late output cannot reopen the report.
- Accept and Reject use fresh, isolated browser contexts and may each dispatch at most one deterministic first-layer action. Named CMPs retain versioned recipe confirmation; non-CMP controls must pass the canonical classifier, unique actionability proof, and independent state-transition confirmation.
- The coordinator joins both interaction lanes concurrently against independent absolute deadlines after the passive barrier: six seconds for Accept and eight seconds for Reject. These deadlines do not stack.
- The coordinator merges one canonical evidence bundle and publishes exactly once. Late worker output cannot reopen or regenerate a report.
- Complete consent inventory with no Accept control produces a score-neutral `not_applicable` outcome. Unsupported, ambiguous, unconfirmed, failed, and timed-out outcomes remain explicit coverage limitations and produce no finding or score effect.
- The checked-in AWS feature flag is enabled with the product-owner-approved `all_eligible` rollout. Ordinary scans still require sharded topology, an exact normalized HTTPS target, and a non-reusable authorization bound to the scan ID.

## Evidence and projection

The worker accepts a versioned canonical CMP recipe or the bounded canonical non-CMP classifier path. The latter is allowed only for one visible, enabled, uniquely actionable first-layer control whose text classifies through the shared consent-control registry; improvised strings, feature-local regexes, and DOM guessing are prohibited. A banner transition is corroborating only; production-eligible evidence requires a separately confirmed consent storage/cookie/API transition or TCF `useractioncomplete` state anchored after the click. Retained URLs are query-stripped, values are hashed, activity is bounded, and raw consent strings or cookie values are not retained.

The implemented canonical projection supports three score-neutral review semantics:

- `post_accept_consent_dependent_activity`: informational activity observed after confirmed acceptance.
- `accept_reject_outcomes_indistinguishable`: exact retained activity identities appeared after both choices; this corroborates the existing Reject review and never creates a duplicate score effect.
- `acceptance_signal_contradicts_action`: a retained consent signal contradicted the confirmed Accept action.

The Lambda worker requests production projection, but the retained evidence contract grants `productionProjectable: true` only when acceptance is semantically confirmed and the bounded observation window completes. Eligible packets enter the canonical persisted projection -> normalized concern -> concern policy -> unified finding path. Those findings are then shared by the scan report, report JSON, Pulse, API v2 finding routes, and MCP scan bundles. The dedicated API/MCP `postAcceptObservation` field also exposes the bounded observation outcome and intentional early-stop reason without requiring clients to interpret raw evidence.

Joined packets whose observation window was truncated remain explicit `limited` coverage downstream. They cannot create Accept concerns even if semantic acceptance was confirmed before the worker budget expired.

## Configuration

```text
CERTSCORE_POST_ACCEPT_WORKER_ENABLED=1
CERTSCORE_POST_ACCEPT_WORKER_ROLLOUT_MODE=all_eligible
```

The owned targets and expected outcomes are recorded in `post-accept-owned-live-canaries.json`. Owned canaries retain their stronger authorization identity while ordinary eligible scans use resolved exact-target authorization.

Two joint root-path canaries exercise both interaction lanes in independent browser contexts. `testar1.html` confirms both actions but makes the outcomes deliberately distinguishable: only Accept produces direct post-registration analytics activity. `testar2.html` confirms Accept through a changed CMP cookie while retaining a contradictory denied TCF state, then emits the same exact post-registration storage and network identities after both Accept and Reject. It therefore exercises contradiction handling and the score-neutral indistinguishable-outcomes comparison. Both pages also initiate activity before semantic registration so temporal anchoring can prove that in-flight activity is excluded.

## Incremental cost estimate

At the repository default 3,008 MB Lambda memory setting, an additional browser worker running roughly 10–20 seconds is approximately **$0.49–$0.98 per 1,000 eligible scans** for Lambda duration, before small request, S3, logging, proxy, and network-egress charges. Monthly incremental duration cost is therefore approximately `eligible scans / 1,000 × $0.49–$0.98`. The product owner explicitly approved this incremental spend before implementation.
