# CertScore.ai PDF v2 local preview — October 29, 2026

Implemented the approved local design preview with canonical corrections.
No deployment, production integration, live scan, historical rewrite, scanner
change, scoring change or proof relaxation. Recurring AWS/paid-service cost
increment: **$0**. Existing budgets and production flags are unchanged.

## Source and implementation

- Scan: `75474df3-925b-418d-8c8f-864be774db82`, sits.com, Germany, starting-page GDPR/ePrivacy.
- Frozen canonical v8 export: `artifacts/postdeploy-independent-review-2026-10-21/scans/75474df3-925b-418d-8c8f-864be774db82/report.json`.
- Export SHA256: `8f361d770b2bb1cb30704bf44a6736a8679c66c8cd5d74752aca690c4ef11060`.
- Saved original PDF SHA256: `e79740d6bfe1a70d5eaf4f5530ca5543294092c141caea841a4db546d917ad88`.
- Base repository HEAD: `71a17244a651661a0ea4385de82bb5864529bff7` (also recorded in the validation manifest). Work remains uncommitted alongside prior authorized changes.
- Output: `output/pdf/sits-com-privacy-report-v2-local.pdf` and adjacent source/provenance/layout sidecars.

The production renderer is `apps/web/server/scans/report-export-pdf.ts` (native
PDF commands), with shared reader/frontmatter/topic/evidence modules. The source
is `CanonicalReportExport` v8. Production branding comes through
`server/company/report-branding.ts` and the authenticated export route; neither
was changed. The local TypeScript projection reads the same export; the local
ReportLab renderer supplies the design preview. It is selected only through the
local CLI's `REPORT_TEMPLATE=v2`. This is not a production flag rollout.

## Recommendations accepted or adjusted

| Recommendation | Decision | Reason |
| --- | --- | --- |
| Clear executive summary, choice-state counts, topic grid, issue/re-test structure | Implemented | Easier to read and act on while retaining the exact inventories and findings. |
| Letter/A4, white-label header, running sections, embedded fonts, repeated table headers | Implemented locally | Improved readability; no production infrastructure dependency. |
| Computed page references, selectable text and links | Implemented | References stabilize after layout and are checked against actual destinations. |
| Group issues by cause | Adjusted | Group related refusal/overlap findings without asserting a cause. Keep per-vendor evidence within the shared issue. |
| Merge policy clarity and undeclared cookies | Rejected for this scan | No separate canonical cookie-disclosure finding establishes that combined issue; declarations are incomplete. |
| Observed → Pass | Rejected | Presence is not adequacy, effectiveness or compliance. |
| No score effect → For information | Rejected | Score deduplication/eligibility does not erase an actionable review finding. Only the explicit Accept baseline is informational here. |
| Moderate confidence + medium impact → Fix | Adjusted to Review | The recorded policy finding supports review, not a verified implementation defect. |
| Unmatched declarations → cannot match a real cookie | Rejected | Registry absence, translated-looking names and missing observations do not establish invalidity. |
| Invent template/tag-manager/banner causation | Rejected | Timing, names or CMP attributes alone do not prove cause. |
| Render missing-data placeholders | Adjusted | Show a factual status when useful; record missing engine output internally. No bracketed mock content in a customer preview. |
| Equal windows would fix limited confidence | Rejected as a conclusion | Unequal windows impair comparison; equal windows would not supply missing receipt, source or activity proof. |
| Force exactly 17 pages | Adjusted | This scan fits 17 naturally; longer evidence tables paginate without shrinking type or dropping rows. |

## Response to the proposal's data/engine items

1. **Decline-control contradiction.** Keep control observation, click completion,
   stored registration and post-choice activity separate. Do not upgrade a stored
   unknown status merely to make another observation look consistent. The preview
   shows these as separate measurements.
2. **GTM classification differs by state.** Preserved and documented. The matching
   sanitized request path has different stored classifications across visits.
   Fix any classification defect upstream with request-level evidence, not in PDF
   display code.
3. **Accessibility unavailable despite results.** Corrected to manual review:
   63 evaluated rules, zero failed rules, two review rules. Unmeasured contrast
   remains unresolved rather than becoming a failure.
4. **Misleading pre-choice totals.** Corrected scope labels. The one pre-choice
   cookie/storage row, post-choice cookie inventory and request events remain
   separate denominators.
5. **Placeholders/escaping.** Shared wording normalization decodes once; PDF text
   is escaped at rendering. Missing data is not replaced with invented content.
6. **Wrong footer.** Actual running section name, continuation label and computed
   page count replace the repeated Summary label.
7. **Unidentified first-party files.** Show the observed host instead of
   Unidentified, while preserving the original purpose and classification.
   Same-origin location alone does not prove essential purpose.
