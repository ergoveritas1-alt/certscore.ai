# CertScore.ai CMP action-confirmation reliability assessment

Date: October 29, 2026. Local implementation and validation only.

## Decision

The shared confirmation and audit changes are ready for code review. Hold a broad
reliability rollout: this work demonstrates safer API confirmation and more precise
diagnostics, but no increase in retained historical confirmations and no ordinary
production improvement. No deployment, feature-flag change, historical report
rewrite, public rescan, model call or persistent infrastructure change occurred. Estimated
recurring cost incurred by this local work is **$0**. The repairs add no browser
read, wait, model call or capture allowance. A conservative estimate for longer
diagnostic reason text after a future deployment is **below $0.01/month at
100,000 scans**, within the standing sub-$1 approval. Retained AWS lookup and
download work uses a separate **below-$0.10 one-time estimate**.

The historical result remains **356 confirmed / 1,576 completed clicks (22.5888%)**.
The remainder is **1,218 unconfirmed and two aborted**, not 1,220 unconfirmed.
Click completion, observation completion, initial registration and terminal
verification are distinct measures. All denominator rows are retained.

The complete packet replay establishes an operational baseline of **365 confirmed,
1,209 unconfirmed and two aborted/unresolved out of the same 1,576 clicks
(23.1599%)**, both before and after this change. Nine already-retained terminal
decisions explain its difference from the initial-registration benchmark; they
are not newly confirmed actions. All 1,576 completed actions now have verified
original packets. **Candidate improvement: 0.00 percentage points; zero sites
with newly confirmed decisions.**

## What the previous benchmarks tested

The historical export ranking covers 5,026 reportable scans and 10,052 action
rows in the fixed September 27–October 27 archive. Its 1,576 completed clicks
span report projection v26 (597) and v27 (979). Those are report versions, not
scanner Git revisions. The export does not establish one scanner candidate for
the whole historical aggregate.

The original cohort already excluded 277 canary/test and 53 origin-unverified
scans. Those frozen exclusions are preserved; this task adds no eligibility
exclusion or denominator adjustment.

The separate October 28 selected runtime benchmark has 76 contacts in each of
the reference and candidate arms, with four uncontacted planned slots per arm.
Both frozen checkouts report Git HEAD
`6d5a147e51decd6451f6278d4328ae5275a9dd8b`, but contain different source overlays:

| Arm | Frozen source/build manifest fingerprint | Retained files verified |
| --- | --- | ---: |
| Reference | `296180018fd049fb66b3348b19665b0e5ac74178a5184f1c4ed7ae0e3084ee3a` | 1,497 |
| Candidate | `f0b18ee9779295d51bde1952967a7afaa6eef83d7bc8b302b37c869f4463a520` | 1,506 |

Every listed file still matches. That candidate had five reviewed OneTrust SDK
URLs and notification support; it predates the later 17-URL source coverage,
effective-category, shared readiness and resolver repairs. A Git HEAD alone
would incorrectly identify these candidates as equivalent. See the retained
[build provenance](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/oct28-build-provenance.json).

This task starts at clean revision
`b84ecbbd0cfff8d48a0271ca23eba21c77d2b542`. The clean baseline was replayed from
an isolated archive of that revision; 916 runtime source files were verified
against the initial clean source snapshot. Preliminary concurrent-workspace
outputs are preserved and explicitly superseded by that clean baseline. See
[baseline provenance](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/baseline-provenance.json).

## Existing work and the selected batch

The three leading shared groups in the 76-contact candidate are:

| Priority | Shared cause | Actions / sites exposed | Existing implementation | Remaining uncertainty |
| --- | --- | ---: | --- | --- |
| 1 | Control readiness and resolution | 32 / 22 | Composed-ancestry readiness, stalled-probe cancellation and per-frame geometry backpressure | Some visits never expose an applicable control. This is not a forecast of 32 recoveries. |
| 2 | OneTrust category and source binding | 19 / 11 | Exact SDK URL/hash/size pins, source predicates, active-category applicability, identical-element binding and reduced cookie round trips | Historical group hashes cannot reconstruct configuration or excluded categories. IAB, hierarchy, private flags and required-only scopes remain guarded. |
| 3 | Shared receipt interpretation | 7 / 4 | CookieYes renewal metadata handling and existing provider adapters, including complete-category Complianz evidence where available | Missing receipts, incomplete scope and unknown protocols remain unconfirmed. |

