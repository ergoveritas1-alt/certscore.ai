# Phase 2 Egress Experiment Plan

## Purpose

Phase 2 answers one question: which scanner egress strategy preserves scan quality best under controlled production calibration load?

The prior load-test work points to egress/browser reputation heating as the leading scan-quality degradation mechanism. Phase 1A through Phase 1C now gives us the guardrails needed to test this without repeating the uncontrolled burst pattern:

- scan-level runtime and egress metadata
- trusted production-load-test classification proof
- DB-backed canary verification
- durable scanner-quality history
- visual scanner-quality dashboard
- per-egress budget and manual-pause controls

Email notification is intentionally out of scope for this phase.

## Arms

### Arm A: Current AWS Default Egress

Use the current scanner deployment and `egress_id=aws-default`.

Purpose:

- establish the live control baseline
- keep the comparison anchored to the current production posture

### Arm B: AWS Owned Egress Pool

Use AWS-controlled egress identities, such as a NAT/EIP pool or equivalent owned outbound IP pool.

Purpose:

- test whether spreading scans over owned, stable egress identities improves quality
- avoid introducing a third-party proxy/browser dependency before we know whether owned infrastructure is enough

Expected metadata:

- stable `egress_id` per outbound path, for example `aws-eip-01`
- stable `egress_provider=aws`
- scan must keep the same egress identity for its full execution

### Arm C: Managed Browser or Proxy Provider

Use a managed provider only after Arm B design is clear.

Purpose:

- test whether managed reputation, IP diversity, or browser infrastructure materially improves access posture and findings/completed
- quantify cost and variance compared with AWS-owned egress

Expected metadata:

- stable provider-specific `egress_id`
- stable `egress_provider`
- no mid-scan identity rotation unless explicitly designed and recorded

## Current Baseline Evidence

Use these recent tiny calibrations as context, not as final Phase 2 evidence:

| Slice | Run | Completed | Findings/completed | Zero-finding | Pages | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1206-1230 | `prod-manifest-1206-1230-load-test-20260522-2113` | 25 | 2.60 | 48.0% | 48 | Phase 1B threshold-planning calibration |
| 1231-1255 | `prod-manifest-1231-1255-load-test-20260522-1435` | 25 | 1.28 | 64.0% | 50 | In-family despite high zero-finding |
| 1256-1280 | `prod-manifest-1256-1280-load-test-20260522-1505` | 25 | 1.88 | 36.0% | 53 | Post-deploy warning-semantics validation |
| 1281-1305 | `prod-manifest-1281-1305-load-test-20260522-1534` | 25 | 1.16 | 64.0% | 30 | Durable-history smoke |
| 1306-1330 | `prod-manifest-1306-1330-load-test-20260523-0202` | 25 | 1.68 | 52.0% | 47 | Phase 1C budget-validation smoke |

These runs confirm that a 25-row window is useful for plumbing validation, but too small for final egress-arm judgment.

## Experiment Design

### Recommended First Phase 2 Size

Run 100 rows per arm, split into four 25-row windows.

Why:

- aligns with the dashboard's 100-scan trend view
- gives enough windows to see within-arm drift
- keeps each step small enough to stop quickly
- avoids treating any single 25-row cohort as representative

Initial cohort:

- rows `1206-1305`, because same-range historical artifacts already exist
- one arm at a time until Arm B and Arm C are operationally proven

Do not run all arms simultaneously at first. Sequential runs reduce scanner fleet pressure and make egress-specific quality easier to interpret.

### Later Phase 2 Size

If the 100-row pass is clean, expand to 250 rows per arm.

Only expand when:

- per-egress budget checks are passing or warning as expected
- scanner queue drains cleanly between windows
- no manual cleanup caveat remains
- dashboard windows are persisted and visible

## Controls

Every arm must keep these inputs constant:

- same manifest rows
- `forceNewScan: true`
- canonical batch id shape: `prod-manifest-<START>-<END>-load-test-YYYYMMDD-HHMM`
- same 2-second enqueue pacing unless a budget gate delays or blocks
- no enqueue retries
- no target-domain preflight
- no `/api/scan-url-preflight`
- DB-backed queue metadata canary before non-canary rows
- same scanner code version unless the arm requires a scanner deployment, which must be recorded

## Per-Egress Budgets

Start with the deployed Phase 1C defaults unless a current policy artifact says otherwise:

- `maxConcurrentNonTerminal: 25`
- `maxStartedPerHour: 50`
- manual pause: false
- cooldown: none

For Phase 2, prefer keeping budgets identical across arms at first. If Arm C requires provider-specific rate limits, record that as a cost and operational-complexity factor.

## Required Metrics

Primary quality metrics:

- findings/completed
- zero-finding rate
- pages scanned per completed scan
- access posture distribution
- blocker/auth/captcha/interstitial label rates

Operational metrics:

- accepted/completed/failed/rejected counts
- reusedExistingScan count
- queue wait time
- run duration
- scanner task distribution
- scanner slot distribution
- egress budget decision
- warning count and comparison tier
- cleanup posture

Cost and complexity metrics:

- per-scan provider cost when known
- setup/deploy complexity
- operational failure modes
- vendor lock-in or compliance concerns

## Stop Criteria

Stop before enqueue if:

- production version does not match the intended deployed version
- scanner service is unhealthy
- queue is not low/idle
- autoscaling posture is unhealthy
- classifier proof fails
- DB-backed canary fails or cannot be verified
- egress budget check blocks or delays
- manual pause is active

Stop during a multi-window arm if:

- a window has zero-finding rate above 80%
- findings/completed drops below 0.5
- average pages/completed drops below 1.1
- early-loss posture exceeds 40%
- scanner queue does not drain between windows
- cleanup cannot restore idle posture

These stop criteria are operational guardrails. They do not create product findings and must not feed the canonical finding pipeline.

## Interpretation Rules

Use only completed scans for quality comparisons.

Do not infer findings from:

- raw signals
- display-only context
- repair outcomes
- stale monitor summaries
- historical benchmark JSON outside the explicit comparison set
- support packets without top-finding eligibility

Finding counts must come from final scan-status `includeFindings=1` evidence or persisted scanner-quality windows derived from that evidence.

Separate access-posture improvement from finding-quality improvement:

- fewer blocks with flat findings/completed means better access, not necessarily better detection
- higher pages with flat findings/completed may be positive if zero-finding also improves
- higher findings with worse access posture needs manual review before declaring the arm better

## Phase 2 Execution Order

### Step 1: Arm A Control Rerun

Run rows `1206-1305` in four 25-row windows with the current AWS default egress.

Purpose:

- produce a clean, current 100-row control after Phase 1C
- confirm budgets, dashboard, and durable history behave over multiple windows

Status:

- completed
- accepted/completed/failed/rejected: 100/100/0/0
- findings/completed: 1.75
- zero-finding: 54%
- pages/completed: 1.83

### Step 2: Arm B Minimal Infrastructure

Design and implement the smallest AWS-owned multi-egress path.

Requirements:

- each scanner task or slot must stamp a stable `egress_id`
- egress identity must remain stable for the whole scan
- per-egress budgets must apply independently
- dashboard must group by egress id

Do not start Arm C until Arm B can run a 25-row smoke safely.

Status:

- first implementation completed as a single AWS-owned NAT/EIP path
- `egress_id=aws-eip-01`
- NAT EIP: `52.9.24.50`
- scanner task definition during test: `ws01-scanner-worker:115`
- restored after test to default scanner posture on `ws01-scanner-worker:116`
- NAT gateway, private subnet, route table, and EIP were cleaned up

### Step 3: Arm B 25-Row Smoke

Run one 25-row window through the new AWS-owned egress path.

Pass criteria:

- metadata stamps the expected `egress_id`
- budget check runs for that egress
- DB-backed canary passes
- durable window persists
- dashboard shows the egress separately

Status:

- completed as part of the single-EIP Arm B run

