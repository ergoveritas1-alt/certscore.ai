# CertScore.ai retained-only CMP audit — October 29, 2026

## Decision

**Keep release held. No deployment, public visit, flag change, budget increase or historical rewrite.** The cumulative runtime has been reduced: three later performance experiments were withdrawn from active source and their evidence archived. One request-clock repair survives an isolated before/after reproduction. It prevents loss of a valid retained packet; it does not establish better public control completion, consent registration or production rates.

The fixed historical result remains **356 initial confirmations / 1,576 completed clicks (22.5888%)**; including already-retained terminal proof gives **365 / 1,576 (23.1599%)**. Verified click-plus-observation paths remain **1,561 / 1,576 (99.0482%)**, conditional on the frozen completed-click cohort. This is not the completion rate for all attempted or eligible controls. Fifteen clicked paths still have incomplete observation. Every provider has **0.00 percentage-point confirmation and completion change**, with zero newly helped retained sites and zero eligibility corrections.

## Frozen reference and cumulative review

The reference is the **October 28 benchmark's candidate**, original Git base `6d5a147e51decd6451f6278d4328ae5275a9dd8b`, source/build manifest `f0b18ee9779295d51bde1952967a7afaa6eef83d7bc8b302b37c869f4463a520`. It is not that benchmark's older reference arm (`29618001…`) and is not equivalent to a checkout identified only by Git HEAD. All **1,506 originally listed source/build files** were rehashed without a mismatch. The current six-package inventory of that frozen root has source `2a849d503f474597d22687c2fcf32139622c1583d6b2d9eb9bdb7d2093a2bf84`, build `5abd341ea78891371c5de47de554935f2b1424bf796ebc9998ccf775e84f505d`; this inventory's scope differs from the original manifest. [Reference verification](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/original-reference-verification.json).

The historical 1,576-click archive spans multiple report/scanner revisions and cannot be assigned this single runtime revision. It remains a separate fixed retained-evidence benchmark.

The withdrawn cumulative overlay was frozen before any audit edit: source `6c04b2e141b01f0cdddfe4b5ca1a49388118f7611c4ae1dabc4d90b4a655285c`, build `b69a9f65a674df2d5220dd9d678e84b01caa9186b0f30072324771a1b9725ea7`. The source comparison inventories **124 changed/new files** against the frozen reference, including tests and upstream work outside this CMP experiment. Such unrelated work and canonical scoring changes were preserved. The comparison and full patches expose the cumulative changes rather than treating the immediate previous experiment as a known-good baseline. [Per-file comparison](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/cumulative-source-comparison.json) · [Cumulative CMP diff](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/reference-to-audited-cmp.patch) · [Exact audit rollback diff](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/withdrawn-to-audited.patch).

### Withdrawn experiments

| Group | Available evidence | Disposition and reason |
| --- | --- | --- |
| Parallel selector-count scheduling | Two-site pilot improved 1/4→2/4. Independent ten-site holdout improved 5/20→6/20 but paired p95 rose 2,779 ms, beyond its 2,000 ms gate; Dailysabah lost one Accept path with no retained positive selector. | Removed parallel count machinery and its experiment-only tests; restored serial resolver source. The independent rate/latency gate failed. No claim that this code caused pending scripts or the Dailysabah loss. |
| Broad registered-native priority and renderer traversal deadline | Prototype completion 5/16→5/16; confirmation 5/16→4/16. The 50 ms capture prototype failed owned counterexamples. The later absolute-deadline refinement had owned support but no accepted public rate/latency validation. | Removed broader priority and traversal changes as one dependent performance batch; retained the earlier bounded-read, sticky timeout and geometry backpressure correctness repairs. |
| Guarded navigation DNS-result reuse | Owned delayed-DNS fixture recovered paths, but only one of seven available candidate binding traces avoided a fresh lookup. Latest public records were 5/8→4/8 completion and 5/8→2/8 confirmation; the global stopping protocol was violated. | Removed peer-read reuse API, extra navigation-response/request plumbing and its experiment tests. Retained fresh public-network validation and strict native TLS. The invalid campaign cannot establish benefit or causally assign losses. |

