# WC01 v2 Internal Artifact-Chain Smoke Follow-Up

Internal smoke follow-up only. Not customer-facing report output.

## Executive Summary

Ran the WC01 v2 internal artifact-chain smoke after implementing the production-readiness gate generator.

The internal chain remains closed by default end to end:

```text
policy/copy review artifact
-> production-readiness gate draft
-> product surface proposal draft
```

The smoke passed all 13 closed-default checks. No generated artifact created production eligibility, customer-facing eligibility, app UI, persistence, production integration, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Commands Run

Verification commands:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-policy-copy-review --help
pnpm v2:wc01-production-readiness-gate --help
pnpm v2:wc01-product-surface-proposal --help
pnpm v2:wc01-artifact-chain-smoke
```

Results:

- `pnpm --filter @certscore/report-adapter test`: passed, 178/178 tests
- `pnpm --filter @certscore/report-adapter typecheck`: passed
- `pnpm v2:wc01-policy-copy-review --help`: passed
- `pnpm v2:wc01-production-readiness-gate --help`: passed
- `pnpm v2:wc01-product-surface-proposal --help`: passed
- `pnpm v2:wc01-artifact-chain-smoke`: passed, 13 checks

## Input Example Artifacts Used

The smoke used the checked-in internal examples from:

```text
docs/certscore-v2/examples/
```

Input artifacts:

- `Wc01V2PolicyCopyReviewInput.example.json`
- `Wc01V2ProductionReadinessGateInput.example.json`
- `Wc01V2ProductSurfaceProposalInput.example.json`

These examples are handoff-shape fixtures only. They are not live-site evidence and do not define production behavior.

## Output Artifacts Generated

The smoke wrote generated artifacts to:

```text
artifacts/v2-internal-artifact-chain-example/
```

Generated files:

- `Wc01V2PolicyCopyReviewArtifact.json`
- `Wc01V2PolicyCopyReviewArtifact.summary.md`
- `Wc01V2ProductionReadinessGateDraft.json`
- `Wc01V2ProductionReadinessGateDraft.summary.md`
- `Wc01V2ProductSurfaceProposalDraft.json`
- `Wc01V2ProductSurfaceProposalDraft.summary.md`
- `Wc01V2ArtifactChainSmoke.summary.json`
- `Wc01V2ArtifactChainSmoke.summary.md`

## Closed-Default Flag Verification

| Artifact | Outcome | Allowed next step | Production eligible | Customer-facing eligible | Explicit approval required |
|---|---|---|---:|---:|---:|
| `Wc01V2PolicyCopyReviewArtifact` | `ready_for_production_readiness_gate` | `production_readiness_gate_draft` | false | false | true |
| `Wc01V2ProductionReadinessGateDraft` | `ready_for_production_proposal_review` | `product_surface_proposal_draft` | false | false | true |
| `Wc01V2ProductSurfaceProposalDraft` | `not_approved` | n/a | false | false | true |

Additional closed-default checks:

- policy/copy sensitive-context metadata remained routing-only
- product surface proposal remained `implementationStatus: not_approved`
- product surface proposal fail-closed reasons were empty for the internal proposal example

Smoke checks passed:

- `policy_copy_production_eligible_false`
- `policy_copy_customer_facing_eligible_false`
- `policy_copy_explicit_approval_required_true`
- `policy_copy_sensitive_context_routing_metadata_only`
- `policy_copy_ready_for_readiness_gate`
- `readiness_production_eligible_false`
- `readiness_customer_facing_eligible_false`
- `readiness_explicit_approval_required_true`
- `readiness_ready_for_product_surface_proposal`
- `proposal_production_eligible_false`
- `proposal_customer_facing_eligible_false`
- `proposal_explicit_approval_required_true`
- `proposal_implementation_status_not_approved`

## Fail-Closed Behavior Observed

The smoke path used valid example inputs, so no fail-closed branch was triggered during this run.

Fail-closed behavior is covered by the report-adapter test suite for:

- missing policy/copy owner approvals
- missing safe evidence refs and display-safe excerpt refs
- missing sensitive-context categories and family context
- unresolved-ref blockers
- redaction/sanitization failures
- unsupported or malformed artifacts
- raw blocked field injection
- forbidden wording injection
- forbidden status mapping injection
- missing readiness gates and approval records
- customer-facing or high-risk product-surface proposal defaults

## Guardrail Scan Result

The generated chain smoke summary was scanned with the standard wording/raw-field guardrail pattern.

Result:

- no forbidden status mapping found in the new smoke summary
- no raw blocked field names found in the new smoke summary
- no legal-conclusion wording found in the new smoke summary

The broader README/AGENTS scan still contains pre-existing guardrail reminder lines that explicitly say not to map v2 outputs to forbidden statuses. Those are instructions, not generated artifact output.

## Import-Boundary Confirmation

The report-adapter test suite includes import-boundary tests for the internal artifact generators.

Confirmed by tests:

- policy/copy review modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders
- production-readiness gate modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders
- product surface proposal modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders

No production concern policy calls, persisted normalized concerns, unified findings, report/checklist/executive/top-finding/scoring/regulatory output, API/MCP/export output, app UI, or persistence path was introduced by the smoke.

## Explicit Non-Goals

This smoke does not approve or create:

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

## Recommendation

The internal artifact chain is stable because all closed-default checks passed.

Do not proceed to app UI, persistence, production integration, report/checklist/executive/scoring/regulatory/API/export output, or customer-facing copy from this lane.

Keep using `pnpm v2:wc01-artifact-chain-smoke` as the repeatable health check for the internal artifact chain before future contract refinements.
