# CertScore.ai registered-control priority and renderer-bound geometry — October 29, 2026

## Decision and scope

**Keep rollout held and do not deploy.** This batch implements shared control priority and bounded optional geometry work. The frozen **50 ms prototype**, before the final deadline refinement, reports completion **5/16→5/16 (+0.00 pp)** and corresponding consent confirmation **5/16→4/16 (-6.25 pp)**. The prespecified joint rate/latency point-estimate check is **not met**. This is local paired validation, not ordinary production verification or proof of an internet-wide improvement.

The public table compares the prior candidate with frozen prototype source `3b0d290a0ac7bdc865dd7107a19a5bbba45ce4c3fccaa856dfcd518e97d7b240`. **The current final revision is a separate refinement, source `aafcaee11b86ea5b2329636b5c75681218f9eedbd22ad9accfb3fc6fcd76ae89`, build `ae1c4cb58f319dacf93c8514dfb1b5d7d3df1439a42b837208063fff27bf7b42`, validated with owned tests and the full retained replay. It has not been rerun on public sites.** No rate or tail improvement from the prototype is claimed for this final revision. The campaign was not extended to seek a favorable result.

Dailysabah recovery remains **unverified**: it was not revisited while in its 28-day cooldown. Its retained loss motivated this work, but the old packets cannot establish whether its control was available or why its scripts remained pending. The shared fix addresses a demonstrated resolver scheduling and renderer occupancy mechanism, not a proven Dailysabah-specific cause.

## Evidence-led changes

The old Dailysabah Accept reference finished in **4,072 ms**, with Cookiebot `cd.js`/`uc.js` completing at 2,062/2,061 ms and an observed **Allow all** control. The old candidate exhausted the 14,000 ms search and finished in **15,136 ms**; those two scripts had no retained completion, and every retained selector snapshot had zero matches. The exact Cookiebot selector was already registered. Missing completion does not prove a network failure, permanent CMP absence or renderer contention. Both original packets, SHA/size, script timings and diagnostics are bound in the [retained Dailysabah review](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/dailysabah-retained-review.json).

1. The existing OneTrust native-control priority now applies to **one runtime-identified, exact unmodified canonical native first-layer recipe** across providers. The full registered selector/frame uniqueness, visible/enabled state, label/context, hit test, source/target/document authorization, action proof and receipt verification still run. Modified, framed, accessible, custom or precondition-bearing recipes do not acquire this early route. Multiple runtime identities do not select it. Ordinary canonical geometry remains the fallback.
2. Optional action-search geometry now preserves **the caller's original absolute deadline inside the renderer**, then uses a monotonic processing deadline for the remaining slice. An RPC starting late behind other work gets no fresh time allowance. Checks in composed-tree enumeration, text/label, style, rectangle and cloned-node sanitization work stop expired traversal. A browser DOM primitive already executing cannot be interrupted; this is cooperative, not a hard real-time guarantee. Exhaustion discards the partial capture and leaves unavailable/limited evidence, never proof of an absent control. Frame backpressure remains. Passive inventories retain their original coverage and allowances, without monotonic-clock reads for the inactive budget.

The initial 50 ms prototype was rejected in review: an owned slow-but-valid inventory finishing inside the existing 750 ms slice lost its Accept control, and a queued RPC could begin fresh work after its caller had expired. Both counterexamples failed against the frozen prototype and pass with the final original-deadline implementation. This refinement restores usable existing capture time and prevents late work; it adds no wait or action budget. Prototype counterexample failures are preserved in the [original failing log](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/prototype-counterexamples.log); final focused checks are in the [passing log](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/focused-deadline.log).

These changes improve runtime completion/verification opportunity; they add **no attribution-only confirmations** and do not change any receipt adapter, canonical finding eligibility, score, consent threshold, category applicability, notification semantics, source/session binding or historical policy.

## Controlled owned validation

