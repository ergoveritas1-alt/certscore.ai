# CertScore.ai local opt-out funnel and observer repairs

The owner authorized local implementation on October 23, 2026, within existing
budgets and interaction approvals. No deployment, rollout change, public-site
scan, production write or historical report rewrite was performed.

## Scope and evidence

The existing explicit sale/sharing observer is separate from cookie Reject and
passive CMP inventory. Work stays in WC01's production DAG packages; it does not
introduce a WS01 production deployment target or browser work in the coordinator.

The read-only retained-cohort audit checks original bundle bytes against retrieval
receipt SHA-256 and byte size, then checks embedded opt-out packets against their
original hashes and sizes. Retained canonical report exports are independently
scan-bound and hashed for the audit; missing/invalid exports leave the final
finding checkpoint unknown. Those report hashes are audit fingerprints, not
original retrieval attestations. Reports cannot fill missing action evidence.

The 122- and 47-scan cohorts contain 169 verified original bundles and 165 retained
opt-out packets. No packet selected a recipe, submitted a choice or confirmed an
opt-out. Terminal reasons:

| Reason | Scans |
| --- | ---: |
| Navigation failed | 81 |
| Navigation budget exhausted | 46 |
| No unique registered recipe | 28 |
| Recipe inspection budget exhausted | 5 |
| Document binding budget exhausted | 3 |
| Observation cancelled | 2 |
| Worker/join budget exhausted, no packet | 4 |

These are operational counts, not accuracy, legal conclusions or a representative
provider prevalence estimate. Historical usable-document checkpoints are unknown
unless the original packet retained a document token. No old packet is upgraded.
168 report exports contain bound canonical finding inventories; one is unavailable.
There are no retained explicit-opt-out activity findings in those inventories.

Among the 28 unsupported paths, independent passive observations name OneTrust on
three scans, InMobi on two, Google on one and Quantcast on one. Those independent
sessions do not prove the action session's DOM or authorize another recipe.
Consequently this pass expands documented OneTrust configurations, not new vendors.

## Implementation

- Optional `sale_sharing_execution_diagnostics.v1` records six ordered milestones
  and at most three bounded semantic-read outcomes in the existing v1 packet.
  Historical packets without diagnostics remain readable. The metadata contains
  no raw labels, cookies, GPP strings, form values or request payloads. It is
  operational only and cannot create a concern, finding, registration or score.
- The funnel separates configured, eligible/dispatch-attempt evidence, usable
  document, recipe selection, actionable submission control, completed submission,
  confirmation, completed observation, retained verified packet and retained
  canonical finding. An absent historical checkpoint is not manufactured. Packet
  retention is independent of observation success, so this is not a strictly
  decreasing series of counts. A retained lane outcome establishes dispatch
  attempt, not proof that AWS started a browser worker.
- Recipe discovery uses one top-document DOM read over the canonical registry.
  No generic locator, guessed selector, frame traversal or shadow-root expansion
  is added. Provider ambiguity remains unsupported.
- Each of the existing before/after/terminal semantic reads accepts one callback
  for at most 50 ms inside the original deadline. Synchronous duplicates, invalid
  data, missing API, exceptions and late callbacks fail closed. No polling,
  retries, registration backdating or observation-window restart is added. The
  canonical GPP parser remains unchanged and raw strings stay in the browser.
- Submission reserves the existing 750 ms anchored grace/observation, a bounded
  terminal read and cleanup. Entrance and submission dispatch timeouts cannot
  consume that reserve. A tight deadline prevents a choice rather than reducing
  the observation window. Exact target, main-document loader, safe geometry and
  isolated-session checks remain mandatory.
- Future packets distinguish unavailable decision baseline from already opted
  out, and missing navigation response from HTTP error and target mismatch.
  An incomplete readback never means a broken privacy mechanism.
- OneTrust recipe `onetrust.explicit_sale_share.v2` supports the documented
  `button.ot-sdk-show-settings` class without requiring a fixed ID, bounded
  `aria-labelledby` naming, and explicit “Do Not Sell or Share” / “Do Not Sell My
  Personal Information” submission labels in addition to the prior full label.
  Both sale and sharing must still reach the supported opt-out state. A visible
  generic Save/Accept label cannot borrow an accessible opt-out name. Names over
  the bound fail closed rather than being truncated into an actionable label.
  A uniquely visible existing panel still uses only one submission action.
  Exact entrance labels exclude unrelated rights-request and generic settings
  actions. Native buttons, no form ownership, no fields/toggles and no ambiguous
  controls remain required.

