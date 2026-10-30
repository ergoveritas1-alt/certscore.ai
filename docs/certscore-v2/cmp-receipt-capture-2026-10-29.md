# CertScore.ai bounded receipt capture — October 29, 2026

## Result and decision

Implemented shared receipt-input retention for future Accept/Reject scans. The new typed observations preserve safe category facts, exact write/readback hashes and identity, API baseline/event information, and a bounded OneTrust configuration view from reads already performed by the existing adapters. **Decision verification, finding eligibility and scoring remain unchanged.** No new action adapter, SDK invocation, browser round trip, active request, wait, Options panel, worker, live scan, deployment or flag change was added.

**Ready for code review as a capture improvement; hold deployment.** The 24-case paired owned comparison preserves **24/24 completed paths and 6/24 confirmations** in both arms. New capture envelopes are present in **24/24**, with category facts in **22/24**. The two missing-receipt cases explicitly retain unavailable reads. These are owned fixture measurements, not public or production confirmation gains.

The full historical benchmark remains **356 initial confirmations**, or **365 including existing terminal proof, out of 1,576 completed clicks**. Zero historical sites are newly confirmed; completion and confirmation changes are 0.00 percentage points. Existing missing evidence was not reconstructed or rewritten.

## Shared gaps closed

| Gap | Shared implementation | Evidence limit |
| --- | --- | --- |
| Unsupported receipt inputs were reduced to hashes or discarded | Retain bounded boolean/recognized-enum category facts with hashed field paths, format, original value hash and key hash from existing cookie/write reads. Reuse registered cookie variants, including numeric Iubenda and tenant Consentmanager keys; recognize existing nested TrustArc receipt keys for observation. | Free-form strings, identifiers and numeric payload values are excluded. Opaque or excessive values remain unavailable/limited; no decoder support is inferred. |
| Fresh writes could not be joined to independently retained readback | Retain exact setter identity when the existing parser can resolve it, original fractional write clock/sequence, current cookie identity/value hashes and explicit unique/ambiguous/missing multiplicity. Extend Accept's existing bounded ephemeral receipt assignment capture to these keys, retaining the same 96-write/4,096-character assignment bounds. | Setter identity alone is not cookie acceptance. Verification still needs matching independent readback, freshness, complete applicable scope and the authorized control. Existing post-action storage snapshots supply a separate identity/value-hash readback where available. |
| API evidence disappeared after initial/terminal eligibility checks or decoder rejection | Capture already-read baseline, initial and terminal snapshots, configuration hash, decision, category facts, saved-event sequence and event clock. Rejected HubSpot/Osano/Termly inputs can retain safe partial facts; saved-event/getter origin and known readback disagreement remain explicit. | A partial payload is tagged `api_partial`, limited and unknown. An event, getter, changed hash or static granted map cannot independently confirm consent. |
| OneTrust configuration detail disappeared on unsupported paths | Capture a safe declared-group/status/boolean-flag view and available cached SDK source hash from the existing configuration read. | This is a diagnostic view, not a replacement for complete applicability inputs, inventory/source pins or document-continuity witnesses. Unsupported/missing configuration stays unknown. |

The historical direct-receipt census exposed three Consentmanager and three Iubenda rows, plus one historical HubSpot and one TrustArc row. Those are investigation exposure, **not predicted recoveries**. Historical provider attribution remains separate from the action recipe. The added Iubenda/Consentmanager tests deliberately use synthetic JSON under registered receipt keys; they demonstrate capture and identity joining, not support for an actual served vendor receipt format.

Cookie/write hashes cover the original already-read values. Accepted API hashes cover the existing canonical state; partial API and configuration hashes cover the sanitized view, not a recoverable raw payload. A requested provider read or receipt-key match does not verify CMP identity.

The reusable collector is [consent-receipt-capture.ts](/Users/benmasek/WC01/packages/certscore-scan-core/src/consent-receipt-capture.ts); the new versioned contract is [consent-receipt-capture.ts](/Users/benmasek/WC01/packages/certscore-contracts/src/consent-receipt-capture.ts). Both packet schemas validate the new optional field. Observations remain in the original retained packet; report projection, normalized concerns, policies and scores do not promote them into decisions or findings.