The prior frozen runtime and final current runtime ran the same ten isolated action fixtures, budgets and native RPCs. The test injects a known 1.8-second synchronous broad-geometry cost, explicitly modeling renderer contention rather than reconstructing Dailysabah. The fixed cohort includes four valid receipt decisions, two actionable missing-receipt cases and four unsafe controls (wrong label or competing frame). All twenty original packets were retained and their hashes checked against the measured projections.

| Owned stress measure | Prior candidate | New candidate |
| --- | ---: | ---: |
| Planned action fixtures | 10 | 10 |
| Completed click + bounded observation | 0 | 6 |
| Verified corresponding decision | 0 | 4 |
| Missing-receipt confirmations | 0 | 0 |
| Wrong-label / competing-frame clicks | 0 | 0 |
| Actual renderer responsiveness after geometry request | 1223 ms | 52 ms |

The separate renderer test uses 200 real DOM containers and controlled per-element rectangle cost. It awaits a subsequent renderer RPC, rather than timing only the caller's Promise. Both exhausted inventories remain limited with zero retained candidates. Completed paths naturally include the full existing observation window, so a newly completed action may have a longer total than a prior no-click failure. Resolver time and useful observation time must not be conflated.

[Owned statistics and per-case timings](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/owned-statistics.json); [original packet provenance](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/owned-packet-provenance.json). These rates describe deliberately constructed stress fixtures and must not be presented as public-site or production rates.

## Frozen-prototype public validation design

Eight fresh sites, sixteen action pairs, at most 32 slots, concurrency one. Historical strata are one OneTrust, three Cookiebot, and one each CookieYes, HubSpot, Osano and Termly. Historical provider names stratify selection; they do not verify the live CMP. The canonical selector admitted 102/144 retained pool sites and excluded 42 after a fresh successful central all-channel export and repository-ledger merge. Public-suffix validation excludes private tenant suffixes; contact holds and 28-day cooldowns were preserved. No waiver or Dailysabah contact occurred.

Balanced arm order alternates by site and reverses between Accept and Reject. Each slot has a fresh isolated context, at most one deterministic first-layer action, native TLS/public-network/exact-target guards and the unchanged 20,000 ms result, 14,000 ms search, 2,000 ms confirmation, 3,000 ms Accept observation and 8,000 ms Reject observation caps. No Options/Manage, SDK opening, forms, retries, replacement targets, worker or region changes were allowed. No-go stops the rest of that domain; unexpected action, invalid evidence or source/build drift halts the campaign. All slots, including no-go/skips, remain in the planned primary denominator.

The [frozen plan](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/plan.json), [authorization, hypothesis and stopping conditions](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/authorization.json), and [analysis specification](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/analysis-prespec.json) were recorded before first contact. Sampling stopped at the preplanned cap. Earlier pilot/holdout observations are not pooled or used to tune this candidate after contact.

## Completion, confirmation and latency

| Measure | Prior candidate | Frozen prototype | Change |
| --- | ---: | ---: | ---: |
| Planned actions | 16 | 16 | unchanged |
| Actual contacts | 14 | 15 | — |
| Completed clicks | 5 | 5 | +0 |
| Completed click + observation paths | 5 (31.25%) | 5 (31.25%) | +0.00 pp |
| Verified consent decisions | 5 (31.25%) | 4 (25.00%) | -6.25 pp |
| Completed unconfirmed paths | 0 | 1 | — |
| Clicks without complete observation | 0 | 0 | — |
| Paths not proved complete | 11 | 11 | — |
| Contacted no-go / uncontacted / unknown | 0/2/0 | 1/1/0 | — |
| Evidence issues / native-common disagreements | 0/0 | 0/0 | — |

Full completion requires both click and bounded observation. The canonical comparison's `completed` counter counts clicks only and is not substituted for this endpoint. A decision requires independent canonical verification; banner disappearance, CMP identity or notification acknowledgment cannot supply it. Matched-contact sensitivity is preserved in [statistics](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/statistics.json).

| Action | Planned each | Completion before→after | Confirmation before→after | Completion / confirmation change |
| --- | ---: | ---: | ---: | ---: |
| accept | 8 | 4→4 | 4→3 | +0.00 / -12.50 pp |
| reject | 8 | 1→1 | 1→1 | +0.00 / +0.00 pp |

