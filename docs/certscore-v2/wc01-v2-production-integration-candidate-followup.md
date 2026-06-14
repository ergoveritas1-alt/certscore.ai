# WC01 v2 Production Integration Candidate Follow-Up

Internal follow-up only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Implemented the internal-only WC01 v2 production integration candidate artifact generator.

The generator reads a `Wc01V2NormalizedConcernDraftMapping` artifact and emits a `Wc01V2ProductionIntegrationCandidate` artifact plus Markdown summary. It remains artifact-only, internal-only, and non-persistent.

The generated candidate artifact does not call production concern policy, persist normalized concerns, create unified findings, create checklist/report/executive/top-finding/scoring/regulatory/API output, create UI, or create customer-facing copy.

Closed-default flags remain:

| Field | Result |
|---|---|
| `implementationStatus` | `not_approved` |
| `productionEligible` | `false` |
| `persistEligible` | `false` |
| `concernPolicyCallEligible` | `false` |
| `unifiedFindingEligible` | `false` |
| `checklistProjectionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

## Implementation Summary

Added production integration candidate support in `@certscore/report-adapter`:

- `packages/certscore-report-adapter/src/wc01-v2-production-integration-candidate.ts`
- `packages/certscore-report-adapter/src/wc01-v2-production-integration-candidate-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-production-integration-candidate.ts`
- `packages/certscore-report-adapter/src/wc01-v2-production-integration-candidate.test.ts`

Added root command:

```bash
pnpm v2:wc01-production-integration-candidate
```

The package export surface now exposes the candidate builder, parser, summary renderer, and generator helpers.

## Input Used

Source mapping artifact:

```text
artifacts/example/Wc01V2NormalizedConcernDraftMapping.json
```

The input contains two accepted fixture-only normalized-concern draft mappings:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

## Output Generated

Generated artifacts:

```text
artifacts/example/Wc01V2ProductionIntegrationCandidate.json
artifacts/example/Wc01V2ProductionIntegrationCandidate.summary.md
```

Output summary:

| Check | Result |
|---|---:|
| Candidates | 2 |
| Blocked candidates | 0 |
| `pre_consent_tracking` candidates | 1 |
| `pre_consent_cookie_storage` candidates | 1 |
| Production eligible | 0 |
| Persist eligible | 0 |
| Concern policy call eligible | 0 |
| Unified finding eligible | 0 |
| Checklist projection eligible | 0 |
| Customer-facing eligible | 0 |

## Candidate Shape

Each candidate preserves the safe draft mapping fields needed for future review:

- family
- source evidence artifact path
- proposed normalized concern draft
- proposed concern policy key
- proposed unified finding key, draft-only
- proposed checklist row key, draft-only
- evidence refs
- display-safe excerpt refs
- consent-state context
- cookie/storage context where applicable
- confidence/directness
- vendor or endpoint attribution
- purpose basis
- exclusions applied
- unresolved-ref disposition
- blocked surfaces
- approval metadata placeholder
- rollback plan

All candidates remain `not_approved` and are not eligible for production, persistence, concern policy calls, unified findings, checklist projection, or customer-facing output.

## Fail-Closed Behavior

The generator blocks candidate emission when:

- source mapping version is unsupported
- source mapping root closed-default flags are opened
- source draft has fail-closed reasons
- evidence refs are missing
- display-safe excerpt refs are missing
- consent-state context is missing
- unresolved refs affect evidence sufficiency
- sensitive-context categories are present
- cookie/storage context is missing for cookie/storage candidates
- raw blocked fields are present
- forbidden status mapping is present
- legal-conclusion wording is present

Blocked source mappings are carried forward as blocked production-integration candidates with source mapping block reasons.

## Test Results

Verification run:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-production-integration-candidate --help
pnpm v2:wc01-production-integration-candidate \
  --input ./artifacts/example/Wc01V2NormalizedConcernDraftMapping.json \
  --out ./artifacts/example/Wc01V2ProductionIntegrationCandidate.json
```

Observed results:

- report-adapter tests passed: 201/201
- report-adapter typecheck passed
- CLI help smoke passed
- example artifact generation passed

## Guardrail Scan Results

Guardrail scan passed for:

- `artifacts/example/Wc01V2ProductionIntegrationCandidate.json`
- `artifacts/example/Wc01V2ProductionIntegrationCandidate.summary.md`

No forbidden status mapping, raw blocked fields, or legal-conclusion wording were found.

## Explicit Non-Goals

This work does not approve or create:

- production integration
- app UI
- persistence
- production concern policy calls
- persisted normalized concerns
- unified findings
- checklist rows
- report rows
- executive summaries
- top findings
- scoring output
- regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Recommendation

Review whether the internal-only `Wc01V2ProductionIntegrationCandidate` artifact is sufficient as a pre-implementation review object.

Do not implement production concern policy, persisted normalized concerns, unified findings, checklist/report projection, UI, persistence, API/MCP/export output, or customer-facing output yet.
