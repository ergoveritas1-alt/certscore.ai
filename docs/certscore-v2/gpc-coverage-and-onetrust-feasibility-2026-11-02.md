# CertScore.ai GPC coverage and OneTrust feasibility

Local work against dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`.
Concurrent changes were preserved. No public scan, model call, AWS access,
production artifact retrieval, publication, deployment or historical rewrite.

## Completed repairs and verification

The local parity CLI now rejects a missing/blank policy key before creating
outputs or dispatching workers. Sharded scans always include policy_evidence,
including tiny profiles. A configured key is a prerequisite, not authorization
to spend. Failed/unknown/skipped terminal outcomes now return a failing process
status after retaining the summary, instead of exiting zero.

New hermetic browser cases cover absent API, provider identity alone,
iframe-only API, queued stub, initialization before the terminal checkpoint,
removal after an observed listener state, and frozen output after closure.
They preserve the single synchronous terminal ping and current-document rules.
No production probe change was justified by these fixtures. The first test run
exposed a serialized test-helper issue (`__name`); corrected with a lexical
helper in the fixture, without modifying the website global or runtime code.

Exact focused command (under a local test-only network guard):

```
pnpm exec tsx --tsconfig tsconfig.base.json --test --test-concurrency=1 packages/certscore-scan-core/src/gpc-semantic-monitor.test.ts packages/certscore-scan-core/src/gpc-opt-out-capture.test.ts packages/certscore-scan-core/src/gpc-signal-capture.test.ts packages/certscore-scan-core/src/gpc-impact-assessment.test.ts packages/certscore-scan-core/src/gpc-cmp-state-comparison.test.ts scripts/run-local-v2-dag-lambda-parity.test.ts
```

Result: 78 tests passed, zero failures/skips. Scan-core typecheck and
`git diff --check` passed. The CLI prerequisite test launches a child process
without a key and proves it exits 1 without artifacts or a start event.
Runner tests enter the existing GPC predeploy check. No full preflight or
fresh production-state verification was performed for this follow-up.

The guard rejects external Node sockets/fetch and unhandled browser requests;
fixture routes supply all non-loopback page content and block service workers.
The sandbox initially blocked tsx IPC; the same guarded local checks passed
with execution permission. No OS/network/security configuration changed.

## Retained comparison audit

All 52 original streams in 26 pairs reverified against their existing byte-size
and SHA-256 receipts before canonical schema parsing; hashes rechecked after
reading. Original receipt values were never replaced.

- 25 pairs: both terminal semantic states unavailable; one: both observed.
- All 26: each lane's readback token matches its own original document token.
- 21 pairs: at least one retained event window has fewer events than its
  original declared count and its original digest does not match the retained
  sample. No digest was recomputed and substituted as an original receipt.
- Six pairs have observed workers, for which startup navigator delivery is
  not verified by window init scripts.

These support keeping the existing request and full-context gates. Frame churn
and observed-worker limitations are genuine missing proof; they cannot be
fixed by equating main-page delivery with full-context delivery. The artifact
receipts do not retain enough API lifecycle information to attribute unavailable
GPP to late initialization, region, site configuration or scanner timing.

Evaluation outputs are internal and separate under
`outputs/gpc-coverage-audit-2026-11-02/`. They are not production coverage data.

## CNN retained OneTrust evidence

Original CNN baseline, GPC and consent-proof artifacts were verified against
existing local upload metadata (scan
`cnn-gpc-availability-4f53bea3-6448-4bf5-a66c-5e96df8a1e3f`).
The retained CMP projections contain no explicit separate sale/sharing state
or OneTrust GPC receipt. The output inventory contains field names/types only,
without cookie values, IDs, URL paths/queries, bodies or document tokens.
No baseline state can be reconstructed from CMP identity or cookie categories.

## Source-reviewed next-phase candidate (not implemented)

Primary sources checked November 2, 2026:

- [Web CMP JavaScript Methods](https://developer.onetrust.com/onetrust/docs/javascript-api):
  GetDomainData returns configuration, descriptions and UI settings. It is not
  documented as a generic current sale/sharing getter.
- [OneTrust Cookies](https://docs.onetrust.com/en/consent--preferences/cookie-consent/managing-cookie-scripts-cookie-blocking-and-technical-implementation/onetrust-cookies):
  browserGpcFlag records active/inactive browser GPC in supported versions.
  isGpcEnabled combines browser GPC with category configuration; zero alone
  cannot establish missing receipt or failure. Groups are category consent.
- [Leveraging GPC](https://docs.onetrust.com/en/consent--preferences/cookie-consent/configuring-templates-and-geolocation-rules/leveraging-the-global-privacy-control-signal):
  GPC handling is configured per category/geolocation rule.

A useful next phase would be a local-only, passive OneTrust receipt reader,
initially internal and score-neutral. Reuse an already-loaded original receipt
at an existing checkpoint, with no extra cookie read, SDK call, visit, wait,
listener, object fetch, or change to source capture budgets. Strictly allowlist
bounded exact supported-version boolean fields, reject duplicate/conflicting
keys and ambiguous cookie identity, and bind capture to its own original
session/document/time. Drop receipt IDs, locations, paths and raw values before
retention. Missing proof remains unknown. Test synthetic source pointers and
malformed, stale, conflicting, unsupported and navigation cases before any
optional canonical/public contract proposal.

This phase can describe only the documented receipt facts. It cannot populate
the GPP-only paired packet, translate categories into sale/sharing axes, create
contradictions/findings, or claim honoring. A generic settings table requires a
reviewed property-specific meaning for each axis plus independently verified
current state, and a separate compatible versioned contract. No such CNN source
has been established here.

The original release explicitly excluded additional passive adapters. This note
is a concrete candidate scope for separate approval, not activation of one.
No further Ars visit is authorized by its consumed one-visit grant.

## Cost and release boundary

Completed changes affect local tooling/tests only: zero additional production
serialized bytes, production processing or recurring cost ($0/month).
Retained audit processing is local and is not a Lambda cost measurement.

For the proposed receipt reader, a planning ceiling of 256 added bytes per lane
and 10 ms per lane at 3 GB across two lanes, 100,000 scans/month and 30-day
retention would add roughly $0.10 Lambda duration plus under $0.01 raw storage
at illustrative $0.000016667/GB-second and $0.023/GB-month rates. Reserve
$0.25/month including JSON duplication/overhead within the existing combined
$8 envelope; this is an estimate, not measurement or a new budget approval.
The ceiling is contingent on reusing existing reads. If that is impossible,
stop and propose a separately measured capture change. Lowest-cost alternative:
retain the existing neutral availability explanation and no new packet.

Any future release uses compatible consumers before producers through the
repository AWS workflows. No deployment is authorized by this local note.
