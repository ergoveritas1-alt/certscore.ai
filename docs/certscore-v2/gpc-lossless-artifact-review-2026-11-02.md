# CertScore.ai lossless canonical artifact review — November 2, 2026

Local implementation only. No push, package publication, deployment, production database access, artifact retrieval, public visit, paid model call, flag change or infrastructure change. This follows the final-retention review in `gpc-retention-finalization-2026-11-02.md` and preserves the concurrent working tree.

## Problem and representation

Some already-compacted worker cores remain above the existing 409,600-byte retention target. Their original optional GPC cookie-read binding therefore could not fit, even after all legacy event selection and window restoration finished. Raising the limit or removing other evidence would change the approved bounds or evidence quality.

The server-only `canonical-evidence-artifact.ts` helper introduces `certscore.canonical-evidence-artifact.v1`: strict JSON with `artifactFormat`, `encoding=gzip_base64`, exact decoded size, decoded SHA-256 and base64 payload. It gzip-encodes the producer's compact JSON at level 1 only for supported canonical bundles above 409,600 bytes, at most 20,000,000 decoded bytes, and only when the resulting stored JSON is smaller. Every logical JSON value, additive field and array order survives; source objects are not mutated. Small JSON, unsupported producer versions and incompressible evidence keep their ordinary representation.

The decoder requires the exact format/encoding/key set, canonical outer JSON/base64, supported inner canonical schema version, bounded native decompression, exact decoded size/SHA, valid UTF-8 and one layer. Invalid encoded data produces a bounded generic error without payload text. Existing typed readers retain their schema pass; generic artifact readers validate the decoded canonical schema and return the original parsed JSON without stripping additive fields. Plain legacy JSON keeps its existing parse semantics.

The helper is private and server-only, imported through `@certscore/contracts/dist/canonical-evidence-artifact.js`. The existing AWS images already copy that directory; no new package export map, root shim, runtime-base rebuild or infrastructure configuration is needed. It is absent from the browser contract barrel and standalone public API/SDK/MCP contracts.

## Retention and proof gates

All existing event selection, recipient prioritization, caps, window restoration and incomplete-window decisions continue to use ordinary logical JSON sizes. Compression cannot promote a window or displace another retained observation. Only the final original optional cookie-binding fit uses the stored representation, with the same core allowance and separately bounded graph/form-image treatment.

The compactor reattaches only the original binding to the same original snapshot identity/time. It cannot create a binding, reconstruct a cookie-read time, assert inventory completeness, promote baseline capture coverage, or label a cookie snapshot as taken at the matched request horizon. If lossless storage still cannot fit, the existing conservative omission remains. Arbitrary large/incompressible evidence is not guaranteed to fit; no limit is relaxed.

There is no finding, score, severity, status, jurisdiction, checklist, priority or historical-policy change. GPC delivery, semantic completion, independent visit identity, request ancestry, actual collection, request-local restrictions and CMP section/version/notice/known-axis gates remain authoritative. Compression cannot make an unavailable CMP state comparable or turn zero early-window activity into honoring.

## Stored-byte ancestry and handoff

The existing writer and Lambda upload flow bind size/SHA receipts to the actual stored envelope bytes. The decoded checksum is additional integrity, never an original worker receipt. Existing producer, coordinator, GPC impact/completion/production, policy review, result ingestion, mirrored/transfer/S3 materializer, completion diagnostic, admin and local evidence readers decode after their existing original-byte checks. No additional artifact fetch or publication is introduced. CLI readers and daily retained-audit readers accept both formats; they retain their existing source-authority requirements.

Tests create new synthetic original bytes and legitimate pointers. The oversized synthetic producer fixture retains its original cookie proof through encoded worker bytes, coordinator, canonical runtime, concern/policy, unified details, persisted hydration, web/API/JSON/PDF model/Markdown/MCP and SDK projections. The coordinator fixture still makes four original-byte reads, uses the same workers, and publishes once. Public projections contain neither the storage envelope nor its payload.

Daily retained-artifact audit readers were updated and reviewed source pins refreshed locally. Existing paired-evidence statistics, denominators, schedules, prompt, model, query budgets, checkpoints and dashboard data remain unchanged. The audit was not executed.

## Legacy and cache boundary

Readers continue to accept ordinary historical JSON and missing optional fields. Existing originals, receipts and historical reports were not rewritten, reclassified or reconstructed. The four prior target scans still lack their original cookie binding; hypothetical compression of those originals does not add one. CNN's absent GPP/CMP comparison remains absent.

The existing materialization cache is v47 and the public projection remains v27. This representation-only change needs no additional global cache/version bump: existing immutable raw-byte identities distinguish future sources and outputs. No migration, report-time reconstruction, lazy repair or historical backfill is added.

