# CertScore.ai control-resolution and OneTrust source-binding fixes

## Decision

The local implementation and full retained validation are complete. The repairs are ready for code review; **keep the reliability rollout on hold** until fresh paired runtime evidence demonstrates improvement without losing completed observations. No deployment, flag change, public visit, historical rewrite or scan-budget increase occurred in this pass.

The full retained benchmark remains **365 operationally confirmed / 1,576 completed clicks (23.1599%)**, with **1,209 unconfirmed and two unresolved**. Initial registration remains **356 / 1,576 (22.5888%)**. The nine additional operational confirmations were already retained terminal decisions. **Change: 0.00 percentage points; zero distinct sites gain or lose retained confirmation.** Controlled browser fixtures establish the repaired mechanics, not a production gain or recovery of the prior public-site losses.

## Baseline and exact candidate

This pass follows the preserved [full reliability assessment](cmp-action-confirmation-reliability-2026-10-29.md) and [paired runtime assessment](cmp-paired-runtime-validation-2026-10-29.md). The historical export aggregate spans projection v26/v27; it does not identify a single scanner revision. The separately tested October 28 candidate was the frozen overlay `f0b18ee9779295d51bde1952967a7afaa6eef83d7bc8b302b37c869f4463a520` over Git `6d5a147e51decd6451f6278d4328ae5275a9dd8b`, not the later current candidate.

This pass compares an independently frozen immediate baseline with the final local source. Both use metadata-only Git HEAD `ddaebdf6d555f22f3f4e8631c6f4463efdc44848`; the uncommitted product overlays distinguish them:

| Scope | Fingerprint |
| --- | --- |
| Before complete overlay, 1,490 files | `f0b917a3619e3de780589f1dcf5de5a9df33c6a5d3f59d8ce9b2b6cc2c952feb` |
| After complete overlay, 1,495 files | `561159c6f35bea0591c357acd3288432474870c8581446ba81fdd51112fdedf4` |
| After six-package runtime source, 923 files | `362f3c0b20c2b2023e80a362c68e71b892133e2401b0b05daa7922cb7a398a6c` |
| Independently compiled six-package runtime, 1,096 files | `c4f3405dc95fb6f0982e256e219958fa2a58a3a1a5a7aed0fa68cfd84d034d1b` |

[Exact commands, source archives, build logs and replay provenance](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/after-v2/final-replay-provenance.json) distinguish these scopes. The before runtime matches all 918 files from the previous holdout candidate. The runtime snapshot was independently built with its own workspace links. A later test-only assertion correction is frozen as v2; exact production-source/compiler/lockfile equality permits reuse of those verified build bytes, without claiming a second build. The final replay uses the v2 frozen source aliases; the test is excluded from compiled output. Source and compiled overlays are archived; no mutable working-tree result substitutes for the frozen replay.

## Shared control-resolution repair

The pre-edit code reproduced three defects: a positive geometry reply could arrive after its advertised allowance, abort could remain blocked on a browser reply, and forced geometry dispatch could begin after its allowance expired. The same three defects also reproduce in the older paired reference; this does not establish that they caused OrangeLogic or FIDO Alliance's observed losses.

The shared helper now bounds the complete read and cleanup by the original deadline and cancellation signal. It discards late positives and keeps one outstanding readiness read per known frame until the actual command and cleanup settle. Recreated locators cannot queue duplicate readiness reads. Fresh evidence is required on recovery, and forced dispatch receives only the time remaining in its original allowance.

A second reproduction found three equivalent gaps in final control proof: late uniqueness could produce verified proof, a pending label read could exceed the deadline, and abort could wait on a pending scope read. Final proof now uses the same absolute boundary, checkpoints each asynchronous stage, suppresses late diagnostics/proofs, and retains its pending slot through custom-control and closed-shadow cleanup. Accept and Reject observers pass their existing deadlines and current resolved scopes.

The visibility, enabled-state, ancestry, hit-target, label, uniqueness and target requirements remain intact. These changes add no control-discovery calls or new action recipes. A stalled underlying browser command cannot be forcibly cancelled by these APIs; its scope remains unavailable until it settles. Compatibility callers without a deadline retain their previous behavior. The change does not claim to bound every setup or navigation operation. Ordinary trial/click and separate closed-shadow availability/dispatch paths retain their previous timeout behavior.

Evidence: [original geometry failures and fixes](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/control-read-fix-assessment.json), [final-proof failures and fixes](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-control-proof-fix-assessment.json). Local Accept/Reject fixtures complete fresh valid controls after delayed reads, reject opposite labels, and remain unconfirmed without receipts. These recovery checks do not demonstrate a public completion-count gain.

## OneTrust source binding

A fully routed browser fixture reproduced loss of previously verified SDK source after same-URL `history.replaceState`, while the native loader remained unchanged. The repair quarantines source immediately and restores it only after paired lifecycle evidence and an independent native readback agree on the original frame, loader, exact URL, epoch and unchanged generation.

