# CertScore.ai Sanity confirmation investigation — November 13, 2026

Scope: investigate Sanity Accept and Reject, fix confirmation where supported, add regression coverage and verify on localhost. Preserve all budgets; exclude ergoveritas and SITS; no deployment.

## What the evidence establishes

Retained scans `69497b22-a710-4f19-8b23-34ebd32e6827` and `205964a1-5708-4676-b35d-2c4216b4dbd9` have completed clicks but identical denied API maps at baseline, initial and terminal reads, with eventSequence zero. Accept correctly reports `opposite_or_mixed_decision`; Reject correctly reports `api_saved_event_unverified`. Denied defaults do not establish a newly saved refusal.

Retained geometry shows two overlapping Osano dialogs, with separate identifiers and Lit rendering markers. Local diagnostic `99750244-97af-42d4-b087-dbc08a6be876` additionally observed two copies of the same exact Osano script, a trusted Reject click, a stable exposed API object and no saved event. Both dialog nodes remained present. Presence/offset height alone does not prove both remained perceptually visible. That run's Accept resolver exhausted its unchanged search allowance without dispatch; it is not counted as successful Accept verification.

Diagnostic `f215e8d9-b00a-42c0-84b6-68f72fd92425` completed both actions. Both paths added Osano consent storage, but only value hashes were retained. A changed encrypted consent value cannot establish its category decisions from those hashes. The first diagnostic's temporary console output was not retained by the local harness; no claims depend on that output.

The exact Osano script URL came from retained geometry. Its source was downloaded once for read-only analysis into the private task artifact directory. In the reviewed source each execution creates a separate store and API; setup assigns that API to `window.Osano.cm`, while the rendered UI retains its own store. This supports a duplicate-instance/API-to-control mismatch as the explanation for the observed behavior. We did not retain a direct mapping of each live UI node to its private store, so that final mapping remains an inference, not a measured fact. The adapter uses the correct documented `osano-cm-consent-saved` event and complete payload shape. The official API documentation is https://developers.osano.com/cmp/javascript-api/developer-documentation-consent-javascript-api.

## Canonical correction

The investigation exposed an independent scanner defect: the Osano tracker was cached by provider name only. Replacing `Osano.cm` could leave the listener attached to the previous API while the getter read the new one.

The reader now binds each tracker to the actual exposed API instance. A replacement gets a fresh listener and event sequence; old callbacks cannot mutate the replacement tracker. An instance-generation hash flows through the existing configuration binding field and confirmation gate. Replacement before the action baseline is supported; replacement after the baseline remains `configuration_changed`, even when the replacement emits a matching saved decision. Existing complete-category, readback, freshness, action-clock, TCF, document and target checks remain intact. Historical packets are not rewritten.

This is an adapter-level correction for both Accept and Reject, without a Sanity exception or new action. It does not recover an unexposed API belonging to another rendered CMP instance and does not turn storage hashes, banner disappearance or click completion into confirmation.

There are no additional browser reads, waits, retries, model calls or uploads. Existing capture, worker-tail and memory budgets are unchanged. The bounded hash in existing metadata is estimated below $0.10/month at 100,000 scans; local tests add no recurring infrastructure cost. Temporary diagnostics were removed from both source and build before final verification.

## Regression and localhost verification

The 16 new tests cover both actions: normal saved decisions, API replacement before baseline, replacement after baseline, overlapping stores, old-instance events, and six hash-linked retained Sanity paths. External requests are blocked in the browser fixtures. Both replacement-before-baseline cases fail against the original adapter and pass with the correction.

Validation: 113 action reliability tests plus 10 existing API adapter tests passed (123 total). Scan-core build/typecheck, Lambda typecheck and whitespace checks passed. Existing malformed-event, getter mismatch and TCF safeguards remain unchanged.

Final localhost scan `b3a1095f-e9b7-4fa8-86a6-f10b3afa5e69`:

| Path | Packet / worker duration | Click and observation | Registration |
| --- | --- | --- | --- |
| Accept | 6,156 / 6,221 ms | completed | unconfirmed: opposite_or_mixed_decision |
| Reject | 11,702 / 11,743 ms | completed | unconfirmed: api_saved_event_unverified |

The report was ready and referenced the exact size/SHA-256-verified action packets. Accept retained two forms; both post-Accept images were unavailable (`review_timed_out`, `screenshot_failed`). Four separate existing report form snapshots remained available. Do not present those as post-Accept images.

Three authorized Sanity localhost scans were made, including the two diagnostics. Registry validation, central history export, canonical target selection with the owner's cooldown waiver, idempotent central contact recording and reviewed repository ledger merge were used. The private evidence and verification receipts are under `artifacts/sanity-confirmation-20261113/`. No SITS, ergoveritas or production scan and no deployment occurred.

## Remaining limitation and recommendation

Sanity is still unconfirmed. The evidence does not support silently promoting either action. The most direct site-side repair is to initialize Osano once so the exposed API and visible controls share a store. Supporting an independent encrypted storage receipt would require separately reviewed decoding, exact receipt/write identity, source and action-clock binding, conflict handling and positive fixtures; the retained hashes alone cannot validate that support. No encrypted receipt fallback or extra click was introduced in this change.
