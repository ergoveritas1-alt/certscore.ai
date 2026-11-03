# CertScore.ai lossless fallback for large GPC artifacts — November 2, 2026

Local implementation and verification only. This continues `gpc-lossless-artifact-review-2026-11-02.md`; its six remaining oversized cores are now covered in the local evaluation. No public visit, paid call, AWS access, original artifact rewrite, historical report reconstruction, push, publication or deployment occurred.

## Representation and proof

The existing private gzip v1 format stays byte-for-byte identical whenever it fits the unchanged 409,600-byte core target. Ordinary small JSON also stays identical. If supported canonical JSON is within the existing 20,000,000-byte decoded limit, gzip is smaller than ordinary JSON, and gzip still exceeds the target, the serializer evaluates one fixed native Brotli candidate: quality 6, window 24. It selects that candidate only if it is smaller than gzip. Failure or a larger candidate preserves the exact usable gzip representation. Incompressible and unsupported JSON retains its existing ordinary representation.

The additional format is `certscore.canonical-evidence-artifact.v2`, strictly paired with `encoding=brotli_base64`. The v1/gzip and v2/Brotli envelopes form a named discriminated union; cross-version encoding combinations are rejected. Both retain the same decoded size/SHA and exact logical JSON values. Decoding requires canonical envelope/base64, exact keys, original size/hash, supported inner schema, valid UTF-8, one layer and native bounded output. Brotli's large-window extension is explicitly disabled, retaining the standard maximum window of 24. No dependency, public barrel/export, configured memory, timeout, capture, wait, fetch, lane or publication is added.

Existing readers continue verifying the authoritative stored-byte length/SHA before decoding. The inner decoded checksum never becomes an original receipt. All existing source/lane/scan, session/document, GPC delivery, semantic, comparison-context, CMP state/version/notice, response/request ancestry and historical-policy checks remain unchanged. A better representation cannot establish unavailable GPP/CMP facts, purpose, honoring, causation or a legal result.

The canonical compactor still performs every legacy event/window/recipient retention decision using ordinary logical JSON sizes. Only final original optional cookie-proof fit uses the stored representation, with the same existing exclusions for separately bounded graph/image/local-ledger data. No fact is removed to obtain these gains. A snapshot still needs its own original verified read binding; fitting storage cannot supply an old missing timestamp, baseline completeness or a matched-request cookie horizon.

## Read-only local results

All 60 original local receipts were checked before evaluation and verified unchanged afterward. Their full original JSON round-trips exactly, including additive fields; typed legacy retention output remains identical. This is an internal replay, not new source receipts, published historical evidence or production population coverage.

All **60/60 hypothetical retained cores now fit** the existing target, versus 54/60 previously. Six use Brotli v2, 53 keep gzip v1 and one keeps ordinary JSON. All 54 already-fitting representations remain byte-for-byte identical. Total stored core bytes decrease from 12,262,142 to 7,826,642 under the same budget exclusions.

| Original source SHA prefix | Previous stored core | New stored core |
| --- | ---: | ---: |
| e6572c2a93d8 | 539,853 | 148,635 |
| 5c88d5fd6865 | 2,322,558 | 395,424 |
| 179cc1cf429a | 653,573 | 181,351 |
| f20d4ba650a3 | 986,029 | 141,895 |
| 861b8ab02da1 | 592,873 | 106,863 |
| 69dc308fcf57 | 465,301 | 150,519 |

The new deterministic cookie-read fixture has 5,018,767 logical bytes with proof. Gzip alone needs 2,063,117 bytes before the proof; v2 stores the retained fixture with its original proof in **59,483 bytes**. The proof adds 597 logical bytes and 224 stored bytes; all other retained facts match. Compaction averaged about 70 ms locally over twenty rounds. These are local timings, not Lambda measurements.

The fixture uses newly created original bytes/pointers and checks exact source hashes and cookie binding. Version-2 bytes also survive the existing coordinator with paired CMP-state and collection packets, original read counts, unchanged workers and one publication. Tests cover file writing, ingestion/cache, policy review, transfer/materialization, hydration, web/API/JSON/PDF/Markdown/MCP and SDK projections. Public outputs exclude both private envelopes and cookie/document bindings. Existing findings, priorities, effects and customer wording are compared unchanged.

Adversarial checks cover both version/encoding combinations, original size/hash, malformed base64, truncation, extra/duplicate keys, unsupported schema, invalid UTF-8, nested envelopes, expansion bounds, unsupported large windows and failed/larger native encoding. Old plaintext and oversized gzip remain readable. Arbitrary future evidence is not guaranteed to fit; conservative omission remains when neither lossless representation fits.

Daily retained-artifact audit source pins were refreshed for the reviewed codec/test dependencies. Existing paired-evidence statistics, denominators, schedules, prompt, model, query budgets, checkpoints and dashboard data are unchanged. The audit was not run.

## Cost, compatibility and remaining release gates

Local recurring AWS increment is **$0/month**. Twenty paired local rounds per source measured a mean additional encoding cost of 1.322 ms versus the prior codec; mean decoding difference was -0.538 ms. Ignoring that apparent local decoding improvement, 15 encodes/32 decodes per scan at 3 GB, 100,000 scans/month and $0.000016667/GB-second add about $0.099/month to the previous $0.788 planning calculation. The combined codec calculation is approximately $0.888/month, rounded conservatively to **$0.99/month gross**, with no production storage or latency savings claimed.

The combined pending CMP/GPC candidate becomes **$9.74/month** ($8.75 previously disclosed plus the $0.99 codec reserve), above the approved **$8/month** envelope. This is a planning estimate rather than a billing cap. Deployment remains held until headroom within that allowance is established or separate approval is obtained; no configured spending increase is authorized.

No public schema/status/version, database schema or additional materialization/projection cache bump is needed. Existing materialization v47 / projection v27 readers keep historical records readable; their existing immutable source identities distinguish future encoded sources. The original CNN and other retained reports still lack any cookie proof not originally retained. They are not rewritten by this evaluation.

Compatible v1/v2 readers must ship before v2 producers in separate reviewed source releases through the repository AWS workflows, with older in-flight readers drained before producer promotion. No runtime-base/dependency rebuild, flag change or deployment is authorized here. Existing aggregate-preflight GitHub metadata and standalone-CLI verification gaps remain separately recorded; focused checks are not a full release-preflight pass. Additional CMP adapters, actions, capture increases, returning-visitor inference, alerts and monitoring remain excluded.

Exact commands, results, source hashes and measurement receipts are in `outputs/gpc-lossless-options-2026-11-02/verification-summary.json` and adjacent files.
