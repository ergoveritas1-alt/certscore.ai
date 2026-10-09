# Mac mini bot review after the October 9 deployment

Read-only review of the latest 12 completed bot records captured at review start, submitted between 22:33 and 23:13 UTC. All used California. The production web revision remained `803173db229810f977153cc8aa7637effbfe4358`; its successful workflow finished at 21:19:14 UTC (14:19:14 Pacific). The bounded bot log subsequently contained 33 completions after that cutoff, through 23:17 UTC. This is a convenience sample, not a fleet defect-rate estimate.

Read the mounted SQLite database with `mode=ro` and `query_only`, retained JSON files, bot source and installed dependency metadata. Compared existing live API resources and focused consent/forms exports; fetched four available retained form images, which returned JPEG 200, and visually inspected three. No target contact, scan creation, deployment, bot update or restart occurred. Estimated one-time AWS read cost: below $0.10; no recurring increase. Artifacts and hashes are in `artifacts/mini-bot-postdeploy-review-20261009/`.

## Results that agree

All 12 stored scores match the live API and retained Pulse evidence. Canonical forms summaries, score explanations, A/R projections and GPC projections also agree, treating omitted optional fields and null as unavailable rather than manufacturing a mismatch. An initial audit compared JSON serialization and incorrectly reported differences due to object ordering and null omission; the final semantic comparison in `review-checks.json` supersedes that preliminary output.

Ten scans were scored; two correctly remained unscored: transportenvironment.org retained a challenge result and flocktory.com retained an access-denied result. All 12 had evidence JSON retained. No unconfirmed Reject registration was converted into a confirmed-refusal deduction. KSL and AbeBooks each retained completed Accept and Reject captures, separately reporting registration as unconfirmed. Their bot derivatives correctly retain all four completed clicks and captures; no current-sample undercount was demonstrated.

| Site | Score | Forms before / after Accept | Notable coverage |
| --- | ---: | --- | --- |
| xvlivecams.com | 88 | unavailable | Form summary unavailable |
| infomir.com | 46 | 0 / unavailable | No reportable action path |
| medietall.no | 92 | 1 / unavailable | Baseline form retained |
| quizizz.com | 50 | 1 / unavailable | Baseline form retained |
| blueboard.cz | 80 | 1 / unavailable | Baseline screenshot available |
| ksl.com | 80 | 2 / 2 | Both action captures complete; form coverage limited |
| gayporno.fm | 88 | 1 / unavailable | Passive control assessment limited |
| amainhobbies.com | 72 | 0 / unavailable | Form capture limited; not proof of no forms |
| flocktory.com | unscored | unavailable | Access denied |
| umart.com.au | 50 | 2 / unavailable | Baseline forms retained |
| abebooks.de | 92 | 2 / 2 | Both action captures complete |
| transportenvironment.org | unscored | unavailable | Challenge page |

Form totals count reportable phase observations, not deduplicated physical forms across independent visits. KSL's post-Accept row retains an adjacent “Privacy Notice” excerpt, demonstrating that disclosure capture is not universally absent. Its excerpt is bounded/truncated; do not infer more from it.

## Recommended fixes, in priority order

1. **After-click form images:** all four post-Accept form rows across KSL and AbeBooks report `structured_capture_only`. `post-accept-observer.ts` starts structured form capture after a completed click, but returns from its unconfirmed-registration branch before starting `startRegisteredPostAcceptFormSnapshots`. This is a producer coverage restriction, not an image-route failure. Consider extending the existing bounded, masked and reviewed capture to completed unconfirmed Accept clicks with explicit after-click provenance. Do not invent a registration timestamp, weaken safety review or relabel the result confirmed. The prepared structured-field reconciliation patch does not resolve this branch. Check cost approval for any additional image work before implementation.

2. **Terminal evidence state in the bot and API:** two of the 33 logged completions (merlion.ru and xxxjmp.com) were labelled `evidence=pending`, but existing evidence reads still return 409 `scan_unavailable`. Their API scan resources retain explicit terminal no-go reasons. The bot's reconciliation query excludes `completed_limited` evidence-pending rows, so these records do not actually reconcile. Store an explicit unavailable/no-go evidence state and retain the scan resource/reason locally; reserve pending for recoverable publication/retrieval states. The Pulse error should preserve the available terminal reason instead of claiming there is no access/interruption evidence. Do not automatically rescan these sites. Merlion's resource also deserves reason-taxonomy review: its excerpt describes landing on merlion.com rather than merlion.ru, while the reason/title describe a screenshot failure.

3. **Bot privacy-policy field:** normal ingestion fills `privacy_policy_captured` from `cookie_notice_policy_availability`. That is a cookie-disclosure check, not a privacy-policy check. Split the concepts and derive each from its corresponding canonical projection. Preserve original JSON and backfill only derived local fields. The installed SDK is 0.2.11; updating types alone will not change this parser. The bot also bases action counting on `afterAction`; move to canonical `execution` for future-proof success counting while preserving click completion, capture completion and registration separately. All four sampled action captures already count correctly.

4. **Bot timing and serial reads:** terminal-resource observation followed the recorded scan `completedAt` by a median 5.989 seconds, max 14.050 seconds. Local evidence storage followed by a median 8.988 seconds, max 20.482 seconds. AMain reported 43.9 seconds but took 64.387 seconds from submission response to storage. The bot fetches findings, pre-consent resources and Pulse evidence sequentially after terminal resolution. Measure and expose end-to-end timing separately; evaluate bounded parallel reads or eliminate the redundant findings request when the retained evidence provides the required fields. These intervals include polling, network and client work; they are not pure server projection timings or proof of a new regression.

## Further investigation, not established defects

AMain retains a score-neutral confirmed post-Accept activity finding while public action sections are omitted because the passive control assessment is unusable. That follows the current shared eligibility rule, but merits upstream consent-capture investigation; do not promote raw action context into a passive control assessment. The sample contains ten indeterminate GPC comparisons, two no-observable-response comparisons, nine complete bounded observations, one limited observation and two unavailable observations. Completed observation is separate from a verified paired privacy response; no scoring change is warranted from those counts alone.

No live browser interaction check was completed in this review. Existing production links for inspection:

- [KSL](https://certscore.ai/scan/8afd1393-12e3-432c-b6b3-88126eca5697)
- [AbeBooks](https://certscore.ai/scan/4dedf307-25e5-4074-af7b-cda4a877d238)
- [AMain](https://certscore.ai/scan/517d84c5-8b68-4493-af21-a49ef55f92a7)

This review changes documentation only. It does not implement the recommended bot or scanner changes.
