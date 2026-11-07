# CertScore.ai Red Hat canary readiness

The local Red Hat verification confirmed a recorded TrustArc choice at
2,414 ms after one exact reload. Post-confirmation tracking was unmeasured.
This change prepares a single AWS canary to validate the same behavior through
the deployed coordinator, worker, retained evidence and daily audit. It adds no
new browser behavior or target visits.

See the [AWS preflight result](redhat-aws-canary-preflight-2026-11-05.md) for the
verified artifact permissions and the missing numbered release.

## What controls activation

A recipe flag by itself cannot start the Red Hat opt-out worker. The coordinator
must first verify the existing consent artifact and match the exact first-layer
button. Both the coordinator and worker then require:

- The existing Red Hat recipe flag and an operator-owned
  `CERTSCORE_REDHAT_OPT_OUT_CANARY` grant for one scan ID, issued for at most 24 hours.
- The exact Red Hat route, the conditional scan profile, and the matching numbered
  AWS Lambda version in `us-west-1`, with the exact build Git SHA and 3,008 MB
  of memory. The runtime checks its own function name and version.
- A positive matching `approval.json` record in the existing artifact bucket.
  Missing, denied, stale or malformed approval closes the gate.

The coordinator atomically creates its claim before recording a dispatch or
invoking the worker. The worker verifies that claim against the exact parent
dispatch hash and consent source and atomically creates its own claim before
starting the scanner. Keys use the scan ID, so changing or reissuing the grant
cannot reset either claim. A duplicate, timeout or uncertain claim is never
retried. Both stages recheck time and cancellation; the coordinator does not
wait beyond the existing report publication barrier.

The gate uses the existing S3 transport with conditional creates and one AWS
attempt per operation. A denied coordinator authorization appears as
`authorization_not_granted` with no opt-out dispatch, action or terminal
confirmation. Accept and Reject use their existing dispatches. The Red Hat
browser capture, artifact, cleanup and worker caps are unchanged; gate work is
bounded by 500 ms within the existing deadlines. The earlier ReadCube/Gimbal
campaign is independent and remains inactive.

## Operator handoff for a separately authorized canary

1. Isolate the reviewed release from unrelated work in the shared workspace.
   Verify the AWS artifact bucket and role can read the precise approval and
   coordinator keys and conditionally create claims. Verify the coordinator can
   invoke its own numbered version. Check the actual region, image/build identity
   and 3,008 MB memory before planning contact; a mismatch blocks this canary.
2. Reserve one fresh Red Hat scan ID, use the canonical contact registry and a
   fresh central history export, and verify eligibility for that ID and visit.
   Keep the normal scan routing unchanged. The approved canary submission must
   use the conditional profile and call the reviewed version explicitly through
   the trusted dispatch path. Preflight the exact version and its environment
   before enabling any contact. Disable SDK invocation retries for the canary.
3. Set the recipe flag and the grant only on the approved immutable release
   configuration. The grant contains `version: redhat_opt_out_canary.v1`,
   `scanId`, `region`, `functionName` (name plus numeric version),
   `buildGitSha`, `issuedAt` and `expiresAt`. Create
   `v2-dag-lambda/local/redhat-opt-out-canary/<scanId>/approval.json` with that same grant nested
   under `grant` and `approved: true`. Confirm there are no prior claim
   objects for that scan. Use a dedicated approved submission so broader traffic
   remains on its existing configuration. This preparation did not publish or
   configure any AWS version or approval object.
4. Invoke the approved scan once. Check both claims, source and parent hashes,
   packet integrity, one canonical publication and the daily audit fields. If
   the exact reload and terminal choice are observed, expect action completed,
   terminal CMP choice confirmed, and post-confirmation activity not measured.
   A missing terminal read remains unconfirmed. A canary may prove the deployed
   evidence path without establishing the site's sale/sharing behavior.
5. Record the contact centrally and manually using one idempotent key. Disable
   further use of the grant by setting its approval to false or letting it
   expire. Revocation prevents a subsequent authorization; it cannot undo an
   action already dispatched. Do not delete or reset claims.

There is no deployment, activation, additional site contact, budget increase or
historical rewrite in this preparation. Incremental recurring cost is $0 while
inactive. The added approval and claim storage/requests for one future canary
are estimated below $0.01; the separately approved scan and existing contact
bookkeeping have their own costs.

Retained evidence: [local integration report](redhat-scanner-integration-2026-11-05.md).

Local validation passed 31 coordinator and retention tests and 33 gate,
contract, projection and audit tests. Cases included flag-only authorization,
missing and revoked approval, wrong version/build/region/memory, expiry,
stalled storage, concurrent claims, mismatched consent source and parent hash,
and a skipped audit decision without an action. Lambda, web and validation
worker TypeScript checks passed. The original live packet matched its pinned
checksum and reproduced the exact previous execution assessment.