Restoration publishes a **new immutable** `onetrust_native_document_continuity.v1` witness. Existing source objects and baselines are never amended. Only a fresh baseline after the completed checkpoint can use it. The schema checks chronology and matching document/frame/loader hashes. The existing exact SDK URL, digest, size, successful response, no-redirect, no-service-worker, duplicate-request, category and receipt checks remain required. No SDK pins were added.

The same-URL fixture changes source availability from **false to true** after the checkpoint. Fragment/path changes, path-and-return, reload, navigation elsewhere and `document.open` remain invalidated. Tests also reject missing/duplicate/reordered evidence, wrong frame/loader, stale sessions and receipts, pending body proof, earlier baselines, timeouts, aborted work, overflow and exhausted checkpoint limits. A first navigation with no prior SDK now reports `sdk_not_observed`; that diagnostic correction alone cannot confirm an action.

[Before/after fixture evidence and command accounting](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/onetrust-source-stage-validation.json) separate runtime commands from the harness's independent diagnostic reads. These controlled fixtures substitute an SDK digest and modeled state; they validate lifecycle and proof handling, not actual served vendor bytes or public consent behavior. IAPP's retained packets lack the discriminating lifecycle/body sequence, so no IAPP recovery is claimed. Brandwatch/Billtrust source gaps remain. Event ordering can still conservatively discard an SDK request arriving between native and Playwright commit delivery.

## Full retained results

The same fixed September 27–October 27 cohort retains 5,026 exports, 10,052 action rows, 1,576 completed clicks and 1,008 distinct sites. Cohort SHA-256: `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`. All 1,466 original plus 1,334 supplemental packets were verified; every completed row joins an original packet. The original eligibility exclusions are unchanged, with no new correction or dropped row.

C/U/R below means operationally confirmed / unconfirmed / unresolved. Initial registration is separate. Every provider has **zero sites gaining or losing confirmation**; the full comparison retains action-level evidence references, identity/attribution and terminal-state measures.

| Provider | Actions | Before C/U/R | After C/U/R | Initial confirmed, before → after | Δ pp |
| --- | ---: | --- | --- | ---: | ---: |
| Overall | 1576 | 365/1209/2 | 365/1209/2 | 356 → 356 | +0.00 |
| Axeptio | 1 | 0/1/0 | 0/1/0 | 0 → 0 | +0.00 |
| Borlabs Cookie | 3 | 3/0/0 | 3/0/0 | 1 → 1 | +0.00 |
| CMP identity unverified | 510 | 21/488/1 | 21/488/1 | 21 → 21 | +0.00 |
| Condé Nast Privacy Runtime | 6 | 6/0/0 | 6/0/0 | 6 → 6 | +0.00 |
| Consentmanager | 31 | 9/22/0 | 9/22/0 | 9 → 9 | +0.00 |
| Cookie Information | 20 | 0/20/0 | 0/20/0 | 0 → 0 | +0.00 |
| CookieScript | 10 | 0/10/0 | 0/10/0 | 0 → 0 | +0.00 |
| CookieYes | 71 | 62/9/0 | 62/9/0 | 62 → 62 | +0.00 |
| Cookiebot | 129 | 122/7/0 | 122/7/0 | 119 → 119 | +0.00 |
| DSGVO All in One / tarteaucitron | 15 | 0/15/0 | 0/15/0 | 0 → 0 | +0.00 |
| DataGrail | 3 | 0/3/0 | 0/3/0 | 0 → 0 | +0.00 |
| Didomi | 8 | 5/3/0 | 5/3/0 | 4 → 4 | +0.00 |
| Drupal EU Cookie Compliance module, non-TCF | 7 | 1/6/0 | 1/6/0 | 1 → 1 | +0.00 |
| Fides | 2 | 0/2/0 | 0/2/0 | 0 → 0 | +0.00 |
| Google Funding Choices | 8 | 3/5/0 | 3/5/0 | 3 → 3 | +0.00 |
| HubSpot Consent Banner | 87 | 7/80/0 | 7/80/0 | 7 → 7 | +0.00 |
| InMobi Choice CMP | 5 | 3/2/0 | 3/2/0 | 3 → 3 | +0.00 |
| Iubenda | 23 | 6/17/0 | 6/17/0 | 6 → 6 | +0.00 |
| Ketch | 3 | 0/3/0 | 0/3/0 | 0 → 0 | +0.00 |
| OneTrust | 449 | 86/362/1 | 86/362/1 | 85 → 85 | +0.00 |
| Orejime | 4 | 0/4/0 | 0/4/0 | 0 → 0 | +0.00 |
| Osano | 51 | 0/51/0 | 0/51/0 | 0 → 0 | +0.00 |
| Sourcepoint | 24 | 0/24/0 | 0/24/0 | 0 → 0 | +0.00 |
| Termly | 33 | 25/8/0 | 25/8/0 | 23 → 23 | +0.00 |
| Transcend | 4 | 3/1/0 | 3/1/0 | 3 → 3 | +0.00 |
| TrustArc | 42 | 1/41/0 | 1/41/0 | 1 → 1 | +0.00 |
| Usercentrics | 21 | 0/21/0 | 0/21/0 | 0 → 0 | +0.00 |
| VWO consent state | 6 | 2/4/0 | 2/4/0 | 2 → 2 | +0.00 |

