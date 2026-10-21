# CertScore.ai local fifteen-second Baseline → GPC diagnostics

## Decision

The evidence supports **testing a five-second minimum, two seconds without a
new request start, and a fifteen-second hard cap**, using the same comparison
duration for both visits. It does not support enabling that rule in production
yet. Ordinary local scans retain their existing five-second setting; this study
adds only an explicitly requested, local-only fifteen-second diagnostic override.

The experiment changes the earlier recommendation to reset only for novel
privacy evidence: that filter stopped before all three sites' late gains. Their
ordinary loading activity was an important precursor to later collection.

Two-second all-request quiet matched three-second quiet on the measured evidence
while stopping sooner. However, both rules reached fifteen seconds on the three
busy sites. Fixing retention coverage and evaluating a larger cohort are necessary
before choosing a production policy or claiming evidence preservation generally.

## Sample and coverage

Ten new public targets were captured locally on October 20, 2026,
19:18–19:21 PDT. The prior ten-site sample was deliberately excluded. The owner
approved a new one-time cooldown exception; held, blocked, retired and
repository-prohibited targets remained excluded. Each target received one run,
with no automatic retries, region switches, or consent/form actions.

- Nine pairs support the five- and eight-second checkpoints.
- Eight pairs support ten seconds.
- Seven pairs support all checkpoints through fifteen seconds.
- Nordstrom and Microsoft retain shorter usable intervals but not complete
  fifteen-second comparison proof. Home Depot's Baseline inventory remained
  partially unsettled and failed the canonical access-quality gate.

Those three cases are unknown at fifteen seconds, **not clean or no-benefit
results**. The quiet-rule analysis uses only the same seven fully verified pairs.
Missing coverage is particularly important because busy pages can exceed the
existing bounded compact-ledger allowance, creating selection bias.

## Fixed checkpoints

Meaningful means a newly endpoint-attributed advertising/marketing or
analytics/replay canonical service, or first collection-endpoint request evidence
for a service. Additional requests to already-established services are secondary.
Purpose aliases are deduplicated by canonical service ID. This is an evidence
metric, not a new finding, distinct-recipient count, or scoring policy.

| Checkpoint | Verified pairs | Sites gaining meaningful evidence beyond five seconds | Among the seven complete pairs, sites still missing meaningful fifteen-second evidence |
| --- | ---: | ---: | ---: |
| 5 seconds | 9 | Reference | 3 / 7 |
| 8 seconds | 9 | 3 / 9 | 3 / 7 |
| 10 seconds | 8 | 3 / 8 | 3 / 7 |
| 15 seconds | 7 | 3 / 7 | 0 / 7 |

On the common seven-site subset, meaningful evidence appeared in each interval:

| Interval | Sites adding meaningful evidence |
| --- | ---: |
| 5 → 8 seconds | 3 / 7 |
| 8 → 10 seconds | 2 / 7 |
| 10 → 15 seconds | 3 / 7 |

These are overlapping sites, not eight distinct sites. **Spotify, CNN and
FullStory** contributed the gains; all three still added meaningful evidence
after ten seconds. Overall, three of seven fully verified pairs (42.9%) benefited
beyond five seconds; three of all ten attempts showed benefit and three attempts
remain unknown at fifteen seconds. This purposive pilot is not an internet-wide
prevalence estimate, nor directly comparable to the prior sample's 25% rate.

### Independently checked late examples

| Target / condition | Offset after document commit | First collection-endpoint evidence after ten seconds |
| --- | ---: | --- |
| Spotify / Baseline | 13.602 seconds | Google Ads / DoubleClick, `stats.g.doubleclick.net/g/collect` |
| CNN / GPC | 11.261 seconds | BrightLine, `events.brightline.tv/track` |
| FullStory / Baseline | 10.605 seconds | LinkedIn Ads Pixel, `px.ads.linkedin.com/collect` |

