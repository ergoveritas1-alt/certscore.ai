# CertScore.ai ReadCube/Gimbal loading and rollout review

October 23, 2026. Investigation only: retained evidence plus one new bounded,
passive local trace per original route. No production code edits, deployment,
flag changes, AWS invocations, clicks, form submissions or production reports.
The existing 3,008 MB Lambda and scan budgets remain unchanged.

## Findings

Both approved redirect chains reached HTTP 200 with native TLS and complete
route proof. Both readiness waits reached their cutoff with zero extra probes.
These are local measurements, including diagnostic overhead, not Lambda latency
estimates. Offsets below are from diagnostic start, including browser setup.

| Checkpoint | ReadCube | Gimbal |
| --- | ---: | ---: |
| Browser launch complete | 387 ms | 53 ms |
| Navigation start | 560 ms | 79 ms |
| Final document commit | 1,292 ms | 755 ms |
| Readiness cutoff result | 1,354 ms | 1,352 ms |
| DOMContentLoaded | 1,975 ms | 1,457 ms |
| OneTrust stub request / finish | 1,303 / 1,485 ms | 1,460 / 1,620 ms |
| OneTrust banner | Request guard at 1,805 ms; finish unretained | Request 2,053 ms; finish 2,145 ms |
| Final passive snapshot | Incomplete at deadline | 2,657 ms; GPP not callable |

The action readiness cutoff is approximately 1,350 ms: a 3,000 ms scanner
deadline, less 250 ms handoff reserve, 1,300 ms opening/submission reserve and
100 ms margin. The passive diagnostic used the remainder of that same 2,750 ms
capture allowance after readiness failed; it never attempted a late action.
Cleanup brought ReadCube's total local duration to 2,867 ms; Gimbal finished in
2,686 ms. No production readiness wait was extended.

ReadCube's main document committed only about 58 ms before the cutoff. Its stub
finished after the cutoff and DOMContentLoaded arrived about 625 ms too late.
The currently recognized `202609.1.0/otBannerSdk.js` appeared later still. The
32-row request inventory filled, and the final DOM snapshot was interrupted by
context closure at the deadline. Its GPP availability and terminal controls
therefore remain unknown. Do not infer their absence or claim a complete causal
profile of its parser from this partial trace.

Gimbal has a concrete recognition omission: its retained banner URL is
`https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js`, whereas the
readiness listener recognizes the stub and exact `202609.1.0` banner only. But
the observed banner finished about 795 ms after the readiness cutoff, so adding
that identity would not recover this attempt. Gimbal's first-party scripts
finished at 1,397–1,440 ms, immediately before DOMContentLoaded; their retained
async/defer attributes are false. This is consistent with parser delay, not a
complete execution profile. The asynchronous OneTrust stub was requested only
after DOMContentLoaded.

At 2,657 ms Gimbal had two matching Settings elements and one dialog element,
but no callable `__gpp`. Element counts do not establish visibility, uniqueness
of an authorized native entrance, or permission to submit. This snapshot cannot
prove permanent GPP absence, other-region behavior or a registered opt-out.
It does show that the current GPP-dependent submission proof was unavailable at
that checkpoint, independently of readiness timing.

Redirect public-address checks totaled 13 ms for ReadCube and 79 ms for Gimbal.
These are not sufficient to explain the late CMP banner. Keep destination
validation before redirect release and target connection; do not remove checks
or cache settled DNS authorization to chase these timings.

## Work that fits the current local authorization and budgets

1. Add Gimbal's exact retained `202604.1.0` banner as a route-scoped readiness
   checkpoint, preserving the existing two-probe/10 ms cap and absolute cutoff.
   Do not replace the exact list with arbitrary version or host matching. Test
   early and late arrivals, wrong route, version lookalikes, probe exhaustion,
   document changes and cleanup. This is a coverage correction, not demonstrated
   recovery; no further action or decision adapter is authorized by it.
2. Continue offline replay of the retained timings and the existing safety
   fixtures. Distinguish cutoff-before-CMP from unsupported decision proof in
   investigation output. Missing terminal facts must remain unknown. Retain the
   existing bounded timing packet rather than adding production late snapshots.
3. Consider local setup/IPC optimization only where it demonstrably preserves
   isolated sessions, guards and deadlines. The observed setup costs are an
   opportunity to profile, not evidence of reclaimable time or a promised fix.