OneTrust's historical initial result reconciles as **85 confirmed + 363 unconfirmed + one aborted = 449**. The remaining action is colocrossing.com's Accept row, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`; it remains unresolved, not forced into unconfirmed. One already-retained terminal proof produces the separate operational **86/362/1** result.

[Machine-readable full comparison](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/after-v2/final-comparison/comparison.json) shows **zero verification, attribution or diagnostic changes** across all 2,800 packets. Cookiebot remains 122/129 operationally confirmed, CookieYes 62/71, and Termly 25/33. The prior ranked failure analysis and representative packets remain applicable; these runtime fixes do not retroactively supply missing observations. CMP identity remains separate from consent-surface presence; control resolution, dispatch/completion, initial registration, terminal verification and notification acknowledgment remain separate stages.

The complete prior campaign was also re-projected: all **96 planned slots, 87 historical contacts and nine uncontacted slots** remain, with zero verifier-stage changes and distinct historical build groups. This is retained replay, not a fresh runtime comparison. The prior holdout still records 3/14 → 2/14 confirmed matched pairs and two fewer completed observations in the candidate arm. Those losses are not relabeled as repaired. All **7,845 historical files** checked by the preservation manifest remain byte-identical.

## Validation and cost

| Final check | Result |
| --- | --- |
| Full consent release gate, including shared controls and provider regressions | 809 passed |
| Complete contracts suite | 849 passed |
| Canonical scoring/projection regressions | 40 passed |
| Shared-helper sale/sharing local regressions | 30 passed |
| Fast/full release-gate selection | 15 passed |
| Contracts and scan-core TypeScript | Passed |
| Independent frozen scan-core/report-adapter builds; v2 test-only build equivalence | Passed |
| Full retained cohort, packet and historical campaign reconciliation | Passed |

[Final consent log](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-consent-verified.log), [contracts log](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-contracts.log), [scoring log](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-scoring.log), [sale/sharing log](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-salesharing.log), [typechecks](/Users/benmasek/WC01/artifacts/cmp-control-binding-fixes-2026-10-29/final-typechecks.log) and adjacent JSON receipts preserve commands, times and hashes. Focused earlier runs overlap these tests and are not added to the final totals. Negative coverage includes historical schemas, missing receipts, conflicting signals, notification-only controls, inapplicable categories and wrong-session evidence. Independent cross-review found no material false-positive source-reuse or control-proof issue; documented conservative losses remain. The first full gate passed 808/809: an Osano fixture demanded an interception diagnosis from the old out-of-budget final geometry read. The corrected test requires unavailable final geometry, failure before dispatch, zero clicks and no exercised choice; it permits the earlier trial to report either interception or timeout. Successful transient recovery and cancellation assertions remain strict. The original failed run is preserved in `final-consent.log`; the final full rerun is authoritative.

Existing result/search/confirmation/observation budgets, workers, routes, action permissions, canonical findings and scoring are unchanged. OneTrust uses the existing same-page DOMStorage session: one asynchronous `Page.enable`, at most two `Page.getFrameTree` checkpoints per action, one in flight, each capped at 100 ms and the existing action deadline. Confirmation and cleanup do not wait for this optional work. No new SDK calls, requests, visits, storage objects or longer retention are introduced; the witness fits existing evidence objects (632 bytes in the positive fixture).

The disclosed engineering estimates are **below $0.01/month** for control bookkeeping and **below $0.50/month** for continuity commands and metadata at 100,000 scans. They are not production measurements. Local work adds $0 recurring AWS spend. No cost allowance or recurring infrastructure configuration was increased.

## Remaining work and stopping rule

The highest-return next validation is a small predeclared paired run targeting the repaired mechanisms, with unchanged budgets and positive evidence of both control completion and source continuity. It must honor cooldown/no-go gates and existing contact authorization; this pass made no new contact or waiver. Treat lower completion, missing receipt/source proof, or inconsistent native/retained outcomes as a stop condition. Require improved verified decisions per fixed contacted/planned denominator without sacrificing completed observations before recommending rollout. Ordinary production evidence would still be needed to claim production improvement.

For further implementation, prioritize discriminating stage/source proof inside existing captures over isolated domain exceptions or more SDK pins without reviewed bytes. The historical unresolved analysis is dominated by schema limitations (1,088 of the 1,220 initially nonconfirmed rows); replay cannot reconstruct those missing facts. Additional replay or repeated visits that yield the same nondiscriminating evidence have diminishing returns. Stop once a failure is established as outside the supported control/category/receipt scope, or its next resolution requires a budget/authorization change. Do not increase windows, launch a broad campaign or resume held Gimbal/ReadCube diagnostics to chase a percentage.
