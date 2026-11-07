# CertScore.ai conditional explicit opt-out lane

Status: locally implemented and tested. The owner approved the additional lane,
its extra cost, and bounded live verification on November 5, 2026. Accept and
Reject keep their existing dispatch configurations, workers and deadlines.
Production flags and deployments have not changed. Earlier Accept-substitution
work was removed; its snapshots remain under
`outputs/privacy-choice-experience-2026-11-05/superseded-substitution/`.

The owner subsequently approved priorities 1–3: native AX locator binding,
reviewed on-page OneTrust links and a verified operational funnel. See
[the follow-up policy](opt-out-binding-funnel-policy-2026-11-05.md). The section
below records the initial lane scope; the follow-up versions its extensions.
Luna evaluation is explicitly excluded.

## Dispatch and evidence

`conditional_opt_out_seven_workers.v1` preserves the six existing evidence lanes
and permits at most one additional exact-target v1 sale/sharing worker. Both the
web and durable queued-scan publishers use the same explicit opt-in predicate:
sharded intent, enabled sale/sharing with `all_eligible`, and both
`CERTSCORE_CONDITIONAL_SALE_SHARING_OPT_OUT_ENABLED=1` and
`CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=1`. Existing flags alone preserve the
six-worker presence profile.

The coordinator starts the existing checksum-verified consent artifact read as
soon as that worker returns, and reuses it at final merge. It does not poll,
add a discovery visit, or change Accept/Reject scheduling. A visible native
button must retain a direct explicit opt-out label, reviewed OneTrust locator,
local consent context and exact current-document identity. DOM visibility and
accessibility-tree visibility have different existing contracts; no AX-only
locator is silently converted into a CSS locator. The exact `#ot-sdk-btn` DOM
hint can schedule inspection, but the action worker must independently verify
the recipe class and every existing actionability check before interacting.
Policy instructions, anchors, generic Settings, ambiguous controls, changed
URLs and held ReadCube/Gimbal/infillion targets do not dispatch.

A launch requires at least the existing 5,000 ms worker allowance remaining in
the absolute coordinator work budget. The existing 3,000 ms capture, 4,500 ms
artifact allowance, 5,000 ms worker limit, memory configuration and all other
lane budgets remain unchanged. There is no additional publication tail wait:
an unfinished action is cancelled at the existing join barrier, and the report
is published once. Consequently, an eligible control does not guarantee that
its action can finish before the report barrier. Lambda invocation retries are
disabled for this profile to avoid repeated action execution.

The manifest retains the conditional decision, reason and eligible source hash.
Daily audit distinguishes `conditional_no_dispatch_recorded` from
`dispatch_recorded`, a six-worker exclusion and conflicting profile evidence.
A valid lane outcome proves dispatch, not submission, confirmation or honoring.
Verified action packets continue through the existing canonical assessment,
concern, policy and finding pipeline. No scoring policy changed.

Browser fixtures also exposed an existing opt-out action-counter bug: the
shared click helper invokes its safety assertion twice. Only this observer was
changed to increment at its one committed-dispatch callback. The shared click
helper, Accept and Reject are unchanged.

## Report priorities 1 and 2

The report now separates GPC delivery, site-recorded sale/sharing settings,
opt-out method presence and explicit action outcome. Retained successful
collection and recipient references are visible with their coverage. A missing
packet is not presented as a failed opt-out. Matched-window comparison and the
longer GPC observation keep their own time scopes.

The copyable developer package contains the scan context, sanitized request
references, existing canonical findings, responsible roles, investigation steps
and a retest checklist. It does not invent a root cause, infer consent from a
click, recommend mandatory GPP adoption or explain scoring deductions. A
selectable textarea remains available if clipboard access fails.

## Verification and limitations

Evidence and logs: `outputs/conditional-opt-out-2026-11-05/` and
`outputs/privacy-choice-experience-2026-11-05/`.

- Full coordinator regression: 176 passing tests, including preserved Accept,
  Reject and GPC, confirmed/unsupported opt-out packets, corrupt hash, wrong
  target, hanging worker, insufficient time and one-read/one-publication checks.
- Browser-backed opt-out fixtures: 30 passing tests, including successful
  confirmation and rejection of forms, generic Save/Reject and ambiguous controls.
- Focused report/dispatch/contract suite: 65 passing tests. Both publishers were
  additionally tested with nonempty Accept and Reject configurations. Daily
  audit tests cover conditional intent and conflicting effective-dispatch proof.
- Web, Lambda and validation-worker TypeScript checks pass.
- 34 GPC pairs / 68 original worker sources replayed through canonical report
  projection; 221 hash-verified daily exports, 165 reportable scans and 4,125
  state comparisons: zero mismatches or retained-evidence mutations.
- 1,842 hash-verified historical canonical bundles were assessed for scheduling
  eligibility. None established this narrow executable route. The recent daily
  cohort's original consent-worker bundles were not available in that set;
  its public projections must not be treated as actionable locator proof.
- Local browser preview passed at 390 px and 1,280 px without horizontal page
  overflow. Copy status, clipboard-denied fallback, evidence navigation, and
  observed versus unavailable CMP settings were checked.

Three targeted public sites produced seven core captures and one conditional
action-worker visit. These are local diagnostics, not population calibration
or production-region verification. Webcrawler retained an eligible native
control and triggered the observer; it returned `unsupported` at the entrance
safety check after approximately 496 ms, with zero clicks and no submission.
Its consent lane's access classification was unknown, so no further baseline/GPC
pair was attempted. Evernote retained an AX-bound button with a longer accessible
label; Taboola retained an anchor. Both skipped the unsupported action route.
Their baseline/GPC pairs retained verified header and main-browser delivery and
matched 3,000 ms activity windows; semantic state remained unavailable/not ready.
No public-site successful explicit opt-out was demonstrated. Local successful
fixtures do not establish public-site success.

No ReadCube/Gimbal contact, external form, model call, AWS scan invocation,
production write, deployment or production flag change was made. Eight public
contacts are recorded under the idempotent diagnostic run key and in the local
repository contact ledger. The owner waived cooldown. This targeted diagnostic
is not an acceptance sample for population coverage.

## Cost

The owner approved extra cost; no new recurring spend is enabled locally.
At 100,000 scans/month, 3,008 MB and five billed seconds per triggered worker,
a 6.1% trigger scenario is about $1.48/month in Lambda compute and a 19.4%
scenario about $4.75/month, before free tier, startup overhead, storage, requests
and networking. These are sizing examples, not forecasts. The daily cohort's
10 first-layer controls (6.1%) and 32 broader methods/signals (19.4%) are not
executable-recipe counts and must not be added. Pricing reference:
https://aws.amazon.com/lambda/pricing/.

The local implementation uses existing recipes and flags remain inactive.
The follow-up policy above defines the approved AX binding and on-page OneTrust
link extension. Additional CMP recipes and larger capture allowances remain
outside this scope.