### Step 4: Arm B 100-Row Comparison

Run the same rows as Arm A, split into four 25-row windows.

Compare:

- total findings/completed
- zero-finding rate
- pages/completed
- access posture
- warning events
- variance by egress id

Status:

- completed for single-EIP Arm B
- accepted/completed/failed/rejected: 100/100/0/0
- findings/completed: 1.65
- zero-finding: 55%
- pages/completed: 1.84
- quality warnings: 1, `quality_regression_vs_baseline` on rows `1231-1255`

Decision:

- single-EIP Arm B was inconclusive to slightly worse
- do not expand this single-EIP design to 250 rows
- do not treat this as evidence that a true multi-egress pool will fail
- it does show that replacing default AWS public egress with one owned static EIP does not solve the quality problem

### Step 5: Arm C Decision

Only proceed to managed provider testing if Arm B does not improve enough or is operationally too costly.

Before Arm C implementation, produce a provider-specific risk note covering:

- data exposure boundaries
- provider logs and retention
- per-scan cost
- rate limits
- identity stability
- whether the provider changes browser/runtime behavior enough to affect comparability

## Decision Note: B2 Versus C

The single-EIP Arm B result narrows the hypothesis:

- a single owned static EIP is not meaningfully better than default AWS public egress
- the likely quality risk is not just "AWS public IP versus AWS owned EIP"
- the more plausible issue is sustained pressure on a small number of observable scanner identities

That means the next AWS test should not be another single NAT/EIP. It should be a real multi-egress pool with independent egress identities and independent budgets.

### Option B2: True AWS Multi-Egress Pool

Design:

- create three to five stable AWS egress identities
- assign a distinct `egress_id` per egress identity, for example:
  - `aws-eip-01`
  - `aws-eip-02`
  - `aws-eip-03`
- keep each scan on one egress identity for its full execution
- enforce Phase 1C budgets independently per `egress_id`
- record scanner task, slot, subnet or egress assignment, started/completed time, pages, findings, zero-finding, access posture, and warnings

Benefits:

- closest to the current infrastructure and security model
- avoids third-party browsing/proxy data exposure
- lets us directly test the "egress identity heating" hypothesis
- preserves browser/runtime comparability better than a managed provider

Risks:

- more AWS networking complexity
- more NAT/EIP cost while active
- may still perform poorly if the issue is broader AWS address-space reputation or browser-fingerprint reputation
- requires careful task-to-egress assignment so the metadata matches the actual outbound path

Recommended B2 smoke:

- use three egress identities, not one
- run a single 25-row smoke first
- target roughly even assignment across egress IDs
- stop if any egress budget blocks, metadata is wrong, or dashboard grouping is unclear

Recommended B2 comparison:

- if the smoke passes, run the same `1206-1305` 100-row cohort
- compare against Arm A and single-EIP Arm B
- report both aggregate quality and per-egress variance

### Option C: Managed Browser or Proxy Provider

Design:

- use a provider that offers controlled browser/proxy egress with stable session-level identity
- stamp a provider-specific `egress_id` and `egress_provider`
- keep identity stable within each scan
- make provider rate limits explicit in the budget policy

Benefits:

- may improve access posture if provider reputation is materially better
- may provide larger identity pools without custom AWS networking
- could be faster to scale if the provider contract is acceptable

Risks:

- higher direct per-scan cost
- vendor lock-in
- provider logs and data-retention questions
- possible policy or compliance review before sending public-site scan traffic through the provider
- browser/runtime differences may make results less comparable to current scanner behavior
- managed "anti-detect" behavior can accidentally change what CertScore is measuring

Provider questions before any Arm C implementation:

- what data does the provider see and retain?
- are URLs, page contents, screenshots, cookies, headers, or browser fingerprints logged?
- can identity remain stable for a full scan?
- can identity be pinned to a named `egress_id`?
- what are the rate limits and expected costs at 100, 250, and 1000 scans?
- does the provider modify TLS, headers, JavaScript, cookies, or browser APIs?
- can we disable features that would make reports less representative of normal user access?

