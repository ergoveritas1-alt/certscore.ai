# CertScore.ai GPC follow-up verification

Local verification began from dirty main
`6a9d197a207765ea958059d6ee2f2b2fdd94aa07`. Existing CNN/CMP/GPC changes and
concurrent edits were preserved. No push, package publication, deployment,
production configuration change, production database access, artifact download,
historical report rewrite or source-receipt replacement occurred.

## Verification repair

The aggregate found three stale Accept assertions in
`packages/certscore-scan-core/src/consent-action-reliability.test.ts`. Their
210-request and 205-image fixtures no longer exceeded the approved Accept cap
of 384. The tests now derive their input flood from the applicable action cap:
cap plus 18 requests, or cap plus 13 images followed by late requests. Reject
keeps its existing 192-request cap and the same fixture sizes.

Assertions still require the exact retention cap, positive drops, explicit
truncation, late unknown/redirected tracking evidence, and Limited execution even
with confirmed consent. All six focused overflow cases pass, and the full
consent-action suite passes 920 tests with zero failures/skips. Production code,
capture windows, safety checks, finding eligibility and scoring are unchanged.

## Retained original-byte evaluation

The read-only local inventory found 469 records with assessment source pairs,
representing 425 distinct scan/source-pair combinations. Both original worker
byte streams were available for 26 pairs. Every evaluated stream matched its
preexisting length and SHA-256 receipt and passed the canonical schema. The
other 399 pairs were not fetched, reconstructed or evaluated as complete pairs.

None of the 26 satisfies the public paired-state contract. Five have a measured
strict internal impact but no comparable CMP state. Only one pair, an older Ars
Technica visit, has supported ready/loaded GPP states with both axes known on
both sides; its full-context delivery and request-set proof is incomplete.
The other 25 pairs retain unavailable semantic states on both sides. These are
convenience retained records, not a production population or coverage estimate.

Results remain separate internal evaluation outputs. No optional packet was
added to an old report, and no absent baseline state was inferred.

## One approved passive Ars Technica attempt

The owner approved exactly one passive local `https://arstechnica.com/` scan,
including a narrow exception to central contact-history selection. The attempt
used existing budgets, no debug overrides, action lanes, model key or AWS client.
The ordinary local coordinator used filesystem-backed service substitutes.
Actual egress geography was unverified; the us-west-1 label is not proof of
California execution.

The scan ID is `gpc-ars-passive-10859954-1967-46a4-a29e-a2d472817bc8`.
Both original passive workers retained `api_unavailable`, at +14,407 ms and
+7,285 ms from their own document commits. Main-page GPC delivery verified;
full-context frame/worker delivery and retained request sets did not. The
strict internal impact remains `insufficient_evidence` and paired state is
omitted. These checkpoints do not establish initialization timing, permanent
API absence, a site defect or a legal outcome.

The overall attempt failed because the selected full profile requires policy
assistance and the verification runner intentionally supplied no model key.
Selecting that profile under the no-model-call constraint was a verification
setup error. The CLI process exiting zero was not treated as scan success.
The original worker diagnostics do not constitute a completed canonical report.
The one approval is consumed, no retry occurred, and the local contact ledger
records the attempt without classifying this setup failure as a site no-go.

## Release-check boundary

Checks run in an isolated source copy without application environment files,
using cloned local dependencies, disposable loopback PostgreSQL and fixture
browser interception. No dependency download or production credential is used.
The only permitted external test request is the previously approved exact
GitHub MCP release-metadata GET. The unchanged release-asset guard passed;
the archive was not downloaded.

The unmodified full aggregate stopped at its live deployment audit because the
guard rejected production `/api/version` access. The local clone's initial
remote metadata also differed; it was aligned with the verified source remote
without any fetch or push. Remaining stages run independently from that
boundary. Static topology uses the repository's existing
`SKIP_LIVE_DEPLOY_CHECK=1` option. This is not a successful unrestricted full
preflight or a fresh verification of production deployment state.

Exact commands, stage results, durations, retained-source evaluation, the scan
failure receipt and final source-state checks are in
`outputs/gpc-followup-verification-2026-11-02/`. Earlier setup and failing-test
logs remain preserved beside the corrected checks. Tests are counted as runner
invocations, not unique cases across overlapping suites.

Final local results: 44 completed check stages, 6,482 passing Node test
invocations, zero failing or skipped Node tests. This total excludes the earlier
superseded attempts and the separate six-case focused overflow rerun. All 19
workspace typechecks and all 19 workspace builds passed. Standalone public
package suites passed API 43, SDK 43 and MCP 184 tests; hosted MCP passed 54.
GPC and detailed-evidence contract drift checks, the contact registry check and
final `git diff --check` passed. The independent counts overlap the aggregate.
Disposable PostgreSQL was stopped and removed, and no preview listener remains.

The verified runtime source copy matches the primary workspace. Only the
overflow regression file, this note and the appended local contact-ledger entry
changed during this follow-up. The unrelated concurrent dashboard test retains
its original hash. The local follow-up remains uncommitted and undeployed.

## Remaining product proof and cost

A real, completed canonical paired On/Off comparison remains unverified. Both
the CNN follow-up and this approved Ars attempt lack the required evidence.
The strict measured-impact, source/session/document, known-axis, section/version,
readiness, timing and full-context delivery gates remain intact. Additional CMP
adapters, longer waits, new capture, persistence/override actions and retrospective
report reconstruction are outside this work.

The test and local ledger changes add $0/month recurring infrastructure or
paid-service usage. The existing pending CMP/GPC changes retain their approved
combined allowance of up to $8/month at 100,000 scans and 30-day retention.
The fresh attempt made no model calls; local processing is not a measurement of
Lambda billing or production coverage.

Future release order remains compatible API/SDK/MCP and web/worker consumers
before new producer packets, through the repository AWS workflows. This local
verification authorizes no publication or deployment.