These groups were selected for coverage, retained evidence strength, reuse and
low implementation risk. Their existing repairs are already integrated into the
starting candidate; they were not reimplemented or counted as new gains. The
17 OneTrust URL pins cover the 97 SDK bodies inventoried by the earlier work;
that establishes source recognition, not a decision or whole-provider coverage.
The broader earlier runtime comparison also lost six completed observations
(46 reference versus 40 candidate); later selected successes do not close that
broader cohort’s observation-completion concern.

The new batch closes a verified shared API inconsistency and the audit gaps:

1. `evaluateCmpApiConfirmation` is now the single eligibility check used by both
   Accept and Reject. Accept retains and compares the already-read configuration
   fingerprint and applies the same saved-event requirements as Reject. No new
   action recipe is enabled. Cookie Information, CookieScript and Finsweet
   fixture paths demonstrate the previously inconsistent Accept checks; this
   does not claim new production Accept coverage for them.
2. Reject passes through the API reader's precise category, malformed-receipt
   and readback-conflict reasons instead of replacing them with `api_unavailable`.
   HubSpot and Osano fixtures demonstrate the diagnostic correction using the
   same reads. This improves future triage, not consent counts.
3. The benchmark now verifies a fixed cohort, checks all packet identities and
   hashes, preserves aborted/unknown rows, separates diagnostic phases and
   exports provider-by-blocker counts, sites, source references and conservative
   investigation bounds. Stage reporting separately exposes surface/control
   evidence, attempted action, initial registration, terminal verification and
   notification acknowledgment. Duplicate retained stage rows fail closed.

An attempted action includes a control execution that failed before dispatch;
it does not assert that a browser event was delivered. A missing action-bound
CMP identity remains unverified. The current schema does not positively encode
an unsupported CMP identity, so an unsupported action or receipt is never used
to invent that identity state. Required-only categories and notification receipts
do not become consent decisions. Existing canonical projection, findings,
scoring, source/target/session verification and absolute budgets are unchanged.

## Reconciliation and evidence meaning

OneTrust's 449 rows are **85 confirmed + 363 unconfirmed + one aborted**.
The aborted action is colocrossing.com Accept, scan
`4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`: click completed, observation incomplete,
reason `accept_observation_window_truncated`. The other aborted action is
bodybuilding.com Accept, scan `ebee18cb-221f-4722-a097-8a00710af4f8`.
Their original packets separately retain `abort_requested_during_confirmation`
and an unverified/unknown initial decision. Neither is reassigned to improve a
percentage.

The original packet stratum contains 1,466 action attempts, including 1,209
not-attempted, 202 initially unconfirmed, 51 initially confirmed and four aborted
registrations. Canonical replay verifies 256 clicks, 251 completed observations
and 52 operational confirmations. The extra operational confirmation is a
previously retained Cookiebot terminal decision for kreativmedia.ch Reject; its
initial registration remains unconfirmed. These are different stages and a
different denominator from the 1,576 exported completed clicks.

The original 1,466-packet archive covers 242 of the fixed 1,576 export rows.
The separately bound coverage supplement adds 1,334 original packets,
bringing coverage to 1,576/1,576 completed export actions. Retrieval
of retained evidence is not a new scan, a changed eligibility denominator or a
new consent confirmation. Export provider labels describe the original
starting-page attribution; packet provider identity describes the action control.
Distinct-site counts use the retained exact hostname, not a guessed organization
or registrable-domain grouping.
Historical TrustArc/TrustArc CMP and other reviewed display aliases use the
frozen original alias map, preserving raw labels and every action.

