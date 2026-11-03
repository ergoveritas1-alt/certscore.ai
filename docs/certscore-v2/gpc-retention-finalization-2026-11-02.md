# CertScore.ai GPC retention finalization repair

Local implementation against dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`. Existing concurrent edits are preserved. No additional public scan, paid call, production access, push, package publication or deployment occurred.

## Implemented repair

The optional private GPC cookie-read binding was discarded before the existing event compaction stages. That was unnecessarily permanent when those stages subsequently left sufficient space. The compactor now retains a reference to the original proof, completes every existing event-selection and window-restoration decision, and then reattaches the proof only if the final core fits the unchanged 409,600-byte target.

Restoration uses the original snapshot index plus exact artifact ID, capture time and consent-state identity. It never creates read times, copies proof to another snapshot, evicts an event, changes a window digest/completeness result or lifts the target. If the final result has insufficient space, the proof remains absent. Legacy sources with no proof retain the exact previous behavior. The schema, contract version, baseline-only cookie coverage policy, private reader, source-hash gates and public API/SDK/MCP contracts are unchanged.

Only `packages/certscore-scan-core/src/index.ts`, its cookie-binding regression test and its synthetic fixture helper changed in product/test source. No scanner capture or reporting logic changed. New cases enter the already-configured GPC predeploy stage. This producer-only repair does not change report caches, require a migration, reconstruct old proof or trigger a backfill.

## Evidence and verification

The new deterministic worker fixture contains 400 synthetic late asset requests. Its own session receipt is created when the fixture is constructed; no historical receipt is replaced. Ordinary existing compaction retains the same priority-selected observations with the feature present/absent. The test verifies exact equality after excluding only the optional binding, successful original-source schema verification, identical canonical GPC observations, source immutability, correct snapshot ownership and omission when the final byte headroom is insufficient.

| Measurement | Result |
| --- | ---: |
| Synthetic input compact JSON | 1,571,031 bytes |
| Prior compacted result | 370,432 bytes |
| New compacted result | 371,029 bytes |
| Added original private metadata | 597 bytes |
| Existing core target | 409,600 bytes |
| Whole compactor median, prior / new | 18.61 / 18.98 ms |
| Paired local increment, median / p95 | 0.36 / 2.05 ms |

Timings use 50 alternating warmed synthetic runs. They measure local processing, not Lambda billing, savings or production population coverage. The raw input is still subject to existing retention policy; this repair drops no additional evidence and preserves every prior retention decision.

An exact pre-edit source copy was verified against its recorded SHA-256 before comparing old/new implementations. All **60 already-local original sources** (26 older pairs plus the four fresh CNN/Ars Technica/GEICO/Best Buy pairs) passed their original size/SHA/schema checks and produced identical legacy retained results. Source bytes remained unchanged. Evaluation outputs are internal and do not become historical report evidence or original artifact receipts.

Final verification:

- Existing GPC production stage: **331 passed**; presentation/handoff stage: **7 passed**; retention/response regressions: **69 passed**. **407 test executions, zero failures/skips**, with overlapping coverage noted.
- Scan-core build, including its contract/dependency builds, passed.
- Scan-core, Lambda, web, validation-worker and strict fixture/test typechecks passed.
- Standalone GPC API/OpenAPI/SDK drift check and `git diff --check` passed. No public schema regeneration was needed.
- All **54** existing daily-audit source pins match. No automation setting, source pin, query, scheduled run or dashboard was changed.

Exact commands, logs, source hashes, measurements and the old/new comparison are in `outputs/gpc-retention-finalization-2026-11-02/`. The full fast preflight was not repeated; the relevant existing GPC stages and additional retention suite were run directly. Current tests and fixtures were adversarially reviewed for cap crossing, source verification, mutation, snapshot ownership, legacy equivalence and public-field omission.

## Limits and wording correction

This repair does not make the four recent real-site artifacts fit. Their final GPC cores still exceed the existing target, and they did not retain original read intervals that could be reconstructed. Their private cookie bindings remain absent. Source sizes are recorded in the prior fresh-scan receipts. Preserving all logical retained facts while reducing those larger JSON cores needs a separate lossless-representation review and complete consumer/producer handoff. No codec, field removal, cap increase or historical rewriting was introduced here.

The prior three-target note described an apparent repeated full-context sentence. Inspection of the actual retained API guidance and rendered HTML establishes two distinct facts: **GPC-off** readback unverified and **GPC-on** readback unverified. The screenshot was misread. No deduplication or wording change is warranted; both visit limitations remain intact. This corrects that note's visual interpretation without altering its original receipt or any report.

No UI or PDF source changed in this phase. The existing shared handoff and browser fixture regressions passed; earlier fresh-report screenshots and PDF reviews remain separate evidence for their original source states.

## Cost and future release boundary

Local recurring infrastructure cost is **$0/month**. This repair stays within the previously disclosed **less-than-$0.25/month** private-metadata planning reserve at 100,000 scans and 30-day retention: at most 2 KiB per produced proof, ten stored copies, three transfer copies and a conservative 20 ms processing reserve at 3 GB. Planning rates of $0.03/GB-month, $0.09/GB transfer and $0.000016667/GB-second give approximately $0.217/month, rounded to $0.25. This is an estimate, not measured production billing. No configured capacity, capture budget, browser read, invocation, model call, object fetch, wait or publication was added.

The combined pending-release candidate remains at most $8.75/month against the existing $8 approval. Release still requires headroom within that approval or separate authorization. Compatible consumers must precede future producer releases through the repository AWS workflows. No release action is authorized by this note.
