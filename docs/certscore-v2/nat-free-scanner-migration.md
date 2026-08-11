# Production v2 scanner NAT-free migration

Status: production California migration and authorized Oregon egress retirement
complete on 2026-08-11 UTC. This report retains the initial inventory and the
subsequent production changes as an audit record.

## Initial-state architecture

At inventory time, each regional Lambda was VPC-attached to one private subnet with one NAT-backed
route table and one EC2 proxy. The proxy subnet uses the VPC main route table
with an Internet Gateway route, so the proxy's public identity is independent
of the Lambda subnet NAT gateway.

| Region | Lambda VPC / subnet / SG | Lambda route table | NAT / NAT EIP | Proxy instance / private IP / public IP | Artifact bucket |
| --- | --- | --- | --- | --- | --- |
| `eu-central-1` | `vpc-09d0905c7427aae64` / `subnet-0a77e23c18b663f9f` / `sg-0ecf2a29ef31b913d` | `rtb-08919441eef0a8fee` | `nat-089fa8994d4253a92` / `18.194.227.13` | `i-0f51a9de3f0330a9b` / `172.31.17.67` / `3.121.221.170` | `certscore-v2-dag-local-artifacts-eu-central-1-199536052647` |
| `eu-west-1` | `vpc-01ab4133f7f748396` / `subnet-0ea3b7c316d9b0013` / `sg-061e61afa475712e0` | `rtb-05702f80fc5665190` | `nat-04c3b66dac1755808` / `34.252.43.1` | `i-0388bb8ef1c083344` / `172.31.22.188` / `34.242.205.119` | `certscore-v2-dag-local-artifacts-eu-west-1-199536052647` |
| `legacy us-west-2` (retired) | `vpc-0343245bd52461b8d` / `subnet-07ac6795251a6d2bb` / `sg-0bc767cf2c7f049f8` | `rtb-0a435effa5969b3ad` | deleted: `nat-061fc1b75743a6dd8` / released: `35.164.175.41` | terminated: `i-0fcf926959f60da18` / released: `34.218.187.36` | retained: `certscore-v2-dag-local-artifacts-us-west-2-199536052647` |

At inventory time, all three Lambda route tables had `0.0.0.0/0` to the listed NAT
gateway and no S3, SQS, or Lambda VPC endpoints. VPC DNS support
and DNS hostnames are enabled in all three VPCs. The Lambda security groups
allow all egress. The proxy security groups allow Lambda security-group access
to TCP 3128 and all proxy egress. The Lambda subnets use default allow-all
network ACLs.

The active California lane now runs in `us-west-1` without a NAT route, using
private AWS service endpoints and the California proxy EIP `18.144.181.165`.
The Oregon Lambda route has no default route, and its NAT gateway, NAT EIP,
proxy instance, proxy ENI/root volume, and proxy EIP have been removed.

The live Lambda configuration preserves the regional proxy settings:

- `SCAN_PROXY_ENABLED=true` and the regional private proxy address;
- `CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER=aws-ec2-proxy`;
- regional proxy label, allocation identity, and retained public-IP hash;
- regional artifact bucket and VPC mode.

The configured public identities are retained by the EC2 proxies. The NAT
public IPs above are separate and are not the scan egress identity.

The initial US-CA regional egress check did **not** satisfy the requested
proxy identity or California geography: retained `EgressPreflight.json`
evidence observed public IP `35.164.175.41` with `region: Oregon`, while the
configured proxy public IP is `34.218.187.36`. The Lambda reached the proxy,
but the observed public IP matched the NAT EIP rather than the proxy identity.
The replacement `us-west-1` lane now passes this fail-closed check with
California public IP `18.144.181.165` and the configured public-IP hash.

## Complete outbound dependency inventory