<!-- generated-results-start -->
## Fixed-cohort before/after results

The immutable cohort manifest is [`fixed-cohort.json`](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/fixed-cohort.json). Its SHA-256 is `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`. The reviewed local source candidate is Git HEAD `b84ecbbd0cfff8d48a0271ca23eba21c77d2b542` plus the recorded working tree, source fingerprint `8817eb53220ad9cc518e4a4be304cff7773055687086543ea9cb1b99fe42af95`. No uncommitted overlay is represented as the clean commit.

The following table reconciles historical exported **initial** registrations. It does not pretend that an old click was rerun against today’s browser runtime. C/U/R means confirmed / unconfirmed / unresolved. The final column separately reports canonical operational confirmation (initial or terminal): verified decisions are confirmed; initially unconfirmed decisions without verified terminal proof remain unconfirmed; aborted or unavailable evidence remains unresolved. Every provider has **0.00 percentage-point change** and **zero sites with newly verified consent from the code changes**. There are no new eligibility exclusions or denominator corrections.

| Provider | Fixed clicks | Before initial C / U / R | After initial C / U / R | Initial confirmed rate, before = after | Operational C / U / R, before = after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overall | 1576 | 356 / 1218 / 2 | 356 / 1218 / 2 | 22.59% | 365 / 1209 / 2 |
| CMP identity unverified | 510 | 21 / 488 / 1 | 21 / 488 / 1 | 4.12% | 21 / 488 / 1 |
| OneTrust | 449 | 85 / 363 / 1 | 85 / 363 / 1 | 18.93% | 86 / 362 / 1 |
| Cookiebot | 129 | 119 / 10 / 0 | 119 / 10 / 0 | 92.25% | 122 / 7 / 0 |
| HubSpot Consent Banner | 87 | 7 / 80 / 0 | 7 / 80 / 0 | 8.05% | 7 / 80 / 0 |
| CookieYes | 71 | 62 / 9 / 0 | 62 / 9 / 0 | 87.32% | 62 / 9 / 0 |
| Osano | 51 | 0 / 51 / 0 | 0 / 51 / 0 | 0.00% | 0 / 51 / 0 |
| TrustArc | 42 | 1 / 41 / 0 | 1 / 41 / 0 | 2.38% | 1 / 41 / 0 |
| Termly | 33 | 23 / 10 / 0 | 23 / 10 / 0 | 69.70% | 25 / 8 / 0 |
| Consentmanager | 31 | 9 / 22 / 0 | 9 / 22 / 0 | 29.03% | 9 / 22 / 0 |
| Sourcepoint | 24 | 0 / 24 / 0 | 0 / 24 / 0 | 0.00% | 0 / 24 / 0 |
| Iubenda | 23 | 6 / 17 / 0 | 6 / 17 / 0 | 26.09% | 6 / 17 / 0 |
| Usercentrics | 21 | 0 / 21 / 0 | 0 / 21 / 0 | 0.00% | 0 / 21 / 0 |
| Cookie Information | 20 | 0 / 20 / 0 | 0 / 20 / 0 | 0.00% | 0 / 20 / 0 |
| DSGVO All in One / tarteaucitron | 15 | 0 / 15 / 0 | 0 / 15 / 0 | 0.00% | 0 / 15 / 0 |
| CookieScript | 10 | 0 / 10 / 0 | 0 / 10 / 0 | 0.00% | 0 / 10 / 0 |
| Didomi | 8 | 4 / 4 / 0 | 4 / 4 / 0 | 50.00% | 5 / 3 / 0 |
| Google Funding Choices | 8 | 3 / 5 / 0 | 3 / 5 / 0 | 37.50% | 3 / 5 / 0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1 / 6 / 0 | 1 / 6 / 0 | 14.29% | 1 / 6 / 0 |
| Condé Nast Privacy Runtime | 6 | 6 / 0 / 0 | 6 / 0 / 0 | 100.00% | 6 / 0 / 0 |
| VWO consent state | 6 | 2 / 4 / 0 | 2 / 4 / 0 | 33.33% | 2 / 4 / 0 |
| InMobi Choice CMP | 5 | 3 / 2 / 0 | 3 / 2 / 0 | 60.00% | 3 / 2 / 0 |
| Orejime | 4 | 0 / 4 / 0 | 0 / 4 / 0 | 0.00% | 0 / 4 / 0 |
| Transcend | 4 | 3 / 1 / 0 | 3 / 1 / 0 | 75.00% | 3 / 1 / 0 |
| Borlabs Cookie | 3 | 1 / 2 / 0 | 1 / 2 / 0 | 33.33% | 3 / 0 / 0 |
| DataGrail | 3 | 0 / 3 / 0 | 0 / 3 / 0 | 0.00% | 0 / 3 / 0 |
| Ketch | 3 | 0 / 3 / 0 | 0 / 3 / 0 | 0.00% | 0 / 3 / 0 |
| Fides | 2 | 0 / 2 / 0 | 0 / 2 / 0 | 0.00% | 0 / 2 / 0 |
| Axeptio | 1 | 0 / 1 / 0 | 0 / 1 / 0 | 0.00% | 0 / 1 / 0 |

