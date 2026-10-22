# CertScore.ai dual posture score availability

Owner-authorized October 21, 2026: every reportable scan must receive both a
California and an EU score, regardless of scan region, eligible finding count,
or policy/choice completeness. This local implementation adds no deployment or
historical production rewrite.

## Canonical implementation

New verified California v10 assessments may retain the optional, typed
`observedScoreBasis` under `usable_starting_page_score.v1`. Its scan identity,
final document URL and source hash must match the parent California assessment.
The materializer derives it only from a successful representative runtime lane,
usable runtime coverage and its original loader-bound, retained runtime DOM
snapshot in the checksum-verified canonical bundle. No-go, challenges, failed
lanes, missing identity and changed documents do not receive this proof.

The scorer selects `california-regulatory-posture.v12-observed` only when that
proof is present. It computes 100 minus existing eligible canonical deductions,
with the existing floor and family caps. No qualifying finding is necessary to
produce a number. This is an observed-risk score; it does not establish that
unresolved checks passed. Coverage and family completion remain unchanged.

The typed assessment is persisted before normalized concerns, concern policy,
unified finding/checklist and central score projection. APIs, report models and
exports use the same score function. No surface-specific number or raw-signal
finding is added. Existing customer presentation rules still prohibit deduction
explanations. No new customer coverage disclaimer is introduced.

The v10 recipient schedule, v11 WCAG aggregation, privacy weights and evidence
gates are unchanged. Identical verified v10/v11 score effects remain compatible
with the new availability policy. Historical assessments without the new proof
retain v11 availability behavior; older versions retain their original rules.
The EU/overall score calculation is unchanged. A failed/no-go attempt remains a
failed attempt rather than a report with an invented score.

## Short substantive notices

`short_substantive_policy_body.v1` admits complete, attributable standalone
privacy notices of at least 1,000 characters when canonical standalone/privacy
context and at least two evidence-bound topics or substantive disclosure
signals establish a substantive body. All existing role, ownership, code/shell,
visitor-scope and text-retention guards remain. Shortness alone no longer rejects
a genuine notice; mere links, navigation shells, truncation and provider policies
remain insufficient. This uses existing analysis and adds no model/capture pass.

## Retained replay and cost

All 47 retained scans were replayed against 609 hash/size-verified original
artifacts. All 38 reportable visits now have both scores. Sixteen previously
unavailable California scores become numeric: the ten investigated California-
region scans plus six EU-region scans. The nine no-go outcomes are unchanged.
All existing numeric California scores and all 47 EU/overall scores are unchanged.
All eleven GPC deductions and three Reject deductions are preserved.

The short-notice repair recovers the substantive policy assessment in three of
the ten investigated scans (owned canaries). The other seven retain their policy
and choice limitations while receiving a score under the availability policy.
Across the full cohort, eight canary captures receive the corrected short-body
classification. No missing policy text, ownership or complete inspection is
invented. No new public scan or Options/Manage/SDK opening is performed.

The maximum added score-basis object in this cohort is 526 JSON bytes. At
100,000 scans/month and the existing retention/capacity, added storage and bounded
processing are estimated below $0.02/month (combined with the preceding fixes,
below $0.92/month). This estimate was disclosed before implementation. Worker,
memory, time, lane, request, model and retention allowances are unchanged.

Replay, per-scan diagnostics, verification and source fingerprints:
`artifacts/california-score-coverage-2026-10-21/`.
