# CMP evidence quality follow-up — October 14, 2026

Owner scope: fresh local IKEA verification, investigation of earlier recent
captures, and targeted local rescans within the existing latency/cost budgets.
No deployment. This pass capped live work at four serial scans and an estimated
one-time cost below $0.50. Held/no-go targets were not retried.

## Measured results

| Target / local scan | Elapsed | CMP results | Accessibility evidence |
| --- | ---: | --- | --- |
| IKEA `bba498e0-5f5c-4704-8b6d-1fb7c933b346` | 17.028 s | 5 Observed, 1 Partially assessed, 7 Not assessed | 62 rules; 49 affected/review elements; 8 examples |
| IKEA verification `42db50bd-3f24-46c2-9711-1a7621810622` | 16.415 s | 8 Observed, 3 Partially assessed, 2 Not assessed | 62 rules; 49 affected/review elements; 8 examples |
| AT&T `1f4885fd-d203-42db-abae-92190521a4b2` | 22.837 s | 1 Observed, 6 Incomplete, 6 Not assessed | Frame changes invalidated the completed 3.404 s audit |
| Ars Technica `3dde2428-fa1c-4f04-9470-312cec50e569` | 22.570 s | 1 Observed, 5 Incomplete, 7 Not assessed | Frame changes invalidated the completed 2.526 s audit |

These are full local simulated-DAG scans with real public-site visits, not AWS
production executions. The location label does not establish EU egress for a
local browser. Local CPU contention from concurrent lane browsers cannot by
itself justify production Lambda concurrency changes.

IKEA's verified report is available at
<http://localhost:3000/scan/42db50bd-3f24-46c2-9711-1a7621810622#cmp-details>.
It retains 12 declared cookie names, one selectable Analytical category, the
reachable combined privacy/cookie link, expiry evidence, and approved,
document-bound Accept/Reject prominence evidence. The inventory remains partial:
purposes were absent, most duration values lacked verified units, service
identities were not supplied, and consent registration was unconfirmed.
The latter two criteria remain Not assessed. A click or cookie presence does
not establish semantic consent registration.

## Implemented changes

- Read OneTrust's documented, already-loaded `GetDomainData()` once after unique
  vendor identification and before optional panel work. Retain explicit cookie
  names and available purpose/duration fields. Cap groups at 64, hosts per group
  at 100, cookie entries globally at 100, and field lengths. Do not infer services
  from hosts, duration units from numbers, or complete inventory from config.
- Retain verified visible first-layer choices before deeper Options work. A
  styled hidden native checkbox can be observed through its exact associated,
  visible, hittable label. Hidden sections and disabled controls remain excluded
  from selectable-category conclusions.
- Recognize canonical combined privacy/cookie statements and check bounded
  visible link hit points, including wrapped links. Do not treat fully covered or
  offscreen links as reachable.
- Version preference diagnostics as `cmp_preferences.v3`; reserve up to the last
  second of the existing absolute budget for basic capture. CMP/document readiness
  cannot spend that reserve. No new visit, action, retry, model call, timeout or
  deadline increase. This final scheduling change was made after the four live
  scans and verified with local fixtures, not an additional live scan.
- Preserve loader binding, partial checkpoints, historical packet compatibility,
  screenshot safety and canonical downstream assessment/policy projection.
- Correct singular category summary wording without changing assessments.

## Earlier-cohort investigation and recommended priorities

Reviewed 18 retained captures, including 14 usable results and four no-go results.
Sixteen retained 62 WCAG rules. Bounded representative examples already preserve
breadth: IKEA retained eight examples for 49 affected/review elements; Sentry ten
for 72; FullStory twenty for 39. A technically completed audit with manual-review
rules is different from an audit lost to a technical capture failure.

1. **Preserve verified main-document accessibility results when only child frames
   change.** AT&T and Ars reproduced `frames_changed`, not audit deadline expiry.
   Current evidence lacks the per-frame provenance needed to safely preserve a
   subset. Add versioned frame/document binding and exclude unstable or dependent
   results through the typed contract. Keep one existing axe execution and broad
   rule coverage. Do not simply ignore the invalidation or surface discarded raw
   results. This follow-up is identified, not implemented here.
2. **Align exact resolved-target authorization at dispatch.** Earlier Sentry and
   AT&T preference visits stopped on redirects (`sentry.io/welcome/`, `www.att.com`).
   The new AT&T scan used the previously verified final URL as its exact target,
   removing that cause without broadening authorization. A general repair needs
   the approved, versioned resolved-target path; never follow arbitrary redirects
   inside an authorized Options visit.
3. **Improve registered CMP coverage before adding wait time.** Ars identified
   Fides but did not resolve one uniquely actionable Options control. AT&T spent
   its preference allowance on readiness. The basic-capture reserve addresses
   starvation; additional recipes must have retained evidence and boundary tests.
4. **Separate real obstructions from timing failures.** FullStory's retained
   `#q-messenger-frame` intercepted all five Accept and all five Reject hit points.
   Do not call that valid prominence evidence or click unrelated chat controls.

Prioritize basic inventories, exact binding, A/R/O, privacy links, refusal
confirmation, broad WCAG rules, and one useful example per distinct finding
before adding detail. Preserve counts and coverage limits, then distribute
examples across rules/services/categories. Blind top-20-cookie/top-10-link cuts
can hide important minority findings and should not replace this ordering.

## Verification and operational accounting

- 52 preference, OneTrust, privacy classification and evidence-budget tests passed.
- 596 contract tests and 58 CMP projection/report/concise-copy tests passed.
- Scan-core build, Lambda typecheck and web typecheck passed.
- Actual persisted results for all four scans verified against original producer
  bundle SHA-256. CMP, accessibility and policy exports matched SDK and in-memory
  MCP pagination across all 12 section checks. These checks used GET-only mocked
  transport and made no additional public-site visits or scans. Source bytes and
  historical conclusions remained unchanged.
- Selected prominence pixels verified against retained image hash/document token.
  Withheld screenshots remain withheld; approved selected evidence remains usable
  even when another unused image was withheld.
- All four calibration contacts were recorded in the reviewed manual ledger and
  persisted through the canonical contact-only operational workflow, run key
  `owner-cmp-quality-followup-20261014`. No production report was created or changed.
- Temporary local anonymous admission exceptions were restored to 20 immediately
  after each submission. Restored source SHA-256:
  `bd443b8bbbeec2f30cd5f1963231394a615843b3c6049771c7bb96ddc62afb68`.

Evidence and receipts: `artifacts/cmp-quality-followup-20261014/` (ignored local
artifacts), including `retained-cohort-audit.json`, `export-verification.json`,
per-scan receipts, test logs and quota-restoration receipts.

Estimated four-scan/operational one-time spend: below $0.50. Expected incremental
bounded configuration-read compute/metadata cost: below $0.50/month at 100,000
scans, within the approved budget and the repository's below-$1 preapproval.
Existing maximum lane/time/storage-retention limits and model-call counts remain
unchanged. No deployment, SDK publication or production report mutation occurred.
