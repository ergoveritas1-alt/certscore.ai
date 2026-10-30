# CertScore.ai small paired live validation — October 29, 2026

## Result and release decision

The fixes did not demonstrate an overall live improvement in this six-site sample. Keep the reliability rollout on hold. Nothing was deployed and no production improvement is established. Results are local-browser measurements; this is a small diagnostic sample, not a population estimate or production-region validation.

| Measure | Immediate pre-fix reference | Fixed candidate |
| --- | ---: | ---: |
| Planned action slots | 12 | 12 |
| Actual contacts | 11 | 10 |
| Verified decisions / contacted actions | 3/11 (27.27%) | 2/10 (20.00%) |
| Completed observations / contacted actions | 4/11 (36.36%) | 4/10 (40.00%) |
| Verified decisions / completed actions | 3/4 (75.00%) | 2/4 (50.00%) |
| Verified decisions / planned slots | 3/12 (25.00%) | 2/12 (16.67%) |
| Completed but unconfirmed | 1 | 2 |
| Unresolved completed actions | 0 | 0 |
| Contacts without completed observation | 7 | 6 |
| Notification acknowledgments | 0 | 0 |

| Historical provider stratum | Contacts before → after | Confirmed before → after | Completed observations before → after |
| --- | ---: | ---: | ---: |
| OneTrust | 5 → 4 | 2 → 1 | 2 → 2 |
| HubSpot Consent Banner | 2 → 2 | 0 → 0 | 1 → 1 |
| CookieYes | 2 → 2 | 1 → 1 | 1 → 1 |
| Osano | 2 → 2 | 0 → 0 | 0 → 0 |

Across ten fully contacted matched pairs, confirmed decisions fell **3/10 → 2/10 (−10.00 pp)**; completed observations stayed **4/10 → 4/10 (0.00 pp)**. Raw contact completion rises from 36.36% to 40.00% solely because the candidate has one fewer contacted slot after the Sky Bet stop; it is not a recovered observation. There are zero gained sites and one site with a lost confirmation.

Historical provider labels are frozen selection strata. They do not establish the current action-session CMP identity. Unverified identity does not mean no CMP exists. A completed click or observation does not establish registered consent.

[Canonical comparison, action-level evidence, matched pairs and percentage-point changes](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/analysis-verified/run-1/comparison.json) retains every planned slot. [Campaign accounting](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/analysis-verified/campaign-comparison.json) verifies both arms and all retained packet hashes. Native and common verifier outcomes are recorded independently; any disagreement remains visible.

Telefónica Accept is the representative loss: the reference confirmed it, while the candidate completed the click and observation but remained unconfirmed with `sdk_document_changed`, `no_fresh_decision` and `group_universe_incomplete`. Both Reject arms confirmed. The three successful Telefónica paths retained the reviewed 202411.2.0 SDK proof; the candidate Accept retained no applicability proof. This establishes a lost confirmation in this pair, not its cause. Inspect [reference Accept](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/actual-run/visits/01-telefonica.es-accept-reference/result.json) and [candidate Accept](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/actual-run/visits/01-telefonica.es-accept-candidate/result.json).

Positive native continuity witnesses retained by this run: **0**. A run without that witness cannot verify the specific restored-history path. The earlier controlled fixtures remain the evidence for that mechanism. Further public retries would not resolve the missing lifecycle sequence; the next offline investigation should exercise native/Playwright initial-commit ordering, source invalidation and fresh-baseline timing using this loss as a lead. Preserve all source/receipt gates.

## Relation to the earlier table

The fixed 1,576-action historical table remains unchanged: **356 initial confirmations, 1,218 unconfirmed and two aborted/unresolved (22.5888% initially confirmed)**. Including nine already-retained terminal confirmations gives **365 confirmed / 1,209 unconfirmed / two unresolved (23.1599%)**. This is **0.00 pp change and zero newly confirmed historical sites**. OneTrust remains 85 initially confirmed + 363 unconfirmed + one aborted = 449; operationally 86/362/1. Cookiebot remains 122/129 operational confirmations, CookieYes 62/71 and Termly 25/33.

