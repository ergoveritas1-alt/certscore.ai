# CertScore.ai Red Hat AWS canary preflight

The approved Red Hat visit was held at preflight. Both scanner functions in
`us-west-1` are configured for 3,008 MB, and both expose only `$LATEST`.
The ordinary scanner has no aliases, Red Hat recipe flag or operator grant.
It is active on image digest `sha256:9efe9835511b4430c6cc9558177960bef51180df98ec9bd2172d24bf0ae7fd0e`
(ECR tag `6bbc31609772f7616f53229f3ce6a8630a76d24c`). A visit on this
unqualified function would fail the intended immutable version gate.

The live scanner role grants object access below `v2-dag-lambda/local/*`.
The proposed root-level approval and claim keys fell outside that permission.
The local gate now uses
`v2-dag-lambda/local/redhat-opt-out-canary/<scanId>/`. AWS IAM simulation
returned allowed for GetObject and PutObject on all three corrected keys.
It also returned allowed for InvokeFunction on the proposed dedicated
`certscore-v2-dag-local-redhat-canary:1` ARN. These are policy results:
no approval object, claim or function was created. The bucket has no separate
bucket policy. The canonical build region, `eu-central-1`, has the scanner
runtime base available; its absence in `us-west-1` does not require a rebuild.

Twenty gate/audit tests, two coordinator/retention tests and Lambda TypeScript
passed after the path correction. The calibration registry passed. The prior
local live packet matched its pinned SHA-256 and again yielded a confirmed
terminal choice at 2,414 ms with post-confirmation activity unmeasured.
No new AWS evidence or daily audit entry exists because there was no scan.

The next release scope is one dedicated numbered scanner version in
`us-west-1`, no aliases for normal traffic, the same role and capture
configuration, and one scan ID/grant. The regular deployment helper updates the
shared regional scanner fleet and is outside this single-canary scope. Before
publishing an isolated release, isolate the reviewed source from other local
changes, verify the image/configuration and the trusted submission path, and
decide which audit result is expected. A synthetic result supports offline
audit replay but does not produce a persisted daily audit row; that requires a
compatible deployed consumer for the new evidence and decision contracts.
Repeat the contact history check and selector at the actual run.

No AWS settings, role, object, queue, function, alias, scanner budget, Accept or
Reject behavior changed. No site contact or automatic retry occurred. The
preflight and local path correction add no recurring cost.

Sanitized AWS receipts, test logs and the retained evidence comparison are in
`outputs/redhat-aws-canary-preflight-2026-11-05/`.
