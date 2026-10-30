# CertScore.ai bounded selector-sweep assessment — October 29, 2026

## Outcome and decision

Implemented a shared repair for selector-sweep budget losses in both Accept and Reject. The same 12 owned browser cases improve **4→8 completed paths (33.33%→66.67%, +33.33 percentage points)** and **3→6 confirmed choices (25.00%→50.00%, +25.00 points)**. These are measured executions with actual Chromium and canonical packet projection, with controlled per-frame reply latency; they are not production outcomes or population estimates.

The separately frozen two-site public diagnostic planned eight total slots, with four per build. It contacted **4 reference and 4 candidate slots**. Completed paths were **1→2**; confirmed choices were **1→2** on those unchanged planned denominators. Matched contacted pairs: **4**. On that matched subset, completion was **1→2**, confirmation **1→2**. The fixed-cohort public and owned results remain separate.

**Local changes are ready for code review; hold a broad reliability rollout.** A two-site diagnostic cannot establish a significant population improvement or ordinary production verification. No deployment, flag change, larger worker, historical rewrite, broad campaign, model call, form submission, Options/Manage action or observation-window extension occurred.

## Largest recoverable shared cause

The retained runtime inventory contains **63 unresolved control attempts across 25 sites**, including **41 attempts across 21 sites** with explicit binding-budget exhaustion. This joins the previous 50 unresolved attempts with all 13 unresolved control attempts in the last paired campaign, without deleting rows. See [all evidence references and reasons](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/ranked-control-exposure.json).

The old named resolver awaited selector counts one frame after another. Even when a current control was present, the complete frame sweep could overrun its existing slice; Reject's existing stability check could then require a second serial sweep and lose the whole action. This is a reusable mechanism across registered providers, rather than a domain exception. The retained public gaps are compatible with this cause but lack per-command timings and cannot prove it. Forty-one exposed attempts are **not** a forecast of 41 recoveries; truly absent controls, a blocked renderer and unsupported receipts remain unresolved.

The selected fix has stronger direct reproduction than adding guessed selectors or loosening CMP source/category rules: three existing providers reproduce the failure, and both action observers share the same scheduling defect. It adds no recipe, SDK opening, consent setter, network request or capture allowance.

## Implementation and safeguards

`consent-selector-counts.ts` runs the existing native selector-presence reads with **at most four actual count RPCs per page in flight**. It deduplicates identical selector/frame reads and keeps every participating frame and registered recipe in the uniqueness sweep. The resolver still performs its existing current label, visibility, enabled state, composed-scope readiness, hit-target, exact target, same-node proof, single-action dispatch and semantic receipt verification.

A missing, failed, late or partial count is unknown, never zero. An incomplete sweep cannot authorize an action. Actual pending commands retain their slots after timeout; later sweeps cannot flood the browser or reuse stale results. Abort/deadline checks apply before queued commands start. Frame navigation, attachment, detachment or close invalidates a snapshot, including same-URL reloads. A fresh complete sweep may retry inside the original slice; it never gets a new deadline.

Earlier positive partial presence is preserved only in diagnostic rows, including when a later frame change invalidates the inventory. It does not establish current CMP identity or actionability. If two actionable controls have already been observed, the original ambiguity outcome remains a safe blocker even when the sweep later expires. Accessible-control recipes keep their existing resolution path. The registered recipe maximum remains 26; canonical evidence verification, findings, scoring and receipt requirements are unchanged.

Initial full-gate attempts caught lost partial diagnostics, a premature fallback after navigation and an ambiguity-reason regression. Those were repaired with the original assertions and safety limits intact. A queued-abort regression also failed before its repair and passes afterward. The original logs remain in the artifact directory. The first owned competing-frame fixture placed its control outside the child viewport; its height was corrected before the authoritative frozen comparison. That preliminary corpus is preserved and is not pooled into the fixed 12-case comparison.

## Measured owned results

Both arms use fresh isolated contexts and the same fixed 12-case harness: CookieYes, Osano and HubSpot Accept/Reject positives, plus CookieYes wrong-label, competing-frame and missing-receipt negatives for each action. Eight unrelated child documents each model a 100 ms selector-reply delay. Search stays 1,100 ms, confirmation 200 ms, result 6,500 ms and observation 3,000 ms in both arms. This deliberately isolates a defect within the allowed production ceilings; it is not a representative website latency distribution.

| Provider | Cases each | Completed before→after | Confirmed before→after |
| --- | ---: | ---: | ---: |
| CookieYes | 8 | 2→4 | 1→2 |
| Osano | 2 | 1→2 | 1→2 |
| HubSpot Consent Banner | 2 | 1→2 | 1→2 |
| **Overall** | **12** | **4→8** | **3→6** |

