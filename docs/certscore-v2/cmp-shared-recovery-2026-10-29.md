# CertScore.ai shared CMP recovery assessment — October 29, 2026

## Decision and measured result

**Hold the reliability rollout.** Local implementation is ready for review, but the public confirmation goal is not met. The fixed six-site paired campaign completed all 24 planned contacts. On the unchanged 12-contact denominator per build, completed paths increased **5→6 (41.67%→50.00%, +8.33 percentage points)**, while confirmations stayed **4→4 (33.33%→33.33%, 0.00 points)**. Confirmation among completed paths fell **80.00%→66.67%**; this changing-denominator measure is reported separately and is not an improvement.

There were two sites with completion gains (OneBit and WPOnetap), one with a completion loss (MyRealPage), one with a confirmation gain (WPOnetap), and one with a confirmation loss (MyRealPage). These are observed paired differences on separate fresh visits, not proof that code alone caused each change or a statistically established population lift. No ordinary production improvement is claimed. No deployment, flags, historical rewrite, new worker, larger scan window, model call, public retry or replacement occurred.

The subsequent Osano decoder repair was validated separately on owned loopback cases. It was **not in the public-tested candidate**, and its two confirmations must not be pooled into the public result.

## Shared changes and prioritization

The prior retained runtime campaigns exposed these ranked groups. Counts preserve separate reference/candidate attempts and overlap in distinct sites between groups; they are exposure, not predicted recoveries. See [the complete ranked evidence](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/ranked-retained-losses.json), with original packet references and hashes.

| Shared blocker / action-bound attribution | Actions | Sites | Addressable interpretation |
| --- | ---: | ---: | --- |
| Control readiness/resolution / identity unverified | 50 | 20 | Largest group; recover only positively present, correctly labelled unique controls. Missing controls cannot be invented. |
| Missing/unsupported state proof / identity unverified | 15 | 7 | Existing packets cannot manufacture a decision; needs a supported fresh protocol where one exists. |
| Receipt/state/source proof / OneTrust | 12 | 5 | Preserve prior category/source repairs; pre-native-commit source timing remains unresolved. |
| Semantic control veto / OneTrust | 4 | 2 | Two Billtrust attempts already covered by the previous fix; two Udacity attempts expose the short necessary-only label. |
| Receipt/state proof / Termly | 2 | 1 | Existing adapter retained; no new unsupported inference. |
| Receipt/state proof / HubSpot | 2 | 1 | Existing complete-category/listener repair retained. |
| Semantic control veto / CookieYes | 2 | 1 | Exact Portuguese category-negation false veto repaired canonically. |

The batch addresses three reusable causes:

1. **Loading readiness:** both observers can probe an unchanged, registered native first-layer recipe during the same document-ready wait. Eligibility is checked against the complete canonical recipe, with one positively runtime-matched provider. Existing identity, exact target, main-document scope, unique visible enabled control, current label, hit-target and semantic receipt requirements still apply. Framed/custom/accessible-control and pre-action recipes remain excluded. Every probe shares the original search deadline; nothing restarts it. The exposure inventory finds 18 non-OneTrust failed attempts with relevant Osano/HubSpot/Cookiebot/Google Funding Choices markers while loading, across seven distinct sites; markers alone prove neither a control nor recovery. [Loading exposure](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/loading-exposure.json).
2. **Canonical label interpretation:** classifier v24 admits the exact contextual English `Accept Only Required` and the Portuguese category phrase `cookies não-necessários` (including bounded spelling variants). Independent negation, non-consent suffixes, information-only and conflicting labels remain guarded. This targets four retained attempts on two sites, not four newly confirmed actions. Previously fixed `Not Essential` cases are not counted as new work.
3. **Unsupported receipt shape:** after the public campaign, the existing Osano decoder gained support for the documented `OPT_OUT` spelling alongside `OPT-OUT`. Exactly one spelling is required. All six categories remain mandatory and typed; both spellings, unknown fields, malformed values, missing categories, event/readback disagreement and TCF scope still fail closed. IAB storage/opt-out values remain separate from the three optional consent purposes. Osano's official [GPC guide](https://docs.osano.com/en-US/osano/article/Hk-0Dnay-global-privacy-control-gpc) documents the underscore getter shape; its [API documentation](https://developers.osano.com/cmp/javascript-api/developer-documentation-consent-javascript-api) also documents the hyphen form and mandatory fields. Optionalizing those fields was investigated and rejected because the API contract says they remain present.

