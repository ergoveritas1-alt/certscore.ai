# CertScore.ai choice coverage production release — October 22, 2026

Production source: `6a92eadff2901180920082fdc7ebd7bf964f030c`.

Successful collection evidence could be lost during bounded capture, compaction or
Reject finalization. This release improves recipient discovery and preservation,
adds the approved versioned California potential-risk assessment and qualification,
and keeps factual vendor findings visible across GPC and Reject while deduplicating
California recipients. EU Reject retains its non-essential presence policy.

## Deployment and verification

Consumers completed before scanner producer promotion:

- [Public web, API and materializer](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39852743560), successful on attempt 2.
- [Validation worker](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39852743756), successful.
- [Hosted MCP](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39852743544), successful with live validation.

All four ECS services stabilized on the release image. The live version endpoint
reports the exact source and `ecs-fargate`. API v2 health and MCP health passed;
the public OpenAPI includes `gpc_sale_sharing_evidence.v5`.

The scanner helper built once in eu-central-1, reused the existing Chromium
runtime, skipped cache export and replicated to eu-west-1 and us-west-1. All six
primary/inventory functions are Active/Successful and have one digest:

`sha256:becca6ccda7635b14c0d91b3ad8433af5e49b692608f05be0e9d0d6d88b2aa58`.

Regional parity and Web Bot Auth navigation passed in all three regions. Scanner
deployment and its canonical verification took about 3m56s. From the first
deployment dispatch to independent production verification took approximately
19m29s, excluding local readiness. Existing memory/identity settings required no
change: 3008 MB, primary timeout 75 seconds, inventory timeout 25 seconds.

## Readiness and release corrections

The clean-checkout full gate on `14faf01a` passed 3,666 test executions, all 19
workspace typecheck targets and all 19 build targets. The only subsequent source
change was validation runtime packaging plus its test: the cached base's old
resolver package manifest could hide a newly built export. The final image now
copies the current resolver manifest and verifies the property-evidence import.
A real before/after Node import reproduced the missing export and verified the
fix. The canonical scoped preflight on exact final commit `6a92eadf` passed 416
test executions; 36 focused packaging/result tests also passed. Exact-SHA required
CI tests, typechecks, image checks, migrations and service health gates remained on.

Other checks: 434 changed-file test passes; the six database-gated cases were
covered by a separate 12-pass disposable PostgreSQL run. API contracts (32), SDK
(39), hosted MCP HTTP (48), score parity (64), and focused GPC binding (21) passed.
Generated public contracts match their canonical schemas.

Two outdated assertions were corrected: current EU policy is v23, and a changed
history URL cannot borrow original-document GPC delivery. A same-URL history call
remains complete; a changed URL retains factual requests with unavailable
production completion. No scanner qualification was weakened for these tests.

GitHub briefly exposed push runs after fallback dispatch: two queued duplicates
were canceled before image builds; active builds were preserved. Web CI attempt 1
failed with an administrator-terminated PostgreSQL connection in the publication
test. The same 17 cases passed against local PostgreSQL and CI's exact pinned
PostgreSQL image; the unchanged CI retry passed. The original transient failure's
cause remains unconfirmed. No gate was waived and no production source was changed
in response. A missing scanner registry build-cache import was nonfatal; the
runtime base was reused without reinstalling Chromium.

## One final Pella verification

Exactly one owner-authorized isolated AWS attempt used the original California /
us-west-1 region, production VPC/egress and required credential. Actual S3 Put/Get
readback and SQS receipt passed before site contact. It retained a completed Reject
click, full existing eight-second capture, zero dropped post-click requests and
one joined terminal result. All 56 downloaded JSON sources were hash verified.
Canonical replay confirms:

- EU Reject family: 20 points, Sentry and Google.
- California potential-risk family: 7 points, Google once; no full recipient effect.
- No new recipient increment versus the earlier successful Pella verification.

The response arrived 2,434 ms before the passive barrier and added no Reject wait.
This live run verifies a working join; the specific late-response-during-finalization
recovery remains verified by the earlier retained before/corrected replay and
regressions. It was not reproduced by this live timing. No customer scan/report was
created or rewritten. Temporary function, queue, role, image tag and log group were
removed; the temporary endpoint grant was removed and original policy verified.
The single contact is persisted centrally and its reviewed repository ledger entry
is included in this documentation-only follow-up.

## Scope, budgets and remaining work

The release benefits web reports, Admin, API and hosted MCP through the canonical
assessment/concern/policy/finding pipeline. Existing SDK clients receive corrected
server results. SDK source types are updated; **npm remains 0.2.21**. Publishing a
new npm type release is a separate step and was not performed.

Historical policy versions/reports remain unchanged. Unknown evidence is not a pass
or deduction. Recipient schedules, caps, cross-path deduplication and no customer
report deduction explanations are preserved. No Options panels were opened during
live verification; passive CMP inventory remains passive. No additional capture
lane, larger worker, extended deadline, paid model tier or retention period was
introduced. No fresh 122/47 public cohort rerun was authorized or performed here.

The owner explicitly approved up to **$7/month** incremental recurring cost at
100,000 scans/month and 30-day retention. The combined conservative planning estimate
is **$5–$7/month**, allowing overlap among previously disclosed metadata, bounded
capture and recovered joins. This is not measured AWS billing. The one Pella
verification was estimated below $1 one-time.

The merged feature branch was deleted, and the temporary release worktree was
recoverably archived. WS01 remains clean on its original synchronized
main; its unrelated stashes and recovery objects were preserved. No WS01 scanner
service was inspected as a deployment target or deployed. Existing Git auto-GC and
Browserslist-age warnings were retained rather than pruning recovery data or
changing dependencies during release.

Detailed receipts and internal review:
`artifacts/release-choice-coverage-2026-10-22/`; Pella:
`artifacts/pella-release-verification-2026-10-22/`.
