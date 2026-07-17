# Scan Quality Calibration & Regression Program

This is the canonical operating process for ongoing scanner-quality calibration.
It exists to turn real-site review into repeatable evidence checks rather than treating
the latest few scans as an acceptance sample.

The program is internal diagnostic infrastructure. It does not create production
findings, alter customer-facing scoring, or establish legal conclusions.

## Ownership

- **Luna owns calibration quality:** benchmark composition, lane expectations,
  evidence review, baseline changes, and regression decisions.
- **SO owns production operations:** scheduled canaries, deployment-triggered runs,
  alerting, artifact retention, and escalation when a live canary regresses.
- **WC01 remains the implementation boundary:** scanner evidence, contracts,
  normalized concerns, policy, projections, and report behavior stay in their
  existing packages and pipelines.

If Luna and SO are represented by different planning systems, this document is the
source-of-truth handoff between them: Luna approves the quality baseline and SO
executes the operational canary.

## Canonical benchmark

The canonical benchmark is the 50-site Scan Lab cohort registered in:

- `docs/certscore-v2/scan-quality-calibration-manifest.json`
- `docs/certscore-v2/calibration-urls-lab-50.txt`

The JSON manifest is authoritative for lane expectations. The URL list remains the
input format consumed by the cohort runner, and the registry check requires both files
to stay in exact agreement.

The cohort is intentionally stratified across publishers, ecommerce, SaaS,
healthcare, finance, government, global/CMP-heavy sites, behavioral analytics,
and likely no-go or headless-sensitive sites.

## Required calibration lanes

Every qualifying run must report these lanes separately:

| Lane | What must be reviewed |
| --- | --- |
| Consent controls | Retained first-layer surface, accept, reject, preferences/options, locale, and late-control evidence. |
| GDPR transparency | Policy-surface discovery, usable policy text, canonical topic extraction, and honest Not testable reasons. |
| Transport evidence | HTTPS delivery, certificate/transport observations, redirect behavior, and timeout/unknown handling. |
| Third-party attribution | First-party versus third-party classification, final-document redirects, vendors, cookies, and requests. |
| No-go resilience | Blocked, captcha, timeout, unsupported, and incomplete scans with explicit reason propagation. |
| Language inference | Best-effort primary language with evidence source and unknown fallback. |

The benchmark is a regression surface, not a set of hard-coded claims that every site
must have a banner, reject control, tracker, or GDPR topic. A site may legitimately
produce `observed`, `gap`, `not_testable`, `limited`, or `no-go`; calibration reviews
whether the status is supported by retained evidence and whether it is stable.

## Operating loop

1. Run the canonical cohort using the full profile for scanner-quality changes.
2. Verify cohort completion and retain the summary plus bounded evidence artifacts.
3. Compare the result with the last approved baseline.
4. Review every gained or lost evidence row, every status transition, and every
   material score change.
5. Classify differences as intended change, evidence improvement, evidence loss,
   runtime instability, extraction error, projection error, or unresolved review.
6. Promote a new baseline only after Luna approves the evidence review.
7. Run a smaller SO production canary after deployment and attach its result to the
   approved calibration decision.

Useful commands:

```bash
pnpm v2:calibration-registry-check
pnpm v2:wc01-scan-lab-cohort --profile full --out-dir artifacts/v2-scan-quality-calibration
pnpm v2:wc01-verify-scan-lab-cohort \
  --summary artifacts/v2-scan-quality-calibration/Wc01V2ScanLabCohort.summary.json \
  --min-sites 50
```

The scheduled workflow runs the registry check before attempting the live cohort.
The live cohort may be skipped when scanner secrets are unavailable; that is an
operational limitation and must not be reported as a passing quality result.

## Release decision rules

- A single recent scan is a bug lead, not a calibration pass.
- Three recent scans can identify a failure class, but cannot establish cohort-wide
  accuracy.
- No regression may be accepted solely because a screenshot looks correct; the
  structured evidence and projection chain must also be inspected.
- A reduction in `not_testable` is only an improvement when the newly observed status
  has valid retained evidence.
- A score increase is not automatically positive; score changes must be explainable
  from evidence and policy changes.
- Baseline labels and expected evidence must never be changed to make a failing run
  pass without a review note and owner approval.

## Current limitations and next expansion

The current registry defines lane coverage and review obligations, but does not yet
encode site-specific expected statuses. Those should be added only after a site has a
reviewed retained-evidence baseline. The initial pilot targets are registered in
`docs/certscore-v2/scan-quality-calibration-pilot-10.txt`; promote reviewed expectations
into the 50-site registry only after the pilot review.
