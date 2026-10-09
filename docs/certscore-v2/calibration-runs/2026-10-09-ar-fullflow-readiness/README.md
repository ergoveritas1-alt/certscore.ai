# Local A/R full-flow readiness — deployment remains blocked

October 9, 2026. No deployment, push, browser identity change, extra lane, model call, timeout extension or form submission was introduced by this verification. Existing policy-review configuration was retained. This is local diagnostic evidence, not measured production performance or a population accuracy estimate.

## Decision

Three complete localhost scans passed report readiness, persisted report/API-resource/MCP-bundle parity and single-publication assertions. Both phase-specific form screenshots load. The broader paired timing gate **failed**: nine usable pairs, nearest-rank median **+85ms**, p95 **+6407ms**, against a **+2000ms** budget. At this sample size p95 is the maximum. Keep deployment on hold; do not promote this candidate as the timing baseline.

## Paired public benchmark

Canonical registry check and fresh central contact-history export passed before canonical rotating selection. Ten sites, five baseline-first and five candidate-first; two different domains concurrent. Each source/site used fresh independent consent-proof, Accept and Reject sessions. HTTP identity: ConsentCheckBot; native Chromium navigator; en-IE/Europe-Dublin; local California egress with proxy off. Search 13s, result budget 30s, Accept 3s, Reject 8s, Reject dispatch delay 500ms. The six-lane topology is exercised separately below.

Frozen baseline is the previous pre-retention working source, **not the deployed revision**. All 1003 baseline and 1007 candidate source files verified before and after the benchmark; scanner package working sources match the candidate. Baseline aggregate SHA-256 `139912b3e8639a982ade09b9e8177f0550f49d48df2b63ada73163099e1245cb`; candidate `004ba8907c50d61bb58e52e3b670c27d6d4df8af51fe4874ea2f9356ad27bd85`.

Timing is whole three-session child-process visit wall time, not consent-module duration, Lambda latency or a sum of overlapping worker durations.

| Site | Candidate minus baseline (ms) | Review |
| --- | ---: | --- |
| plannedparenthood.org | -296 | Usable |
| fandango.com | +6407 | Usable |
| supabase.com | +85 | Usable |
| progressive.com | +306 | Usable |
| target.com | +2125 | Excluded: access challenge |
| spotify.com | -1103 | Usable |
| msnbc.com | +5199 | Usable |
| gatech.edu | -2940 | Usable |
| consumerfinance.gov | +46 | Usable |
| segment.com | +210 | Usable |

Luna independently inspected retained evidence and benchmark interpretation; this is model-assisted review, not independent human adjudication. Target showed a “Quick verification / Press and hold” challenge in both screenshots. The baseline missed that access classification; candidate geometry retained `bot_security_check`, but the automated cohort no-go summary did not stop the pair. This is an unresolved no-go propagation/classification defect. The challenge was identified during retained review after the paired visits; no additional Target contact or retry occurred. Preserve the original automated summary, record reviewed no-go summaries, exclude the pair and retain its failed access evidence. The repository ledger now places Target in `do_not_calibrate`.

Raw automated results are 10 pairs, median +85ms, p95 +6407ms; reviewed results are nine usable pairs with the same median/p95. This exclusion does not rescue the failed gate. Of the usable pairs, A/R/O states match on eight; Gatech showed a different rendered banner across sessions (candidate Accept/Decline, baseline no banner), so it is not an established reliability gain.

Fandango and MSNBC retained equivalent control/screenshot evidence, but candidate passive lane duration rose by approximately 7.5s and 5.8s respectively. Their gate/recapture checkpoints differ. The cause remains unresolved; one live pair does not establish a source regression, nor justify removing proof/settling. Next work should isolate this passive inspection behavior with deterministic reproduction before another release decision.

No public decision was semantically confirmed. Candidate completed three Accept clicks and one Reject click, versus two Accept clicks and no Reject clicks in baseline. Completed unconfirmed capture remains separate from registered consent/refusal. Segment Accept remains Limited/non-projectable in both versions: candidate retained 192 of 194 arrivals, omitted one tracking and one known-other request, with two replacements; baseline omitted 16 on a different stream. Different stream counts are not a measured recovery improvement. Opt-Out was not treated as Reject.

## Full localhost reports

Fresh scans used the local simulated v2 DAG handler, real local HTTP intake/status/export, local database persistence, and all six enabled worker lanes. Every lane reached a completed/joined terminal outcome before the single report result. Both form images returned HTTP 200 image/jpeg. Original mirrored artifact byte counts and SHA-256 hashes, and all three canonical bundle schemas, verify.

