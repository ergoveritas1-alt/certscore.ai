# CertScore.ai CNN local visual verification

The owner authorized one bounded local CNN verification after the screenshot
scheduler repair. The single passive consent-proof scan ran November 17, 2026,
08:36:14–08:36:23 PST. No deployment, production scan, new privacy action,
paid-model call or automatic rescan occurred.

## Outcome

Scan `cnn-visual-local-202eb2bc-72ad-43f6-847b-1d2ac0973605` completed in 8,888 ms.
Both early and settled captures retained actual 1366×900 PNGs, bound to
`https://www.cnn.com/` and the same CDP loader. The settled image was visually
reviewed: it shows the CNN homepage under its Legal Terms and Privacy dialog,
not a placeholder, error screen or challenge. No Agree control was clicked.

The canonical core no-go assessment and the report-side
`buildLocalV2ScanNoGoAssessment` both returned null. The report-side check consumed
the original locally retained canonical bundle, with its source hash verified.
No gate was bypassed, no screenshot status was patched, and no previous scan's
image was substituted. This verifies that the visual no-go clears for this local
capture; it is not a complete scored report or a production-region verification.

Both captures recovered through the existing CDP surface path. The early capture
took 516 ms and the settled capture 305 ms. The newly reserved Playwright fallback
was **not reached** on this visit. Its stalled-CDP recovery remains supported by
the prior offline and real-Chromium fixture tests, not a live CNN exercise of that
branch. No second visit was made to force that branch.

## Bounds and evidence

The scan called the source implementation of `runScan` in the passive
`consent_proof` lane with the full profile, `cmp_safe` fast schedule and no
post-consent flows. It kept the production lane's 35,000 ms soft module deadline,
47,000 ms scanner deadline, 6,000 ms visual-recovery cap and 41,000 ms absolute
recovery cutoff. The existing screenshot timeout setting was 15,000 ms; the
scanner's narrower early and settled caps remained in place. Local egress
geography was not verified, and no AWS proxy or credentials were loaded into the
capture process. No infrastructure or recurring budget was increased.

Receipts are in `outputs/cnn-screenshot-verification-2026-11-17/`:

- `run-claim.json`: exclusive single-run claim, exact scope, source hash and caps.
- `result.json`, `run.log`: original capture timings, outcome and diagnostics.
- `capture/CanonicalEvidenceBundle.json`: original 105,466-byte source,
  SHA-256 `ff5b2842d7c6e550b71ddef9746dd90a7abfde670a528bd84e2b428c3cf62274`.
- `verification.json`: PNG dimensions/hashes, URL/loader bindings, manual review
  and both unchanged no-go assessments.
- `capture/screenshot-pre-consent-settled.png`: 489,639 bytes, SHA-256
  `3ca5d9cb8f94da9c25c742ff1f3ca87ed2e76dc0df26d0b0916445077f88cb39`.
- `effective-ledger.json`, `selection.json`, `contact-summary.json` and
  `ledger-candidate.json`: successful central-history export, exact-target
  selection with the owner's single-visit cooldown override and consumed contact.

The calibration registry passed before contact. The exact CNN contact is retained
in the repository ledger and submitted through the canonical idempotent central
contact recorder. The one authorized visit is consumed. The earlier production
report was not rewritten.
