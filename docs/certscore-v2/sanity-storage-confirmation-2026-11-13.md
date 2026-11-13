# CertScore.ai Sanity consent-storage confirmation — November 13, 2026

Sanity renders duplicate Osano instances. The clicked banner writes a fresh consent receipt while the exposed API remains at its previous state without a corresponding saved event. API-only confirmation therefore remained unconfirmed even though the clicks completed. This follows the instance-binding repair documented in `sanity-confirmation-2026-11-13.md`.

The shared Accept/Reject implementation now supports `osano_complete_cookie_receipt.v1`, using the source-reviewed Osano writer protocol. This is provider support, with no Sanity hostname exception. The reviewed source SHA-256 is `15e57f9e4a2e7a53de50e60783790b28e4f9db707f219ca2207e1cdb955ba268`; this identifies the reviewed protocol source, not verification of live script bytes.

Confirmation requires a pre-click control bound to the Osano window, identical bounded Osano script configuration, unchanged document/API instance, and no intervening saved API event. A fresh instrumented cookie assignment must match the exact browser cookie identity/value and localStorage readback. Both receipt timestamp and observed write must follow dispatch. Complete ANALYTICS, MARKETING and PERSONALIZATION values must agree with the requested choice. ESSENTIAL, STORAGE and OPT_OUT remain explicit separate values; confirmation does not assert all-purpose consent, sale/sharing opt-out, or enforcement by downstream services.

The decoder is bounded to 2,048 encoded bytes. It rejects ambiguous cookies, stale/reversed state, changed configuration/document/identity, nonempty external identity, duplicate JSON fields, partial categories and unsupported extensions. The reviewed writer includes empty external identity and an empty IAB serializer even with TCF disabled; only those exact empty structures are allowed and stripped. Active TCF state remains unsupported by this fallback. Encoding is not authenticity: the separate observed write and readback checks are mandatory. A fresh conflicting API event is never overridden.

Typed proof passes through packet validation, terminal decision evidence and report projections. It contains hashes, clocks and fixed category values, not the raw encoded receipt or identifiers. Historical packets are unchanged. Osano recipe version advances to v3. There is one parallel baseline read and at most two bounded post-action read pairs within existing confirmation windows. No extra action, wait, worker memory, observation tail or budget increase was introduced. Estimated recurring increment is below $0.50/month at 100,000 scans, disclosed before implementation; local execution adds no recurring AWS infrastructure.

## Verification

The initial four localhost diagnostic scans remained unconfirmed while the decoder was narrowed against the actual writer shape. One intermediate instrumentation attempt failed before changing code; its scan still ran and is included in the six-contact accounting. The initial HTTP 429 submission created no scan/contact. Temporary diagnostics were removed; sanitized shape evidence is retained locally.

Two final sequential full localhost scans verified packet checksums, contract validation, ready report projections, completed observation and retained receipt proof:

| Scan | Accept packet / worker | Reject packet / worker | Retained post-Accept forms / images |
| --- | --- | --- | --- |
| `285d7ce2-dfcc-4a99-8e76-2a00b11e8e1e` | 7,076 / 7,150 ms, confirmed | 12,353 / 12,407 ms, confirmed | 2 / 2 |
| `4d96b7a8-b102-4744-af39-020748bf8c1b` | 6,563 / 6,629 ms, confirmed | 11,855 / 11,898 ms, confirmed | 2 / 2 |

Both reports contain four available form snapshots across their retained capture phases. The packet/worker times above are action-lane totals, not whole-scan latency. The report proof and exact checksums are retained in `artifacts/sanity-storage-confirmation-20261113/final-verification.json`.

The full retained-action reliability command passed 170 tests before seven additional receipt regressions were added; the final receipt suite passes 64 tests. Tests cover source-encoder vectors, both choices with duplicate instances, terminal-only confirmation, stale/mixed/conflicting state, ambiguous identities, malformed/active IAB data, proof propagation, altered document binding and the two-read cap. Scan-core and Lambda TypeScript checks and the local build passed. All 86 surrounding adapter/recipe/confirmation/terminal tests passed across the initial run and recipe rerun. The first run exposed two old v2 recipe assertions; both were updated to require Osano v3 while keeping HubSpot v2, and all 13 recipe tests passed on rerun.

All six contacts use the owner-authorized cooldown waiver and are accounted for under idempotent central keys `sanity-storage-confirmation-20261113-intermediate` (two) and `sanity-storage-confirmation-20261113-followup` (four). The reviewed repository ledger candidate preserves unrelated targets. Registry validation passes. A localhost-only quota fixture temporarily opened one test slot per run and restored the offset while preserving actual new usage; production quotas were unchanged.

No deployment, SITS scan or ergoveritas scan occurred. These targeted checks verify this retained failure and provider contract; they are not a rotating release acceptance sample or a guarantee against future unsupported Osano formats.
