# CertScore.ai navigation and receipt reliability assessment — October 29, 2026

## Decision

**Hold release; do not deploy. A public completion/confirmation improvement has not been established.** Two shared runtime defects and the validation harness were repaired. The final revision passed the complete offline gate and retained replay, but has not had a clean independent public validation.

The frozen guard-only public candidate recorded **completion 5/8→4/8 (-12.5 pp)** and **confirmation 5/8→2/8 (-37.5 pp)**. These are descriptive recorded results, **not an accepted efficacy estimate**: an observer-side schema error was misclassified as an ordinary visit failure, and **four later planned contacts ran after the required global stop**. All rows and contacts are preserved. No positive conclusion, pooling with earlier cohorts or replacement sample is permitted.

The complete campaign stopped at **20/20 actual contacts**: four diagnostic contacts on one site and sixteen holdout contacts on four other sites. There are zero unknown contacts. Both central ledger phases and all five repository cooldowns are persisted. A post-run durable campaign halt prevents continuation. Nothing was deployed, pushed or activated; workers, regions, flags and scan/action windows remain unchanged.

## What the trace established

The new local-only trace observes existing route phases, native request timing, existing API snapshots and eligibility checks. It adds no HTTP requests, SDK calls, model calls or waits to capture. It retains no raw cookie values, payloads or visitor identifiers; metadata is capped at 32 KB. Its facts are diagnostic and cannot establish a consent decision. Each retained trace joins its scan, plan, source/build and original packet SHA.

The immutable retained replay covers **2,800 packets**. Timing ranking found **104 unresolved paths on 53 sites with navigation over ten seconds**, of which **103 did not commit a document**; **nine** exceeded three seconds in confirmation; **22** completed-click paths retained `no_fresh_decision`. These groups overlap and are historical, not measurements of a single current scanner revision. No safe within-budget software recovery is established for the 103 uncommitted documents. [Ranked timing evidence](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/retained-timing-ranking.json).

On Sered's identical-runtime diagnostic, one Accept visit spent **2,377 ms in guard validation**, followed by about **5,006 ms in Chromium DNS lookup**. Its late Termly request remained at `guard_validation_pending`, with native request start still zero: no HTTP receipt response had been observed. A second visit on the **same source/build** completed the request, retained a fresh Termly event, and confirmed. This variation is not a treatment effect. The API getter returned a complete all-granted map before either click; the verifier correctly required fresh evidence rather than treating that initial state as registration. [Diagnostic trace review](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/diagnostic-review.json).

Source tracing also identified an independent fresh DNS lookup inside `bindPostRefusalBrowserResolvedExactTarget`, after the navigation guard had validated the request. The approximately five-second interval between navigation/settle and resolver start is consistent with that await; the diagnostic helper did not directly time binding. The holdout helper separately records binding and DNS calls. Identity-handler intervals were small in the diagnostic; no evidence supports changing identity or bypassing network enforcement.

