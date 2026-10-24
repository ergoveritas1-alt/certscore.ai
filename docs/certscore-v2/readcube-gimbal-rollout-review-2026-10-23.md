# CertScore.ai ReadCube/Gimbal rollout decision

October 23, 2026. Retained evidence and local source review only. The owner has
stopped Gimbal diagnostics for now. No further Gimbal visit is planned or
authorized; a future resumption requires explicit approval.

## Decision

Keep the new Settings recipes gated off, leave the local canary campaign
inactive, and make no global flag change. The safety mechanisms are implemented
and tested, but neither route has demonstrated a successful live opt-out within
current production budgets. A correctly limited attempt establishes safe
failure, not useful coverage. Retain the local fixes and truthful limited results.
There is no evidence here to disable existing supported opt-out recipes globally.

| Route | Implemented and supported by retained evidence | Remaining gap | Rollout judgment |
| --- | --- | --- | --- |
| ReadCube | Passive binding repair, native Settings entrance and bounded readiness replacement; original two-hop route verified with native TLS. Latest deadline-faithful observer committed at 1,152 ms and stopped at 1,351 ms with zero actions. | No usable registered control/GPP checkpoint before cutoff; no opening, submission or same-session verified transition. Later passive trace reached DOMContentLoaded at 1,975 ms and had an incomplete terminal snapshot. | Defer. Readiness recovery and decision proof remain unproven. |
| Gimbal | Passive binding repair, exact accessible-label/version recognition, Settings entrance, bounded readiness and isolated setup overlap. Latest passive diagnostic navigated in 762 ms and found a complete page/own OneTrust object at 5,853 ms. | The six-second diagnostic is not the production action budget. The latest category attempt made no getter call and supplied no category-ID/state mapping. No successful Settings submission or GPP/non-GPP transition is retained. | Defer and stop diagnostics as requested. Object presence and faster navigation do not establish readiness or semantics. |

ReadCube's deadline-faithful action attempt and later passive trace remain its
latest retained observations used here; subsequent Gimbal diagnostics do not
improve ReadCube's evidence. Neither route has retained live successful opt-out
registration. Historical isolated action attempts and passive sessions cannot
be stitched together into a baseline/transition/terminal proof.

Production allowances remain the existing 3,008 MB Lambda, 3,000 ms scanner,
4,500 ms artifact and 5,000 ms worker deadlines, with the existing handoff,
opening/action and observation reserves. The roughly 1,350 ms handler-like
readiness cutoff is materially earlier than the six-second passive checkpoint.
No additional lane, worker, retry, model call or retention extension is proposed.
The six core lanes and pre-existing optional workers are unchanged.

## Canary and flag assessment

The local canary implementation is an appropriate safety prerequisite for a
future narrowly approved rollout, but is not sufficient justification to run one
now. Source review confirms `activeSaleSharingCanaryCampaign()` still returns
null. Ordinary dispatch retains v1 selection; only a trusted exact canary grant
selects the new v3 route. Public options/global flags cannot supply that grant.
The gate source and related dispatch/handler sources still match the retained
76-check verification manifest. Those are historical passing tests, not a new
production verification or a new test run in this review.

The current campaign schema requires exactly two distinct ordered targets:
ReadCube and Gimbal. It is not a one-route or optional-Gimbal campaign. Do not
activate it while Gimbal diagnostics are stopped, manufacture a second slot,
reuse a scan ID or mark Gimbal complete without a verified terminal result. A
ReadCube-only design would require a separately scoped gate change and tests;
retained readiness evidence does not currently justify that work or a live run.

Existing safeguards include immutable version/build/release binding, us-west-1,
3,008 MB runtime validation, expiry within 24 hours, durable conditional claims,
no automatic retry/reset, manual terminal-result review before the second slot,
revocation and original evidence verification. Preflight uses existing time
(up to 500 ms), so it cannot solve either readiness gap and may leave less time.

An earlier retained review recorded enabled sale/sharing and preference flags
on regional Lambda functions. This is historical configuration evidence only;
deployed artifact identity and end-to-end web dispatch were not established.
No current AWS configuration or flag state was queried here. A flag flip cannot
make CMP code initialize earlier or create missing state proof. Any future release
must carry the reviewed default-deny gate, rather than assume an enabled global
flag isolates new recipe code. No broad enable or broad disable is recommended.

## Approval boundaries if this work is reopened

No additional approval is needed to stop diagnostics and retain the inactive
local implementation. Do not treat past consumed visit grants or the shared
cost allowance as continuing live-test permission.

| Future action | Required scope before proceeding |
| --- | --- |
| ReadCube-only canary | Explicit local gate/schema change and tests for one fixed slot, preserving replay protection, release/route binding and neutral failures; separate deployment and one-run authorization. No automatic second target or retry. |
| Original two-route canary | Explicit resumption of Gimbal, exact reviewed release/build/immutable Lambda version, both original URLs and scan IDs, order, expiry within 24 hours, fixed two-attempt ceiling, stop/revocation rules and operator review before slot two. Separately authorize AWS deployment and trusted internal campaign activation. |
| Production preflight | Verify actual deployed baseline/web and worker gates, remaining shared allowance, complete-scan/redelivery cost bound, existing S3 claim-prefix permissions/conditional writes/retention, immutable version and canonical evidence round trip. No cloud inspection is performed under this retained-only request. Any required IAM, bucket, lifecycle or workflow mutation needs specific review/approval. |
| New state verification or actions | Evidence-specific approval for new SDK reads, a non-GPP contract/adapter, new action semantics, toggles/Save or external forms. No category ID or sale/sharing meaning may be assumed. Gimbal external forms remain excluded. |
| More budget or infrastructure | Explicit approval for time/reserve changes, larger/warm workers, extra lanes, retries, recurring cost or retention changes. None is justified or recommended now. |
| Flag activation or broader rollout | Separate exact release/gate/target/volume authorization and cost/rollback plan. Require useful verified success for each recipe before widening exposure; canary safety alone is insufficient. |

The earlier **$0.25 total incremental two-attempt campaign cap**, including
ledger/scan/log/artifact/redelivery costs, remains a proposal inside the existing
shared **$10/month within $50**, not a new budget or a verified remaining balance.
The prior ledger allowance was under $0.01 per campaign under retained planning
rates, not a current price check. No new cost estimate is needed to stop; this
review adds **$0 recurring AWS spend**. Before a future campaign, verify that
the complete bounded cost fits the remaining allowance rather than rely on
billing after execution. No budget increase is proposed. Keeping the campaign
inactive is the lowest-cost alternative.

## Evidence audit

`artifacts/readcube-gimbal-rollout-review-2026-10-23/audit.py` rechecks both
readiness visit receipts and embedded packet hashes, the retained ReadCube/Gimbal
loading traces, the latest Gimbal category and document-guard visit hashes, and
canary source/test-log hashes. It confirms the inactive two-target campaign in
local source. Results are in the adjacent `analysis.json`. Historical AGENTS.md
hashes are intentionally not asserted because subsequent approved diagnostic
records changed that file. No new browser tests, live requests, cloud reads,
deployment, runtime change or flag change occurred.