The rollback selectively restores five files from the pre-selector `552d5dbb…` source and removes five experiment-only source/test files, plus their active gate entries and two stale compiled selector artifacts. That intermediate snapshot is a rollback boundary, **not a production-validated revision**. Strict TLS and the isolated clock repair are reapplied separately. Archived experiments are not part of the current runtime or test gate. [Withdrawal manifest](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/withdrawal-manifest.json) · [Complete withdrawn source/build and tooling archive](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/withdrawn-source-build-tools.tar.gz).

Original public tables remain available in the [selector holdout report](/Users/benmasek/WC01/docs/certscore-v2/cmp-selector-holdout-2026-10-29.md), [priority report](/Users/benmasek/WC01/docs/certscore-v2/cmp-control-priority-2026-10-29.md) and [navigation/receipt report](/Users/benmasek/WC01/docs/certscore-v2/cmp-navigation-receipt-fixes-2026-10-29.md). They concern different cohorts/builds and are not pooled. The latest invalid campaign remains closed, including all four contacts after its required stop. No replacement campaign was run.

### Retained changes and their evidence limits

| Mechanism retained | Evidence supporting retention | What it establishes |
| --- | --- | --- |
| Shared Accept/Reject API freshness/configuration checks and precise diagnostic reasons | Positive/negative provider fixtures, complete category and saved-event checks; [initial reliability assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-action-confirmation-reliability-2026-10-29.md). | Correct confirmation eligibility and attribution/triage. No retained confirmation gain. |
| Exact OneTrust SDK recognition and effective-category interpretation | Reviewed URL/hash/size inventories and negative applicability fixtures; existing proof predicates remain mandatory. | Recognizes source and applicable supported state; presence and source recognition alone never register a choice. |
| OneTrust document continuity and native/Playwright commit ordering | Independent frame/loader checks, immutable witnesses and routed browser reproduction using genuinely retained reviewed SDK bytes; [source-order evidence](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/browser-proof.json). | Reproduced source-preservation correctness. No recovery of a historical session whose lifecycle sequence is missing. |
| Control bounded reads, sticky proof deadlines, original document scope and registered loading eligibility | Pre-fix timeout/late-work reproductions; wrong-label, frame, cancellation and custom-recipe negatives; [control-binding assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-control-binding-fixes-2026-10-29.md) and [shared recovery assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-shared-recovery-2026-10-29.md). | Local functional/safety support. Registered loading's small public sample had no net confirmation gain; it remains unproven for population rates. No inferred Dailysabah repair. |
| Exact contextual label grammar and Osano documented underscore receipt spelling | Canonical grammar negatives and mandatory six-field Osano shape/event/readback checks, included in the full gate. | Supported interpretations only. Missing, conflicting, IAB, inapplicable or wrong-session evidence remains unconfirmed. |
| Strict TLS in both action observers; fatal-schema/global-stop harness enforcement | Both final observers reject owned self-signed HTTPS before any HTTP handler/click; six visitor and 24 coordinator tests, including cross-domain halt after schema failure. | Safety corrections, not a rate-improvement claim. Passive scanner TLS defaults remain outside this rollback. |
| Stage separation, fixed-cohort reconciliation and canonical evidence replay | Rehashed original exports/packets and provider/action-level comparisons. | Auditability and attribution only; no synthetic evidence, scoring promotion or added confirmations. |

These mechanisms have direct source/fixture support; public efficacy remains unverified. Retaining a correctness repair does not satisfy the release gate for a significant reliability improvement. No canonical schema, finding, concern policy, score, category minimum, receipt requirement, notification semantics or source/session/target rule was weakened by this audit.

## One isolated repair

Native `Request.timing().startTime` can refine a request's start after its California collection proof was first captured. The final network row used that corrected clock, while the proof retained the earlier clock. The exact-request schema then rejected the entire packet. Both clock mismatch fixtures reproduce this exception in the isolated control.

