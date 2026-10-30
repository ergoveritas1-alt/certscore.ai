# CertScore.ai retained receipt investigation — October 29, 2026

## Outcome

**No defensible receipt recovery was found, so no production adapter or proof requirement was changed.** The requested decoder fix could not be justified by the retained evidence. This investigation and the full benchmark rerun are complete; the requested confirmation improvement is not achieved. No fixture-only change is presented as a recovered historical action.

The fresh full benchmark remains **356 initially confirmed / 1,218 unconfirmed / two aborted-unresolved**, out of the unchanged **1,576 completed-click rows**. Including existing terminal decisions gives **365 confirmations (23.1599%)**; verified click-plus-observation paths remain **1,561**. Confirmation and completion changes are **0.00 percentage points**, with **zero newly helped sites**. Release remains held. No live scans, deployment, flag changes, new SDK calls, added capture, budget increase or historical rewrite occurred.

## What was inspected

The fixed archive contains 5,026 exports / 10,052 action rows and 2,800 retained packets (1,466 original inventory plus 1,334 coverage supplement). All 1,576 completed-click rows have original packet proof. The fixed cohort SHA remains `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`.

I rehashed and inspected all **1,211 operationally unconfirmed/unresolved clicked rows**, separating the nine already-retained terminal confirmations from the initial nonconfirmed population. Every remaining row has `decision: unknown`, `basis: unverified`, zero registration witnesses and no terminal decision proof. Those facts alone do not establish permanent failure or prove that every possible future decoder is impossible; they establish that these packets do not already contain a verified decision awaiting projection. [Historical evidence inventory](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/historical-unconfirmed-inventory.json).

The previous earliest-blocker census identifies **eight direct receipt-format/availability candidates on eight sites**. I inspected their original storage snapshots, writes, decision fields, source pointers and available network metadata. None retains a raw storage value, raw cookie assignment or decision witness that would establish a supported complete, fresh, action-bound receipt. Hashes and endpoint success cannot supply its missing semantics.

I also inspected **228 existing contact records** in the October 29 CMP artifact directories: **226 packets with matching recorded SHA/size**, plus **two missing/unverified typed-packet results kept separately**. The existing per-visit results identify **167 packets without verified confirmation**. These are multiple prior campaigns and revisions, not a new paired cohort or a population-rate denominator. No public contact was made during this investigation. [Ranked receipt candidates, source hashes and unavailable rows](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/receipt-candidate-ranking.json).

## Ranked receipt candidates and disposition

Historical providers below are starting-page export attribution. They do not automatically verify the action-session CMP: positivepsychology.com's historical HubSpot attribution, for example, is separate from its Consentmanager action recipe.

| Fixed historical provider / reason | Actions | Distinct sites | Evidence retained | Demonstrated recoverable confirmations |
| --- | ---: | ---: | --- | ---: |
| Consentmanager / receipt unsupported or missing | 3 | 3 | easyname.com, qualitymedianetwork.de, ebth.com: hash snapshots, diagnostics and network metadata; no raw receipt/category proof | 0 |
| Iubenda / receipt unsupported or missing | 3 | 3 | avo.app, metricool.com, iltirreno.it: hash snapshots and request metadata; no complete fresh receipt value/state proof | 0 |
| HubSpot historical attribution / receipt unsupported or missing | 1 | 1 | positivepsychology.com: Consentmanager action recipe; no verified decision witness | 0 |
| TrustArc historical attribution / receipt unsupported | 1 | 1 | assurant.com: custom canonical Reject control; no verified complete decision receipt | 0 |

The first two groups tie for the largest direct receipt-format exposure. Neither provides a failing decoder input that can be repaired and independently reverified under the unchanged proof requirements. Domain-specific acceptance or treating an opaque receipt as a complete refusal would manufacture the requested gain.

The larger historical groups remain distinct: **1,088/1,220 initially nonconfirmed rows** were classified under historical schema limitations, while **40 OneTrust rows** had category-applicability blockers. Their size does not make them receipt-decoder recoveries. Missing configuration, category universe, source/session proof and fresh writes cannot be reconstructed from receipt hashes.

The newer retained records expose the following overlapping candidate groups. Counts are investigation coverage across past contacts, kept separate from the fixed historical benchmark:

| Reason | Packet observations | Sites | Specific remaining gap |
| --- | ---: | ---: | --- |
| No fresh decision | 18 | 10 | An unchanged getter/state or missing fresh event is insufficient. |
| Incomplete category universe | 12 | 5 | No retained complete applicable scope that safely overrides the limitation. |
| Unsupported receipt format | 3 | 2 | Roboflow Accept/Reject and TU Darmstadt Accept retain no decodable raw receipt or complete typed decision witness. |
| Missing receipt | 3 | 2 | D-ID Accept in both prior arms; Netspark Accept candidate. No receipt can be created from banner disappearance. |
| Unverified saved event | 2 | 1 | OrangeLogic Reject in both prior arms; an action-bound fresh saved event is absent. |

The two missing/unverified typed results are preserved: the earlier Coca-Cola visitor failed before its canonical hash receipt despite a packet file existing, and Netspark Reject failed during packet construction. Neither is silently removed, labeled as an unsupported CMP, or claimed as a receipt recovery. The latter's clock-consistency defect was already repaired in the preceding audit; this investigation does not count it again.

## Discriminating trace checks

Bonfire Accept's retained Termly trace has the **same baseline and snapshot state hash**, event sequence **zero**, and no event timestamp throughout the recorded checks. Its all-granted getter is preexisting state, not fresh registration. Sered's retained traces likewise distinguish static getter evidence from a fresh event; only already-confirmed observations with fresh proof remain confirmed.

A read-only replay of **four recorded Termly comparison groups** matches the existing shared eligibility gate exactly. Hash equality is used only to reproduce its unchanged-state comparison. This diagnostic replay supplies no raw receipt and creates no canonical decision evidence. Trace scan IDs and packet hashes were checked against the original packets. [Trace eligibility replay](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/trace-eligibility-replay.json).

Netspark Accept's original `receipt_missing` result is also consistent with its trace: the Cookiebot receipt request had been released but no response was retained by capture end. Bonfire's Termly request was still pending guard validation. These are different transport stages. Neither justifies accepting an absent receipt, adding time, bypassing network checks or inventing a common decoder bug. The [previous retained evidence review](/Users/benmasek/WC01/artifacts/cmp-navigation-receipts-2026-10-29/holdout-evidence-review.json) remains unchanged.

## Full benchmark rerun

The canonical full audit rehashed and replayed **all 2,800 original/supplemental packets**, reconciled all 5,026 exports and retained every fixed row. Comparison against the preceding retained-only audit has **zero initial, terminal, provider-attribution or execution changes**, **zero eligibility corrections**, and **zero sites gaining or losing confirmation**. [Full benchmark output](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/retained/audit.json) · [Provider export](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/retained/providers.csv).

C/U/R below is initial confirmed / unconfirmed / aborted-unresolved. Full path means click plus completed bounded observation. Decisions include existing terminal proof. Before is the audited candidate from the preceding turn; after is this unchanged candidate freshly replayed. The per-provider completion and decision percentage-point changes are both zero.

