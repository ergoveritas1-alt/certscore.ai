# AWS Marketplace Light

Owner approved up to $5/month incremental cost on September 19, 2026.
Expected $1–$5/month at low initial traffic using existing web/MCP ECS tasks and
PostgreSQL, an EventBridge rule, SNS topic and an idle encrypted SQS dead-letter
queue. No new compute capacity, paid metering, model calls, or scan allowance.
This is an estimate, not a billing cap; review actual volume before expanding.

## Listing values after deployment and buyer verification

- Free pricing; MCP server; API key; Redirect to your website; AgentCore disabled.
- Fulfillment: `https://certscore.ai/api/marketplace/light/register`
- MCP endpoint: `https://mcp.certscore.ai/mcp/marketplace/light`
- Setup/key management: `https://certscore.ai/marketplace/light`
- Title: `CertScore.ai MCP Light - Free Website Privacy Scanning`

The anonymous `/mcp/light` remains unchanged. Marketplace keys have their own
table and prefix and cannot authenticate to workspace APIs. Marketplace requests
are checked on each HTTP request, bound to their originating key/session, then
use the existing anonymous Light backend and shared allowance. Rotation or
revocation affects subsequent HTTP requests immediately. Already-running requests
can finish. Revocation does not remove independently public scan reports.

## Onboarding and lifecycle

The registration POST exchanges `x-amzn-marketplace-token` using ResolveCustomer
in the seller account. Require ProductCode, CustomerAWSAccountId, and LicenseArn.
Store an expiring random claim hash and set an HttpOnly Secure cookie, never a
credential in a URL. The buyer signs in and explicitly confirms the AWS account
to link it; an existing owner cannot be replaced by another CertScore account.

Each license is independent to support Concurrent Agreements. ResolveCustomer
does not activate access. A verified EventBridge License Updated event, wrapped
in signed SNS delivery from our exact topic, must arrive and DescribeAgreement
must confirm the buyer, active status, and time window. Deprovisioning revokes
that license and key. Old events cannot revive a deprovisioned license. One key
per license bounds storage; rotation replaces its hash and expires after 90 days.
No raw API keys, registration tokens, or event bodies are logged.

## Release

1. Run focused Marketplace tests, local isolated PostgreSQL lifecycle tests, web
   and MCP typechecks, then change-aware preflight. Commit and push the branch.
2. Use the canonical web workflow with `marketplace_light=enable`; it applies
   migration 0203 before promoting the web image. The endpoint fails closed
   before lifecycle infrastructure is ready. No Marketplace listing publication
   is performed by this release.
3. From seller account 199536052647, deploy `infra/aws/marketplace-light.yaml` in
   us-east-1 with the existing public web task-role name. This grants only the
   required AWS operations and routes license events to the signed HTTPS handler.
   Confirm the SNS subscription is confirmed. Inspect the DLQ for failed delivery.
4. Deploy the canonical MCP workflow with `marketplace_light=enable`.
5. Verify anonymous Light unchanged; missing/invalid Marketplace keys must return
   401. Complete a real free Marketplace subscription/registration, confirm key
   creation and the four-tool workflow, then rotation and cancellation before
   marking the integration ready to publish. A passing synthetic test is not
   evidence of AWS buyer fulfillment or listing approval.

Disable the feature with the same workflows and `marketplace_light=disable`.
Keep lifecycle delivery running for existing records. Never replace invalid
credentials with anonymous fallthrough. Monitor `marketplace_light.event_failed`
and the queue `certscore-marketplace-light-events-dlq`. Unexpected events or AWS
errors fail closed and return 503 for SNS retries.

## Buyer verification and Cloudflare edge configuration (September 20, 2026)

The product `prod-eagvxckgntmxc` successfully reached Limited visibility. A real
free subscription completed the AWS "Set up your account" handoff, account
linking, license activation, and API-key creation.

Python's default user agent initially received Cloudflare HTTP 403 / error 1010
(`browser_signature_banned`) before reaching MCP authentication. With owner
approval, deployed the Cloudflare configuration rule
`Marketplace MCP - allow non-browser clients`
(`1ffa18dd9fde463c8c40da072a6b7144`) with this exact expression:

```text
(http.host eq "mcp.certscore.ai" and http.request.uri.path eq "/mcp/marketplace/light")
```

The sole override is **Browser Integrity Check: off**. It does not disable
API-key validation, rate limits, other WAF protections, or TLS. It does not apply
to anonymous Light or other routes. The rule uses the existing Cloudflare Free
plan; estimated incremental recurring infrastructure cost is $0/month. Roll back
by disabling this single configuration rule in Cloudflare Rules > Overview.
See [Cloudflare's selective BIC configuration documentation](https://developers.cloudflare.com/waf/tools/browser-integrity-check/).

Verified against production with Python urllib's default user agent after the
rule became Active:

- Missing and invalid Marketplace keys return HTTP 401 instead of edge HTTP 403.
- MCP initialize and tools/list succeed with an active subscription key and
  expose exactly the four Light tools.
- All four tool calls succeed, reusing the completed example.com scan
  `20b7af55-e962-4f84-bfa5-eef90e7306d9`. Evidence pagination returned 84 then 20
  items, completing all 104 items. This verifies completed-result reuse and
  retrieval, not a fresh scan's pending-to-terminal lifecycle.
- After rotation, the original key returns HTTP 401; the replacement initializes
  a new session and lists all four tools.
- After revocation, the replacement returns HTTP 401. Temporary test keys were
  revoked and the local verifier stopped; no raw keys are retained in this doc.
- A control request to anonymous `/mcp/light` retains the previous Python
  browser-signature rejection, confirming the exception's route scope.

The initial edge fix required no ECS deployment. Cancellation was subsequently
verified as recorded below; public visibility still requires separate review.

## Setup-page verification (September 20, 2026)

The setup page now uses the shared CertScore header and footer, an explicit
public-scan disclaimer, support contacts, a three-step access/connection/scan
guide, and prompts for follow-up review. The prompt builder runs only in the
browser; it neither starts scans nor stores entered URLs. It rejects credentials,
IP/local addresses, custom ports, and query/fragment tokens before building copy.
The scanner remains responsible for its canonical target/network safety checks.
Client examples contain placeholders only. API keys are masked by default and
rotation/revocation share one action state so a revoked secret is no longer
displayed. Key management and subscription enforcement are otherwise unchanged.
Estimated incremental recurring infrastructure cost: **$0/month**.

Validation: the web preflight passed, focused Marketplace tests passed (9 tests),
and the isolated PostgreSQL repository test passed for one-use claim ownership,
pending denial, independent licenses, rotation/revocation, late-event handling,
expiry, and hashed-only key storage. Browser checks verified prompt creation,
copy feedback, focus selection, and rejection of token-bearing URLs. An active
production key also initialized and listed the four tools through the official
MCP TypeScript SDK, independently of the Python HTTP verifier. These are protocol
checks, not a claim that two assistant applications were certified.

The owner has no second AWS account. A separate-buyer-account test is unverified;
local two-license isolation tests do not replace that end-to-end test.

The setup hub deployed successfully at
`d95ddb79e7f49239c31f497c1d9aa5cb297958f3` through
[the canonical AWS web workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/35524202367).
The exact-image migration step and ECS stabilization passed; the live version
endpoint reports that SHA and `ecs-fargate`, with 2/2 web tasks running and no
pending tasks. Logged-out production HTTP inspection confirms the new content,
sign-in return path, listing link, client guide, prompt builder and disclaimer.
The secondary-host check was skipped because this release has no secondary host.

A real authenticated `freshness: refresh` request created example.com scan
`ca74f3ca-d344-4f34-b5b0-dd8e8b0a0214`. Status progressed from running through
finalizing to completed. The result bundle and all 104 evidence items (84 + 20)
were retrieved through the four Marketplace tools. No duplicate scan was
started. Estimated one-time scanner verification cost: below $0.10; no recurring
capacity change.

The deployed signed-in key replacement flow passed. On September 20, the owner-
authorized cancellation of the real free agreement completed in AWS; DescribeAgreement
reported CANCELLED. Both the already-initialized MCP session and a new session
then rejected the former key with HTTP 401. An owner-approved $0 re-subscription
completed the AWS launch/registration handoff and explicit CertScore account link.
The replacement license activated and its newly created key initialized with HTTP
200 after the hardening deployment; the canceled license's old key still returned
401. Revoking the disposable replacement key cleared the visible secret/key field
and returned 401 on its next request. The local verifier was stopped. The new
free subscription remains active, with its test key revoked.

## Read-only readiness and delivery recovery

Run from the seller account using existing AWS CLI credentials:

```bash
pnpm exec tsx scripts/check-marketplace-light-readiness.ts
```

This checks the catalog product and zero-price offer, authenticated fulfillment
copy and URLs, disabled Quick Launch/AgentCore, exact EventBridge product scope,
confirmed HTTPS subscription and dead-letter policy, empty delivery DLQ, setup
availability, and missing/invalid-key HTTP 401 responses. It creates no resources,
keys, subscriptions, scans, or messages, and prints no signed catalog URLs or
credentials. The final September 20 run passed all 25 checks, including the new recovery queue,
four alarms and actual SNS confirmation state. Browser inspection also
passed at 390px width without console errors. After AWS approves Public visibility, add `--expect-public`. This command is an operator check,
not a scheduled monitor or a substitute for buyer acceptance testing.

If delivery fails, preserve Limited visibility and inspect the existing
`certscore-marketplace-light-events-dlq` in us-east-1 and web logs for
`marketplace_light.event_failed`. Check the EventBridge rule/target, SNS
subscription confirmation/redrive policy, HTTPS route availability, and the
web task's Marketplace permissions. Do not expose registration tokens, keys,
signed URLs, or full notification bodies in tickets or logs.

After restoring delivery, an authorized operator should inspect each retained
event's seller, product, buyer, agreement, license, and original timestamp;
compare the agreement to AWS's current state. Republish the original EventBridge
event through the configured SNS topic so SNS signs a new delivery. Do not POST
an unsigned payload to the web route or invent activation events. Preserve the
original event timestamp: duplicate and late notifications must stay ordered.
For updated licenses the handler re-checks current AWS agreement state before
granting access. Deprovisioned licenses never reactivate from late updates.
Do not remove a dead-letter message until delivery and the affected license's
access state have been independently verified.

## Launch hardening (September 20, 2026)

The auth handler additionally checks AWS's current agreement status, buyer and
validity window. A bounded, per-process five-minute cache coalesces requests;
expired snapshots are never used after an AWS failure. PostgreSQL still checks
key revocation and license state on every request and again after the AWS lookup,
so a rotation while AWS is responding cannot authorize the superseded key.
This bounds missed *agreement cancellation* enforcement to five minutes after
AWS reports the cancellation. It is not periodic license reconciliation and
cannot independently discover a license deprovisioned under a still-active
agreement. AWS errors fail closed with 503. No new compute capacity or scheduled
worker is introduced; this uses existing authorized DescribeAgreement access.

The CloudFormation template adds an encrypted 14-day EventBridge target recovery
queue separately from the existing SNS HTTPS redrive queue. Four standard
CloudWatch alarms cover exhausted EventBridge delivery, SNS failures, and both
queue backlogs. Their dedicated SNS topic uses a seller-account/alarm-scoped
publish policy. The owner selected support@certscore.ai for notifications;
the email subscription must be confirmed before alerts can reach that inbox.
Estimated incremental recurring cost: about $0.40/month for four alarms plus
negligible low-volume SNS/SQS charges (below $1/month preapproval). This does not
increase scan allowances, model usage, retention on existing data, or capacity.
The CloudFormation update completed successfully. All four alarms report OK,
both recovery queues are empty, and SNS confirms PendingConfirmation=false for
the support@certscore.ai email subscription. This verifies the notification
configuration, not a simulated failure/email delivery drill.

Recovery: inspect the queue corresponding to the failed hop. Extract the original
EventBridge lifecycle event (SNS failures may contain the notification envelope),
validate its product/account identities and timestamp, then republish that original
event through the events SNS topic after fixing the cause. Never invent a new
activation timestamp. Keep the retained message until corrected delivery and
access state are verified. Neither an empty queue nor an OK alarm proves that no
upstream events were missed.

Validation: the change-aware web/worker preflight against the deployed setup-page
SHA passed. Focused Marketplace tests, including the isolated PostgreSQL lifecycle,
passed with five new agreement-cache tests (missed cancellation, dependency failure,
concurrent lookup/rotation, immediate local revocation, and buyer/time binding).
The broader origin/main preflight also selected unrelated scanner tests: two
policy timing assertions failed; the observed-link case passed in isolation,
while a long-policy locale case still exceeded its fixture capture budget. No
scanner source is changed by this hardening release.

## Buyer identity and usage attribution

Setup and key management require a signed-in CertScore account. The license
stores owner_user_id and the AWS buyer/account/agreement identity; the key hash
maps to that license. Thus its owner can be resolved to the CertScore user's
email. That email is obtained from CertScore sign-in, not an AWS buyer-email
field. Holding a shared key does not establish the identity of its current human
operator. From migration `0205` onward, successfully validated Marketplace MCP
tool requests carry the agreement ID and license ARN from the server-side
credential validation result. The admin view at `/app/admin/mcp/marketplace`
resolves the license to its buyer account and separates tool outcomes, scan
dispatch, later scan completion, and report retrieval. Marketplace tool events
are retained indefinitely with minimized fields; ordinary MCP telemetry remains
on the 90-day target. Historical events have no verified agreement binding and
remain unattributed. License deletion can make the buyer account unavailable
for historical events, while the recorded agreement/license remain unchanged.
The anonymous Light endpoint remains separate and anonymous.

Attribution is recorded only after the internal key validator has confirmed an
active key/license and the current agreement. Rejected credentials create no
attributed tool event. An agreement/license change invalidates the old MCP
session, even if its key still validates; the client must initialize again.
Rotation, cancellation, and re-subscription do not rewrite earlier events.
The agreement records a buyer/license relationship, not the human who used a
shared key. The scan completion column is a later read of the canonical scan
row, not a completion claim made by the original tool request; deleted or
unavailable scans cannot be reconstructed from telemetry.

Incremental cost estimate before implementation: no new AWS call, scan,
Lambda invocation, log delivery, or database write per tool request. The
existing validation response gains roughly 100–200 bytes (about 10–20 MiB
per 100,000 validated HTTP requests). Two small
attribution fields and two partial indexes add roughly 0.5–1 KiB per
Marketplace tool event. At 100,000 such calls/month, indefinite retention grows
by roughly 50–100 MiB/month, or 0.6–1.2 GiB after a year. Using a representative
RDS SSD rate of $0.115/GiB-month, the first year's ending monthly storage
increase is about $0.07–$0.14, then grows with lifetime call volume. Actual
AWS region, storage class, backups, index fill, and call volume can change this
estimate; provisioned storage may absorb the initial growth without an immediate
bill change. A lower-cost 90-day detail plus lifetime daily aggregates was
considered, but the owner explicitly chose indefinite per-tool attribution.

## Copy-ready Marketplace usage instructions

The customer-facing Marketplace-specific quick start is
`https://certscore.ai/marketplace/light/guide`. The existing
`/developers/mcp` documentation entry point directs Marketplace buyers there.
This website update does not submit a Catalog change or replace the listing's
current usage instructions. Keep the pending Public visibility request intact.

Sign in or create a CertScore account after subscribing to this free offering.
Confirm the AWS account shown on the setup page and create your Marketplace
Light API key after activation completes.

Add a remote MCP server supporting Streamable HTTP:
`https://mcp.certscore.ai/mcp/marketplace/light`

Configure `Authorization: Bearer YOUR_API_KEY`. Store the key securely. Manage,
replace, or revoke keys at https://certscore.ai/marketplace/light. Keys expire
after 90 days. Replacing a key invalidates the previous key; initialize a new
MCP session with the replacement.

Tools: certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle,
and certscore_get_report_evidence_page. Start or reuse a public website scan,
check progress at the returned interval while pending, then retrieve the result
bundle and paginated evidence. Stop polling terminal scans. Public results only;
private workspace history is not included.

The shared public Light allowance and scan/retrieval limits apply. This offering
does not add a per-buyer scan allowance. Honor Retry-After on 429 responses.
401 means the key is missing, invalid, expired, revoked, or its subscription is
inactive. 503 means a dependency is temporarily unavailable; retry later.

Documentation: https://certscore.ai/developers/mcp
Support: support@certscore.ai

Findings are automated observations, not legal advice or compliance certification.

Update all short/long descriptions and highlights that say "no account or API
key required" to "Free Marketplace Light access with a CertScore account and
API key." Public anonymous Light documentation does not need that change.


## Public visibility request and deployed launch checks

On September 20, 2026, the web hardening deployed at
`a00c1493ff7001cead063003e6376f79713d6c1f` through
[the canonical AWS workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/35526396435).
Exact-image migrations and ECS stabilization succeeded; the live version reports
that SHA and ecs-fargate. The web service has 2/2 tasks running, zero pending, and
task definition 633 with rollout COMPLETED. The focused Marketplace suite passed
all 12 tests including its isolated PostgreSQL test. The deployment-specific
preflight passed; unrelated broader scanner failures are recorded above.

The owner-authorized request to change product visibility to Public was submitted
with the free dimension still $0.00. Request `9bftg98xyev4v5b10u7454jov` is shown
as Under review in the seller portal (Catalog API PREPARING at verification).
[Review request](https://aws.amazon.com/marketplace/management/requests/9bftg98xyev4v5b10u7454jov).
Product visibility remains Limited pending AWS review; a successful submission is
not public approval. AWS may subscribe and request access for their review. The
separate-buyer-account test remains unavailable, and assistant-specific UI
compatibility has not been claimed from the SDK/HTTP protocol checks.

## Onboarding and documentation improvements (September 21, 2026)

The setup hub and a dedicated `/marketplace/light/guide` now explain the AWS
handoff, same-browser sign-in, 30-minute claim expiry, explicit account linking,
pending activation, one-time key display, client configuration, tool discovery,
first scan, result verification, repeat use, and recovery. Login reached with
`next=/marketplace/light` explains where the buyer will return without changing
the authentication flow. That signup path uses free Marketplace access wording
instead of the shared form's seven-day trial/monthly-plan wording, and the form
header stacks on narrow screens. Key creation is explicitly separate from client
connection; the site does not infer connection or scan completion from an
existing key. The general MCP documentation links Marketplace buyers to the
dedicated guide before presenting other authentication routes.

Public guidance explains key/account association, public reports, third-party
assistant handling, shared limits, cancellation versus revocation, safe support
diagnostics and existing privacy-request channels. It does not invent retention
periods or promise a deletion timeline. No credentials, customer screenshots,
new analytics, automatic scans, emails, persistence, infrastructure, endpoint,
fulfillment, authentication or pricing changes are introduced. Estimated
incremental recurring cost: $0 (existing web service).

Verification boundaries: the existing password signup callback sends an email
verification message when mail delivery is configured and retains the requested
return path. Source inspection is not proof of inbox delivery or a complete
first-time buyer journey. Fresh-account email delivery, independent-buyer setup,
and application-specific MCP interaction remain separate verification tasks.
The client examples follow the official Cursor and VS Code configuration
references; they must not be described as UI-tested solely from protocol or
documentation checks.

AWS submission boundary: no listing correction is required to reach this guide
because the existing listing documentation URL remains valid and now links to
it. A future direct guide URL or screenshot-gallery change is a separate Catalog
submission and must be flagged to the owner before submission. These website
changes leave Public visibility request `9bftg98xyev4v5b10u7454jov` untouched.

Local browser verification covered the guide at desktop and 390px widths,
configuration selection, copy feedback, troubleshooting expansion, the hub and
general-documentation links, and both Marketplace signup steps without account
submission. Standard signup retains its existing trial copy. The isolated local
preview deliberately had no live database or mail credentials, so it did not
exercise authenticated licenses or email delivery; existing operational-event
writes in that preview failed as expected. A narrow-screen signup header layout
issue found during inspection was corrected.
