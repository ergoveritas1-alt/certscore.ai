# WC01 v2 Limited Admin Preview Implementation Proposal Design

Internal design only. Not implementation approval. Not customer-facing report output.

## Executive Summary

This document defines the shape of a possible future implementation proposal for a WC01 v2 `limited_admin_internal_preview`.

The approval metadata pattern has been accepted as an internal review checkpoint, but the current metadata remains incomplete and blocked. This design explains what an implementation proposal would need to contain before any code work could be approved.

This document does not approve app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Proposal Goal

The narrow goal of a future `limited_admin_internal_preview` would be to let authorized internal users inspect already-generated WC01 v2 internal artifacts in a read-only preview surface.

The preview would be for operator and reviewer inspection only. It would not create product output, write production state, call production concern policy, or project v2 rows into WC01 report or checklist paths.

## Source Chain

Any future implementation proposal must be grounded in the accepted internal artifact chain:

```text
Wc01V2EvidencePreviewPacket
-> manual reviewer workflow
-> policy/copy review artifact
-> production-readiness gate draft
-> product surface proposal draft
-> limited admin preview approval metadata
-> implementation proposal, not yet approved
```

The preview must not read raw scan artifacts directly as product output. If raw upstream artifact inspection is needed, it must remain an exceptional internal debugging action outside the preview surface.

## Allowed Scope

Initial allowed families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Initial allowed source artifacts:

- `Wc01V2EvidencePreviewPacket.summary.md`
- `Wc01V2EvidencePreviewPacket.json`
- `Wc01V2ProductSurfaceProposalDraft.json`
- `Wc01V2LimitedAdminPreviewApprovalMetadata.json`

Initial allowed behavior:

- read-only artifact inspection
- display of internal queue lanes and reviewer actions
- display of display-safe excerpt text already present in evidence preview packets
- display of source ref IDs and bounded source ref summaries
- display of vendor labels and purposes as internal diagnostic labels only
- display of confidence/directness metadata
- display of fail-closed reasons and missing approval metadata
- display of guardrail status

## Blocked Scope

The preview must not:

- write reviewer decisions
- persist preview state
- create normalized concerns
- call production concern policy
- create unified findings
- create report rows
- create checklist rows
- create executive summary rows
- create top findings
- affect scoring
- affect regulatory-lens output
- expose API/MCP/export output
- create customer-facing copy
- change existing customer-facing report behavior
- read or display raw cookies, raw request/response bodies, sensitive query values, unbounded DOM text, unbounded policy text, or raw Nano reasoning
- modify `apps/web/components/scans/shared-scan-detail-view.tsx`

## Access-Control Requirements

A future implementation proposal must define:

- explicit internal route gate
- admin-role or operator-role requirement
- environment or feature flag defaulting off
- read-only artifact access
- no customer account exposure by default
- audit-friendly request logging without storing raw evidence
- clear disabled state when metadata is incomplete

The default behavior must be fail-closed. If required approval metadata is missing, the preview should not render artifact rows.

## Data-Handling Requirements

The preview must remain:

- artifact-only
- read-only
- non-persistent
- internal-only
- display-safe
- bounded

The preview may render only fields already carried forward into approved internal artifacts. It must not rehydrate raw evidence automatically and must not broaden artifact retention.

## Display Requirements

The preview should show:

- artifact identity and source path
- source site/domain where present
- family
- queue lane
- reviewer action
- sensitive-context routing metadata, when present
- representative evidence groups
- top-N display-safe excerpts
- bounded source refs
- unresolved-ref summary
- redaction or sanitizer warnings
- confidence/directness
- caveats and missing requirements
- fail-closed reasons
- approval metadata status
- guardrail status

The preview must label all content as internal diagnostic material. It must not use customer-facing wording or production report statuses.

## Sensitive-Context Rules

Sensitive-context labels remain routing metadata only.

Sensitive-context rows must:

- remain internal-only
- show routing labels without stronger status
- require separate policy/copy review before any future product-surface discussion
- stay excluded from the initial limited admin preview unless the implementation proposal explicitly names the handling rule