The three newly confirmed paths are Reject for CookieYes, Osano and HubSpot. The fourth new completion is the missing-receipt CookieYes Reject negative, which remains unconfirmed. Wrong-label and competing-frame cases receive zero clicks in both arms; missing receipts receive zero confirmations. Confirmation among completed paths remains 75% in both arms; the gains above use the unchanged planned denominator. These are verification gains, not attribution-only relabeling. Owned cases are not counted as public sites helped.

All 24 original packets were SHA/size checked, parsed against the appropriate schema and canonically reprojected. [Case-level verified measurements and packet references](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/owned-verified.json). The reference executes the immutable prior compiled build; the final candidate measurements come from the source/build-stable full release gate.

## Retained control-loss exposure by routing hint

These are observed routing hints, not verified action-bound provider identities. Every attempt appears once; site counts overlap between rows. A positive count or CMP marker alone cannot authorize or confirm an action. Native selector scheduling is only conditionally addressable; accessible-control recipes retain their existing path.

| Routing hint | Unresolved attempts | Sites | With budget exhaustion | Sites with budget exhaustion |
| --- | ---: | ---: | ---: | ---: |
| OneTrust | 13 | 4 | 13 | 4 |
| Osano | 16 | 4 | 11 | 4 |
| No unique routing hint | 20 | 11 | 9 | 7 |
| Termly | 4 | 2 | 2 | 2 |
| Cookiebot | 3 | 2 | 2 | 2 |
| CookieYes | 2 | 2 | 1 | 1 |
| Finsweet Consent Pro | 2 | 1 | 1 | 1 |
| HubSpot Consent Banner | 2 | 2 | 1 | 1 |
| Google Funding Choices | 1 | 1 | 1 | 1 |

Full packet references and additional reason codes remain in the exposure artifact; counts above are not newly recovered historical actions.

## Public diagnostic and contact accounting

The hypothesis was that the complete bounded sweep improves resolution while retaining existing semantic verification under unchanged production budgets. The stop rule was eight slots, concurrency one, no retries, no replacements, no tuning after contact and same-domain stop after a no-go. Fresh central all-channel history and the canonical selector excluded eight of the 33 retained candidates; no cooldown was waived. A request for all 33 eligible rows failed closed because only 25 were eligible; rerunning with 25 changed neither eligibility rules nor exclusions and made no contacts. One admitted target per predeclared historical HubSpot/CookieYes stratum was taken in canonical rotation order: LoyaltyLion and Solidgate.

The initial plans had zero claims/contacts and were superseded before contact by the final diagnostic-repair build. The first execution attempt then failed environment validation before browser launch: calculating eligibility timestamps with separate clock reads made the interval exceed 24 hours by microseconds. Expiry was corrected from the original checked instant, without extending that history check or changing any target, slot, campaign cap, build, authorization or scan limit. The corrected offline preflight and source-stable final gate passed before actual execution. The failed attempt and timestamp proof remain preserved. Actual public outcomes are not pooled with earlier campaigns or owned cases.

| Historical provider stratum | Planned each | Contacted before→after | Completed before→after | Confirmed before→after | Completed unconfirmed before→after | Not completed before→after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HubSpot Consent Banner | 2 | 2→2 | 0→0 | 0→0 | 0→0 | 2→2 |
| CookieYes | 2 | 2→2 | 1→2 | 1→2 | 0→0 | 1→0 |
| **Overall** | **4** | **4→4** | **1→2** | **1→2** | **0→0** | **3→2** |

Solidgate Accept is the one gained completed/confirmed path; Solidgate Reject remains confirmed in both arms, with no losses. LoyaltyLion remains unresolved on both choices in both builds. Its retained observations contain HubSpot/CookieHub routing hints; those do not verify an active CMP or a current actionable control. All five non-confirmed paths across the two arms remain in [the remaining-control-loss evidence](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/remaining-control-losses.json). The public result is consistent with the controlled recovery, but separate visits include website/runtime variation and do not isolate code causality or establish a population effect. No attribution-only action gain is counted.

Unresolved completed rows: 0→0. Confirmed per planned slot: 25.00%→50.00% (+25.00 points). Initial confirmations: 1→2; terminal-only: 0→0; notification acknowledgments: 0→0. Identity, surface/control observation, attempt, click, observation completion and decision verification remain independent. Historical strata do not verify the current action-bound provider.

Sites with newly confirmed paths: ['solidgate.com']; sites with lost confirmations: []. See [the canonical paired comparison](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/analysis/run-1/comparison.json) for matched rates, native/common disagreements, evidence issues, all provider rows and packet checksums. No unresolved row was removed.