Original request IDs, timestamps, URL digests, endpoint classification and
request-header values were checked against the retained compact ledger. Each
service's collection proof was absent from that condition's first ten seconds.
The CNN request retained `Sec-GPC: 1`; the Baseline examples did not. These are
observed requests, not legal conclusions or proof of causal GPC behavior.
Original responses are retained in the example audit but do not establish how
the recipient processed the data.

## Replayed quiet rules

Both strategies have a five-second minimum and fifteen-second maximum. Quiet
means no eligible **request start**, not a completed request, a fully loaded
page, or no in-flight requests. The original proposal resets on every captured
request start. The alternative resets only when a service first appears or its
first collection-endpoint request appears.

| Reset strategy / quiet interval | Median stop | Mean stop | Sites reaching cap | Sites with meaningful gains beyond five | Sites missing meaningful fifteen-second evidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| All requests / 2 seconds | 8.25 s | 9.85 s | 3 / 7 | 3 / 7 | 0 / 7 |
| All requests / 3 seconds | 9.25 s | 10.27 s | 3 / 7 | 3 / 7 | 0 / 7 |
| Novel evidence / 2 seconds | 5.00 s | 5.12 s | 0 / 7 | 0 / 7 | 3 / 7 |
| Novel evidence / 3 seconds | 5.00 s | 5.28 s | 0 / 7 | 0 / 7 | 3 / 7 |

The all-request two-second rule saved an average **5.16 seconds of observation
versus fixed fifteen seconds**, retaining the same measured service/first-
collection evidence in these seven pairs. Three-second quiet added 0.43 seconds
on average without additional meaningful evidence in this pilot. These are
simulated observation durations, not measured scan-latency or billing savings.

The novelty-only rule missed every late-gain site even with final retained
classification available: it stopped at five seconds before later services
started. Excluding ordinary loading activity from resets is therefore not a
safe optimization on this sample. Conversely, the all-request rule can be held
open by background polling; the hard cap remains essential.

### Per-target outcome

| Target | Complete through | Meaningful gain beyond five | Two-second / three-second all-request stops |
| --- | --- | --- | --- |
| `sqlite.org` | 15 s | No | 5.00 / 5.00 s |
| `www.hannoveranerpzvbawue.de` | 15 s | No | 8.25 / 9.25 s |
| `spotify.com` | 15 s | Yes | 15.00 / 15.00 s |
| `www.nordstrom.com` | 10 s | Unknown at 15 s | Not evaluated |
| `usa.gov` | 15 s | No | 5.17 / 6.17 s |
| `cnn.com` | 15 s | Yes | 15.00 / 15.00 s |
| `microsoft.com` | 8 s | Unknown at 15 s | Not evaluated |
| `chase.com` | 15 s | No | 5.49 / 6.49 s |
| `homedepot.com` | Canonical comparison unavailable | Unknown | Not evaluated |
| `fullstory.com` | 15 s | Yes | 15.00 / 15.00 s |

## Method and limitations

- The canonical selector used a fresh successful central contact-history export.
  The previous study's reviewed contact ledger was committed alone as
  `05d4ddfc2`, with owner authorization. All unrelated uncommitted work stayed
  untouched. New contacts are recorded centrally under idempotent key
  `gpc-duration-15s-2026-10-20-approved-10`; the new repository ledger candidate
  remains available for review rather than being silently promoted.
- Captures used the existing local standard-profile DAG and independent passive
  Baseline/GPC sessions. The configured regional profile was `eu-west-1`; local
  macOS egress is not verified Irish production egress. Other lanes retained their
  existing behavior. No public target received an Accept/Reject/opt-out action.
- Before public runs, local browser fixtures verified both signal conditions,
  late requests at six/nine/thirteen seconds, preservation of an initial form
  removed later, one signal readback, and parent cancellation. The owned
  ErgoVeritas run verified all four request checkpoints with identical request
  sets. Its overall DAG failed because the initial shell lacked the policy
  extraction key; both passive artifacts verify through their retained failure
  terminal pointers. It was not retried. The existing configured key was loaded
  before public runs; its value was not displayed.