## Binding, privacy and budgets

`consent_receipt_capture.v1` is explicitly non-authoritative (`diagnosticOnly:true`). It binds to this scan ID, action, authorized target, available control-frame identity, dispatch clock and completed click. Main-document generation tokens reject late asynchronous replies and foreign frames. Navigation after dispatch or cancellation clears the observations and preserves the invalidation flag. Unsupported framed capture is omitted rather than represented as main-document evidence. Legacy v1 packets cannot acquire this field.

Baseline, initial and terminal reads retain separate phases. Freshness is never inferred from capture time, banner disappearance, CMP presence or a receipt ID. Missing, ambiguous, mixed, inapplicable, conflicting, late or wrong-session evidence remains unconfirmed. No new field is a prerequisite that removes existing valid confirmation proof.

The new capture is bounded to **eight observations, sixteen facts per observation, 32 distinct inspections (8 baseline / 16 initial / 8 terminal), four milliseconds of cooperative Node-side projection processing and an 8,192-byte compact typed envelope**. Exhaustion is explicit. JSON parsing is limited to already-read 2,048-character values; partial API extraction inspects at most 24 members and returns at most eight safe fields. Invalid saved-payload sampling is capped at eight per tracker. JSON duplicate fields are checked per object, and arbitrary code/strings are never evaluated or retained.

The envelope cap applies to compact encoding; existing artifact formatting adds whitespace. The largest measured compact envelope was **4,587 bytes**; the largest actual added formatted-packet size was **6,464 bytes**. No artifact path, retention period or existing absolute artifact limit changed.

Production budgets remain 20,000 ms result / 14,000 ms search / 2,000 ms initial confirmation / 3,000 ms Accept and 8,000 ms Reject observation. Owned fixtures use smaller unchanged per-case budgets. Mocked counters verify one API evaluation per existing read and one OneTrust configuration plus one cookie read where those were already required. No new SDK function, browser read, request/response body fetch, polling loop, retry, model call or paid service was introduced.

The implementation estimate disclosed before proceeding is **below $0.25/month incremental at 100,000 scans**, for bounded processing and extra metadata in existing objects, within existing allowances. A conservative estimate includes formatted JSON overhead. Actual incremental recurring AWS spend from this undeployed local work is **$0**.

## Paired owned validation

Both arms run the same final fixture source and per-case budgets with isolated loopback contexts. Reference source is the previous audited `3fcbd178…` overlay; candidate is separately frozen and built. All 48 original packets and their SHA/size receipts are retained.

| Owned measure | Reference | Candidate |
| --- | ---: | ---: |
| Fixed action cases | 24 | 24 |
| Completed click plus observation | 24 (100%) | 24 (100%) |
| Verified consent decisions | 6 (25%) | 6 (25%) |
| Completed unconfirmed | 18 | 18 |
| New bounded receipt-capture envelopes | 0 | 24 |
| New category-input capture cases | 0 | 22 |
| Positive decisions independently replayed from new supported captured inputs | unavailable in this new representation | 6 |

The reference already has valid native decision evidence for its six confirmations. The new representation supplies replayable input detail; these are not six new confirmations. Unsupported, mixed, stale, partial and missing-receipt cases remain unconfirmed. The same canonical execution result is checked with and without the optional observations.

The owned-only input replay joins exact cookie write/readback identity and value hashes, verifies category facts under existing CookieYes decoding, and uses existing HubSpot configuration/event/freshness eligibility checks. It agrees with all 24 native results, without producing a new finding or production assessment. [Comparison, hashes and replay](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/owned-comparison-release.json) · [Replay code](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/replay-owned-release.ts) · [Reference log](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/paired-reference-release.log) · [Candidate log](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/paired-candidate-release.log).

Representative candidate packets:

- [Late CookieYes decision](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/owned-candidate-release/accept-terminal.json): initial and terminal phases, fresh setter clock and matching current cookie.
- [Rejected partial HubSpot event](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/owned-candidate-release/api-accept-partial.json): safe category facts and saved-event timing survive; decision remains unknown.
- [Iubenda registered numeric key](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/owned-candidate-release/variant-Iubenda-reject.json): unsupported synthetic input joins the exact setter to the existing independent post-action snapshot; no refusal is inferred.
- [Missing receipt](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/owned-candidate-release/reject-missing.json): unavailable reads remain explicit; click and observation complete without confirmation.

