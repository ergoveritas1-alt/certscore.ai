# ADA Accessibility Operations

`WC01` surfaces DOJ / ADA accessibility findings only after scanner evidence has produced representative axe examples. The expected flow is:

1. The WC01 v2 DAG Lambda scanner runs axe-core during evidence collection.
2. The v2 DAG pipeline persists representative axe examples into `scan_accessibility_rule_examples`.
3. `WC01` loads those rows as `accessibilityRuleExamples`.
4. `WC01` normalizes the examples into accessibility concerns.
5. Concern policy promotes only representative, example-backed concerns into unified findings.

Broad score-only or count-only accessibility signals should remain audit-only. If the executive summary shows DOJ / ADA accessibility as `Audit-only` with `—`, first confirm whether `scan_accessibility_rule_examples` contains rows for that scan.

## When ADA Is Unexpectedly Audit-Only

Use this order:

1. In `WC01`, check the scan ID:

   ```bash
   ADA_SCAN_ID=<scan-id> pnpm ops:smoke:ada-financial
   ```

2. If `scan_accessibility_rule_examples` is empty, inspect the v2 DAG Lambda phase and artifact manifests for:

   - axe-core startup/execution
   - page-level accessibility audit completion
   - persistence errors writing `scan_accessibility_rule_examples`

3. If examples exist but the report is still audit-only, check the `WC01` report page with:

   ```bash
   ADA_SCAN_ID=<scan-id> ADA_SCAN_URL=https://certscore.ai/scan/<scan-id> pnpm ops:smoke:ada-financial
   ```

4. If `WC01` receives examples but does not surface a finding, inspect:

   - `apps/web/lib/scans/accessibility-evidence.ts`
   - `apps/web/lib/scans/concern-policy.ts`
   - `apps/web/lib/scans/unified-findings.ts`
   - `apps/web/lib/scans/report-surfacing-policy.ts`

Keep new ADA surfacing logic in the normalized concern flow:

1. normalize scanner inputs into a concern
2. apply concern policy
3. promote eligible concerns into unified findings

Do not add raw count/score-only report exceptions for ADA findings.

## Production Smoke Pairing

The preferred one-shot production check is the manual `ADA Live Verification`
GitHub Actions workflow. It implements the operator sequence:

1. queue a fresh ADA-sensitive scan through the v2 DAG Lambda path, unless `ada_scan_id` and `ada_scan_url` are provided
2. confirm `scan_accessibility_rule_examples` has representative axe examples
3. confirm the WC01 report renders DOJ / ADA from those examples
4. optionally confirm Financial & commercial claims remains `Audit-only`

Required repository configuration for live ADA verification:

- secret `PROD_DATABASE_URL` or `DATABASE_URL`
- variable `AWS_WEB_CERTSCORE_BASE_URL`, or the workflow default `https://certscore.ai`

The same verification can be run locally:

```bash
set -a
source apps/web/.env.local
set +a

ADA_SCAN_DOMAIN=w3.org \
FINANCIAL_EMPTY_SCAN_URL=https://certscore.ai/scan/<editorial-finance-scan-id> \
pnpm ops:verify:ada-live
```

To verify an existing scan instead of queueing a fresh one:

```bash
ADA_SCAN_ID=<ada-scan-id> \
ADA_SCAN_URL=https://certscore.ai/scan/<ada-scan-id> \
FINANCIAL_EMPTY_SCAN_URL=https://certscore.ai/scan/<editorial-finance-scan-id> \
pnpm ops:verify:ada-live
```

After accessibility or financial-claims surfacing changes, run:

```bash
SESSION_REPLAY_SCAN_URL=https://certscore.ai/scan/<clarity-scan-id> \
FINANCIAL_EMPTY_SCAN_URL=https://certscore.ai/scan/<editorial-finance-scan-id> \
pnpm ops:smoke:findings
```

Then run the ADA-specific check with a scan known to have persisted axe examples:

```bash
ADA_SCAN_ID=<ada-scan-id> \
ADA_SCAN_URL=https://certscore.ai/scan/<ada-scan-id> \
FINANCIAL_EMPTY_SCAN_URL=https://certscore.ai/scan/<editorial-finance-scan-id> \
pnpm ops:smoke:ada-financial
```