The preview must not infer stronger meaning from health, reproductive health, finance, public benefits, employment/HR, or behavioral analytics reference labels.

## Fail-Closed Conditions

A future preview must fail closed when:

- approval metadata is missing
- owner approvals are missing
- implementation proposal reference is missing
- artifact versions are unsupported
- source artifact is malformed
- source artifact contains raw blocked fields
- source artifact contains forbidden status mapping
- source artifact contains legal-conclusion language
- requested family is not in the allowed family list
- sensitive-context handling is missing for sensitive-context items
- production eligibility, customer-facing eligibility, persistence eligibility, concern policy call eligibility, unified finding eligibility, or checklist projection eligibility is true
- guardrail scan result is missing or not clean

Fail-closed behavior should be visible as internal diagnostic status, not as product output.

## Required Implementation Proposal Metadata

Before any implementation work could be approved, a concrete proposal must include:

- proposal ID or path
- named product owner approval
- named policy owner approval
- named copy owner approval
- named evidence owner approval
- named engineering owner approval
- approved target route or surface
- approved access-control plan
- approved data-handling plan
- approved allowed families
- approved blocked families and contexts
- approved sensitive-context rule
- approved copy posture
- approved guardrail scan command and result
- approved test plan
- approved rollback/suppression plan
- explicit statement that production report/checklist/executive/scoring/regulatory/API output remains blocked

## Test Plan For A Future Proposal

A future implementation proposal must include tests for:

- unsupported artifact version fails closed
- missing approval metadata fails closed
- missing owner approvals fail closed
- unsupported family fails closed
- sensitive-context item without explicit handling fails closed
- raw blocked fields fail closed
- forbidden status mapping fails closed
- legal-conclusion wording fails closed
- production/customer/persistence flags true fail closed
- preview imports do not touch production report, checklist, executive, top-finding, scoring, regulatory, persistence, production concern policy, unified finding, or shared scan detail paths
- no writes occur during preview loading
- disabled feature flag prevents rendering

## Rollback And Suppression Plan

Any future implementation proposal must include a rollback/suppression plan with:

- global disable flag
- family-level suppression
- site/domain-level suppression
- vendor/domain-level suppression
- artifact-path allowlist
- emergency owner
- verification command after disabling

Rollback must not alter production report or checklist state because the preview must not write production state.

## Decision Options

A. Continue design only.

B. Create an implementation proposal artifact template, still doc-only.

C. Implement a fixture-only preview loader test harness outside the app, still no UI.

D. Implement the limited admin preview UI.

E. Stop and collect additional policy/product validation.

Recommended default: B or C only. Do not choose D until explicit owner approvals and a concrete implementation proposal exist.

## Explicit Non-Goals

- no implementation
- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report rows
- no checklist rows
- no executive summaries
- no top findings
- no scoring output
- no regulatory-lens output
- no API/MCP/export output
- no customer-facing copy
- no legal-conclusion language
- no forbidden status mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Future Implementation Prompt: Not Approved

The following prompt is for a future implementation discussion only. It is not approved for implementation.

```text
Create an artifact-only WC01 v2 limited admin preview implementation proposal artifact template.

Inputs:
- Wc01V2LimitedAdminPreviewApprovalMetadata.json
- Wc01V2ProductSurfaceProposalDraft.json
- optional evidence-preview artifact sample paths

Output:
- Wc01V2LimitedAdminPreviewImplementationProposalDraft.json
- Wc01V2LimitedAdminPreviewImplementationProposalDraft.summary.md

Requirements:
- keep implementationStatus:not_approved by default
- require named product, policy, copy, evidence, and engineering owner approvals
- require explicit access-control, data-handling, sensitive-context, guardrail, test, and rollback plans
- fail closed when approval metadata is incomplete
- fail closed when any production/customer/persistence eligibility flag is true
- emit internal diagnostic JSON/Markdown only
- do not implement UI, persistence, production integration, customer-facing output, or production concern policy calls
```
