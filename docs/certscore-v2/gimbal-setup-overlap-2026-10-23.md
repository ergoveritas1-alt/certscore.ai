# CertScore.ai Gimbal setup overlap

October 23, 2026. Owner-approved local implementation and offline tests only.
No public scans, deployment, flag changes, AWS invocations or canary activation.

## Change

The sale/sharing observer now overlaps initial blank-page creation with the
existing HTTP identity and public-network guard installation sequence for the
exact validated Gimbal v3 route only. It still creates one isolated context in
the existing browser. Identity installation finishes before public-network guard
installation starts. Both installers and page creation must finish before the
observer installs its remaining navigation/CDP guards and starts the original
Gimbal navigation.

Selection requires `bounded_sale_sharing_opt_out.v3-exact-routes`, the exact
`https://gimbal.com/` source and the canonical `gimbal.v1` route grant to
`https://infillion.com/`. Selection is only a scheduling decision; it grants no
navigation or action authority. Existing dispatch validation, canary/worker
authorization and full live redirect/document verification remain required.
ReadCube, direct Infillion visits, Gimbal v1/v2 and all other targets retain serial
setup. No feature flag or new rollout switch was added.

`gimbal-setup-overlap.ts` uses the observer's existing cancellation signal and
remaining-time check. It adds no timer or reset deadline. On either setup failure
or cancellation it closes the isolated context; a page resolving afterward is
closed separately. Both promises retain rejection handlers, so a late rejection
cannot reopen work or become an unhandled rejection. A stalled branch does not
extend the cancellation wait. The observer retains its existing bounded cleanup.
The page must remain `about:blank` both when created and when the setup barrier
finishes.

The observer change is limited to its setup branch and the helper import.
Readiness predicates, DNS/TLS checks, original redirect ancestry, loader binding,
action geometry/labels, GPP reads, two-action cap, refusal/observation reserves,
packet limits and canonical assessment/scoring are unchanged. No script is
preloaded, blocked, injected, reordered or invoked by this change. External forms
remain excluded.

## Offline verification

**125 checks passed**, with no failures:

- 22 new setup/observer checks: exact selection, actual overlap, both completion
  orders, ordered guard installation, prevention of navigation before all setup
  and redirect guards finish, failure of either branch, stalled cancellation,
  late completion/rejection, listener cleanup, existing absolute deadline,
  nonblank-page rejection and unchanged non-Gimbal serial behavior.
- 103 existing checks: exact routes, Settings entrances, Gimbal script readiness,
  bounded readiness and legacy sale/sharing observation. These retain successful
  owned-fixture actions and fail-closed cases for missing GPP, changed targets,
  external forms, invalid controls, deadline exhaustion and reversed decisions.

Scan-core typecheck and a focused strict typecheck including the new tests both
passed. Browser regressions use loopback servers, locally fulfilled scripts or
CONNECT proxies restricted to owned fixtures. Public-looking hostnames in those
tests are fixture identities; no public website was visited. Observer wiring
tests use browser doubles and restore their local HTTP identity test values.
No production environment or feature flag was changed.

Evidence is under `artifacts/gimbal-setup-overlap-2026-10-23/`: test logs,
typecheck logs, pre-change observer/agent-note snapshots and a verification
manifest. The pre-change snapshot distinguishes this small edit from earlier
uncommitted observer work. Earlier live evidence remains unchanged.

## Budgets, limits and remaining approval

Keep the current 3,008 MB Lambda and existing topology. No lane, invocation,
context, page, request, SDK read, model call, retained field or storage object
was added to a scan. The 3,000 ms scanner, 4,500 ms artifact and 5,000 ms worker
deadlines, observer handoff and action reserves are unchanged. Both setup
branches consume the original absolute capture allowance.

Local work adds **$0 recurring AWS cost**. This optimization changes scheduling
of existing operations; production latency and net spend are unmeasured. An
attempt progressing farther can consume more of its already-approved capture
allowance. Any later activation must remain within the shared $10/month inside
$50 and verify the remaining allowance. No additional budget approval is needed
for this completed local work.

The offline tests establish ordering, isolation and failure behavior, not a live
speed improvement or recovered Gimbal readiness. Retained timings still do not
show that this small setup optimization closes the initialization gap. See
`gimbal-initialization-budget-review-2026-10-23.md` for that limitation.

No further approval is needed for the delivered local change. A new public visit,
deployment or scoped canary activation still needs explicit approval. Broader
target coverage, larger workers, extended waits, changed action checks, a non-GPP
adapter or external-form work would also need separate authorization. Flag
changes are not recommended as an initialization fix and remain unchanged.
