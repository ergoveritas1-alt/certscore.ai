# GDPR/ePrivacy score cutover and rollback

Status: deployed architecture, disabled by default. The candidate remains pending Luna
approval and must not be enabled yet.

## Control

`CERTSCORE_GDPR_EPRIVACY_SCORE_MODE` is the single customer-facing selector used by
the report, Pulse exports, dashboard/history, and admin scan summaries.

- Unset, `legacy`, or an unknown value selects the immutable
  `gdpr_eprivacy_evidence` assessment.
- `approved_candidate` can select `gdpr_eprivacy_posture` only when the checked-in
  Luna decision packet is fully approved for the exact stored model version.
- A missing, mismatched, shadow-kind, or unapproved candidate fails closed to legacy.
- An approved candidate that is withheld remains withheld; the selector must not
  substitute the legacy number.
- Neither mode creates an overall score. Overall score status remains
  `withheld_unmodeled_domains`.

## Before enabling

1. Complete the governed public sample through the canonical selector and central
   contact ledger; do not hand-pick sites or bypass cooldowns.
2. Record Luna approval for the corpus, report-usable customer coverage meaning,
   expected bands, weights, caps, thresholds, monitored baselines, and exact model
   version.
3. Run `pnpm score:luna-cutover-gate`; it must pass without an override.
4. Confirm the seven-day persisted monitor has enough representative rows to review
   score drift, contradiction rate, withholding rate, and comparable cross-region
   same-region cross-source, and identical-input cross-source ranges. Its `alertEvaluation` must be
   `within_approved_baseline`; `withheld` and `pause_rollout` are cutover blockers.
5. Verify the same stored candidate kind, version, score, and coverage on report,
   Pulse Summary/Evidence JSON, dashboard/history, and admin surfaces.

## Enable

Set `CERTSCORE_GDPR_EPRIVACY_SCORE_MODE=approved_candidate` in the production web
runtime and deploy through the normal Git/AWS ECS path. The setting alone cannot
bypass Luna approval.

After deployment, run owned canaries and verify scored and withheld cases. Historical
assessments remain immutable and retain their original kind/version.

## Immediate rollback

Set `CERTSCORE_GDPR_EPRIVACY_SCORE_MODE=legacy` (or remove it) and redeploy the web
runtime. This changes only selection; it does not rewrite or delete candidate,
legacy, or monitoring rows. Verify report, Pulse, dashboard, and admin all return the
legacy `gdpr_eprivacy_evidence` kind/version again.

Rollback is required if any Luna-approved limit is exceeded, if the monitor becomes
undersampled, if alert evaluation is withheld or invalid, if consumer surfaces
disagree, if the exact approved version is unavailable, or if a withheld candidate is
replaced by a legacy value.