| Provider | Fixed clicks | Initial C/U/R before→after | Full paths before→after | Decisions before→after | Decision pp | Sites helped |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Overall | 1576 | 356/1218/2→356/1218/2 | 1561→1561 | 365→365 | 0.00 | 0 |
| CMP identity unverified | 510 | 21/488/1→21/488/1 | 507→507 | 21→21 | 0.00 | 0 |
| OneTrust | 449 | 85/363/1→85/363/1 | 443→443 | 86→86 | 0.00 | 0 |
| Cookiebot | 129 | 119/10/0→119/10/0 | 129→129 | 122→122 | 0.00 | 0 |
| HubSpot Consent Banner | 87 | 7/80/0→7/80/0 | 86→86 | 7→7 | 0.00 | 0 |
| CookieYes | 71 | 62/9/0→62/9/0 | 70→70 | 62→62 | 0.00 | 0 |
| Osano | 51 | 0/51/0→0/51/0 | 51→51 | 0→0 | 0.00 | 0 |
| TrustArc | 42 | 1/41/0→1/41/0 | 42→42 | 1→1 | 0.00 | 0 |
| Termly | 33 | 23/10/0→23/10/0 | 33→33 | 25→25 | 0.00 | 0 |
| Consentmanager | 31 | 9/22/0→9/22/0 | 31→31 | 9→9 | 0.00 | 0 |
| Sourcepoint | 24 | 0/24/0→0/24/0 | 24→24 | 0→0 | 0.00 | 0 |
| Iubenda | 23 | 6/17/0→6/17/0 | 23→23 | 6→6 | 0.00 | 0 |
| Usercentrics | 21 | 0/21/0→0/21/0 | 21→21 | 0→0 | 0.00 | 0 |
| Cookie Information | 20 | 0/20/0→0/20/0 | 20→20 | 0→0 | 0.00 | 0 |
| DSGVO All in One / tarteaucitron | 15 | 0/15/0→0/15/0 | 15→15 | 0→0 | 0.00 | 0 |
| CookieScript | 10 | 0/10/0→0/10/0 | 10→10 | 0→0 | 0.00 | 0 |
| Didomi | 8 | 4/4/0→4/4/0 | 7→7 | 5→5 | 0.00 | 0 |
| Google Funding Choices | 8 | 3/5/0→3/5/0 | 8→8 | 3→3 | 0.00 | 0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1/6/0→1/6/0 | 7→7 | 1→1 | 0.00 | 0 |
| Condé Nast Privacy Runtime | 6 | 6/0/0→6/0/0 | 6→6 | 6→6 | 0.00 | 0 |
| VWO consent state | 6 | 2/4/0→2/4/0 | 4→4 | 2→2 | 0.00 | 0 |
| InMobi Choice CMP | 5 | 3/2/0→3/2/0 | 5→5 | 3→3 | 0.00 | 0 |
| Orejime | 4 | 0/4/0→0/4/0 | 4→4 | 0→0 | 0.00 | 0 |
| Transcend | 4 | 3/1/0→3/1/0 | 4→4 | 3→3 | 0.00 | 0 |
| Borlabs Cookie | 3 | 1/2/0→1/2/0 | 3→3 | 3→3 | 0.00 | 0 |
| DataGrail | 3 | 0/3/0→0/3/0 | 2→2 | 0→0 | 0.00 | 0 |
| Ketch | 3 | 0/3/0→0/3/0 | 3→3 | 0→0 | 0.00 | 0 |
| Fides | 2 | 0/2/0→0/2/0 | 2→2 | 0→0 | 0.00 | 0 |
| Axeptio | 1 | 0/1/0→0/1/0 | 1→1 | 0→0 | 0.00 | 0 |

OneTrust still reconciles **449 = 85 initial confirmations + 363 unconfirmed + one aborted**. The remaining row is colocrossing.com Accept, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, with truncated observation. Its existing terminal-proof operational total remains 86 confirmed / 362 unconfirmed / one aborted. Cookiebot, CookieYes and Termly outcomes and denominators are unchanged.

Consent surface observation, CMP identity, control resolution, attempted/completed click, bounded observation, initial registration, terminal verification and notification acknowledgment remain separate. Unverified identity is not CMP absence; a completed click is not consent registration. No finding, score or historical assessment was rewritten.

## Validation and revision identity

- Fresh full retained benchmark: all packets verified; unchanged denominators and outcomes.
- **22 selected receipt-boundary tests passed**: complete/mixed/duplicate/unsupported Cookiebot and CookieYes inputs, whole-state semantics, API saved-event/configuration/session requirements and unchanged Termly state. No browser or public visit is used by this selected command. [Focused test log](/Users/benmasek/WC01/artifacts/cmp-retained-receipts-2026-10-29/receipt-boundary-tests.log).
- Four retained trace comparison groups match the current eligibility gate. The initial trace helper had an incorrect relative import path; that failed invocation is preserved, corrected and rerun successfully. This was analysis tooling only.
- The preceding **860-test consent gate, 851 contract tests, typecheck and build** remain applicable to the byte-identical runtime. They were not rerun or counted as new results here. [Prior validation provenance](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/accepted-gate-provenance.json).

Runtime source remains `3fcbd17852e13dfb7b095215de267333d02d99e301ee8607bd119c86de210cdd`; build remains `817226a229f714124d51045e0af1faf512d1fce1f5da947073c76e2590d0e229`. Git HEAD remains metadata-only `71a17244a651661a0ea4385de82bb5864529bff7`. Source/build hashes and the preceding report/artifact seal are checked again in this investigation's completion record. The canonical audit tool uses a separately scoped fingerprint in its output.

## Scope limit and next useful evidence

There is **no demonstrated recoverable confirmation loss to implement from the retained receipt candidates examined**. I therefore made no production code change. The next implementation should begin only from an existing retained raw/typed receipt or vendor writer plus complete action/session/source evidence that reproduces an incorrect adapter result. A documented format alone cannot retroactively supply missing session proof.

Once a candidate retains only hashes, absent events or incomplete applicability, more replays and speculative adapters have diminishing returns. This investigation stops at that boundary. Obtaining missing evidence would require separately authorized capture work; none was undertaken or requested here. Existing scan/action/worker/storage budgets remain unchanged, with **$0 incremental recurring AWS cost** and no paid-service or infrastructure change.
