# WC01 v2 Production Integration Proposal

Proposal document only. Do not implement production integration from this document without a separate approved implementation pass.

## Review Decision

Policy review approved the WC01 v2 concern-policy simulation output for the next proposal stage. This approval does not approve production integration.

Approved scope for this document:

- describe a possible future production integration path
- preserve the current dry-run guardrails
- identify required policy, copy, evidence, and engineering decisions before implementation

Not approved:

- production concern-policy calls
- persisted normalized concerns
- unified findings
- checklist, report, executive, top-finding, scoring, or regulatory-lens output
- customer-facing copy
- direct mapping to `gap_observed`

## Current Validated State

The current internal-only pipeline is:

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
```

Latest simulation results:

| Metric | Result |
| --- | ---: |
| Input artifacts processed | 72 |
| Refined draft inputs | 81 |
| Review-only simulated outcomes | 81 |
| Blocked inputs | 0 |
| Malformed artifacts | 0 |
| Guardrail failures | 0 |
| Production eligibility true count | 0 |
| Top-finding eligibility true count | 0 |
| Gap eligibility true count | 0 |
| Forbidden gap status token matches | 0 |
| Raw blocked field matches | 0 |
| Forbidden legal-style term matches | 0 |

Simulation families:

| Family | Count |
| --- | ---: |
| `pre_consent_tracking` | 39 |
| `pre_consent_cookie_storage` | 31 |
| `session_replay_behavioral_analytics` | 11 |

Simulation statuses:

| Status | Count |
| --- | ---: |
| `policy_review_candidate` | 45 |
| `policy_review_candidate_sensitive_context` | 36 |
| `policy_needs_more_evidence` | 0 |

## Proposed Future Architecture

If production integration is later approved, the only acceptable path should preserve the WC01 finding pipeline:

```text
Wc01V2ConcernPolicySimulationDryRun
-> approved v2 normalized concern constructor
-> WC01 concern policy
-> unified finding / checklist projection
-> executive / regulatory display
```

The integration should not feed v2 rows directly into report cards, checklist builders, executive summaries, top findings, scoring, regulatory lenses, or unified findings. Any future production path must first construct typed normalized concerns and then let existing WC01 concern policy decide eligibility.

## Initial Candidate Families

### `pre_consent_tracking`

Possible production target: a narrowly scoped normalized concern for tracker-like runtime activity observed before a recorded consent action.

Required before implementation:

- policy owner approval for allowed vendor purposes
- direct runtime evidence requirement
- consent-state evidence requirement
- source ref and display-safe excerpt requirement
- confidence and directness thresholds
- sensitive-context handling rules
- copy review for internal and possible customer-facing surfaces

Open decision: whether analytics and advertising remain in the same concern family or split into separate policy treatments.

### `pre_consent_cookie_storage`

Possible production target: a separate normalized concern for third-party cookie or storage behavior observed before a recorded consent action.

Required before implementation:

- policy owner approval that cookie/storage remains separate from broader pre-consent tracking
- first-party vs. third-party evidence rules
- explicit CMP, security, necessary, and functional-storage exclusions
- display-safe cookie/storage naming rules
- source ref and excerpt requirements
- sensitive-context handling rules
- copy review for internal and possible customer-facing surfaces

Open decision: whether policy-surface corroboration is required before this can leave internal reviewer workflows.

### `session_replay_behavioral_analytics`

Possible production target: a narrowly scoped normalized concern for session replay or behavioral analytics collection behavior.

Required before implementation:

- collection endpoint or equivalent strong runtime evidence requirement
- library-only evidence exclusion
- policy owner decision on session replay vs. behavioral analytics grouping
- sensitive-context handling rules
- requirements for avoiding overstatement about recording, identity, or sensitive-field capture
- copy review for internal and possible customer-facing surfaces

Open decision: whether this family should remain internal-only even if the other two families later become customer-facing.

## Sensitive-Context Handling

Sensitive context should increase review requirements only. It should not promote a row, harden a finding, change eligibility, or create production output by itself.

Recommended sensitive-context requirements before any future production proposal:

- stricter evidence thresholds
- stricter copy review
- explicit policy-surface coverage expectations
- explicit coverage-limitation posture when modules are partial or unavailable
- reviewer workflow flags that keep the row out of automated customer-facing projection until approved

## Required Production Gates

Any later implementation proposal should require all of the following:

| Gate | Requirement |
| --- | --- |
| Contract version | Supported version only; unsupported versions fail closed. |
| Family allowlist | Only the three approved families may enter the first implementation proposal. |
| Source refs | At least one retained source ref per normalized concern candidate. |
| Display-safe evidence | At least one bounded display-safe excerpt or approved evidence summary. |
| Confidence | Strong confidence or explicitly approved medium-confidence fallback. |
| Directness | Direct runtime evidence or policy-approved equivalent. |
| Vendor purpose | Tracker-supporting purpose only; diagnostic purposes remain non-supporting. |
| Consent state | Required for pre-consent families. |
| Session replay collection | Collection endpoint or equivalent strong evidence required. |
| Sensitive context | Review-only escalation flag, not eligibility promotion. |
| Sanitization | Raw blocked fields remain blocked. |
| Copy | Review-only language until customer-facing copy is separately approved. |

## Exclusions For First Production Proposal

The first production proposal should exclude:

- third-party vendor inventory rows
- consent banner presence or absence rows
- unresolved endpoint review rows
- policy/runtime alignment rows
- consent-flow delta or persistence rows
- tag-management-only rows
- consent-management-only rows
- security, performance, support, infrastructure, fraud/bot, RUM, or live-chat purpose rows
- Nano-only or assisted-only candidates without direct retained evidence
- rows from failed, skipped, partial, or not-testable required modules

## Implementation Shape If Later Approved

Recommended implementation sequence for a separate future pass:

1. Add a typed internal v2 normalized-concern candidate adapter.
2. Add fixtures from the four validated cohorts.
3. Add fail-closed tests for every required gate.
4. Add contract tests proving no direct report/checklist/executive/top-finding/scoring/regulatory-lens imports.
5. Add sanitized evidence projection tests.
6. Add concern-policy tests for the three families only.
7. Run a dry-run projection that compares simulated outcomes to policy outcomes without persisting concerns.
8. Return to policy/product review before enabling any persisted or customer-facing behavior.

## Copy Posture

No customer-facing copy is approved by this proposal.

Any future copy should stay evidence-scoped and review-oriented. Acceptable draft posture should use language like:

- signal observed
- review recommended
- evidence retained
- coverage limited
- not evaluated
- insufficient evidence

Prohibited posture:

- legal determinations
- definitive compliance claims
- definitive intent claims
- statements that imply sensitive-field capture without direct evidence
- statements that imply consent was legally required without policy approval

## Risk Controls

| Risk | Control |
| --- | --- |
| Direct v2-to-report shortcut | Require normalized concern construction before any policy or display path. |
| Review-only row promotion | Keep production, top-finding, and gap eligibility false until concern policy approves. |
| Sensitive-context overreach | Treat sensitive context as stricter review metadata only. |
| Inventory-only drift | Keep vendor inventory, tag management, and consent management diagnostic-only. |
| Session replay overstatement | Require collection endpoint or equivalent strong runtime evidence. |
| Cookie/storage overstatement | Keep cookie/storage separate with party, purpose, and consent-state gates. |
| Raw evidence leakage | Preserve sanitizer and raw-field blocklist tests. |
| Legal-style language drift | Keep forbidden-language scans in the dry-run and future implementation verification. |
| Coverage collapse | Preserve coverage limitations and fail closed on partial required modules. |

## Approval Checklist Before Any Implementation

Policy/product/privacy owners should explicitly approve:

- the three initial families
- separation of pre-consent tracking and cookie/storage
- session replay collection-evidence requirement
- sensitive-context handling requirements
- vendor-purpose allowlist and diagnostic-purpose exclusions
- evidence field requirements
- copy posture and prohibited language
- whether any family remains internal-only
- whether policy-surface corroboration is required for any family
- whether the next step remains dry-run comparison or can include persisted internal reviewer workflow records

Engineering owners should explicitly approve:

- adapter location
- contract versioning
- fixture plan
- test matrix
- fail-closed behavior
- no direct production display imports
- no customer-facing behavior change

## Recommendation

Proceed only to policy-approved production-integration design review. Do not implement production integration yet.

The next technical artifact should be a detailed implementation design for a typed normalized-concern candidate adapter and policy test matrix. That design should still assume no persisted concerns, no unified findings, and no customer-facing output until a separate approval explicitly changes that boundary.

## Explicit Non-Goals

- No production integration.
- No customer-facing output.
- No legal conclusions.
- No persisted normalized concerns.
- No unified findings.
- No checklist, report, executive, top-finding, scoring, or regulatory-lens integration.
- No production concern-policy call.
- No direct mapping to `gap_observed`.