Negative coverage includes wrong scan/target/frame/clock bindings, changed document, cancellation, late replies, foreign cookie scope, overflow, CPU limits, duplicates, raw identifiers, missing receipts, unchanged state, unknown categories, mixed choices and partial saved events. Existing notification-only and inapplicable-category guards are included in the complete consent suite.

## Entire retained benchmark

Fresh release replay verifies **5,026 exports / 10,052 action rows / 2,800 packets**, with all **1,576 completed-click rows across 1,008 sites** joined to original packets. Cohort SHA remains `2a559a5a7b3880782c71b1aec1587b4717fb2009a8269927c1e9b99aea8f8b7e`. There are zero eligibility corrections, zero row removals and zero attribution/initial/terminal outcome changes. [Full audit](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/retained-release/audit.json) · [Provider CSV](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/retained-release/providers.csv).

C/U/R is initial confirmed / unconfirmed / aborted-unresolved. Full path means click plus completed bounded observation. Decisions include existing terminal proof. All completion and decision percentage-point changes are zero.

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

Overall initial confirmation remains **22.5888%**, operational confirmation **23.1599%**. The completed-click cohort retains 1,561 full paths and fifteen incomplete observations; this conditional cohort is not the completion denominator for all attempted controls. OneTrust's 449 rows still reconcile to **85 initial confirmations + 363 unconfirmed + one aborted** (colocrossing.com Accept, scan `4242dd6a-70ef-4ffb-ae8e-22580b82ad7e`). Cookiebot, CookieYes and Termly regressions are unchanged. Unknown CMP identity remains separate from CMP absence or an explicitly unsupported receipt.

## Tests, source identity and remaining limits

- **898/898 consent tests across 56 files**, no skips; source/build/test hashes stayed unchanged during the accepted gate.
- **854/854 contracts**, **16/16 release-selection**, **6/6 visitor** and **24/24 coordinator** tests passed.
- Typecheck, build, and `git diff --check` passed.
- Complete retained replay has zero changes; frozen paired owned comparison passes 24 cases per arm.

[Accepted consent log](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/full-consent-accepted.log) · [Gate provenance](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/accepted-gate-provenance.json) · [Contracts](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/contracts-release.log) · [Typecheck](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/typecheck-release.log) · [Build](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/build-release.log) · [Release selection](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/release-selection-release.log).

Development failures and two deliberately superseded gate runs remain preserved; neither stopped gate is counted as validation. Refinements retained native fractional clocks, corrected duplicate-field detection for separate nested objects, captured rejected partial API data, and covered registered receipt-key variants. [Superseded-run accounting](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/superseded-gate-note.json).

| Frozen arm | Source fingerprint | Build fingerprint |
| --- | --- | --- |
| Reference | `3fcbd17852e13dfb7b095215de267333d02d99e301ee8607bd119c86de210cdd` | `817226a229f714124d51045e0af1faf512d1fce1f5da947073c76e2590d0e229` |
| Release candidate | `d5826810dfe110788654eddc42b4fc7a8559b124affb53305bc7c03195c55d91` | `f88ec670ed60bf3ffcaceda5136964c0012a4ce691fb9547d194593b15e1819e` |

Git HEAD remains metadata-only `71a17244a651661a0ea4385de82bb5864529bff7`; the preserved local overlay distinguishes the candidate. [Runtime delta](/Users/benmasek/WC01/artifacts/cmp-receipt-capture-2026-10-29/runtime-delta.patch) records twelve changed/new runtime-source/test files; declaration propagation accounts for additional compiled files. Gate wiring changes are separately retained. No commit, rollout or deployed revision is implied.

Missing or late receipts, unavailable SDKs, unsupported applicability, opaque/sensitive formats and capture limits still cannot establish a decision. Main-document observation does not claim complete cross-frame coverage. Further semantic adapter work must start from supported complete scope, fresh matching receipt/event/readback and exact source/session/target proof; these observations cannot waive any of those requirements. The capture fix is ready for review, while public-rate improvement and ordinary production verification remain unestablished. No live validation or deployment was run.
