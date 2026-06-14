# WC01 v2 Calibration Expansion Follow-Up

Internal diagnostics only. Not customer-facing report output.

## Executive Summary

Ran a fresh WC01 v2 edge-cohort calibration expansion through the stabilized internal artifact pipeline.

The run covered 30 real sites and completed the full internal diagnostic chain:

```text
calibration
-> shadow projection
-> WC01 shadow
-> allowlist dry-run
-> concern-input dry-run
-> policy simulation
-> normalized-concern adapter
-> concern-policy comparison
-> reviewer packets
-> evidence preview
-> closed artifact-chain smoke
```

The internal chain remained closed by default. No generated artifact created production eligibility, top-finding eligibility, gap eligibility, production report rows, checklist rows, executive rows, scoring output, regulatory-lens output, API/MCP/export output, persisted normalized concerns, unified findings, app UI, persistence, production concern policy calls, or customer-facing copy.

The fresh run produced the same candidate shape as the prior edge cohort. A follow-up normalization pass cleared the remaining WC01 shadow sanitizer warnings and reduced evidence-preview unresolved refs to `0`.

Recommended decision: **D. Start narrow production proposal design for one low-risk, non-sensitive, non-scoring surface**, as design only.

## Cohort Used And Why

Used the existing edge cohort:

```text
docs/certscore-v2/calibration-urls-edge.txt
```

This cohort was reused instead of creating a new production-proposal-readiness cohort because it already spans the requested calibration classes:

- high-volume publisher/adtech
- ecommerce
- SaaS and privacy-mature sites
- health
- reproductive health
- finance and insurance
- public benefits and government
- employment / HR
- behavioral analytics and session replay reference sites
- lower-tracking baseline sites
- CMP-heavy / privacy-center-heavy sites
- sites likely to partially fail or block headless traffic

Fresh output roots:

- `artifacts/v2-calibration-edge-consent-fresh`
- `artifacts/v2-shadow-projection-edge-consent-fresh`
- `artifacts/v2-wc01-shadow-edge-consent-fresh`
- `artifacts/v2-wc01-allowlist-dry-run-edge-consent-fresh`
- `artifacts/v2-wc01-concern-input-dry-run-edge-consent-fresh`
- `artifacts/v2-wc01-concern-policy-simulate-edge-consent-fresh`
- `artifacts/v2-wc01-normalized-concern-adapter-edge-consent-fresh`
- `artifacts/v2-wc01-concern-policy-comparison-edge-consent-fresh`
- `artifacts/v2-wc01-reviewer-packets-edge-consent-fresh`
- `artifacts/v2-wc01-evidence-preview-edge-consent-fresh`

## Commands Run

Calibration and projection:

```bash
pnpm v2:calibrate \
  --profile consent \
  --urls ./docs/certscore-v2/calibration-urls-edge.txt \
  --out ./artifacts/v2-calibration-edge-consent-fresh

pnpm v2:shadow-project \
  --calibration ./artifacts/v2-calibration-edge-consent-fresh \
  --out ./artifacts/v2-shadow-projection-edge-consent-fresh

pnpm v2:wc01-shadow \
  --projection-dir ./artifacts/v2-shadow-projection-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-shadow-edge-consent-fresh
```

Internal WC01 dry-run chain:

```bash
pnpm v2:wc01-allowlist-dry-run \
  --shadow-dir ./artifacts/v2-wc01-shadow-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-allowlist-dry-run-edge-consent-fresh

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-edge-consent-fresh

pnpm v2:wc01-concern-policy-simulate \
  --input-dir ./artifacts/v2-wc01-concern-input-dry-run-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-concern-policy-simulate-edge-consent-fresh

pnpm v2:wc01-normalized-concern-adapter \
  --input-dir ./artifacts/v2-wc01-concern-policy-simulate-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-normalized-concern-adapter-edge-consent-fresh

pnpm v2:wc01-concern-policy-compare \
  --input-dir ./artifacts/v2-wc01-normalized-concern-adapter-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-concern-policy-comparison-edge-consent-fresh

pnpm v2:wc01-reviewer-packet \
  --comparison-dir ./artifacts/v2-wc01-concern-policy-comparison-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-reviewer-packets-edge-consent-fresh

pnpm v2:wc01-evidence-preview \
  --reviewer-packet-dir ./artifacts/v2-wc01-reviewer-packets-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-reviewer-packets-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-concern-policy-comparison-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-normalized-concern-adapter-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-concern-policy-simulate-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-concern-input-dry-run-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-allowlist-dry-run-edge-consent-fresh \
  --artifact-root ./artifacts/v2-wc01-shadow-edge-consent-fresh \
  --artifact-root ./artifacts/v2-shadow-projection-edge-consent-fresh \
  --artifact-root ./artifacts/v2-calibration-edge-consent-fresh \
  --out-dir ./artifacts/v2-wc01-evidence-preview-edge-consent-fresh
```

Closed chain smoke and verification:

```bash
pnpm v2:wc01-artifact-chain-smoke
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-artifact-chain-smoke
```

Results:

- `pnpm --filter @certscore/report-adapter test`: passed, 178/178 tests
- `pnpm --filter @certscore/report-adapter typecheck`: passed
- `pnpm v2:wc01-artifact-chain-smoke`: passed, 13 checks

## Site-Level Successes, Failures, And Partials

| Metric | Count |
|---|---:|
| URLs in cohort | 30 |
| Site-level completed scans | 30 |
| Site-level failed scans | 0 |
| Sites with module-limited scanner output | 2 |

Module-limited sites:

| Site | Limited modules | Failure context |
|---|---|---|
| `washingtonpost.com` | `preConsentRuntimeScanner`, `consentFlowRuntimeScanner` | `page.goto` failed with `net::ERR_HTTP2_PROTOCOL_ERROR` |
| `fidelity.com` | `preConsentRuntimeScanner`, `consentFlowRuntimeScanner` | `page.goto` failed with `net::ERR_HTTP2_PROTOCOL_ERROR` |

Failures were clean and explainable. They were carried forward as coverage-limited output and did not create candidates.

## Scanner And Review Module Health

| Module status | Count |
|---|---:|
| `preConsentRuntimeScanner:completed` | 28 |
| `consentFlowRuntimeScanner:completed` | 28 |
| `preConsentRuntimeScanner:failed` | 2 |
| `consentFlowRuntimeScanner:failed` | 2 |

Consent-flow attempt summary:

| Attempt type | Attempted | Succeeded |
|---|---:|---:|
| Accept | 5 | 1 |
| Reject | 2 | 1 |

Nano assist summary:

| Signal | Count |
|---|---:|
| Policy assist | 0 |
| Policy uncertain | 0 |
| Consent assist | 352 |
| Consent uncertain | 342 |
| Failure / escalation | 4 |

This was a consent-profile run, so policy-surface behavior should be read as out of scope for this pass. Policy/runtime alignment rows remain conservative review or coverage-limitation signals only.

## WC01 Shadow Status Counts

WC01 shadow batch:

| Metric | Count |
|---|---:|
| Projection files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Total rows | 780 |

Rows by v2 status:

| Status | Count |
|---|---:|
| `observed` | 93 |
| `checked` | 62 |
| `review_signal` | 225 |
| `coverage_limitation` | 304 |
| `not_observed` | 42 |
| `not_testable` | 54 |

Rows by WC01 assessment status:

| WC01 assessment status | Count |
|---|---:|
| `checked` | 155 |
| `review_signal` | 225 |
| `coverage_limitation` | 358 |
| `not_applicable` | 42 |

Vendor purpose counts:

| Purpose | Count |
|---|---:|
| `advertising` | 491 |
| `analytics` | 99 |
| `tag_management` | 77 |
| `session_replay` | 28 |
| `consent_management` | 18 |
| `security` | 14 |
| `performance_monitoring` | 6 |

Shadow sanitizer warnings:

| Site | Warning |
|---|---|
| none | none |

