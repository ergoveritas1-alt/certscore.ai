# Do Not Sell/Share detection and scoring readiness

This change stays in draft for review. It does not deploy, add a browser run, click an opt-out control, or change the approved 15-point California GPC policy.

## Evidence and score boundary

The legacy `do_not_sell_link_present=false` snapshot field covers a narrow inventory, not a verified sitewide absence or a failed sale/share opt-out. It no longer synthesizes `sale_sharing_controls_missing` in new snapshot projections or report fallbacks. Historical retained observations remain versioned.

The California evidence scorecard now uses `california-evidence.v2`: its Do Not Sell/Share availability and GPC disclosure checklist rows remain visible but carry no points. The canonical overall score still applies the approved 15-point GPC finding once, only after the versioned delivery and paired-comparison eligibility checks. A link, absent link, notice excerpt, incomplete capture, or untested sale/share action does not add a deduction or pass credit. This follows the [September 25 retained-evidence calibration](ccpa-scoring-calibration-2026-09-25.md).

## Detection reliability

The policy lane's existing rendered DOM read now reserves at most 40 of its existing 1,000 candidate slots for direct/equivalent Do Not Sell/Share and Your Privacy Choices phrases from the canonical classifier registry. It prioritizes visible matches, preserves the bounded sample, and still requires typed classifier, source-page, accessible-name, and visibility proof. The large-DOM fixture puts a visible control behind 45 hidden duplicates in the middle of over 1,000 controls.

The evidence-only benchmark accepts separate retained reviewer packets, detector predictions, and named human labels bound to a SHA-256 hash of the reviewed packet set. It reports unique-site precision, recall, abstentions and capture coverage. Its provisional internal release gate requires 95% precision, 90% recall and 95% complete-capture coverage, with no unresolved or unlabeled sites. The checked-in packets are fictional format fixtures, not measured production quality.

## Remaining coverage limit and cost

Fast policy scans can skip rendered discovery when static core surfaces look complete. Static HTML cannot prove a link visible, so those scans remain unverified rather than negative. Addressing that skip would require an additional rendered visit for some scans and a separate cost estimate and approval. A working sale/share opt-out would require its own authorized action and post-action evidence; cookie Reject does not establish it.

The present DOM selection runs only when the existing rendered candidate cap overflows. Estimated incremental Lambda compute is below $0.10/month at 100,000 scans; storage, browser-run count and paid model/API usage do not increase.
