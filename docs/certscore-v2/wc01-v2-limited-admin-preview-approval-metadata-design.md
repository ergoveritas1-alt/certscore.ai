# WC01 v2 Limited Internal Admin Preview Approval-Metadata Design

Internal design only. Not implementation approval. Not customer-facing report output.

## Executive Summary

This design defines the approval metadata required to move the accepted WC01 v2 fixture-only readiness chain toward a limited internal admin preview implementation proposal.

The intended future surface is:

```text
limited_admin_internal_preview
```

The reviewed families remain limited to:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

This design is more rollout-oriented than the fixture-only readiness notes: it names the owners, approvals, gates, rollback/suppression controls, and implementation proposal metadata that would be required before any internal admin preview could be implemented.

It does not approve app UI, persistence, production integration, production concern policy calls, persisted normalized concerns, unified findings, checklist rows, report rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, customer-facing copy, or customer-facing output.

## Current Readiness Basis

The accepted fixture-only chain is:

```text
Wc01V2ProductionIntegrationCandidate
-> Wc01V2NormalizedConcernSchemaComparison
-> Wc01V2ConcernPolicyShapeComparison
-> Wc01V2ProjectionShapeComparison
```

Current accepted evidence:

| Stage | Status | Missing count | Blocked count | Current use |
|---|---|---:|---:|---|
| Production integration candidate | accepted as internal review object | 0 | 0 | Internal candidate shape baseline |
| Normalized-concern schema comparison | accepted as fixture-only readiness evidence | 0 | 0 | Normalized concern draft shape evidence |
| Concern-policy shape comparison | fixture-only readiness evidence | 0 | 0 | Future policy input shape evidence |
| Projection shape comparison | accepted as fixture-only readiness evidence | 0 | 0 | Future unified/checklist/evidence packet shape evidence |

All stages remain closed by default:

