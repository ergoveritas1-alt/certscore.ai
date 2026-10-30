# CertScore.ai larger paired control-resolution holdout — October 29, 2026

## Decision

**The larger holdout shows a small positive gain, but does not establish a reliable broad improvement. Keep the fix undeployed and hold rollout.** Completion and confirmation each rise **5/20→6/20 (25%→30%, +5 percentage points)**. This is one net additional confirmed completed path, from two gains and one loss. The earlier two-site +25-point pilot lift is substantially smaller here. The cohorts are independent and are not pooled.

The predeclared site-cluster bootstrap gives a **−10 to +20 percentage-point 95% interval** for each primary difference. It includes no improvement and regression. These are descriptive small-cohort intervals, not internet-wide accuracy or ordinary production verification. The p95 of paired total-time differences is **+2.779 seconds**, exceeding the **+2-second review limit**; median paired increase is **+20.5 ms**, within the +500 ms limit. The Dailysabah Accept loss remains a regression to investigate, rather than being dismissed as runtime variation.

No product code, thresholds, action recipes, SDK rules, capture budgets, workers, flags or deployments changed during this validation. The same frozen reference and candidate from the pilot were used.

## Fixed design and safeguards

The cohort was frozen before contact: **10 new sites, 20 paired actions and 40 actual slots**, covering six historical provider strata. OneTrust has three sites; Cookiebot and CookieYes two each; HubSpot, Osano and Termly one each. Historical strata route sampling and do not verify the current action-bound CMP. Targets and arm order are in the [immutable plan](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/plan.json).

Fresh successful all-channel central history was merged with the repository ledger. The canonical selector admitted 112 of 144 retained candidates and excluded 32; no hold or 28-day cooldown was waived. Public-suffix checks required exact public registrable apex/www domains, excluding private tenant suffixes. Predeclared quotas used the first canonical rotation-ranked admissions in each stratum; completed, failed and unattempted historical paths could enter the pool. The previous pilot sites were excluded by current history. No public target was replaced after contact.

Five sites start Accept with the reference and five with the candidate; Reject reverses that order. Every slot uses a fresh isolated context, the same identity/runtime and existing exact-target/native TLS/public-network protections, with at most one deterministic first-layer action. Concurrency is one. A no-go would stop all remaining slots for that domain; evidence failure, unexpected action or source/build drift would halt the campaign. No retries, region changes, identity changes, Options/Manage paths, external forms or additional contacts were allowed. The campaign stopped at all 40 planned slots, with **zero no-go, skipped or unknown contacts**.

The [analysis specification](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/analysis-prespec.json) was saved before contact. Primary denominators stay 20 planned actions per build. Full path completion requires both the click and bounded observation to complete. The canonical comparison's `completed` counter counts clicks; this report calculates full paths separately. The counts happen to coincide here, but they are not interchangeable. Confirmation is an independent verified corresponding decision, never a click, missing banner or notification acknowledgment.

## Overall and action-level results

| Measure | Reference | Candidate | Change |
| --- | ---: | ---: | ---: |
| Planned/contacted actions | 20/20 | 20/20 | unchanged |
| Completed clicks | 5 | 6 | +1 |
| Completed observation paths | 5/20 (25%) | 6/20 (30%) | +5 pp |
| Verified consent decisions | 5/20 (25%) | 6/20 (30%) | +5 pp |
| Confirmed completed paths | 5 | 6 | +1 |
| Completed unconfirmed paths | 0 | 0 | unchanged |
| Clicks with incomplete observation | 0 | 0 | unchanged |
| Paths not proved complete | 15 | 14 | −1 |
| No-go / skipped / unknown contacts | 0/0/0 | 0/0/0 | unchanged |

Matched-contact sensitivity is identical because all 20 pairs contacted both arms. Confirmation among completed paths is 100% in both arms; the net gain comes from another verified complete action, not a changed receipt-decoding threshold. Five reference and six candidate confirmations are initial registrations. Terminal-only confirmations and notification acknowledgments are zero. No attribution-only row is counted as a verified action gain.

| Action | Planned each | Completed before→after | Confirmed before→after | Rate change |
| --- | ---: | ---: | ---: | ---: |
| Accept | 10 | 2→3 | 2→3 | +10.0 pp |
| Reject | 10 | 3→3 | 3→3 | +0.0 pp |

The gain is limited to Accept in this holdout. Reject shows no aggregate improvement. Twenty pairs within ten sites are not twenty fully independent websites; the prespecified bootstrap resamples all ten sites, preserving both action differences per site, with 100,000 replicates and seed 20261029. It yields −10 to +20 points for both endpoints. No p-value or broad production claim is inferred.

| Cohort, kept separate | Planned actions per build | Completed before→after | Confirmed before→after | Difference |
| --- | ---: | ---: | ---: | ---: |
| Earlier two-site pilot | 4 | 1→2 | 1→2 | +25 pp |
| Independent ten-site holdout | 20 | 5→6 | 5→6 | +5 pp |

