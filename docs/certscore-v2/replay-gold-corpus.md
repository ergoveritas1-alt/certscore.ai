# Replay Gold Corpus

The replay gold corpus is an internal v2 artifact-only workflow for deciding whether a local replay corpus covers the consent, policy, and regulatory calibration lanes needed for scanner tuning.

It does not create production findings, customer-facing report copy, checklist rows, scores, or persisted concerns.

## Workflow

1. Capture a replay corpus:

```bash
pnpm v2:wc01-scan-lab-cohort \
  --urls artifacts/v2-gold-corpus/urls.txt \
  --profile full \
  --capture-replay \
  --out-dir artifacts/v2-gold-corpus/capture
```

2. Validate HAR replay:

```bash
pnpm v2:replay \
  --corpus artifacts/v2-gold-corpus/capture \
  --mode validate \
  --out artifacts/v2-gold-corpus/validation
```

3. Generate evidence replay:

```bash
pnpm v2:replay \
  --corpus artifacts/v2-gold-corpus/capture \
  --mode evidence \
  --out artifacts/v2-gold-corpus/evidence
```

4. Verify lane balance:

```bash
pnpm v2:replay-gold-coverage \
  --evidence-report artifacts/v2-gold-corpus/evidence/ReplayEvidenceReport.json \
  --out artifacts/v2-gold-corpus/gold-coverage
```

Use `--fail-on-gap` in CI-like gates when the corpus is expected to be complete.

## Required Lanes

The verifier checks these lanes:

- CMP accept/reject proof
- Post-reject tracking comparison
- Post-accept behavior
- GPC context
- Privacy opt-out / do-not-sell behavior
- Form collection probe
- Consent/privacy accessibility probe
- Policy-surface merge
- No-go / non-representative page

The default threshold is three sites per lane, except no-go/non-representative, which requires one site. Use `--minimum-sites-per-lane <n>` for smaller local smoke runs.

## Interpreting Results

Gatech currently covers several GDPR/post-consent tuning lanes, but it is not a complete gold corpus by itself because it does not retain an actionable privacy opt-out surface.

A dependable corpus should be lane-balanced across multiple sites. A broad 100-site cohort is useful for regression breadth, but the gold corpus should be curated so every required lane has representative fixture sites.

## 50-Site Expansion Waves

The curated +50 expansion is defined in:

```text
docs/certscore-v2/gold-corpus-expansion-50.jsonl
docs/certscore-v2/gold-corpus-expansion-50/
```

The JSONL manifest is the source of truth. Each row includes the wave, URL, primary coverage bucket, sector, expected lanes, optional seeded privacy-control URLs, and a short review note. The generated `*.urls.txt` files are JSONL too, so they can be passed directly to `pnpm v2:wc01-scan-lab-cohort` while preserving seed URLs.

Regenerate and validate the two waves:

```bash
pnpm v2:gold-corpus-expansion-waves
```

Run wave 1 first:

```bash
pnpm v2:wc01-scan-lab-cohort \
  --urls docs/certscore-v2/gold-corpus-expansion-50/wave-1.urls.txt \
  --profile standard \
  --resume \
  --out-dir artifacts/v2-gold-expansion-wave-1-qualify

pnpm v2:wc01-scan-lab-cohort \
  --urls docs/certscore-v2/gold-corpus-expansion-50/wave-1.urls.txt \
  --profile full \
  --capture-replay \
  --resume \
  --out-dir artifacts/v2-gold-expansion-wave-1-full
```

Run wave 2 after reviewing wave 1 outcomes:

```bash
pnpm v2:wc01-scan-lab-cohort \
  --urls docs/certscore-v2/gold-corpus-expansion-50/wave-2.urls.txt \
  --profile standard \
  --resume \
  --out-dir artifacts/v2-gold-expansion-wave-2-qualify

pnpm v2:wc01-scan-lab-cohort \
  --urls docs/certscore-v2/gold-corpus-expansion-50/wave-2.urls.txt \
  --profile full \
  --capture-replay \
  --resume \
  --out-dir artifacts/v2-gold-expansion-wave-2-full
```

After each full-capture wave, generate replay evidence and run the quality check:

```bash
pnpm v2:replay \
  --corpus artifacts/v2-gold-expansion-wave-1-full \
  --mode evidence \
  --out artifacts/v2-gold-expansion-wave-1-evidence

pnpm v2:replay-gold-quality \
  --evidence-report artifacts/v2-gold-expansion-wave-1-evidence/ReplayEvidenceReport.json \
  --baseline artifacts/v2-gold-merged-evidence-20260612T-v7/ReplayEvidenceReport.json \
  --out artifacts/v2-gold-expansion-wave-1-quality
```

Repeat the evidence/quality commands for wave 2 after capture. Promote a target only when it adds marginal coverage value and does not increase ambiguity. No wave output should be wired into production reports, checklist rows, scoring, persisted concerns, or customer-facing copy.
