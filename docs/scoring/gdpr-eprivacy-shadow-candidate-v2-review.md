# GDPR/ePrivacy shadow candidate-v2 to candidate-v3 review

## Decision

**Reject candidate-v1 and candidate-v2 for cutover. Advance candidate-v3 in shadow
with `pending_luna` approval.**

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

## Deterministic benchmark blocker

The twelve-lane candidate-v2 benchmark had complete structural lane coverage and
passed deterministic cross-region and Lambda/browser-extension equivalence. It also
exposed one cutover blocker: a supported high-severity `rights_gap` finding contributed
the family maximum of 25 points, producing `75 / Clear / Monitor`, and no critical cap
applies. This is misleadingly strong for the retained input and must not be approved by
changing only the expected label. Luna must decide a revised family maximum, severity
penalty, critical cap, or posture threshold and rerun every lane and cohort.

Three alternatives are machine-checkable: rights-family maximum 30
(`70 / Watch`), high-rights cap 54 (`54 / Watch`), and high-rights cap 49
(`49 / Action Needed`). The review packet recommends the family-maximum change as the
next calibration hypothesis because it preserves the shared high-severity value. The
retained 11-scan corpus contains no surfaced rights-gap family input, so all three
produce the same retained summary and the corpus cannot select between them.

Luna selected the rights-family maximum of 30 as
`candidate-v3-rights-max-30.pending-luna` for continued calibration. This resolves the
deterministic high-severity/Clear contradiction without approving the model or
authorizing cutover. All twelve expected bands are now explicit and machine-enforced.

Accessibility, transport/security, and consumer-protection cases are explicitly
outside the GDPR/ePrivacy candidate. Their presence does not alter this domain score,
and the benchmark records the cross-domain overall score as withheld.

## Production coverage-semantics contradiction

Production comparison schema v3 now keeps two explicitly named measurements:

- model eligibility coverage, used only to decide whether the candidate model has
  enough testable score inputs; and
- report usable evidence, calculated from the exact 30-row customer-report
  GDPR/ePrivacy projection.

Fresh production canaries exposed a material mismatch: the legacy score metadata
reported `1.0` coverage while the customer report showed 27/30 usable rows for the
organization canary and 28/30 for the anonymous canary. The comparison records
`legacy_score_coverage_diverges_from_report_usable_evidence` and remains
cutover-ineligible. The recommended Luna decision is to use report usable evidence
for customer-facing coverage and retain model eligibility coverage as a clearly
named internal score-withholding input.

## Forward finding-lineage verification

Production revision `d2c002b4` corrects the score projection to recognize the
canonical presentation status `surface`. The previous check used the nonexistent
value `surfaced`, which could silently omit promoted finding IDs from newly persisted
score provenance. Existing immutable score rows were intentionally not rewritten.

Owned canary `52d2ca2e-5913-428a-8f5d-f162c68eca0d` completed after the deployment.
Its report had zero promoted findings, and its immutable score row persisted score 94,
an empty `input_finding_ids` array, and projection fingerprint
`sha256:071dcac08f932c0b68f465c50945c41ac008aa593cd6911a6a73f917193e2310`.
This proves the live empty-lineage case agrees with the report projection. A bounded
read-only query found no naturally occurring post-deploy score row with non-empty
finding lineage at the time of review, so the live non-empty case remains an explicit
verification gate. Deterministic lifecycle and repository tests already cover the
non-empty forward path; do not manufacture a public consent violation solely to
exercise it.

## Candidate-v3 production shadow verification

Production revision `1fde59d3d7d2f048c296b96f6f2ea367d2412262` deployed the
disabled-by-default selector, immutable shadow assessment lifecycle, comparison
monitoring table, and rollback path. The web migration and ECS rollout completed
successfully. The production task does not set
`CERTSCORE_GDPR_EPRIVACY_SCORE_MODE`, so runtime selection resolves to legacy.

Replaying the completed lifecycle for owned canary
`52d2ca2e-5913-428a-8f5d-f162c68eca0d` retained its immutable legacy assessment
(94, coverage 1.0), persisted the candidate-v3 shadow assessment (100, model
eligibility coverage 0.92308), and persisted a comparison row with delta +6 and no
unresolved contradictions or withholding reasons. No `gdpr_eprivacy_posture`
assessment exists for the scan, which proves the pending Luna decision fails closed
in production. These observations verify deployment mechanics, not model approval.

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
- Scored: 7; withheld: 4.
- Coverage-semantics contradictions: 11/11; projection/scoring failures: 0.
- Median absolute legacy delta: 14; p95 absolute delta: 28.
- Candidate-v1 to candidate-v2 numerical changes: 0 in this cohort because none of
  the retained surfaced inputs belonged to `policy_extraction` or `sensitive_data`.

The historical 11/11 contradiction rate was expected under schema v3 and was useful evidence,
not a reason to suppress the gate: every retained legacy score-input coverage value
differs from the exact report usable-evidence ratio. The retained runner now uses the
same report-row projection as the passive production cohort and live admin shadow.

Schema v4 preserves that difference but, following Luna's selected customer coverage
meaning, classifies it as an accepted migration difference rather than an unresolved
contradiction. The candidate remains pending for the governed corpus and final sign-off.

The unchanged numerical result is expected and does not validate the family change.
Deterministic fixtures must prove both policy-extraction exclusion and sensitive-data
inclusion before any candidate can advance to final approval.

## Public calibration status

The required central contact ledger export was refreshed successfully on 2026-07-22
at `07:44:51Z`. The canonical selector again failed closed because zero of the 50
registered public targets were eligible:
47 were in cooldown, one was blocked, and two were `do_not_calibrate`. No public
target was hand-picked and no cooldown was bypassed. The earliest current cooldown
expiry is 2026-07-24 at `01:51:27Z`; expiry alone does not authorize a run because the
selector must still return all 10 required targets from a fresh central export.

## Remaining gates

1. Luna selects the customer-facing coverage meaning and records its evidence artifact.
2. Review the exact recurring limited rows on current owned canaries.
3. Fix missing current-production evidence mappings before changing the model denominator.
4. Complete Luna labels for every required expected-band lane.
5. Validate Luna's selected candidate-v3 rights-gap treatment against an approved live corpus.
6. Repeat retained and passive shadow comparisons under the revised candidate.
7. Run the ledger-selected public cohort only when at least 10 targets are eligible.
8. Record Luna corpus, parameter, and final sign-off artifacts in the machine-readable decision packet.
9. Pass `pnpm score:luna-cutover-gate` before any customer-facing cutover.
