> **Current policy:** See the October 16 local implementation below. GPC customer results and scoring are suspended; earlier GPC guidance is historical.

# Regulatory report focus and privacy workpapers

A completed report has one retained evidence set and two presentation focuses:
`gdpr_eprivacy` and `ccpa_cpra`. California defaults to CCPA/CPRA; Germany and
Ireland default to GDPR/ePrivacy. Either can be selected without starting a scan.
The actual origin stays visible, and a different regional view does not claim
that region's visitor experience was tested. Share links and PDF/JSON downloads
retain `reviewFocus`.

The shared report layout and score inputs stay unchanged.
The CCPA/CPRA focus highlights the existing GPC workpaper and opens privacy
choices/notices. There is no separate CCPA score or new legal conclusion.
Existing California GPC policy is unchanged. GPC response, verified signal
delivery and comparison coverage remain independent; neither a completed run nor
a vendor's presence proves GPC honoring.

## Evidence contract

### Regulatory priority context (local implementation, October 16, 2026)

This section supersedes the historical GPC presentation/scoring guidance below.
The owner suspended GPC customer results and score deductions on October 16.
Original assessments remain retained internally. Current concern policy is
`california-gpc-response.v2-suspended`, overall score version is v11 and site
score version is v10. Historical GPC effects are excluded by shared scoring;
old numeric scores with those effects are recomputed from canonical evidence,
not increased by 15 after flooring. Unrelated historical numeric scores remain
unchanged. No GPC result or placeholder appears in customer reports or report
exports; public API resources return null. Capture remains internal and unchanged.

The executive overview and Regulatory Risk Review share a mode-specific selector
over already-projected identities. General accessibility and unmapped site issues
appear under Other issues. EU-only privacy findings do not become California gaps.
The static context catalog has **31 EU families and six California routes**.
It imposes no 30-item cap and does not claim every EU topic is currently projectable.

Each mapped issue has a brief Why it matters line and a rule link. Expandable
related enforcement examples appear only where a primary source supports the
relationship; they state date, authority, conduct, outcome and case limitations.
They never estimate the scanned site’s fine or equate a scan signal with liability.
No live retrieval or model generation occurs during report rendering.

California routes: supported privacy-policy absence; an exact HTTP 404/410 on a
visible named notice-at-collection or California rights-information link; no
named choice found in a complete dedicated rendered-link/button inspection; an
exact privacy-choice HTTP 404/410 destination; and advertising activity after a
separately registered sale/sharing opt-out. The five new routes are factual,
score-neutral reviews, with
applicability and permitted alternative methods unresolved. An empty workpaper,
incomplete inspection, blocked fetch, generic Cookie Settings, or cookie Reject
cannot establish any of them. Missing notice passages never establish omissions.
Clearly named privacy-request routes are retained from the existing rendered
DOM inspection as positive coverage evidence only. Neither a link nor its
absence proves request-method functionality. Notice adequacy, collection-point
coverage and request submission remain unassessed.

The versioned policy-lane `privacyChoiceInspection` and verified action packet
materialize into `ConsentControlAssessment v2.2.californiaPrivacyReview`, an
independently versioned child bound to the same scan/target and original source
hash. Persisted typed assessment → normalized concern → concern policy → unified
finding → mode-specific selection. Historical A/R/O conclusions and source hashes
remain unchanged. No display layer creates, upgrades or repairs a finding.
The original three legacy California families remain deferred; the narrow new
identities do not lift those gates wholesale.

The separate opt-out worker requires explicit rollout intent plus its own feature
flag, a fresh isolated browser, exact target authorization and a registered CMP
recipe with an explicit sale/sharing label. A same-document GPP semantic transition
must independently confirm both opt-outs. A 250 ms grace period precedes a 500 ms
response-backed advertising observation. Generic Save/Reject, preference toggles,
forms and account flows remain unsupported. No GPC signal is used. No response in
that brief window is not proof of compliance. See the [approved budget/design](scoring/california-opt-out-execution-proposal.md).

Review at `/dev-fixtures/regulatory-review` on localhost:3000. These are clearly
labelled illustrative fixtures, including the supplied sits.com excerpt, not a
fresh/imported scan. Cycle 31 EU and six California scenarios, empty states,
all-topics view and Other issues. Ten further California topics are explicitly
coverage work: choice symmetry, excessive verification, notice at collection,
disclosure contradictions, retention, sensitive-information limits, request
methods, privacy-notice accessibility, minor opt-in and contractual restrictions.
Thirty would overstate public-scan coverage; this smaller California set is the
honest current boundary. Add topics only when their dedicated evidence supports them.

The owner approved a **combined $50/month ceiling at 100,000 eligible scans** for
the bounded observer, including passive metadata and report-transfer overhead.
Worker maximum: five seconds total, at most 4 GB; browser budget three seconds.
No added tail wait, retry, model call, screenshot, retention extension or later
publication. Rollout flags remain disabled and nothing is deployed. Current
incremental production spend is $0. Validate real-site coverage/timings before rollout.

