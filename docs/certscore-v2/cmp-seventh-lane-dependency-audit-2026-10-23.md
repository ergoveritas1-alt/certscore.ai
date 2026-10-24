# CertScore.ai CMP preference worker: seventh-lane decision

October 23, 2026. Retained evidence and local code only. Six-worker implementation
remains paused. No runtime edits, deployment, flags, cloud reads, live scans,
report rewrites or Gimbal diagnostics occurred.

## Recommendation

The current passive CMP preference worker does **not yet earn a default seventh
lane on the retained evidence reviewed here**. Preserve its implementation and
historical evidence, but do not broaden or enable it on the strength of its
potential capabilities alone. Also do not simply disable it: the dependency audit
found a projection dependency that would hide independently captured facts.

The lowest-cost next implementation, if approved, is to make independent CMP
audit rows survive without a preference packet or outcome, then finish the
presence-only path using verified core-lane observations. Do not migrate the
entire optional inspection into the six core lanes or increase their work budgets.
Keep optional inventories explicitly unassessed when no other verified source
supplies them. A later selective seventh-lane proposal would need demonstrated
incremental value and bounded selection/cost evidence; it is not ready for rollout.

## What was measured

The October 23 retained daily-audit inventory contains 342 scan IDs. The analysis
verified **341 original canonical bundles and 341 manifests against their
retrieval receipts: 682 original files**. One failed inventory scan has no retained
bundle and was excluded. There are 267 distinct requested URLs among the 341;
the inventory mixes SDK/MCP/other API traffic, repeats and a test page, with traffic
class unknown. This is not a representative customer-satisfaction or prevalence
sample. Fifty-seven bundles retain a no-go decision; no positive incremental
result below comes from those no-go bundles.

All 341 retained preference packets are schema-valid `passive_cmp_inventory.v1`,
with zero actions and no opened panel. Seventeen packets are completed and 324
limited; 271 have bound document proof. Packet completion is not the benefit
metric: partial independent checkpoints can be useful, while completed results
can duplicate core evidence.

The offline comparison runs the current canonical CMP assessment projector on
each original bundle, then on an in-memory copy with only `cmpPreferencesEvidence`
and `cmpPreferenceLaneOutcome` removed. All core evidence remains unchanged.
It compares assessment status and positive inventory facts, excluding source-ref
changes and empty purpose/duration fields from purported gains. Original bundle
objects are checked for mutation. This measures current materialization behavior
on retained inputs, not a prediction of fresh six-worker scans or a rewrite of
customer reports. Full customer scores were not recalculated.

| Incremental result from retaining the preference worker | Scans | Interpretation |
| --- | ---: | --- |
| Privacy-policy link hit-target reachability | 5 | All five are `https://ergoveritas.com/test1.html`; one repeated test URL. This is privacy-policy reachability, not sale/sharing opt-out effectiveness. |
| Additional category/service names or positive cookie purpose/duration facts | 0 | No unique assessed fact beyond core sources under the comparison rules. |
| Additional sale/sharing/privacy-choice controls in California projection | 0 | Passive link-presence workpaper is identical with and without the preference packet in every comparison. |
| Post-Accept/Reject activity row disappears on naive removal | 38 | Independent action-lane evidence is still present; projection dependency. |
| Cookie-expiry row disappears on naive removal | 25 | Independent cookie/action evidence is still present; projection dependency. |
| Consent-record row disappears on naive removal | 10 | Independent action storage is still present; projection dependency. |

The last three rows overlap across **53 scans**. Together with the five reachability
scans, naive removal changes useful assessment content in 58 scans; **53 of those
58 are not evidence of unique seventh-lane capture value**. The 38/25/10 counts
must not be summed as distinct scans.

Two completed CookieYes examples initially looked like inventory gains, but
inspection resolved them as duplication: wrdns.it retained the same 17 declaration
names in both sources; cdbaby.com retained the same 90 names. The preference packet
had no purpose or duration text for any of those entries. Removing non-empty core
metadata or replacing it with blank metadata is not a benefit. In cdbaby.com's
assessment, preference-source precedence actually yields partially assessed cookie
information where the core-only assessment is observed. This is not a proposal
to change precedence without its own tests.

## Dependency map and customer consequences