| Historical provider stratum | Sites | Planned each | Completion before→after | Confirmation before→after | Completion / confirmation change |
| --- | ---: | ---: | ---: | ---: | ---: |
| OneTrust | 1 | 2 | 0→0 | 0→0 | +0.00 / +0.00 pp |
| Cookiebot | 3 | 6 | 3→3 | 3→3 | +0.00 / +0.00 pp |
| CookieYes | 1 | 2 | 1→1 | 1→1 | +0.00 / +0.00 pp |
| HubSpot Consent Banner | 1 | 2 | 0→0 | 0→0 | +0.00 / +0.00 pp |
| Osano | 1 | 2 | 0→0 | 0→0 | +0.00 / +0.00 pp |
| Termly | 1 | 2 | 1→1 | 1→0 | +0.00 / -50.00 pp |

Distinct sites with a gained completion: **none**. Distinct sites with a lost completion: **none**. Gained confirmation sites: **none**; lost confirmation sites: **eetapps.com**. These are observed pair differences, not established causal effects or uniform provider improvements.

Site-cluster percentile bootstrap (100,000 replicates, seed 20261029, both actions preserved within each of eight sites) gives a 95% completion difference interval **[0.0, 0.0] pp** and confirmation interval **[-18.75, 0.0] pp**. Small stratified-cohort uncertainty limits generalization. The completion bootstrap is degenerate because every observed paired completion difference is zero; it does not establish zero population effect. Matched-contact completion is 5/14→5/14 and confirmation 5/14→4/14; no-go and skipped slots remain in the primary planned denominators.

Paired total-time difference (candidate minus reference) has median **-212.0 ms** and p95 **5715.9 ms**, against unchanged +500/+2,000 ms review limits. This is the p95 of within-pair differences, not the difference between arm p95s. Resolver median difference is **-2.0 ms**. The dominant new tail/confirmation loss is **Eetapps Accept**: total 4,790→19,966 ms, with navigation 906→14,853 ms **before any changed resolver/geometry branch**. The final www document request was retained at 421→15,319 ms; the post-click Termly consent request started at 16,961 ms with no retained completion. Both arms resolved the same authorized control, clicked it and completed observation; only the reference retained a fresh decision. This is an observed receipt/readiness loss with a pre-resolver navigation delay, not proof that native-control priority caused the delay or that consent permanently failed. Keep it in the loss counts and release hold. The [discordant evidence review](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/discordant-review.json) contains both original packets, controls, timings, requests and diagnostic reasons.

The earlier independent holdout had +20.5 ms median and +2,779.05 ms p95 paired total differences, including Dailysabah's +11,064 ms loss; these different cohorts cannot establish that the same site's tail regression has disappeared.

## Evidence for every discordant pair

### eetapps.com accept — completion +0, confirmation -1

- reference: outcome `consent_decision_confirmed`, provider `Termly`, measures `{'providerAttributed': True, 'controlResolved': True, 'clickCompleted': True, 'observationCompleted': True, 'categoryScopeVerified': None, 'decisionVerified': True}`. [Original packet](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/run/visits/07-eetapps.com-accept-reference/PostAcceptEvidencePacket.json), SHA-256 `fc0cccc1bb84c28a19e738f2e1ada9c7182d3700972f7a7ce309c38d007fbd5b`.
- candidate: outcome `completed_unconfirmed`, provider `Termly`, measures `{'providerAttributed': True, 'controlResolved': True, 'clickCompleted': True, 'observationCompleted': True, 'categoryScopeVerified': None, 'decisionVerified': False}`. [Original packet](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/run/visits/07-eetapps.com-accept-candidate/PostAcceptEvidencePacket.json), SHA-256 `e6e60ab07d7e8c69d208b75d24ab73260ac687279f1c4bc063aeb4a37e47d236`.

Every unchanged and unresolved action, including independent identity, control, click, observation, category, initial/terminal choice and notification stages, remains in the [canonical comparison](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/analysis/run-1/comparison.json) and [all unresolved rows](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/unresolved-evidence.json). No unresolved action is dropped to raise a percentage.