| Dependency | Code path | Current transport | NAT-free requirement |
| --- | --- | --- | --- |
| Target websites, CMP assets, browser journeys | Playwright / scan-core | Regional EC2 proxy at private `172.31.*:3128` | Preserve proxy instance, SG rule, private route, and egress hash. |
| Policy documents and policy redirects | `policy-surface-scanner.ts` Node `fetch`/`http(s)` | Proxy-aware bounded transport | Verify through retained preflight and canary before NAT route removal. |
| Runtime transport probes | `pre-consent-runtime-scanner.ts` Node `fetch` | Proxy-aware bounded transport | Verify through retained preflight and canary before NAT route removal. |
| Egress identity preflight | `apps/v2-dag-lambda/src/handler.ts` | Explicit HTTPS CONNECT through the regional proxy to `ipinfo.io` | Existing path is compatible; compare the retained hash before/after. |
| OpenAI Nano policy assist | `nano-policy-assist-provider.ts` | Proxy-aware bounded transport to `https://api.openai.com/v1/chat/completions` | Verify through retained preflight and canary. The key value was not read or logged. |
| OpenAI consent visual assist | `nano-consent-ui-assist-provider.ts` and visual review | Proxy-aware bounded transport to OpenAI when enabled | Same verification requirement; post-consent production flow is currently disabled. |
| S3 retained evidence | `@aws-sdk/client-s3` GetObject/PutObject | Regional AWS endpoint | S3 gateway endpoint on the Lambda route table, with object-prefix policy. |
| SQS terminal/policy result publication | `@aws-sdk/client-sqs` SendMessage | Regional AWS endpoint | SQS interface endpoint, private DNS, HTTPS endpoint SG, and scoped queue policy. |
| Lambda shard fan-out | `@aws-sdk/client-lambda` InvokeFunction | Regional Lambda API endpoint | Lambda interface endpoint, private DNS, HTTPS endpoint SG, and scoped function policy. |
| DNS | VPC resolver and policy hostname resolution | VPC DNS | VPC DNS support and hostnames must remain enabled. |
| CloudWatch Logs | Lambda service log delivery | AWS-managed Lambda service path; no direct SDK call in the handler | No function-side Logs endpoint identified. |
| STS, Secrets Manager, KMS, ECR | No direct calls in the production Lambda handler | Not observed in code-owned runtime path | No endpoint added; re-audit if the image or handler adds such calls. |

The Lambda role grants S3 GetObject/PutObject, SQS SendMessage, Lambda
InvokeFunction, CloudWatch log writes, and VPC network-interface management.
There is no direct Secrets Manager, STS, or KMS call in the handler. The live
Lambda environment contains an OpenAI key, but its value was deliberately not
retrieved.

## Proposed NAT-free architecture

```text
Browser/public scan traffic
Lambda -> private EC2 proxy -> public website

Retained evidence
Lambda -> S3 gateway endpoint -> regional evidence bucket

Result, policy, and logging messages
Lambda -> SQS interface endpoint -> regional queues

Lambda logs
Lambda -> CloudWatch Logs interface endpoint -> CloudWatch Logs

Worker fan-out
Lambda -> Lambda interface endpoint -> regional worker invocations

No Lambda subnet 0.0.0.0/0 NAT route after the separately authorized cutover.
```

The Terraform module provisions endpoint resources only when a typed
`vpc_endpoint_config_by_region` entry is supplied. It validates existing VPC
DNS attributes, associates S3 with supplied Lambda route tables, places SQS
and Lambda interface endpoints in supplied Lambda subnets, enables private
DNS, and restricts interface-endpoint ingress to the Lambda security group on
TCP 443. Endpoint policies scope access to the regional retained-evidence
prefix, regional result queues, and regional scanner functions.

The California lane now runs entirely in `us-west-1` (US West,
N. California): Lambda, the proxy, ECR, S3, SQS, and private AWS-service
endpoints moved together. The former `us-west-2` egress resources were retained
through import, canary, cutover, and observation, then explicitly retired.

The scanner runtime now has a regional-egress guard: production Lambda
configuration requires proxy preflight verification, and the US-CA lane
expects `California` from the proxy's public-IP preflight. A mismatch is a
failed preflight, not an observed scan result. The guard also binds the
observed IP to `CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH`, preventing a
reachable proxy or NAT path from being mistaken for the configured proxy.

NAT routes are intentionally not Terraform-managed by this change. This
prevents an endpoint-only apply from deleting the escape path before the
proxy-aware public HTTP work and canaries pass. Route removal is a reversible,
one-region migration action described below.

## Threat and failure analysis

- A missing SQS or Lambda private-DNS record causes result publication or
  worker fan-out failure. Fail closed, retain the NAT route, and inspect VPC
  endpoint state, DNS attributes, endpoint SG ingress, and endpoint policy.