The candidate copies the corrected start from the **same captured Request object** into its collection proof during final materialization, matching the row. The canonical validator remains unchanged and still requires matching request ID, method, origin, path and start. It does not attach evidence from another request or session, strip a conflicting proof, infer a receipt, or convert pre-click collection into post-Reject activity.

Both isolated arms use the reduced runtime, strict TLS, identical tests/dependencies and identical per-fixture budgets. The only runtime difference is **one source file and its one compiled JavaScript file**. [Machine-checked delta](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/isolated-delta.json) · [Minimal patch](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/isolated-fix.patch).

| Fixed owned mode | Control | Clock repair |
| --- | --- | --- |
| After-action request with fresh CookieYes receipt | Exact-request packet exception | Valid completed packet; decision confirmed |
| Native correction places request before click; fresh receipt still follows click | Exact-request packet exception | Valid completed packet; independent choice confirmed; collection stays pre-click/in-flight and excluded from post-Reject requests |
| Missing consent receipt | Completed, unconfirmed packet | Completed, unconfirmed packet |
| Valid completed packets / fixed three fixtures | 1/3 | 3/3 |
| Verified decisions / fixed three fixtures | 0/3 | 2/3 |

The +66.67-point fixture differences measure **verifiable packet preservation**. They do not show more control clicks or different visitor choices. The control's two exceptions leave packet-level completion/confirmation unavailable; those rows are kept in the fixed fixture denominator. There are zero recovered historical sites. The earlier Netspark error motivated the reproduction, but its failed live packet was never produced, so its exact mismatching field cannot be retrospectively established.

[Control log](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/isolated-control.log) · [Candidate log](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/isolated-candidate.log) · [Original fixture packets and clock facts](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/isolated-packet-provenance.json) · [TLS negative result](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/tls-owned.log).

## Full retained validation against the original frozen reference

Fresh replay covers **5,026 exports, 10,052 action rows, 1,576 completed-click rows across 1,008 sites**, and **2,800 original packets** (1,466 original inventory plus 1,334 coverage supplement). All completed-click rows join original proof. Cohort SHA remains `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`. No exclusions or eligibility corrections were added.

A second, independent read-only replay runs every original packet through **each frozen arm's own compiled canonical contracts**: original October 28 reference, reduced isolated control and clock candidate. All 2,800 verify in every arm, with **zero packet outcome/execution differences**. This avoids attributing the current verifier's answer to the older reference. The current full audit also matches the preceding cumulative replay, with zero attribution/initial/terminal changes. [Native frozen-arm replay](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/native-retained-comparison.json) · [Fixed-cohort native join](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/fixed-cohort-native-comparison.json) · [Full export/packet audit](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/retained/audit.json).

The all-packet inventory includes original packets outside the fixed completed-click export stratum. On all 2,800 packets, every arm has 357 initial and 366 operational confirmations and 1,574 completed paths. Those figures do not replace the 356/365/1,561 figures for the fixed 1,576-click cohort; all rows in both strata remain available.

In the following table, C/U/R means initial confirmed / unconfirmed / aborted-unresolved. Full path means verified click plus bounded observation. Decision includes already-retained terminal proof. Each before/after comparison is the original frozen reference → audited candidate, on identical action identities. Completion and decision percentage-point changes both use the unchanged row denominator. Every row has zero newly helped sites.