## Full retained benchmark and denominator reconciliation

The immutable cohort SHA is `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`: **5,026 exports, 10,052 action rows, 1,576 completed clicks, 1,008 sites**. All 2,800 retained packets are included (1,466 original + 1,334 supplemental); every completed-click export joins retained proof. All provider totals and all original/supplemental replay outcomes are unchanged from the prior accepted replay. This is no new retained-evidence confirmation lift and no eligibility correction. The table preserves historical initial registration separately from operational terminal confirmation.

| Provider | Completed-click denominator | Initial confirmed before→after | Unconfirmed before→after | Aborted/unresolved before→after | Initial confirmation change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overall | 1576 | 356→356 | 1218→1218 | 2→2 | 0 pp |
| CMP identity unverified | 510 | 21→21 | 488→488 | 1→1 | 0 pp |
| OneTrust | 449 | 85→85 | 363→363 | 1→1 | 0 pp |
| Cookiebot | 129 | 119→119 | 10→10 | 0→0 | 0 pp |
| HubSpot Consent Banner | 87 | 7→7 | 80→80 | 0→0 | 0 pp |
| CookieYes | 71 | 62→62 | 9→9 | 0→0 | 0 pp |
| Osano | 51 | 0→0 | 51→51 | 0→0 | 0 pp |
| TrustArc | 42 | 1→1 | 41→41 | 0→0 | 0 pp |
| Termly | 33 | 23→23 | 10→10 | 0→0 | 0 pp |
| Consentmanager | 31 | 9→9 | 22→22 | 0→0 | 0 pp |
| Sourcepoint | 24 | 0→0 | 24→24 | 0→0 | 0 pp |
| Iubenda | 23 | 6→6 | 17→17 | 0→0 | 0 pp |
| Usercentrics | 21 | 0→0 | 21→21 | 0→0 | 0 pp |
| Cookie Information | 20 | 0→0 | 20→20 | 0→0 | 0 pp |
| DSGVO All in One / tarteaucitron | 15 | 0→0 | 15→15 | 0→0 | 0 pp |
| CookieScript | 10 | 0→0 | 10→10 | 0→0 | 0 pp |
| Didomi | 8 | 4→4 | 4→4 | 0→0 | 0 pp |
| Google Funding Choices | 8 | 3→3 | 5→5 | 0→0 | 0 pp |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1→1 | 6→6 | 0→0 | 0 pp |
| Condé Nast Privacy Runtime | 6 | 6→6 | 0→0 | 0→0 | 0 pp |
| VWO consent state | 6 | 2→2 | 4→4 | 0→0 | 0 pp |
| InMobi Choice CMP | 5 | 3→3 | 2→2 | 0→0 | 0 pp |
| Orejime | 4 | 0→0 | 4→4 | 0→0 | 0 pp |
| Transcend | 4 | 3→3 | 1→1 | 0→0 | 0 pp |
| Borlabs Cookie | 3 | 1→1 | 2→2 | 0→0 | 0 pp |
| DataGrail | 3 | 0→0 | 3→3 | 0→0 | 0 pp |
| Ketch | 3 | 0→0 | 3→3 | 0→0 | 0 pp |
| Fides | 2 | 0→0 | 2→2 | 0→0 | 0 pp |
| Axeptio | 1 | 0→0 | 1→1 | 0→0 | 0 pp |

Overall initial registration remains **356 confirmed + 1,218 unconfirmed + 2 aborted/unresolved = 1,576 (22.5888%)**. Including nine already-retained terminal decisions, operational counts remain **365 / 1,209 / 2 (23.1599%)**. OneTrust's missing 449th row remains `colocrossing.com`, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, Accept observation truncated; it is aborted/unresolved, not forced into confirmed or unconfirmed. Operational OneTrust remains 86/362/1. Operational Cookiebot 122/129, CookieYes 62/71 and Termly 25/33 are unchanged. Distinct sites helped through retained replay: **zero**.