A release-gate failure additionally exposed a proof deadline race. The shared control-proof helper now makes timeout/abort sticky, preventing late label/uniqueness diagnostics or proof work after the caller has stopped. A frozen-clock regression demonstrates the failure before and safety after. This is a safety repair, not a counted completion gain.

## Public paired validation

The hypothesis was that registered loading controls and corrected labels recover actions within unchanged budgets. The fixed stopping condition was 24 slots, concurrency one, no tuning/retries/replacements, and same-domain no-go stop. Both arms used one fresh context and at most one authorized first-layer action per slot. No no-go occurred; all 24 slots contacted their targets. Six sites are a diagnostic sample, not the program's broader release acceptance sample.

Before any contacts, the initial completed-click-only pool was expanded with ten historical HubSpot failure targets, avoiding survivorship bias in a completion study. All original URL/export hashes were verified. The revised frozen cohort replaced the uncontacted proposal before outcomes existed; the old proposal has zero claims/visits and remains preserved. Fresh successful central all-channel exports, the registry check and canonical selector admitted the final targets without holds/cooldown overrides. No contacted target was replaced.

| Frozen historical stratum | Contacts each | Completed before→after | Confirmed before→after | Completed-unconfirmed before→after | Not completed before→after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cookiebot | 4 | 3→3 | 2→2 | 1→1 | 1→1 |
| HubSpot Consent Banner | 4 | 2→2 | 2→1 | 0→1 | 2→2 |
| CookieYes | 2 | 0→1 | 0→1 | 0→0 | 2→1 |
| Osano | 2 | 0→0 | 0→0 | 0→0 | 2→2 |
| **Overall** | **12** | **5→6** | **4→4** | **1→2** | **7→6** |

No completed row is unresolved in either arm. The seven/six not-completed rows remain in the planned/contacted denominators. All four confirmations in each arm are initial choice registration; terminal-only confirmations and notification acknowledgments are zero. Action-bound provider verification remains 5→5, while resolved controls and completed observations increase 5→6. OneBit's gained generic Czech Accept has **unverified CMP identity**, despite its historical HubSpot stratum; it is not a newly verified HubSpot action. Unverified identity does not establish that no CMP exists. There is no attribution-only gain in the measured outcome.

Representative evidence, each verified by the unchanged native and common projectors:

- [04-wponetap.com-accept-reference](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/04-wponetap.com-accept-reference/PostAcceptEvidencePacket.json): `not_completed`; packet SHA-256 `c603f430b8e468bd73896538a56a588c1d2a4fe3ec4268d12857f8d1e0153bb7`.
- [04-wponetap.com-accept-candidate](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/04-wponetap.com-accept-candidate/PostAcceptEvidencePacket.json): `consent_decision_confirmed`; packet SHA-256 `e8c50143afba37b22b400439c5bc09605fec8218547fb51767c776093227800f`.
- [00-myrealpage.com-accept-reference](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/00-myrealpage.com-accept-reference/PostAcceptEvidencePacket.json): `consent_decision_confirmed`; packet SHA-256 `cba75a96474014c07edf543813e1ab4c767578832a8d04958c42f953174751b9`.
- [00-myrealpage.com-accept-candidate](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/00-myrealpage.com-accept-candidate/PostAcceptEvidencePacket.json): `not_completed`; packet SHA-256 `94018d744de8c657266ce14bb7c578dee813e79dace81d0c865b95a427a7e142`.
- [01-onebit.cz-accept-candidate](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/01-onebit.cz-accept-candidate/PostAcceptEvidencePacket.json): `completed_unconfirmed`; packet SHA-256 `d07597e8cd5d311699f0ba8b7a6a89da5fd80f6ceaa1b8a32c759cd4c032ae8c`.
- [02-d-id.com-accept-candidate](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/run/visits/02-d-id.com-accept-candidate/PostAcceptEvidencePacket.json): `completed_unconfirmed`; packet SHA-256 `c8959c8246ded2b19a2a3616083f209feacf6b5799d2163a10880ff00e4140a2`.

WPOnetap candidate retained a current registered CookieYes control and a verified corresponding decision. MyRealPage candidate retained no actionable Accept control before the original search deadline; its reference confirmed. Site/runtime variation remains possible; the packet does not establish a new regression's cause. OneBit completed the generic control and observation with no registered complete decision. D-ID completed Cookiebot Accept in both arms but lacked the required receipt in both initial and terminal reads. Banner disappearance was never used as confirmation.

