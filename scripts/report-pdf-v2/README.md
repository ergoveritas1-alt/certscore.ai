# CertScore.ai local PDF v2 preview

Local preview only. The authenticated export route, native v1 renderer, workspace
branding loader, scanner, findings, scoring and deployment configuration are
unchanged. This preview supports canonical v8 **starting-page GDPR/ePrivacy**
exports. Other frameworks and full-site reports fail closed pending parity work.

## Render

Requires Node 22–24 and Python with ReportLab, pypdf, pdfplumber and Pillow. The
Codex bundled document runtime provides those libraries; no new production
package or paid service is required. Set `CERTSCORE_PDF_PYTHON` to its Python
executable or pass `--python`.

```sh
REPORT_TEMPLATE=v2 TSX_TSCONFIG_PATH=apps/web/tsconfig.test.json \
node --import tsx scripts/preview-report-pdf-v2.ts \
  --report path/to/canonical-report.json \
  --source-pdf path/to/owner-supplied-saved-report.pdf \
  --time-zone America/Los_Angeles \
  --out output/pdf/local-preview.pdf
```

`--source-pdf` is optional. It extracts presentation-only branding/capture images
after checking the scan ID. Those images never supply findings or receipt proof.
Without images, text branding remains. `--brand-name` overrides the saved name;
the fallback is **CertScore.ai**. `--paper a4` selects A4. Default paper is Letter.
Without `REPORT_TEMPLATE=v2`, the CLI uses the unchanged v1 renderer.

The adjacent `*-source` directory records the immutable source SHA256, output
SHA256, asset hashes and view model. The source export is never rewritten.
Generated PDF text excludes internal trace/diagnostic fields.

## Validate

```sh
pnpm test:report-pdf-v2
pnpm --filter @website-signal-risk-scanner/web typecheck
"$CERTSCORE_PDF_PYTHON" scripts/report-pdf-v2/validate.py \
  --pdf output/pdf/local-preview.pdf \
  --model output/pdf/local-preview-source/model.json \
  --out artifacts/pdf-v2-qa --edges
pdftoppm -scale-to 1200 -png output/pdf/local-preview.pdf artifacts/pdf-v2-qa/page
```

Inspect every rendered page after changes. The automated checks cover text
bounds, minimum 9 pt type, embedded font resources, internal link destinations,
stable computed page references, prohibited/unrendered text, footer counts,
aligned/equal-height summary cards and six renderer edge cases. The 240-row
fixture checks table continuation, repeated headers and the last row; a separate
100-row fixture checks splitting within an issue card. Automated geometry checks complement visual inspection;
they do not prove that every possible content combination will fit.

## Evidence and content boundaries

- The TypeScript view model consumes the frozen canonical report export and
  existing PDF readers. No raw evidence bundle, network read, classification,
  scoring or consent inference is added.
- Every selected narrative finding is represented exactly once. Related review
  findings may share an issue; grouping does not infer a common root cause.
- Framework selection uses the shared regulatory review catalog. California-only
  findings and GPC/California choice panels are excluded from the EU preview;
  original multi-framework packets and scores remain in the canonical export.
- Typed statuses are preserved. The shared report label mapping displays
  `Needs review` as **Review** and `Manual review` as **Manual check**,
  distinguishing an existing finding from an inconclusive automated result.
  Both label and follow-up description maps come from the canonical TypeScript
  policy in the serialized model; Python has no independent alias list.
- Unknown evidence stays unknown. Observed does not become Pass. A zero score
  effect does not make a review finding informational.
- Cookie/declaration mismatches retain their incomplete-inventory qualification.
  There is no PDF-specific cookie registry or vendor alias resolver.
- Request time remains click-relative. Completion and stored decision-confirmation
  states are separate. Existing historical semantics are not recomputed.
- No customer score-deduction explanation is generated. Scoring data remains in
  the original canonical workpaper.
- Technical cells visibly use ellipses when necessary; the online report and JSON
  workpaper remain the complete source. Narrative text and tables paginate.

Fonts are checked-in OFL assets with source URLs, licenses and SHA256 values in
`fonts/sources.json`. Static Manrope 400/700/800 and JetBrains Mono 400 instances
are embedded. Static font name records distinguish the weights for ReportLab.

See `docs/certscore-v2/report-pdf-v2-preview-2026-10-29.md` for the reviewed
recommendations, exact replay source, remaining upstream issues and validation.