The same fixed 1,576 completed-export rows have 365 operationally verified decisions, 1,209 unconfirmed and 2 unresolved outcomes. These counts are identical under clean and current source. Raw `decisionVerified` values are separately 365 true / 1,211 false / 0 unknown; false does not silently reclassify an aborted action as unconfirmed. The cohort retains 9 verified terminal proofs, of which 9 supply confirmation without an initially confirmed registration. Newly retrieved historical terminal proof is a coverage correction to our analysis, not a fresh consent registration or an improvement caused by this candidate.

The original packet replay and recovered coverage supplement were independently compared from clean/current sources, action by action. **All 1,466 original and 1,334 supplemental rows have identical registration, operational-confirmation, terminal-evidence and attribution outcomes.** The supplement increases packet coverage for the same fixed export cohort from 242 to 1,576 rows; 0 remain without a verified original packet. Every cohort row remains in the denominator. See [coverage provenance](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/archive-recovery-completion.json).

Remote recovery verified all 1,274 requested original objects (222,364,081 bytes) against retained hashes and sizes from 813 source scans, each with exactly one original result event. All eight read-only metadata tasks closed; database writes and public-site visits remained zero. Source receipts and transient transport attempts remain retained separately.

The 1,334 supplemental action packets span 852 sites: 306 actions were already initially confirmed, 1,028 initially unconfirmed, and 0 have other retained initial states. They contain 8 verified terminal decisions. **Recovered evidence improves analysis and attribution; it creates no new runtime confirmations and rewrites no historical report.**

Against the preserved [original-stratum-only classification](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/full-unresolved-current/failures.json), recovered evidence supplies a specific blocker or already-retained terminal outcome for 41 actions across 38 sites previously limited by historical schema. It also supplies action-bound provider identity for 535 previously export-only nonconfirmed actions across 337 sites. These counts describe investigation coverage; zero sites gain a newly confirmed consent decision from the code changes.

