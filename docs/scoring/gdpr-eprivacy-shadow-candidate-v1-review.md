# GDPR/ePrivacy shadow candidate-v1 review

## Decision

**Keep candidate-v1 in shadow with `pending_luna` approval. Do not cut over.**

Candidate-v1 addresses one demonstrated contradiction in candidate-v0: a scan with no score-eligible surfaced finding could receive 100 despite only medium coverage. Candidate-v1 requires at least 0.90 coverage before it emits a numerical posture score in that no-finding case. It preserves the separate observed-risk index and the 0.70 minimum for results anchored by a surfaced eligible finding.

This remains a calibration hypothesis. It is not customer-facing and is not eligible for production cutover.

## Evidence that rejected candidate-v0

- Retained replay produced two scores of 100 with no eligible findings at approximately 0.74 and 0.89 coverage.
- A passive production comparison for `flathub.org` produced 100 with no eligible findings at approximately 0.71 coverage, 31 points above the legacy evidence score.
- A passive production comparison for `uanl.mx` produced 54 at approximately 0.71 coverage because the canonical projection contained the high-severity `preconsent_tracking` finding. Candidate-v1 intentionally retains this risk-anchored result while displaying coverage separately.

## Candidate-v1 retained replay

- Input: 11 retained passive evidence bundles
- Successfully projected: 11
- Projection/scoring failures: 0
- Scored: 6
- Withheld: 5 (45.45%)
- Withheld below the general 0.70 threshold: 3
- Additionally withheld below the no-finding 0.90 threshold: 2
- Candidate/legacy comparable: 6
- Median absolute delta: 14 points
- P95 absolute delta: 28 points
- Candidate lower than legacy: 6
- Candidate higher than legacy: 0
- Contradictions detected: 0
- Cutover-eligible artifacts: 0

The two misleading 100s from candidate-v0 are now withheld rather than converted into a coverage-adjusted score. This keeps observed risk and coverage separate.

## Passive production diagnostics completed before candidate-v1 deployment

- All 24 literal `status = failed` scans from the prior 72 hours produced bounded shadow artifacts under candidate-v0.
- All 24 failed scans had no retained snapshot or runtime evidence bundle, 0.0789 coverage, and no numerical shadow score.
- A deterministic, no-traffic sample of 15 completed production records produced 14 artifacts on the first browser pass and one on retry, with no service failures.
- Three access-blocked or configuration-error records were correctly withheld.
- Across the 15 completed records, seven medium-coverage results were risk-anchored and scored, while eight low-coverage records were withheld.
- This sample is diagnostic only. It is not an acceptance corpus and contains no cross-region pairs.

## Remaining gates

1. Deploy candidate-v1 in shadow and repeat the same passive production comparisons.
2. Label expected bands for retained fixtures before changing weights, caps, or posture bands.
3. Run owned canaries, including same-domain cross-region and equivalent Lambda/browser-extension projections.
4. Only then run the governed, ledger-selected rotating public calibration sample.
5. Obtain Luna approval for corpus, thresholds, weights, caps, expected bands, and cutover.

Candidate-v1 now has an explicit 39-row scoring-policy registry with model-owned weights. Its test contract fails closed for missing, duplicate, unknown, stale, or invalid rows and verifies exact coverage of the canonical GDPR/ePrivacy checklist definitions. The initial candidate-v1 row weights are neutral (`1` each) pending Luna calibration; they are explicit rather than fallback values.

## Reproduction

```bash
pnpm score:shadow:retained-cohort -- --limit 11
```

The generated detailed artifact remains under `artifacts/scoring/gdpr-eprivacy-shadow-retained-candidate-v1.json` and is intentionally not a production score record.