- A missing S3 gateway route causes evidence writes or reads to fail. Do not
  downgrade missing artifacts into findings; restore the NAT route and rerun
  the canary.
- A proxy SG or proxy-health regression changes public egress identity or
  blocks browser/policy traffic. Preserve the proxy and compare the retained
  public-IP hash.
- A proxy can be reachable while geolocating to the wrong state. The US-CA
  guard checks the observed public-IP region, not merely `us-west-1`, the
  `us-ca` label, or the Lambda timezone.
- The direct Node HTTP/fetch blocker is addressed in code by the bounded
  proxy transport, but it still requires a live canary before the NAT route
  is removed. An endpoint does not provide public website or OpenAI access.
- Endpoint placement in another AZ can add cross-AZ cost and latency. Use the
  Lambda subnet(s) in each region and record any multi-AZ placement before
  applying.
- Endpoint policy over-restriction can fail valid S3/SQS/Lambda calls. Test
  the exact bucket prefix, all three queue types, and worker function ARN
  before route removal.
- Endpoint policy over-broadening can grant unintended access. Keep the role,
  bucket prefix, queue ARNs, and function ARN constraints in the plan review.

## Executed rollout and former rollback plan

The California target is `us-west-1`. The seven-day read-only
baseline below belongs to the legacy `us-west-2` lane and must be retained for
historical comparison. Its public egress geography was a blocker. Its
baseline showed zero result-DLQ and async-failure messages, while `eu-central-1` had
two result-DLQ messages and `eu-west-1` had five result-DLQ plus two
async-failure messages. The legacy `us-west-2` lane has six Lambda errors in
the same window,
so the canary must be correlated to a unique scan ID and must not treat a
successful invocation alone as sufficient.

1. Provision the `us-west-1` Lambda, proxy, ECR, S3, SQS, and endpoint resources
   and import them into the regional stack without touching legacy `us-west-2`.
2. Verify `EgressPreflight.json` reports `region: California` while retaining
   the expected proxy allocation identity and Chrome proxy settings.
3. Verify the proxy-aware Node HTTP/fetch for policy, transport, and OpenAI
   calls in a retained canary. Keep the existing three-lane evidence contract
   unchanged.
4. Populate private Terraform variables from the inventory. Run a targeted
   plan for `us-west-1` and verify no Lambda replacement, VPC detachment,
   proxy/environment removal, bucket/queue replacement, or route deletion.
5. Apply only the endpoint security group, S3 gateway endpoint, SQS interface
   endpoint, and Lambda interface endpoint for `us-west-1`, after explicit
   authorization. Import any existing Terraform-owned resources first.
6. From the Lambda network path, verify private DNS for SQS and Lambda,
   S3 put/get, SQS result publication, Lambda shard invocation, and endpoint
   SG/policy behavior. Keep the NAT route present.
7. Run a production-quality canary with the NAT route still present. Confirm
   all three lanes, proxy egress hash, S3 artifacts, SQS ingestion, artifact
   mirroring, screenshots, traces, retained policy text, and report
   materialization.
8. Inspect `V2ScanCorePhases.json`, `CanonicalEvidenceBundle.json`,
   `LocalV2DagLambdaManifest.json`, `LambdaArtifactMirrorManifest.json`, and
   `v2_lambda_result.received`. Report scanner-core time separately from
   post-completion handoff.
9. Remove only the `0.0.0.0/0` route from the Lambda subnet route table using a
   reversible, separately authorized change. Do not delete the NAT gateway.
10. Run the same canary again and compare invocation, duration, timeout/error
   rate, browser navigation, DNS, proxy identity, lane completeness, artifact
   hashes/sizes, SQS age/DLQs, CloudWatch errors, and report projection.
11. Observe at least one normal operating window, including a traffic peak.
   Restore the NAT route immediately on any required dependency, evidence, or
   ingestion failure.
12. Only after a clean observation window may a separate deletion proposal be
    prepared for that region's NAT gateway and NAT EIP. Repeat the full gate
    independently for the other regions.

The former rollback was to re-add the exact NAT route to the original route
table and NAT gateway, verify the route, and rerun the canary. That rollback is
no longer available after the separately authorized deletion of the Oregon NAT
and proxy resources. Recovery now requires recreating explicitly reviewed
regional infrastructure; it must not silently reuse the retired identities.