## Provider strata and action-bound identity

| Historical sampling stratum | Sites | Actions each | Completed before→after | Confirmed before→after | Unresolved paths before→after | Rate change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| OneTrust | 3 | 6 | 1→1 | 1→1 | 5→5 | +0.0 pp |
| Cookiebot | 2 | 4 | 3→3 | 3→3 | 1→1 | +0.0 pp |
| CookieYes | 2 | 4 | 0→0 | 0→0 | 4→4 | +0.0 pp |
| HubSpot Consent Banner | 1 | 2 | 1→2 | 1→2 | 1→0 | +50.0 pp |
| Osano | 1 | 2 | 0→0 | 0→0 | 2→2 | +0.0 pp |
| Termly | 1 | 2 | 0→0 | 0→0 | 2→2 | +0.0 pp |

Every stratum has zero completed-but-unconfirmed paths in both arms. Unresolved paths include not-attempted and aborted actions, not inferred consent refusals.

Tresensa belongs to the **historical HubSpot sampling stratum**, but its live verified actions bind to **Complianz**. Its added Accept confirmation must not be presented as a HubSpot API improvement. Actual verified completed-action counts are OneTrust **1→1**, Cookiebot **3→3**, and Complianz **1→2**. Cookiebot's net-flat result includes one gained and one lost Accept path. The zero-to-zero strata provide no positive live confirmation coverage for CookieYes, Osano or Termly; they are not evidence that those providers or their controls are absent.

The common verifier and native projection agree on every slot: **zero evidence issues and zero measurement disagreements**. All 40 original packets are retained and verified against their declared SHA/size, parsed schemas and canonical projections. The {link('canonical comparison',out/'analysis/run-1/comparison.json')} retains the independent surface, identity, control, attempt, click, observation, category, initial/terminal decision and notification stages. The {link('holdout statistics',out/'statistics.json')} binds the analysis and input checksums.

## Every gain and loss

There are two sites with newly completed and confirmed paths, Runna and Tresensa, and one with a loss, Dailysabah. Net action gain is one; it is not three uniformly helped sites. All three discordant pairs remain in the {link('complete evidence review',out/'discordant-review.json')}.

### dailysabah.com Accept — loss

- Reference: `succeeded_with_confirmation`, action-bound provider `Cookiebot`, resolver 2,420 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/03-dailysabah.com-accept-reference/PostAcceptEvidencePacket.json), SHA-256 `f9536c231ca0f045ed7283b58b9df730ade8668df1a5a568ff00bee9e6345450`.
- Candidate: `not_attempted`, action-bound provider `None`, resolver 14,000 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/03-dailysabah.com-accept-candidate/PostAcceptEvidencePacket.json), SHA-256 `bdcba10f87ffa679110f5fdb687e3da3157ccd236752bb2255a8985b347f0fdd`.

The reference retained a current Cookiebot control and corresponding decision. The candidate retained loading/selector-absent/unavailable geometry evidence and exhausted search without a verified actionable control. Its total time rose from 4.072 to 15.136 seconds. This loss remains counted. The packets do not establish whether code scheduling or differing live page availability caused it.

### runna.com Accept — gain

- Reference: `not_attempted`, action-bound provider `None`, resolver 14,000 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/04-runna.com-accept-reference/PostAcceptEvidencePacket.json), SHA-256 `cad2b179e81ae95f25a1b5181330c2b4b8415c6ad7efc5a7f60e4851ec43cb0d`.
- Candidate: `succeeded_with_confirmation`, action-bound provider `Cookiebot`, resolver 1,279 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/04-runna.com-accept-candidate/PostAcceptEvidencePacket.json), SHA-256 `590c8d514cfa87a9432a2bcbc7f94ab3f13251be898bbf1bc46ca48ab877b223`.

The reference failed to resolve an actionable Accept control within its search window. The candidate resolved, clicked, completed observation and verified the corresponding decision. Separate visits include page/runtime variation, so the observed recovery is not proof of isolated code causality.

### tresensa.com Accept — gain

- Reference: `not_attempted`, action-bound provider `None`, resolver 14,000 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/07-tresensa.com-accept-reference/PostAcceptEvidencePacket.json), SHA-256 `103840be53e53e030bede18483e40afd7d706e2a680419e7d2e7d45642925a4e`.
- Candidate: `succeeded_with_confirmation`, action-bound provider `Complianz`, resolver 1,145 ms. [Original packet](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/run/visits/07-tresensa.com-accept-candidate/PostAcceptEvidencePacket.json), SHA-256 `ac00028915384ae711ef20d6dc1c7538c164fdfdb47888d73b39deec923be391`.

The reference failed to resolve an actionable Accept control within its search window. The candidate resolved, clicked, completed observation and verified the corresponding decision. Separate visits include page/runtime variation, so the observed recovery is not proof of isolated code causality.

## Remaining unresolved paths

