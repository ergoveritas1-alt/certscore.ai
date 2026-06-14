# WC01 v2 Refined Contract Policy Review

Internal policy review packet only. Not customer-facing report output.

## Executive Summary

The `Wc01V2ConcernPolicyInputDraft` contract was refined after the first policy/product/privacy review. The refined dry-run artifact now retains the evidence, source, caveat, sensitive-context, and review-language metadata that policy owners requested before considering a future concern-policy simulation.

This remains dry-run-only because policy owners have not approved production concern mapping, persisted normalized concerns, unified findings, checklist rows, report rows, executive rows, top findings, scoring, regulatory lenses, customer-facing copy, or production report output.

Latest refined cohort totals:

| Metric | Count |
|---|---:|
| Allowlist files processed | 72/72 |
| Refined draft inputs | 81 |
| Blocked candidates | 0 |
| Malformed artifacts | 0 |
| Guardrail failures | 0 |

Guardrail summary:

| Guardrail | Count |
|---|---:|
| Outputs with production eligibility | 0 |
| Outputs with top-finding eligibility | 0 |
| Outputs with gap eligibility | 0 |
| Forbidden gap status token scan matches | 0 |
| Raw blocked field scan matches | 0 |
| Legal-conclusion term scan matches | 0 |

## Refined Contract Overview

The refined draft inputs now retain:

- source refs and display-safe excerpt IDs/counts
- confidence band and directness classification
- pre-consent or consent-state context
- vendor purpose basis
- source finding key and source shadow context
- blocked, demotion, and caveat context
- coverage limitations when available
- source module context placeholders when available
- family-specific required evidence and caveats
- sensitive-context review metadata
- safe review-language metadata

The refined contract is meant to support policy review of shape and gates. It does not itself classify production concerns.

## Draft Family Review

### `pre_consent_tracking`

Current count: 39

Required evidence:

- direct runtime evidence
- pre-consent or consent-state context
- source refs
- display-safe excerpts
- confidence band and directness classification
- vendor purpose basis
- no Tier C diagnostic purposes
- no `tag_management`-only or `consent_management`-only support

Caveat:

- Analytics and advertising are not automatically equivalent; policy review is required before production mapping.

Does not prove:

- that a legal requirement applied
- that the site violated a law or policy
- that all consent and disclosure context was evaluated
- that the vendor purpose is production-approved

Policy decision needed:

- Which vendor purposes should support a future policy simulation?
- Should analytics and advertising use different thresholds?
- Should sensitive-context sites require policy-surface coverage before any future customer-facing proposal?

Recommended default decision:

- Approve for next dry-run policy-shape simulation.
- Keep review-only.
- Require direct runtime/pre-consent evidence and a policy-approved vendor-purpose allowlist.

### `pre_consent_cookie_storage`

Current count: 31

Required evidence:

- direct cookie/storage evidence
- pre-consent or consent-state context
- source refs
- display-safe excerpts
- cookie/storage party context when available
- vendor purpose basis
- explicit exclusion of first-party-only, CMP-only, security-only, necessary/functional-only, and unknown-only storage

Caveat:

- Cookie/storage remains separate from broader pre-consent tracking unless policy owners approve merging.

Does not prove:

- that stored data is personal data
- that the storage was unnecessary
- that a law or policy was violated
- that first-party, CMP, security, or functional storage should be treated as tracking

Policy decision needed:

- Should cookie/storage remain a separate family through the next dry-run stage?
- What party-context evidence is required before any future customer-facing consideration?
- Should CMP/security/necessary/functional storage remain excluded by default?

Recommended default decision:

- Approve for next dry-run policy-shape simulation.
- Keep separate from tracking.
- Require cookie/storage party context and keep first-party/CMP/security/necessary/functional-only storage excluded.

### `session_replay_behavioral_analytics`

Current count: 11

Required evidence:

