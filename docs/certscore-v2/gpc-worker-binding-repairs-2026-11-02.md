# CertScore.ai GPC worker binding repairs — local verification

Implementation base: dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`. Concurrent CNN, GPC product and audit edits are preserved. Authorization: “fix the shared GPC commit timestamp and cookie snapshot binding locally. Reuse the existing reads, keep proof gates and budgets intact, and verify with fixtures. Don’t push or deploy.”

## One original commit event

The existing GPC observation CDP session forwards its document request, commit and same-document navigation events to the impact observer. Both retain the commit observer's single original timestamp. The existing metadata session continues document identity and initiator work, with its duplicate impact forwarding disabled only when the GPC session was installed successfully and GPC is enabled. Baseline and unavailable-session paths retain their original source.

No timestamp tolerance, rounding, replacement of historical values or relaxed comparison gate is introduced. Supplied timestamps must be safe integers within the capture interval and no later than the existing clock. Document replacement, recommit, changed/unknown history identity, readback mismatch and frozen-capture rules remain fail-closed. Impact still freezes at the existing signal read; its frozen result is reused at return.

## Private metadata for the existing cookie read

Optional `cookieSnapshots[].gpcReadBinding` uses the strict, independently versioned `certscore.gpc-cookie-read-binding.v1` schema. It records scan/capture/snapshot identity, private loader token, target/document hashes and original commit/read times. It contains no cookie values, new cookie inventory, raw URLs or storage values. It is limited to 2,048 compact bytes; times are integers in 0–120,000 ms with ordered commit/start/end.

The builder reuses cached before/after document identity and the start/end/success facts around the existing final browser-context cookie read. Actual GPC header delivery, navigator readback, exact source/session/document binding, matching commit timestamps, unchanged session finalization and semantic read timing are required. The existing signal read precedes the cookie read; the same-document semantic observation follows completion. Failed reads, cancellation, navigation, stale timing, missing delivery or mismatched bindings omit the field. GPP readiness is not required for this private cookie-read context; unavailable GPP does not become honoring or successful choice evidence.

This is separate from baseline-only `captureCoverage`. The baseline exclusion for GPC remains intact. Fixed `inventoryCompleteness=not_assessed` and `matchedRequestHorizon=not_established` prevent treating this terminal point-in-time read as a complete inventory or a snapshot at the request-count horizon. The optional proof is discarded before it can displace legacy retained evidence at the unchanged 400 KiB core allowance. Exact boundary and oversized-retention fixtures compare feature-on/off results.

The internal reader accepts only an already byte-length/SHA/schema-verified isolated GPC worker source. It rechecks lane/region/scan, the inline original session SHA, root capture/document binding and read timing. Cohort diagnostics report only counts and bounded relative read times; tokens and inventory contents remain private. Existing public API/SDK/OpenAPI contracts do not expose this worker metadata. The end-to-end public handoff fixture verifies its omission, including document tokens, across the existing projections.

## Compatibility and verification

Legacy records omit the optional field. No baseline reconstruction, report-time read, artifact fetch, database migration, cache invalidation/backfill or historical rewrite is added. No finding, severity, jurisdiction, response status, scoring policy or checklist eligibility changes. Public cookie/storage comparison remains a separate later phase requiring its own completeness, checkpoint and source-pair proof; storage still lacks document/read-interval binding.

Final checks are recorded under `outputs/gpc-worker-bindings-2026-11-02/`:

- Existing GPC production and presentation predeploy stages: **330 + 7 tests passed**. Retention and response regressions: **69 passed**. No failures/skips. An additional four-test final run covers the strengthened exact retention-boundary assertion. New contract, shared-stream and cookie-binding tests enter existing GPC predeploy coverage.
- Fixture Chromium pair: exactly equal GPC commit timestamps, retained private binding, unchanged two baseline cookie reads and one GPC cookie read. The CDP fixture asserts the unchanged command list. Browser requests are intercepted and unexpected external continuations rejected; no public scan was performed.
- Contracts, scan-core, Lambda, web, validation-worker, API contracts, SDK and MCP typechecks passed, together with strict fixture/test types. Scan-core build (including contracts/dependencies), API-contracts build and standalone GPC contract drift check passed.
- Original-byte replay of all **26** already-local pairs retains **22** request comparisons and **5** collection packets. All observations, assessments and activity packets match the previous replay. Four historical clock mismatches remain mismatches; all old GPC cookie bindings remain absent. This convenience cohort does not establish production coverage.
- All 54 existing daily-audit source pins still match. No automation edit, production query or scheduled audit run was needed. `git diff --check` passed. The full fast preflight was not repeated; the relevant GPC stages and additional retention checks were run directly, with exact commands/exit codes in the receipts.

Adversarial review covered original size/hash verification, copied scan/session/lane/region facts, wrong loader/URL/capture identity, stale reads, future commit timestamps, missing header/property proof, changed/returning history, cancellation, retention displacement, legacy omission and private-field leakage. The public handoff fixture preserves the existing canonical findings with the feature present/absent. Existing legacy cookie-name fields were not reclassified or rewritten.

## Measurements and release boundary

The synthetic proof adds **597 compact bytes** or **742 pretty-serialized bytes** to its original fixture. The actual Chromium proof was 597 compact bytes. The pure metadata builder averaged **0.00474 ms** across 10,000 iterations (47.44 ms total), excluding browser work; this is not measured Lambda time. Exact measurements are in `measurements.json`. No browser read, CDP command, session, wait, timeout, capture window, model call, invocation, object fetch or publication was added.

Local recurring AWS cost is **$0**. Conservative future incremental reserve for this phase: **less than $0.25/month** at 100,000 scans and 30-day retention, allowing 2 KiB metadata, ten retained copies, three transfer copies and 10 ms processing at 3 GB per scan. Planning rates are $0.03/GB-month storage, $0.09/GB transfer and $0.000016667/GB-second compute; these are conservative planning assumptions, not a billing measurement. No configured capacity or paid-service increase occurred. Added cost was disclosed before proceeding.

Combined with the previously documented $8.50 pending-release estimate, the conservative candidate envelope is at most **$8.75/month**, above the existing **$8** approval. Release must establish headroom within $8 or obtain separate approval; this local implementation authorizes neither an allowance increase nor deployment. Avoiding retained metadata would cost less but leave the known binding gap.

For any separately authorized future release, ship compatible optional-field consumers before new producer packets through the repository AWS workflows. Old reports remain readable without the field. Nothing was pushed, published or deployed.
