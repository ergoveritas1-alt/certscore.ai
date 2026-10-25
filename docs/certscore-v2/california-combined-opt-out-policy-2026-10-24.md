# CertScore.ai combined California opt-out policy — October 24, 2026

Owner-approved local implementation only. No deployment, flag change, live scan,
production write or historical rewrite is authorized or performed.

New source-bound captures carry `california.disclosure-choice.v4-combined` and
materialize `california-regulatory-posture.v21-combined-opt-out`. The v1/v2
six-point and v3 nine-point policies retain their original semantics.

| Evidence | Canonical finding | Severity | California effect |
| --- | --- | --- | --- |
| Successful advertising activity, strict opt-out absence, verified GPC contradiction | Potential failure of California opt-out rights | High | Existing shared recipient family: 15/25/32/37/40/43/45/47 for 1–8+ distinct recipients |
| Successful advertising activity, strict opt-out absence, supported recorded GPC opt-out, independent proof another method is required | Potential missing sale/sharing opt-out method | Medium | 8 once, absorbed by a stronger choice-enforcement family effect |
| Unknown GPC, scripts/vendor presence alone, incomplete absence, or alternative opt-out observed | No combined finding | — | No new combined effect; independently eligible findings remain |

The first 15 includes the first recipient and any verified acknowledgment/state
contradiction. Eligible recipient identities are unioned across GPC, explicit
sale/sharing choice and Reject. Repeated requests, paths and copies cannot add
charges. The existing potential-risk recipient exclusions and shared 47 cap
remain unchanged; the separate GPP family and EU policies remain unchanged.

A current qualified successful sale/sharing collection under delivered GPC, or
verified GPC receipt with the applicable recorded choice still off, supplies the
contradiction. Generic ads or an unknown response do not. Legacy collection
qualifiers do not gain the new combined current-policy collection treatment.

Supported response requires the verified same-document/session complete bounded
observation, retained HTTP/browser GPC delivery, explicit CMP receipt and both
sale/sharing states recorded as opted out. No collection detected is insufficient.
This does not establish that GPC caused the state, or establish every condition
of the frictionless exception. The medium branch separately requires the existing
owned-policy California declaration and complete required-method proof; ambiguous
signal/exception wording blocks that proof. The current capture cannot positively
establish the entire frictionless exception, so no such claim is added.

Both branches require the broader sale/sharing opt-out state to be Not observed
and the existing complete current named-control inspection. A scoped informational
Not observed badge alone never establishes scoring eligibility. Broader positive
policy/provider evidence prevents the combined absence finding, keeping its scope
in retained expanded details.

## Canonical flow and presentation

Verified retained evidence → persisted typed `optOutRisk` under the disclosure
assessment → normalized California concern → concern policy rejoining original
GPC hashes/session/document → unified finding → California score and priority
projection. The existing `california_privacy_choice_not_observed` technical ID is
preserved. Its versioned title/severity changes only for eligible v4 evidence.

A combined case replaces the overlapping standalone GPC top issue. The GPC unified
packet remains available for evidence and scoring verification. The combined card
has a collapsed `GPC evidence · …` disclosure with bounded factual GPC observations
and vendor timing; native details controls retain keyboard behavior. Scores and
point explanations are excluded from customer copy and JSON evidence rendering.
Standalone GPC findings remain when opt-out is Observed or the combined criteria
are unsupported. Editorial grouping only consumes projected findings.

## Verification and cost

Retained-only prospective replay of the frozen 100-site cohort preserves all
presence classifications: 40 Observed / 29 Not observed / 31 Unknown, including
25 unassessable attempts (75 reportable: 40/29/6). No site meets both the strict
absence gate and new combined evidence criteria. Two prospective results,
afi-b.com and cryptoquant.com, drop the old nine-point missing-link effect because
the broader opt-out is already Observed; their independent GPC effects remain.
Original bytes, markers and stored historical assessments are unchanged.

The synthetic matrix verifies the 15 and 8 branches, two-recipient 25 effect,
shared GPC/Reject union, unknown identity base, 8 absorption, duplicate packet
handling, false positives, missing source joins, canonical-effect mismatches and
historical v3 parity. UI tests verify a collapsed obvious expander and no customer
point explanation. Evidence and receipts live in
`artifacts/opt-out-cohort100-review-2026-10-24/combined-opt-out-implementation/`.

Estimated recurring increment: below $0.50/month at 100,000 affected scans and
30-day retention, disclosed before implementation. Synthetic serialized pipeline
outputs grow by 5,104 bytes (high) and 12,478 bytes (medium); retained cohort output
has no positive growth. The estimate includes metadata/projection replication and
bounded in-process joins. No new browser visit, request, wait, model call, resource,
retention period, worker size or scan budget is introduced. Any revised reasonably
estimated increment of $1/month or more needs separate owner approval.