Across the two arms, every one of the 16 remaining non-confirmed rows is retained in [remaining-losses.json](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/remaining-losses.json), with earliest blocker and additional snapshots/reasons: **13 control-resolution/readiness failures across five sites, two missing-receipt paths on D-ID, and one unsupported/missing decision protocol on OneBit**. Native/common disagreements and evidence issues are zero. [Canonical paired comparison](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/analysis/run-1/comparison.json).

All 24 actual contacts were persisted centrally under `cmp-shared-recovery-failures-live-20261029.v1`; the reviewed repository cooldown ledger was committed locally as `e6cd9862a`. No push or deployment occurred. The artifact conversion helper's initial relative-import error occurred after scanning and before conversion/persistence; fixing that import triggered no additional contacts. [Contact provenance](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/live-v2/contact-provenance.json).

## Controlled runtime measurement

The owned parser-blocked corpus uses actual Chromium, fresh contexts, canonical recipes and canonical retained projectors, rather than asserting only helper return values. On the same 18 cases, before loading/label repairs there were **0 completed and 0 confirmed**; afterward **10 completed and 8 confirmed**. Eight wrong-label cases still perform zero clicks; both receipt-negative cases complete without confirmation. The parser stays blocked for 2,500 ms inside a 1,000 ms search; this deliberately isolates the readiness defect and is not a representative website sample. [Measured cases and packet hashes](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/owned-measurement.json).

The later Osano alternate-key corpus isolates two actions under the same readiness-capable frozen pre-fix and post-fix builds. **Completion is 2→2; confirmation is 0→2**, a 100-point improvement on these two deliberately targeted cases. Four original packets were retained, independently SHA/size checked and reprojected through the canonical contracts; no synthetic receipt was added to a retained scan. [Verified before/after evidence](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/osano-followup/verified-measurement.json). The broader owned suite also preserves missing receipts, opposite decisions, information-only controls and malformed category negatives. The existing full gate covers historical schemas, wrong session/target/document, contradictory signals, notification-only controls and inapplicable categories.

These are functional recoveries, not replay or public production confirmations. The two owned cohorts and the public campaign use different builds and are reported separately.

## Full retained benchmark

The final build replayed the fixed cohort SHA-256 `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`: **5,026 preserved exports, 10,052 action rows, 1,576 completed clicks and all 2,800 packets** (1,466 original plus 1,334 supplemental). Every completed row joins verified original evidence. All three comparison change arrays are empty; eligibility corrections, denominator changes and newly confirmed sites are zero. [Final replay](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/osano-followup/retained/audit.json).

Historical initial registration remains **356/1,576 (22.5888%)**, with **1,218 unconfirmed and two aborted/unresolved**. Operational confirmation including nine already-retained terminal decisions remains **365/1,576 (23.1599%)**, with **1,209 unconfirmed and two unresolved**. Those nine are not candidate gains. OneTrust's historical 449 actions reconcile to **85 confirmed + 363 unconfirmed + one aborted**; the remaining action is colocrossing.com Accept, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, whose bounded observation was truncated. Operationally OneTrust remains 86/362/1.

The table includes all providers. C/U/R means confirmed/unconfirmed/unresolved. Both displayed triplets are unchanged before→after; every provider's change is **0.00 percentage points and zero newly confirmed sites**. Capture-time readiness and unsupported original raw state cannot be reconstructed from these packets. No historical export or packet was rewritten.

| Provider | Completed-click denominator | Initial C/U/R before = after | Operational C/U/R before = after |
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

Cookiebot (122/129 operational), CookieYes (62/71) and Termly (25/33) are unchanged and pass the replay regressions. The full historical baseline reconciliation and identification of the October 28 source overlays remain in the [earlier assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-action-confirmation-reliability-2026-10-29.md); Git HEAD alone did not identify that benchmark's candidate. The immediate reference here already contains the separate [OneTrust source-order repair](/Users/benmasek/WC01/docs/certscore-v2/cmp-source-order-repair-2026-10-29.md). Its controlled proof is not counted again as a new gain in this batch.

## Validation and build identity