All **29 non-confirmed paths across both arms** are retained in the evidence inventory; none is a completed-but-unconfirmed receipt case. The candidate has 14 remaining paths without proved completion. Across both arms the earliest retained reasons are 15 unresolved Accept controls, 13 unresolved Reject controls and one reference control-resolution abort. The reference 10TV Reject path reached the existing result deadline before a click and remains aborted, not forced into an unconfirmed consent category.

An unverified identity does not mean no CMP exists, and an unavailable control read does not establish control absence. Loading, missing selectors and unavailable geometry remain contributing observations; a root cause is not invented from them. These are operational yields on this selected cohort, not human-adjudicated control-detection accuracy or legal conclusions. {link('Every unresolved row with additional reasons and packet hashes',out/'unresolved-evidence.json')}.

## Paired latency

All 20 matched pairs have terminal timings. The prespecified review uses the distribution of candidate-minus-reference duration **within each pair**, rather than silently substituting a different percentile definition.

| Paired total-time measure | Observed increase | Review limit | Result |
| --- | ---: | ---: | --- |
| Median | +20.5 ms | +500 ms | within limit |
| p95 | +2,779.05 ms | +2,000 ms | exceeds limit |

Median paired resolver difference is +0.5 ms. The two largest total-time increases are Dailysabah Accept **+11.064 seconds** and PDFGear Accept **+2.343 seconds**. Website/runtime variability is possible, but does not erase the measured tail-latency concern. This is local paired browser timing, not a production latency estimate. The per-action caps were unchanged; a larger observed duration within those caps is not a budget increase.

## Validation and revision identity

No implementation change was made for this task. The exact source/build identities, prior source-stable **869 consent regressions**, **851 contract tests**, owned-browser packet measurements and full retained replay were checksum-verified before contact. They were reused because the code and dependencies are unchanged; this report does not claim those suites were rerun for a validation-only campaign. The runner reverified both frozen arms before and after every slot. Node, Playwright, Chromium and lockfile identities are pinned in the plan.

The entire retained benchmark remains 5,026 exports, 10,052 action rows, 1,576 completed clicks and 2,800 verified packets. Historical initial registration stays **356/1,576**, operational confirmation including existing terminal proof **365/1,576**, with zero newly confirmed retained sites and no denominator/eligibility correction. Historical exports and all previous reports were preserved. The larger live results are not added to those denominators.

| Arm | Source fingerprint | Compiled fingerprint |
| --- | --- | --- |
| Reference | `552d5dbbfec95e4eccca13d59fa077258bdfefaa916ce83b8692d14730ebe50e` | `feeb44ff12470cc98bc2eecc3f2f92b39eb835904ba3b921c5b8766d75212a23` |
| Candidate | `ad63e6977f3ce90e248fd79471ae04fad56d2e49a8b1ebbd759fa8611edd099d` | `6cae7e7ff98c4526de87924f857697045d336adbb97d7a4c6b5e1faf35e46fdb` |

[Verified prior validation](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/prior-validation-verified.json) · [Earlier implementation and full benchmark assessment](/Users/benmasek/WC01/docs/certscore-v2/cmp-selector-sweep-2026-10-29.md).

All 40 actual contacts were persisted centrally with idempotent run key `cmp-selector-holdout-20261029.v1`. The repository cooldown ledger was reviewed and committed locally at `18c08e5753d86efd570a205aa69f2f2b498c0fec`; unrelated entries were preserved. Ledger `lastOutcome: completed` means the calibration runtime returned, independently of whether its consent action completed. [Contact provenance](/Users/benmasek/WC01/artifacts/cmp-selector-holdout-2026-10-29/contact-provenance.json). There was no push, deployment, flag change, new recurring schedule or baseline promotion.

Result/search/confirmation caps remain **20,000/14,000/2,000 ms**; Accept observation **3,000 ms**, Reject **8,000 ms**, one fresh context and at most one deterministic first-layer action per slot. Current workers, identities and regions were preserved. Gimbal/ReadCube restrictions stayed in effect. Local public validation adds no recurring AWS capacity; one-time ledger export/persistence is estimated below **$0.10 total**, within existing approval. No paid model/API or cloud scan campaign was introduced.

## Assessment and next step

Both primary point estimates remain positive, meeting the prespecified descriptive direction rule, but the gain shrank to +5 points, uncertainty spans regression, the net gain comes from one current provider/site, and tail latency exceeds the review bound. **Keep rollout held.** This does not support carrying the pilot's +25-point improvement into broader expectations.

The next priority is the lost Dailysabah control path and the 14 remaining candidate paths. All six completed candidate paths confirmed. Retained evidence still cannot distinguish a missing/not-yet-delivered first layer from an unavailable renderer read. Resolve that distinction with a focused bounded reproduction or retained timing evidence before another public campaign. Repeating visits without a discriminating hypothesis would consume cooldowns and add variation. This holdout is finished at 40 contacts; no automatic extension, retry, replacement or deployment follows.
