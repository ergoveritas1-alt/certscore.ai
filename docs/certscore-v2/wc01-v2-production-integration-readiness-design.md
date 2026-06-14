# WC01 v2 Production Integration Readiness Design

Internal design only. Not implementation approval. Not customer-facing report output.

## Executive Summary

The WC01 v2 internal artifact chain is stable enough to design a future production integration path, but production integration is not approved.

The next step is canonical-pipeline readiness design only. Any future production path must follow the WC01 scan-to-report pipeline:

```text
WS01/v2 observed evidence
-> WC01 normalized concern
-> WC01 concern policy
-> WC01 unified finding / checklist projection
-> approved display surface
```

Raw v2 artifacts must not be displayed directly as production output. V2 artifacts may inform a future normalized concern input design, but they cannot bypass WC01 concern policy or unified finding/checklist projection.

This design assesses readiness only for two non-sensitive candidate families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

## Current Internal Evidence Path

The current WC01 v2 internal path is artifact-only, internal-only, and non-persistent:

```text
grouped evidence preview
-> manual reviewer workflow
-> policy/copy review
-> production-readiness gate
-> product-surface proposal draft
```

Current posture:

- grouped evidence preview is adopted for internal review
- reviewer workflow uses Markdown first, JSON for confirmation, and upstream artifacts only for exceptional inspection
- policy/copy review remains internal
- production-readiness gate drafts remain closed by default
- product-surface proposal drafts remain closed by default
- proposal pattern is validated as useful for internal review discussions
- no proposal draft creates production eligibility

Closed-default fields:

| Field | Required value |
|---|---|
| `implementationStatus` | `not_approved` |
| `productionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

## Candidate Families

### `pre_consent_tracking`

Why it is a possible first production candidate:

- narrow runtime evidence family
- already exercised through v2 internal review artifacts
- suitable for mapping into a normalized concern draft because the relevant consent-state context can be explicit
- non-sensitive contexts can be separated from sensitive-context routing

Evidence required:

- observed runtime request or storage evidence before consent action
- resolved vendor or high-confidence endpoint attribution
- consent-state context showing the evidence occurred before an accept action
- display-safe excerpt refs and source refs
- confidence and directness meeting approved thresholds
- family-specific context explaining why the observation belongs to pre-consent tracking

Evidence exclusions:

- tag-management-only evidence
- consent-management-only evidence
- security, fraud, infrastructure, performance, support, RUM, or live-chat evidence as sole support
- inventory-only third-party vendor presence
- policy/runtime alignment review alone
- consent-flow delta or persistence row alone
- library-only or collection-ambiguous evidence without supporting runtime context

Sensitive-context exclusion:

- sensitive-context items remain internal-only until separate policy/copy and product approval exists
- sensitive-context labels must not move into production copy

Unresolved-ref requirements:

- no unresolved refs that affect evidence sufficiency
- unresolved refs, if any, must be documented as non-blocking fail-closed context

Confidence/directness requirements:

- confidence must meet an approved minimum band
- directness must show observed runtime evidence, not inference from category or inventory

Copy posture:

- evidence-scoped and review-oriented
- no legal-conclusion language
- no user/person identification claims
- no sensitive-data claims unless directly supported by approved evidence

Policy gates needed:

- normalized concern schema approval
- concern policy key approval
- evidence sufficiency gate
- policy/copy gate
- guardrail/sanitization gate
- suppression/rollback gate

### `pre_consent_cookie_storage`

Why it is a possible first production candidate:

- paired with `pre_consent_tracking` but distinct enough to test storage-specific mapping
- evidence can be scoped to storage/cookie behavior rather than broad vendor presence
- party context and purpose exclusions can be explicit

Evidence required:

- observed cookie or storage write before consent action
- party context and storage context
- consent-state context showing the storage occurred before an accept action
- display-safe excerpt refs and source refs
- confidence and directness meeting approved thresholds
- purpose exclusions showing diagnostic-only purposes are not sole support

Evidence exclusions:

- cookie banner presence or absence alone
- consent-management cookies as sole support
- security, fraud, infrastructure, performance, support, RUM, or live-chat storage as sole support
- tag-management-only evidence
- inventory-only vendor presence
- raw cookie values or unsafe storage content
- policy/runtime alignment review alone
- consent-flow delta or persistence row alone

Sensitive-context exclusion:

- sensitive-context items remain internal-only until separate policy/copy and product approval exists
- sensitive-context labels must not become customer-facing claims

Unresolved-ref requirements:

- no unresolved refs that affect evidence sufficiency
- unresolved refs, if any, must be documented as non-blocking fail-closed context

Confidence/directness requirements:

- confidence must meet an approved minimum band
- directness must show observed storage behavior in the relevant consent state

Copy posture:

- evidence-scoped and bounded to observed storage behavior
- no legal-conclusion language
- no user/person identification claims
- no sensitive-data claims unless directly supported by approved evidence

Policy gates needed:

- normalized concern schema approval
- concern policy key approval
- evidence sufficiency gate
- storage/cookie-specific exclusion gate
- policy/copy gate
- guardrail/sanitization gate
- suppression/rollback gate

## Canonical WC01 Mapping Proposal

This section proposes mapping shape only. Do not implement.

### `pre_consent_tracking`

| WC01 stage | Proposed future mapping |
|---|---|
| Normalized concern input | A typed draft input derived from observed runtime evidence, consent-state context, vendor attribution, source refs, excerpt refs, confidence, and directness. |
| Concern policy key | `v2.pre_consent_tracking.reviewed_non_sensitive` or another approved key created through concern-policy design. |
| Unified finding candidate | A candidate generated only after concern policy accepts the normalized concern. |
| Checklist row candidate | Possible only if an approved checklist mapping exists; otherwise blocked. |
| Evidence packet | Display-safe source refs, excerpt refs, consent-state context, vendor attribution, confidence/directness, exclusions, and reviewer/gate metadata. |
| Suppression/rollback path | Suppress by family, vendor, domain/site, evidence source, confidence/directness threshold, or policy key. |

### `pre_consent_cookie_storage`

| WC01 stage | Proposed future mapping |
|---|---|
| Normalized concern input | A typed draft input derived from observed storage evidence, party/storage context, consent-state context, source refs, excerpt refs, confidence, and directness. |
| Concern policy key | `v2.pre_consent_cookie_storage.reviewed_non_sensitive` or another approved key created through concern-policy design. |
| Unified finding candidate | A candidate generated only after concern policy accepts the normalized concern. |
| Checklist row candidate | Possible only if an approved checklist mapping exists; otherwise blocked. |
| Evidence packet | Display-safe source refs, excerpt refs, party/storage context, consent-state context, purpose exclusions, confidence/directness, and reviewer/gate metadata. |
| Suppression/rollback path | Suppress by family, storage type, vendor/domain/site, evidence source, confidence/directness threshold, or policy key. |

## Explicitly Blocked Surfaces

The following are blocked from this readiness design:

- executive summary
- top findings
- scoring
- regulatory-lens output
- API/MCP/export
- sensitive-context customer-facing output
- production concern policy calls without a separate implementation proposal
- direct report display from v2 artifacts

Raw v2 artifacts must not become production report rows or display surfaces.

## Required Production Gates

Before implementation, the following must be approved and documented:

- approved production surface
- approved normalized concern schema
- approved concern policy behavior
- approved unified finding projection
- approved report/checklist copy, if any report or checklist surface is later proposed
- evidence fixture coverage
- regression tests
- rollback/suppression plan
- policy/copy approval
- guardrail scan

Passing these gates should still produce only an implementation proposal until implementation is separately approved.

## Minimal Production Candidate Shape

Future artifact or design object:

```text
Wc01V2ProductionIntegrationCandidate
```

Proposed fields:

| Field | Purpose |
|---|---|
| `family` | Candidate family under review. |
| `sourceEvidenceArtifact` | Source v2 artifact path or ID used for traceability. |
| `normalizedConcernDraft` | Proposed typed normalized concern input shape. |
| `proposedConcernPolicyKey` | Proposed WC01 concern policy key. |
| `proposedUnifiedFindingKey` | Proposed unified finding key, if applicable. |
| `proposedChecklistRowKey` | Proposed checklist row key, if applicable. |
| `evidenceRequirements` | Required evidence fields, refs, excerpts, consent-state context, confidence, and directness. |
| `copyPosture` | Approved internal or future copy posture. |
| `blockedSurfaces` | Surfaces explicitly blocked for the candidate. |
| `approvalMetadata` | Product, policy, copy, and engineering approval metadata. |
| `rollbackPlan` | Suppression and rollback path. |
| `implementationStatus` | Always `not_approved` by default. |

This shape is a future design object only. It does not persist concerns or create findings.

## Risk Analysis

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Evidence over-promotion | Internal evidence may be interpreted as stronger than the observed signal supports. | Require normalized concern schema, concern policy, and evidence gates before projection. |
| Display-layer shortcut risk | Direct display from v2 artifacts would bypass the canonical WC01 pipeline. | Block raw v2 artifact display and require normalized concern mapping. |
| Sensitive-context leakage | Routing labels could be misread as product claims. | Keep sensitive-context items out of customer-facing surfaces until separate approval. |
| Legal-conclusion copy risk | Copy may imply determinations beyond evidence. | Require policy/copy approval and guardrail scan. |
| Scoring/regulatory overreach | Narrow evidence families could be incorrectly used for broader output. | Block scoring and regulatory-lens output until separately approved. |
| Raw evidence leakage | Unsafe values could enter display or artifacts. | Require display-safe refs/excerpts and sanitizer checks. |
| Rollback failure | Future output must be suppressible if evidence or policy changes. | Require rollback/suppression plan before implementation proposal. |

## Decision Options

Recommended default: **B or C only. Do not choose D yet.**

| Option | Decision |
|---|---|
| A | Continue design only. |
| B | Implement fixture-only normalized-concern draft mapping. |
| C | Implement internal-only production integration candidate artifact. |
| D | Start production integration implementation. |
| E | Stop and collect external validation. |

## Explicit Non-Goals

This design does not approve or create:

- code changes
- app UI
- persistence
- production integration
- customer-facing output
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
