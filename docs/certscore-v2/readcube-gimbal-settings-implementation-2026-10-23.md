# CertScore.ai ReadCube/Gimbal Settings entrances

October 23, 2026. The owner approved local implementation, tests and one bounded
live validation per original route, preserving current action checks and budgets,
excluding external forms, with no deployment or flag changes.

## Implementation

Added `onetrust.readcube_settings.v1` and `onetrust.gimbal_settings.v1` as scoped
entrance variants in the canonical OneTrust registry. They apply only under the
existing v3 exact-route policy, after the complete retained redirect chain binds
`https://readcube.com/` to `https://about.readcube.com/` or
`https://gimbal.com/` to `https://infillion.com/`. Direct destination visits,
original documents without that chain, other sources and historical policies
receive no new Settings authority.

ReadCube allows its exact native `button#onetrust-pc-btn-handler` and reviewed
Cookies Settings names. Gimbal allows its corresponding native Cookie Settings
button, or `a#ot-sdk-btn.ot-sdk-show-settings` only when the native selector is
absent. A hidden, duplicate or unsafe native button cannot trigger an anchor
fallback. Selection happens once before any action; no retry is added.

The anchor must have raw `href="#"` resolving to the exact action page fragment,
with no target, download or form association. External/absolute URLs and altered
base URLs fail closed. Both variants require exact reviewed accessible and
visible names, canonical Options classification, unique visible enabled controls
in the top document and the existing geometry checks. Shadow-root entrances
remain excluded. The global action classifier is unchanged;
ReadCube's plural Cookies Settings remains observation-only globally. The exact
route-specific grant supplies opening authority, not sale/sharing semantics.

The existing dialog, explicit submission labels, field/form exclusions,
same-session GPP baseline/after/terminal verification, document/loader checks and
post-confirmation observation remain in place. Open -> toggle -> Save is not
supported. New recipe versions occupy the existing typed evidence field and flow
through the existing canonical pipeline; no assessment, findings or score policy
was changed. Existing explicit OneTrust recipe behavior remains available under
its original version when a new Settings entrance is not selected.

## Limits and costs

No coordinator/worker dispatch, Lambda configuration, feature flag, lane count,
model call or production resource changed. Keep 3,008 MB Lambda, 3,000 ms capture,
5,000 ms worker, 4,500 ms artifact deadline, two actions, three bounded decision
reads, 250 ms grace plus 500 ms observation, 32 request rows and 32,000-byte packet.
The passive preference lane remains passive. External forms are not followed,
filled or submitted by these recipes.

Local implementation/tests and these local checks add $0 recurring AWS spend.
A future separately approved rollout may increase time used by existing workers:
at the prior planning rate and illustrative 2/169 share of 100,000 monthly scans,
one to three extra seconds is approximately $0.06-$0.18/month compute; allow less
than $0.10 extra JSON in existing packets/retention. Traffic and production
frequency remain unmeasured. Share the previously approved $10 inside $50 with
prior repairs; this is not a new allowance or a verified remaining balance.
All-scans prevalence would instead cost about $4.90-$14.69/month compute, so
actual eligibility volume and combined spend require review before rollout.

## Validation

Results and hash receipts are retained under
`artifacts/settings-entrances-2026-10-23/`. Fixture requests terminate on a local
TLS server through a closed CONNECT proxy; they do not visit public targets.
The live harness invokes the actual local opt-out observer once per original
route, with native TLS and the public-network guard. Exclusive per-route attempt
receipts prevent accidental reruns. It does not invoke AWS or create production
scan records. These are owner-selected diagnostics, not a rotating calibration
sample or evidence of production recovery. Repository contact holds are checked
for every authorized route host. No deadline or wait is extended for discovery.

Verification: 38 focused checks and 200 existing navigation, redirect, explicit
opt-out, classifier and diagnostic-projection checks passed (238 total).
Scan-core and shared typechecks passed. Cases include both approved entrances,
native-button precedence, hidden/duplicate/disabled/misnamed controls, forms,
external links and altered base URLs, shadow roots, missing/reversed GPP,
unchanged global classifier behavior, incomplete routes and insufficient time.

| Original route | Local elapsed time | Retained result | Actions |
| --- | --- | --- | --- |
| ReadCube | 1,870 ms | HTTP 200 at approved final destination with both redirect hops verified; no registered control found at the existing readiness checkpoint (`no_unique_registered_recipe`) | 0 |
| Gimbal | 2,406 ms | HTTP 200 at approved final destination; `onetrust.gimbal_settings.v1` selected, then stopped for `insufficient_capture_budget` | 0 |

Both captures retained native TLS and exact redirect ancestry. ReadCube reached
the usable-document checkpoint at 1,846 ms; absence at this checkpoint does not
establish later absence. Gimbal reached it at 2,349 ms, leaving less than the
existing approximately 1,300 ms entrance reserve. No Settings panel or external
form was opened; neither scan attempted or verified registration. There were no
retries or extended waits. No successful live opt-out or production recovery is
claimed. Local process timing does not measure Lambda performance.

A final conservative top-document-only check was added after the live attempts
and verified with a shadow-root negative fixture. The two authorized live
attempts were not repeated; both had zero actions before that additional guard.

## Remaining authorization boundaries

External-form inspection/submission, toggles, generic Save, non-GPP state
adapters, new destinations, larger budgets, further live attempts, deployment
and flag changes remain outside this approval. Unsupported or incomplete results
are coverage limits, not proof of a broken privacy mechanism or a successful
opt-out. No historical reports are rewritten.