OneTrust primary references reviewed October 23, 2026:
[documented preference button selectors](https://developer.onetrust.com/onetrust/docs/common-custom-css),
[class-based SPA controls](https://developer.onetrust.com/onetrust/docs/single-page-applications),
[explicit sale/sharing button configuration](https://developer.onetrust.com/onetrust/reference/publishscripttosite),
[CCPA integration](https://developer.onetrust.com/onetrust/docs/iab-ccpa-us-privacy-string).
These sources establish supported configurations, not their prevalence in the
retained cohort. Synthetic fixtures are not website observations.

## Fixed budgets and cost

Worker 5,000 ms; capture 3,000 ms; memory at most 4 GB; at most two authorized
control actions; 250 ms grace plus 500 ms observation; 32 request rows; existing
32 KB verified packet ceiling; existing artifact/return reserve and one terminal
publication. No new lane, invocation, request/header inspection, model call,
screenshot, navigation candidate, provisioned capacity or retention extension.
GPC/Reject's separate 48/32 proof caps and passive CMP restrictions are unchanged.

New diagnostic metadata is bounded below 1 KiB in the covered fixtures (about
500 bytes for a successful path). Estimated additional metadata/storage and
bounded local classification is below $0.50/month at 100,000 scans with existing
retention; this estimate was disclosed before implementation. Recovered paths
and asynchronous reads can use more of the already-approved observer allowance;
they are not assumed cost-neutral. Their complete execution remains inside the
existing $50/month / 100,000-eligible-scan envelope. Measure actual worker time
and aggregate spend before any separately authorized rollout. No production cost
was incurred by this local work.

## Verification and use

Run the original-bundle audit without network access:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/audit-retained-opt-out-funnel.ts \
  artifacts/mini-bot-review-2026-10-21 \
  artifacts/mini-bot-review-2026-10-21/original-verification.json
```

The second cohort uses `artifacts/postdeploy-independent-review-2026-10-21` and
its `raw-retrieval-receipts.json`. The existing California audit also accepts
`--input /absolute/path/to/cohort.json` for saved cohort rows. Its default numeric
argument retains the pre-existing production read-only audit path; that path was
not invoked. Full stage detail needs the retained observation, lane outcome and
canonical finding inventory; missing inputs stay unknown.

Verification artifacts are under `artifacts/opt-out-local-repairs-2026-10-23/`:
original-cohort funnels, focused browser/contract/audit test output, canonical
projection validation summary and typecheck logs. Tests cover asynchronous/missing/late/
duplicate callbacks; class-only and ARIA controls; original and shortened labels;
already-applied choices; generic Save, forms, fields, conflicting/overlong names,
duplicate controls, HTTP failure, target changes and tight worker deadlines.
Canonical tests exercise JSON persistence, hash tampering and unchanged finding
eligibility/scoring. No new customer wording or regulatory finding policy is added.

Final local validation: **105 distinct focused checks passed**, including the
final tight-action deadline case. Contracts, shared, scan-core, scripts and web
typechecks passed. Successful synthetic paths added 500–505 diagnostic bytes
and completed in 845–963 ms. These are local fixtures, not production latency
or live-site coverage measurements. `verification.json` records exact tested
source hashes and test-group overlap.

## Remaining approval and evidence boundaries

Deployment and production verification scans remain separately authorized steps.
Redirect-target authorization, extra navigation/retries, longer deadlines, fields,
toggles, generic Save, deeper choice flows, accounts and verification submissions
are outside this implementation. Opening Options/Manage in the passive CMP worker
would require changing the explicit passive-only policy. New misleading-choice,
verification-requirement or CMP-defect findings and scoring policies need approval
of concrete evidence rules and customer wording. Any cost outside approved
allowances follows the $1/month approval rule.

Other providers need source-reviewed action recipes and same-session fixtures
before implementation; retained passive vendor identity alone is insufficient.
The historical navigation failures are not fixed by the OneTrust expansion. Their
exact-target guards remain intact, and live coverage improvement is unmeasured.
