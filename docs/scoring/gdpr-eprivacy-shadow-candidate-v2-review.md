# GDPR/ePrivacy shadow candidate-v2 review

## Decision

**Reject candidate-v1 for cutover. Keep candidate-v2 in shadow with `pending_luna` approval.**

Candidate-v1 mixed an evidence-coverage problem (`policy_extraction`) into observed
risk while omitting surfaced `sensitive_data` findings from the risk model. That
contradicted the model's stated separation of risk and coverage and left a required
calibration lane outside the score.

Candidate-v2 removes `policy_extraction` from risk-eligible families. Extraction
failures continue to reduce coverage and can withhold a posture score; they do not
create risk points. Candidate-v2 adds `sensitive_data` as an eligible family and caps
a posture score at 49 when a high-severity sensitive-data finding is surfaced through
the canonical concern, policy, and unified-finding pipeline.

This is a calibration hypothesis. It remains internal, read-only, and ineligible for
cutover until the governed public sample is available and Luna approves expected
bands, weights, caps, and thresholds.

## Coverage-denominator finding

The retained 11-scan cohort exposed four rows that are frequently or structurally
limited:

- `post_reject_tracking_reduction`: limited in 11/11; the production scanner
  intentionally does not perform consent clicks.
- `sensitive_surfaces_third_party_tracking`: limited in 11/11.
- `accessibility_consent_controls`: limited in 10/11.
- `cross_border_endpoint_review`: limited in 10/11.

The three owned post-deploy canaries each reached 0.8974 coverage and were correctly
withheld under candidate-v1's 0.90 no-finding threshold. All three had the same four
limited rows listed above and no score-eligible surfaced finding. The threshold is not
being lowered to make those scans score. Luna must first classify each recurring
limitation as a current evidence-capture gap, a conditional/not-applicable row, or a
row that should remain in the denominator.

## Candidate-v2 retained replay

- Input and successfully projected: 11/11 retained bundles.
- Scored: 6; withheld: 5.
- Contradictions: 0; projection/scoring failures: 0.
- Median absolute legacy delta: 14; p95 absolute delta: 28.
- Candidate-v1 to candidate-v2 numerical changes: 0 in this cohort because none of
  the retained surfaced inputs belonged to `policy_extraction` or `sensitive_data`.

The unchanged numerical result is expected and does not validate the family change.
Deterministic fixtures must prove both policy-extraction exclusion and sensitive-data
inclusion before candidate-v2 can advance.

## Public calibration status

The required central contact ledger export succeeded on 2026-07-21. The canonical
selector failed closed because zero of the 50 registered public targets were eligible:
47 were in cooldown, one was blocked, and two were `do_not_calibrate`. No public
target was hand-picked and no cooldown was bypassed.

## Remaining gates

1. Review the exact recurring limited rows on current owned canaries.
2. Fix missing current-production evidence mappings before changing the denominator.
3. Add deterministic sensitive-data and policy-extraction separation fixtures.
4. Repeat retained and passive shadow comparisons under candidate-v2.
5. Run the ledger-selected public cohort only when at least 10 targets are eligible.
6. Obtain Luna approval before any customer-facing cutover.
