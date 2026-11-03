# CertScore.ai CMP identity and GPC readiness report fixes

Local implementation only. Base: `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`.
No push, package publication, deployment, account, flag change or historical
report rewrite is part of this work. After local implementation, the owner
separately authorized a fresh CNN scan to investigate the missing checks; its
bounded public results are recorded below and separately from offline tests.

## Retained evidence and presentation

The CNN report `d619e554-22bf-48e2-af71-7d35ba3abf17` retained OneTrust in
`consentVendor` and `cmpAudit.experience.provider`. Its limited CMP component
ignored that provider and displayed “Not determined.” The shared component now
renders the canonical provider independently of detailed-audit usability. The
shared experience summary preserves identification while explaining the limited
checks. All thirteen criterion states, supporting evidence and eligibility remain
unchanged. Independent privacy-link evidence remains independent.

`evaluateConsentControlReport` supplies a bounded reason for an unavailable
control report: missing/invalid assessment, scan mismatch, unverified document,
no-go, unusable visit or unavailable coverage. `projectConsentControlReport`
delegates to the same evaluator. The existing rejection conditions are unchanged;
the report does not borrow an inventory or turn provider recognition into usable
control evidence. New summaries distinguish the relevant condition. Legacy
summaries gain no more specific assessment diagnosis than their retained facts.

The materializer already persists the assessment in its runtime and snapshot
projections. The source trace and fixtures do not establish a new assessment-loss
bug. The public CNN projection's null assessment source hash cannot distinguish
an absent assessment from a rejected one. No historical assessment is reconstructed.

The subsequently authorized fresh scan is
`071c3695-d190-4e5b-ab75-930aa1ff6ea9`, completed in 46,470 ms. Public diagnostics
for both scans classify `consent_proof` as degraded/`blank_or_unusable`, while
`runtime_evidence` succeeds on a `representative_page`. This establishes a
consent-visit usability limitation alongside independently usable provider
evidence. It does not establish why the browser visit became unusable. The fresh
scan retains OneTrust but has thirteen unassessed CMP rows, including an
unassessed independent privacy-link row. Both scans retain GPC `not_ready` and
omit the paired settings packet. No further retry scan, cooldown override, artifact
download or production DB access was used. The fresh scan used the normal public
API with `freshness=refresh` and consumed one ordinary anonymous scan allocation.

## Optional readiness fact and proof gates

The existing terminal GPP capture already retains diagnostics. A new optional
`observation.semanticReadiness` contains the independently versioned
`certscore.gpc-semantic-readiness.v1` packet. It carries only:

- `synchronous_ping_unavailable`, with both readiness flags unknown; or
- `cmp_or_signal_not_ready`, with independently reported CMP-loaded and
  signal-ready booleans, at least one false;
- the terminal observation's milliseconds after its own document commit.

The producer reuses original bytes already loaded at the existing barrier and
the original size/SHA-256/schema, scan, producer-session and document verifiers.
The diagnostic requires the supported v4 adapter, a bound terminal `not_ready`
read, known reason/code combinations, an integer time within the retained window
and 120-second bound, and no semantic document/lifecycle limitation. Unknown
diagnostic text, changed documents, stale reads, bad source bytes and unsupported
adapters omit it. A missing packet means no specific reason was retained; it is
never reconstructed by fetching an artifact. The containing v3 assessment keeps
its authoritative GPC source-hash check. Downstream strict public/canonical
schemas enforce status, source-reference, timing and readiness invariants.

There is no new ping, listener, wait, navigation, retry, browser, model call,
object fetch or publication. Raw payloads, GPP strings, tokens, identifiers,
URLs and arbitrary diagnostic strings are not added to the public packet.

The paired CMP packet remains separately governed by both original source
references and its existing measured/full-context/section/version/known-axis
checks. A GPC-side readiness diagnostic cannot satisfy baseline proof or create
an On/Off table. The omission explanation uses fixed retained limitation codes
to distinguish GPC semantic availability, baseline full-context readback and
document settling. It does not infer an unchanged setting, cause or failure to
honor a preference. Semantic timing remains distinct from the matched request
window.

