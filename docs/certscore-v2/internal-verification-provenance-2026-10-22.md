# CertScore.ai internal verification provenance — October 22, 2026

The 47-scan `owner-ca-reject-proof-47-20261022` batch and the single
`owner-ovid-encoded-post-20261022` verification were queued directly by operator
SQL. Their source, run key, original scan ID and queue events were retained, but
there was no requester account or API/browser request row. The ingestion trigger
therefore classified their audience as unknown. Unknown traffic intentionally
remains visible under Exclude known internal / QA.

Correct only these manifest-bound scans using
`scripts/classify-internal-verification-run.ts`. This operational correction does
not dispatch scans or change report evidence, assessments or scores. It requires
an exact operator source, matching run/source IDs in both the configuration and
queue event, no requester account or linked request, and an unknown audience (or
the identical already-registered projection). Any mismatch aborts the transaction.
Each changed scan gets one retained correction event. Repeating a registration
is idempotent. Original scans and genuinely unknown traffic remain unchanged.

For future direct-SQL verification batches, run
`scripts/lib/internal-scan-provenance.ts` after inserting the scan and its queue
event, inside the same transaction. The original two operator queue scripts now
include that registration before each batch commit. Do not take manifests from
public request bodies, infer ownership from the target vendor or AWS egress, or
fake a requester IP/account. The run manifest is the service-owned provenance.
For archived batches the standalone command accepts repeated `--manifest` flags,
defaults to a dry run, and requires `--apply` to write.

The admin fast classifier and detailed scan query now also recognize the exact
retained starting target under `/.well-known/certscore-canary/`. The sharded
pipeline can retain that target without a legacy `scan_pages` or request row.
This preserves the existing known-canary exclusion policy. Operator verification
is also an exact Internal creation source; an actual creator request still takes
precedence. These application changes await a separately authorized deployment.
The persisted audience correction works with the existing deployed filter.

Validation: 21 focused tests passed against local PostgreSQL, including exact
manifest/event corroboration, idempotency, missing rows, refused customer/request
associations, mismatched run/source proof, config-only canaries, unknown audience
visibility, existing traffic classification, and creator attribution.

Estimated one-time production maintenance cost is below $0.10, with negligible
storage for 48 correction events and no new provisioned capacity. No fresh site
attempts, Options opening, production application deployment or report rewrite.
See `artifacts/internal-scan-provenance-2026-10-22/` for the trusted manifest
hashes, before inventory, correction SQL/output and verification.

Production verification: 48/48 corrected and audited; 0/48 visible under the
existing default exclusion; all 48 remain available when internal traffic is
included. There are zero remaining unknown rows from this exact operator source
in the last seven days. Scan configuration and complete stored snapshot hashes
were unchanged. Web and operational script typechecks passed.
