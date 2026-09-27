# A/R consent coverage correction — September 27, 2026

## Change and scope

A loading runtime inventory was incorrectly limiting an independently completed
consent inspection after the lane evidence was merged. Projector 2.2.2 excludes
only `runtime_page_inventory_document_loading` from consent limitations when the
existing canonical consent-completion predicate passes. Runtime evidence and its
limitations remain intact. Assessment contract 2.2 and historical reads remain
unchanged. This is a WC01 assessment correction, not a scanner behavior change.

No new browser work, timeout, lane, model call, storage or recurring cost is added
(estimated incremental recurring cost: $0). No new scans or production writes
were used for validation. This record describes local validation, not deployment.

## Retained-evidence replay

The frozen production cohort covers September 23 18:18:50 UTC through September
26 18:18:50 UTC, excluding 217 ErgoVeritas scans. It contains 1,212 scans, of which
1,210 completed. All completed original bundles had already passed byte/hash and
identity verification in the audit. The replay uses the pre-change source archived
from Git alongside the changed source; stored assessments are not overwritten.

Across the completed cohort, inspection diagnostics change for 53 scans: 41 become
complete, and 12 remain limited by other reasons. A focused canonical
materialization replay uses all 42 loading-limitation candidates and their verified
retained geometry artifacts. The baseline reproduces stored control states with
zero discrepancies. The fix changes 125 control states across 32 scans from
unknown to not_observed: 30 Accept, 31 Reject, 32 Options and 32 privacy opt-out.
No observed control changes. These are supported absence conclusions, not new
controls, clicks or successful action paths. All 1,210 stored historical
assessments and the frozen cohort source hash remain unchanged.

Local audit artifacts: `artifacts/ar-crosslane-fix-20260927/replay.json`,
`replay.ts`, `geometry.log` and `resolver-review.json`. Artifacts are internal
and are not published or persisted as new scanner evidence.

## Resolver follow-up

Of 116 observed-control opportunities without an established click, 56 have a
primary resolver-budget outcome. Only five of those retain any actionable
candidate during resolution; the other 51 do not demonstrate that more time would
produce a safe click. The five include lost uniqueness/label agreement, unavailable
geometry and exhausted binding work. This cohort does not establish a safe generic
resolver repair or justify longer budgets.

Eight of the 16 primary final-label/semantic failures involve deliberately
observation-only vocabulary. The September 22 policy explicitly did not authorize
these labels for actions. Other cases include ambiguous accessible names, weak
“OK” labels and lost uniqueness. These safeguards remain in place. Missing Drupal
Reject recipe evidence is insufficient to invent a selector.

The next action improvement should be a fixture-backed, separately reviewed
canonical recipe or semantic rule for these specific cases, with exact-target,
uniqueness, native-control and contextual guards. Do not claim the eight cases as
recoverable successes, promote observation aliases automatically, or increase
resolver time merely to improve dispatch statistics.

## Regression verification

Focused consent inspection, assessment, choice-path execution and web materializer
tests: 107 passed. Coverage includes preserving the original runtime limitation,
loading or incomplete consent capture, inaccessible frames, no-go conditions,
unrelated inventory failure, document mismatch and projector provenance.

Contracts typecheck and web TypeScript check both passed. `git diff --check`
also passed.