### Recommendation

Proceed with B2 before Arm C.

Reason:

- single-EIP Arm B did not improve quality, but it did not test distribution across multiple egress identities
- B2 tests the most direct hypothesis while keeping the scanner runtime and data boundary closest to current production
- Arm C should remain a design/risk note until B2 either fails or proves too costly/complex

Go/no-go criteria for B2:

- go if three to five egress identities can be implemented with stable per-scan metadata
- no-go if task-to-egress routing cannot be made deterministic enough to trust the dashboard
- no-go if cost or networking complexity is higher than moving directly to a managed provider proof

## B2 Implementation Plan: Three-Service AWS NAT/EIP Pool

Recommended path:

- create three scanner ECS services, one per stable AWS egress identity
- place each service in exactly one private scanner subnet
- give each scanner subnet its own route table with `0.0.0.0/0` routed through one NAT Gateway
- attach one Elastic IP to each NAT Gateway
- set scanner task environment so the service name, subnet route, NAT Gateway, EIP, and `SCANNER_EGRESS_ID` match one-to-one

Recommended identities:

| Egress id | Egress type | ECS service | Task family | Private subnet role | NAT/EIP role |
|---|---|---|---|---|---|
| `aws-eip-01` | `aws_nat_eip_pool` | `ws01-scanner-worker-b2-01` | `ws01-scanner-worker-b2-01` | `scanner-b2-01` | `scanner-b2-01` |
| `aws-eip-02` | `aws_nat_eip_pool` | `ws01-scanner-worker-b2-02` | `ws01-scanner-worker-b2-02` | `scanner-b2-02` | `scanner-b2-02` |
| `aws-eip-03` | `aws_nat_eip_pool` | `ws01-scanner-worker-b2-03` | `ws01-scanner-worker-b2-03` | `scanner-b2-03` | `scanner-b2-03` |

Use three identities for the first B2 smoke. Do not start with five unless the three-identity smoke proves the routing, metadata, dashboard grouping, and cleanup path.

### Required AWS Resources

Reuse:

- existing scanner ECR repository
- existing scanner image
- existing scanner IAM execution role and task role, if permissions are sufficient
- existing scanner security group only if it is still DB-reachable from the private B2 subnets
- existing scanner CloudWatch log group, or create distinct B2 log groups if operator clarity is worth the extra setup

Create for B2:

- three Elastic IPs
- three NAT Gateways
- three private scanner subnets, or three existing private subnets that can be dedicated to this experiment
- three route tables, each associated to exactly one B2 scanner subnet
- three ECS services in `certscore-validation-cluster`
- three task definitions or task families rendered from the current scanner image with distinct B2 env

Cost-bearing while active:

- three NAT Gateways accrue hourly and data-processing charges
- three allocated Elastic IPs can accrue charges, especially when unattached or left idle
- B2 ECS/Fargate services and tasks accrue normal task runtime charges while desired count is above zero
- CloudWatch logs and data transfer may add smaller supporting costs

Do not reuse a single ECS service across multiple B2 subnets for this test. If AWS places tasks across multiple subnets while the container has one `SCANNER_EGRESS_ID`, runtime metadata can stop matching the real outbound path.

### WS01 Configuration

No scanner runtime code change is required for the controlled B2 smoke. WS01 already:

- accepts `SCANNER_EGRESS_ID` and `SCANNER_EGRESS_TYPE`
- stamps runtime metadata when claiming queued scans
- persists egress metadata to `scans`
- refreshes `scanner_egress_risk_state` by egress id

Each B2 service should render a task definition with:

```text
SCANNER_EGRESS_ID=aws-eip-01
SCANNER_EGRESS_TYPE=aws_nat_eip_pool
SCANNER_REGION=us-west-1
SCANNER_ASSIGN_PUBLIC_IP=DISABLED
ECS_SUBNET_IDS=<private-subnet-for-aws-eip-01-only>
ECS_SERVICE_NAME=ws01-scanner-worker-b2-01
SCANNER_TASK_FAMILY=ws01-scanner-worker-b2-01
```