- loyaltylion.com accept: neither_confirmed; [reference packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/00-loyaltylion.com-accept-reference/PostAcceptEvidencePacket.json) / [candidate packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/00-loyaltylion.com-accept-candidate/PostAcceptEvidencePacket.json). SHA-256 `563e863c4ef82e3ebd5a39bbada8da15a9ec63589f3a19247c52f33322756d07` / `c892c28e4739dd8d0a2001368bd044961359cf505670f9818150ab3f8920e631`.
- loyaltylion.com reject: neither_confirmed; [reference packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/00-loyaltylion.com-reject-reference/PostRefusalEvidencePacket.json) / [candidate packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/00-loyaltylion.com-reject-candidate/PostRefusalEvidencePacket.json). SHA-256 `24a0ce81e89d5257efc491f742f8ca31de28714b4eb25b180d60d981da5aa42c` / `a5cf7dddcbba481580b82ddcfe21e5429c424fece41650a3d671a4b68c655f2c`.
- solidgate.com accept: gained; [reference packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/01-solidgate.com-accept-reference/PostAcceptEvidencePacket.json) / [candidate packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/01-solidgate.com-accept-candidate/PostAcceptEvidencePacket.json). SHA-256 `e1b104cc5b062df934a25d8429efa9d1fe1711fe95ac599a99675af14c9b0130` / `967fe4b993e68862961eea6469c299b0728ec638d3bb30072b7834792932b8dd`.
- solidgate.com reject: both_confirmed; [reference packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/01-solidgate.com-reject-reference/PostRefusalEvidencePacket.json) / [candidate packet](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/run/visits/01-solidgate.com-reject-candidate/PostRefusalEvidencePacket.json). SHA-256 `3af237365567b30cb720099dbace83eadeed0b90b6e12f2a55987f6abb02e689` / `21759a2ba2973af1a5a8f87fbf6079b558f9a2a1680ed2367521e728d467d276`.

Actual contacts were persisted centrally with idempotent run key `cmp-selector-sweep-live-20261029.v1`; the reviewed repository ledger was committed locally at `6c9f7b1fdeca3e94a82b9b94ad227d2ca3a26d40`. [Contact provenance](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/live/contact-provenance.json). No push or deployment occurred.

## Entire retained benchmark

The fixed cohort remains SHA-256 `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`: 5,026 preserved exports, 10,052 action rows, 1,576 completed clicks and 2,800 verified packets. All three comparison change arrays are empty; denominator changes, eligibility corrections and newly confirmed retained sites are zero. Initial registration stays **356 confirmed / 1,218 unconfirmed / two aborted-unresolved (22.5888%)**. Operational confirmation stays **365 / 1,209 / two (23.1599%)**, including nine previously retained terminal decisions.

OneTrust's initial 449 actions remain **85 confirmed + 363 unconfirmed + one aborted**. The remaining action is colocrossing.com Accept, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, with an incomplete observation window. It is not forced into unconfirmed. An unverified CMP identity does not establish that no CMP exists; a completed click does not establish registration.

All providers are shown below. C/U/R means confirmed/unconfirmed/unresolved. Both triplets are unchanged before and after; every retained provider's percentage-point change and newly helped site count are zero.

| Provider | Completed denominator | Initial C/U/R before = after | Operational C/U/R before = after |
| --- | ---: | ---: | ---: |
| CMP identity unverified | 510 | 21/488/1 | 21/488/1 |
| OneTrust | 449 | 85/363/1 | 86/362/1 |
| Cookiebot | 129 | 119/10/0 | 122/7/0 |
| HubSpot Consent Banner | 87 | 7/80/0 | 7/80/0 |
| CookieYes | 71 | 62/9/0 | 62/9/0 |
| Osano | 51 | 0/51/0 | 0/51/0 |
| TrustArc | 42 | 1/41/0 | 1/41/0 |
| Termly | 33 | 23/10/0 | 25/8/0 |
| Consentmanager | 31 | 9/22/0 | 9/22/0 |
| Sourcepoint | 24 | 0/24/0 | 0/24/0 |
| Iubenda | 23 | 6/17/0 | 6/17/0 |
| Usercentrics | 21 | 0/21/0 | 0/21/0 |
| Cookie Information | 20 | 0/20/0 | 0/20/0 |
| DSGVO All in One / tarteaucitron | 15 | 0/15/0 | 0/15/0 |
| CookieScript | 10 | 0/10/0 | 0/10/0 |
| Didomi | 8 | 4/4/0 | 5/3/0 |
| Google Funding Choices | 8 | 3/5/0 | 3/5/0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1/6/0 | 1/6/0 |
| Condé Nast Privacy Runtime | 6 | 6/0/0 | 6/0/0 |
| VWO consent state | 6 | 2/4/0 | 2/4/0 |
| InMobi Choice CMP | 5 | 3/2/0 | 3/2/0 |
| Orejime | 4 | 0/4/0 | 0/4/0 |
| Transcend | 4 | 3/1/0 | 3/1/0 |
| Borlabs Cookie | 3 | 1/2/0 | 3/0/0 |
| DataGrail | 3 | 0/3/0 | 0/3/0 |
| Ketch | 3 | 0/3/0 | 0/3/0 |
| Fides | 2 | 0/2/0 | 0/2/0 |
| Axeptio | 1 | 0/1/0 | 0/1/0 |
| **Overall** | **1,576** | **356/1,218/2** | **365/1,209/2** |

