# CertScore.ai historical opt-out coverage and daily collection

The owner requested filling the historical opt-out gap and retaining these
results going forward. The prior dashboard had 686 persisted control assessments
covering October 23–early October 27; 4,075 reportable rows had unavailable
assessment coverage. Public v4/v5/v10 exports do not carry an opt-out boolean.

One bounded read-only AWS ECS task retrieved 4,838 small existing canonical
control projections for the frozen October 1–November 1 cohort. It used original
creator credentials, canonical bot-key names, canary exclusions, a 45-second
statement limit and a 5,000-row bound. The JSON output is 16,007,673 bytes and
its compressed transport is SHA-256 verified. No raw runtime bundle, source
site, private database credential, report API or production write was used.

The `certscore.audit-opt-out-extract.v1` reads only persisted assessment version,
identity, controls, coverage and provenance inside the existing report payload.
It carries the report projection source hash and version, plus the original
creation timestamp and creator. Only exact scan/time/version/generation matches
may supplement `sealed.control.privacyOptOut`. Unknown document/layer coverage
may retain an explicit canonical unknown; positive/negative states require a
matched first-layer document. v2.2 negative results need complete control-specific
inspection and canonical source references. Missing, changed-generation or
malformed extracts cannot supply a binary result.

Database projection extraction is an independently named comparison source:
`persisted_control_extract/<projector>/<projection>/certscore.audit-opt-out-extract.v1`.
It is not a full original evidence-bundle audit. Original sealed states/sources
remain unchanged, public metrics never fall back to the extract, and no origin
filter, finding, score, canonical assessment or historical report is rewritten.
Mixed-source aggregate rates/deltas remain null, with source details available.

The current daily ID query now includes the same bounded `control_assessment`
field set. It remains ONE existing ECS task per refresh. The input-preparation
tool carries prior immutable receipts and appends the current query, retaining
rolling-month history instead of only the 48-hour overlap. A current query that
omits control extracts on completed rows fails preparation. A missing manifest
fails building; source bytes, generation joins and application of the extracts
are checked again by the publication gate. Material missing new coverage must
be reported, rather than hidden as a measured zero.

The existing automation keeps its project, local execution, gpt-6.1-sol/xhigh,
daily 05:00 America/Los_Angeles schedule and notification intent. The updated
prompt and pinned procedure require the opt-out preparation/build/validation
steps. No second automation or second daily query is added. Future dashboard
coverage therefore does not depend on deploying the separate public-export v11
code change, which remains local.

One-time recovery is conservatively estimated at $0.03. Daily single-query
transport is budgeted at $0.03/run or $0.93/31 days, a $0.31/month increment
below the $1 approval threshold. The estimated current-month ledger becomes
$0.05 and the conservative forecast $1.25, inside the approved $5 allowance.
These are planning estimates, not AWS invoices. No new capacity, paid retention,
model calls, browser scans, SDK calls or privacy actions are added.

The run retains original source hashes, transport/task receipts, reviewed pin
changes, focused tests, by-date/source reconciliation and file-only desktop/mobile
and CSV verification. Prior snapshots, checkpoint, issue/release ledgers and
model-transition history remain preserved. Any unmatched original generation
remains unavailable; source absence never supplies absence of a control.
