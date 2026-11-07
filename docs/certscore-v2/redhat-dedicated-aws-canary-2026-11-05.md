# CertScore.ai dedicated Red Hat AWS canary

One authorized synthetic Red Hat scan ran on
`certscore-v2-dag-local-redhat-canary:1` in `us-west-1`. It completed the
verified dispatch and artifact path. The opt-out worker stopped before clicking
because the live control was not ready with enough time left for the required
action and follow-up. The run did not establish opt-out registration or
post-confirmation tracking behavior.

| Verified check | Result |
| --- | --- |
| AWS invocation | One qualified RequestResponse call; AWS executed version 1 |
| Scan ID | `9cf5ddf3-d056-41ed-81a5-74a22b6bfe81` |
| Coordinator window | 05:20:00.529–05:20:31.236 UTC on November 6 (November 5 Pacific) |
| Opt-out dispatch | Verified first-layer control in the consent lane; supported route; one worker invoked |
| Route | Exact apex 301 to `https://www.redhat.com/en`, then HTTP 200; original document bound |
| Opt-out capture | Limited at 1,819 ms; `control_not_ready_with_action_reserve` |
| Choice and activity | Zero opt-out clicks, zero SDK reads, no reload; choice not attempted; post-confirmation observation not measured |
| Accept and Reject | Both existing lanes joined, zero added tail wait for either |
| Regular daily audit | Excluded; zero production scan or reportable rows |

The previous local check recorded a terminal CMP choice at 2,414 ms. It remains
valid for that visit. The AWS run used a separate fresh worker context; its
earlier consent observation is evidence for dispatch, not evidence that the
action control became ready again before the deadline. This sample does not
identify the cause of the readiness cutoff. No retry or follow-up site contact
was made.

## Release and evidence

The canary image used the live scanner's original Git revision as its base
(`6bbc31609772f7616f53229f3ce6a8630a76d24c`) and added only the reviewed
dedicated Red Hat path and supporting tests. The isolated commit is
`fd6733b5ee72e63667b0f0c9b8ec87ab25f7f65f`, pushed to
`codex/redhat-dedicated-canary-20261105`. The image was built once using the
canonical runtime base and replicated with digest parity:
`sha256:70d7e2def2aeaff41fcfc7cbec934a11659e777828d423534b173d8930809957`.
Fresh IP lookup databases passed the canonical packaging check. The dedicated
release matched shared capture configuration, role, VPC, memory and timeout.
It has no aliases or event-source mappings. The shared scanner remained on
its original revision and image; no shared consumer or scheduler was deployed.

Local checks covered the exact source's gate, v4 packet, reload and isolated
browser behavior, Accept/Reject coordinator behavior, and TypeScript. AWS
preflight verified exact qualified invocation, the local verification queue,
IAM permissions for each claim key, matching shared settings and an empty
claim prefix. DryRun returned 204 and made no contact. The single approved
invocation then consumed a top-level admission claim before browser work;
coordinator and worker claims independently bound the same consent source
and parent dispatch. The approval object was revoked and read back as false.

The replay verified the returned manifest and canonical bundle sizes/hashes,
the original consent worker bundle hash and observation/document token, and
the independently stored action packet against the canonical embedded copy.
It rechecked the action packet against the executed dispatch, both claim
records, the exact parent hash and the scan identity. The existing canonical
projectors and daily choice reader reported dispatch recorded, action not
completed, confirmation not attempted and activity not measured. No historical
evidence or ordinary dashboard snapshot was rewritten.

The terminal AWS message had purpose `synthetic_verification` and used the
existing local result queue. No customer report was persisted. The daily cohort
reader marked it `excluded_canary_or_test`. A separate exact-ID read-only
database query verified zero production scan rows and zero reportable rows.
The authorized contact was recorded in the central and manual calibration
ledgers. Disconnected ECS waiters were recovered from the already-started tasks.

No recurring scan or provisioned capacity was added. Estimated upper bound for
storing both 412 MB image copies is $0.09/month before layer reuse at the
[AWS ECR private storage example rate](https://aws.amazon.com/ecr/pricing/).
The single scan, image transfer, and contact/audit bookkeeping are estimated
below $0.25 one time, not a measured bill.

Receipts and commands are under `outputs/redhat-dedicated-aws-2026-11-05/`.