No safe, proven implementation change presently recovers either observed attempt
within all current reserves. The existing limited/neutral result is correct.
This investigation makes no runtime implementation change.

## Changes requiring additional authorization

| Proposed change | Necessary approval and evidence |
| --- | --- |
| Gimbal non-GPP verification | A specific target-bound state adapter, supported by retained authoritative baseline/after/terminal state semantics; exact selectors, action meaning and fail-closed tests. A cookie preference or generic Save cannot be assumed to opt out of sale/sharing. No such adapter is established by this trace. |
| Different action controls | Explicit scope for toggles, generic Save or other controls, with exact route, label, state transition and proof requirements. Existing Settings permission does not grant them. |
| Gimbal external form | Separate authorization for the exact destination, any navigation and any submission/data supplied. Keep excluded; current evidence does not justify this expansion. |
| More time or changed reserves | Explicit approval for revised per-scan deadlines or reserves and their cost. Reallocating time would still change the approved safety policy; an unchanged dollar ceiling alone is insufficient. |
| Skipping original redirects | Explicit new direct-target authorization and a reviewed provenance contract. The present source-specific grants require the original chain. |
| Blocking page resources or altering page behavior | Explicit measurement-policy approval. It could change the privacy behavior being measured; not recommended as a readiness repair. |
| Larger/warm workers, extra lanes or retries | Separate infrastructure, cost and capture authorization; none is needed or recommended on this evidence. |
| Production release or gate changes | Explicit approval of the exact release, selection mechanism, target set, run ceiling, spend cap, stop conditions and rollback. Local implementation approval does not authorize this. |

## Flag recommendation

Reconsider the rollout plan before the next deployment; do not broaden or flip
flags now. Read-only AWS configuration checks during this investigation showed
`CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=1` and
`CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED=1` on
`certscore-v2-dag-local-lambda` in eu-central-1, eu-west-1 and us-west-1, all at
3,008 MB. Flags were not modified. The deployed code identity was not verified
against the local branch, and the live web-service environment was not audited.
These Lambda settings alone do not prove end-to-end production dispatch.

The checked-in web configuration additionally requires sharded scans and its own
enabled environment gate, and emits `all_eligible` for sale/sharing. The dispatch
code checks those conditions again. The deployment script also specifies both
Lambda flags as enabled. There is no separate Settings-specific canary switch in
these paths. Deploying the new recipe code with enabled gates can therefore
activate it immediately for eligible payloads; a flag flip is not a prerequisite
or a readiness fix.

Recommend an explicit, separately authorized canary selection mechanism for the
new recipes before releasing them, preserving existing supported recipes. First
verify the full retained-evidence round trip on controlled fixtures: exact route,
authorized action, baseline/transition/terminal proof, bounded completion and
neutral failures. Then use an exact reviewed target list and a small fixed run
ceiling, without retries or external forms. Stop on any provenance/action-scope
failure, deadline regression or unjustified finding. Require useful verified
success before broadening these recipes; two correctly limited attempts are
evidence of safe failure, not evidence of useful recovery. These two sites alone
do not justify disabling the entire existing opt-out feature.

The six core lanes remain the same. `cmp_preferences` and
`sale_sharing_opt_out` are pre-existing optional workers; eligible scans may have
eight evidence invocations plus the coordinator. This work adds none.

## Cost and verification

This investigation adds $0 recurring AWS spend. The proposed exact script
identity correction retains existing browser/probe caps and evidence objects.
If it allows earlier progress, worker residence can increase within the existing
deadline. At the prior planning rate, one additional second costs about
$4.90/month across 100,000 scans at 3,008 MB, or about $0.058/month at an
illustrative 2/169 affected share. The latter is a cohort illustration, not a
production prevalence forecast. At most two bounded probes share 10 ms total,
about $0.049/month if used on all 100,000 scans. These estimates consume the
existing shared $10 inside $50 allowance; its actual remaining balance has not
been measured. No additional allowance is requested. A production canary needs
an explicit cost cap and measured invocation/billed-duration accounting.

Evidence and the bounded diagnostic harness are retained in
`artifacts/settings-loading-investigation-2026-10-23/`. `analysis.json` records
compact timings, packet sizes, source hash comparisons and retained-file hashes.
The five runtime sources match the prior implementation's live-verification
hashes. Prior implementation tests are documented separately; no new production
test pass is claimed for this investigation. No further live attempt is needed
to establish the findings above.
