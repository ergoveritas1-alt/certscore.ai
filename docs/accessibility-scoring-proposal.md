# Accessibility scoring — October 10, 2026

Status: owner-approved and implemented locally. Deployment remains separate.
The central registry is `apps/web/lib/scans/scoring-policy.ts`; `/scoring-review`
renders it directly. Existing historical reports retain their stored score.

## Approved policy

Accessibility contributes to the shared overall CertScore score in both the
GDPR/ePrivacy and CCPA/CPRA views. Jurisdiction-specific privacy calculations
remain unchanged. These weights are product risk weights, not statutory penalties.

| Category | Points, once per report |
| --- | ---: |
| Text alternatives | 3 |
| Accessible names, labels and semantics | 4 |
| Visual contrast | 3 |
| Author-declared zoom restrictions | 2 |
| Insufficient pointer-target size and spacing | 2 |
| Keyboard navigation and reproduced focus barriers, combined | 6 |
| **Combined report-wide cap** | **12** |

Repeated nodes, failed rules in one category, duplicate packets and additional
pages never multiply a category deduction. Keyboard and reproduced focus share
one six-point bucket. The existing zero floor and retained no-go rules apply.

A missing alternative on an image-only link can cause both image-alt and
link-name failures. Verified exact overlap charges the stronger category once.
Where retained image-only-link evidence makes overlap possible but bounded
samples or differently scoped selectors cannot prove exact identity, record
`unresolved` and conservatively charge the stronger category once. This is not a
claim that the nodes are identical. A separately evidenced labeling barrier or
distinct image/link evidence can contribute both categories within the cap.
All failed checks remain visible regardless of score deduplication.

New audits additionally retain bounded opaque DOM identities under
`certscore.accessibility-image-link-identity.v1`. Within the existing axe run,
the image and its direct image-only anchor share an observed link identity.
Scoring compares those IDs only within the same checksum-verified capture and
document. Complete samples with different identities contribute both categories;
matching identities deduplicate once. Text-bearing links, unsampled failures and
frame nodes without direct element references cannot be inferred from sanitized
markup or selector suffixes. Historical audits without these IDs retain the
conservative legacy policy and are never rewritten.

## Canonical evidence and eligibility

Verified retained audit projection → normalized concern → concern policy →
unified finding with versioned typed score effect → central overall scoring.
Display components, raw rule totals and executive prominence cannot create a
deduction. Score effects retain source hash, document token, scan/page identity
and original evidence reference, and fail closed if malformed or stale.

Serious/critical qualifying retained failures are eligible. The two-point zoom
category also allows the supported moderate `meta-viewport` failure with
`wcag144` and an actual `user-scalable=no` declaration; this describes an author
restriction, not reproduced zoom behavior in every browser. Pointer-target
scoring requires `wcag258` and the retained axe insufficient-size and
insufficient-spacing measurements, after its exception evaluation. A small
looking target or manual-review result cannot create a deduction.

An isolated verified unnamed link can score even when the existing executive
prominence gate keeps it audit-only. Keyboard and focus retain their existing
concrete-evidence gates. A reproduced focus trace also needs verified,
document-bound provenance; legacy/unbound traces stay score-neutral. No new
keyboard interactions are introduced.

A limited audit can contain independently verified qualifying failures: score
those failures only. Failed/unbound audits, incomplete/manual-review checks,
unsupported rules and coverage limitations deduct zero.

Full-site scoring unions homepage effects and any already-retained additional
page audits. Additional-page audits require the existing verified original
artifact, completed page/attempt/configuration capture, matching parent/page
identity, document token/URL and capture times. Missing audits remain neutral;
this change does not add accessibility capture to additional pages.

## Retained ASPCA replay

Scan `69574968-3bd4-4f44-9bf6-40275b58a302` retains five failed rules:
contrast (16 instances), image-alt, link-name, meta-viewport and target-size.
The local canonical replay preserves its privacy deductions and produces:

| Original overall score | Accessibility deduction | Local preview score |
| ---: | ---: | ---: |
| 52 | 4 image/link + 3 contrast + 2 zoom + 2 target size = 11 | **41** |

The missing-alt selector is `a[target]:nth-child(2) > img`; the unnamed link is
`p:nth-child(2) > a[target]:nth-child(2)` with image-only link markup. Their exact
identity remains unresolved. The conservative overlap policy avoids charging
both without asserting a verified relationship. Independently proven distinct
barriers would reach the 12-point cap and produce 40.
The new capture closes this evidence gap for future scans after release; it
cannot establish a past DOM relationship or retroactively change this replay.

The retained target is 18 × 18 CSS pixels with 18 pixels of safe clickable
space. The retained zoom declaration is `user-scalable=no`. No new scan was
needed. Report and API return the same 41 and deduction explanation in the local
replay; the production record remains unchanged.

## Versions, validation and cost

New overall calculations use `overall-posture.v7`, central registry
`gdpr-eprivacy-posture.v17`, accessibility effects
`certscore.accessibility-score.v1`, and full-site cache
`full-site-distinct-findings.v6`. Historical single-page results are preserved;
no historical backfill or display-time reclassification is introduced. Full-site
calculated caches use their existing version/hash invalidation mechanism.

Focused tests cover eligibility, repeat/cross-page caps, image/link overlap,
keyboard/focus sharing, stale/malformed proof, target/zoom boundaries, privacy
score isolation, zero floor, no-go decisions, historical preservation and
report/API/MCP explanation parity. The scoring review remains registry-driven.

This reuses already-read evidence and adds no scans, lanes, retries, waits,
model calls or infrastructure. Bounded persisted scoring metadata and processing
are estimated **under $0.50/month at 100,000 scans/month with three months of
retention**. The one approved read-only ASPCA evidence retrieval is estimated
**under $0.02 once**. Both estimates were disclosed before proceeding.
The retained replay adds 31,843 logical bytes across its accessibility concerns
and finding packets; the compression sample adds 2,050 bytes. The monthly
estimate assumes existing compressed large-payload storage and approximately
4 KB additional stored data per scan, allowing headroom over that sample. This
is a planning estimate, not a measurement of production database storage.
Focused local preflight, PR validation and AWS deployment tests cover this policy;
their additional CI time is estimated under $0.05/month at 100 runs, disclosed
before adding the checks.

Privacy, consent and security findings continue to lead the regulatory review.
Accessibility follows with the established Review warning and retained severity.

The image/link identity fix adds at most ten bounded node-identity records per
audit (five examples per rule). It uses the existing in-browser axe result,
with no new evaluation round trip, scan, interaction, model call or timeout.
Incremental processing and compressed evidence/projection storage are estimated
under $0.50/month at 100,000 scans/month and three months of retention, allowing
5 KB of additional stored data per scan. This separate planning estimate was
disclosed before implementation. Release the compatible web contract/consumer
before or together with the AWS Lambda producer; no release was performed here.