## Consumers and compatibility

Neutral guidance is built once in `gpc-guidance.ts`. Existing web expanders,
API/JSON, PDF, Markdown and MCP consume that shared text. No adverse diagnosis,
finding, severity, response status, score, checklist credit or PDF priority is
created by readiness or comparison availability. California/EU presentation
scope is preserved. The separate `/app/scanso2` route already consumes the shared
GPC product evidence component and canonical projection; it has no duplicate
readiness diagnosis.

Canonical and standalone API schemas, OpenAPI and SDK types are synchronized by
`sync-gpc-observation-contract.ts`. Named public observation types remain intact.
No public package imports private runtime contracts. Existing response versions
remain unchanged and old records may omit the new field. Package versions are
unchanged: these additions have not been published.

Only the bounded in-process materialization cache advances from v43 to v44.
The persisted/global `scan-report-projection-v27` stays unchanged, retaining
historical readers and avoiding a repair campaign. No database migration or
backfill is introduced.

## Verification, cost and remaining proof

See `outputs/cmp-readiness-2026-11-02/verification.md` for commands, exact results,
local browser/PDF evidence and source state. Browser fixtures intercept requests,
reject unexpected traffic and block service workers. PostgreSQL verification
uses a disposable loopback-only cluster, separate from the existing local DB.

The synthetic not-ready fixture adds 198 serialized bytes for readiness and 411
bytes of neutral guidance relative to the prior release: 609 bytes combined
before storage/projection duplication. Alternating local benchmarks against the
recorded base show median increments of approximately 0.000834 ms for production
observation derivation and 0.000625 ms for guidance; timing noise is retained in
`incremental-timing.json`. These are synthetic local measurements, not Lambda
measurements or evidence of production population coverage or savings.

Use a combined conservative incremental planning allowance of **$0.25/month** at
100,000 scans and 30-day retention for this change. This revises the initial
under-$0.10 estimate to allow duplication and storage/egress uncertainty. The
model reserves 1 KiB per scan across six retained copies, one added 1 KiB response
transfer per scan, and 2 ms of compute at 3,008 MB, using conservative planning
rates of $0.15/GB-month storage, $0.15/GB transfer and $0.00002/GB-second compute.
The modeled sum is about $0.12/month, rounded up to $0.25; usage scales with
retention and reads. These are budget assumptions, not a current provider quote.
No configured capacity, paid service or infrastructure change is made. Local
verification adds $0 recurring AWS cost. The incremental estimate is below the
repository's $1/month approval threshold.

CNN's exact underlying not-ready reason, baseline failure cause, missing consent
assessment's exact rejection branch, screenshot/page closure cause and incomplete
accessibility cause cannot be established from the retained public response.
The unusable consent-visit classification is now directly established by public
diagnostics for both the original and the fresh scan.
The relevant source paths and existing lifecycle/deadline protections are
reviewed and exercised locally; no speculative scanner timing fix is made.
The new reason is available only when newly processed, original bound evidence
supports it. Existing CNN reports will not gain a manufactured comparison or a
reconstructed readiness reason.

Additional passive adapters, USP translation, discovery, returning-visitor
transitions, persistence/override actions, broader diagnostics, alerts and
monitoring remain excluded.

For a separately authorized future release, ship compatible API/report and
SDK/MCP consumers before producer packets, using the repository-controlled AWS
workflows. Keep normal proof, CI and release gates. This note does not authorize
publication or deployment.

The subsequent local CNN follow-up extends the same pending readiness contract
with the exact retained `api_unavailable` reason and verifies the missing-comparison
explanation on a fresh original pair. See
[CNN GPC availability and comparison explanation](cnn-gpc-availability-2026-11-02.md).
Earlier source receipts, measurements and unavailable paired-state results remain
unchanged.
