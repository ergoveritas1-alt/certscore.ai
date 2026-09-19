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

## Copy-ready Marketplace usage instructions

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
