# CertScore.ai pre-consent form images — November 13, 2026

## Retained production evidence

Scan `7485b83f-b2e8-4335-87a0-1af72f502b18` retained four forms and six fields,
but only one pre-consent image. Its runtime timing record shows the full
2,500 ms image allowance was available after the required accessibility audit.
The missing images were not caused by a reduced allowance or lost form inventory.

The exact-window worker log stopped at `form_2_capture_pixels` after 2,252 ms:
one image had completed, one safety review was pending for 493 ms, the third
pixel capture hit its deadline, and the fourth had not started. The caller
reserved 250 ms for cleanup by passing a 2,250 ms deadline, but unintentionally
used that same deadline for independent safety reviews. The generic timeout
reason obscured the pending-review versus not-yet-captured distinction.

Each masked crop also awaited image encoding and quality inspection before
starting the next browser capture. Reviews already overlapped; image processing
did not. The retained log proves the deadline stages, not how much any individual
encoding step contributed to this production incident.

## Canonical repair

The shared collection-surface image producer now processes immutable,
geometry-verified masked crops concurrently with the next serial browser capture.
No concurrent scrolling/masking is introduced. Each image still needs its own
size, uniformity, document, cancellation and safety checks before publication.
Late completions cannot mutate the returned snapshot list.

The pre-consent caller lets independent image processing and safety reviews use
the existing cleanup reserve. Pixel work still ends 250 ms before the unchanged
absolute image deadline; cleanup and review share that reserve. The required
accessibility audit and privacy-evidence freeze still precede image work.
Four aggregate stage counters are retained in the existing timing breakdown;
overlapping durations are not additive wall-clock time.

No site-specific path, larger worker, additional capture allowance, consent
action, model retry, or finding/scoring change was added. More completed images
may increase retained bytes; the estimated increment for this observed image
size profile is below $0.50/month at 100,000 scans. Local implementation adds no
recurring infrastructure. Existing moderation and inventory caps remain intact.

## Verification

- The new pipeline regression fails on the original source and passes on the fix.
- 70 shared pre-consent/Accept/image/budget checks passed, plus the retained
  four-form/six-control replay. The replay uses local HTML and blocks network
  access; its retained inventory URLs are sanitized.
- Deadline tests verify review during cleanup, rejection after the absolute
  deadline, no late result mutation, masking and unchanged input values.
- Scan-core typecheck and build passed; calibration registry validation passed.

One authorized localhost Sanity scan, `be8b296c-4c88-4363-8b43-77e34a75735d`,
completed in 25.9 seconds. All four pre-consent images completed in 1,812 ms
within the unchanged 2,500 ms allowance. The ready report contains all six
observed forms and all six images, including two after Accept. Each image was
downloaded from the localhost report endpoint and decoded; the four pre-consent
image bytes match the canonical artifact. The two small formerly missing crops
were visually checked: populated controls are masked and submit controls remain
visible.

Accept and Reject both retain verified Osano receipts, completed observations,
and `succeeded_with_confirmation` projections. Their checksummed packet times
were 6,735 ms and 11,702 ms respectively. Form inventory remains explicitly
limited; complete image retention does not imply complete site/form coverage.

Evidence is in `artifacts/preconsent-images-20261113/`. The single contact was
persisted centrally under `preconsent-images-local-20261113` and merged into the
reviewed local eligibility ledger. The localhost-only quota fixture restored its
offset while preserving actual new usage; production quota settings were untouched.

No deployment, production scan, SITS scan, or ergoveritas scan occurred. This
local result does not guarantee four successful images under every AWS renderer
or moderation latency; failures still remain explicit within the same budgets.
