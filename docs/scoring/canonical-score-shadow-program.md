# Canonical score shadow program

## Current decision

The current customer headline is a versioned **GDPR/ePrivacy evidence score**, not an overall CertScore. An overall score remains withheld because CertScore does not yet have equivalent typed coverage contracts for accessibility, consumer protection, financial claims, and the other product domains.

The replacement implemented here is therefore `gdpr_eprivacy_risk_shadow`. It is internal-only and cannot become cutover-eligible while its model has `approvalStatus: pending_luna`. A disabled-by-default selector is wired across report, Pulse exports, dashboard/history, and admin consumers, but it cannot select a customer posture assessment until the exact Luna packet is approved.

## Allowed inputs

The shadow score accepts only:

1. GDPR/ePrivacy checklist rows produced by the existing WC01 concern, policy, and checklist projection.
2. Unified findings that the canonical surfacing policy already marks reportable and surfaced.
3. The explicit candidate-v3 GDPR/ePrivacy score-family registry: `consent_tracking`, `contradiction`, `rights_gap`, and `sensitive_data`.

It does not consume raw scanner signals, raw v2 review artifacts, display-only inferences, repair output, or unrelated accessibility and financial findings.

## Score semantics

- `observedRiskIndex` records supported risk even when coverage is inadequate.
- `postureScore` is withheld when coverage, registry completeness, input bounds, or model configuration fails.
- `modelEligibilityCoverageRatio` is the internal, weighted score-withholding input.
- `reportUsableEvidenceRatio` is calculated from the exact customer-report GDPR/ePrivacy row projection and is the recommended customer-facing coverage meaning, pending Luna approval.
- These metrics are deliberately not aliases. Their difference is always retained. Luna's selected report-usable customer meaning classifies the known legacy semantic divergence as an accepted migration difference; any difference not explicitly accepted for the exact model remains an unresolved contradiction and blocks cutover.
- Version 4 comparison artifacts retain both named coverage measurements, distinguish Luna-accepted migration differences from unresolved contradictions, and include a bounded model-coverage breakdown with explicit
  covered, limited, and not-applicable row IDs and their configured weights so Luna
  can review why a score was withheld without consulting raw scanner evidence.
- Finding siblings are deduplicated at the configured family boundary; the strongest supported severity contributes once per family.
- Critical caps prevent configured high-severity core findings from coexisting with a misleadingly strong posture score.
- Posture and action labels are selected from the same score bands.
- Every comparison artifact records model version, source, score kind, input fingerprint, legacy score metadata, and score delta.
- Completed scans persist an immutable shadow assessment and a separate bounded monitoring row. Monitoring rows contain score/coverage metrics, contradiction types, region, scan source, and a SHA-256 grouping key; they contain no domain name or raw evidence.

## Calibration order

1. Deterministic invariant tests.
2. Retained evidence replay with no live traffic.
3. Passive comparisons against existing production scans, with no rescans and no customer-facing writes.
4. Owned canaries.
5. A registry-selected, cooldown-aware rotating public sample after a successful central contact-history export.

The latest scans and fixed public domain lists are diagnostic inputs only, never the acceptance corpus.

## Luna decisions required

Luna must approve the corpus, customer-facing coverage meaning, family boundaries, weights, penalties, caps, coverage thresholds, posture bands, expected bands, contradiction thresholds, and final cutover. Candidate JSON files are calibration hypotheses, not approved models. Candidate-v1 adds a stricter 0.90 coverage requirement when no eligible surfaced finding anchors the result; the general risk-anchored threshold remains 0.70.

The machine-readable decision packet is `apps/web/lib/scans/gdpr-eprivacy-shadow-luna-decision.json`. A single approval flag is insufficient: the gate also requires a selected coverage meaning, governed corpus artifacts, all required expected-band lanes, model-parameter evidence, and named/date-stamped final sign-off tied to the exact model version.

Cutover remains blocked until all of the following are true:

- deterministic, retained replay, owned-canary, and governed public-sample gates pass;
- cross-region and equivalent-source variance is within Luna-approved limits;
- score drift, contradiction, and withholding metrics are reviewed;
- web, Pulse, dashboard, exports, and admin surfaces agree on score kind, version, value, posture, and coverage;
- public methodology copy is updated without making a compliance or certification claim;
- Luna changes the model approval to `approved_by_luna` and records final sign-off.

## Commands

Run a single prepared comparison:

```bash
node --import tsx apps/web/scripts/run-canonical-shadow-score.ts --input input.json --out artifact.json
```

Run a bounded passive production cohort from an environment with read-only production access:

```bash
pnpm score:shadow:production-cohort -- --input cohort.json --out artifacts/scoring/passive-production.json
```

The retained replay runner is the first calibration command and does not issue public requests.

Validate the decision packet while it is pending:

```bash
pnpm score:luna-decision-check
```

Require complete Luna approval at cutover:

```bash
pnpm score:luna-cutover-gate
```

The production selector and rollback procedure are documented in
`docs/scoring/gdpr-eprivacy-score-cutover-runbook.md`.