The prior `fullstory.com` and `supabase.com` warnings were normalized without weakening sanitizer coverage. The fix redacts hashed static asset names and PostHog-style long cookie names in display-safe projection fields while preserving source ref IDs and excerpt IDs.

## Allowlist And Candidate Counts

Allowlist dry-run:

| Metric | Count |
|---|---:|
| Shadow files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Candidates | 34 |
| Blocked rows | 746 |
| Guardrail failures | 0 |
| Malformed artifacts | 0 |

Candidates by proposed concern family:

| Family | Count |
|---|---:|
| `pre_consent_tracking` | 16 |
| `pre_consent_cookie_storage` | 12 |
| `session_replay_behavioral_analytics` | 6 |

Blocked rows by tier:

| Tier | Count |
|---|---:|
| `tier_b_review_only` | 450 |
| `unsupported` | 180 |
| `tier_a_failed_gates` | 107 |
| `tier_c_never_tracker_default` | 9 |

Candidate-supporting purposes:

| Purpose | Count |
|---|---:|
| `advertising` | 26 |
| `analytics` | 24 |
| `session_replay` | 13 |

Diagnostic purpose counts:

| Purpose | Count |
|---|---:|
| `tag_management` | 24 |

Gate validation:

| Check | Count |
|---|---:|
| `tag_management` supporting count | 0 |
| `consent_management` supporting count | 0 |
| Tier B/C leakage count | 0 |
| Surprise candidate count | 0 |
| Candidates missing source refs | 0 |
| Candidates missing excerpts/display-safe evidence | 0 |
| Candidates with weak or missing confidence/directness | 0 |

Sites with candidates:

```text
booking.com
cloudflare.com
fullstory.com
geico.com
healthline.com
hotjar.com
macys.com
mozilla.org
notion.so
plannedparenthood.org
progressive.com
segment.com
spotify.com
unilever.com
usa.gov
walmart.com
```

Sites with zero candidates:

```text
bbc.com
etsy.com
fidelity.com
forbes.com
ftc.gov
linear.app
nih.gov
nytimes.com
openai.com
supabase.com
theguardian.com
vercel.com
washingtonpost.com
wayfair.com
```

## Concern Input, Simulation, Adapter, And Comparison

Concern-input dry-run:

| Metric | Count |
|---|---:|
| Allowlist files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Concern inputs | 34 |
| Blocked candidates | 0 |
| Guardrail failures | 0 |

Policy simulation:

| Metric | Count |
|---|---:|
| Input files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Simulated outcomes | 34 |
| Blocked inputs | 0 |
| Guardrail failures | 0 |

Simulation statuses:

| Status | Count |
|---|---:|
| `policy_review_candidate` | 23 |
| `policy_review_candidate_sensitive_context` | 11 |

Normalized-concern adapter:

| Metric | Count |
|---|---:|
| Input files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Candidates | 34 |
| Blocked candidates | 0 |
| Guardrail failures | 0 |

Adapter candidates by evidence family:

| Evidence family | Count |
|---|---:|
| `runtime_pre_consent_collection` | 16 |
| `runtime_pre_consent_cookie_or_storage` | 12 |
| `runtime_session_replay_collection` | 6 |

Concern-policy comparison:

| Metric | Count |
|---|---:|
| Candidates | 34 |
| Comparison results | 34 |
| Blocked candidates | 0 |
| Guardrail failures | 0 |

Comparison outcomes:

| Outcome | Count |
|---|---:|
| `would_accept_for_internal_review` | 23 |
| `would_remain_internal_only` | 11 |
| `would_require_more_evidence` | 0 |
| `would_be_suppressed` | 0 |

## Reviewer Packet And Evidence Preview Counts

Reviewer packets:

| Metric | Count |
|---|---:|
| Comparison files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Queue items | 34 |
| Guardrail failures | 0 |

Queue lanes:

| Lane | Count |
|---|---:|
| `standard_internal_review_candidate` | 23 |
| `sensitive_context_review_required` | 11 |

Reviewer packet availability:

| Evidence pointer / metadata | Items with value |
|---|---:|
| Source refs | 34 |
| Display-safe excerpt refs | 34 |
| Vendor metadata | 34 |
| Evidence quality | 34 |
| Family evidence context | 34 |
| Sensitive-context categories, for sensitive items | 11/11 |

Evidence preview:

| Metric | Count |
|---|---:|
| Reviewer packet files found | 30 |
| Succeeded | 30 |
| Failed | 0 |
| Queue items | 34 |
| Resolved excerpts | 1,520 |
| Resolved source refs | 1,520 |
| Representative groups | 420 |
| Unresolved evidence refs | 0 |
| Redaction warning entries | 28 |
| Guardrail failures | 0 |

Unresolved ref reasons:

| Reason | Count |
|---|---:|
| none | 0 |

Warning categories:

| Category | Count |
|---|---:|
| `source_ref_url_redacted` | 20 |
| `source_ref_label_redacted` | 8 |

## High-Volume Unresolved-Ref Results After Retention Tuning

Retention tuning held up on the fresh edge cohort.

Prior edge evidence preview:

| Metric | Prior edge | Fresh edge |
|---|---:|---:|
| Queue items | 34 | 34 |
| Representative groups | 424 | 420 |
| Unresolved evidence refs | 24 | 0 |
| Redaction warning entries | 28 | 28 |

The fresh run improved unresolved refs from 24 to 0 after preferring normalized WC01 shadow evidence when duplicate upstream and shadow evidence entries share the same safe IDs.

No `weather.com` or `webmd.com` high-volume blocker pattern reappeared in this edge run.

## Sensitive-Context Routing Results

Sensitive-context handling remained routing metadata only.

| Metric | Count |
|---|---:|
| Sensitive-context concern inputs | 11 |
| Sensitive-context simulated outcomes | 11 |
| Sensitive-context normalized candidates | 11 |
| Sensitive-context reviewer queue items | 11 |
| Sensitive-context items with category labels | 11/11 |

Sensitive-context categories:

| Category | Count |
|---|---:|
| `behavioral_analytics_reference` | 5 |
| `health` | 3 |
| `reproductive_health` | 3 |

Sensitive-context sites:

| Site | Queue items | Families represented |
|---|---:|---|
| `fullstory.com` | 2 | `pre_consent_tracking`, `session_replay_behavioral_analytics` |
| `healthline.com` | 3 | all three draft families |
| `hotjar.com` | 3 | all three draft families |
| `plannedparenthood.org` | 3 | all three draft families |

Sensitive context did not create production eligibility, top-finding eligibility, gap eligibility, customer-facing copy, or stronger output status.

## Session Replay And Behavioral Analytics Results

Session replay / behavioral analytics remained narrowly gated.

| Stage | Count |
|---|---:|
| Allowlist candidates | 6 |
| Concern inputs | 6 |
| Simulated outcomes | 6 |
| Normalized candidates | 6 |
| Comparison results | 6 |

Sites with session replay / behavioral analytics queue items:

```text
fullstory.com
healthline.com
hotjar.com
macys.com
plannedparenthood.org
segment.com
```

The adapter evidence family for these rows was `runtime_session_replay_collection`. Library-only or unsupported diagnostic rows did not pass into candidates.

## Policy/Runtime And Consent-Flow Limitations

This was a consent-profile calibration. Policy-surface discovery and policy/runtime alignment should not be treated as complete coverage from this pass.

Relevant limitations:

- `washingtonpost.com` and `fidelity.com` had pre-consent and consent-flow runtime scanner failures.
- Accept/reject attempts were limited across the cohort: 5 accept attempts and 2 reject attempts.
- Consent assist produced high uncertainty: 342 uncertain consent classifications.
- Consent-flow deltas and persistence rows remained review-only or coverage-limited and did not feed production surfaces.
- Policy/runtime alignment remained conservative and did not create gap or production output.

## Vendor/Resolver Unresolved Endpoint Observations

Shadow projection endpoint groups:

| Endpoint group | Count |
|---|---:|
| `ignored_noise` | 18,483 |
| `known_adtech_support_endpoint` | 2,722 |
| `unresolved_collection_like_endpoint` | 1,481 |
| `site_owned_infrastructure` | 716 |
| `known_performance_security_endpoint` | 160 |

The remaining unresolved collection-like endpoint volume is useful for resolver calibration, but it did not bypass gates. Unresolved endpoint review remained a conservative review signal and did not create candidates unless stronger family-specific gates were also satisfied.

Recommended resolver follow-up:

- inspect repeated unresolved collection-like endpoint families from the fresh edge run
- only add canonical resolver entries when vendor/purpose evidence is strong
- keep security, performance, support, infrastructure, fraud/bot, RUM, live-chat, tag-management, and consent-management purposes non-supporting by default

## Guardrail Results

WC01 shadow guardrails:

| Guardrail | Count |
|---|---:|
| `productionEligible` true | 0 |
| `topFindingEligible` true | 0 |
| `gapEligible` true | 0 |
| Forbidden status-token presence | 0 |
| Raw blocked field presence | 0 |
| Unsupported output statuses | 0 |
| Guardrail failures | 0 |

Allowlist, concern-input, simulation, normalized-adapter, comparison, reviewer-packet, and evidence-preview guardrails all reported zero guardrail failures and zero malformed artifacts.

Closed artifact-chain smoke:

| Check group | Result |
|---|---|
| Policy/copy review closed defaults | Passed |
| Production-readiness gate closed defaults | Passed |
| Product surface proposal closed defaults | Passed |
| Total smoke checks | 13 passed |

Smoke closed defaults:

- `productionEligible:false`
- `customerFacingEligible:false`
- `explicitApprovalRequired:true`
- product surface proposal `implementationStatus:not_approved`
- sensitive-context metadata remained routing-only

The fresh generated artifact directories and smoke output were scanned with the standard wording/raw-field guardrail pattern. No forbidden status mapping, raw blocked field names, or legal-conclusion wording were found.

## Regressions Vs Previous Edge Cohort

No substantive regression was found against the prior edge cohort.

| Metric | Prior edge | Fresh edge | Result |
|---|---:|---:|---|
| WC01 shadow rows | 780 | 780 | stable |
| Shadow sanitizer warnings | 2 | 0 | improved |
| Allowlist candidates | 34 | 34 | stable |
| Allowlist blocked rows | 746 | 746 | stable |
| Candidate family split | 16 / 12 / 6 | 16 / 12 / 6 | stable |
| Comparison outcomes | 23 / 11 | 23 / 11 | stable |
| Evidence-preview queue items | 34 | 34 | stable |
| Evidence-preview unresolved refs | 24 | 0 | improved |
| Evidence-preview warning entries | 28 | 28 | stable |
| Representative groups | 424 | 420 | effectively stable |

The `23 / 11` comparison split is:

- 23 `would_accept_for_internal_review`
- 11 `would_remain_internal_only`

The `16 / 12 / 6` family split is:

- 16 `pre_consent_tracking`
- 12 `pre_consent_cookie_storage`
- 6 `session_replay_behavioral_analytics`

## Recommended Fixes Before Any Production Proposal

1. Continue resolver calibration for repeated unresolved collection-like endpoint groups, but only through canonical resolver mappings and conservative purpose defaults.

2. Keep consent-flow limitations visible. Do not use accept/reject deltas or persistence rows as production output without separate policy approval.

3. Keep sensitive-context items internal-only until separate policy/copy review and product-surface approval.

4. Keep the display-safe projection sanitizer strict. The cleared `fullstory.com` and `supabase.com` warnings should remain covered by regression tests so future long opaque values still warn when they are not normalized.

## Output Decision

Recommended decision: **D. Start narrow production proposal design for one low-risk, non-sensitive, non-scoring surface.**

This means design only. It does not approve implementation, app UI, persistence, production integration, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

The sanitizer-warning cleanup removes the prior medium-priority blocker for proposal design. This remains design only; it does not create product output.

## Explicit Non-Goals

This calibration expansion does not approve or create:

- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
