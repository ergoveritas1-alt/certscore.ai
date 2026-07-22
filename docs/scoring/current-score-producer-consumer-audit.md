# Current score producer and consumer audit

Status: active remediation, 2026-07-21. The customer-facing replacement remains pending Luna calibration approval.

## Decision

CertScore does not currently support a defensible cross-domain overall score. The customer headline is therefore a `GDPR/ePrivacy evidence` score when a versioned evidence assessment exists. Older snapshot values retain their historical meaning and are labeled `Legacy scan score`; they are not relabeled as GDPR/ePrivacy evidence.

Risk and coverage are separate. Coverage can withhold a risk score, but missing evidence must not be converted into observed risk. Accessibility, consumer-protection, financial-promotion, transport/security, California, and GDPR/ePrivacy results remain separate domains unless Luna approves a calibrated overall model.

## Producers

| Producer | Meaning | Current disposition |
| --- | --- | --- |
| `deriveRegulatoryCoverageScore` | Legacy GDPR/ePrivacy evidence-checklist score | Customer/Pulse legacy model. Explicit source/version and coverage metadata. Persisted once after production status confirms both scan completion and canonical report readiness, or during browser-scan completion. Replacement candidate remains shadow-only. |
| Canonical shadow scorer | Candidate GDPR/ePrivacy observed-risk posture plus coverage | Internal only, versioned, bounded, and persisted as immutable assessment/monitoring metrics while pending Luna. Consumes projected findings/checklist rows only. |
| Local v2 DAG snapshot heuristic | Raw pre-consent request/cookie heuristic stored in `scan_snapshots` | Legacy compatibility field only. Must not be presented as the versioned GDPR/ePrivacy score and must not become a cutover input. |
| Browser-extension snapshot heuristic | Raw browser signal heuristic stored in `scan_snapshots` | Legacy compatibility field only. Same restriction as the Lambda snapshot heuristic. |
| Preview snapshot SQL and preview payload | Historical preview score family | Legacy preview behavior. Keep isolated from full-scan canonical scoring and label as preview/legacy where shown. |
| Regulatory risk assessment and section scores | Domain-specific review context | Not an overall score. Preserve as separately named internal/domain metrics. |
| Removed executive display formula | Display-only blend of stored score, consent/privacy subscores, and financial findings | Deleted. It had no active caller but violated the canonical pipeline and could have recreated an unversioned overall score. |
| Removed presentation-summary score/posture | Snapshot-derived score bands in a metrics-only helper | Deleted. No caller consumed the fields, and keeping them would have left a latent second posture engine. |

## Consumers

| Surface | Required source and label |
| --- | --- |
| Full report | GDPR/ePrivacy evidence score derived from canonical checklist projection; explicit coverage/source/version metadata; no write during render. |
| Pulse | Same GDPR/ePrivacy evidence assessment and metadata as the report. No snapshot substitution when the evidence score is withheld. |
| Customer dashboard and scan history | Latest immutable versioned assessment when available. Label `GDPR/ePrivacy evidence`; otherwise label historical snapshot values `Legacy scan score`. |
| Admin scan list | Same precedence as customer dashboard, with source/version/coverage available for inspection. |
| Admin summary | Report/Pulse projection first, snapshot fallback only as explicitly legacy. Read/materialization must never update canonical score fields. |
| Exports | Must carry score kind, source, version, scored time, coverage ratio/confidence, status, and withholding reason with any numeric score. |

## Historical storage contract

`scan_score_assessments` is immutable by `(scan_id, score_kind, score_version)`. It stores the score separately from coverage, source, version, scoring time, surfaced finding IDs, a bounded projection fingerprint, and an explicit withholding reason. A change in meaning requires a new version. Report reads never create or replace score history.

Completion-time persistence is best-effort for scan availability: persistence failure is logged and monitored but does not convert a completed scan into a failed scan. Lambda scans finalize from the lightweight status lifecycle only after both the terminal result and canonical report-readiness event exist; report rendering and admin-summary reads remain write-free. Reprocessing the same version is idempotent and repeat polls use a cheap exact-version existence check.

Persisted finding lineage uses the canonical unified-finding presentation status
`surface`. An earlier projection typo checked the nonexistent value `surfaced`, which
could omit finding IDs from the immutable provenance row while leaving the score and
checklist fingerprint otherwise intact. The forward path is corrected and regression
tested. Existing version rows are not overwritten or silently repaired; a future
meaning change still requires a new score version.

The versioned lifecycle has a hard activation cutoff of `2026-07-22T06:30:00.000Z`. Scans completed before that instant are never backfilled or relabeled by status polling, report reads, or admin reads; they continue to display their original snapshot as `Legacy scan score`. Missing or invalid completion times fail closed without creating an assessment.

## Candidate-v2 corrections

- Policy extraction is coverage evidence, not observed risk.
- Surfaced sensitive-data findings are risk eligible and high-severity evidence can cap posture at 49.
- Risk families are explicit: consent/tracking, contradiction, rights gaps, and sensitive data.
- All 39 coverage rows retain explicit weights; missing and stale registry entries fail validation.
- Score execution requires every configured row weight; there is no zero-weight fallback for an unknown row.
- A no-finding score is withheld below 90% coverage; a finding-bearing score is withheld below 70% coverage.
- Finding-family deduplication, monotonicity, critical caps, bounded artifacts, and contradiction checks are mandatory.

## Open evidence and calibration gates

1. `post_reject_tracking_reduction` is structurally unavailable because consent clicking is intentionally disabled. Luna must approve an explicit capability/applicability treatment; the threshold must not be lowered to hide it.
2. Endpoint geography now materializes into bounded WC01 typed endpoint-jurisdiction evidence without query values. Deployment and owned-canary validation remain open.
3. Sensitive-surface tracking now requires same-page correlation between typed field observations and promotion-grade third-party request-purpose rows. Deployment and source-equivalence validation remain open; scan-wide co-occurrence is rejected.
4. Consent-control accessibility needs actual retained accessibility issue evidence; accessibility-tree discovery alone does not prove accessibility quality.
5. The governed public calibration selector correctly failed closed: all registry targets are currently unavailable because of cooldown or exclusion. No fixed-site or latest-scan substitute is permitted.
6. Luna must approve the corpus, benchmarks, bands, weights, penalties, caps, thresholds, monitoring baselines, expected-band review, and production cutover.
7. Legacy scorer input coverage and report usable-evidence coverage are distinct calculations and can diverge (production canaries measured `1.0` versus `27/30` and `28/30`). Shadow comparison schema v5 records both over the exact customer-report row projection and exact requested-URL identity. Because Luna selected report usable evidence as the customer-facing meaning, that historical semantic difference is retained as an accepted migration difference rather than an unresolved contradiction; all other contradictions remain cutover-blocking.
8. The twelve-lane deterministic benchmark originally found that a supported high-severity rights gap yielded `75 / Clear / Monitor`. Luna selected candidate-v3's rights-family maximum of 30, which now yields `70 / Watch / Review`; governed live validation and final approval remain required.

Until all gates pass, candidate-v3 remains internal shadow output. If calibration cannot support an overall score, CertScore will continue to expose separate domain scores and coverage confidence and will withhold an overall score.