### Persisted workpaper

Canonical materialization projects `certscore.privacy-audit-evidence.v1` only
from a verified original bundle. The persisted runtime projection retains its
source hash, scan identity, timestamp and evidence references. Reports, exports
and API v2 `privacyAuditEvidence` read that projection; they do not reconstruct
observations from presentation text. The SDK and MCP scan resource use the same
public schema. Old records without this projection stay unknown; no backfill or
rescan is triggered.

Direct observed links distinguish Do Not Sell/Share, Your Privacy Choices and
Cookie Settings. A common-path fetch, nested policy link or generic rights link
does not prove a starting-page opt-out control. New rendered-link observations
retain typed visibility and accessible-name source from the existing browser
capture. Only a visible, named link with matching typed classifier evidence can
enter the workpaper; hidden and URL-only links remain discovery candidates.
The policy lane carries that proof through static/rendered duplicate merging and
binds new rendered proof to the captured starting-page URL. Static HTML alone
does not establish visibility, including when the policy lane skips rendered
discovery under its existing budget.
Retained, display-safe HTTP destinations remain available even when document
fetching was not permitted or attempted. Fragment, JavaScript and self links
retain a null destination; retrieval and interaction states remain separate.
Visible JavaScript controls need retained geometry and matching document
identity. Missing controls remain unknown because existing privacy-policy
search does not establish complete privacy-choice inspection.

Historical persisted v1 workpapers remain readable. When report navigation
rematerializes an older bundle without link-visibility fields, it preserves an
existing workpaper only if its scan ID, verified source hash, document URL and
capture time match that bundle. A new projection from old raw evidence alone
does not infer visibility or add a control.

Only usable, target-owned retained policy text can supply notice passages.
`california_notice_passages.v1` locates bounded topic excerpts deterministically;
it does not evaluate adequacy, prove sale/sharing or assess notice placement at
collection points. Maximum output is 12 controls, four documents and five
480-character passages per document. Truncation and partial coverage are explicit.
This observational workpaper creates no normalized concern, finding or deduction.
Any future such effect requires the normal concern/policy/unified-finding path.

## Exports

`/api/scans/{scanId}/report-export?format=csv&reviewFocus=ccpa_cpra` returns a
tracking workpaper. `format=json&workpaper=tracking` returns its structured
counterpart. They cover the starting page; full-site JSON remains the separate
additional-page inventory export. A manifest preserves scan identity, origin,
timestamp, coverage and retained/included/omitted counts even for empty CSVs.
Inventory is bounded to 500 rows by the existing report appendix. Sale, sharing
and vendor-specific GPC honoring remain `not_assessed`. CSV cells are quoted and
formula-leading values are neutralized.

Accept/Reject exports reuse the established report-eligibility rule: an observed
control or independently verified completed action permits the outcome to be
shown. An unobserved control with no verified action produces no after-action
section. Existing registration, findings and scoring rules are unchanged.

## Scope and cost

No new browser lane, page visit, retry, timeout, model call, database migration,
provisioned capacity or retention period is introduced. Expected incremental
metadata storage is under $1/month at 100,000 scans/month and 30-day retention
for typical bounded workpapers. This estimate was disclosed before proceeding;
larger volume or retention requires a fresh estimate. No deployment or live scan
is part of this change.

Separate jurisdictional scoring, executed DNS flows, new coverage/absence
findings, additional-page policy analysis, and forced paired geographies remain
outside this implementation.

## Internal CCPA scoring review

Run this offline against a downloaded canonical report JSON (v6):

```bash
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json apps/web/scripts/review-ccpa-scoring.ts /path/to/report.json
```

It emits `certscore.ccpa-scoring-review.v1` with four checks: GPC response,
sale/share choice surface, sale/share opt-out effectiveness, and notice evidence.
`observed` means evidence exists, not that a requirement passed. Missing,
malformed, historical or incomplete evidence remains explicitly limited;
untested behavior stays `not_assessed`. Cookie Settings and cookie Reject cannot
stand in for a sale/share opt-out. Notice excerpts do not establish adequacy.

The review copies the existing GPC policy result for context and never applies
it again. It produces no numeric score, findings, persisted changes or customer
output. Source versions, hashes, origin and evidence references are retained;
the tool trusts the downloaded export and does not reverify original source
bytes. Use trusted exports only. No scan, network, model or database calls are
made; incremental recurring infrastructure cost is $0/month.

Before introducing a separate public score, review these four checks against
retained examples, decide the minimum evidence required, and approve calibrated
weights. Do not turn unknown evidence into a pass or reuse the legacy California
score. The current review explicitly records the unassessed behavior and notice
checks, so a high number cannot conceal them.

