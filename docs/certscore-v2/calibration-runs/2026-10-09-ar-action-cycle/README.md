# Local action cycle: bounded failures and OneTrust diagnostics

Twelve paired visits across Nature, Unleashed and GoTokyo used two repeats per source, balanced ABBA/BAAB ordering, and fresh independent consent-proof, Accept and Reject sessions. Six additional instrumented existing-action sessions investigated Nature/Sodexo confirmation. All 42 browser contacts were persisted centrally using the idempotent run key `ar-action-cycle-20261009`; the four generated cooldown entries were reviewed and merged into the existing local ledger, preserving other entries and Nomura's exclusion.

| GoTokyo branch, local wall time | Before median | After median |
| --- | ---: | ---: |
| Accept | 75.43 s | 15.61 s |
| Reject | 89.37 s | 30.08 s |

GoTokyo still failed action navigation and performed no click. This measures earlier, correctly bounded failure; it is not an interaction success. The old Reject observer ignored the harness's 30-second result-budget argument. The new observer honors it through the existing local headed fallback. The shared committed-document probe now returns unknown after 250 ms rather than waiting indefinitely. Lambda uses worker cancellation and has no macOS headed fallback; these savings are not a production latency estimate.

Click and confirmation counts are unchanged: for each source, each action completed 4/6 clicks and confirmed 2/6 registrations. Unleashed confirmed both actions in both repeats. Nature completed both clicks in both repeats but remained unconfirmed. Its pre-click cookie omitted C0005 despite a five-category configuration. Sodexo's diagnostic cookie similarly omitted category 5. The new diagnostic identifies that missing receipt coverage without inventing consent or refusal. Instrumentation logged only configuration, cookie identity, a value hash, and parsed consent-category bits; no raw cookie value was retained in those logs.

The final 110 action regressions and 22 focused navigation/OneTrust checks passed, as did scan-core typecheck. An initial context-cleanup fixture failure was repaired before the successful final run. Product-source hashes were verified unchanged across the live batch. `cycle-source.patch.json` records this cycle's runtime/test delta against the frozen previous working source; `source-manifests.json` records both source hashes. The prior working source already included the earlier reliability changes and is not the earlier deployed/HEAD baseline.

This is a selected diagnostic cohort, not the rotating release acceptance sample or an estimate of population reliability. No new necessary-only or Portuguese Reject action eligibility was implemented while its separate recurring-cost approval remains pending. No deployment occurred. Local code adds no recurring infrastructure cost; history export and contact persistence are estimated below $0.10 once.

For protocol and packet-level results see `results.json`, `run.mts`, `visit.mts`, `selection.json`, and `operational-receipts.json`. The production caller currently relies on its existing worker abort signal rather than passing this optional Reject result-budget argument. GoTokyo navigation, incomplete OneTrust receipts, and the separately gated new Reject actions remain unresolved.