The earlier holdout on different domains showed 3/14 → 2/14 matched confirmations and 7 → 5 completed observations. That campaign used different reference/candidate builds. Do not pool it with this run or infer a rate trend between the samples. [Earlier full provider table](/Users/benmasek/WC01/docs/certscore-v2/cmp-control-binding-fixes-2026-10-29.md) and the historical reports remain preserved.

## Frozen protocol, safety and provenance

The user explicitly authorized a small paired live validation. Fresh central all-channel contact history and the canonical selector admitted 19 of the 25 candidate-pool domains; six were selected before any actual visit: Sky Bet, Telefónica, Golf.com, ITnews, Hotspot Shield and Bluesoft. No cooldown waiver or held target was used. Maximum planned contacts: 24; concurrency: one; fresh isolated sessions for every arm/action; Accept order counterbalanced by site and Reject order reversed. No tuning, replacement site, extra wait or public retry followed results.

Sky Bet's first reference Accept returned HTTP 403. Its remaining three slots were skipped. That contact stays in raw-contact/planned accounting; the incomplete pairs remain visible. Completed pairs must be assessed separately from that asymmetric raw-contact denominator. All other no-go and incomplete outcomes are retained in the canonical comparison.

An initial invocation used relative output paths. Six visitor processes failed while reading their claim files before any attempt marker or browser launch. There were **zero public contacts** in that invocation. Logs and original durable claims remain preserved in [precontact failure proof](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/precontact-failure-proof.json). The corrected immutable plan uses absolute paths and a separate ledger; only the actual visits count toward the same 24-contact cap. This correction is instrumentation work, not a website retry or no-go override.

Reference source/build: `07acf7d02b40ca3f467e6ad518a36cc588deeda91d451ac0391e38901f5e8c90` / `614c8aad555286221c713619a26812cf47b869e9b9501fe9dbde594a3891d368`. This exact prior holdout candidate matches the immediate pre-edit baseline.

Candidate source/build: `362f3c0b20c2b2023e80a362c68e71b892133e2401b0b05daa7922cb7a398a6c` / `c4f3405dc95fb6f0982e256e219958fa2a58a3a1a5a7aed0fa68cfd84d034d1b`. The production source and compiled runtime were frozen before visits. Git metadata base is `ddaebdf6d555f22f3f4e8631c6f4463efdc44848`; the source/build overlays distinguish the arms. [Exact plan](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/actual-plan.json) pins Node, Chromium, Playwright, visitor, coordinator, target, dispatch and session identities.

Budgets remain 20,000 ms result, 14,000 ms search, 2,000 ms confirmation, and 3,000/8,000 ms Accept/Reject observation. Worker settings, first-layer action scope, TLS/public-network guards, exact-target binding, evidence verification, scoring and contact holds remain unchanged. Local browser work adds no recurring AWS cost; the fresh central export and idempotent contact-persistence tasks were estimated below $0.10 total. No infrastructure or recurring spend increase, feature-flag change, deployment or historical report rewrite occurred.

The analysis-only wrapper supplies the omitted historical weighting receipt byte count, then runs the unchanged strict SHA-256/size check. The immutable plan and all action-evidence receipts remain unchanged. [Correction provenance](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/analysis-receipt-correction.json) records this analysis compatibility correction. All 21 packet projections agreed between native and common verification, with zero evidence issues.

The preceding implementation validation passed 809 consent tests, 849 contract tests, 40 scoring/projection tests, 30 sale/sharing tests, typechecks and frozen builds. This turn changes no product code. Contact metadata is persisted centrally and in the repository ledger with an idempotent run key, preserving unrelated entries and stricter states. See [contact provenance](/Users/benmasek/WC01/artifacts/cmp-fix-paired-live-2026-10-29/contact-provenance.json).

Local contact-metadata commit: `e7c333bab4c0dfc0ee9ad539d35593de1a90f885`. It changes only the repository contact ledger; product code remains uncommitted and no push/deployment occurred.
