# Accessibility Scan WS01 Handoff

## Overview

WC01 now contains a complete axe-core + Playwright accessibility scanning module. Since the scanner runtime lives in WS01, the scan execution code should be copied/moved there. WC01 retains the scoring, benchmarks, normalization, and UI pipeline.

## Files to copy to WS01

### Core scan module
- `apps/validation-worker/src/accessibility/run-accessibility-scan.ts`
  - Main entry point: `runAccessibilityScan({ page, url, scanId, options })`
  - Uses `@axe-core/playwright` with WCAG 2 A/AA tags
  - Falls back to injected axe-core if `@axe-core/playwright` is unavailable
  - Never throws; returns `scanError` on failure

- `apps/validation-worker/src/accessibility/normalize-axe-violations.ts`
  - Converts axe violations into CertScore finding format
  - Safe evidence summaries only (no raw HTML, selectors, or personal data)
  - Includes remediation templates for common issues

### Shared dependencies (import from `@website-signal-risk-scanner/shared`)

WS01 should import these from the shared package rather than copying:

- `packages/shared/src/accessibility/axe-rule-mapping.ts`
- `packages/shared/src/accessibility/severity-mapping.ts`
- `packages/shared/src/accessibility/accessibility-score.ts`
- `packages/shared/src/accessibility/accessibility-benchmarks.ts`
- `packages/shared/src/types/accessibility.ts`

## Expected output format

WS01 should produce an `AccessibilityScanResult` and serialize it into the scan snapshot:

```typescript
type AccessibilityScanResult = {
  scanId: string;
  pageUrl: string;
  findings: NormalizedAccessibilityFinding[];
  metrics: AccessibilityAggregateMetrics;
  score: AccessibilityScoreResult;
  benchmarkLabel: AccessibilityBenchmarkLabel;
  scanError?: { message: string; stage: string };
};
```

### Snapshot fields to populate

Add these fields to the scan snapshot JSON sent to WC01:

```typescript
interface ScanSnapshot {
  // ... existing fields ...
  accessibilityScoreAutomated: number;        // metrics.accessibilityScore
  accessibilityBenchmarkLabel?: string;        // benchmarkLabel
  wcagErrorCountTotal: number;                // metrics.totalViolationCount
  wcagMissingAltCount: number;                // count of image-alt findings
  wcagContrastFailuresCount: number;          // count of color-contrast findings
  wcagFormLabelErrorCount: number;            // count of label findings
  wcagAriaErrorCount: number;                 // count of aria-* findings
  wcagKeyboardNavigationIssueCount: number;   // count of keyboard-related findings
  wcagLinkNameErrorCount: number;             // count of link-name findings
  wcagHeadingStructureErrorCount: number;     // count of heading-related findings
  wcagLandmarkIssueCount: number;             // count of landmark findings
  wcagFocusIndicatorIssueCount: number;       // count of focus-related findings
}
```

### Backward-compatible table (optional)

WS01 can also write to `scan_accessibility_rule_examples` (migration 0043) for immediate compatibility with WC01's existing pipeline:

```sql
insert into scan_accessibility_rule_examples (
  scan_id, organization_id, domain_id, page_url,
  rule_code, rule_group, severity, impact,
  help, help_url, description, node_count,
  representative_selectors
) values (...)
```

## WC01 pipeline flow

After WS01 sends the snapshot, WC01 processes accessibility data through:

1. `scan_snapshots` → snapshot fields (score, counts)
2. `scan_accessibility_rule_examples` → normalized concerns (existing flow)
3. `accessibility_scan_summary` + `accessibility_findings` (new tables, optional richer storage)
4. `normalized-concerns.ts` → `concern-policy.ts` → `unified-findings.ts`
5. `executive-summary-card.tsx` → DOJ / ADA accessibility lens

## Dependency

WS01 needs `@axe-core/playwright` installed alongside `playwright`:

```json
{
  "dependencies": {
    "@axe-core/playwright": "^4.10.1",
    "playwright": "^1.51.1"
  }
}
```

## Testing

Use the integration test in WC01 as a reference:
- `apps/validation-worker/src/accessibility/run-accessibility-scan.integration.test.ts`

It launches Chromium against static HTML fixtures and asserts real axe-core output.