Cookiebot 122/129, CookieYes 62/71 and Termly 25/33 operational confirmations are unchanged. Runtime selector scheduling cannot recover a control or event that was never retained. [Full verified replay](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/retained-accepted/audit.json). Prior benchmark revision reconciliation remains in the [original assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-action-confirmation-reliability-2026-10-29.md); the prior live sample remains in the [separate earlier report](/Users/benmasek/WC01/docs/certscore-v2/cmp-shared-recovery-2026-10-29.md).

## Validation, revisions and cost

The final full gate passes **869 consent regressions**, including the 12-case runtime measurement and 11 selector-scheduling negatives/lifecycle checks. All **851 contract tests** and **15 release-selection checks** pass; scan-core typecheck/build pass. Existing tests cover historical schemas, missing/opposite/conflicting receipts, notification-only controls, inapplicable categories, wrong session/target/document and Cookiebot/CookieYes/Termly behavior. Original regression assertions and budgets were preserved. [Source-stable gate provenance](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/accepted-gate-provenance.json) · [Full gate](/Users/benmasek/WC01/artifacts/cmp-selector-sweep-2026-10-29/full-consent-accepted.log).

| Arm | Source fingerprint | Compiled fingerprint |
| --- | --- | --- |
| Immediate reference | `552d5dbbfec95e4eccca13d59fa077258bdfefaa916ce83b8692d14730ebe50e` | `feeb44ff12470cc98bc2eecc3f2f92b39eb835904ba3b921c5b8766d75212a23` |
| Final candidate | `ad63e6977f3ce90e248fd79471ae04fad56d2e49a8b1ebbd759fa8611edd099d` | `6cae7e7ff98c4526de87924f857697045d336adbb97d7a4c6b5e1faf35e46fdb` |

Git HEAD is metadata-only contact accounting; the runtime fingerprints and preserved source/build snapshots identify the tested code. The final gate verifies no source/build/test drift during its run. The public runner rechecks both builds before and after each slot. All Node/Playwright/Chromium identities are pinned in the plan.

Production caps remain result/search/confirmation **20,000/14,000/2,000 ms**, Accept observation **3,000 ms**, Reject **8,000 ms**. Public concurrency stays one. Four concurrent read-only selector commands inside one existing page do not add browser contexts, workers or lanes, or expand SDK-read and capture-window allowances. New recurring capacity is $0; bounded scheduling bookkeeping is estimated below $0.10/month at 100,000 scans, within the standing sub-$1 approval and existing observation allowance. One-time central ledger export/persistence is estimated below $0.10 total. These are engineering estimates, not measured production billing.

## Remaining blockers and next return

Keep the release hold until a stable candidate demonstrates a net confirmation and completion gain on a sufficiently broad approved cohort, then ordinary production evidence verifies it. The owned recovery establishes that the mechanism works, not that all 41 exposed public attempts are recoverable. No replay gain or broader production improvement is claimed.

The next shared boundary is present-but-unreadable controls versus genuinely unobserved applicable controls. Busy renderer execution, missing first-layer Reject choices, unresolved source/receipt/session proof and late CMP initialization cannot be repaired by scheduling alone. Continue with bounded retained timing/provenance before adding capture; never infer success from CMP presence, a click, banner disappearance or notification acknowledgment. OneTrust pre-native-commit source binding remains a separate unresolved problem, and Gimbal/ReadCube holds stay intact.

Further replay has diminishing returns when the needed frame read, label or receipt shape was never captured. Further visits without a discriminating hypothesis add runtime variation and cooldown consumption; this campaign stops after eight planned slots, including no-go skips. No retries, replacement targets, broader campaign or budget increase follows from these results.
