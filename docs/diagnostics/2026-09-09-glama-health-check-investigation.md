# Glama unhealthy alert investigation — September 9, 2026

## Finding

Glama's listing recovered to Healthy without a configuration change. AWS evidence shows an intermittent delay in completing an MCP streaming HTTP exchange, despite fast application processing and HTTP 200 responses. This is a plausible contributor to the alert, not a confirmed attribution of Glama's exact failed check.

The original email arrived at approximately 07:27 Pacific (14:27 UTC). Its quoted text, `test MCP endpoint connection profile`, supplies neither an HTTP status nor an underlying exception. The listing's configured URL is `https://mcp.certscore.ai/mcp/light`, which intentionally requires no credentials.

## Retained operational evidence inspected

- CloudWatch `/ecs/certscore-web/mcp`, 2026-09-09 13:00–15:10 UTC: 522 events. There were 11 sessions declaring client name `glama`, all with successful initialize and tools/list application records; 44 associated request records were HTTP 200 or 202. Declared client identity is not independently authenticated attribution.
- ECS service `certscore-web-mcp` in `certscore-web-cluster`, `us-west-1`: one desired/running task, no pending task, completed deployment, healthy load-balancer target. Last deployment completed September 8 at 22:24 Pacific. Service events show no replacement or deployment at the alert time.
- Existing ALB S3 access logs for the 14:25, 14:30, 14:35 and 15:05 UTC intervals, both load-balancer nodes. No logging or infrastructure settings were changed.
- Glama public listing: Healthy, last tested 2026-09-09 14:45, correct Light endpoint and three tools. Its account diagnostics were inaccessible in the available signed-out browser session.

## Relevant request timeline

All timestamps below are UTC; subtract seven hours for Pacific daylight time.

| Request | Application record | ALB request received | ALB response timestamp | Observation |
| --- | --- | --- | --- | --- |
| Glama initialize | 14:27:08.292, HTTP 200, 2 ms | 14:27:08.288 | 14:27:08.292813 | Fast initialization |
| Glama tools/list, first session | 14:27:10.630, HTTP 200, 9 ms | 14:27:10.620 | 14:27:10.631531 | About 11.5 ms elapsed; 74,765 bytes sent |
| Glama initialize, second session | 14:27:22.511, HTTP 200, 4 ms | 14:27:22.504 | 14:27:22.511208 | Fast initialization |
| Glama tools/list, second session | 14:27:23.987, HTTP 200, 13 ms | 14:27:23.972 | 14:29:28.982547 | About 125.01 seconds elapsed; 74,756 bytes sent |
| Glama GET event stream, second session | 14:29:28.983, HTTP 200 | 14:27:23.972 | 14:29:28.982501 | Ends at effectively the same time as the delayed POST |

Both Glama sessions negotiated MCP `2025-11-25`; subsequent requests supplied that version and a recognized session header. No requester/session mismatch was recorded. Both tool lists used `text/event-stream`. The delayed POST's ALB target-processing time was only 14 ms, meaning response headers began promptly; this does not establish prompt delivery of the complete response.

A separate diagnostic using the installed MCP SDK also timed out listing tools on `/mcp/anonymous` at 15:02:46 UTC. Its application log reported HTTP 200 and 21 ms at 15:01:49.537, while the corresponding ALB exchange lasted about 55.75 seconds. This independently demonstrates that application-level success logs do not exclude a client-visible timeout. It is a different endpoint and does not establish Glama's failure cause.

Three subsequent Light SDK connections/listTools calls passed in 1.631, 1.026 and 0.864 seconds. No tools were invoked and no scans were created by this investigation.

## Interpretation and remaining uncertainty

The strongest lead is intermittent response-stream completion/delivery behavior along the MCP service → ALB → Cloudflare → client path. Public response headers confirm Cloudflare is in front of the endpoint. These records do not isolate whether the stall originates in the Node/MCP streaming adapter, connection reuse/backpressure, Cloudflare, or the client. An open GET event stream is normal and its lifetime alone is not evidence of a defect; the delayed tools/list POST is the relevant anomaly.

