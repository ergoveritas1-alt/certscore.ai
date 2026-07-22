# Deliberate Lambda/browser score-pair contract

Status: **deployed; production migration verified; owned browser member pending**. This contract
supports the active Luna scoring goal. It does not approve candidate-v3 or customer cutover.

## Purpose

Collect one Lambda scan and one browser-extension scan for the same exact normalized
requested URL as an intentionally coordinated diagnostic pair. The pair explains whether
source divergence comes from coverage projection, eligible finding projection, or both.

Pair membership is not evidence equivalence. Only equality of the canonical whole-input
fingerprint can satisfy the existing exact-input cross-source lane.

## Non-negotiable invariants

- Never infer a pair from hostname, time proximity, account, region, IP address, or browser
  geography.
- Require the same hashed normalized requested-URL key on both completed comparison rows.
- Require exactly one `lambda` source-family member and one `browser_extension` member.
- Keep browser region unknown. Pairing must not assign Lambda geography to the browser run.
- Persist only SHA-256 pair/target/component fingerprints, scan IDs, bounded counts, source
  family, model version, and timestamps. Do not persist a raw URL, domain, evidence payload,
  cookie, request body, or free-form note in the pair contract.
- Pair creation is internal/admin-only, idempotent, and rejected after either member has
  already been paired for the same model version.
- Pair rows are immutable. Corrections create a replacement pair and retain the withdrawn
  pair for audit; they do not rewrite scan evidence or score assessments.
- Customer reports remain on the legacy selector until Luna approves the exact model and
  the controlled cutover flag is enabled.

## Persistence shape

Use two bounded tables rather than overloading scan request metadata:

1. `score_shadow_collection_pairs`
   - canonical SHA-256 pair key
   - model version
   - comparison group key and exact comparison target key
   - state: `active` or `withdrawn`
   - created/withdrawn timestamps
2. `score_shadow_collection_pair_members`
   - pair key
   - scan ID
   - source family: `lambda` or `browser_extension`
   - immutable uniqueness on pair/source-family and pair/scan

The pair-registration service must load the already-persisted shadow comparison rows and
validate target equality, model equality, source-family separation, completed score
materialization, canonical fingerprints, and bounded component counts in one transaction.

## Monitoring projection

Add a separate `deliberateCrossSourcePairs` section to the internal monitor. For each active
two-member pair it reports:

- score minimum, maximum, and range;
- `exactInputMatched`;
- `coverageProjectionMatched` and both coverage-row counts;
- `findingProjectionMatched` and both finding counts;
- source families and observed Lambda region, while retaining browser region as unknown.

This section is diagnostic. It must not increment `equivalentInputCrossSource` unless the
whole-input fingerprints are equal. Component equality can explain a mismatch but cannot
weaken the exact-input gate.

## Collection workflow

1. An admin starts an owned Lambda scan for an exact normalized requested URL.
2. The browser extension starts a fresh visit to that same exact URL without consent clicks.
3. Both scans complete and persist schema-v6 shadow rows.
4. The admin registers the two scan IDs as a deliberate pair.
5. Registration fails closed on target/model/source/fingerprint/count mismatch.
6. The monitor emits component diagnostics and, only when warranted, exact-input
   equivalence.

No public target is used merely to make a pair. Governed public-sample selection remains
subject to the calibration registry, central contact ledger, cooldowns, and Luna/SO roles.

## Acceptance gates

- Deterministic repository tests reject same-source, different-target, different-model,
  missing-component, duplicate, and noncanonical-key pairs.
- Monitor tests prove that a deliberate pair with different whole-input fingerprints is
  diagnostic only and never source-equivalent.
- Monitor tests prove that an exact-input deliberate pair enters both the deliberate and
  exact-input lanes without inventing browser geography.
- Production migration and one owned pair are verified read-only after deployment.
- The governed rotating public sample and Luna monitoring-baseline approval remain separate
  mandatory gates before cutover.

## Implementation evidence

Migration 0151, fail-closed pair registration, the platform-admin registration control, and
the `deliberateCrossSourcePairs` monitor projection are implemented. Focused tests prove the
diagnostic/exact-input separation. A disposable PostgreSQL integration run applied the
migration, registered the same pair twice idempotently, loaded two members, reported equal
coverage/finding components with different whole-input fingerprints, and kept the exact-input
cross-source count at zero. The production deployment is complete; the real owned pair still
requires its browser-extension member.

Production release `d71c692f` was verified on the ECS web runtime and all three approved
Lambda scanner regions on 2026-07-22. A read-only production check confirmed both migration
0151 tables. Owned EU-IR scan `804cfab7-cf12-48bf-956c-bd528343d87c` persisted a schema-v6
comparison row for `https://certscore.ai/` with 38 coverage rows, one eligible finding,
legacy score 79, candidate score 54, and all three canonical fingerprints. The matching
browser-extension scan and immutable pair registration remain pending.