8. **Form transport vs DOM inventory.** Kept separate: transport coverage is not
   a form count. The completed DOM inspection recorded zero forms; no form was
   submitted.
9. **Weak policy matches.** Preserve canonical disclosure-presence results;
   do not call them legal adequacy passes. Stronger per-topic semantic validation
   and exact marker-to-passage ranges require upstream policy work. No invented
   boilerplate quote or per-row semantic verdict is introduced.
10. **Prominence threshold.** Measurements are visible: Accept fill contrast
    9.46 versus Reject 1.00 in the saved capture. The existing assessment remains
    unchanged. Review the shared threshold against a labeled corpus in separate
    product-policy work; this one pair does not establish the right threshold.
11. **Unequal windows.** Show the exact 3,000 ms Accept and 1,443 ms Reject
    windows. Do not compare raw totals as equivalent rates, change scanner waits
    or claim a causal fix from equalizing windows.

## Remaining data work

Highest-return upstream follow-ups are canonical cross-state request-classification
review, stable declared-service-to-recipient joins, and exact policy-marker
passages with per-topic semantic scope. No new capture is needed merely to
redesign this saved report. The current declaration inventory is incomplete;
that fact cannot be repaired through PDF formatting. Production integration and
California/full-site PDF parity are separate work, not part of this local preview.

## Visual review follow-up

The first preview under-applied the supplied visual design: it used a continuous
topic grid, uncontained issue text, square KPI blocks and densely styled tables.
Those choices were not required by canonical evidence corrections.

The revised renderer restores separate rounded topic/KPI cards with content-based
equal heights, outlined qualification badges, bordered review cards, two-column
action guidance, warm qualification callouts, a subdued informational card, a
blue re-test panel, rounded branding and clearer table label/value hierarchy.
Summary impact/status counts are derived only from existing projected findings
and topic statuses. Evidence labels remain Observed rather than Pass.

During that visual-only revision, the original frozen export and the complete
local view model were byte-identical. Archived view-model SHA256:
`16cd52d4abd2756ce50d4ee466ab3b6826c6c8a363888a5081ba525739afa0ba`.
That customer preview remained 17 pages, 80/100 and four selected narrative findings.
No claim, scoring, proof, scanner or production-route change accompanies this pass.
The earlier local preview is preserved under the UX review's `before` directory.

## Framework scope and label follow-up

The EU preview had incorrectly carried a GPC topic and California choice tables
from shared multi-framework evidence. The current GDPR/ePrivacy preview excludes
them and keeps the separate first-layer screenshot. Seven genuine topic cards
replace the previous eight; the final card spans both columns rather than adding
a filler topic. The shared regulatory review catalog now supplies the framework
filter for narrative findings, including positive GPC findings. California
relevance is preserved; no source packet, historical record or score is changed.

Typed statuses remain unchanged. One renderer-wide display mapping labels
`Needs review` as **Review** and `Manual review` as **Manual check**.
The former points to an existing projected finding; the latter identifies an
inconclusive automated result. The customer's accessibility assessment still has
zero failed rules and two review rules, without creating a repair finding.
The legend, badges, row labels and summary counts use these meanings consistently.

This presentation-scope revision intentionally changes the view model; its
predecessor is archived in the scope review's `before` directory. The frozen
canonical source remains byte-identical. The current PDF remains 17 pages,
80/100 and four narrative findings. No production integration or deployment.

## Validation

Results and exact revision/output hashes are recorded in
`artifacts/pdf-v2-scope-review-2026-10-29/qa/validation.json` and
`artifacts/pdf-v2-scope-review-2026-10-29/manifest.json`. PNGs and three contact sheets
cover every page of the customer preview. The command and dependency instructions
are in `scripts/report-pdf-v2/README.md`.

Thirty-two TypeScript PDF tests and twelve shared catalog tests pass. Web
typechecking passes. Seven PDF layout cases pass, including a
100-row table inside a splitting issue card. Checks now include card boundaries,
equal-height KPI rows and aligned topic-card pairs, alongside embedded fonts,
minimum type size, source invariance, text bounds and computed link destinations.
Rendered-text checks reject GPC/California panels and the ambiguous previous
labels in this EU fixture. Tests preserve California GPC relevance and assert
that positive California findings are also excluded from this EU narrative.

## Shared policy supersedes preview-only labels

The subsequent owner instruction changed the label to **Review** and made both
framework scoping and labels shared across EU/California web reports, focused
API exports and native PDFs. The preview now consumes that same label map.
See `docs/certscore-v2/report-framework-and-status-policy.md` and
`artifacts/report-presentation-canonical-2026-10-29/` for current implementation
and validation. Earlier preview manifests above remain records of those passes.
