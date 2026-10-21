# CertScore.ai local Baseline → GPC duration study

## Recommendation

Use a **five-second minimum for both paired request captures**, measured from
each main-document commit. Keep the three-second checkpoint for diagnostics,
but do not shorten the comparison merely because the page appears quiet at
three seconds. This pilot found collection requests beginning around 3.8–4.8
seconds that a three-second comparison would omit.

This supports the already-approved local five-second experiment, not a
production rollout or an internet-wide detection-rate claim. Before production
enablement, address bounded-retention limitations and validate a larger,
region-stratified sample within the contact policy and approved cost envelope.

## Result

Ten fresh, role-diverse public targets were attempted on October 20, 2026,
18:57–19:00 PDT. Eight had independently verified paired three- and five-second
request checkpoints; two could not support the comparison.

| Outcome between seconds three and five | Sites | Share of eight verified pairs |
| --- | ---: | ---: |
| Meaningful added evidence | 2 | 25% |
| Repeated known classified activity only | 1 | 12.5% |
| No additional classified tracking evidence | 5 | 62.5% |

Both meaningful cases added a previously unobserved canonical service **and**
first collection-endpoint request evidence. These overlap; they are not four
separate sites. Across all ten attempts, two showed benefit and two remain
unknown. The unknowns are not clean or no-benefit results.

### What the extra two seconds captured

Counts below are cumulative three-second → five-second request counts. The
advertising and analytics categories can overlap; do not sum them as unique
requests. Collection counts include only endpoint-attributed classified requests.

| Target / condition | Advertising / marketing | Analytics / replay | Collection endpoints | Canonical services |
| --- | ---: | ---: | ---: | ---: |
| Hotjar / Baseline | 0 → 17 | 3 → 11 | 0 → 13 | 1 → 14 |
| Hotjar / GPC | 0 → 0 | 3 → 3 | 0 → 0 | 1 → 1 |
| Georgia Tech / Baseline | 0 → 0 | 1 → 3 | 1 → 3 | 1 → 2 |
| Georgia Tech / GPC | 0 → 0 | 1 → 3 | 1 → 3 | 1 → 2 |

- **Hotjar:** the target redirected to `contentsquare.com/hotjar/`. Baseline
  retained an advertising collection POST to `ad.doubleclick.net/ccm/s/collect`
  at 4001 ms, then additional advertising and analytics collection requests
  through 4768 ms. Thirteen new canonical services appeared overall, including
  advertising integrations and Google Analytics. Not every new service had
  collection proof. GPC had no corresponding classified late activity in this
  visit; independent-session variation means this alone does not establish a
  causal GPC response.
- **Georgia Tech:** Google Analytics `/g/collect` POST requests appeared at
  3871–3874 ms in Baseline and 3760–3771 ms in GPC. The GPC requests retained
  `Sec-GPC: 1`; Baseline did not. Both Baseline requests have retained HTTP 204
  responses. GPC response statuses were not retained for these requests. The
  result is request evidence, not a claim about processing, honoring, or legality.

The retained example audit checks each original request's event ID, timestamp,
URL digest, collection classification, and actual request-header value against
the compact ledger. The shared assessor separately verifies original artifact
sizes/hashes, document binding, context, page HTTP signal delivery, and paired
coverage. This request-only study does not establish worker startup signal
delivery or override the independent GPC response assessment.

### All attempted targets

| Target | Sample role | Incremental result |
| --- | --- | --- |
| `linear.app` | SaaS | Unknown: no verifiable common checkpoint after retention |
| `mozilla.org` | Headless/control | No additional classified evidence |
| `hotjar.com` | Behavioral analytics | Meaningful: new services and collection-endpoint requests |
| `gatech.edu` | Education | Meaningful: Google Analytics collection-endpoint requests |
| `www.pdc-uri.ch` | Community CMS | No additional classified evidence |
| `msnbc.com` | Publisher | Unknown: both runtime inventories remained partially unsettled |
| `archonph.com` | Consumer service / GPC | No additional classified evidence |
| `toyota.com` | Automotive ecommerce | Additional unclassified requests only |
| `plannedparenthood.org` | Healthcare / sensitive context | Repeat-only analytics activity; no new service or first collection proof |
| `autowarranty.autos` | Service / GPC | No additional classified evidence |

