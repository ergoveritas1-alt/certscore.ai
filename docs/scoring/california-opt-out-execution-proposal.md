# Bounded California opt-out execution — all-eligible rollout configuration

October 16, 2026. Owner approved the **$50/month ceiling at 100,000 eligible scans** in the chat and clarified that the observer should run on every eligible regional scan, regardless of scan origin or submission source. The report focus interprets the same retained facts under GDPR/ePrivacy or CCPA/CPRA. The local implementation and AWS deployment configuration enable this scope; production state must be verified after deployment.

The owner requested California-specific review and suspended GPC customer results and scoring throughout reports. Implement passive evidence assessment first. Existing cookie
Accept/Reject authorizations must never authorize a sale/sharing opt-out.

## Approved active scope

One separately gated observer in an isolated visitor session, using a reviewed
named-CMP recipe. Exact-target authorization; at most a choice-panel open and one
explicit sale/sharing opt-out submission. No account actions, personal-data
entry, authentication, purchases, arbitrary forms, guessed selectors or generic
clicking. Confirm the recorded sale/sharing decision independently of successful
click dispatch. Capture bounded relevant requests after confirmation; exclude
in-flight activity. Unknown registration or incomplete comparison remains neutral.

Budget the complete observer at five seconds and 4 GB, including navigation and
capture. No retries, additional screenshots, model calls, extended publication
deadline, or later refresh. A short budget will leave some flows unassessed;
do not trade evidence quality for apparent completion. Reuse current canonical
evidence retention and one terminal report publication. Do not replace GPC or
cookie-action evidence with this observer.

## Cost and alternative

Planning estimate at 100,000 eligible executions/month: roughly $34 in compute
using the illustrative $0.0000166667/GB-second rate, plus requests, bounded evidence
writes/storage and regional headroom. Approved ceiling: **$50/month incremental**,
subject to measured timings and regional configuration before and after
rollout. This is an estimate, not a measured production bill. Re-estimate if the
five-second bound, memory, volume, retention or publication topology changes.
Reference: https://aws.amazon.com/lambda/pricing/ (checked October 16, 2026).

Lower-cost alternative: continue passive assessment and keep opt-out effectiveness
explicitly unassessed. This adds no browser session or model call and cannot prove
whether a submitted choice is honored. The passive implementation reuses existing
DOM reads and retained policy observations; budget additional bounded metadata and
computation below $1/month at 100,000 scans and current retention.

The owner explicitly approved the above $50/month ceiling and the all-eligible regional rollout. Read-only CloudWatch Lambda invocation totals for the three scanner regions over the preceding 30 days were 6,424 (Germany), 7,835 (Ireland), and 66,406 (California), or 80,665 total. Each scan invokes at least one Lambda, so this is a conservative upper bound below 100,000 scans for that period; the real scan count is lower because sharded scans invoke multiple workers. Future volume must be monitored against the approved envelope.


## Implementation limits

The worker’s total bound is five seconds at no more than 4 GB, including a three-second browser budget and retention reserve. It adds no parent tail wait and joins once at the existing publication barrier. Both the persisted explicit rollout intent and `CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=1` are required. Shared scan configuration now sets `all_eligible` intent for every regional sharded scan when the web flag is enabled, and checked-in AWS web and scanner configurations set that flag. Legacy single-mode scans do not have the separate worker lane. A European visit can yield useful positive facts, but an unseen California control on that visit cannot establish what a California visitor would see; the report's focus-scope note makes this explicit.

The initial OneTrust recipe is intentionally narrow: a named privacy-choice entrance and a registered native submission control explicitly labelled “Do Not Sell or Share My Personal Information.” Generic Save/Reject, fields, toggles and account workflows remain unsupported. A same-document GPP sale-and-sharing transition must confirm the action; no GPC signal is injected or used. A 250 ms grace period precedes a 500 ms response-backed observation. Only high-confidence canonical advertising requests with retained responses can produce a score-neutral review. No activity in this short window is not proof of honoring.

The recipe is fixture-tested; real-site coverage and timings must be measured on the first production cohort. The policy-lane passive additions are estimated below $1/month at 100,000 scans; all incremental implementation costs are within the approved combined $50/month ceiling. Production cost starts only when the new web and scanner revisions are deployed and the observer runs.
