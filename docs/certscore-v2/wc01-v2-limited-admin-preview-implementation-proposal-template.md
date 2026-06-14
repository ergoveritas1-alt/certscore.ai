# WC01 v2 Limited Admin Preview Implementation Proposal Template

Internal proposal template only. Not implementation approval. Not customer-facing report output.

## Executive Summary

This template defines the required shape for a future `Wc01V2LimitedAdminPreviewImplementationProposalDraft`.

It exists so product, policy, copy, evidence, and engineering owners can review a concrete implementation proposal before any code work begins. The default status is blocked.

This template does not approve app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Draft Artifact Identity

| Field | Required value or instruction |
|---|---|
| `proposalVersion` | `wc01.v2_limited_admin_preview_implementation_proposal.1` |
| `proposalId` | Stable internal proposal ID. |
| `proposalCreatedAt` | ISO timestamp. |
| `proposalOwner` | Named engineering owner responsible for proposal maintenance. |
| `implementationStatus` | `not_approved` |
| `approvalStatus` | `incomplete` until all required approvals are present. |
| `explicitApprovalRequired` | `true` |

## Required Source Artifacts

| Field | Required value or instruction |
|---|---|
| `sourceApprovalMetadataPath` | Path to `Wc01V2LimitedAdminPreviewApprovalMetadata.json`. |
| `sourceProductSurfaceProposalPath` | Path to `Wc01V2ProductSurfaceProposalDraft.json`. |
| `sourceEvidencePreviewSamplePaths` | Bounded list of representative `Wc01V2EvidencePreviewPacket` artifacts. |
| `sourceGuardrailScanResultPath` | Path to the clean guardrail scan result or summary. |

The proposal must fail closed if the approval metadata is incomplete, owner approvals are missing, or the implementation proposal reference is absent.

## Target Surface

| Field | Required value or instruction |
|---|---|
| `targetSurfaceClass` | `limited_admin_internal_preview` |
| `targetRoute` | Proposed internal route. Must be disabled by default. |
| `surfaceAudience` | Internal admins/operators only. |
| `surfacePurpose` | Read-only inspection of approved internal artifacts. |
| `surfaceStatus` | `blocked_until_explicit_approval` |

## Owner Approvals

All owner approvals must be named and scoped.

| Owner role | Required fields |
|---|---|
| Product | owner name, decision, date, scope notes, required follow-ups |
| Policy | owner name, decision, date, scope notes, required follow-ups |
| Copy | owner name, decision, date, scope notes, required follow-ups |
| Evidence | owner name, decision, date, scope notes, required follow-ups |
| Engineering | owner name, decision, date, scope notes, required follow-ups |

Allowed approval decisions:

- `approved_for_implementation_proposal`
- `needs_revision`
- `rejected`
- `missing`

Any `missing`, `needs_revision`, or `rejected` decision keeps the proposal blocked.

## Allowed Families

Initial allowed families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The proposal must not add additional families unless a separate approval decision names them.

## Blocked Families And Contexts

The proposal must keep these blocked unless separately approved:

- `session_replay_behavioral_analytics`
- `third_party_vendors_observed`
- `consent_banner_presence_absence`
- `unresolved_endpoint_review`
- `policy_runtime_alignment`
- `consent_flow_delta_rows`
- `consent_flow_persistence_rows`
- `tag_management_only`
- `consent_management_only`
- `security_only`
- `performance_only`
- `support_only`
- `infrastructure_only`
- `fraud_bot_only`
- `rum_only`
- `live_chat_only`
- `sensitive_context_items`

## Access-Control Plan

Required fields:

- `featureFlagName`
- `defaultEnabled:false`
- `requiredRole`
- `internalOnly:true`
- `readOnly:true`
- `artifactPathAllowlist`
- `disabledStateBehavior`
- `auditLogPlan`

The access-control plan must state that disabled or unauthorized access returns no artifact rows.

## Data-Handling Plan

Required fields:

- `artifactOnly:true`
- `nonPersistent:true`
- `readOnly:true`
- `displaySafeOnly:true`
- `rawEvidenceRehydration:false`
- `writesProductionState:false`
- `storesReviewerDecisions:false`
- `storesPreviewState:false`

Allowed data:

- source artifact identity
- queue lane
- family
- internal reviewer action
- display-safe excerpt text already present in evidence preview packets
- source ref IDs and bounded source ref summaries
- vendor labels and purposes as internal diagnostic labels
- confidence/directness metadata
- caveats and missing requirements
- fail-closed reasons
- guardrail status

Blocked data:

- raw cookies
- raw request/response bodies
- sensitive query values
- unbounded DOM text
- unbounded policy text
- raw Nano reasoning
- customer-facing copy
- production report statuses

## Sensitive-Context Handling

Required fields:

- `sensitiveContextDefault:"excluded"`
- `routingMetadataOnly:true`
- `customerFacingUse:false`
- `requiresSeparatePolicyCopyApproval:true`
- `allowedSensitiveCategories:[]` unless separately approved

Sensitive-context labels must remain routing metadata only and must not change status, copy posture, product eligibility, scoring, checklist posture, or regulatory output.

## Copy Posture

Required value:

- `copyPosture:"internal_diagnostic_only"`

Allowed internal labels:

- `Internal diagnostic preview`
- `Read-only artifact inspection`
- `Approval metadata incomplete`
- `Fail-closed`
- `Reviewer workflow artifact`

Blocked copy:

- customer-facing descriptions
- production report language
- definitive legal language
- sensitive-data claims not directly supported by approved evidence
- claims about users or persons

## Guardrail Requirements

The proposal must include clean results for:

- forbidden status mapping scan
- raw blocked field scan
- legal-conclusion wording scan
- unsupported artifact version handling
- malformed artifact handling
- missing approval metadata handling
- missing owner approvals handling
- production/customer/persistence flag handling
- import-boundary scan

## Test Plan

The implementation proposal must include test cases for:

- feature flag disabled blocks rendering
- unauthorized role blocks rendering
- missing approval metadata fails closed
- missing owner approvals fail closed
- unsupported artifact version fails closed
- malformed artifact fails closed
- unsupported family fails closed
- sensitive-context item fails closed unless explicitly approved
- raw blocked fields fail closed
- forbidden status mapping fails closed
- legal-conclusion wording fails closed
- production/customer/persistence eligibility true fails closed
- no writes occur during loading
- no production report/checklist/executive/scoring/regulatory/persistence/production concern policy/unified finding/shared scan detail imports

## Rollback And Suppression Plan

Required fields:

- `globalDisableFlag`
- `familySuppression`
- `siteDomainSuppression`
- `vendorDomainSuppression`
- `artifactPathAllowlist`
- `emergencyOwner`
- `rollbackVerificationCommand`
- `postRollbackExpectedState`

Rollback must not alter production report, checklist, executive, scoring, regulatory, API/export, or customer-facing state.

## Closed-Default Flags

Required values:

| Field | Required value |
|---|---|
| `productionEligible` | false |
| `persistEligible` | false |
| `concernPolicyCallEligible` | false |
| `unifiedFindingEligible` | false |
| `checklistProjectionEligible` | false |
| `customerFacingEligible` | false |
| `explicitApprovalRequired` | true |

## Draft JSON Shape

```json
{
  "proposalVersion": "wc01.v2_limited_admin_preview_implementation_proposal.1",
  "proposalId": "TBD",
  "proposalCreatedAt": "TBD",
  "proposalOwner": "TBD",
  "implementationStatus": "not_approved",
  "approvalStatus": "incomplete",
  "explicitApprovalRequired": true,
  "sourceApprovalMetadataPath": "artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json",
  "sourceProductSurfaceProposalPath": "TBD",
  "sourceEvidencePreviewSamplePaths": [],
  "sourceGuardrailScanResultPath": "TBD",
  "targetSurfaceClass": "limited_admin_internal_preview",
  "targetRoute": "TBD",
  "surfaceAudience": "internal_admins_only",
  "surfacePurpose": "read_only_artifact_inspection",
  "surfaceStatus": "blocked_until_explicit_approval",
  "ownerApprovals": [],
  "allowedFamilies": [
    "pre_consent_tracking",
    "pre_consent_cookie_storage"
  ],
  "blockedFamiliesAndContexts": [
    "session_replay_behavioral_analytics",
    "third_party_vendors_observed",
    "consent_banner_presence_absence",
    "unresolved_endpoint_review",
    "policy_runtime_alignment",
    "consent_flow_delta_rows",
    "consent_flow_persistence_rows",
    "tag_management_only",
    "consent_management_only",
    "security_only",
    "performance_only",
    "support_only",
    "infrastructure_only",
    "fraud_bot_only",
    "rum_only",
    "live_chat_only",
    "sensitive_context_items"
  ],
  "accessControlPlan": {
    "featureFlagName": "TBD",
    "defaultEnabled": false,
    "requiredRole": "TBD",
    "internalOnly": true,
    "readOnly": true,
    "artifactPathAllowlist": [],
    "disabledStateBehavior": "render_no_artifact_rows",
    "auditLogPlan": "TBD"
  },
  "dataHandlingPlan": {
    "artifactOnly": true,
    "nonPersistent": true,
    "readOnly": true,
    "displaySafeOnly": true,
    "rawEvidenceRehydration": false,
    "writesProductionState": false,
    "storesReviewerDecisions": false,
    "storesPreviewState": false
  },
  "sensitiveContextHandling": {
    "sensitiveContextDefault": "excluded",
    "routingMetadataOnly": true,
    "customerFacingUse": false,
    "requiresSeparatePolicyCopyApproval": true,
    "allowedSensitiveCategories": []
  },
  "copyPosture": "internal_diagnostic_only",
  "guardrailRequirements": [],
  "testPlan": [],
  "rollbackSuppressionPlan": {
    "globalDisableFlag": "TBD",
    "familySuppression": true,
    "siteDomainSuppression": true,
    "vendorDomainSuppression": true,
    "artifactPathAllowlist": [],
    "emergencyOwner": "TBD",
    "rollbackVerificationCommand": "TBD",
    "postRollbackExpectedState": "no_artifact_rows_rendered"
  },
  "productionEligible": false,
  "persistEligible": false,
  "concernPolicyCallEligible": false,
  "unifiedFindingEligible": false,
  "checklistProjectionEligible": false,
  "customerFacingEligible": false
}
```

## Review Questions

- Is the proposal template complete enough for owner review?
- Are the required approvals correctly scoped?
- Is the access-control plan strict enough?
- Is the data-handling plan narrow enough?
- Are the blocked families and contexts complete?
- Are sensitive-context rules conservative enough?
- Are guardrail requirements sufficient?
- Is rollback/suppression specific enough?
- Should any field be mandatory before implementation can even be discussed?

## Decision Options

A. Accept template as-is; keep blocked.

B. Accept with minor documentation refinements; keep blocked.

C. Add a generated fixture-only proposal artifact next.

D. Begin implementation of the limited admin preview.

E. Stop this lane and collect more external validation.

Recommended default: A or C. Do not choose D without explicit owner approvals and a separate implementation approval.

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