| Packet stratum / action-bound provider | Attempts | Initial C / U / other, before = after | Operational confirmations, before → after |
| --- | ---: | ---: | ---: |
| Original: Overall | 1466 | 51 / 202 / 1213 | 52 → 52 |
| Original: CMP identity unverified | 1307 | 7 / 89 / 1211 | 7 → 7 |
| Original: OneTrust | 79 | 8 / 69 / 2 | 8 → 8 |
| Original: Cookiebot | 14 | 13 / 1 / 0 | 14 → 14 |
| Original: CookieYes | 11 | 10 / 1 / 0 | 10 → 10 |
| Original: Termly | 9 | 9 / 0 / 0 | 9 → 9 |
| Original: CookieScript | 3 | 0 / 3 / 0 | 0 → 0 |
| Original: Consentmanager | 11 | 2 / 9 / 0 | 2 → 2 |
| Original: HubSpot Consent Banner | 9 | 0 / 9 / 0 | 0 → 0 |
| Original: DSGVO All in One / tarteaucitron | 2 | 0 / 2 / 0 | 0 → 0 |
| Original: Iubenda | 8 | 0 / 8 / 0 | 0 → 0 |
| Original: Cookie Information | 6 | 0 / 6 / 0 | 0 → 0 |
| Original: Osano | 5 | 0 / 5 / 0 | 0 → 0 |
| Original: Quantcast Choice | 1 | 1 / 0 / 0 | 1 → 1 |
| Original: Drupal EU Cookie Compliance module, non-TCF | 1 | 1 / 0 / 0 | 1 → 1 |
| Supplement: Overall | 1334 | 306 / 1028 / 0 | 314 → 314 |
| Supplement: OneTrust | 373 | 72 / 301 / 0 | 73 → 73 |
| Supplement: Osano | 44 | 0 / 44 / 0 | 0 → 0 |
| Supplement: CookieYes | 68 | 56 / 12 / 0 | 56 → 56 |
| Supplement: CMP identity unverified | 533 | 40 / 493 / 0 | 40 → 40 |
| Supplement: CookieScript | 7 | 0 / 7 / 0 | 0 → 0 |
| Supplement: Cookiebot | 97 | 93 / 4 / 0 | 95 → 95 |
| Supplement: Consentmanager | 23 | 7 / 16 / 0 | 7 → 7 |
| Supplement: HubSpot Consent Banner | 34 | 0 / 34 / 0 | 0 → 0 |
| Supplement: Borlabs Cookie | 3 | 1 / 2 / 0 | 3 → 3 |
| Supplement: TrustArc | 36 | 0 / 36 / 0 | 0 → 0 |
| Supplement: Didomi | 8 | 4 / 4 / 0 | 5 → 5 |
| Supplement: Usercentrics | 19 | 0 / 19 / 0 | 0 → 0 |
| Supplement: Termly | 26 | 16 / 10 / 0 | 18 → 18 |
| Supplement: DSGVO All in One / tarteaucitron | 13 | 0 / 13 / 0 | 0 → 0 |
| Supplement: Drupal EU Cookie Compliance module, non-TCF | 6 | 0 / 6 / 0 | 0 → 0 |
| Supplement: Cookie Information | 11 | 0 / 11 / 0 | 0 → 0 |
| Supplement: Quantcast Choice | 2 | 2 / 0 / 0 | 2 → 2 |
| Supplement: Transcend | 3 | 3 / 0 / 0 | 3 → 3 |
| Supplement: Orejime | 4 | 0 / 4 / 0 | 0 → 0 |
| Supplement: Iubenda | 13 | 6 / 7 / 0 | 6 → 6 |
| Supplement: Fides | 8 | 6 / 2 / 0 | 6 → 6 |
| Supplement: DataGrail | 3 | 0 / 3 / 0 | 0 → 0 |

Operational percentage-point changes are zero for every row. “Other” includes not-attempted and aborted packets and is not a successful-click denominator. Provider attribution remains unknown where the original action-control proof does not identify it. The full [before/after packet comparison](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/after-all-retained/audit.json) records both denominators, rates and all source references.

## Ranked unresolved evidence

Every one of the **1,220 historical nonconfirmed rows** has an exclusive earliest supported blocker or retained terminal outcome, with secondary reasons preserved. Of these, 1,220 have original packets (192 in the original stratum, 1,028 in the supplement); 0 remain export-only. “Earliest” follows verification prerequisites, not guessed event chronology. A later terminal reason does not inherit an earlier SDK failure that recovered. Historical coarse reasons stay coarse.

| Earliest supported blocker or retained outcome | Actions |
| --- | ---: |
| historical schema limitations | 1088 |
| insufficient or unavailable evidence | 48 |
| category applicability | 41 |
| capture or sdk readiness | 22 |
| confirmed | 9 |
| receipt missing or unsupported | 8 |
| source session target binding | 4 |

