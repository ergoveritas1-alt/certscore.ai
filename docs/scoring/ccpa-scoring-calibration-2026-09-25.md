# CCPA/CPRA scoring: retained-evidence review

Reviewed September 25, 2026. Recommendation only; no production scoring change.

## Decision

Keep the existing 15-point GPC rule. Do not publish a standalone CCPA/CPRA
0–100 score from today's four checks. The retained evidence cannot calibrate
weights for opt-out effectiveness or notice adequacy. Giving points for a link
or a passage would reward presence while the important behavior remains untested.

The smallest useful rubric is the four evidence checks already implemented,
with the GPC result explained using the distinctions below. Retain the existing
overall score's actual meaning; never relabel it a CCPA score when changing views.
This is a concrete pre-deployment scoring decision, not a request for another
scoring framework or more offline tooling.

## What the retained cohort supports

Replayed the current California GPC policy against 307 historical persisted
assessment rows from September 14–15: 306 completed scans across 235 hostnames,
plus one failed scan. All 306 completed GPC assessments passed their v3 schema.
These are repeated scans, not 306 independent sites or human-adjudicated labels.

| Existing policy outcome | Completed scans | Safe interpretation |
| --- | ---: | --- |
| Qualifying activity persisted with no suppression | 1 | Meets the existing 15-point rule; review signal, not proof of illegal sale/sharing |
| Qualifying activity suppressed | 1 | Favorable bounded observation; not a site-wide pass |
| No qualifying sale/share-candidate activity observed | 92 | No meaningful test of suppression; no pass credit |
| Indeterminate comparison | 212 | Insufficient comparison evidence; no deduction or pass credit |

The qualifying suppression case is the owned ErgoVeritas canary. The qualifying
persistence case is `steadfast.com.bd`. This is only one example on either side,
not enough to tune a new weight or estimate real-world accuracy.

Of the 212 indeterminate comparisons, 159 had a completed GPC observation.
Observation completion therefore cannot be scored as honoring. The broad
`no_observable_response` label occurred 93 times, but 92 had no qualifying
activity. Scoring that label directly would expand one eligible concern to 93.

There are 51 explicitly `no_go` completed records, all indeterminate. Excluding
those leaves 255 records: the same two qualifying comparisons, 92 without
qualifying activity and 161 indeterminate. Another 20 records have
`continue_with_diagnostics`; 235 have no exported no-go assessment. Missing
no-go metadata is not independently verified accessibility.

As a sensitivity check, blindly applying `100 - GPC deduction` would assign
100 to 305 completed scans and 85 to one. With the 51 known no-go records
withheld, it would still assign 100 to 254 and 85 to one. Those high numbers
would primarily mean that no deduction was established, not that CCPA controls
worked. Reject this candidate rubric.

## Should the comparison standard change?

Investigate the settling requirement specifically. Among the 159 completed
observations with indeterminate comparisons, 150 have at least one settling
limitation; **71 have no other recorded blocker**. All 71 have verified delivery
and shared observation durations of 1,738–11,523 milliseconds. Twenty-three have
qualifying advertising/marketing activity in the retained baseline; 48 do not.
These counts identify candidates for evaluation, not newly eligible findings.

The current comparison requires both passive lanes to have completed their quiet
gate. A bounded comparison could instead describe activity within a verified,
matched capture interval even when the page did not finish settling. Test that
as a distinct versioned criterion against retained evidence and controlled cases;
do not delete the limitation and relabel historical results. Preserve verified
signal delivery, baseline GPC-off proof, same-document/protocol identity,
representative access, complete interval capture and attributable event timing.

Observing a qualifying request with GPC is stronger evidence than concluding
that activity was suppressed because a request was absent. Any alternate rule
must validate those claims separately. Initially retain such comparisons as
bounded, score-neutral observations until calibration supports specific score
effects. Keep current time budgets and lanes; no new waits are proposed.

The remaining 88 have other blockers, including missing readback or delivery,
document mismatch, nonrepresentative access and insufficient shared windows.
Those are not recoverable by relaxing settling alone. The existing policy also
notes that old quiet-gate timeout metadata cannot prove in-flight completion;
elapsed time alone must not be treated as proof that the page settled.

## Small rubric to use now

| Check | Keep visible | Scoring treatment |
| --- | --- | --- |
| GPC response | Existing concern, suppression observed, mixed response, no qualifying activity, or insufficient evidence | Preserve the approved 15-point rule exactly; mixed/unknown/no-activity outcomes stay neutral, never positive credit |
| Sale/share choice surface | Observed surface and evidence reference, or unknown | Evidence only; no points for generic Cookie Settings or an unproven absence |
| Sale/share opt-out effectiveness | Not assessed until a distinct sale/share action has verified execution and relevant subsequent evidence | Cookie Reject cannot substitute; do not assign weights yet |
| Notice evidence | Retained topics, coverage and links | Presence only; no adequacy/collection-placement points |

Keep score effects on their existing canonical concern-policy path and apply
the GPC deduction once. Do not add a second CCPA subtotal to the overall score.
Retain the actual scan origin. Selecting a different regulatory focus changes
presentation, not where evidence was collected. No paired geographies are needed.

A missing DNS link is not an automatic legal failure: the regulations allow
alternative links and certain frictionless preference-signal implementations.
Cookie controls alone are not a sale/share opt-out. See §§7013(d), 7025 and
7026(a)(4) in the [CPPA regulations effective January 1, 2026](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf).

## What must improve before a useful numeric score

1. Evaluate the narrow settling-rule alternative above on real advertising-active
   pages; keep delivery, comparison coverage and response separate. Assess current
   retained scans first: this historical cohort does not establish today's rate.
2. Retain and validate actual sale/share opt-out behavior as a separate capability.
   Define one bounded scope before implementing it; current cookie action lanes
   do not authorize or prove a sale/share opt-out.
3. Validate notice conclusions against retained text and human-reviewed examples
   before giving them score effects. The existing topic workpaper remains useful
   without evaluating adequacy.

Only then choose relative weights. Do not invent percentages to make the four
checks add up to 100. A future score should describe observed website controls,
with critical missing evidence withholding the number and the actual scope shown.

## Provenance and limits

The [machine-readable summary](ccpa-scoring-calibration-2026-09-25.json) records
source hashes and counts. The source is the retained database export
`outputs/scan-evidence-review-2026-09-14/cohort.json`; `cohort.sql` documents its
24-hour selection window. The replay uses `gpcResponseAssessmentSchema` and
`deriveCaliforniaGpcResponsePolicy` without creating findings or applying scores.
These are rule-eligibility results, not a claim that each persisted report
actually applied a deduction.

Rechecked SHA-256 and size for all 56 locally retained baseline/GPC worker files
listed in that review's manifest: 28 pairs passed. This verifies the selected
retained bytes only; it does not independently validate all 306 observations or
adjudicate legal outcomes. No current scanner replay or source upgrade was used.

The local canonical report exports found were v1/v2 duplicates of one August
scan, without the new privacy workpaper. Separately, a retained September 12 CNN
report was exported through the current v6 builder using its existing canonical
projection: GPC remained indeterminate, privacy evidence stayed unavailable and
opt-out effectiveness stayed unassessed. No observations were reconstructed.
There was no retained current privacy-workpaper cohort to calibrate the other
three checks; do not claim that calibration succeeded.

No live scans, database calls, model calls, deployments or new recurring resources.
Incremental recurring cost: $0/month. The next useful work is evidence coverage,
not another scoring harness.