| Provider | Fixed clicks | Initial C/U/R before→after | Full paths before→after | Decisions before→after | Completion / decision pp | Sites helped |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Overall | 1576 | 356/1218/2 → 356/1218/2 | 1561→1561 | 365→365 | +0.00 / +0.00 | 0 |
| CMP identity unverified | 510 | 21/488/1 → 21/488/1 | 507→507 | 21→21 | +0.00 / +0.00 | 0 |
| OneTrust | 449 | 85/363/1 → 85/363/1 | 443→443 | 86→86 | +0.00 / +0.00 | 0 |
| Cookiebot | 129 | 119/10/0 → 119/10/0 | 129→129 | 122→122 | +0.00 / +0.00 | 0 |
| HubSpot Consent Banner | 87 | 7/80/0 → 7/80/0 | 86→86 | 7→7 | +0.00 / +0.00 | 0 |
| CookieYes | 71 | 62/9/0 → 62/9/0 | 70→70 | 62→62 | +0.00 / +0.00 | 0 |
| Osano | 51 | 0/51/0 → 0/51/0 | 51→51 | 0→0 | +0.00 / +0.00 | 0 |
| TrustArc | 42 | 1/41/0 → 1/41/0 | 42→42 | 1→1 | +0.00 / +0.00 | 0 |
| Termly | 33 | 23/10/0 → 23/10/0 | 33→33 | 25→25 | +0.00 / +0.00 | 0 |
| Consentmanager | 31 | 9/22/0 → 9/22/0 | 31→31 | 9→9 | +0.00 / +0.00 | 0 |
| Sourcepoint | 24 | 0/24/0 → 0/24/0 | 24→24 | 0→0 | +0.00 / +0.00 | 0 |
| Iubenda | 23 | 6/17/0 → 6/17/0 | 23→23 | 6→6 | +0.00 / +0.00 | 0 |
| Usercentrics | 21 | 0/21/0 → 0/21/0 | 21→21 | 0→0 | +0.00 / +0.00 | 0 |
| Cookie Information | 20 | 0/20/0 → 0/20/0 | 20→20 | 0→0 | +0.00 / +0.00 | 0 |
| DSGVO All in One / tarteaucitron | 15 | 0/15/0 → 0/15/0 | 15→15 | 0→0 | +0.00 / +0.00 | 0 |
| CookieScript | 10 | 0/10/0 → 0/10/0 | 10→10 | 0→0 | +0.00 / +0.00 | 0 |
| Didomi | 8 | 4/4/0 → 4/4/0 | 7→7 | 5→5 | +0.00 / +0.00 | 0 |
| Google Funding Choices | 8 | 3/5/0 → 3/5/0 | 8→8 | 3→3 | +0.00 / +0.00 | 0 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1/6/0 → 1/6/0 | 7→7 | 1→1 | +0.00 / +0.00 | 0 |
| Condé Nast Privacy Runtime | 6 | 6/0/0 → 6/0/0 | 6→6 | 6→6 | +0.00 / +0.00 | 0 |
| VWO consent state | 6 | 2/4/0 → 2/4/0 | 4→4 | 2→2 | +0.00 / +0.00 | 0 |
| InMobi Choice CMP | 5 | 3/2/0 → 3/2/0 | 5→5 | 3→3 | +0.00 / +0.00 | 0 |
| Orejime | 4 | 0/4/0 → 0/4/0 | 4→4 | 0→0 | +0.00 / +0.00 | 0 |
| Transcend | 4 | 3/1/0 → 3/1/0 | 4→4 | 3→3 | +0.00 / +0.00 | 0 |
| Borlabs Cookie | 3 | 1/2/0 → 1/2/0 | 3→3 | 3→3 | +0.00 / +0.00 | 0 |
| DataGrail | 3 | 0/3/0 → 0/3/0 | 2→2 | 0→0 | +0.00 / +0.00 | 0 |
| Ketch | 3 | 0/3/0 → 0/3/0 | 3→3 | 0→0 | +0.00 / +0.00 | 0 |
| Fides | 2 | 0/2/0 → 0/2/0 | 2→2 | 0→0 | +0.00 / +0.00 | 0 |
| Axeptio | 1 | 0/1/0 → 0/1/0 | 1→1 | 0→0 | +0.00 / +0.00 | 0 |