Linear retained checkpoint hashes but neither compact request ledger; its
bounded ordinary event sample cannot independently reconstruct the checkpoints.
MSNBC retained compact requests, but both runtime lanes reported incomplete
loading-document settling. Neither target was retried or treated as blocked
without canonical blocking evidence. Both remain excluded from the usable-pair
denominator. Longer observation alone does not fix these reliability limits.

## Method and limits

- Used the canonical selector and fresh central contact-history export. The
  owner explicitly approved a one-time ten-site cooldown exception; blocked,
  retired, held, and repository-prohibited targets remained excluded.
- Ran one local standard-profile DAG scan per target, sequentially. Baseline
  and GPC used isolated passive sessions with the same protocol and configured
  `eu-west-1` regional profile. Local macOS egress is not verified Irish egress.
  Accept, Reject, opt-out, and preference interaction were disabled.
- Compared `[commit, commit + 3000 ms)` against `[commit, commit + 5000 ms)`
  from the **same five-second visits**, avoiding a second public run and
  between-run noise. This is not a randomized three-second versus five-second
  latency experiment.
- Defined meaningful evidence before the run: a newly endpoint-attributed
  advertising/analytics/replay service, or first collection-endpoint request
  evidence for a service, in either verified condition. Purpose aliases are
  deduplicated by canonical service ID. Additional requests for a service with
  existing collection proof are secondary, not counted as meaningful.
- This is a small purposive pilot: eight usable sites cannot establish a
  population prevalence, a production acceptance baseline, or causal GPC
  behavior. The healthcare role did not authorize form submission or data entry.
- Cookie/storage snapshots, CMP changes, customer findings, scores, and
  evidence preservation across every other module were not compared at both
  checkpoints. No conclusion about their incremental benefit or absence follows.
- A collection endpoint is not automatically proof of successful receipt or
  processing. Ordinary script downloads are not reclassified as collection.
  Unverified service attribution fails closed.
- Five seconds remains bounded: activity beginning later can still be missed.
  This study does not justify an adaptive three-second stop, an additional lane,
  retries, larger evidence caps, or changed scoring.

## Cost, latency, and operational status

The local browser runs incur no Lambda-duration charge. The required existing
ECS contact-ledger operations and any existing configured capture-model usage
are estimated below USD 1 one-off for this ten-site study, not measured billing.
No recurring service, provisioned capacity, model role, or retention increase was
introduced by the analysis. The earlier approved five-second implementation's
production planning estimate remains separate; this study does not refine it.

The passive lanes run concurrently, so two extra seconds per lane are not
automatically four extra seconds of scan latency. Actual critical-path latency
depends on other lanes. Because this study reads two checkpoints within one
visit, it does not measure production latency or cost savings from stopping at
three seconds.

Production code/configuration and customer reports were not changed by this
study. The only central write is the required operational contact-history audit,
using idempotent run key `gpc-duration-2026-10-20-approved-10`. A repository
ledger candidate is retained for review; it is not silently promoted or committed.

## Evidence and validation

Retained study root: `artifacts/gpc-duration-cohort-2026-10-20/`.

- `analysis-plan.json`: predefined metric and safeguards.
- `selection.json`, `approved-effective-ledger.json`, `run-started.json`: selection
  and contact authorization receipts.
- `duration-comparison.json`: complete verified counts, service additions, source
  hashes, and explicit unusable reasons.
- `late-collection-audit.json`: manually checked endpoint examples without query
  values; original worker artifacts remain unchanged under `runs/`.
- `cohort-summary.json`: all ten attempts plus canonical lane coverage diagnostics.
- `scan-quality-calibration-ledger.candidate.json`: reviewed contact-ledger candidate.

Six focused analyzer tests pass, including boundary/digest/signal verification,
repeat-only classification, service alias deduplication, and unresolved/conflicting
attribution rejection. Together with the shared impact-assessment regression
tests, all 20 tests pass. The helper and its tests pass standalone strict TypeScript
checking. Full retained-source replay reproduces the eight usable pairs and
two unknowns. No production deployment was performed.
