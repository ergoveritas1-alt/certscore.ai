# CertScore.ai Sanity Accept timeout — November 13, 2026

Owner authorization: investigate Sanity Accept, implement canonical fixes and regression tests, verify on localhost, preserve existing budgets, exclude ergoveritas and SITS, no deployment.

## Evidence and diagnosis

The original scan `98e438de-9224-499a-aa55-4d6052b4caa0` retained only `accept:observation_started`; it did not retain a dispatch checkpoint or Accept packet. The original operation cannot be identified retrospectively from that artifact. It is not evidence of slow form finalization.

A diagnostic-only localhost scan `e3fa80bc-c687-4e15-bcf5-780081d5ce20` completed Accept in about 6.4 seconds. A subsequent intermediate verification reproduced the timeout in `91a6b7d4-b0e4-4a9f-b3e1-f487d3ebe789`. Its bounded last-stage diagnostic records `resolver` at 2,437 ms, without action dispatch, finalization or cleanup. The coordinator exhausted its unchanged 6,000 ms tail allowance at 19,672 ms after invocation. Reject delivered normally. This localizes the reproduced stall to resolution, before the click; it does not prove a particular browser RPC was the original stalled RPC.

Code inspection found an optional deferred-loader script probe awaited before control discovery. Its `page.evaluate` and pointer priming had no deadline or cancellation, so even a non-Borlabs site could wait there and never enter bounded discovery. Resolver calls also relied on cooperative deadline checks rather than bounding their outer browser reads. A stalled optional probe against an otherwise actionable loopback dialog reproduces the dependency defect: restoring the serial await fails the new regression; the parallel bounded implementation clicks successfully. This is the tested failure mechanism, not an assertion of previously unavailable per-RPC telemetry.

Separate fault injection demonstrated that pending storage reads ignored result cancellation in both Accept and Reject. Both pre-fix fixtures waited for the delayed browser response after their budgets expired.

## Canonical changes

- Run optional deferred-loader priming alongside control discovery under the same existing search deadline. Cancel it before leaving resolution. Discard late read results and prevent late pointer movements; no consent mutation or extra interaction is introduced.
- Bound the outer Accept readiness/resolution reads to the existing search deadline. Preserve single-pass zero-wait behavior and all control, target, uniqueness and consent-proof checks.
- Share one cancellation-aware browser-operation helper across Accept and Reject. Apply it to browser/context/page acquisition, setup, storage and required confirmation baselines. Late resources are disposed; a missing baseline never receives an invented successful value.
- Bound cleanup within the remaining existing result budget, with a maximum 250 ms wait. Cleanup is initiated even after expiry; it cannot delay an already-frozen packet indefinitely. Late RPC rejection is handled and abort listeners are removed.
- Retain unavailable storage diagnostics and structured pre-action cancellation. No late click, synthetic confirmation, evidence promotion or scoring-policy change is introduced.
- Retain bounded allowlisted last/interrupted stages in the existing worker failure diagnostic. The five original milestones retain their cap. No raw site content, new upload, retry or model call is added.

The 20,000 ms Accept observer result budget, 6,000 ms Accept tail allowance, 8,000 ms Reject tail allowance, observation windows, worker memory and existing late-form policy are unchanged. The added diagnostic metadata is estimated below $0.10/month at 100,000 scans, within the repository's under-$1 preapproval; local fixture code adds no recurring cost.

## Regression coverage

The offline suite covers both actions with permanently stalled storage, confirmation baselines, context creation, setup and cleanup; late context disposal; no late click; and the Accept optional-probe dependency. Helper tests cover signal-only cancellation, expired deadlines, late rejection, listener cleanup and preserved successful values. Worker tests check the stage allowlist, bounded retention and interrupted-stage preservation. Existing deferred-loader and slow-Accept form/image fixtures exercise readiness and retention under the original budgets.

Private artifacts, run/contact receipts and final verification results are in `artifacts/sanity-accept-timeout-20261113/`. Public target visits are limited to owner-authorized Sanity localhost scans, with registry validation, successful central history export, canonical selection, the existing cooldown waiver and idempotent central contact recording. No deployment, SITS visit or ergoveritas visit occurred.

## Final verification

All 97 targeted reliability tests and nine surrounding deferred-loader/action-boundary/production-budget tests passed (106 total). The serialized-probe counterexample fails, and both original stalled-storage counterexamples failed before their fix. Scan-core build/typecheck, Lambda typecheck and whitespace checks passed.

Two sequential full localhost scans of Sanity after the final resolver change:

| Scan | Accept packet / worker | Reject packet / worker | Result |
| --- | --- | --- | --- |
| `69497b22-a710-4f19-8b23-34ebd32e6827` | 6,202 / 6,261 ms | 11,571 / 11,607 ms | Both joined; report ready |
| `205964a1-5708-4676-b35d-2c4216b4dbd9` | 6,807 / 6,884 ms | 11,067 / 11,141 ms | Both joined; report ready |

Both reports reference the exact size/checksum-verified action packets and project completed clicks and observations. No additional Accept or Reject tail wait was needed. Each Accept packet retained two forms. Post-Accept images remained partially unavailable: zero of two available in the first scan, one of two in the second (bounded capture/screenshot limitations). Both reports separately retained four existing form snapshots; those are not substituted for missing post-Accept images.

Consent registration remains unconfirmed in both runs: Accept retains opposite_or_mixed_decision, Reject retains api_saved_event_unverified. The timeout fix does not reinterpret those states. Successful delivery is not proof of semantic consent registration.

The task used five authorized Sanity localhost scans: one diagnostic, two intermediate tests (one reproducing the resolver timeout), and two final checks. All contacts were recorded centrally with idempotent keys and merged into the repository contact ledger. No SITS, ergoveritas or production scan occurred. No deployment occurred. The original precise RPC remains unknowable from its sparse checkpoint; the reproduced resolver stall and deterministic failure mechanisms are separately documented above.