Termly documents the current-state getter and its separate consent event in its [official API guidance](https://support.termly.io/hc/en-us/articles/30710442081553-Getting-Consent-State-and-Handling-Consent-Changes-with-Termly). A pending transport, static getter, CMP presence or disappeared banner is not substituted for a fresh source-bound decision.

## Shared fixes

### Guarded navigation binding

Both action observers now preserve the native response and latest main-navigation request. Final-target binding can reuse this action's guard result only when all of the following hold: strict TLS was explicitly requested; the exact current request passed that same context's guard; the response, request, main frame and current URL still join; the response is not from a service worker; and a bounded native peer read proves a public address on port 443. A same-URL reload, changed document, foreign request, unknown/stalled peer or missing guard proof keeps fresh validation. An observed private peer fails closed. There is no cross-session cache or speculative DNS lookup. The existing result signal bounds fallback validation.

This removes a redundant validation when its proof is sufficient and preserves usable action/observation time. It does not repair the initial navigation's DNS failure or manufacture a receipt. Only **one of seven available candidate binding traces** had no same-host DNS call during binding; six still used fresh DNS. That trace fact is not a rate improvement or proof of broad fast-path coverage.

Owned delayed-DNS fixtures retained **0/2→2/2 verified completed and confirmed paths** with the same per-choice fixture budgets. The repeated lookup count fell **2→1** for each action. The prior Accept/Reject fixtures ran about 5.25/6.60 seconds and produced no verified complete path; repaired fixtures completed their full observation windows in about 3.5/4.9 seconds. These are controlled mechanism results, not public-site rates. [Prior fixture log](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/owned-reference-captured.log); [repaired fixture log](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/owned-candidate-captured.log) and original packets under `owned-reference-packets/` and `owned-candidate-packets/`.

### Strict TLS correction

The inherited `chromiumContextOptions` has `ignoreHTTPSErrors:true`. Earlier prose describing native TLS as preserved must not be treated as TLS verification. Those historical reports/exports are preserved. The diagnostic also inherited that setting and is explicitly not TLS verification. The guard-only candidate and final action observers now request **false**, and the holdout harness enforced **false in both arms** so the comparison used the same safety setting. The passive scanner context default was not changed.

An owned self-signed HTTPS server was rejected by both final action observers, with **zero HTTP handlers reached and zero clicks**. [Native TLS negative check](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/tls-owned.log). Unknown peer proof never supplies consent or authorizes an interaction.

### Exact request-clock consistency

The holdout hit `California collection proof must bind to its exact retained request` on Netspark Reject. An owned reproduction established this defect class: native timing can refine a request's start at registration after its collection proof was captured; the final retained row used the refined clock while the proof kept the earlier one. The live failed packet was not produced, so its exact mismatching field cannot be established retrospectively.

The final capture implementation materializes the retained request and its collection proof from the **same corrected clock on the same captured Request object**, as already done for measurement evidence. Request identity, method, origin, path, response facts and every canonical schema check remain intact. No invalid proof is relabeled or stripped to publish a packet. A corrected pre-click request stays pre-click and in flight; it is not promoted into post-Reject evidence.

Both confirmed timing fixtures reproduced the exception on the public-tested build. The final repair retained valid complete/confirmed packets for both; the negative fixture with a native start before the click stays excluded from `postRefusalNonEssentialRequests`. The missing-receipt case completes observation and remains unconfirmed. [Original reproduction](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/clock-baseline-reproduction.log); [final tests](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/clock-final-focused.log); [three original packet receipts](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/clock-packet-provenance.json). This improves capture preservation and verification of already executed paths. It is not an attribution-only improvement, a new consent adapter, or a scoring-policy change.

## Holdout design and protocol failure

The cohort and stopping rules were frozen before contact: **one diagnostic site, four untouched holdout sites, 20 total maximum contacts**, concurrency one. The canonical selector admitted 94 of 144 retained candidates after fresh central history. It selected two historical Termly sites (one diagnostic and one holdout), and one holdout each from OneTrust, Cookiebot and CookieYes. Historical strata do not prove the live action-bound identity. Holdout targets were rechecked unchanged against a second central export. No cooldown or contact hold was waived; Dailysabah, Eetapps, ReadCube and Gimbal were not revisited.

The holdout retained all eight planned actions per arm, counterbalanced arm order, fresh isolated contexts and one deterministic first-layer choice per slot. Caps stayed **20,000 ms result / 14,000 ms search / 2,000 ms initial confirmation / 3,000 ms Accept observation / 8,000 ms Reject observation**. No Options/Manage, SDK opening, external form, retry, replacement or larger window was added. [Execution plan](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/holdout-plan-execution.json); [prespecified analysis](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/analysis-prespec.json); [safety/cost addendum](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/holdout-addendum.json).

The Netspark observer threw during packet construction, before the harness set its `verifying` flag. The harness therefore returned `fatalEvidenceError:false`; the coordinator stopped only that domain and ran all four Jobvite slots. This violated the declared all-domain stop condition. **The full holdout is not accepted as clean efficacy validation.** The 16-contact summary is not rewritten to pretend it automatically halted. The failed request is not labeled as website blocking in the central history: its contact is recorded as failed with cooldown, and the original erroneous runtime classification remains in evidence.

The canonical visitor now recognizes schema exceptions raised by the observer as globally fatal, even before verifier entry, and treats failed/uncommitted or unauthorized navigation as domain no-go. Six visitor tests and 24 offline coordinator tests passed, including one schema failure followed by **no second contact across two domains**. The original visitor bytes, actual results, all four post-stop contacts and the post-run halt are retained. Visitor/coordinator source or test edits now trigger both offline safety checks in fast and full predeploy plans; the new routing test passed. The 58-file runtime command and file hashes are unchanged by this additional wiring, recorded in the [wiring verification](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/gate-wiring-verification.json). [Stop review](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/stop-review.json); [visitor tests](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final-visitor-tests.log); [coordinator tests](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final-runner-tests.log).

## Recorded holdout results — descriptive only

| Measure | Reference | Guard-only candidate | Change |
| --- | ---: | ---: | ---: |
| Planned / actual contacted | 8 / 8 | 8 / 8 | denominator unchanged |
| Verified click + observation completion | 5 (62.5%) | 4 (50.0%) | -12.5 pp |
| Verified consent decisions | 5 (62.5%) | 2 (25.0%) | -37.5 pp |
| Completed unconfirmed paths | 0 | 2 | +2 |
| Not proved complete | 3 | 4 | +1 |
| Missing typed packet / native projection | 0 | 1 | one unresolved construction failure |

The missing packet leaves its surface, identity, control, attempt, completion and decision stages unknown. It is not a negative consent decision, an unsupported CMP or proof that no CMP exists. The other fifteen packets verify against their original hashes and native/common projections; the missing packet/projection explains the one unavailable projection comparison.

| Historical stratum | Actions each | Completion before→after | Confirmation before→after | Completion / confirmation change |
| --- | ---: | ---: | ---: | ---: |
| Termly | 2 | 2→2 | 2→1 | +0.0 / -50.0 pp |
| OneTrust | 2 | 0→0 | 0→0 | +0.0 / +0.0 pp |
| Cookiebot | 2 | 2→1 | 2→0 | -50.0 / -100.0 pp |
| CookieYes | 2 | 1→1 | 1→1 | +0.0 / +0.0 pp |

Distinct public sites with newly verified completion or confirmation: **zero**. Bonfire Accept and Netspark Accept completed without fresh confirmation in the candidate; Netspark Reject has no typed packet. The original action/provider/source stages for every row remain in the [canonical comparison](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/holdout-analysis/comparison.json). [Statistics](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/statistics.json) preserve the eight planned rows per arm and do not pool the diagnostic or earlier campaigns. The four-site bootstrap is descriptive only and cannot remedy the stop-rule violation.

Seven pairs have packet timing: median candidate-minus-reference **167 ms**, p95 **1201.6 ms**. The failed slot has no packet timing and is explicitly unavailable. Using visitor wall time for **all eight pairs**, including that failure, median difference is **242 ms**, p95 **5129.2 ms**. Visitor wall time includes browser/cleanup overhead and is distinct from packet-ready timing. No tail-latency gain is claimed from either series.

## Evidence for losses and remaining blockers

Bonfire's unconfirmed Accept had a full all-granted getter map but **event sequence zero throughout**. Its `us.consent.api.termly.io` request remained at guard validation pending; the reference released validation, received HTTP 201, then observed the fresh event. This directly identifies missing fresh evidence rather than an overly strict category decoder. No extra wait, retry, relaxed DNS policy or confirmation threshold was introduced.

Netspark's candidate Accept retained `receipt_missing` through initial and terminal checks; its Cookiebot receipt request had passed the guard/identity route but had no response by capture end. The reference retained a fresh CookieConsent decision. This is a different transport stage and must not be relabeled as the same DNS failure. All three discordant pairs, packet SHAs, available controls, clocks, requests and diagnostics are in the [evidence review](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/holdout-evidence-review.json). The failed Reject's original error remains intact.

The next high-return uncertainty is receipt availability under the existing window: distinguish DNS held before dispatch from requests released but still awaiting a response, and determine whether a complete documented local receipt is available within those same sessions. A storage key or hash such as `TERMLY_API_CACHE` is not sufficient proof. Any future adapter work must establish its actual documented format, fresh action/source/session binding and complete applicable category scope. More broad public scanning now has diminishing returns: the cause class is already visible, the campaign cap is consumed, and missing old proof cannot be reconstructed. No further public work is authorized by this closed campaign.

## Full retained benchmark and revisions

Final replay preserves **5,026 exports / 10,052 action rows / 1,576 completed-click denominator / 1,008 sites**, and all **2,800 original plus supplemental packets**. Every completed-click export joins retained evidence. All providers and all initial/terminal replay outcomes are unchanged, with **zero eligibility corrections and zero retained sites newly confirmed**.

| Provider | Completed clicks | Initial confirmed before→after | Unconfirmed before→after | Aborted/unresolved before→after |
| --- | ---: | ---: | ---: | ---: |
| Overall | 1576 | 356→356 | 1218→1218 | 2→2 |
| CMP identity unverified | 510 | 21→21 | 488→488 | 1→1 |
| OneTrust | 449 | 85→85 | 363→363 | 1→1 |
| Cookiebot | 129 | 119→119 | 10→10 | 0→0 |
| HubSpot Consent Banner | 87 | 7→7 | 80→80 | 0→0 |
| CookieYes | 71 | 62→62 | 9→9 | 0→0 |
| Osano | 51 | 0→0 | 51→51 | 0→0 |
| TrustArc | 42 | 1→1 | 41→41 | 0→0 |
| Termly | 33 | 23→23 | 10→10 | 0→0 |
| Consentmanager | 31 | 9→9 | 22→22 | 0→0 |
| Sourcepoint | 24 | 0→0 | 24→24 | 0→0 |
| Iubenda | 23 | 6→6 | 17→17 | 0→0 |
| Usercentrics | 21 | 0→0 | 21→21 | 0→0 |
| Cookie Information | 20 | 0→0 | 20→20 | 0→0 |
| DSGVO All in One / tarteaucitron | 15 | 0→0 | 15→15 | 0→0 |
| CookieScript | 10 | 0→0 | 10→10 | 0→0 |
| Didomi | 8 | 4→4 | 4→4 | 0→0 |
| Google Funding Choices | 8 | 3→3 | 5→5 | 0→0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1→1 | 6→6 | 0→0 |
| Condé Nast Privacy Runtime | 6 | 6→6 | 0→0 | 0→0 |
| VWO consent state | 6 | 2→2 | 4→4 | 0→0 |
| InMobi Choice CMP | 5 | 3→3 | 2→2 | 0→0 |
| Orejime | 4 | 0→0 | 4→4 | 0→0 |
| Transcend | 4 | 3→3 | 1→1 | 0→0 |
| Borlabs Cookie | 3 | 1→1 | 2→2 | 0→0 |
| DataGrail | 3 | 0→0 | 3→3 | 0→0 |
| Ketch | 3 | 0→0 | 3→3 | 0→0 |
| Fides | 2 | 0→0 | 2→2 | 0→0 |
| Axeptio | 1 | 0→0 | 1→1 | 0→0 |

Initial registration remains **356 / 1,218 / 2**, **22.5888%**; including nine already-retained terminal decisions remains **365 / 1,209 / 2**, **23.1599%**. OneTrust's 449th action remains the aborted Colocrossing Accept (`4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, observation truncated): **85 + 363 + 1 = 449**. Operational OneTrust 86/362/1, Cookiebot 122/129, CookieYes 62/71 and Termly 25/33 remain unchanged. No historical report, export or production score was rewritten. [Final full replay](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/retained/audit.json); [reconciliation](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/retained-verification.json).

| Scope | Source fingerprint | Compiled fingerprint |
| --- | --- | --- |
| Diagnostic, both arms / holdout reference | `aafcaee11b86ea5b2329636b5c75681218f9eedbd22ad9accfb3fc6fcd76ae89` | `ae1c4cb58f319dacf93c8514dfb1b5d7d3df1439a42b837208063fff27bf7b42` |
| Public holdout guard-only candidate | `2d9069d327460df7d5d8c6bf68f5d2e13de5c1f67d31669f9dcf17d148de446e` | `e6e5e9e4d0d3ec57eeb0ec301fe1e5bde5d98cfb59a92093ef4024937c161c38` |
| Final clock + guarded-navigation repair, offline validated | `6c04b2e141b01f0cdddfe4b5ca1a49388118f7611c4ae1dabc4d90b4a655285c` | `b69a9f65a674df2d5220dd9d678e84b01caa9186b0f30072324771a1b9725ea7` |

The final clock repair and corrected visitor have **not** been publicly rerun. Source/build inventories, the [reviewable runtime patch](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/runtime-delta.patch) and [runtime/tool archive](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/runtime-source-build-and-tools.tar.gz) preserve the exact revisions. Git commits record contact metadata separately; Git HEAD alone does not identify these source overlays or the historical benchmark's runtime. The diagnostic identical-build run is intentionally not treated as a paired implementation comparison; the failed combined-analysis attempt is preserved and the holdout uses the unmodified canonical paired verifier directly.

## Validation and cost

- Final **909/909** consent/public-network tests in 58 files, with source/build unchanged during the gate; scan-core TypeScript/build passed. Includes historical schemas, missing/conflicting receipts, notification-only controls, wrong-session and inapplicable-category checks and Cookiebot/CookieYes/Termly regressions. [Final gate log](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/full-consent-accepted.log); [provenance](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/final/accepted-gate-provenance.json).
- **851/851** contracts passed in this batch. Their source is unchanged by the follow-on clock capture repair; that result is not misrepresented as a second execution. **16/16** final release-selection tests, **6/6** visitor tests and **24/24** coordinator tests passed.
- All **20 contacts** are centrally persisted under the diagnostic/holdout idempotent keys; repository cooldown commits are `81b61e562` and `71a17244a`. The packet-construction failure remains failed without inventing a website access block. The original run's `halted:false` is preserved, and a post-review durable halt closes the campaign.
- Local tracing/owned tests add **$0 recurring infrastructure**. The native peer read shares a 25 ms bound inside existing result limits; at 100,000 scans, two actions and the existing 3,008 MB worker, worst added billed wall time is about **$0.245/month**, conservatively **below $0.50/month** with bookkeeping, within existing allowances and below the $1 approval threshold. No capacity, capture window, production field or retention increase. Ledger/export one-off overhead remains estimated below $0.10 for the bounded campaign. No production saving or production improvement is claimed.

Canonical verification, finding eligibility and scoring remain intact. The repairs preserve source proof and usable execution time; they do not raise confirmation by attribution, banner disappearance, unknown evidence or relaxed consent requirements. Release readiness remains **HOLD** pending a clean, separately scoped independent validation after the harness correction.
