# Consent visual binding: local investigation and fixes

Status: local only; no commit, deployment, production report mutation, or
historical assessment upgrade. Existing unrelated changes are preserved.

## Findings and changes

The eleven prior unresolved audit cases split into three omitted approved
visuals, four unavailable late visuals, three timing/document-drift cases, and
one child-frame case already covered by the previous local viewport fix.
These categories are diagnostic coverage flags, not eleven confirmed binary
control-detection errors.

- Dell, Runna and MyRealPage retained safety-approved CMP-control screenshots.
  Native inspection of all three confirms visible Accept and Reject controls.
  The report artifact projection omitted this screenshot type. The shared
  projection/resolver now preserves distinct CMP-control, CMP-empty and recovery
  artifact identities, including their existing safety statuses. Withheld images
  retain null serving keys. No new screenshot is captured or retained.
- NCSoft, NTT Data and ownCloud retained inconsistent packet/candidate screenshot
  references. New same-loader proof binding updates the packet and its current
  visible candidates together, preserving separately referenced earlier viewport
  candidates. Unknown/mismatched loaders, different URLs and post-consent images
  cannot acquire the binding.
- MyRealPage's recovery reused an existing screenshot, but geometry named an
  uncaptured recovery filename. Recovery now references the actual reused image.
- Geometry screenshot selection now checks the current loader and exact URL.
  This does not schedule replacement captures or extend any deadline. The existing
  capture eligibility gates are unchanged.
- Synchronized CMP screenshots now retain a loader identity only when the cached
  before/after identities agree; no additional browser call is introduced.

The four unavailable late visuals (NCSoft, NTT Data, InfoQ and ownCloud) reached
the screenshot safety finalization deadline. They remain withheld. Fixing
references does not authorize serving them or raising control confidence.
PortAventura changed loader after its available banner screenshot. Feedback
Company and GoTokyo retained later inventories than their selected images.
Those historical capture gaps remain unresolved; earlier pixels do not establish
false positives. Nomura's earlier child-frame visibility cannot be reconstructed
conclusively, although its one-pixel-frame failure is covered by the prior fix.

Original artifacts are unchanged. Auxiliary hashes were checked against retained
manifests; bundle hashes in this investigation are local byte hashes because the
source manifests do not supply expected bundle hashes. Assessment replay uses the
current canonical inspection reconciliation and assessment functions; it is an
internal diagnostic, not persisted production evidence or a historical upgrade.

## Fresh local validation

Ten additional domains were selected through the canonical selector after a
successful central contact-history export, excluding the previous fresh fifty.
The owner-authorized cooldown waiver was recorded. Blocked and do-not-calibrate
states remained enforced. All ten attempted contacts were persisted idempotently
under `ar-controls-binding-fresh10-20261009`.

The batch used one isolated passive consent-proof visit per domain, ConsentCheckBot
HTTP identity with native Chromium navigator identity, local California egress,
en-IE locale and Europe/Dublin timezone. It did not click controls, submit forms,
retry, invoke a model, or reproduce production EU egress.

- Ten scanner executions completed; this does not mean complete evidence coverage.
- Five visits retained visibly identifiable Accept and Reject controls, both
  recognized correctly: Podtrac, Receitas Nestlé, Nature Conservancy, Unleashed
  Software and Lumin. The six control-bearing captures received contact-sheet
  review; this is model-assisted diagnostics, not independent human adjudication.
- UpShow redirected to EverPass and changed loaders late. The new guard left the
  newer geometry unbound to earlier images; canonical assessment replay retains
  unknown controls for the document mismatch rather than promoting stale evidence.
- Four visits had no identified controls. Three received top/bottom image triage;
  the remaining adult-content target was not visually reviewed. Missing controls
  are not treated as verified absent by this investigation.
- No new confirmed recognition miss was found in the five visually clear A/R
  pairs. The sample is too small and selected to estimate a population defect rate.

The fresh batch preceded the final reused-recovery-path correction. That pointer
correction was verified in the final fixture gate; no additional public visit was
made. Fresh source and final-source distinctions are recorded with the artifacts.

## Verification and cost

- Final canonical A/R gate: 375 passing tests plus 8 passing coordinator tests.
- Full local report materialization suite: 144 passing tests, including distinct
  new artifact IDs, correct serving keys and withheld-image exclusion.
- Scanner typecheck, calibration registry and `git diff --check` passed.
- Canonical regression coverage includes capture, retained binding, assessment,
  persistence, normalized concerns, scoring and downstream report/API projections.
  This batch tested passive control identification; it does not validate successful
  Accept/Reject click registration on the ten public sites.

No lane, timeout, retry, model call, replacement screenshot or extra wait is added.
Additional persisted reference metadata is estimated below $0.10/month at 100,000
scans. Read-only artifact retrieval was disclosed below $0.05 once; contact-history
export and bookkeeping were disclosed below $0.10 once. These are estimates, not
measured billing charges.

Trace receipts and replay outputs: `artifacts/ar-controls-binding-fixes-20261009/`.
Bounded repository summaries and the reviewed manual ledger candidate:
`docs/certscore-v2/calibration-runs/2026-10-09-ar-controls-binding-fixes/`.