Repeat for `aws-eip-02` and `aws-eip-03`.

Keep `WORKER_CONCURRENCY=1` for the first smoke unless there is a current operator reason to do otherwise. Concurrency can be raised later only after egress-budget evidence and queue behavior are clean.

### WC01 Configuration

No product code change is required for the first controlled smoke.

This B2 smoke must not affect customer-facing product behavior, finding-pipeline logic, report rendering, reviewer datasets, regulatory projections, or canonical finding eligibility. The experiment changes scanner infrastructure/configuration and scan metadata only.

WC01 already has:

- `scans.egress_id`, `egress_provider`, scanner task, scanner slot, scanner region, and observed outbound metadata columns
- Phase 1C egress budget policy keyed by `egress_id`
- durable `scanner_quality_windows` keyed by `egress_id`
- admin scanner-quality grouping by egress id

For each controlled slice, write or point the load-test runner at an egress budget policy file whose `egress_id` matches the only active B2 scanner service for that slice. This makes the pre-enqueue budget decision match the actual scanner path without adding queue-affinity code.

Example policy shape:

```json
{
  "egress_id": "aws-eip-01",
  "egress_provider": "aws_nat_eip_pool",
  "maxConcurrentNonTerminal": 25,
  "maxStartedPerHour": 50,
  "manualPause": false
}
```

### Scan Stability

A scan remains stable on one egress because:

- only one B2 scanner service is active for a controlled slice
- that service can place tasks only in its single B2 private subnet
- that subnet has one default route to one NAT Gateway
- the NAT Gateway has one attached EIP
- the scanner claims the scan once and executes it in the same process/task

Do not change the subnet route table, NAT Gateway, task definition, or service desired count while a slice has running scans.

### Budget Awareness Before Enqueue

For the no-code smoke, budget awareness is operational rather than queue-affinity based:

1. Set only one B2 service desired count above zero.
2. Use an egress budget policy file for that exact `egress_id`.
3. Run the Phase 1C budget check before enqueue.
4. Enqueue only that service's slice.
5. Wait for terminal status and dashboard/history persistence.
6. Scale that service back to zero before moving to the next egress id.

This is deterministic enough for a 25-row smoke. A fully concurrent B2 pool with preassigned domains would require a future queue-affinity change so queued scan rows carry an intended egress id and scanners claim only matching rows.

The current pull queue cannot guarantee row-to-egress assignment when multiple B2 services run concurrently. Without a target egress field on the queued scan, whichever scanner service wins the database claim will determine actual egress. That is acceptable for the controlled one-service-at-a-time smoke, but not for a fully concurrent deterministic pool.

### First 25-Row Smoke

Use one 25-row cohort split across the three egresses:

| Slice | Rows | Active service | Budget policy egress id | Expected completed metadata |
|---|---:|---|---|---|
| B2-01 | 8 rows | `ws01-scanner-worker-b2-01` | `aws-eip-01` | all 8 scans stamped `aws-eip-01` |
| B2-02 | 8 rows | `ws01-scanner-worker-b2-02` | `aws-eip-02` | all 8 scans stamped `aws-eip-02` |
| B2-03 | 9 rows | `ws01-scanner-worker-b2-03` | `aws-eip-03` | all 9 scans stamped `aws-eip-03` |

Operator sequence for each slice:

1. Confirm no default scanner or other B2 scanner can claim the slice.
2. Confirm the target B2 service is on the expected private subnet.
3. Confirm the private subnet route table points at the expected NAT Gateway.
4. Confirm the NAT Gateway uses the expected EIP.
5. Run the egress budget check for the target `egress_id`.
6. Enqueue the slice without target-domain preflight and without `/api/scan-url-preflight`.
7. Wait for all scans in the slice to reach terminal status.
8. Confirm every scan row has the expected `egress_id` and `egress_provider`.
9. Confirm durable quality history and the admin scanner-quality dashboard group the window by that egress id.
10. Scale the B2 service back to zero before enabling the next service.

