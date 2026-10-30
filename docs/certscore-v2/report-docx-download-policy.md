# CertScore.ai Word report downloads

Local implementation, October 30, 2026. Not deployed.

The report Share menus and legacy icon actions offer **Download Word report
(DOCX)** in place of Download JSON report. PDF access and workspace branding
retain their existing access requirements. The JSON report and tracking workpaper API contracts remain
available for integrations and technical evidence links.

`format=docx` uses the existing completed-report lookup and persisted canonical
export. It has the same public-report availability as the former JSON download;
it does not grant workspace branding or PDF privileges. Authorized viewers now
receive their own workspace's white-label name/logo/theme automatically, with
the same entitlement and workspace-access check as PDF. Public/basic/inaccessible
workspace downloads remain unbranded. Explicit `branding=workspace` requests
require authentication, Advanced access, report access and a loadable logo;
they cannot silently fall back to standard branding. Responses use the Word
OOXML MIME type, an attachment filename, `private, no-store` and `nosniff`.
Invalid focus/time zone, unavailable full-site scope, incomplete scans and missing
canonical projections cannot become document downloads.

The Word renderer consumes the native PDF's scoped report paragraphs and evidence
tables before pagination. It uses the shared canonical priority selection and
highlights, and the selected framework's stored score. No finding, proof,
eligibility or score computation changes. All reportable narrative findings remain
in the priority or other-findings sections. Word contains editable paragraphs and
tables, repeating table headers and page numbers. Ordinary rows stay together;
long cells can continue onto another page. Source cells are preserved before PDF
line wrapping, including Unicode and terminal long-cell evidence. Word uses
CertScore.ai branding unless the viewer's workspace branding is authorized.
No remote image, conversion service, macro or embedded
workpaper is added. Screenshots remain available in the online/PDF report.

The existing v2 summary cleanup is shared with native PDF/Word to keep historical
score-effect commentary out of customer prose. HTML entities are decoded and an
internal registry version is omitted while its inferred category remains visible.
These presentation changes do not alter the historical workpaper.

The frozen SITS export SHA256 is
`8f361d770b2bb1cb30704bf44a6736a8679c66c8cd5d74752aca690c4ef11060`.
Its Word preview retains **80/100**, **one selected priority**, the Partial concern
qualification, and the other three narratives. No new scan or production report
rewrite was performed. Local preview:

```sh
TSX_TSCONFIG_PATH=apps/web/tsconfig.test.json node --import tsx scripts/preview-report-docx.ts \
  --report path/to/frozen-canonical-report.json \
  --out output/docx/report-local.docx --time-zone Pacific/Honolulu
```

Validation is included in `pnpm test:report-presentation`; focused checks are
`pnpm test:report-docx`. Coverage includes actual OOXML structure, canonical EU
and California selection, missing choice proof, full-site score/scope, unchanged
source evidence, long Unicode cells, XML escaping, internal-content rejection,
download menus, time zones, route headers, existing PDF gates and JSON continuity.
Fast and full preflight select the report gate for these changes.

Cost: no new service, retained object, scan lane or model call. A local SITS
generation took approximately 0.15 seconds and produced about 32 KB. Estimated
marginal compute is **under $0.25/month at 100,000 similarly sized downloads**;
current fixed capacity and scan budgets are unchanged. This is within the existing
below-$1 pre-approval. The pinned `docx` 9.6.1 library generates files locally in
the existing Node server; production does not require Python or LibreOffice.

Local run evidence and visual QA are under `artifacts/report-docx-2026-10-30/`.

Final local validation: **160 report-presentation tests**, **18 release-selection
tests**, web typecheck and diff checks passed. All **27 pages** of the SITS Word
render were visually inspected; OOXML/relationships parsed and page bounds passed.
