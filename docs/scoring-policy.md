# Canonical scoring policy

The owner-approved September 6, 2026 scoring table is defined in
`apps/web/lib/scans/scoring-policy.ts`. The local `/scoring-review` page renders
this registry directly. Change the registry rather than copying policy numbers
into report components or documentation.

Versions: `gdpr-eprivacy-posture.v14`, `overall-posture.v3`, and
`full-site-distinct-findings.v2`. The California GPC evidence policy remains v1;
its existing eligible 15-point effect is unchanged.

The score starts at 100, subtracts eligible deductions after shared family caps,
and stops at 0. Insufficient evidence can withhold a score; it does not imply a
zero score. Scores are risk signals, not legal certification.

Storage and tracking use 8 for the first eligible identity/vendor, 4 for the
second, and 2 for each additional, capped independently at 40. Session replay
and fingerprinting use 6, 4, and 1 for each additional identity. Sensitive runtime
(replay plus sensitive-surface tracking) and fingerprinting each have a 25-point
cap. Replay identities use canonical vendor/product names; fingerprinting uses
hosts. Storage retains exact storage identity; tracking uses canonical vendors.

Decline/Reject deducts 12, within the 22-point consent-control cap. Eligible
post-Reject activity deducts 15, including the already-authorized click-tracking
review and confirmed contradiction paths; only the strongest effect applies.
The evidence and registration requirements are unchanged. Removed accessibility,
choice-quality, withdrawal and cross-border rows have no direct deduction;
the underlying findings/checklist evidence remains available.

Sensitive-surface tracking deducts 12. Each of embedded content, social embeds,
and third-party iframes deducts 5, sharing the 20-point embed cap. Privacy-notice
availability remains 12. Transport and eligible California GPC retain the
registry's existing deductions. Zero-deduction checks are omitted from the table.

## Single-page and full-site scope

Single-page scores consume that page's canonical checklist and unified findings.
Full-site scores keep homepage consent, action, policy, transport and GPC
assessments, and combine eligible runtime evidence from assessed pages for
storage, tracking, replay, sensitive-surface tracking, fingerprinting and embeds.
Identity-based rows union eligible identities; flat deductions apply once across
the site, never once per page. The same family caps and zero floor apply.

Additional pages must pass artifact hash, attempt, page and configuration
verification. Typed runtime observations pass through the shared evidence
adapters, normalized concerns, concern policy and checklist projection before
scoring. Missing, malformed, unverified or failed runtime evidence cannot create
a deduction. No additional-page consent or action evidence is synthesized.

Versioned persisted historical homepage reports are not bulk-rewritten. New
materializations use this policy. Full-site cache keys include the policy version
and source hashes, invalidating older calculated full-site scores. Deployment is
separate from editing this policy.

## Retained no-go report eligibility

`apps/web/lib/scans/scan-report-disposition.ts` consumes the existing shared
`projectExternalScanNoGo` projection. A retained typed `no_go` decision withholds
the target score, including when an older snapshot contains a numeric score.
Scoring callers must supply the scan's access context; neither an empty checklist
nor successful sign-in-page resources can restore eligibility. The report model
returns a separate no-go result, so public and authenticated reports show the
canonical blocker and next action without a benchmark, executive assessment,
substantive findings or regulatory checklist.

Persistence writes a null score. Previously stored payloads are verified against
their original size and hash before applying the same read-time eligibility;
their retained evidence and stored assessment are not rewritten. A typed
`continue_with_diagnostics` decision takes precedence over a lane-local visual
NO_GO or stale snapshot, preserving independently recovered partial reports.
HTTP hints, screenshots and absence of runtime activity do not create decisions
in the reporting layer. Scoring numbers and policy versions are unchanged.

`pnpm test:scan-no-go` covers scanner classification, canonical score eligibility,
historical payload integrity, and public/authenticated rendering using retained
assessment data from scan `0b9a3256-aa72-4378-acff-e205fd6cdc5e`. This gate runs in
fast/full preflight, PR validation and the AWS web deployment workflow. No new
scans, model calls, artifact reads, retries or infrastructure are introduced;
expected incremental recurring cost is $0/month.

## Verification and cost

Regression coverage lives in `scoring-policy.test.ts`,
`regulatory-coverage-score.test.ts`, `canonical-overall-score.test.ts` and
`full-site-score.test.ts`, covering approved numbers, removed deductions, caps,
zero floor, evidence gates and cross-page deduplication.

No new scans, browser lanes, model calls or artifact reads are introduced by this
policy revision. Additional deterministic processing of already-read artifacts is
estimated below $1/month at 1,000 three-page reports. The prior full-site artifact
read/write estimate remains documented in `full-site-resource-crawls.md`.
