# Local five-second Baseline → GPC capture

The owner approved local implementation and validation on October 20, 2026,
after reviewing the estimated cost and latency. No production deployment or
production enablement is authorized.

## Scope and safeguards

`CERTSCORE_LOCAL_GPC_COMPARISON_5S_ENABLED=1` attaches an exact 5000 ms diagnostic
override only to non-production localhost dispatches with `targetEnvironment=local`.
The worker accepts this override only for the baseline `runtime_evidence` and
`gpc_observation` lanes, excluding inventory crawls. Production, consent-proof,
policy, Accept, Reject, and other workers keep their current behavior.

The existing document-bound request capture stays open until at least five seconds
after commit. Initial atomic page inventory runs concurrently, preserving early
forms and DOM evidence. The single actual GPC signal readback follows the minimum;
existing CMP, cookie, form, transport and accessibility work is not removed.
The two passive lanes receive five seconds of additional module and local worker
budget rather than borrowing from existing checks. Parent cancellation and existing
outer safety caps remain authoritative.

The existing collector retains 250, 500, 1000, 3000 and 5000 ms checkpoints when
verified. The canonical assessor still chooses the longest independently complete
common interval from verified original artifacts. Navigation invalidation, missing
signal proof, overflow, and incomplete retention remain fail-closed. Raw evidence
caps and the 64 KiB compact comparison ledger allowance do not increase. No new
lane, browser session, privacy action, model call, finding policy or scoring rule
is introduced. Previously saved reports are unchanged.

## Approved estimate

At 100,000 scans/month, using 3008 MB x86 Lambda functions and USD 0.0000166667
per GB-second before discounts/free tier:

- Latest canary: baseline needs 3414 ms and GPC needs 3391 ms additional observation.
- Parallel lane timings imply approximately 1689 ms additional coordinator waiting.
- Additional compute is approximately USD 41.59/month; a conservative allowance
  of five seconds for each worker and the coordinator is USD 73.44/month.
- Traffic and retained-artifact overhead are workload-dependent, not included in
  the compute figure; the validation run will report actual artifact growth.
- The local simulated capture itself does not incur these Lambda duration charges.
  The required read-only central calibration-ledger export uses one existing ECS
  one-off, estimated below USD 0.01 for this validation; no standing capacity changes.

These are planning estimates, not a measured production cohort. Actual latency
depends on which parallel lane is on the critical path. The latest canary predicts
about 1.7 seconds added overall; other scans may add approximately 0–5 seconds.
Other checks' later completion and cohort-level latency still require measurement.

Pricing reference: https://aws.amazon.com/lambda/pricing/.

## Validation

Deterministic browser fixtures cover both signal conditions, five-second windows,
an initial form removed later in the visit, delayed advertising collection,
cookie evidence, unchanged default capture behavior, and parent cancellation.
Configuration and dispatch tests cover default-off/local-only behavior and strict
duration parsing. Retained-source replay and the localhost report are checked
after the owned ErgoVeritas canary completes.

### Verified canary result

Fresh scan: `efc70afb-6bb8-49ff-9693-e8105cb85823`, target
`https://ergoveritas.com/test1.html`, completed locally on October 20, 2026 (PDT).

- Both original worker artifacts verify against their retained size/SHA-256
  pointers. Canonical replay exactly matches the persisted report export.
- Baseline and GPC signal readbacks each cover 5006 ms after their own document
  commit. Both retain complete 250/500/1000/3000/5000 ms checkpoints with no
  dropped requests or capture limitations.
- The report projects 5000 ms. Advertising/marketing requests are 1 → 1 and
  analytics/replay requests are 5 → 5. The 3000 and 5000 ms checkpoints have
  identical request sets on this canary; no incremental activity was found
  between seconds three and five. This is not a representative cohort result.
- The same seven cookie names, five pre-consent field observations, three WCAG
  failures, verified hidden-link evidence, five observed transport checks and
  7/11 observed transparency rows remain. The report score remains 28.
- Coordinator capture/join time is 6997 ms versus 5764 ms in the preceding scan,
  an observed increase of 1233 ms in this non-controlled local pair. The report's
  55811 ms intake-to-completion value includes a manual CLI harness restart
  before browser execution and must not be reported as capture latency.
- The baseline artifact grew by 631 bytes and GPC by 746 bytes. These small-site
  deltas do not establish cohort-level traffic or retention cost.
- 240 focused tests pass (49 dispatch/report boundaries, 144 Lambda handler,
  37 capture/assessment/retention, 10 simulated-dispatch). Core, Lambda and web
  typechecks pass, as does `git diff --check`.
- The central contact ledger was exported read-only before the owned canary.
  A local contact-only ledger candidate and idempotent scan/cohort receipts are
  retained under `artifacts/gpc-five-second-local/`; no rotating public targets
  were selected or contacted, and no production ledger was changed.

The in-app browser tool denied access during verification. No alternate browser
surface or browser-state workaround was used. The rerun used the canonical local
workspace scan service with normal quota/cooldown enforcement, and verification
used the report JSON API and original retained sources. Interactive visual review
of this fresh report remains for the owner.

Verification receipt: `artifacts/gpc-five-second-local/verification.json`.
Report export: `artifacts/gpc-five-second-local/report.json`.
Local report: http://localhost:3000/app/scans/efc70afb-6bb8-49ff-9693-e8105cb85823.

All changes remain local and uncommitted. Production settings and deployment are
unchanged. Broader deployment requires separate authorization and calibration.