| Local report | Result | Artifact completion to persisted projection |
| --- | --- | ---: |
| [Owned clean Reject](http://localhost:3000/scan/6fce8f04-2244-4ea2-9fef-9e0f3b16a0cf) | Score 84; confirmed Accept activity; confirmed clean Reject; no Reject deduction | 2.319s |
| [Owned tracking after Reject](http://localhost:3000/scan/0003b012-ed23-420d-9140-962a3e8a63ae) | Score 69; confirmed Reject activity deducts 15; unconfirmed Accept retains after-click facts without a confirmed verdict | 2.075s |
| [Termly forms and clean Reject](http://localhost:3000/scan/7c991a7d-07a4-4bf3-a2cf-2bd5b0592044) | Score 87; confirmed clean A/R; seven-field form retained before consent and after Accept; both images available | 0.789s |

These are approximate local artifact-generatedAt-to-projection measurements, not production scan-to-report improvements. Database event timestamps have second-level resolution. Full report/API-resource/MCP-bundle builders agree on score, explanation and forms summary for all three persisted reports; authenticated external API/MCP transports were not exercised. Each scan has exactly one result-received event and one unified-derivation event.

Termly’s form count is two **phase-specific observations**, one before consent and one after Accept, not proof of two distinct physical forms. Its separate post-Accept structured capture remains limited; retained imaged inventory is preserved. The post-Accept masked form popup and Accept timeline rendered in the browser. Both snapshot endpoints were additionally checked over HTTP. Browser automation later became unavailable, so a fresh visual Reject-tab inspection was not completed; focused timeline regressions passed. Consent image withholding remains enforced independently of structured A/R/O evidence. Form-local privacy disclosure was not retained and is not invented.

## Corrections and tests

Two presentation defects found during review were corrected locally through existing canonical projections: classification-review timeline milestones now use neutral review wording/color, while established gaps remain red; the shared storage score-rule label no longer calls all storage “non-essential.” Points, eligibility, score version and policy version are unchanged. Termly’s eight-point partially-classified storage deduction is existing policy, not a new finding or policy change in this work.

Added persistence/API regression verifies Reject request overflow remains Limited, non-projectable and score-neutral through hydration, including retained omission count. Web typecheck caught a test-only unknown-value access; the test now validates the retained projection with its schema. Repaired typecheck and regression pass without loosening production types or guards.

Passed checks: action fixtures 71; contracts 568; publication/parity fixtures 268; dispatch/cancellation fixtures 197; score/parity regressions 100; focused timeline tests 5; focused overflow persistence test 1; scanner and final web typechecks; registry before/after; 40 original public action packets with original hashes and exact lane scanId bindings. These suites overlap; do not add them into a unique-test total. Deterministic retention stream replay preserves late unknown/tracking rows within the fixed 192 cap. Historical FullStory traces remain censored (127 Accept / 29 Reject missing rows); replay cannot reconstruct them. No complete-stream recovery claim is made.

## Accounting and remaining limits

Central idempotent bookkeeping persisted all 60 isolated public lane contacts under `ar-fullflow-readiness-20261009`, plus the three parent full-scan contacts under `ar-fullflow-readiness-20261009-reports`. The latter represent 18 executed worker lanes, not three browser visits. Target contact records conservatively inherit the reviewed consent-proof challenge; this does not independently classify every action session. Canonical repository ledger candidate was reviewed: only the ten selected target entries and updatedAt changed. Holds and blocked targets remain enforced for future selection. Fresh exports also covered the exact owned and Termly targets before full scans.

No recurring cost increase. Estimated one-time AWS contact export/persistence bookkeeping remains under $0.50 for this task; scanner execution used localhost. No fresh post-terminal policy model fallback was added. Existing unrelated local product work remains preserved and uncommitted; this record and the generated calibration ledger are committed separately as required by the calibration protocol.

Unresolved: failed paired latency gate and unproven Fandango/MSNBC cause; Target challenge classification/no-go propagation; limited Segment overflow; public semantic-confirmation coverage. No full clean release preflight or production verification is claimed.

Raw artifacts and reproducible scripts are retained at `artifacts/ar-fullflow-readiness-20261009/`: `summary.json`, `metrics.json`, `reviewed-metrics.json`, `source-manifests.json`, `source-integrity-after.json`, `persisted-report-check.json`, `form-image-http-verification.json`, `retained-artifact-verification.json`, central bookkeeping logs, and focused gate logs.