The 9 `confirmed` rows are previously retained terminal decisions, not recoveries in this task. Exported initial registrations remain unchanged. A completed-click cohort cannot measure pre-click control-resolution losses; the separate 76-contact cohort supplies that exposure.

The leading provider/reason groups are below. The [complete ranked provider table](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/full-unresolved-all-retained/provider-failures.csv) includes every group, distinct sites, original hashes, representative evidence and secondary reasons. The [row-level classification](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/full-unresolved-all-retained/failures.json) retains all 1,220 rows.

| Historical provider | First supported blocker | Actions | Sites | Representative retained evidence | Future investigation exposure ceiling |
| --- | --- | ---: | ---: | --- | ---: |
| CMP identity unverified | historical schema limitations | 451 | 312 | [hachettebookgroup.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/a6341fb2-c596-4681-bc9f-7b7593cc5f2b/PostAcceptEvidencePacket.json) | 451 |
| OneTrust | historical schema limitations | 317 | 226 | [northwesternmutual.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/0119e93a-649a-4d5c-85bc-8049b827e6a0/PostAcceptEvidencePacket.json) | 317 |
| HubSpot Consent Banner | historical schema limitations | 69 | 48 | [iion.io accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/e8507f8c-3115-4393-8fda-78b2e9edfc0b/PostAcceptEvidencePacket.json) | 69 |
| Osano | historical schema limitations | 47 | 27 | [e2open.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/a197472d-d98d-4979-bbea-122fa391f353/PostAcceptEvidencePacket.json) | 47 |
| OneTrust | category applicability | 40 | 40 | [clearme.com reject](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/0a851176-c105-418d-886a-1e3284624e78/PostRefusalEvidencePacket.json) | 40 |
| TrustArc | historical schema limitations | 40 | 26 | [tinymce.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/554f14c5-771b-4f28-8bba-a823eb797c86/PostAcceptEvidencePacket.json) | 40 |
| CMP identity unverified | insufficient or unavailable evidence | 35 | 35 | [ovh.co.uk reject](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/ed545f73-92c5-4b9f-a4f6-a62e24168842/PostRefusalEvidencePacket.json) | 35 |
| Sourcepoint | historical schema limitations | 23 | 22 | [der-postillon.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/3bf65079-1ea7-4189-88e5-3282dca8d401/PostAcceptEvidencePacket.json) | 23 |
| Usercentrics | historical schema limitations | 21 | 13 | [kfw.de accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/0e7dc3db-5370-49d4-9d1e-512863142187/PostAcceptEvidencePacket.json) | 21 |
| Consentmanager | historical schema limitations | 19 | 14 | [dpdgroup.co.uk accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/f34721f0-0f18-41b3-9234-7334bad68faf/PostAcceptEvidencePacket.json) | 19 |
| Cookie Information | historical schema limitations | 16 | 12 | [wannafind.dk accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/0557fa3f-f255-49f0-80f6-03566f4b8c1c/PostAcceptEvidencePacket.json) | 16 |
| Iubenda | historical schema limitations | 14 | 11 | [huffingtonpost.it accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/84f5ff57-0942-4b0e-90e3-6230cc5e88a4/PostAcceptEvidencePacket.json) | 14 |
| DSGVO All in One / tarteaucitron | historical schema limitations | 13 | 7 | [lassuranceretraite.fr accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/a439b865-2ca4-4aaf-abd9-c139ecec51ad/PostAcceptEvidencePacket.json) | 13 |
| CookieYes | historical schema limitations | 8 | 8 | [hashthemes.com accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/962a7b0c-b091-4adc-a107-93e50fe3e0cd/PostAcceptEvidencePacket.json) | 8 |
| HubSpot Consent Banner | insufficient or unavailable evidence | 8 | 8 | [daily.co reject](/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261023T184455Z-manual-307d8d57/scans/b05a1209-7047-4e51-a1c3-d9cc6f491697/evidence/0/PostRefusalEvidencePacket.json) | 8 |
| Termly | historical schema limitations | 8 | 8 | [lincoln.ac.uk accept](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/remote-original-packets/packets/1b2b7329-2883-496e-afa8-1d48b2b33721/PostAcceptEvidencePacket.json) | 8 |

