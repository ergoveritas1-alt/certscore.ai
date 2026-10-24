# CertScore.ai ReadCube/Gimbal opt-out authorization proposal

October 23, 2026. Proposal only: this document grants no action permission.
No runtime edits, scans, deployment or flag changes were made for this review.

## Lane audit

The latest passive binding/recognition repairs added no lanes or invocation
paths. However, six is the core-lane count, not the maximum worker count.

The core lanes are `consent_proof`, `runtime_evidence`, `policy_evidence`,
`gpc_observation`, `accept_observation` and `reject_observation`. Two additional
workers already existed: `cmp_preferences` and `sale_sharing_opt_out`. Their
dispatches are present in committed HEAD, before the latest passive repairs.
They reuse the existing Lambda function; they are separate invocations.

Read-only AWS configuration checks during this review found 3,008 MB and Accept,
Reject, preference and sale/sharing flags enabled for
`certscore-v2-dag-local-lambda` in `eu-central-1`, `eu-west-1` and `us-west-1`.
Configuration alone does not prove execution for every scan: dispatch also
depends on scan intent, eligibility and rollout conditions. An eligible scan
can have eight evidence workers plus its coordinator.

The retained October 21 ReadCube manifest for scan
`352aa101-dcf8-4450-bc0b-07bfebea0745` records six core timing rows and separately
joined `saleSharingOptOut` and `cmpPreferenceInspection` workers. This predates
the latest repairs. The separate timing fields can obscure the total count.
This review does not audit every current scan or verify deployed code digests.

## Narrow proposed action scope

Use only the existing sale/sharing worker and existing exact navigation grants:

- `https://readcube.com/` through `https://www.readcube.com/` to
  `https://about.readcube.com/`.
- `https://gimbal.com/` to `https://infillion.com/`.

Add versioned, route-specific OneTrust entrance variants, without relaxing the
global privacy-action classifier. Permit one verified Cookie Settings opening
on these destinations. ReadCube's retained native button is
`#onetrust-pc-btn-handler`; Gimbal retained the same native button and a later
passive check observed `a#ot-sdk-btn.ot-sdk-show-settings` with raw `href="#"`.
Require unique, visible, enabled controls with matching accessible/visible names,
verified geometry, exact target and same-document binding.

For Gimbal, select a verified native button first; only when it is absent may
the exact observed anchor be selected before any click. The anchor exception
must require the same-page fragment, no external destination, download, target
window or form association. Preserve URL/loader guards; URL drift terminates
the attempt. There is no second entrance attempt or fallback after clicking.

A second action is permitted only under the existing explicit Do Not Sell/Share
submission contract: a verified native control inside `#onetrust-pc-sdk`, no
forms or non-hidden preference fields, and supported same-session GPP section
7/8 baseline and post-action/terminal sale-and-sharing state. Preserve the
already-opted-out no-action case. Generic Save, toggles, cookie Reject,
`OptanonConsent` changes or a closed banner cannot substitute for this proof.

Neither site's retained evidence establishes a qualifying second control or
GPP transition. Opening may therefore produce only an honest unsupported or
limited result. Open -> toggle -> Save requires three actions and is excluded.
Do not add a non-GPP state adapter speculatively. Passive CMP, GPC and Reject
workers retain their existing action boundaries.

## Implementation and validation after approval

1. Add the scoped entrance variants and preserve explicit submission checks.
   Keep exact source-route authorization, document binding and provenance.
2. Add positive and negative fixtures for both entrances, mismatched labels,
   duplicate/hidden controls, wrong origins/routes, external links, URL drift,
   form fields, unsupported GPP, already-opted-out state, and insufficient time.
   Verify no third action, retries, added waits or passive-lane mutation.
3. If separately included in approval, perform at most one local live validation
   per original route, using these worker limits and at most two actions. Stop
   without retry when unavailable. Retain bounded redacted evidence; do not
   rewrite historical reports. Local timing does not establish Lambda recovery.
4. Stop and propose another narrowly specified authorization if observed UI
   requires a toggle, generic Save, external form, different state adapter or
   additional navigation. No unsupported result becomes a privacy finding.

Keep 3,008 MB Lambda, 3,000 ms capture, 5,000 ms worker, 4,500 ms artifact
deadline, two actions, 250 ms grace plus 500 ms observation, three decision reads
of at most 50 ms each, 32 request rows and 32,000-byte packet. Preserve existing
entrance/submission time reserves. Add no invocation, visit per scan, retry,
model call, tail wait or retention extension.

## Gimbal external form

The passive check retained, but did not visit, this Your Privacy Choices link:

`https://privacyportal.onetrust.com/webform/f7e3f6db-ed65-4759-a3f5-3b5c8b7e9bff/draft/9949a1a8-aa69-4848-a93f-d093d877a981`

The narrow proposal excludes it from automated action recipes. Retain it as an
external request path for manual review; do not follow, fill or submit it. Its
`/draft/` path and vendor hostname do not establish a working published form,
controller identity, required fields or browser-level opt-out behavior.

If form investigation is wanted, the next separate authorization should cover
one local read-only visit to this exact tenant/form URL, in an isolated context,
with an explicit finite time cap, no redirects, authentication, identity input,
form submission or retries. This is separate research, not a new production
scan visit or lane. Site asset requests may still occur during a passive load.

Submission would require a further evidence-backed proposal identifying the
verified controller, exact form and request type, required fields, authority to
act for the data subject, truthful approved identity data, handling/retention
and confirmation semantics. Do not invent identity or submit requests for
unrelated people. A request receipt alone cannot establish this browser's
sale/sharing opt-out. If identity verification, email, CAPTCHA or delayed
processing is required, the current bounded action recipe cannot complete it.
The retained evidence does not yet establish whether any of these is required.

## Cost and proposed approval wording

Local implementation and tests add $0 recurring infrastructure spend. A later
rollout could make existing workers run longer, even with unchanged hard caps.
Using the prior planning rate, 100,000 monthly scans and the illustrative 2/169
cohort share, one to three extra seconds at 3,008 MB costs approximately
$0.06-$0.18/month compute. Allow under $0.10 additional retained JSON within
existing packets/retention; page traffic remains unmeasured. These are planning
sensitivities, not measured production prevalence or a new allowance.

At every scan, one extra second would instead cost about $4.90/month and three
seconds about $14.69/month compute. Thus unchanged time caps alone do not
guarantee the shared $10 ceiling. Before deployment, account for actual eligible
volume and spend from prior redirect/recognition work against the remaining
shared $10 inside $50. No additional money is requested now. Leaving unsupported
paths unchanged is the lowest-cost alternative.

Suggested narrow approval, not effective until the owner grants it:

> Approve local implementation and tests for ReadCube/Gimbal-only OneTrust Cookie
> Settings entrances in the existing sale_sharing_opt_out worker, plus at most
> one bounded local live validation per original route. Permit one Settings
> opening and a second opt-out click only when the existing explicit submission
> and GPP proof requirements are met. Preserve current Lambda, scan budgets and
> the shared $10 within $50 allowance. Exclude external forms, toggles, generic
> Save, new state adapters and new targets. No deployment or flag changes.

This authorization expands entrance scope only. New form handling, additional
action semantics, resource increases, deployment and flag changes remain
separate decisions.