## Verification status

The additive California migration was first provisioned in `us-west-1` while
retaining the legacy `us-west-2` route and NAT gateway through canary and
observation. Those legacy egress resources were subsequently retired. The new VPC is
`vpc-01019d44b6db91865` (`10.241.0.0/16`), the proxy EIP is `18.144.181.165`,
and the Lambda uses private subnets with S3, SQS, Lambda, and CloudWatch Logs
endpoints. The California Lambda image is
`sha256:d61433e615a003da6705393eea2ef04c929e6895938d7a38042ff15b74247675`.

The synthetic California canary completed with a retained canonical bundle.
Its `EgressPreflight.json` observed public IP `18.144.181.165`, region
`California`, country `US`, timezone `America/Los_Angeles`, and the configured
public-IP hash. The canary also retained the manifest, scan phases, runtime
telemetry, consent geometry evidence, and canonical bundle.

A second post-cutover canary (`migration-us-ca-observation-20260811-222950`)
completed in `16.3s` through the deployed `us-west-1` Lambda and retained the
same canonical artifacts. Its egress preflight again observed
`18.144.181.165` in California with `probeStatus: available`, `error: null`,
and the configured public-IP hash. At the observation check, the California
production result queue, production DLQ, and async-failure queue each had zero
available or in-flight messages. The separate local synthetic queue contained
three available messages from prior direct canaries and is not the production
handoff queue.

A subsequent read-only health checkpoint found the California Lambda `Active`
with `1` recent invocation and `0` recent errors. The web service remained at
`2/2` tasks on task definition `391`, the validation worker at `1/1` on task
definition `357`, and the California private route table still contained only
the VPC-local and S3 gateway-endpoint routes.

The old Oregon Lambda subnet's `0.0.0.0/0` route was then removed from
`rtb-0a435effa5969b3ad`. The post-removal canary
(`migration-us-ca-post-route-removal-20260811-223249`) completed in `16.3s`,
retained its canonical artifacts, and again verified California egress through
`18.144.181.165` with the configured hash. Production result, DLQ, and
async-failure queues remained empty. After the post-removal validation, the old
NAT gateway `nat-061fc1b75743a6dd8` was deleted and its EIP `35.164.175.41`
was released. The separate Oregon proxy was retained through the observation
window and later removed under its own authorization.

The public production intake was also exercised with a bounded California
`example.com` scan (`6f28f63a-15d8-431b-9b64-4018e48bb1f7`). It reached
`completed_limited` in `17.9s`; the limitation was the intentional Example
Domain placeholder, not scanner or queue failure. The production result queue,
DLQ, and async-failure queue remained empty after completion, and the public
API health endpoint returned `200`.

Terraform remote state reconciliation is complete for the California lane. The
live resources are imported under `module.us_west_1`; the stale
`module.us_west_2` addresses were archived from state without deleting the
remaining remote Oregon resources. The targeted California apply added the
missing alarms, S3 lifecycle, and SQS redrive protections, then updated the
shared role policy and endpoint policies with zero destroys. Two bounded
post-apply canaries exposed and corrected missing local-result SQS permission
and an endpoint-policy principal mismatch. The final canary
(`migration-us-ca-post-endpoint-policy-225644`) completed in `16.2s`, retained
its canonical artifacts, and targeted refresh-only Terraform verification now
reports the California lane as reconciled. The subsequent all-region plan was
limited to two EU duration alarms and two EU Lambda environment updates; it
applied with `2 added, 2 changed, 0 destroyed`. Both new EU alarms are `OK`.
The live California Lambda remains `Active` with its private proxy server,
California expected-region guard, EIP identity hash, and proxy-enabled flag.

The live application cutover is complete: web task definition `391` and
validation-worker task definition `357` contain the `us-west-1` California
dispatch mapping and use the California production result queue
`certscore-v2-dag-local-production-results`. Both ECS services reached steady
state with the new images. The full production-quality comparison is still
**pending**. The legacy default route, NAT gateway, and NAT EIP have now been
removed; the proxy identity remains unchanged.

