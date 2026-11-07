# CertScore.ai Red Hat numbered release: consumer verification

The approved canary is held before publishing an AWS version or contacting
Red Hat. The requested consumer verification failed against the actual running
report reader. The ordinary daily audit also excludes canaries by design.

The `us-west-1` validation worker task definition 580 and report materializer
task definition 368 resolve to Git revision
`6bbc31609772f7616f53229f3ce6a8630a76d24c` through their deployed ECR image
digests. The exact evidence contract at that revision rejects the previously
retained, checksum-verified Red Hat v4 packet. It rejects the evidence version,
policy version and Red Hat proof field. The deployed California projector
requires that schema to pass before persisting an opt-out observation.

The current local reader accepts the same unmodified bytes. Its execution
assessment still shows action completed, terminal CMP choice confirmed at
2,414 ms, and post-confirmation activity unmeasured. The audit cohort function
classifies the labeled canary as `excluded_canary_or_test`, including with a
valid audit origin. Thirty focused local tests passed for the candidate reader,
choice audit, cohort and gate. This verifies the candidate behavior, not a new
production scan or dashboard row.

Two paths are available:

1. Keep the shared consumers and cohort unchanged. Publish the dedicated
   numbered scanner, use the existing local SQS result path with an explicitly
   synthetic verification result, and verify its immutable artifacts with an
   isolated candidate reader. Rehearse the actual daily audit interpretation
   separately and verify the canary stays outside the ordinary totals. The
   existing scanner role can send to the local queue. A synthetic result
   cannot create a persisted customer report or ordinary daily audit row.
2. Hold the visit for a separately approved compatible shared consumer
   release. Even a compatible consumer must preserve the canary exclusion
   from ordinary totals. A separately labeled canary view would be needed for
   the outcome to appear alongside that audit.

A release still needs an isolated committed source revision, the existing
runtime base, the qualified grant and claim checks, and fresh central contact
selection. Do not bundle unrelated dirty workspace changes or update the
shared scanner fleet. No Lambda, IAM, S3 or SQS write occurred during this
review; Accept, Reject, worker memory and capture caps were untouched.

The exact deployed contract, its dependencies, reproducible compatibility
check, receipt and local test log are in
`outputs/redhat-numbered-release-review-2026-11-05/`.
