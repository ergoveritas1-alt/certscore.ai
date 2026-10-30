# CertScore.ai executive export template

October 30, 2026. Local implementation; no deployment, publication, public scan,
capture change, historical report rewrite or scoring/proof-policy change.

## Design and canonical content

The owner's supplied SITS executive-summary PDF guides the compact domain header,
score ring, four metric tiles, numbered finding cards and four-column topic grid.
The reference's wording, findings, counts, status claims and page references are
examples rather than evidence. CertScore.ai's existing projections remain the
source for every value and finding.

`reportExecutiveSummary` joins already-projected priority findings to their
canonical narrative packets. Selected priorities appear first and remain clearly
separate from other findings and informational Accept observations. A displayed
narrative card does not become another selected priority or scoring effect.
Existing approved display titles, confidence labels and impact metadata are reused.
Missing impact or confidence remains explicit; it is never filled from visual cues.

Canonical assessment highlights retain their writer and length bounds. Finding
cards may show a visibly shortened excerpt with a detail link; the complete text
and retained evidence remain in the body. Up to four cards appear on the summary.
Long content can reduce that number with an explicit shown/total count, preserving
the complete finding inventory in the detailed report.

The metrics distinguish before-choice storage from requests, and text presence
from disclosure adequacy. EU summaries omit GPC topics and California metrics.
California score scope remains the starting page, even in a report with a
full-site inventory. Unknown or limited observations do not become a pass or
absence result. Labels remain Review, Manual check, Observed and the existing
coverage labels rather than the reference's blanket Pass labels.

The reference cohort's SITS report remains 80/100 with one selected EU priority,
four report findings and two eligible after-Accept forms/nine fields. Its stored
California score remains 100. No new choice registration, tracking classification,
disclosure finding or applicability decision is inferred by this template.

## Formats and portability

The production PDF generator applies the new first page while retaining its
existing detailed sections, page format, branding authorization and themes.
Finding and topic links point to the corresponding detailed sections. The local
v2 PDF renderer follows the same visual structure and keeps its embedded fonts.

The executive label uses a bold 16-point heading aligned to the left edge of
the report content. PDF and Word share the same three-column header arrangement:
logo, site identity, and score. The logo box is 80 points square, 25% larger than
the previous 64-point PDF box; Word uses the same physical size. Both place
SCORE and the rating beside the ring, with scan origin beneath that group. The workspace name sits
below the site label rather than above the executive label. Scan origin appears
below the score rating as `Scan origination: …`; score scope stays with the
left-hand report metadata. No additional targeted-review caption is added.
Every PDF/Word page includes its original scan ID and the shared disclaimer:
“Automated technical risk signals for review, not a determination of legal
compliance.” These are attribution and presentation changes, not assessments.

Word uses editable tables, headings, findings, metrics and internal navigation.
Its first section is a Letter summary page; the original detailed-section
margins and content follow on the next page. Its score ring is a small embedded
graphic, accompanied by an editable rating and a source-derived scope label.
The numeric score is also retained in the diagram’s accessible description.
Authorized Word downloads use the same viewer-workspace logo, name and header
theme as PDF. A bounded metadata-free logo is embedded, without external image
relationships. Public/basic Word downloads retain CertScore.ai branding and
cannot access another workspace's branding. Explicit white-label requests use
the PDF authentication, entitlement and workspace-access checks. Missing or
unloadable explicitly requested logos produce an error rather than false branding.

The AWS web image has no installed fonts. The Word graphic therefore uses static
Manrope glyph outlines generated from the repository's licensed font, not an OS
font lookup. No font install or runtime image change is needed. Regenerate and
verify the subset with the bundled PDF Python runtime and
`scripts/report-score-glyphs.py [--check]`. The source font hash and SIL Open Font
License accompany the asset. The score-image process cache is bounded to 102
entries. No remote logo, graphic or font is fetched.

## Validation and cost

Validation covers EU/California scopes, full-site score labels, unknown and
suppressed findings, informational observations, missing metadata, historical
inventory shapes, score boundaries, editable Word content, links and source
immutability. The fixed retained-report audit also checks the executive
projection's priority identities and count in both frameworks. PDF layout checks
include Letter/A4, empty findings, missing Reject evidence and long content.
Rendered Word/PDF previews are inspected before delivery.

No new capture, model call, paid service, storage retention, worker capacity or
scan budget is introduced. Local recurring AWS cost is zero. Expected added
export compute/transfer is below $0.25/month at 100,000 comparable downloads,
within the sub-$1 preapproval. Production behavior remains unverified until a
separately authorized deployment and ordinary production evidence.

The subsequent Word branding change adds one existing workspace-brand lookup and
logo load per eligible download, without retention or a paid conversion service.
Word embeds at most 16 KB for the logo, first reducing to 160×80 and, when needed,
80×40 pixels. Estimated additional compute/storage-read/transfer cost is below
$0.75/month at 100,000 branded Word downloads, within the sub-$1 preapproval.
This estimate is incremental to the earlier export layout work. No scan budget,
capacity, recurring subscription, capture or deployment change is authorized.

## October 30 export narrative removal

PDF and DOCX executive pages omit the assessment-highlights paragraph beneath the header, as requested by the owner. Metrics follow the header directly. Keep canonical priority cards, all detailed findings and remediation, scores and proof unchanged. Web highlights remain available with their shared 430-character collapsed bound; no finding-specific exclusion is introduced. The local alternative PDF renderer follows the same omission. This presentation change adds no recurring infrastructure cost.

### Apple Pages header compatibility

DOCX uses a single fixed-width header grid, with separate logo, identity, score-label and score-graphic cells. No nested header tables: Pages flattened those tables and detached metadata from its identity column. The date and scan origination share the final row. Preserve editable text, bounded white-label logo handling, both header themes and the approved PDF header. Verify changes in Apple Pages as well as the bundled document renderer.

Use the approved PDF header as the vertical-spacing reference. Give summary paragraphs explicit line spacing and paragraph-mark sizes; tiny spacer runs alone still inherit body-height spacing in Pages and can push topic status onto another page. Keep the executive summary on one page, with all retained detail in the following section. The SITS replay was verified directly in Apple Pages with all four finding cards and all seven topic statuses on page 1 and detailed remediation beginning on page 2. The PDF remains unchanged. These DOCX layout changes add no recurring infrastructure cost.

Header rows also require explicit heights: Pages expanded auto-height rows despite zero margins, adding roughly 25 points to the header. The ordinary editable DOCX header now has a 100-point row budget, with extra line height reserved for wrapped domain, workspace, framework and origination text. Do not treat paragraph spacing alone or successful one-page pagination as proof of spacing parity. Compare the actual Pages import against the PDF at equal physical scale. The compact SITS header was inspected directly in Pages; 18 export tests and type checking passed, and all 28 detailed pages remained pixel-identical in the bundled render. No scoring, evidence, PDF layout or recurring cost changes.