[Full fresh replay](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/retained/audit.json) and [verification](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/retained-verification.json) preserve historical exports. Historical export evidence does not identify a single runtime revision; Git HEAD alone does not identify the prior source overlays. This batch's runtime candidate is explicitly frozen below. Audit-tool and paired-runner fingerprints inventory different sets of files and should not be equated.

## Validation, provenance, cost and remaining work

- [Complete consent-gate log](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/full-consent-accepted.log) and [source/build/test provenance](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/accepted-gate-provenance.json): **882/882** consent tests across 55 release-gate files; source/build unchanged during the gate. Includes existing historical-schema, missing/conflicting receipts, notification-only, inapplicable-category, wrong-session, Cookiebot, CookieYes and Termly regressions plus the new native-control/renderer tests.
- **851/851** contract tests, **15/15** release-selection tests; final scan-core TypeScript and build passed. Contract source is unchanged by the deadline refinement; the contract result is reused with checksum verification, not reported as a second run. Initial diagnostic contract invocations failed on sandbox tsx IPC and root-relative fixture paths; rerunning the canonical package command with permitted IPC passed all 851. Original failed logs are preserved.
- Baseline runtime source `ad63e6977f3ce90e248fd79471ae04fad56d2e49a8b1ebbd759fa8611edd099d`, build `6cae7e7ff98c4526de87924f857697045d336adbb97d7a4c6b5e1faf35e46fdb`.
- Public prototype source `3b0d290a0ac7bdc865dd7107a19a5bbba45ce4c3fccaa856dfcd518e97d7b240`, build `d8899615b7bf0ff2aa1a9c64960f818797d110b93a8be8b86790c1f03e630423`. Final current runtime source `aafcaee11b86ea5b2329636b5c75681218f9eedbd22ad9accfb3fc6fcd76ae89`, build `ae1c4cb58f319dacf93c8514dfb1b5d7d3df1439a42b837208063fff27bf7b42`. Six-package inventories and the [source/build archive](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/candidate-runtime-source-build.tar.gz) preserve the tested overlays independently of metadata-only Git commits. This batch changes three runtime files, adds one focused test file, and includes it in existing release selection.
- All 29 actual public contacts were centrally persisted under `cmp-control-priority-20261029.v1`; all eight site cooldowns were reviewed and committed in metadata-only Git revision `660be470cce6dc02e0ac62fe5fe52ae7c26300a2`. The final gate routing also recognizes edits to the new registered-control test itself; [wiring verification](/Users/benmasek/WC01/artifacts/cmp-control-priority-2026-10-29/final/gate-wiring-verification.json) proves its 55 commands/test hashes remained unchanged and the separate 15-test routing suite passed. No push, deployment, flag/campaign activation or recurring capacity change. New recurring capacity and retained storage increment **$0**; no new request/capture/model call or evidence field. Conservative incremental CPU-bookkeeping estimate **below $0.10/month at 100,000 scans**, sharing existing allowances; shorter broad traversal may offset it, but no measured production saving is claimed. Local browser work adds no AWS compute; bounded one-off ledger/export overhead estimated **below $0.10 total**, within existing allowances.

The next highest-return work is to distinguish pre-commit request/guard latency and missing fresh decision evidence from control-resolution latency using the retained request lifecycle. Eetapps already shows the slow final document before the resolver and an unresolved post-click receipt; changing a selector cannot establish that receipt. No guard, TLS, native navigation or timeout policy is relaxed on this evidence. The refined original-deadline candidate still needs a future independent public validation; the frozen prototype failed the joint rate/latency criterion. Dailysabah requires a future eligible or explicitly authorized visit to verify its own recovery; this batch supplies neither a cooldown waiver nor a readiness diagnosis. More broad visits now would have diminishing returns: they cannot recover missing old proof, would consume independent targets, and must not replace a controlled hypothesis. Native registered control paths are now tested before optional broad traversal; remaining generic/custom controls and script readiness need specific evidence. Preserve all proof, scoring, budgets and rollout hold until ordinary production evidence and separate authorization support release.