OneTrust reconciles exactly: **449 = 85 initially confirmed + 363 unconfirmed + one aborted**. The remaining action is colocrossing.com Accept, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`, with a completed click but truncated observation (`accept_observation_window_truncated`). Its operational count is 86 confirmed, 362 unconfirmed and one aborted because of one existing terminal decision. No row is forced into a success/failure category. Cookiebot, CookieYes and Termly retain their original decisions and completion evidence.

Consent surface observation, verified/unverified/unsupported identity, control resolution, attempt, click, bounded observation, initial registration, terminal verification and notification acknowledgment remain separate in the action-level audit. An unverified CMP identity is not CMP absence, and neither a completed click nor banner disappearance proves consent registration.

## Validation and revision identity

- **860/860 consent tests across 54 active files**, no skipped tests. This includes historical schemas, missing receipts, conflicting signals, notification-only controls, inapplicable categories, wrong-session/source binding and Cookiebot/CookieYes/Termly regressions. The four removed gate files belong only to the withdrawn experiments; they are archived rather than silently omitted from history.
- **851/851 contracts**, **16/16 release-selection**, **6/6 visitor**, **24/24 coordinator** tests passed. Coordinator tests are simulated contacts; they make no public visits.
- Scan-core typecheck and both control/candidate builds passed; `git diff --check` passed.
- Full replay retains every fixed row and all source/packet hashes; zero changed outcomes, attributions or eligibility. Source/build/test hashes stayed unchanged during the full gate.

[Consent log](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/full-consent-accepted.log) · [Gate provenance](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/accepted-gate-provenance.json) · [Contracts log](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/contracts.log) · [Typecheck](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/typecheck.log) · [Build](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/candidate-build.log) · [Release selection](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/release-selection.log) · [Visitor](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/visitor.log) · [Coordinator](/Users/benmasek/WC01/artifacts/cmp-retained-only-audit-2026-10-29/coordinator.log).

| Revision scope | Source fingerprint | Build fingerprint |
| --- | --- | --- |
| Withdrawn cumulative overlay | `6c04b2e141b01f0cdddfe4b5ca1a49388118f7611c4ae1dabc4d90b4a655285c` | `b69a9f65a674df2d5220dd9d678e84b01caa9186b0f30072324771a1b9725ea7` |
| Isolated control | `8417405452b7e3bae0dbddb30704f245f91e3713251dead795a19dabf068fa72` | `ddb997b00dbaf6587117235f19b17acfa3530c01ff0ca36ed78181c92ea6e71e` |
| Audited clock candidate | `3fcbd17852e13dfb7b095215de267333d02d99e301ee8607bd119c86de210cdd` | `817226a229f714124d51045e0af1faf512d1fce1f5da947073c76e2590d0e229` |

Metadata-only Git HEAD remains `71a17244a651661a0ea4385de82bb5864529bff7`; the source overlays distinguish the actual runtime. The audit-tool fingerprint is separately recorded in `retained/audit.json` and covers a different file set. No new commit or deployed revision is implied.

## Remaining work and cost boundary

The largest historical limitation remains missing discriminating evidence: the earlier failure census classified **1,088 of 1,220 initially nonconfirmed clicked rows** under historical schema limitations. Re-running the same retained data cannot create action-session lifecycle, applicability or fresh-receipt facts. The latest traces also distinguish a Termly request still held in guard validation from a Cookiebot request released but awaiting response. They must not be combined into an invented common transport cause or treated as proof of consent.

The next defensible retained-only task is to inspect already-captured receipt/event formats for an exact documented fresh, complete, source/session-bound protocol that an existing adapter mishandles, and require a failing canonical fixture before changing it. Stop that investigation when the relevant value/response/event or applicability facts were not retained; there is no recoverable percentage to extract from absent proof. More repeated replays, provider pins without decision evidence, or broader capture experiments have diminishing returns at that point. No further public scan or capture is authorized by this assessment.

The request-clock repair adds **zero browser operations, waits, network requests, model calls or retained fields**. All production scan/action/worker budgets and existing cost limits remain unchanged. The speculative peer-read overhead was removed. This audit adds **$0 recurring AWS cost**; archives and owned validation are local. No new paid service or recurring infrastructure is introduced. The isolated correctness fix is ready for code review; the cumulative reliability improvement remains unproven and release remains held.
