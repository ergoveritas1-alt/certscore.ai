# Canonical score shadow program

## Current decision

The current customer headline is a versioned **GDPR/ePrivacy evidence score**, not an overall CertScore. An overall score remains withheld because CertScore does not yet have equivalent typed coverage contracts for accessibility, consumer protection, financial claims, and the other product domains.

The replacement implemented here is therefore `gdpr_eprivacy_risk_shadow`. It is internal-only and cannot become cutover-eligible while its model has `approvalStatus: pending_luna`.

## Allowed inputs

The shadow score accepts only:

1. GDPR/ePrivacy checklist rows produced by the existing WC01 concern, policy, and checklist projection.
2. Unified findings that the canonical surfacing policy already marks reportable and surfaced.
3. The explicit GDPR/ePrivacy score-family registry: `consent_tracking`, `contradiction`, `policy_extraction`, and `rights_gap`.

It does not consume raw scanner signals, raw v2 review artifacts, display-only inferences, repair output, or unrelated accessibility and financial findings.

## Score semantics

- `observedRiskIndex` records supported risk even when coverage is inadequate.
- `postureScore` is withheld when coverage, registry completeness, input bounds, or model configuration fails.
- `coverageRatio` and `coverageConfidence` remain separate from risk.
- Version 2 comparison artifacts retain a bounded coverage breakdown with explicit
  covered, limited, and not-applicable row IDs and their configured weights so Luna
  can review why a score was withheld without consulting raw scanner evidence.
- Finding siblings are deduplicated at the configured family boundary; the strongest supported severity contributes once per family.
- Critical caps prevent configured high-severity core findings from coexisting with a misleadingly strong posture score.
- Posture and action labels are selected from the same score bands.
- Every comparison artifact records model version, source, score kind, input fingerprint, legacy score metadata, and score delta.

## Calibration order

1. Deterministic invariant tests.
2. Retained evidence replay with no live traffic.
3. Passive comparisons against existing production scans, with no rescans and no customer-facing writes.
4. Owned canaries.
5. A registry-selected, cooldown-aware rotating public sample after a successful central contact-history export.

The latest scans and fixed public domain lists are diagnostic inputs only, never the acceptance corpus.

## Luna decisions required

Luna must approve the corpus, family boundaries, weights, penalties, caps, coverage thresholds, posture bands, expected bands, contradiction thresholds, and final cutover. Candidate JSON files are calibration hypotheses, not approved models. Candidate-v1 adds a stricter 0.90 coverage requirement when no eligible surfaced finding anchors the result; the general risk-anchored threshold remains 0.70.

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
