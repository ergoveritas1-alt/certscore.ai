# Surface existing bounded GPC comparisons

September 25, 2026. Owner approved the proposed integration; implemented locally, not deployed.

## Result

The existing fixed-window comparator works without requiring network quiet.
Of 28 locally retained baseline/GPC pairs, 12 produced measurements, including
seven whose stored response assessment was indeterminate. Eleven measured pairs
are public sites; one is the owned ErgoVeritas canary. This selected historical
sample is not a production completion-rate estimate.

The seven recovered measurements contain two unchanged-activity results and five
with no classified activity in either early window. Trenitalia retained one
advertising/marketing collection request in each session; Our World in Data
retained one analytics/replay-classified request in each. These are useful
counts even though they do not establish a change caused by GPC.

The existing windows end at 250, 500 or 1,000 milliseconds after document commit.
Four measured pairs have zero early-window baseline trackers but activity in
the longer stored comparison. Keep the full GPC-session observations prominent;
the short comparison supplements them. Do not replace longer-window facts with
an early zero or call it suppression.

## Approved integration

Added a **Baseline → GPC** table to the existing GPC workpaper:

| Example result | Display |
| --- | --- |
| Trenitalia retained pair | Advertising/marketing requests: **1 → 1** · first **1,000 ms** |
| Our World in Data retained pair | Analytics/replay requests: **1 → 1** · first **1,000 ms** |
| No classified requests in either session | **0 → 0** · measured duration; no reduction percentage |

Show advertising/marketing and analytics/replay separately. Surface measured
counts and duration directly. Keep technical diagnostics expandable. Continue
showing full-session observed requests, site-recorded opt-out state and GPC
receipt already available in the report. No extra warning banner or generic
indeterminate headline is needed for a valid measurement.

Implementation scope:

1. Reuse `buildGpcImpactAssessment` at the existing verified passive-lane merge,
   with original already-loaded worker bytes and pointers. Add a versioned,
   bounded production evidence projection for measured results; preserve the
   internal assessment's internal-only contract rather than flipping its flags.
2. Persist scan/source hashes, matched duration, classified service/request counts
   and provenance through typed runtime evidence → normalized GPC concern →
   concern policy → the existing unified GPC finding. This is contextual evidence,
   not a new gap, severity promotion, checklist credit or top finding.
3. Add the optional typed comparison to the GPC API/export contract and generated
   SDK/MCP consumers. Render the same canonical projection in report and PDF.
   Historical records remain unchanged; no backfill or recomputation on read.
4. Cover measured/unknown, zero-baseline, churn, incomplete bytes, missing windows,
   and unchanged California deductions at those boundaries.

No additional browser, geo, page, retry, timeout, model call, object fetch or
late publication. Keep the existing 15-point GPC policy and response assessment
unchanged. Deploy compatible consumers before producers when release is approved.

Expected incremental cost is below $1/month at 100,000 scans and 30-day retention,
assuming original worker bytes are already in memory and at most three copies of
the compact projection. A local 112-run replay averaged 10.84 ms (p95 21.59 ms);
the largest result was 1,731 bytes. These are local measurements, not production
Lambda billing. Validate the integration's combined compute/storage estimate
before release; if it reaches $1/month, obtain the cost approval required by
AGENTS.md. The lower-cost alternative is the already-implemented single-session
facts without a new persisted comparison.

## Verification and provenance

Reused `scripts/replay-gpc-impact-cohort.ts`; did not relax checks or modify raw
evidence. The manifest uses the original pointers in
`outputs/scan-evidence-review-2026-09-14/retained-verification.json`.
All 307 submitted cohort rows remain in the replay denominator: 28 have local
source pairs, 279 do not. Sixteen available pairs did not qualify. Missing local
files are not a claim that production never captured those files.

The replay summary is [retained here](gpc-bounded-comparison-replay-2026-09-25.json).
The local manifest/full output are in `tmp/ccpa-scoring-calibration/bounded-*`.
Seventeen focused tests passed, including a real localhost Chromium pair with
a continuously busy page, a controlled baseline-only request and readable
sale/sharing state changes. No public sites were contacted. This assessment
adds no recurring cost and made no production changes.

The owner approved this narrow integration after reviewing the proposal.
Deployment and new scoring weights are outside this approval.

The production contract is `certscore.gpc-activity-comparison.v1`. The coordinator
reuses original verified baseline/GPC worker bytes to create the compact result.
WC01 binds it to the scan ID and response source hashes at materialization, then
persists it through the normalized concern and existing unified GPC finding.
Reports, API/Pulse, SDK/MCP, JSON and PDF share that projection. Missing or
unverified measurements are omitted; historical responses are not reconstructed.
The internal impact assessment retains its original internal-only flags.

Estimated incremental cost remains below $1/month at 100,000 scans and 30-day
retention; no new object fetch, browser work, invocation or model use is added.
Compatible consumers must ship before the producer in a separately approved release.

Integration verification: the 137-test focused report/API/SDK/MCP suite passed;
the separate 70-test policy/report/MCP regression suite passed, including a
short-window zero that leaves the existing 15-point California deduction intact.
Nine coordinator verification cases, the materialization boundary case, and a
real localhost browser pair also passed. Contract generation drift checks,
contracts/API/SDK/MCP builds, and web/scan-core/Lambda/MCP typechecks passed.
The broader materialization suite has an unrelated IMOU policy-fragment failure;
the same assertion fails with the unmodified HEAD test and implementation. It
was not changed by this integration. No deployment or public scans were run.
