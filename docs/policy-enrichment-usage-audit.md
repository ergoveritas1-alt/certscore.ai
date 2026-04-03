# Policy Enrichment Usage Audit

## Purpose

This document records the remaining `policy_enrichment` reads after the merged-signal and document-source refactor.

The target architecture is:

1. `WS01` and nano populate source-aware signals
2. canonical reads merge those signals
3. concerns and unified findings derive from merged signals
4. raw `policy_enrichment` rows remain only for evidence attribution, snippets, URLs, and admin/debug context

## Status Buckets

### Keep: evidence-only or admin/debug

These usages are acceptable because they do not treat `policy_enrichment` as the primary semantic truth source.

- `apps/web/server/scans/get-scan-by-id.ts`
  - Loads raw policy rows for scan detail evidence, snippets, and fallback display data.
- `apps/web/server/admin/get-admin-scan-detail.ts`
  - Admin detail/debug read path.
- `apps/web/server/admin/policy-review-queue.ts`
  - Queue/admin linkage by `policy_enrichment_id`.
- `apps/web/server/validation/repository.ts`
  - Supplemental review queue loading and queue-item lookup by `policy_enrichment_id`.
- `apps/web/components/scans/shared-scan-detail-view.tsx`
  - Uses policy rows for snippets, URLs, verified insight display, and queue linking.
- `apps/web/lib/scans/signal-fallback-evidence.ts`
  - Explicit raw-row fallback adapter for evidence repair.
- `apps/web/server/scans/family-packet-event-repair.ts`
  - Explicit event repair path using evidence rows.
- `apps/web/server/history/get-domain-scan-history.ts`
  - Historical/admin-style display context.
- `apps/web/server/admin/list-admin-scans.ts`
  - Admin list display context.

### Transitional: acceptable for now, rename later

These paths are semantically aligned with the new architecture, but still carry old names such as `policy_enrichment_signal` or `policyEnrichments`.

- `packages/shared/src/taxonomy/report-pillars.ts`
  - Finding mappings still use `policy_enrichment_signal` as the policy/document semantic source label.
- `apps/web/lib/scans/nano-policy-signals.ts`
  - Produces canonical nano-backed policy/document signals, but still emits `report_signal_source: "policy_enrichment_signal"` and `policy_enrichment.*` provenance labels.
- `apps/web/lib/scans/normalized-concerns.ts`
  - `originType: "policy_enrichment"` still represents policy/document semantic origin.
- `apps/web/lib/scans/finding-evidence-gates.ts`
  - Signal-source gating still uses `policy_enrichment_signal`.
- `apps/web/lib/scans/unified-findings.ts`
  - Family packet assembly still branches on `policy_enrichment_signal`.
- `apps/web/lib/scans/unified-finding-support-analysis.ts`
  - Support analysis still names the policy/document source bucket `policy_enrichment_signal`.

### Remove or narrow: semantic debt

These usages still read raw `policy_enrichment` semantics in places that should converge on document-source or merged-signal inputs.

- `apps/validation-worker/src/validation/pipeline.ts`
  - Still carries `policyEnrichments` as a broad input name.
  - Review-queue linking still resolves queue items through raw `policy_enrichment_id` maps.
  - Cookie-policy selection still reads `page_type/pageType` directly from `policyEnrichments`.
- `apps/validation-worker/src/validation/repository.ts`
  - Nano signal enrichment still loads `policy_enrichment` as fallback when document sources are absent.
  - `policyEnrichments` remains a mixed-purpose field name in returned artifact bundles.
- `apps/web/scripts/scan-batch-eval.ts`
  - Still reconstructs evaluation input from raw `policy_enrichment`; should be aligned with document-source-aware semantics like the validation worker backfill path.

## Current Conclusion

The repo is no longer using raw `policy_enrichment` as the primary semantic source in the main scanner + nano + merged-signal pipeline.

The remaining work is mostly:

1. naming cleanup for policy/document semantic sources
2. narrowing worker fallback semantics
3. keeping raw policy rows isolated to evidence and admin/debug paths

## Next Recommended Actions

1. Rename the semantic source label from `policy_enrichment_signal` to a neutral source family such as `document_semantic_signal` without changing finding behavior.
2. Introduce a worker-side alias like `policySemanticInputs` everywhere that `policyEnrichments` still means “semantic policy/document rows”.
3. Update `apps/web/scripts/scan-batch-eval.ts` to prefer document sources when present.
4. Keep `policy_enrichment_id` linkage only where queue/admin workflows require stable row attribution.
