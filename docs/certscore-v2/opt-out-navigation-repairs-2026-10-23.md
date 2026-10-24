# CertScore.ai retained opt-out navigation investigation

Local work authorized October 23, 2026. No deployment, rollout change, live-site
scan, production write, target reauthorization or historical report rewrite.

## What the 169 scans establish

The offline audit verifies every original bundle against the retrieval receipt's
SHA-256 and byte size, verifies each embedded opt-out packet, and checks scan
identity. The cohorts have 169 original bundles, 165 packets and 127 packets whose
terminal limitation is navigation-related. The other 42 scans retain their prior
funnel classifications; they are not counted as navigation failures.

| Action-session terminal reason | Count | Retained detail |
| --- | ---: | --- |
| Navigation failed | 81 | 72 legacy binding-mismatch codes; 9 network-failure codes |
| Navigation budget exhausted | 46 | 44 timeout codes; 2 document-closed/changed codes at the deadline |

The historical combined `document_access_or_target_mismatch` exception conflated
HTTP errors and target changes. Those packets did not retain response status,
committed URL relationship or document readiness. It is impossible to reconstruct
their exact cause or prove recovery from the old action packet alone.

Independent passive runtime evidence supplies the following **context**, not
action-session proof. Transport observations must name the exact requested URL;
response rows must join a retained main-frame document request from that lane.

| Passive context for the 127 failures | Count | Disposition under current rules |
| --- | ---: | --- |
| Different final target | 98 | Do not authorize its destination or relax exact matching. Faster rejection and clearer diagnostics are allowed. |
| Same target, HTTP error | 7 | Reject before waiting for scripts; do not interact with the error page. |
| Same target, successful document response | 13 | Candidates for bounded readiness repair, with no promised per-scan recovery. |
| Unresolved final-target context | 9 | Preserve unknown; do not guess DNS, TLS, redirect or readiness causes. |

The 72 legacy binding mismatches have changed-target passive context in 65 cases
and same-target HTTP-error context in seven. The 46 deadline cases have
changed-target context in 30, same-target success in 13, and unresolved context in
three. The nine network failures have changed-target context in three and
unresolved context in six. Error responses can overlap changed-target context.
All 127 authorized targets already equal their standard URL serialization; this
cohort supplies no evidence that URL normalization would repair a failure.

The 13 same-target candidates are 12 distinct URLs: roistat.com, rdb.ru,
hygall.com, thefa.com, ttarget.ru, www.pferdeklinik-roentorf.de, plusofon.ru,
juejin.cn and four ErgoVeritas canary paths (multilingual-rtl twice,
broad-baseline, privacy-evidence and consent-stress). Five scans are canaries.
Their exact URLs, scan IDs, hashes and retained response timings are in the audit
JSON. rdb.ru and www.pferdeklinik-roentorf.de returned the passive document at
12,188 ms and 15,515 ms respectively; a comparable action-session response cannot
fit a 3,000 ms capture. The other 11 scans returned a passive document within
3,000 ms, which still does not prove sufficient time for a choice and observation.

Only thefa.com has independent passive OneTrust recognition among these 11;
recognition is not proof of a supported explicit sale/sharing control. No scan is
reported as recovered, and no old observation is promoted.

## Local repairs

1. Navigation waits for the initial document commit, checks the HTTP response and
   exact target immediately, then performs readiness work. A changed target or
   HTTP error no longer spends its remaining budget waiting for deferred scripts.
2. The original DOMContentLoaded wait has an event-driven early completion path:
   the HTML parser must have finished, the GPP API must already be callable, and
   exactly one registered provider recipe must be present. If those conditions
   do not hold, the original DOMContentLoaded gate remains. This replaces the
   wait within the same absolute deadline; there is no polling, recovery visit,
   retry, added sleep, network request or API call. One extra bounded DOM presence
   check at the parsed-document checkpoint does not authorize a control action.