Stop immediately if:

- any scan in the slice is stamped with the wrong egress id
- any scan has null egress metadata
- the budget check blocks or delays
- more than one scanner egress service is able to claim scans
- dashboard grouping is unclear
- queue does not drain between slices

### Rollback And Cleanup

Rollback before cleanup:

1. Set all B2 scanner services to desired count `0`.
2. Restore the canonical scanner service desired count and task definition.
3. Wait for the canonical scanner service to become stable.
4. Confirm no scans remain running for `aws-eip-01`, `aws-eip-02`, or `aws-eip-03`.

Cleanup cost-bearing B2 resources:

1. Delete B2 ECS services after they are stable at zero.
2. Deregister B2 autoscaling targets or policies if any were added.
3. Delete B2 NAT Gateways.
4. Wait for NAT Gateway deletion to complete.
5. Release B2 Elastic IPs.
6. Delete B2 route tables.
7. Delete B2 private subnets if they were experiment-only.
8. Remove or archive B2 budget policy artifacts.

Do not claim production is restored until the default scanner posture is verified and all cost-bearing NAT/EIP resources are gone.

### Future Concurrent Pool

If the controlled smoke passes and the next goal is a fully concurrent B2 pool, add a small queue-affinity design before implementation:

- WC01 enqueue path records an intended scanner egress id on the queued scan row or scan metadata
- WS01 scanners claim only queued scans whose intended egress id matches their `SCANNER_EGRESS_ID`
- WC01 Phase 1C budget checks run against the intended egress id before enqueue
- dashboard compares both intended and actual egress id until the contract is proven

Do not add this until the infrastructure-only smoke proves B2 is worth the extra product and scanner code surface.

## Recommended Next Prompt

Use this for the next implementation chat:

```text
Start Phase 2 B2 design: true AWS multi-egress pool.

Scope:
- WC01 repo: /Users/benmasek/WC01
- WS01 repo: /Users/benmasek/WS01
- Do not deploy.
- Do not run scans or load tests.
- Do not modify product code.
- Do not run target-domain preflight or /api/scan-url-preflight.

Goal:
Design the smallest safe AWS multi-egress pool to test whether distributing scans across multiple stable AWS egress identities improves scan quality.

Context:
- Arm A current AWS default egress completed 100/100 with findings/completed 1.75, zero-finding 54%, pages/completed 1.83.
- Single-EIP Arm B completed 100/100 with findings/completed 1.65, zero-finding 55%, pages/completed 1.84 and one rolling quality regression warning.
- Single-EIP Arm B was restored and cost-bearing NAT/EIP resources were cleaned up.
- The next hypothesis is B2: multiple stable AWS egress identities with independent budgets.

Design requirements:
- three to five stable AWS egress identities
- deterministic enough task-to-egress assignment that `egress_id` reflects the actual outbound path
- no mid-scan egress identity changes
- per-egress Phase 1C budgets apply independently
- dashboard groups quality windows by egress id
- restore/cleanup path is documented before any deployment

Evaluate implementation options:
1. separate ECS services per egress identity
2. separate subnet/NAT route per egress identity
3. task set or capacity-provider style split if applicable
4. any simpler AWS option that preserves deterministic metadata

For each option, report:
- AWS resources required
- WS01 changes required
- WC01 changes required, if any
- how `SCANNER_EGRESS_ID` and `SCANNER_EGRESS_TYPE` are set
- how a scan remains stable on one egress
- how Phase 1C budget checks know which egress is being used before enqueue
- cost while active
- cleanup/rollback steps
- risks

Recommend one implementation path.

Do not implement yet unless the path is clearly low-risk and can be kept to infrastructure/config plus existing metadata env vars. If implementation is recommended immediately, stop first with a short plan and requested confirmation.

Final answer:
- recommended B2 architecture
- why it is preferable to going straight to Arm C
- exact resources/config changes needed
- whether code changes are required
- rollback/cleanup plan
- first 25-row smoke plan if approved
```
