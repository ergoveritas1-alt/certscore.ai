# CertScore.ai CMP availability followup

Local only, based on `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`.
This extends the local CMP/GPC readiness fixes described in
`cmp-gpc-readiness-report-fixes-2026-11-02.md`. Nothing is pushed, published or
deployed. The earlier verification receipts remain separate and unchanged.

## Evidence and scope

The two already completed CNN scans distinguish an independently usable runtime
visit, which identified OneTrust, from an unusable consent-proof visit. The
public lane summary groups both `blank_or_unusable_page` and `loading_or_stalled`
under `blank_or_unusable`; it cannot establish which underlying reason applied.
The original report has 12 unassessed criteria and one independently observed
privacy link. The subsequent report has 13 unassessed criteria. Neither establishes
CMP readiness, the browser failure's cause, or a sale/sharing On/Off comparison.

One tightly scoped read-only operational-metadata lookup for the existing fresh
scan's consent invocation returned two events, with pagination remaining, and no
allowlisted typed cause. Raw log text was neither printed nor retained. This
partial lookup does not establish that all logs lack a cause. No worker artifact
or production database was accessed. No further rescan was made: the local
changes are not deployed, and the existing two runs already repeat the coarse
limitation. Another unchanged deployment run would not exercise these fixes.

## Optional neutral projection

`certscore.cmp-audit-availability.v1` is an optional sibling within the existing
public CMP experience, derived from the existing consent-control report gate.
It distinguishes missing/invalid assessment, scan mismatch, no-go, unverified
document, unusable visit and unavailable coverage. Its presence does not alter
that gate or create a finding. It contains fixed observation, investigation and
retest wording, at most eight allowlisted assessment limitation codes, and
`scoreEffect=none` / `findingEffect=none`.

Codes require a validated same-scan assessment. The existing
`sourceAssessmentHash` is an **FNV-1a assessment reference**, not the original
worker SHA-256 receipt. Missing, malformed or wrong-scan assessments have a null
reference and no codes. The builder neither fetches nor rehashes any source.
Unknown strings, URLs, tokens, cookies, headers and arbitrary diagnostic text
cannot enter this packet. The strict runtime schema rejects extra fields,
duplicate/unbound codes, changed effect literals and noncanonical wording.

This is descriptive availability metadata from the persisted typed assessment.
It does not borrow controls from the independently usable runtime visit, infer a
CMP defect, weaken document proof, establish absence or promote unknown criteria.
Existing canonical findings, severities, priorities, score effects and criterion
statuses remain unchanged.

## Shared consumers and compatibility

The web CMP details expander and PDF appendix use the same packet wording. API,
canonical JSON and SDK evidence reconstruction carry it through the existing
CMP audit projection. The standalone API schema, generated OpenAPI schemas,
named SDK type and package exports are updated by
`sync-detailed-evidence-contract.ts`. Public runtime packages import no private
contracts. The generic MCP evidence response retains the structured audit; it
does not reinterpret availability as an opt-out failure. Existing GPC guidance
continues to use its separately shared web/API/PDF/Markdown/MCP projection.

PDF preview summaries now say "retained criteria" rather than claiming all rows
were assessed. No new PDF priority is introduced. California/EU scope and the
GPC table's independent proof requirements remain intact. Old packets may omit
availability. No report-time artifact read, historical reconstruction, migration
or backfill is introduced. The existing local materialization cache change to
v44 covers the combined local work; global projection v27 stays unchanged.

## Local verification and costs

Final receipts, source hashes, visual review, checks and remaining limitations are
recorded separately in `outputs/cmp-readiness-2026-11-02/followup/verification.md`.
Tests use fixtures and request interception. Browser review exercises Enter and
Space at 390px and 1280px. Generated California/EU PDFs are rendered locally.
The broader preflight uses an isolated loopback-only PostgreSQL cluster and
blocks unexpected network traffic. Its only public allowance is the separately
authorized exact GitHub MCP v0.2.32 metadata GET, with redirects forbidden and
no asset download. It verifies that existing release, not publication of this work.

The synthetic availability packet is 884 bytes, or 899 added bytes including its
experience field. With the earlier readiness/guidance addition, the representative
combined increment is 1,508 bytes before duplication. Local packet generation
measured a 0.005542 ms median and 0.007334 ms p95 across 2,000 samples after 200
warmups. The entire CMP projection measured a 0.060958 ms median; that is a whole
projection measurement, not an incremental Lambda measurement. The standalone
public helper minifies to 4,446 bytes / 1,711 gzip bytes with the existing Zod
import external; the actual application bundle delta was not measured.

Use **one combined conservative allowance of $0.50/month** for all current local
CMP/GPC changes at 100,000 scans and 30-day retention. This supersedes the earlier
$0.25 planning allowance, rather than adding another allowance. The model reserves
2 KiB per scan in six copies, 4 KiB of transfer per scan including code delivery,
and 2 ms at 3,008 MB. At planning rates of $0.15/GB-month storage, $0.15/GB
transfer and $0.00002/GB-second compute, this models $0.25751/month before rounding
up. These are disclosed planning assumptions, not a current provider quote;
retention and repeated reads scale cost. No configured infrastructure, capacity
or paid-service change is made. Local checks add $0 recurring AWS cost. No
production coverage, production timing improvement or Lambda savings is claimed.

## Exclusions and future release order

The exact CNN browser/capture failure and underlying GPC not-ready reason remain
unresolved from the permitted retained evidence. The code now preserves specific
typed reasons when future materialization has them; it does not manufacture them
for existing CNN reports. Capture budgets, waits, retries, adapters, navigation,
choice actions, monitoring and historical interpretation are outside this work.

For a separately authorized future release, ship compatible API/report and
SDK/MCP consumers before producer packets through repository-controlled AWS
workflows. No deployment or package publication is authorized by this note.
