# GDPR/ePrivacy shadow candidate-v0 retained review

## Decision

**Do not cut over candidate-v0.** Keep it in shadow with `pending_luna` approval.

This was a retained-evidence diagnostic run only. It generated no live traffic, clicked no consent controls, made no production writes, and is not an acceptance corpus.

## Run

- Input: 11 retained passive evidence bundles
- Successfully projected: 11
- Projection/scoring failures: 0
- Scored: 8
- Withheld for coverage: 3 (27.27%)
- Candidate/legacy comparable: 8
- Median absolute delta: 14 points
- P95 absolute delta: 35 points
- Candidate lower than legacy: 6
- Candidate higher than legacy: 2
- Contradictions detected by the current regression rule: 0
- Cutover-eligible artifacts: 0, as required for a pending Luna model

## Important findings

1. Candidate-v0 correctly retained observed risk while withholding three posture scores below its 0.70 coverage threshold.
2. The configured high consent-tracking cap consistently limited affected posture scores to 54. A scan with both high consent tracking and a high policy/runtime contradiction scored 40.
3. Two scans with no score-eligible surfaced findings received a posture score of 100 despite only medium coverage (approximately 0.74 and 0.89). Even with coverage shown separately, this can create an overly strong headline.
4. Candidate-v0 is highly polarized: no eligible family produces 100, while a high consent-tracking family produces 54. Luna should review whether additional typed finding families, finer within-family distinctions, or stricter score withholding are required.
5. This cohort has no same-domain cross-region pairs, so it provides no region-variance evidence.

## Required next decisions

- Decide whether a numerical posture score requires high coverage rather than the current 0.70 threshold.
- Review the GDPR/ePrivacy eligible-family boundary and whether any explicitly classified sensitive-data findings belong in this domain score.
- Review family-level deduplication granularity so correlated duplicates remain suppressed without collapsing materially independent findings.
- Calibrate weights and caps against labeled expected bands, not against the legacy score alone.
- Add retained low-signal, strong-consent, policy-gap, session-replay, fingerprinting-adjacent, sensitive-context, access-limited/no-go, and same-domain cross-region cases.
- Run the bounded passive production cohort, then owned canaries, before requesting governed public calibration targets.

## Reproduction

```bash
pnpm score:shadow:retained-cohort -- --limit 11
```

The generated detailed artifact remains under `artifacts/scoring/` and is intentionally not a production score record.
