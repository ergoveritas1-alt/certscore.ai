# Options/Customize lane disabled locally

Owner instruction: "let's disable the options/customize click lane."

The canonical AWS deployment script now sets
`CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED=0`. The local web environment
setting was also changed to `0`; an already-running process must reload its
environment to consume that setting. No live AWS configuration was changed.
The prior no-deploy instruction remains in effect.

The existing coordinator feature gate prevents preference-worker invocation
when the flag is off, including when a request carries an explicit preference
dispatch. The worker independently checks the same gate. Passive CMP capture,
Accept, Reject, and GPC configuration remain unchanged. Missing preference
evidence stays unassessed where passive evidence is insufficient. Existing
scores, reports, and retained evidence were not rewritten.

Validation: 11 focused coordinator, authorization, and passive-ownership tests
passed, including four disabled-lane cases covering an unset or zero flag and
implicit or explicit dispatch. The AWS deployment configuration regression
test passed, and the Lambda package typecheck passed. No public-site scans
were needed for this configuration change.

Incremental cost increase: $0. Disabling the worker removes its invocation,
browser compute, and new preference-artifact storage on future affected scans.
No production savings are claimed before deployment.