| Customer result | Sources and effect of removing `cmp_preferences` |
| --- | --- |
| Visible privacy-choice or sale/sharing link presence | Policy observations and document-bound consent controls feed `projectPrivacyAuditEvidence`, then canonical California assessment where applicable. No optional worker is needed to positively report verified presence. Generic Cookie Settings must not be relabelled as a sale/sharing opt-out. |
| First-layer banner, Accept/Reject/Options, geometry and prominence | Consent-proof evidence and canonical control/visual assessment. Preserve these independently. The preference worker is not their source. |
| Observed cookies, vendors, requests, GPC behavior, Accept/Reject activity | Existing runtime/GPC/action lanes. Removing optional workers must not remove their evidence, canonical findings or approved score effects. |
| Category names, selectable category facts, explicit service inventories and cookie declarations | Both verified `cmpBasicEvidence` and the preference packet can supply these. The optional worker offers a separate capture window and provider inventories, but these were duplicative or unavailable in the measured cohort. Removing it can reduce coverage on other sites; absence must remain unknown. |
| Declared-versus-observed cookie comparison | Uses declarations plus retained runtime/action cookie snapshots. Optional declarations can improve it in principle; no unique comparison gain was measured here. Completeness is required for missing-declaration conclusions. |
| Privacy-policy link reachability | Both sources can supply bounded hit-target evidence. Five extra verified results came from the optional worker, all on the same test page. A policy link's existence and its hit-target reachability are distinct checks. |
| Consent records and cookie expiry | Actual browser facts come from baseline/Accept/Reject capture. Provider-configured cookie identities can also come from either inventory source. Known identities and independently retained facts must remain projectable without either inventory packet. |
| Linked settings-page choices and opened-panel accessibility | Historical-only paths under current policy. New passive workers may not navigate to preferences, open panels, or run panel-only accessibility checks. They cannot be counted as future benefits without new authorization. Preserve historical evidence on read. |

The preference worker is passive under the October 21 policy: no Options/Manage
click, SDK show/open, panel expansion, preference navigation, toggle or form
submission. It therefore cannot guarantee that a hidden category is a usable
customer-facing choice. Configured names must remain described as configuration.

## Projection dependency that must be fixed before removal

`derivePreferenceAuditAssessment` initializes an audit from either a usable packet
or a limited lane outcome and then calls `applyClientFacts`/`applyChoiceActivity`.
`deriveVerifiedCmpAuditAssessment` can alternatively initialize from bound
`cmpBasicEvidence`. But when both optional packet/outcome and a usable basic packet
are absent, it returns without projecting those independent action/cookie facts.
The cohort has 294 bundles without a basic packet and 296 without a core-only CMP
assessment after validation. The 53 regressions arise through this dependency.

The appropriate repair is in the typed CMP assessment projector, not a display
fallback, fabricated preference packet or synthetic limited-worker outcome.
Derive existing independent rows directly from their verified original sources;
keep unsupported inventory checks unassessed. Continue through persisted parent
assessment, normalized CMP concerns, concern policy and shared CMP checklist/API
projection. CMP audit concerns are currently checklist-only and score-neutral;
they do not create executive findings. Other established GPC/Reject scoring must
remain unchanged. This review implements no such repair.

## Latency, compute and budgets

The retained preference packet's own elapsed time has a **1,691 ms median,
5,618 ms p95 and 6,015 ms maximum**. Coordinator-observed preference duration is
2,432 ms median and 6,437 ms p95. All 341 preference outcomes completed before
the passive-lane barrier; none adds a positive recorded tail beyond that barrier.
The coordinator code also gives this worker no additional tail wait. Removing it
therefore does not promise a faster customer report from this sample. Concurrent
resource contention and billed initialization were not measured by this audit.

There were 341 extra preference-worker invocations and 660.302 seconds of summed
packet duration. At 3,008 MB and the **previously retained planning rate** of about
$4.90 per extra worker-second across 100,000 scans, the sample's 1.936-second mean
corresponds to roughly **$9.49 per 100,000 invocations for that observed duration
alone**. This is an illustrative compute scale, not a bill, current pricing check,
complete saving estimate, or new budget request; setup/billing, request, storage,
log and coordinator costs are not included. Packet JSON totaled 503,849 bytes in
this cohort. No retention change is proposed.

The existing worker size, per-scan deadlines, GB-second policy and shared $10/month
within $50 allowance remain unchanged. Current code supports both the approved
new-dispatch compute policy and legacy allowances; this review changes neither.
The shared allowance's remaining balance and deployed configuration were not
queried. This offline review adds **$0 recurring AWS cost**.

## Approvals needed

- **Before a local removal implementation:** approve the scope of preserving
  independent typed CMP rows and omitting optional-worker dispatch, with explicit
  unassessed inventory coverage and regression tests. The earlier implementation
  was paused; this request authorizes the dependency audit only.
- **Before any production change:** separately approve the reviewed AWS release,
  dispatch/flag changes, measured budget preflight and rollback. Do not switch off
  the worker before the projection dependency is repaired and verified offline.
- **Before selective seventh-lane use:** approve a concrete selection rule and
  run/cost ceiling after retained evidence demonstrates added customer value.
  Provider recognition alone is not a sufficient rule—the completed OneTrust,
  Usercentrics and CookieYes packets here often duplicate core facts.
- New visits, extra waits, migrated browser work, larger workers, panel actions,
  external forms or Gimbal resumption remain outside this review. No such expansion
  is recommended to justify the worker.

## Reproducibility

`artifacts/cmp-seventh-lane-audit-2026-10-23/audit.ts` is offline-only. `analysis.json`
contains per-scan changes and original-byte receipts; `audit.log` contains the
summary. Known raw HTTP paths inside retained comparison examples are bounded
existing evidence, not new requests. The accompanying verification file hashes
the audit, outputs and principal source dependencies. No production tests were
rerun because no production source was changed; the hash and counterfactual
checks are the validation for this investigation.