3. Existing recipe, unique-control, visibility, geometry, label, form-exclusion
   and semantic before/after/terminal checks still decide whether an action and
   observation are valid. An early readiness checkpoint does not establish
   registration, collection or a finding. A still-streaming document cannot use
   the early path even when it already contains controls and an API.
4. Main-document loader and URL-change monitoring starts before navigation.
   Changed loaders, blocked main-frame navigation and same-document URL drift
   remain invalid even if the URL later returns to its original value. A CDP
   frame-tree read drains that session's commit events before binding, avoiding
   reliance on ordering with Playwright's separate session. No changed document
   is adopted as a recovery target.
5. Optional `sale_sharing_navigation.v1` diagnostics retain response status,
   exact/different/unobserved target relationship, readiness route, blocked
   navigation kind and bounded failure category. No destination URL, error text,
   page text or extra request payload is retained. The verified canonical packet
   carries this metadata; it cannot create findings or score effects. Historical
   packets remain readable without it. The operational funnel exposes the new
   diagnostics without inferring missing historical values.

The synthetic deferred-script case completes the original 250 ms grace and
500 ms observation while the unrelated script remains pending. This demonstrates
a repairable failure mechanism, not a measured improvement on public websites.

## Budgets and cost

No budget changed: 5,000 ms worker, 3,000 ms capture, at most 4 GB memory, original
artifact/return reserve, one entrance plus one explicit submission, 250 ms grace,
500 ms observation, 32 request rows, 32 KB packet, one terminal publication.
There is no additional lane, model call, invocation, provisioned capacity or
retention extension. Execution remains inside the previously approved observer
compute allowance, including its $50/month incremental envelope at 100,000 scans.
Unchanged caps are not a claim that every scan has unchanged billed duration.

The optional navigation metadata is under 320 bytes per packet in fixtures
(140–170 bytes observed). At 100,000 scans and 30-day retention, even four retained
copies of the 320-byte bound total about 128 MB. Incremental storage is estimated
below $0.10/month; this estimate was disclosed before implementation and is
additional to the prior funnel metadata estimate below $0.50/month. No new S3
objects or paid requests are introduced. Local audit and fixture work adds no
recurring infrastructure spend. Validate actual compute use before a separately
authorized deployment; an increase outside existing approvals requires approval.

## Verification and remaining approvals

Local browser fixtures cover ready and deferred CMPs, unrelated stalled scripts,
incomplete streamed HTML, missing API, HTTP errors, redirects, history drift and
return, attempted client navigation, same-URL reload, blocked subframes, absent
responses, network failures and the earlier observer control/semantic cases.
Canonical projection tests verify diagnostic persistence, hash tamper rejection
and unchanged finding/scoring behavior. Offline audit tests verify receipt and
packet integrity, response joins and the separation of passive context from
proven recovery. Test logs and source hashes are retained in
`artifacts/opt-out-navigation-repairs-2026-10-23/`.

Final validation: 49 browser/audit/funnel checks and 29 canonical projection and
scoring checks passed (78 total). Contracts, scan-core, isolated audit-script and
web typechecks passed. The final parsed-CMP fixture completed in 872 ms; the
stalled response and incomplete-document fixtures stopped at the original
3,000 ms capture deadline plus cleanup. These are local-host measurements.

Additional owner approval is required before:

- Changing action authorization to accept redirected hosts, paths or protocols,
  including apex-to-www redirects. A fresh authorization design is required;
  copying a passive session's final URL into an existing authorization is not a
  repair. The lower-cost alternative is the implemented fail-closed diagnostic.
- Adding a navigation retry, fallback candidate, longer capture/worker timeout,
  parent tail wait, another browser visit, broader control flow or higher resource
  allowance. Sites whose responses actually take 12–15 seconds cannot be rescued
  by this readiness change. Estimate the requested compute/latency change before
  seeking approval rather than silently spending more.
- Deploying or changing production flags, running a new public calibration
  cohort, or rewriting historical reports. No such action was taken here.

These flags are not requests to approve broader work now. The authorized local
changes are complete; public-site recovery rates remain unmeasured.