A post-migration California operating-window check found zero Lambda errors
after the final endpoint-policy fix, zero throttles, a maximum sampled duration
of `31.1s`, no active California alarms, an `ok` proxy instance, steady ECS
services (`2/2` web and `1/1` validation worker), zero production/DLQ/async
queue depth or age, and a `200` API health response. Three active EU queue
alarms predate this migration: Frankfurt retains `2` production-DLQ messages,
while Ireland retains `5` production-DLQ messages and one uniquely enumerated
async-failure message. SQS's approximate count temporarily reported two async
messages, but reversible visibility-controlled enumeration found eight unique
messages in total. Initial triage did not delete any message.

The EU triage identified three distinct causes. Frankfurt's two messages are
`local` policy-evidence test packets in a production worker DLQ; both retained
policy packets still exist in S3. Ireland's five DLQ messages are completed,
artifact-verified production scanner results that exhausted retries when the
then-deployed score-materialization endpoint returned HTTP `502`/`503`. All ten
manifest/canonical-bundle objects still exist. Three associated scan records
remain failed and are candidates for the current verified late-result recovery
path; two scan IDs now return `404`, so blind redrive would fail. A selective
redrive of the three existing failed records was attempted after authorization,
but the current worker rejected each one because the historical retained
artifact identity predates and does not match the current Lambda-result
contract. The scans remained failed and the queue retry policy returned the
messages to the Ireland DLQ. At `2026-08-11T06:37:46Z`, the Ireland source
queue was empty with no in-flight messages and its DLQ again contained all
five visible result messages. This is the intended fail-closed result; no
historical artifact was projected. Ireland's one
unique async-failure message is a July 29
`LocalV2DagLambdaSafetyTimeoutError` generated by the obsolete `3995ms`
internal safety deadline. Triage used temporary visibility holds and restored
every non-redriven receipt.

The same recovery check exposed a separate migration drift in the live
validation-worker task role: its regional queue policy still allowed the old
`us-west-2` result queue instead of the California `us-west-1` queue. The live
inline policy was corrected to match the repository configuration. IAM policy
simulation now allows receive, delete, and visibility operations on the
California queue, no subsequent access-denied event was observed, and the
California production queue remained empty.

After separate explicit authorization, the five Ireland result messages, two
Frankfurt local-test packets, and one obsolete Ireland async-timeout message
were deleted by exact scan/message identity. No queue was purged. All regional
production result, DLQ, and async-failure queues then reported zero visible,
in-flight, or delayed messages. The retained Frankfurt policy packets and all
five Ireland canonical evidence bundles remain in S3; queue-message deletion
does not remove those artifacts. After the normal five-minute CloudWatch metric
evaluation, all three former EU queue alarms cleared to `OK` without a manual
alarm-state override.

### Post-migration California SDK incident

An SDK workbook exposed repeated California `rate_limited` rows with no scan
ID. The stored throttle reason was `domain_1_minute_scan_limit`, but this was a
secondary retry symptom: the immediately preceding request failed because the
web ECS task role still allowed Lambda invocation, result-queue access, and
artifact access in `us-west-2`. Its Terraform-managed inline policy was updated
in place to the existing `us-west-1` configuration, and both web tasks were
rolled to refresh their role sessions.

The first successful California invocation then exposed an independent
NAT-free transport defect. HTTPS Node probes opened a proxy CONNECT tunnel but
used a one-off HTTPS agent that attempted direct target DNS instead of wrapping
the tunnel in TLS. Aborting the resulting timeout also emitted an unhandled
tunnel-socket error, crashing the runtime and policy evidence workers. The
proxy transport now uses an explicit TLS-over-CONNECT agent and retains a
socket error handler through abort cleanup. Focused proxy tests, scanner-core
typecheck, and 257 broader scanner-core tests passed before the unrelated slow
fixture-corpus tail was stopped.

California was deployed on immutable image digest
`sha256:8b4834ff16ff3b5781ecfe418e4032546476c08d33c76e46cb10cfaff0fdf06d`.
The validation-worker role also had a stale Oregon artifact-bucket ARN; that
single ARN was replaced with the California bucket and the worker was rolled.
Final canary `03c9519b-a77e-4314-b528-5d24b74f29be` completed without an error.
Its persisted runtime provenance records the deployed digest, `us-west-1`, and
the California proxy EIP allocation. All three retained lane preflights
observed `18.144.181.165`, `California`, `US`, and
`America/Los_Angeles`. The California result queue returned to zero visible,
in-flight, and delayed messages, and the public v2 health endpoint returned
HTTP `200`.