Final **846/846 consent regressions**, **851/851 contract tests**, **40/40 canonical scoring/projection regressions**, and **15/15 release-selection checks** passed. The final Osano/owned focused run passed **30/30**. Contract and scan-core typechecks, scan-core build, and review-engine build passed. Contract/scoring/release-selection checks preceded the isolated decoder follow-up; their source did not change afterward. The final consent gate and scan-core typecheck/build include that repair. [Full consent gate](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/osano-followup/full-consent.log) · [Typecheck](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/osano-followup/typecheck.log) · [Build](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/osano-followup/build.log).

The first release gate failed one late proof-deadline callback test; the sticky-stop repair and deterministic regression close it. Original failed logs remain preserved. A first Osano test invocation was blocked before tests by the sandbox's tsx IPC listener; the actual Node-import/Chromium baseline then reproduced the decoder defect. No safety failure was hidden or used to drop a benchmark row.

| Build | Source fingerprint | Compiled fingerprint |
| --- | --- | --- |
| Immediate reference | `39f8a4379c233e29d66585f52f1fff7088122e3ead5b5399831c42515a30a036` | `1e3ea2b184b99e104ebe09b3f7337e71ed8aaf9e2c19499776841f1633cfb74b` |
| Public-tested candidate | `fabec92403b9dd772f5e0f00b549262bafe900604c704fab3ba1044d82acde4a` | `ab7b051b994a21bc505ba3805a2bb5c103f2ebfdd2951b2191ccfdd09eed681f` |
| Final local candidate; includes later Osano repair | `552d5dbbfec95e4eccca13d59fa077258bdfefaa916ce83b8692d14730ebe50e` | `feeb44ff12470cc98bc2eecc3f2f92b39eb835904ba3b921c5b8766d75212a23` |

All three frozen builds were re-inventoried without drift. The live campaign plan binds the original source/build identities, Node 22.22.1, pnpm 10.6.3, Playwright 1.58.2 and Chromium 1208. Metadata Git HEAD after the cooldown commit is `e6cd9862a`; source/build fingerprints and archived overlays identify the product revisions independently. [Frozen inventory verification](/Users/benmasek/WC01/artifacts/cmp-shared-recovery-2026-10-29/frozen-build-verification.json).

Per-action result/search/confirmation caps remain **20,000/14,000/2,000 ms**, Accept observation **3,000 ms**, Reject observation **8,000 ms**. No SDK opening, Options/Manage, form, consent setter, broader worker or recurring campaign was introduced. New recurring infrastructure capacity/cost is $0; bounded bookkeeping is expected below $0.10/month at 100,000 scans within the standing sub-$1 allowance and existing approved observation spend. This is an engineering estimate, not measured production billing. One-time central ledger exports/persistence are estimated below $0.10 total. Local browser fixtures add no recurring AWS spend.

## Next highest-return work and diminishing returns

The next priority is the shared unresolved-control boundary: distinguish a positively present registered control whose read was delayed from a visit where no applicable control was observed. The largest remaining class is 13 of this sample's 16 non-confirmed rows. Do not solve it with guessed selectors, expanded capture windows, banner-disappearance inference or retries. Follow the existing named-control proof path and retain a bounded reason when the renderer does not return within the existing slice; availability may remain unverified.

For confirmation, support additional documented receipt forms only when complete applicable scope, freshness and the current control/session/target can all be verified. The new Osano key decoder is a concrete such repair, but its public addressable coverage is unknown because failed historical reads did not retain raw shapes. The full Osano historical 51 unconfirmed actions cannot be claimed as 51 recoveries. D-ID's missing Cookiebot receipt and OneBit's absent registered protocol need discriminating capture before a supported fix can be justified.

OneTrust source requests arriving before the native commit notification remain conservatively invalidated; safe recovery needs positive native frame/loader/request ancestry, never URL equality alone. The prior Telefónica packet does not establish that ordering as its cause. No new OneTrust public gain was demonstrated by this batch, and no Gimbal/ReadCube hold was reopened.

More retained replay has diminishing returns when the needed control, receipt shape or native lifecycle order was never retained. Repeated visits to the same site have diminishing returns after a no-go or unresolved runtime variation and would violate cooldowns. The fixed public campaign has stopped at 24 contacts; no extension is hidden in these results. Further measurement should follow one discriminating, evidence-backed hypothesis on a separately frozen, canonically eligible cohort. Broader rollout remains held until a stable candidate demonstrates a net confirmation gain alongside completion, without regressing the existing providers, and ordinary production evidence later verifies the effect.
