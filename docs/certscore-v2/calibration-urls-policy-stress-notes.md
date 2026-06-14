# Policy-Stress Calibration Cohort Notes

This cohort is internal diagnostics only and does not define production behavior.

## Purpose

The policy-stress cohort is a targeted real-site set for evaluating WC01 v2 dry-run behavior in sensitive or high-stakes contexts. It is meant to stress policy gates, evidence posture, and review-only draft shapes before policy-owner review.

## How This Differs From Other Cohorts

The smoke, expanded, stress, and edge cohorts primarily exercise scan coverage, vendor resolution, consent-flow behavior, endpoint attribution, and guardrail stability across a broader range of sites.

This cohort is different because site selection is driven by policy sensitivity rather than vendor-discovery breadth. It intentionally includes health, reproductive health, finance, insurance, public benefits, children or education, employment or HR, privacy-mature SaaS, CMP-heavy surfaces, and behavioral analytics reference sites.

## Policy Questions This Cohort Is Intended To Test

- Do review-only draft inputs remain conservative on sensitive-context pages?
- Do `pre_consent_tracking`, `pre_consent_cookie_storage`, and `session_replay_behavioral_analytics` stay clearly separated?
- Do session replay or behavioral analytics rows require strong runtime evidence rather than library-only presence?
- Do `tag_management` and `consent_management` remain diagnostic-only?
- Do security, performance, support, infrastructure, fraud/bot, RUM, and live-chat purposes block candidates by default?
- Are source refs and display-safe excerpts sufficient for internal review without creating customer-facing copy?
- Do policy/runtime alignment, unresolved endpoints, and consent-flow deltas remain out of concern-policy draft inputs?

## Non-goals

- No production integration.
- No customer-facing output.
- No legal conclusions.
- No persisted normalized concerns.
- No unified findings.
- No report, checklist, executive, top-finding, scoring, or regulatory-lens wiring.