- collection endpoint evidence or equivalent strong runtime evidence
- library-only evidence remains blocked
- source refs
- display-safe excerpts
- confidence band and directness classification
- vendor purpose basis
- no tag-only support
- no support/live-chat/RUM-only support

Caveat:

- No claim that recording occurred, sensitive fields were captured, or a person was identified.

Does not prove:

- that a session was recorded
- that sensitive fields were captured
- that a person was identified
- that a law or policy was violated

Policy decision needed:

- What counts as equivalent strong runtime evidence if not a collection endpoint?
- Should behavioral analytics and full session replay remain one family or split later?
- Should any session replay / behavioral analytics row remain internal-only indefinitely?

Recommended default decision:

- Approve only if collection endpoint or equivalent strong runtime evidence remains required.
- Keep library-only evidence blocked.
- Keep review-only through the next simulation.

## Sensitive-Context Review

Sensitive-context flags are explicit-map metadata only. They add review requirements and do not promote rows, change eligibility, or create findings.

| Category | Flagged draft count |
|---|---:|
| `behavioral_analytics_reference` | 8 |
| `children_education` | 1 |
| `employment_hr` | 5 |
| `finance` | 4 |
| `health` | 6 |
| `public_benefits` | 4 |
| `reproductive_health` | 8 |
| Total | 36 |

Decision questions:

- Are these categories right for the next dry-run stage?
- Should finance, public benefits, health, reproductive health, children/education, or employment require additional policy-surface coverage?
- Should any sensitive-context category be internal-only indefinitely?
- Should behavioral analytics reference sites remain flagged separately from ordinary SaaS or publisher contexts?
- Should sensitive-context flags require stricter copy review even in internal reviewer workflows?

## Review-Language Metadata

Each refined draft input includes safe review-language metadata. The allowed internal phrases are evidence-scoped and review-only, for example:

- "Runtime signal observed before consent action."
- "Review recommended based on retained runtime evidence."
- "Observed vendor purpose requires policy review."
- "Coverage limitation: consent action could not be confidently completed."
- "Insufficient evidence for customer-facing conclusion."

Prohibited language is represented as structured prohibited phrase keys rather than literal claim language. Generated outputs do not include literal legal-conclusion claim language or the forbidden gap status token.

Policy questions:

- Are the allowed review-only phrases acceptable?
- Are any phrases too strong for internal reviewer workflows?
- Should customer-facing copy be prohibited entirely for this phase?
- Should the next dry-run simulation output only reason keys and no prose?

## Guardrail Summary

| Guardrail | Count |
|---|---:|
| Production eligibility outputs | 0 |
| Top-finding eligibility outputs | 0 |
| Gap eligibility outputs | 0 |
| Forbidden gap token matches | 0 |
| Raw blocked field matches | 0 |
| Legal-conclusion term matches | 0 |
| Malformed artifacts | 0 |
| Guardrail failures | 0 |

## Decision Table

| Review item | Approve | Approve with changes | Keep internal only | Reject | Notes |
|---|---|---|---|---|---|
| Refined contract shape |  |  |  |  |  |
| `pre_consent_tracking` |  |  |  |  |  |
| `pre_consent_cookie_storage` |  |  |  |  |  |
| `session_replay_behavioral_analytics` |  |  |  |  |  |
| Sensitive-context flag map |  |  |  |  |  |
| Review-language metadata |  |  |  |  |  |
| Next dry-run policy-shape simulation |  |  |  |  |  |

## Explicit Non-goals

- No production integration.
- No persisted normalized concerns.
- No unified findings.
- No customer-facing output.
- No legal conclusions.
- No report, checklist, executive, top-finding, scoring, or regulatory-lens integration.

## Recommended Next Technical Step If Approved

Recommended next step:

```text
Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
```

The simulation should explore how future concern policy might classify refined draft inputs while remaining internal-only.

The simulation must not:

- call production concern policy
- persist normalized concerns
- create unified findings
- create checklist/report/executive output
- map anything to `gap_observed`
- create customer-facing copy
- change production behavior

All outputs should remain internal review-only.