No missing-credential, rate-limit, session-mismatch, or application 5xx failure was identified for the observed Glama sessions. The authenticated `/mcp` endpoint's expected anonymous 401 is unrelated to Glama's configured `/mcp/light` endpoint. Adding test-profile credentials is not supported as a remedy by this evidence.

The 125-second exchange cannot conclusively be identified as the email-triggering check: the email timestamp has minute precision and Glama's internal check ID, exception and client-side timing are unavailable. Obtain those details from the signed-in Glama health-check history or Glama support to match the alert precisely. No support message was sent.

If a repair is requested, first reproduce and trace response completion at the transport/connection boundary, including concurrent GET event stream and POST tools/list requests. Preserve authentication and canonical tool contracts. Do not increase timeouts or capacity on the basis of the current evidence alone.

## Sources and scope

- [Glama listing](https://glama.ai/mcp/connectors/ai.certscore.mcp/cert-scoreai)
- [Glama connector administration](https://glama.ai/mcp/connectors/ai.certscore.mcp/cert-scoreai/admin)
- [AWS ALB access-log field definitions](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html): target processing measures time to response headers; response processing measures time until the ALB begins forwarding. Neither is a complete client-observed latency measurement. Access logs are best-effort records.

Read-only production investigation. No production configuration, deployments, credentials, logging retention, model calls, or recurring infrastructure cost changes. This document is the only repository addition from this investigation.

## Signed-in listing and onboarding follow-up

The owner subsequently authorized Glama form edits and customer/agent onboarding tests. The signed-in test profile uses Authentication Type `None`; its connection test passed at September 9, 2026 08:14:06 Pacific. The public listing remained Healthy. The available account pages did not expose an underlying exception or detailed failed-check history, so the transport uncertainty above remains unresolved.

Saved and verified on the public Glama listing:

- Uploaded the existing CertScore shield logo from `apps/web/public/images/mcp-directory/certscore-mcp-light-cline-400.png`.
- Added Legal & Compliance alongside Browser Automation and Security.
- Saved and visually verified `support@certscore.ai` as the support contact.
- Replaced the description with benefit-led copy, practical use cases, a natural-language example prompt, and the Light quickstart link. Kept the correct no-auth endpoint.

Published description:

> Give your AI agent a clear picture of a website's privacy and tracking behavior. CertScore.ai checks public websites for cookies, trackers, consent controls, privacy-policy disclosures, and transport-security signals, then returns prioritized findings, retained evidence, and a shareable report.
>
> Use it before a website launch, when reviewing a vendor, or to investigate tracking and consent behavior. Start with CertScore MCP Light—no account, API key, or OAuth setup required.
>
> Try asking your agent: "Check my website's privacy and tracking behavior. Show me the top findings, supporting evidence, and report link." The simple three-tool workflow scans the site, checks progress, and retrieves the results.
>
> Connect in minutes: https://certscore.ai/mcp/light

Glama Inspector connected and discovered all three Light tools. One call each to `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle` succeeded using the owned ErgoVeritas broad-baseline canary. The scan call reused completed scan `44a7b823-cf50-4427-8458-3df402734152` and returned `quotaConsumed: false`. The returned public report loaded without authentication and displayed findings, resource inventory, and evidence-oriented review controls. The quickstart loaded with the correct endpoint, client setup, first-run prompt, and free-scan entry point. Glama's client-install configuration also used the correct Light URL.

Cost: the potential one-time test scan was estimated below $0.10 before proceeding; reuse avoided any new scan or scan-related model calls. Only existing-result requests were made, with negligible incremental request cost estimated below $0.01. No recurring-cost changes or paid advertising were enabled.

Onboarding follow-up opportunities observed but not changed in this Glama-only edit: Inspector places optional research/task-context fields before the required URL, and the CertScore quickstart first-run prompt is substantially more technical than the new listing prompt. Simplifying those presentation paths would require separate application/schema work. No application code or deployments were changed.
