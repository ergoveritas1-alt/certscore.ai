# WC01 v2 Normalized Concern Draft Mapping Follow-Up

Internal follow-up only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Implemented the fixture-only WC01 v2 normalized-concern draft mapping stage for two non-sensitive families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The mapper tests whether reviewed v2 evidence can fit a future WC01 normalized concern draft shape without creating persisted concerns, production concern policy calls, unified findings, report rows, checklist rows, executive rows, scoring output, regulatory output, API/MCP/export output, UI, persistence, or customer-facing copy.

The output remains closed by default:

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

Added fixture-only mapping support in `@certscore/report-adapter`:

- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-draft-mapping.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-draft-mapping-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-normalized-concern-draft-mapping.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-draft-mapping.test.ts`

Added root command:

```bash
pnpm v2:wc01-normalized-concern-draft-map
```

The package export surface now exposes the mapping builder, parser, summary renderer, and generator helpers.

## Fixture Inputs Used

Added fixture input:

```text
docs/certscore-v2/examples/Wc01V2NormalizedConcernDraftMappingInput.example.json
```

The fixture contains one candidate for each in-scope family:

| Family | Fixture posture |
|---|---|
| `pre_consent_tracking` | Runtime request before consent, high-confidence vendor attribution, source refs, display-safe excerpt refs, consent-state context, confidence/directness, and purpose exclusions. |
| `pre_consent_cookie_storage` | Third-party cookie write before consent, storage context, high-confidence endpoint attribution, source refs, display-safe excerpt refs, consent-state context, confidence/directness, and purpose exclusions. |

## Output Examples

Generated example artifacts:

```text
artifacts/example/Wc01V2NormalizedConcernDraftMapping.json
artifacts/example/Wc01V2NormalizedConcernDraftMapping.summary.md
```

Example output summary:

| Check | Result |
|---|---:|
| Draft mappings | 2 |
| Blocked mappings | 0 |
| `pre_consent_tracking` drafts | 1 |
| `pre_consent_cookie_storage` drafts | 1 |
| Production eligible | 0 |
| Persist eligible | 0 |
| Concern policy call eligible | 0 |
| Unified finding eligible | 0 |
| Checklist projection eligible | 0 |
| Customer-facing eligible | 0 |

## Mapping Decisions

### `pre_consent_tracking`

Maps to a draft-only proposed concern type:

```text
v2_pre_consent_tracking_normalized_concern_draft
```

Proposed draft policy key:

```text
v2.pre_consent_tracking.reviewed_non_sensitive
```

Required fixture evidence:

- observed runtime request or equivalent runtime evidence before consent action
- consent-state context
- vendor or high-confidence endpoint attribution
- source refs
- display-safe excerpt refs
- confidence/directness
- exclusions for tag-management-only, consent-management-only, diagnostic-only purpose support, inventory-only context, policy/runtime alignment-only context, consent-flow delta-only context, and library-only evidence

### `pre_consent_cookie_storage`

Maps to a draft-only proposed concern type:

```text
v2_pre_consent_cookie_storage_normalized_concern_draft
```

Proposed draft policy key:

```text
v2.pre_consent_cookie_storage.reviewed_non_sensitive
```

Required fixture evidence:

- observed cookie/storage write before consent action
- third-party storage context
- consent-state context
- vendor or high-confidence endpoint attribution
- source refs
- display-safe excerpt refs
- confidence/directness
- purpose exclusions
- no unsafe storage content

## Fail-Closed Behavior

The mapper blocks draft emission when any required condition is missing or unsafe.

Fail-closed cases covered by tests include:

- unsupported source family
- missing evidence refs
- missing display-safe excerpt refs
- missing consent-state context
- missing or weak confidence/directness
- unresolved refs that affect evidence sufficiency
- sensitive-context categories present
- diagnostic-only purpose as support
- tag-management-only support
- consent-management-only support
- unsafe storage content
- target output attempts production, persistence, concern policy call, unified finding, checklist projection, or customer-facing eligibility
- raw blocked fields
- forbidden status mapping
- legal-conclusion wording

## Test Results

Verification run:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-normalized-concern-draft-map --help
pnpm v2:wc01-normalized-concern-draft-map \
  --input ./docs/certscore-v2/examples/Wc01V2NormalizedConcernDraftMappingInput.example.json \
  --out ./artifacts/example/Wc01V2NormalizedConcernDraftMapping.json
```

Observed results:

- report-adapter tests passed: 192/192
- report-adapter typecheck passed
- CLI help smoke passed
- example artifact generation passed

## Guardrail Scan Results

Guardrail scan passed for:

- `docs/certscore-v2/examples/Wc01V2NormalizedConcernDraftMappingInput.example.json`
- `artifacts/example/Wc01V2NormalizedConcernDraftMapping.json`
- `artifacts/example/Wc01V2NormalizedConcernDraftMapping.summary.md`

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

Review whether the draft mapping shape is sufficient for the two non-sensitive families.

Do not implement production concern policy, persisted normalized concerns, unified findings, checklist/report projection, UI, persistence, or customer-facing output yet.