## Cost comparison

The task baseline estimates approximately `$103/month` for NAT gateway hours,
`$8/month` for NAT data processing, and `$11/month` for the three NAT public
IPv4 addresses, or roughly `$122/month` gross.

The read-only Cost Explorer query for 2026-05 through 2026-07 returned NAT
usage records but unblended NAT-hour cost was `$0` in the sampled account
(likely credits/discounts or billing allocation), so it does not reconcile to
the list-price estimate. July recorded 1,936 regional NAT gateway hours and
approximately 19.92 GB of EU/US NAT bytes in the returned usage records. The
query also includes unrelated account-wide public IPv4 and regional transfer
usage, so those values cannot be safely attributed to these three NATs alone.

The final July Cost Explorer check confirmed the same account-level pattern:
`744` EU NAT hours, `596` EU-central-1 NAT hours, and `596` US-west-2 NAT
hours, with approximately `19.92 GB` of NAT bytes and effectively `$0`
unblended NAT cost after credits/discounts. The VPC service showed approximately
`$38.80` of public-IPv4 usage across the account; no separate positive interface
endpoint line was returned in the grouped usage data. These account-wide
figures are recorded as a baseline, not as an exact per-scanner allocation.

The required endpoint set is now three interface endpoints per region (SQS,
Lambda, and CloudWatch Logs), plus an S3 gateway endpoint. At the reference
`$0.01/endpoint-hour`, that is about `$65.70/month` for three endpoints in
each region. Interface endpoint data processing and any cross-AZ transfer are
additional; same-subnet/AZ placement should avoid cross-AZ charges. The final
cost gate must use Cost Explorer after the endpoint canary and account for
all three interface services.

## Retirement complete

The separately authorized final Oregon cleanup terminated proxy instance
`i-0fcf926959f60da18` and released EIP `34.218.187.36`
(`eipalloc-0b1604eccbf6fa5e8`). Its dedicated ENI
`eni-0dfb84531fcc303f9` and root volume `vol-026745142596c8d18` were deleted
with the instance. A final ownership check found that the only other attachment
to security group `sg-0ffdd71522bd99658` was stopped duplicate proxy instance
`i-0e95043e7255dd1bf`, not an unrelated workload. That duplicate was also
terminated; ENI `eni-0978f1f0b7f83ede6` and root volume
`vol-0b3252ae01ca42890` were deleted with it. With no remaining attachments or
references, the proxy security group was deleted.

The old Oregon Lambda route's default route, NAT gateway
`nat-061fc1b75743a6dd8`, and NAT EIP `35.164.175.41` were removed after the
California canary. The legacy `us-west-2` Lambda and retained data resources
were already outside active Terraform module addresses. Under a later explicit
authorization, the unusable legacy Lambda, all four empty Oregon scanner
queues, the ECR repository with `80` images (approximately `29.7 GB`), the
Lambda log group (approximately `27.6 MB`), and all six matching Oregon alarms
were deleted. Final verification found no Lambda, scanner queue, ECR
repository, Lambda log group, alarm, live proxy EIP, proxy ENI, proxy volume,
or proxy security group in the retired lane. The two proxy instance records
remain only in the `terminated` state.

After AWS asynchronously released the final two Lambda Hyperplane ENIs, the
dedicated Oregon Lambda subnet `subnet-07ac6795251a6d2bb`, route table
`rtb-0a435effa5969b3ad`, and security group `sg-0bc767cf2c7f049f8` were also
deleted. The shared default VPC `vpc-0343245bd52461b8d` and its default
subnets were intentionally preserved. Final verification found no matching
Lambda ENIs, and the production v2 health endpoint continued to return HTTP
`200`.

The versioned Oregon artifact bucket
`certscore-v2-dag-local-artifacts-us-west-2-199536052647` remains available for
evidence retention, and the shared `certscore-v2-dag-local-role` IAM role
remains because active regional scanners use it. Oregon cannot serve as a
rollback lane without explicit infrastructure recreation.
