# Cookiebot privacy access and prominence fixes

Local changes only. No deployment, Options/Customize click or historical report
rewrite. Accept/Reject and passive capture remain enabled.

## Supported fixes

The early settled screenshot in the retained scan predates the banner. Its
post-image control inventory incorrectly made that image eligible to consume
the single 80 ms pixel-analysis allowance. The later banner image then had no
allowance. Early eligibility now requires matching, uniquely visible Accept
and Reject controls from the same document, observed before the screenshot
and within 500 ms of it. Ineligible early images do not start a decode. The
existing exact final-pair checks, image safety review, analysis budget and
prominence thresholds remain unchanged.

The passive privacy check previously inspected only a hidden link inside the
CMP. Cookiebot's deferred check now considers canonically classified,
same-origin public policy links on the page. It runs after consent visual work,
using only the unused part of the original 350 ms passive-read allowance and
the remaining module budget. It may scroll once, restores the original
viewport, and never opens the link or a preferences panel. The retained
`passive_public_privacy_links.v1` marker and checkpoint bind that source to the
same document. Foreign origins, loader drift, malformed URLs, timeout and
failed restoration cannot establish reachable-link evidence.

## Fresh EU-Ireland verification

Scan: `cookiebot-link-visual-local-cookiebot-df70defd-84c8-4a75-911c-03293eb68d06`.
Browser and HTTP egress both matched `63.33.9.201`, verified as Ireland.
The scan completed six evidence workers, with no preference worker or packet.

| CMP check | Before | Fresh local result |
| --- | --- | --- |
| Privacy-link access | Not assessed | Observed, after one restored document scroll |
| Accept/Reject prominence | Incomplete | Observed, no material prominence difference met the threshold |

The early image was deferred without analysis. The eligible banner comparison
completed in 10 ms within its existing 80 ms allowance. Basic inventory took
243 ms and deferred privacy inspection took 79 ms, totaling 322 ms within the
original 350 ms allowance. All 61 cookie declarations and 17 service names
remain available. No scoring rules changed.

Unresolved checks decreased from four to two of 13: categories remain Not
assessed because the panel stayed closed, and the missing-declaration check
remains Partially assessed because the retained inventory is incomplete.

## Validation and preservation

The 44 capture, link-access, visual and contract tests passed, as did all 58
CMP projector tests and four shared-capture tests. Final conservative timing
and malformed-URL guards passed their 32-test visual/contract run. Contracts
built; scanner-core and Lambda typechecks passed. Historical assessment replay
was unchanged. Retained final pixels also supported an offline comparison
without a material Accept prominence difference; that analysis did not replace
stored evidence or reports.

All 2,397 retained source files remained byte-identical. Fresh bundle and
manifest bytes passed their recorded size and SHA-256 checks. The contact was
persisted under its own idempotent run key; the reviewed Cookiebot ledger entry
returns to cooldown. Temporary SSH access was removed and the tunnel stopped.

Artifacts: `/Users/benmasek/WC01/outputs/cookiebot-link-visual-local-2026-10-16/`.
Expected additional cost is below $0.50/month at the expected 100,000-scan
workload, plus below $1 total for bounded verification and operational helpers.
There are no new workers, model calls, retries, timeouts or retention changes.
