# V2 Gold Corpus Expansion 50

This is an internal v2 diagnostic expansion plan. It writes local artifacts only and does not create production report output, checklist rows, scoring, persisted concerns, unified findings, or customer-facing copy.

The 50 candidates are split into two 25-site waves. Treat them as qualification targets first; a site becomes gold-corpus coverage only after capture, replay evidence generation, and quality review.

## Summary

- Total candidates: 50
- Wave 1: 25
- Wave 2: 25

Bucket counts:

- complex_reject_flow: 13
- gpc_behavior: 6
- no_banner_control: 6
- privacy_opt_out_dnsmpi: 15
- sensitive_context_privacy: 10

## Run Order

Start with quick qualification, then run full replay capture for the entries that complete cleanly or are intentionally useful no-go controls.

```bash
pnpm v2:wc01-scan-lab-cohort --urls docs/certscore-v2/gold-corpus-expansion-50/wave-1.urls.txt --profile standard --resume --out-dir artifacts/v2-gold-expansion-wave-1-qualify
pnpm v2:wc01-scan-lab-cohort --urls docs/certscore-v2/gold-corpus-expansion-50/wave-1.urls.txt --profile full --capture-replay --consent-dag --resume --out-dir artifacts/v2-gold-expansion-wave-1-full

pnpm v2:wc01-scan-lab-cohort --urls docs/certscore-v2/gold-corpus-expansion-50/wave-2.urls.txt --profile standard --resume --out-dir artifacts/v2-gold-expansion-wave-2-qualify
pnpm v2:wc01-scan-lab-cohort --urls docs/certscore-v2/gold-corpus-expansion-50/wave-2.urls.txt --profile full --capture-replay --consent-dag --resume --out-dir artifacts/v2-gold-expansion-wave-2-full
```

Use `--resume` for interrupted runs. The cohort runner preserves seeded privacy-control URLs from these JSONL lines.

## Acceptance Checks

- Compare `legacy_sequential` and `planned_parallel` where applicable before promoting any site into default gates.
- Confirm no new production-facing outputs are created.
- Review not-testable and not-observed changes separately from true regressions.
- Promote only entries that add marginal lane, sector, CMP, GPC, privacy-control, no-banner, or sensitive-context value.