| Flag | Required value |
|---|---:|
| `productionEligible` | `false` |
| `persistEligible` | `false` |
| `concernPolicyCallEligible` | `false` |
| `unifiedFindingEligible` | `false` |
| `checklistProjectionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

## Proposed Approval Metadata Object

Future artifact:

```text
Wc01V2LimitedAdminPreviewApprovalMetadata
```

Purpose: capture the explicit approvals and controls required before creating a separate limited internal admin preview implementation proposal.

This object would not implement UI. It would only document whether the approval record is complete enough to support an implementation proposal.

## Required Fields

| Field | Required | Purpose |
|---|---:|---|
| `metadataVersion` | yes | Version of the approval metadata contract. |
| `targetSurfaceClass` | yes | Must be `limited_admin_internal_preview`. |
| `sourceFixtureChain` | yes | Paths or IDs for the accepted fixture-chain artifacts. |
| `allowedFamilies` | yes | Must be limited to approved families. |
| `blockedFamilies` | yes | Families and contexts excluded from the proposal. |
| `ownerApprovals` | yes | Named product, policy, copy, evidence, and engineering approvals. |
| `accessControlPlan` | yes | Who can access the preview and how access is enforced. |
| `dataHandlingPlan` | yes | Whether preview reads artifacts only, avoids persistence, and avoids customer-visible output. |
| `evidenceRequirements` | yes | Required refs, excerpts, confidence/directness, consent-state context, purpose context, and family-specific context. |
| `copyPosture` | yes | Internal diagnostic language only; no customer-facing wording. |
| `sensitiveContextHandling` | yes | Sensitive-context items stay blocked from preview or require separate route. |
| `blockedSurfaceAssertions` | yes | Explicit list of surfaces still blocked. |
| `guardrailRequirements` | yes | Required guardrail scans, import-boundary checks, and raw-field checks. |
| `rollbackSuppressionPlan` | yes | How the preview can be disabled, suppressed, or reverted. |
| `implementationProposalRef` | yes | Path or ID for a future proposal; may be `not_created` at metadata-design stage. |
| `approvalStatus` | yes | One of `incomplete`, `ready_for_implementation_proposal`, or `rejected`. |

## Owner Approvals

The approval metadata must require named approvals from:

- product owner
- policy owner
- copy owner
- evidence owner
- engineering owner

Each approval entry should include:

| Field | Purpose |
|---|---|
| `ownerRole` | Product, policy, copy, evidence, or engineering. |
| `ownerName` | Named accountable owner. |
| `approvalDecision` | `approved_for_proposal`, `needs_revision`, or `rejected`. |
| `approvalDate` | Date of decision. |
| `scopeNotes` | What the approval covers and excludes. |
| `requiredFollowups` | Any work required before implementation proposal. |

No single owner approval can create implementation eligibility by itself.

## Target Surface Definition

Target surface:

```text
limited_admin_internal_preview
```

Required surface constraints:

- internal access only
- read-only
- artifact-derived only
- no customer-facing route
- no production report builder integration
- no checklist builder integration
- no executive summary integration
- no top-finding integration
- no scoring integration
- no regulatory-lens integration
- no API/MCP/export output
- no persistence unless separately approved
- no production concern policy call unless separately approved

## Allowed Families

Allowed families for this approval metadata design:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The approval metadata must reject or hold any family outside this list.

## Blocked Families And Contexts

Blocked from the limited internal admin preview proposal by default:

- `session_replay_behavioral_analytics`
- `third_party_vendors_observed`
- consent banner presence/absence
- unresolved endpoint review
- policy/runtime alignment
- consent-flow delta rows
- consent-flow persistence rows
- tag-management-only evidence
- consent-management-only evidence
- security-only evidence
- performance-only evidence
- support-only evidence
- infrastructure-only evidence
- fraud/bot-only evidence
- RUM-only evidence
- live-chat-only evidence
- sensitive-context items unless separately approved

## Evidence Requirements

For both allowed families:

- source evidence refs present
- display-safe excerpt refs present
- consent-state context present
- confidence present and reviewable
- directness present and reviewable
- unresolved refs do not affect evidence sufficiency
- purpose context present
- diagnostic exclusions present
- blocked surfaces present
- rollback/suppression hints present

Additional `pre_consent_tracking` requirement:

- vendor or endpoint attribution context present

Additional `pre_consent_cookie_storage` requirements:

- party/storage context present
- storage type present
- unsafe storage content excluded

## Copy Posture

Allowed internal wording posture:

- internal diagnostic labels only
- evidence-shape language only
- no customer-facing wording
- no product claim language
- no legal-conclusion language
- no sensitive-context claims
- no user/person identification claims

Allowed phrases:

- "Internal preview candidate"
- "Fixture-chain evidence shape is available"
- "Reviewer-only diagnostic metadata"
- "Not customer-facing output"
- "Requires explicit implementation proposal before any UI work"

Blocked phrases:

- customer-facing status language
- compliance conclusions
- claims about user harm
- claims about sensitive-data collection unless separately approved and directly supported
- claims that imply production eligibility

## Sensitive-Context Handling

Sensitive-context labels remain routing metadata only.

Default handling:

- exclude sensitive-context candidates from limited admin preview proposal scope
- require separate policy/copy/product approval before any sensitive-context preview route
- do not harden wording or increase eligibility based on sensitive context

Sensitive-context categories include:

- health
- reproductive health
- finance
- public benefits
- employment / HR
- behavioral analytics reference sites

## Guardrail Requirements

Before any implementation proposal, the approval metadata must require:

- guardrail wording/raw-field scan
- import-boundary scan showing no production report/checklist/executive/top-finding/scoring/regulatory/shared scan detail imports
- test coverage for closed-default flags
- tests proving unsupported families fail closed
- tests proving sensitive-context items do not become eligible
- tests proving raw blocked fields are rejected
- tests proving no customer-facing copy is emitted
- tests proving no persistence is introduced
- tests proving no production concern policy calls are made

## Rollback And Suppression Plan

The approval metadata must include a rollback/suppression plan with:

- feature flag or environment gate name, if later implemented
- explicit default-off behavior
- disable path
- family-level suppression
- site/domain-level suppression
- vendor/domain suppression where applicable
- emergency rollback owner
- logging/audit expectations
- confirmation that disabling the preview cannot affect production reports

## Approval Status Rules

`approvalStatus` may be:

- `incomplete`
- `ready_for_implementation_proposal`
- `rejected`

`ready_for_implementation_proposal` requires:

- all owner approvals present
- target surface fixed to `limited_admin_internal_preview`
- allowed families limited to `pre_consent_tracking` and `pre_consent_cookie_storage`
- blocked families documented
- evidence requirements documented
- copy posture documented
- sensitive-context handling documented
- guardrail requirements documented
- rollback/suppression plan documented
- implementation proposal path or ID prepared

Even `ready_for_implementation_proposal` does not approve implementation.

## Proposed Aggressive Rollout Sequence

The aggressive but controlled sequence is:

```text
1. Approval metadata design
2. Artifact-only approval metadata generator
3. One generated metadata example for limited_admin_internal_preview
4. Product/policy/copy/engineering review of the metadata example
5. Separate implementation proposal draft
6. Only then consider limited internal admin preview implementation
```

Do not skip directly from fixture readiness to UI.

## Decision Options

| Option | Meaning |
|---|---|
| A | Accept this approval-metadata design and implement an artifact-only metadata generator. |
| B | Revise metadata fields before implementation. |
| C | Collect product/policy/copy feedback first. |
| D | Start limited admin preview UI implementation. |
| E | Stop this rollout lane. |

Recommended default: **A. Accept this approval-metadata design and implement an artifact-only metadata generator.**

Do not choose D yet.

## Explicit Non-goals

- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no checklist rows
- no report rows
- no executive summaries
- no top findings
- no scoring output
- no regulatory-lens output
- no API/MCP/export output
- no customer-facing copy
- no customer-facing output
- no legal-conclusion language
- no forbidden status mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
