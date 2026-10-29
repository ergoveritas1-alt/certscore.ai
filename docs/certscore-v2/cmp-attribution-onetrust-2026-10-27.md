# CertScore.ai CMP attribution capture and OneTrust confirmation

## Implemented changes

CMP geometry capture now checks canonical markers in the same cached open shadow
roots already searched for controls. Previously, control discovery could see a
shadow-root button while the document-only CMP lookup missed its provider.
Global-name capture now uses the canonical registry plus the existing protocol
names, inspecting own-property presence without invoking the newly inspected
globals' getters. The existing Drupal configuration read is unchanged.

These are passive identity hints. A background global cannot bind an unrelated
control: the action resolver still verifies the selected control's live composed
ancestry, uniqueness, visibility, exact target and authorization. Closed shadow
roots remain inaccessible. A named host without accessible controls does not
establish an actionable or completed choice. Script, frame, candidate, retained
inventory and traversal-depth limits remain unchanged. No new evidence field,
network request, visit, wait, SDK setter or action recipe is added.

For OneTrust paths with a verified pre-click baseline, Accept and Reject now
share the changed-receipt check with the candidate snapshot. This reduces cookie
reads from three to two when a changed receipt is present. The independent later
readback, exact identity/value comparison, unchanged configuration, complete
configured groups, fresh value and applicable post-click write requirements all
remain. Unchanged, missing or ambiguous candidate receipts still exit after one
cookie read, without a configuration/API read. Other baseline/adapter paths keep
their existing verification behavior.

Missing, ambiguous and malformed OneTrust baseline receipts now retain their
specific diagnostic reason, using the same existing reads and bounded v2 reason
inventory. Diagnostics supply no confirmation evidence and change no scoring.

## Effective remaining scope

The prior library passes added reviewed marker coverage for 75 unconfirmed
actions across 44 sites. The local replay still has 409 unconfirmed actions
across 275 sites without reliable provider identity.

The next three provider-like clusters cover 20 distinct actions across 15 sites:

| Retained lead | Actions | Sites |
| --- | ---: | ---: |
| CookieHub-like `ch2-dialog-actions` | 6 | 5 |
| Klaro-like `cn-buttons` | 9 | 5 |
| Securiti preference-button lead | 5 | 5 |

Twenty is the candidate ceiling for these three clusters, not a verified gain
or a ceiling for all future work. Stronger ordinarily captured roots/markers or
reviewed source evidence would be needed. Most other recurring clusters are
generic containers or generated site styling. Broadening names alone has
diminishing returns once those are all that remains.

The new capture repair is demonstrated locally, including WPConsent, Complianz,
CookieHub, Klaro and OneTrust shadow-root cases. Historical exports generally do
not retain the missing roots/globals, so no further historical identity upgrade
or production gain is claimed. Keep ordinary evidence collection focused on
these specific gaps before investing in a large new provider list.

## OneTrust retained evidence

The retained review rehashed 69 unconfirmed OneTrust action packets: 37 Accept
and 32 Reject. All 69 retain a changed same-identity OptanonConsent hash, which
proves mutation but cannot recover the cookie's group values or configuration.
The 37 Accept packets have no granular confirmation diagnostics. The 32 Reject
packets report the older configuration/group limitation, sometimes alongside
no-fresh-decision. None retains a verified terminal decision.

Those packets cannot establish how many choices this timing improvement would
confirm. No historical decision was upgraded. The local fixtures establish the
read reduction and preserved checks; ordinary evidence must establish the
eventual production benefit.

## Validation

- 345 consent-action gate tests pass, including both action observers, OneTrust
  complete/partial baseline cases, malformed data, duplicates, changed identity,
  drift, semantic evidence contracts, cancellation and target authorization.
- 133 geometry, CMP library, capture and release-gate tests pass.
- 28 additional Reject confirmation/terminal tests pass. These are now also
  included in the canonical consent-action gate. The final release-gate test
  file was rerun after that wiring change; all 15 tests pass.
- These suites cover 506 distinct tests. The initial 20-test focused run is a
  subset and is not counted again.
- Scan-core typecheck and a strict check of both new test files pass.
- A baseline comparison reproduces seven capture failures; those same cases
  pass with the repair. Two negative/control cases pass in both versions.
- All 1,466 retained packets remain readable and project their original
  registration outcomes. All 751 legacy diagnostics validate; 450 decoder
  parity cases remain equal.

The full release preflight remains pending. No deployment, flag change, public
scan, paid cloud/model call, checkpoint advancement or historical rewrite was
performed. Raw receipt/configuration values are not added to retained evidence.

## Cost and possible live validation

The added bounded capture matching and metadata are estimated below $0.05/month
at 100,000 scans, disclosed before implementation. Together with the preceding
library estimates, the passive library/capture work remains below $1/month.
The OneTrust change removes a read and introduces no added API call, interval
or retained field. Local tests/replay incur no additional paid cloud usage.

A small live follow-up would be useful: six scans using the local candidate,
covering two OneTrust cases, two attribution cases and two controls, selected
through the existing calibration eligibility/contact ledger and cooldown rules.
Preserve exact-target/action authorization and current budgets. The conservative
allowance is up to $0.60 at $0.10 per scan, with no deployment. This is a proposed
follow-up only; the user's question about live scans was not treated as a run
authorization.

Run artifacts, source hashes, logs and retained reviews are saved under
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T221907Z-manual-cmp-attribution-onetrust`.

The owner subsequently authorized the six live checks. Their results and limits
are recorded in `cmp-live-validation-2026-10-27.md`; neither OneTrust visit
reached confirmation, so no live timing/confirmation gain is claimed.