The [September 25 retained-evidence review](scoring/ccpa-scoring-calibration-2026-09-25.md)
tested that decision against 306 completed historical scans. Only two had a
determinate comparison with qualifying advertising/marketing activity. It
recommends retaining the four evidence checks and existing GPC rule, with no
standalone numeric CCPA score until the missing behavior can be assessed.

## GPC results presentation

Lead with facts from the existing canonical GPC observation: classified tracking
requests, page/browser signal delivery, readable site-recorded sale/sharing
opt-out states, GPC receipt and visible acknowledgment. Unknown fields do not
become repetitive result cards. Positive retained facts remain visible when the
paired comparison is indeterminate; a zero-request statement requires complete
observation coverage. Recorded opt-out state does not imply that GPC caused it.

The report headline, CCPA focus link and evidence card use those observations.
Comparison diagnostics remain in an expandable section; PDF exports also put
the observed facts first. Existing canonical findings, comparison outcomes,
historical evidence and scoring remain unchanged. This presentation change adds
no capture work, model call, persistence or recurring cost ($0/month).

### Bounded GPC comparison

The approved `certscore.gpc-activity-comparison.v1` supplement shows Baseline → GPC advertising/marketing and analytics/replay request counts with the matched 250, 500 or 1,000 ms duration. Both report focuses use the same persisted unified GPC evidence, as do API/Pulse, SDK/MCP and JSON/PDF exports. Full-session observations remain first. The original response assessment and California deduction are unchanged; short-window zeros do not become suppression or honoring claims. Historical records remain unchanged. See [the approved integration](scoring/gpc-bounded-comparison-proposal.md).

## API, SDK and MCP workpaper parity

API v2 `privacyAuditEvidence` is explicitly typed in SDK 0.2.13. MCP 0.2.24 exposes
its source-bound compact controls/notice topics as `privacyAuditSummary`, with
full evidence in `detail=full`; existing byte ceilings disclose omissions.

`GET /api/v2/scans/{scanId}/report-evidence?workpaper=tracking` reuses the canonical
tracking workpaper and existing workspace/public authorization, read throttles,
snapshot-bound pagination and five-minute report download capabilities. Add
`format=download` for JSON or `format=csv` for the inventory CSV. The same selector
is available on the existing MCP report-evidence tool and SDK reader. Selection
must be preserved during pagination. This export is explicitly starting-page
only, including for scans with additional pages.

No capture, findings, score, persistence, retention or capacity change. Estimated
incremental bounded summary transfer is under $1/month at 100,000 reads; requested
workpaper reads reuse existing quotas and substitute for larger report exports.

## Agent guidance and examples (MCP 0.2.25)

Packaged Cursor 1.0.5, OpenAI 2.0.1 and Claude Code 0.2.25 instructions lead with
retained GPC observations and matched-window counts independently of paired status.
They distinguish completed action execution from confirmed consent, use canonical
findings for score effects, and retrieve existing scan workpapers only when relevant
to the audit/export request. Public MCP/SDK pages include retained-scan examples,
JSON/CSV downloads, selector-preserving pagination and integration refresh guidance.
Plugin source versions are prepared in the repository; third-party portal submission
and approval are separate from the hosted MCP and npm release.

This is wording and documentation only: no capture, scoring, persistence or capacity
changes. Extra bounded guidance traffic remains below $1/month at 100,000 reads;
no automatic workpaper request is added.

### Reusing EU context families for California

Reuse retained facts and assessment machinery where appropriate, with an independently qualified California concern. Do not copy a GDPR status, legal explanation or enforcement example into the California mode. Privacy-policy availability is already shared. Next priorities are collection notices, purposes/retention, recipient disclosures, California rights methods, equal privacy choices and accessibility barriers bound to a privacy notice/control. These require California-specific typed assessments before customer promotion; presence-only semantic passages cannot establish missing disclosures.

Tracking, embeds, replay, fingerprinting and sensitive-context evidence may support a California disclosure comparison or sale/sharing review only with the additional required proof. Activity before consent is not by itself a California opt-out failure, and cookie Reject is not a sale/sharing opt-out. Keep GDPR legal-basis, DPO and EEA-transfer topics EU-specific. California ADMT requires separate applicability and effective-date checks. General transport warnings remain technical issues unless a separately supported personal-information security concern qualifies.

The development preview includes the reuse matrix and ten further California assessment topics, separate from the four currently mapped routes. Coverage should grow with supported evidence rather than a 30-item quota. Official context: CPPA regulations effective January 1, 2026 (https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf), and Honda's March 12, 2025 resolution covering excessive verification, unequal choices, agents and contracts (https://cppa.ca.gov/announcements/2025/20250312.html). Honda's $632,500 total resolved multiple claims; it is not an estimated penalty for a scan finding.
