# CertScore.ai Website Privacy Scanner MCP

CertScore.ai provides evidence-backed website privacy scanning for public websites. It observes bounded public-web signals such as pre-consent cookies and browser storage, third-party trackers, CMP and consent controls, privacy-policy signals, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS behavior.

This is the Microsoft-authenticated edition of CertScore.ai MCP Light. Microsoft authenticates service-to-service with a tenant-bound Microsoft Entra application token. End users do not need separate CertScore credentials.

## Three-tool lifecycle

1. Use `certscore_scan_site` to request a scan or reuse an eligible recent completed scan. Keep the stable `scanId` returned by the tool. The default `freshness=latest` avoids unnecessary new scans; use `refresh` only when a fresh run is explicitly required.
2. Use `certscore_get_scan_status` with that `scanId` while the scan is queued, running, or finalizing. Follow the returned retry guidance and stop at a terminal state.
3. For `completed` or `completed_limited`, use `certscore_get_scan_bundle` to retrieve the bounded canonical findings, evidence summaries and references, provenance, coverage limitations, score metadata, and public report URL.

The Microsoft endpoint retains MCP Light's bounded anonymous-style scan and read quotas. Eligible recent-result reuse does not consume a new-scan allowance. Current automated-access policy and retry guidance are published at https://certscore.ai/developers/reference. For higher-volume use, contact support@certscore.ai.

## Public reports and evidence boundaries

Usable completed results include a public CertScore report URL. Returned content is bounded and public-safe: it excludes raw cookie values, raw request or response bodies, sensitive payloads, full DOM content, and unredacted query values. Findings and checklist rows come from CertScore's canonical evidence, concern-policy, and projection pipeline.

Results are evidence-backed automated observations of public websites for human and agentic review. They are not legal advice, certification, or a compliance determination. Missing or limited evidence is not proof of compliance, and observed review lenses are not legal conclusions.

## Known issues and limitations

- Scans cover observable public-web behavior from the selected execution region and time; site behavior can vary by location, session, account state, personalization, and later changes.
- `completed_limited` is usable but has explicit coverage limitations. Read those limitations before interpreting findings.
- Missing consent-action evidence does not establish Accept, Reject, Decline, or deeper preference behavior.
- Do not extrapolate observed vendors, embeds, requests, cookies, fingerprinting, tracking, or processing beyond what the retained evidence supports.
- Authentication is service-to-service. Microsoft Entra or Azure Key Vault configuration failures require administrator or publisher remediation rather than end-user CertScore login.

## Support and policies

- Support: https://certscore.ai/contact or support@certscore.ai
- Privacy: https://certscore.ai/privacy
- Terms: https://certscore.ai/terms