**Packet-only replay recovery bound: 0–0 additional confirmations for this fixed evidence.** Future exposure ceilings count rows that could merit investigation; they are not predicted recoveries, do not establish a scanner defect, and must not be added across overlapping reasons. Expected recovered confirmations remain unknown. Source review can improve recognition/applicability for future capture without manufacturing a historical receipt. Notification acknowledgments and positively inapplicable optional-category decisions have no implied confirmation-recovery target.

The separate [reference/candidate stage report](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/stages-current/stage-report.html) and [complete packet failure report](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/packet-failures-current/provider-failures.html) preserve selected runtime arms, follow-ups and historical strata separately. In the older candidate, the top three exclusive groups remain 32 control / 19 category / 7 receipt actions; none is silently excluded because a later selected visit succeeded.
<!-- generated-results-end -->

## Validation and improvement claims

The original revision incorrectly confirmed all seven negative loopback cases
covering missing saved events, wrong-document events and changed category
configuration. The candidate rejects those cases while valid saved decisions
still confirm. Source hashes, the original-revision reproduction and fixture
results are retained in the
[API validation record](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/validation/cmp-api-validation.json).
These are evidence-safety corrections in existing typed API paths, not public
site recoveries.

An independent 23,040-case comparison found identical Reject eligibility and
only the intended stricter Accept behavior. Cookiebot and CookieYes use
unmodified cookie/TCF branches. Termly's actual configuration-free snapshots
retain the previous API eligibility. The
[independent review](/Users/benmasek/WC01/artifacts/cmp-reliability-2026-10-29/api-gate-independent-review.json)
records those boundaries.

- Canonical consent regression gate: **703 passed, zero failed**.
- Full contracts suite: **846 passed, zero failed**.
- Final audit/stage/release-selection tests: **38 passed**, including supplement
  provenance, missing/wrong-session evidence and complete packet comparisons.
- Canonical scoring and consent projection tests: **40 passed**.
- Contracts, scan-core and validation-worker typechecks passed.
- Focused API suite: 118 passed; these overlap the canonical gate and are not
  added to its count.

The full contracts command was rerun successfully from its canonical package
working directory with required local IPC access after an initial root-directory
invocation could not find package fixtures. No failing product test was waived.

No new public rescan was selected: the newly found eligibility and diagnostic
defects have exact loopback reproductions; a fresh public click cannot recover
the old missing receipts or identify their original failure gate. Earlier
selected live results remain separate from this retained replay. No consumed
Gimbal grant, contact hold, cooldown or other live safety boundary was overridden.

## Next decision and diminishing returns

The next highest-return evidence is ordinary candidate capture from the intended
worker environment, especially OneTrust source/category readiness and shared
control completion. Before any separately authorized rollout, run the exact
coupled AWS release preflight and a small eligibility-selected validation cohort
with fixed denominators and explicit stop conditions. Stop each action at its
existing deadline; do not retry failures, open Options, widen scope or increase
budgets to obtain confirmation.

Further packet-only replay has diminishing returns once all available proofs
and historical schemas have been checked: hashes cannot reveal receipt values,
saved events or category applicability. Additional broad marker expansion also
has weak return when only generic styling or ambiguous containers remain. Prior
recognition review identified at most 20 specific remaining candidate actions
across 15 sites, requiring stronger upstream markers; attribution is separate
from action verification. Prefer precise surviving failure reasons from ordinary
evidence before adding adapters, source pins or more capture work.

The implementation is locally validated; the quantitative reliability-uplift
claim remains **unverified**. The full coupled application build/deployment
preflight and ordinary production verification are not claimed by these local
checks. There is no release authorization in this assessment.
