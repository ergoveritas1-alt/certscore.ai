# Finding Corpus Builder

Offline, read-only eval tool that queries the local/dev database for recent scan results and exports a structured corpus for independent LLM review of CertScore.ai findings.

## What it does

1. Queries recent completed scans from the local PostgreSQL database (read-only).
2. Rebuilds unified findings and executive projections using the **exact same production logic** (`buildScanReportUnifiedFindings`, `projectExecutiveFindingsFromUnifiedPackets`).
3. Selects:
   - **Positive examples**: surfaced findings with strong, direct evidence from clean scans.
   - **Challenge examples**: suppressed, downgraded, review-only, or weak-evidence findings useful for false-positive detection.
4. Exports structured JSON files, a corpus index, CSV/MD summaries, a JSONL review input, and a Kimi review prompt.

## Safety constraints

- **Read-only DB access only** — uses `getReadPool()` via `{ readOnly: true }`.
- **No writes** to production tables.
- **No LLM calls** in the scan path.
- **Does not modify** production logic, thresholds, scoring, concern policies, or unified finding generation.

## Prerequisites

- Local PostgreSQL running with scan data (e.g. from `pnpm dev:storage:local` or a dev dump).
- `apps/web/.env.local` configured with `DATABASE_URL`.

## Run

```bash
# Default: last 30 days, top 10 findings, 5 positive + 5 challenge each
pnpm eval:build-finding-corpus

# Custom options
pnpm eval:build-finding-corpus --since 2024-01-01 --limit-scans 200 --top-n-findings 15 --positive-per-finding 3 --challenge-per-finding 3 --out-dir ./my-corpus --dry-run

# Filter to a specific finding
pnpm eval:build-finding-corpus --finding-id pre_consent_tracking_detected

# Inspect coverage-edge findings after export
pnpm eval:inspect-coverage-edge-corpus -- artifacts/eval/finding-corpus/2026-04-29
```

### CLI options

| Flag | Default | Description |
|---|---|---|
| `--since` | 30 days ago | ISO date string for earliest scan |
| `--limit-scans` | 500 | Max scans to evaluate |
| `--top-n-findings` | 10 | Number of top findings to export |
| `--positive-per-finding` | 5 | Max positive examples per finding |
| `--challenge-per-finding` | 5 | Max challenge examples per finding |
| `--finding-id` | — | Restrict to one finding ID |
| `--out-dir` | `artifacts/eval/finding-corpus/YYYY-MM-DD` | Output directory |
| `--dry-run` | false | Compute selections but do not write files |
| `--no-include-suppressed` | — | Exclude suppressed from challenge set |
| `--no-include-mixed` | — | Exclude audit_only/review from challenge set |
| `--include-anonymous-scans` | false | Include local/dev full scans without `organization_id`; use only for local eval refreshes |

## Output structure

```
artifacts/eval/finding-corpus/2024-01-15/
├── corpus_index.json
├── top_10_findings.csv
├── top_10_findings.md
├── corpus_summary.md
├── kimi_review_input.jsonl
├── kimi_review_prompt.md
└── findings/
    └── <finding_id>/
        ├── positive/
        │   ├── 1.json
        │   └── ...
        └── challenge/
            ├── 1.json
            └── ...
```

## Sending to Kimi for review

1. Open `kimi_review_prompt.md` — this is the reusable system prompt.
2. Open `kimi_review_input.jsonl` — one compact JSON object per line.
3. Paste the prompt into Kimi Think Mode, then attach or paste the JSONL content.
4. Kimi returns structured JSON classifications for each example.

## Tests

```bash
node --import tsx --test apps/web/scripts/eval/build-finding-corpus.test.ts
```

Tests use fixtures only — no live DB required.

## Coverage-edge inspection

After generating a corpus, run `pnpm eval:inspect-coverage-edge-corpus -- <out-dir>` to verify that coverage-edge challenge examples for:

- `cookie_disclosure_gap`
- `pre_consent_tracking_detected`
- `rtb_cookie_sync_observed`
- `simulated_performance_without_disclosure`
- `unqualified_superlative_claim_detected`

have explicit `coverage_limitation_evidence` when strong challenge examples lack snippets. The script exits non-zero when any strong zero-snippet challenge remains unexplained.
