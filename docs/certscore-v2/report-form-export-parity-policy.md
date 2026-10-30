# CertScore.ai form inventory parity in report exports

Local implementation and retained replay, October 30, 2026. Not deployed.

The SITS export mismatch came from using only the initial-page
`CollectionSurfaceAssessment` in PDF and Word, while the web report also included
the canonical post-Accept form projection. The initial inventory has zero forms;
the eligible retained after-Accept inventory has two observations and nine fields.
Its capture was limited. Neither count establishes comprehensive form coverage.

Web and canonical exports now use `projectReportFormInventory`. It reuses
`projectPostAcceptForms` and `projectScanFormsSummary`, preserving first-layer
Accept eligibility, packet/target proof, historical reconciliation, phase labels,
capture limitations and snapshot identities. No registration inference is added.
Completed click-only captures remain distinguished from verified registration.
The same form reference in independent captures remains two observations; no
cross-session deduplication is invented.

New v8 workpapers add an optional typed
`appendix.dataCollectionSurfaces.reportInventory` with the combined rows and
existing starting-page summary. Original `forms`, `summary`, `coverage` and
assessment fields retain their initial-page meaning. Historical v8 exports without
the extension keep that scope; unavailable later evidence never becomes zero.
Full-site exports retain their existing page-form inventory and add eligible
homepage after-Accept observations, matching the web's inventory scope.

The native PDF, local v2 preview and Word share the exported inventory reader.
Summary graphics, topic recaps, appendix totals and form/field details use the
same rows. Initial-page coverage is explicitly labelled; it does not describe
later captures. Missing or limited evidence cannot become a no-forms conclusion.
Findings, priority selection, proof requirements and scores are unchanged.

For SITS, the retained-only derivative keeps **80/100** and **one priority** while
showing **0 initial-page forms**, **2 after-Accept observations**, and **9 fields**.
The original export SHA256 remains
`8f361d770b2bb1cb30704bf44a6736a8679c66c8cd5d74752aca690c4ef11060`.
The original post-Accept packet SHA256 is
`c96d9894e1bae0c784d89b656765f25a86ccf683d62433e13e0054addfbce256`.
Replay verifies that packet against the retained bundle, scan identity, final
target and exact target hash before using the existing canonical projector. The
historical export and evidence are not rewritten. This is retained replay,
not new production verification.

Regression coverage includes EU and California, both PDF paths, actual Word
OOXML, phase counts and fields, missing packet proof, mismatched target proof,
unobserved Accept, historical exports, same-reference independent captures and
full-site records. Existing post-Accept/API tests run in the report-presentation
gate. Local evidence is in `artifacts/forms-export-parity-2026-10-30/`.

No scan, visit, wait, model call, image fetch, recurring service, new retained
object or capacity change is added. Local recurring cost is **$0**. At 100,000
exports comparable to SITS, marginal export compute/transfer is conservatively
estimated **under $0.25/month**, within the existing below-$1 pre-approval; scan
budgets and retention remain unchanged. The Word example grew from about 32 KB
to 33 KB and rendered in about 0.17 seconds locally.
