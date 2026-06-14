# Regulatory Gold Corpus

The v2 regulatory gold corpus is an internal diagnostic artifact set for repeatable scanner/review confidence work. It is not a production report integration path and does not create customer-facing findings, checklist rows, report copy, scores, persisted concerns, or legal conclusions.

The current local corpus refresh is versioned under:

```text
artifacts/gold-corpus/v2-20260613-stage1
artifacts/gold-corpus/v2-20260613-stage2
artifacts/gold-corpus/v2-20260613-stage3-fixtures
```

## Guardrails

- Keep outputs artifact-only unless a separate production integration proposal is approved.
- Do not wire v2 corpus output into production report cards, checklist builders, executive summaries, scoring, or persisted normalized concerns.
- Keep artifacts display-safe: no raw cookies, raw request bodies, sensitive query values, unbounded policy text, or raw model reasoning.
- Treat sensitive-context labels as reviewer routing metadata only.
- Use these artifacts to evaluate confidence, coverage, and repeatability, not to make legal determinations.

## Stage 1: Live Scan Index

Stage 1 creates a compact, high-yield target list plus machine-readable indexes over existing and newly generated local v2 artifacts.

Current Stage 1 snapshot:

- Target URLs: 65
- Planned profile runs: 134
- Live scans attempted: 10
- Live scans succeeded: 9
- Live scans failed: 1
- Matching target artifact records indexed: 378
- Local inventory, excluding generated gold-corpus artifacts: 603 `CanonicalEvidenceBundle` files, 253 distinct URLs, 189 distinct domains
- Local profile counts: consent 169, full 233, policy 4, standard 159, tiny 38

Target diversity:

- CMP-heavy news/media: 14
- Retail/ecommerce: 13
- Health/finance/high-sensitivity adjacent: 11
- Tech/SaaS: 14
- Education/nonprofit/government-like: 11
- Weak/no-consent examples: 2

Recommended profiles:

- consent: 32 targets
- policy: 36 targets
- full: 53 targets
- standard: 10 targets
- tiny: 3 targets

Stage 1 writes:

```text
target-list.json
run-manifest.json
artifact-index.json
finding-coverage-matrix.json
confidence-distribution.json
known-good-examples.json
known-near-misses.json
README.md
run-lists/*.urls.txt
```

Refresh Stage 1 without running new scans:

```bash
pnpm tsx scripts/build-v2-regulatory-gold-corpus-stage1.ts
```

Resume bounded live scans from the generated run lists:

```bash
pnpm v2:wc01-scan-lab-cohort --urls artifacts/gold-corpus/v2-20260613-stage1/run-lists/consent.urls.txt --profile consent --resume --out-dir artifacts/gold-corpus/v2-20260613-stage1/runs/consent
pnpm v2:wc01-scan-lab-cohort --urls artifacts/gold-corpus/v2-20260613-stage1/run-lists/policy.urls.txt --profile policy --resume --out-dir artifacts/gold-corpus/v2-20260613-stage1/runs/policy
pnpm v2:wc01-scan-lab-cohort --urls artifacts/gold-corpus/v2-20260613-stage1/run-lists/full.urls.txt --profile full --capture-replay --resume --out-dir artifacts/gold-corpus/v2-20260613-stage1/runs/full
```

## Stage 2: Promotion And Gate

Stage 2 promotes lane-diverse examples from Stage 1, records near misses, and creates a regression gate baseline. It stays artifact-only and uses the Stage 1 indexes as input.

Current Stage 2 snapshot:

- Regression gate: pass
- Gate checks: 6 pass, 0 warn, 0 fail
- Coverage summary: 30 covered lanes, 0 gaps, 0 thin lanes
- Promoted examples: 59
- Candidate examples: 56
- Needs-review examples: 3
- Synthetic fixture tasks: 9 P3, 0 P1, 0 P2

Stage 2 writes:

```text
promoted-gold-examples.json
synthetic-fixture-plan.json
regression-gate-baseline.json
reviewer-queue.json
README.md
```

Build and verify Stage 2:

```bash
pnpm tsx scripts/build-v2-regulatory-gold-corpus-stage2.ts
pnpm v2:regulatory-gold-corpus-verify
```

Inventory current review-engine confidence and near-miss patterns from the promoted Stage 2 examples:

```bash
pnpm v2:regulatory-confidence-calibration
```

This recomputes review results from the referenced `CanonicalEvidenceBundle.json` artifacts and writes display-safe diagnostic summaries to:

```text
artifacts/gold-corpus/v2-20260613-stage2/calibration/regulatory-confidence-calibration.json
artifacts/gold-corpus/v2-20260613-stage2/calibration/regulatory-confidence-calibration.md
artifacts/gold-corpus/v2-20260613-stage2/calibration/regulatory-near-miss-detail.json
artifacts/gold-corpus/v2-20260613-stage2/calibration/regulatory-near-miss-detail.md
artifacts/gold-corpus/v2-20260613-stage2/calibration/near-miss-rerun-plan.json
artifacts/gold-corpus/v2-20260613-stage2/calibration/near-miss-rerun-plan.md
artifacts/gold-corpus/v2-20260613-stage2/calibration/near-miss-rerun-failures.json
artifacts/gold-corpus/v2-20260613-stage2/calibration/near-miss-rerun-failures.md
artifacts/gold-corpus/v2-20260613-stage2/calibration/run-lists/*.urls.txt
```

The near-miss detail artifact classifies missing expected lanes as `module_not_run`, `evidence_absent`, `weak_evidence`, or `likely_calibratable` using the relevant review candidates' confidence, missing corroborators, demotion reasons, and module coverage. It is intended to prevent threshold changes when the corpus indicates missing scanner coverage or absent retained evidence.

The rerun plan is bounded to the highest-priority module coverage gaps from `ccpa_cpra_do_not_sell_or_share_availability` and `reject_decline_option_availability`. It consults the Stage 1 latest-by-profile artifact index and suppresses targets once a later artifact closes the missing module coverage. Current planned reruns:

```bash
pnpm v2:wc01-scan-lab-cohort --urls artifacts/gold-corpus/v2-20260613-stage2/calibration/run-lists/policy-surface-near-miss.urls.txt --profile policy --resume --out-dir artifacts/gold-corpus/v2-20260613-stage1/runs/policy-near-miss-rerun
pnpm v2:wc01-scan-lab-cohort --urls artifacts/gold-corpus/v2-20260613-stage2/calibration/run-lists/consent-flow-near-miss.urls.txt --profile consent --resume --out-dir artifacts/gold-corpus/v2-20260613-stage1/runs/consent-near-miss-rerun
```

Residual rerun failures are recorded separately so repeated live-site module failures can become explicit diagnostic guardrails instead of threshold changes.

## Stage 3: Deterministic Fixtures

Stage 3 adds deterministic synthetic fixtures only for high-value lanes that remain hard to stabilize with live scans alone. The fixtures are bounded `CanonicalEvidenceBundle` artifacts reviewed by the actual v2 review engine.

Current fixtures:

- `post_choice_consent_controls`: expects `post_choice_consent_control_observed`
- `tracking_after_refusal`: expects `reject_action_succeeded_or_not_testable`, `tracking_after_refusal_review_signal`, `vendors_persist_after_reject_review_signal`, and `cookies_persist_after_reject_review_signal`
- `gpc_opt_out_signal_handling`: expects `gpc_disclosure_observed` and `gpc_runtime_probe_with_disclosure_observed`
- `privacy_choices_sale_share_context`: expects `do_not_sell_or_share_link_observed`
- `weak_reject_policy_link`: forbids `reject_control_observed_or_not_observed`
- `privacy_policy_cookie_notice_reference`: expects `cookie_policy_observed_or_not_observed`
- `failed_policy_surface_no_ccpa_opt_out`: forbids `do_not_sell_or_share_link_observed`
- `failed_consent_flow_no_reject_availability`: forbids `reject_control_observed_or_not_observed` and `reject_action_succeeded_or_not_testable`

Current Stage 3 result: 8 fixtures passed, 0 failed.

Build fixtures:

```bash
pnpm v2:regulatory-gold-corpus-fixtures
```

## One-Command Local Refresh

Use this command for deterministic artifact refresh and validation without live browser scanning:

```bash
pnpm v2:regulatory-gold-corpus-refresh
pnpm v2:regulatory-gold-corpus-fixtures
```

The CI workflow at `.github/workflows/v2-regulatory-gold-corpus.yml` runs the same deterministic refresh, fixture build, and focused TypeScript checks. It does not require scanner secrets or perform live scans.

## Stage 2/3 Follow-Up Gaps

The remaining work belongs in diagnostic artifacts and fixtures, not production display code:

- Finish the resumable Stage 1 live scan backlog when scan time and API budget are available.
- Convert the remaining P3 synthetic fixture plan items into deterministic fixtures as the review engine needs more targeted confidence gates.
- Keep weak/no-consent targets as negative/control examples and avoid treating them as positive regulatory findings.
- Re-run the Stage 2 gate after adding live scans or fixtures, then inspect `reviewer-queue.json` before promoting more examples.
- Add synthetic fixtures only when a lane is valuable, unstable in live scans, and representable without raw sensitive evidence.
