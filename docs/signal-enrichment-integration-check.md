# Signal Enrichment Integration Check

## Purpose

Use this check after queueing a real scan to verify that the scanner, nano document retrieval, nano document signals, merged signals, and unified-finding stages all completed with the expected stored artifacts.

## Command

From the validation worker package:

```bash
pnpm inspect:signal-enrichment --scan-id <scan-id>
```

JSON output is also available:

```bash
pnpm inspect:signal-enrichment --scan-id <scan-id> --json
```

## What To Look For

### Workflow

- `actualMode` should usually be `parallelized`
- `nano_doc_retrieval` should be `completed`
- `nano_doc_signals` should be `completed`
- `signal_merge` should be `completed`
- `unified_findings` should be `completed`

### Counts

- `documentSources > 0` for policy-heavy sites
- `nanoSignals > 0` when document semantics were extracted
- `totalSignals >= scannerSignals`
- `findings > 0` only when the scan actually surfaced actionable output

### Document sources

- `documentSourcesByType` should include expected legal docs such as `privacy_policy`, `terms_of_service`, or `cookie_policy`
- `documentSourcesByExtractionStatus` should show `ready` for rows that were semantically extracted
- many `pending`, `failed`, or `insufficient` rows indicate retrieval or extraction quality issues

### Event counts

Expected stage events:

- `signals.nano_doc_retrieval_started`
- `signals.nano_doc_retrieval_completed`
- `signals.nano_doc_enrichment_started`
- `signals.nano_doc_enrichment_completed`
- `signals.merge_started`
- `signals.merge_completed`
- `findings.unified_derivation_started`
- `findings.unified_derivation_completed`

## Follow-up Queries

If the inspector shows something suspicious:

1. Check `scan_document_sources` for the scan to review raw retrieval coverage and extraction statuses.
2. Check `scan_signals` for `population_source = 'nano'` to confirm semantic signals were persisted.
3. Open the scan detail page and confirm merged signals are reflected in surfaced findings.
4. If `actualMode` is `serial_bridge`, inspect event timestamps to see whether nano began only after scanner completion.

## Current Limits

- This check validates persisted state, not model quality.
- It does not verify that every surfaced finding is semantically correct.
- It is best used together with a manual spot check of one privacy-heavy scan and one simpler brochureware scan.
