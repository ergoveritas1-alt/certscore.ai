# CertScore.ai Muse posture links and repeat-use release

The owner authorized implementing and deploying improvements from the consumer
Muse tests, including MCP Light, the skill package, and the `/muse` download.
The affected runtimes are the public web and isolated hosted MCP AWS ECS
services. No scanner, validation, database or capacity change is required.

## Changes

MCP Light's completed-bundle guidance preserves its original full-report action
and adds two `reportViews`: EU (`gdpr_eprivacy`) and California (`ccpa_cpra`).
Each is an `open_url` action with `createsScan: false`, the same validated
CertScore.ai scan identity, and the existing public report query selector.
Returned access parameters and anchors are preserved. Invalid or absent report
URLs produce no links. Scores and coverage come only from a valid canonical
`certscore.posture-scores.v1` packet. Missing/malformed packets produce navigation
without invented scores, and null scores remain null. Overall score and scan
region never fill missing posture scores. Guidance does not create findings,
score effects, extra API reads or new scans.

Follow-up labels describe findings, cookies/trackers and coverage in plain
language. The agent answers first, links the relevant focus, and may offer one
useful next step. A checklist already produced for a different page does not
automatically suppress a useful checklist for the new priority page. Offers
remain user-requested, with no executable future-scan action or background job.

Skill 1.0.2 incorporates the tested candidate's posture labels, location/focus
distinction, matched-location rechecks, coverage caveats and contextual next
steps. It prefers the server-returned focus links. Helper behavior is unchanged
apart from the client version. The reproducible ZIP, `/muse`, Markdown guide,
download headers and discovery files move to 1.0.2; old versioned ZIPs remain.

## Verification and deployment

Baseline public web SHA: `4df6bb163fdd4e26f99fc424c13c60bfa5692a61`, runtime
`ecs-fargate`. Baseline MCP task definition: `certscore-web-mcp:187`, desired and
running count one. Deploy only through the checked-in AWS web and MCP workflows.
Retain required CI, exact-SHA images, migration-before-web-promotion and ECS
stability/health checks. Reuse exact-SHA push-triggered workflows.

Local regressions cover invalid URLs, access/query/anchor preservation,
posture/region/overall-score mismatch, unknown/null/invalid score packets,
unchanged canonical bundle output, 5,000/8,000-byte bundles, and unchanged origin
request counts over the actual MCP protocol. The existing eleven helper tests,
skill validator, archive parity and change-aware web gate also apply.

Live verification reads existing test scans only: compare returned focus scores
with canonical posture scores, open both views, resolve a retained-evidence
follow-up, verify the exact deployed images and public web revision, and compare
downloaded archive bytes with the tested source. Verify `/muse`, `/muse.md`,
`llms.txt`, `llms-full.txt`, and `.well-known/certscore-ai.json` link to 1.0.2.
Record final workflow URLs, stage timings and live results in the release summary.

## Cost

No additional capture, model call, origin read, evidence storage, schedule or
capacity. The roughly 10 KB archive adds about $0.01/month over 1.0.1 at 100,000
downloads. Combined incremental response/archive transfer is estimated below
$0.10/month at 100,000 bundle responses and downloads each, within the owner's
under-$1 pre-approval and disclosed before implementation.