## Local evidence and limitations

Receipts and exact commands/results are in `outputs/gpc-lossless-artifact-2026-11-02/verification-summary.json` and adjacent logs.

- All 60 already-local originals passed original receipt verification, exact logical JSON round-trip, source-immutability and unchanged legacy-retention comparisons. Hypothetical compact storage totaled 12,846,407 bytes versus 94,006,627 compact logical bytes. Only 53 of those original JSON values would fit without any further compaction 409,600 bytes; this is an internal representation evaluation, not production population coverage or newly published evidence.
- After the unchanged legacy compactor and existing separate graph/image/local-ledger budget exclusions, 54 of the 60 hypothetical cores fit the target. Six older cores remain 465,301–2,322,558 stored bytes, principally large retained `observedJourneys` inventories. They continue to omit optional proof rather than lose evidence or exceed the allowance. An internal stronger-compression review was not enabled: Brotli quality 4 would fit five of these six, while the largest would still need about 516,928 bytes including base64/envelope. This release does not promise that arbitrary evidence can fit a fixed byte limit.
- CNN's retained GPC original is 970,046 logical bytes; hypothetical encoded storage is 81,420 bytes. Ars Technica, GEICO and Best Buy GPC originals would store as 107,260 / 80,908 / 122,981 bytes. No old missing proof was added and Best Buy's failed visit remains non-reportable.
- The new oversized synthetic retained core is 1,238,844 logical bytes / 52,853 stored bytes with its original cookie proof. The proof adds 597 logical bytes and 276 stored bytes versus the same retained fixture without it; the private binding itself is 579 JSON bytes. This fits the unchanged core allowance without removing an existing fact.
- Twelve local rounds per original measured mean per-source medians of 7.30 ms encoding and 11.54 ms decoding with schema validation. Paired JSON-baseline measurements across twenty rounds per source measured 5.36 ms mean extra encoding and 1.70 ms extra decoding. The synthetic full compaction/encode/decode loop averaged 28.83 ms. These are local Node timings, not Lambda billing, latency savings or production coverage.
- Adversarial fixtures cover corrupted outer receipts, inner sizes/hashes/base64/versions/schema, truncated/duplicate/unknown envelopes, nested envelopes, invalid UTF-8, bounded decompression, incompressible fallback, source immutability and optional-proof fail-closed retention. Existing findings and public wording are compared unchanged.
- Web and PDF verification here is canonical model/export/handoff regression coverage. No new product layout is introduced, and no fresh browser screenshot/PDF visual review or public scan is claimed.

## Remaining verification limits

The ten relevant package typechecks, focused typecheck, contracts/core/API builds, public-contract drift check and focused fixture suites pass. The broader `preflight:fast` attempt against `6a9d197a207765ea958059d6ee2f2b2fdd94aa07` stopped at the MCP release-metadata lookup because the offline harness rejected its external fetch; its four hermetic release-asset tests pass. The aggregate is not a full pass and later stages were not reached. No archive was downloaded.

An additional broad standalone-CLI TypeScript audit reports 48 diagnostics; an in-memory comparison replacing the new codec calls with their previous `JSON.parse` calls reports 49, with no new diagnostics from the codec. Those unrelated standalone-script errors remain unresolved and are listed in `tooling-diagnostic-comparison.json`. This does not contradict the passing package and focused typechecks, whose configured scopes differ.

## Cost and release order

Local recurring AWS increment is **$0/month**. No capture, invocation, fetch, wait, timeout, worker size, model budget, retention duration or configured capacity changes.

For a future release, reserve **$0.90/month gross** at 100,000 scans and 30-day retention before storage/transfer savings. Planning uses 15 possible encodes, 32 decodes and two extra full schema checks per scan, the measured paired local overhead above, 3 GB and $0.000016667/GB-second: approximately $0.79/month, rounded upward to $0.90. This is a planning estimate, not a guaranteed billing cap. Stored bytes decrease when encoding is selected, so no storage increase is assigned to the codec. Do not spend hypothetical storage savings as measured production savings.

The conservative combined pending CMP/GPC candidate is therefore **$9.65/month** ($8.75 previously disclosed plus $0.90), above the existing **$8/month approval**. Future release remains on hold until headroom is demonstrated within that allowance or separate approval is obtained. No additional allowance or release action is inferred.

Release compatible web/validation/materializer/audit consumers before enabling new producer bytes through separate reviewed source releases and the repository AWS workflows. Allow in-flight older readers to drain before producer promotion; do not assume one simultaneous rollout is sufficient. Preserve required local/CI/image checks and obtain separate deployment authorization. No production flag or compatibility switch is introduced here.

Additional CMP adapters, returning-visitor/persistence/override actions, extra captures, public recalibration, alerts, webhooks and monitoring remain outside this change.