- Analysis checks original artifact size/hash pointers, canonical assessment,
  page HTTP signal delivery, context/document binding, checkpoint identities,
  actual readback timing, and complete retained request sets. Worker startup
  delivery and the separate GPC response assessment are not upgraded.
- Baseline and GPC share a simulated duration derived from the union of each
  lane's eligible offsets relative to its own commit. They are never compared
  with unequal observation lengths. Events at or after a simulated stopping
  boundary cannot reopen it; half-open checkpoint boundaries are preserved.
- This is offline replay of the same fifteen-second visits, not a deployed
  adaptive scheduler. Real-time cross-lane coordination, scheduling races,
  classification availability and in-flight handling were not measured. The
  novelty candidate uses final attribution and is optimistic about its online
  availability; even so, it missed evidence.
- Existing evidence limits were not enlarged. Nordstrom's Baseline compact
  ledger covers ten seconds and Microsoft's covers eight; declared later hashes
  and bounded display samples cannot substitute for missing complete request
  identities. No absence or no-benefit conclusion is drawn from those limits.
- Cookie/storage/CMP snapshot changes, legal findings, scoring, and evidence
  preservation across all other modules were not compared by checkpoint.
  A request-free period does not guarantee that a delayed tag will not start
  later; neither quiet rule nor a fifteen-second cap guarantees completeness.

## Cost and production status

**Estimated one-off incremental spend: below USD 1**, disclosed before live
captures. Browser execution was local, so there were no Lambda-duration charges
for these captures. Existing configured capture-model usage and the existing ECS
contact-ledger export/persistence boundary account for potential paid usage. This
is an estimate, not measured billing. No new paid service, model role, recurring
capacity, or production retention increase was introduced.

Production code deployments, flags, scan duration, scoring and customer reports
remain unchanged. The only central write is the mandatory contact-history audit.
The fifteen-second override is accepted only for explicitly requested local
Baseline/GPC workers, never production or inventory crawls. Default five-second
local behavior and legacy production capture behavior remain unchanged. Local-only workers receive
additional budget rather than borrowing other checks' allocations; existing
outer safety caps and parent cancellation remain authoritative.

The quiet-rule timing table cannot be translated directly into production cost
or total latency. Both lanes run in parallel, existing work may dominate the
critical path, and a real adaptive implementation may need additional orchestration.
Any rollout requires a separate cost estimate and applicable owner approval.

## Retained evidence

Study root: `artifacts/gpc-duration-15s-cohort-2026-10-20/`.

- `analysis-plan.json`: metric, quiet rules, approval and cost receipt before runs.
- `selection.json`, `effective-ledger.json`, `run-started.json`: contact selection.
- `duration-comparison.json`: complete checkpoint counts, gained/missed service
  evidence, quiet stops, source hashes, and explicit coverage limitations.
- `late-collection-audit.json`: independently checked redacted late examples.
- `owned-verification.json`: owned canary request proof and honest DAG limitation.
- `runs/`: original per-lane artifacts and terminal manifests; no rescan or repair.
- `scan-quality-calibration-ledger.candidate.json`: reviewed new contact outcomes.

## Validation

All 41 focused tests pass: 33 contract/capture/assessment/analyzer tests, seven
browser/settling regressions, and the local-only dispatch matrix. Coverage includes
default horizons remaining unchanged, exact interval boundaries, both signal
conditions, early form preservation, late requests, cancellation, hard caps,
quiet-gap counterexamples, and fail-closed attribution.

The scan core builds successfully. Scan-core, Lambda, web, and standalone analyzer
helper TypeScript checks pass. The calibration registry check and `git diff --check`
pass. Original retained-source replay reproduces the results; no production
deployment or customer-facing integration was performed.
