# Verified artifact transfer readiness — October 8, 2026

The worker already downloads and verifies the original canonical bundle and
manifest during result ingestion. This change carries a bounded compressed copy
in its existing authenticated `publish_report` request. Web checks the original
bytes against the authorized scan's persisted S3 identity, SHA-256 and size,
then runs the same canonical materializer and persistence guards.

## Bounds and recovery

- At most 48 KiB compressed total, 8 MiB uncompressed total, two artifacts,
  and 72 KiB for the entire HTTP request. Decode occurs only after token
  authorization. Per-artifact decompression stops at the persisted expected size.
- Prefer the manifest; include the bundle when it also fits. A large bundle
  keeps its original verified S3 read while the early manifest can start
  dependent geometry reads. No artifacts or screenshots are removed.
- An invalid, stale, corrupt, wrong-scan, unsupported-schema or oversized hint
  contributes no evidence. Existing verified S3 reads remain authoritative.
- Cache at most 32 disposable transfers for five minutes; consume each once.
  Existing retries, deferred publication, process restart and durable recovery
  need no cached bytes and send no additional transfer payload.
- Prime the existing web verified-artifact cache so subsequent screenshot and
  evidence reads retain their existing reuse. No new persistent cache or storage.
- Source-generation checks before/after materialization, nonblocking publication
  lock, atomic source guard, canonical readiness, two publication permits,
  trailing finalization, single publication and scoring are unchanged.
- No browser lane, model call, request, retry or timeout is added. No new
  customer-facing caveat or report wording.

## Local measurements

Five retained owned production scans were replayed 50 times each using their
original downloaded bytes and actual persisted artifact hashes/sizes. The entire
compression -> request JSON serialization/parsing -> decompression -> checksum,
size, schema and identity check took about 1.5–1.6 ms median, with p95 below
2.1 ms. Each request was approximately 55 KB versus 200 KB original input.
This excludes network and production projection time.

Retained SITS scan `25a98891-767b-499f-8f0d-4f893773562c` contains a 1.23 MB
bundle that exceeds the compressed cap. Its manifest alone transfers in about
6.5 KB and verifies locally. The full SITS bundle still comes from S3; do not
claim that this change removes its entire bundle-download delay.

The previous measured ~1.1-second first bundle read is an optimization target,
not a measured production saving. Fresh production verification must compare
scanner completion -> persisted report readiness and the remote artifact phases,
and inspect `scan.report_artifact_transfer` for one/two verified artifacts.
Geometry/policy-text reads, canonical projection and DB persistence remain.

## Cost

Disclosed before implementation: conservatively **under $0.90/month at 100,000
affected scans**, within the repository's below-$1 pre-approval. At the request
cap that is at most 7.37 GB extra body traffic. A conservative $0.118/GB allowance
covers $0.09/GB external egress through the existing public-host routing
(or two $0.045/GB NAT-processing legs), $0.008/GB ALB byte processing and
$0.02/GB regional routing, leaving room for the bounded operational log.
The current public-IP topology does not introduce NAT gateways; these are
budgeting allowances, not a claim that every leg is charged.
Current worker and web/materializer tasks are in us-west-1, use public IPs and
existing fixed capacity. No new capacity, model use, retention or paid service.
Avoided S3 requests and transfers are not subtracted from the estimate.

Pricing references: [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/) and
[AWS load-balancer pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
and [AWS data-transfer pricing](https://aws.amazon.com/ec2/pricing/on-demand/).
Re-evaluate before increasing the cap, scan volume assumption, retransmission
count, routing charges or capacity.

## Verification and release scope

- Transfer boundary tests cover original-byte preservation, persisted-identity
  verification, malformed/stale/corrupt data, decompression limits, partial
  manifest transfer, TTL/eviction/restart, token authorization, bounded request
  bodies, existing web-cache reuse and unchanged S3 verification.
- Real worker verification/publication code with controlled DB/HTTP boundaries
  confirms the first request includes the transfer, a 503 retry omits it, and
  finalization and durable recovery remain compatible.
- The complete canonical report is identical when materialized from transferred
  bytes and the original S3 bytes, with the assessment clock held constant.
- Full `pnpm preflight:full -- --base c53f9cfcaabffa86461816df24f7ee1a9169348b`
  passed for code commit `82f3599ed2f0eb9a76c8ae8b3824ff9265a59fcb` in a clean
  checkout: all 19 workspace typechecks/builds, 271 worker pipeline tests,
  529 canonical projection tests and the full post-refusal release checks.
  The clean checkout also passed 39 focused transport/result/publication tests
  and the complete report parity test separately.
- The development checkout's 8 GB Next heap failure was resolved by the clean
  build at the same existing limit. No memory setting or CI check was changed.
  A missing SDK build prerequisite in the first clean attempt was resolved by
  building all workspace packages before the full gate.

Clean-checkout reproduction: install with `pnpm install --frozen-lockfile`,
build all package dependencies with `pnpm --filter './packages/**' build`,
create empty test output directories (`tmp` and `artifacts/local-v2-dag-scans`),
then run the full gate. Do not copy the development environment, generated
caches or retained scan artifacts into that checkout.

Receipts: `artifacts/report-artifact-transfer-20261008/`. No fresh SITS contact,
production scan, infrastructure change or deployment was performed for this
implementation. Release affects public web/materializer and validation worker;
no scanner runtime, Lambda image or migration change is required. Existing and
new worker/web revisions remain backward compatible during rollout.
