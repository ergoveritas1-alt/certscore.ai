# CertScore.ai MCP Light submission packets

These packets are the canonical copy and status reference for external directory submissions. Each platform section records whether publication is complete or still requires owner action.

## Shared listing fields

| Field | Value |
| --- | --- |
| Name | CertScore.ai MCP Light |
| Legal owner / publisher | CertScore.ai, LLC |
| Registry name | `ai.certscore/mcp-light` |
| Version | `0.2.16` |
| Endpoint | `https://mcp.certscore.ai/mcp/light` |
| Transport | Streamable HTTP |
| Authentication | None |
| Website | `https://certscore.ai/mcp/light` |
| Repository | `https://github.com/ergoveritas1-alt/certscore.ai` |
| Documentation | `https://certscore.ai/developers/mcp` |
| Privacy | `https://certscore.ai/privacy` |
| Terms | `https://certscore.ai/terms` |
| Support | `https://certscore.ai/contact` and `support@certscore.ai` |
| Light manifest | `packages/certscore-mcp/server-light.json` |

Light permits 50 genuinely new scans per UTC day across requester and shared public-Light scopes, subject to a 5-new-scan rolling 10-minute limit across the same scopes. An eligible completed scan from the prior 24 hours may be reused; reuse does not consume the new-scan allowance.

Short description:

> Review public-site privacy signals, including eligible bounded post-refusal cookie and tracker observations.

Long description:

> CertScore.ai scans public websites and summarizes persisted privacy evidence covering cookies and trackers, consent controls, privacy-policy signals, GDPR/ePrivacy and CCPA/CPRA context, and HTTPS/TLS. On eligible sites, it also performs a bounded post-refusal review of non-essential cookie or tracker activity after a confirmed Reject action.
>
> Give CertScore.ai a public website to collect structured, evidence-backed privacy findings for launch review, vendor review, audit triage, or human compliance review. Results include a CertScore score and supporting evidence for human and agentic review; they are not legal advice, certification, or a compliance determination.

## GitHub MCP Registry

Submission artifact: `packages/certscore-mcp/server-light.json`.

Publication status: **complete**. Version `0.2.16` was published to the Official MCP Registry on August 28, 2026 and is the active latest version of `ai.certscore/mcp-light`.

- Registry listing: https://registry.modelcontextprotocol.io/?q=ai.certscore%2Fmcp-light
- Registry API lookup: https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.certscore%2Fmcp-light

Pre-publish checks from the repository root:

```sh
mcp-publisher validate packages/certscore-mcp/server-light.json
```

Future release procedure:

1. Update `packages/certscore-mcp/server-light.json` to the new released version and validate it.
2. Authenticate the existing `ai.certscore` namespace using an Official MCP Registry-supported method.
3. Run the publisher against `packages/certscore-mcp/server-light.json`.
4. Confirm that the new record is active and latest, resolves to the Light endpoint, and preserves the intended three-tool workflow.

Do not publish `packages/certscore-mcp/server.json` as the Light listing.

## Cursor

Prepared plugin: `integrations/cursor/certscore-website-privacy-preflight`.

Prepared monorepo catalog: `.cursor-plugin/marketplace.json`.

Cursor plugin version: `1.0.1`. This is intentionally independent from hosted MCP version `0.2.16`.

Direct server configuration:

```json
{
  "mcpServers": {
    "certscore-light": {
      "url": "https://mcp.certscore.ai/mcp/light"
    }
  }
}
```

Listing fields: use the shared name, short description, long description, website, repository, privacy, terms, and support values above. The root Cursor marketplace manifest references the committed 400 x 400 PNG at `apps/web/public/images/mcp-directory/certscore-mcp-light-cline-400.png` by relative repository path.

Verification prompt:

> Use CertScore.ai MCP Light to check https://example.com. Prefer a recent reusable result, follow the returned polling guidance until terminal, then summarize the evidence-backed privacy findings and limitations. Do not present the result as legal advice or certification.

Verified August 29, 2026: the community Cursor Directory listing is live at `https://cursor.directory/plugins/certscoreai-mcp-light` with the intended description, one skill, one Streamable HTTP server, and the correct no-auth Light endpoint. The official Cursor Marketplace does not yet return a CertScore listing, so its review remains pending.

Status: **paused by product-owner request on August 29, 2026**. Take no further Cursor submission, monitoring, install, or marketplace action until the owner resumes it. When resumed after approval, verify the publisher, source repository, `1.0.1` integration version, skill, no-auth connection, and all three Light tools in a clean Cursor installation. Do not create a duplicate submission while the current review is pending.

## Claude Code

Prepared plugin: `integrations/claude-code/certscore-mcp-light`.

Prepared repository marketplace: `.claude-plugin/marketplace.json`.

Local validation:

```sh
claude plugin validate ./integrations/claude-code/certscore-mcp-light
claude plugin validate .
```

After the changes are available in the public repository, users can add the repository marketplace and install the plugin:

```text
/plugin marketplace add ergoveritas1-alt/certscore.ai
/plugin install certscore-mcp-light@certscore-ai
```

Repository marketplace verification:

```sh
claude plugin marketplace add ergoveritas1-alt/certscore.ai --scope user
claude plugin install certscore-mcp-light@certscore-ai --scope user
claude plugin marketplace update certscore-ai
claude plugin update certscore-mcp-light@certscore-ai --scope user
claude plugin list --json
```

Anthropic directory status verified August 29, 2026: the existing `certscore-ai` listing is **Published — Pending review**. Its reviewer instructions request an in-place replacement of the authenticated OAuth `/mcp` connection with the no-auth `https://mcp.certscore.ai/mcp/light` endpoint. Do not create a duplicate listing. Anthropic controls the reviewed endpoint and authentication fields, so the replacement remains reviewer-dependent.

The submitted package uses publisher `CertScore.ai, LLC`, plugin version `0.2.16`, and the shared listing fields above. It requires no key, hook, local executable, OAuth flow, or autonomous background action. The production endpoint and directory-safe tool metadata were independently verified after deployment.

## OpenAI / ChatGPT and Codex

Prepared plugin package: `integrations/openai/certscore-website-privacy-preflight`.

The package contains:

- `.codex-plugin/plugin.json` at OpenAI plugin version `2.0.0`;
- provider-neutral workflow instructions under `skills/website-privacy-preflight`;
- explicit dependency on the production Streamable HTTP endpoint;
- repository-test remote MCP wiring without credentials or placeholder connection IDs.

Validate the package from the repository root:

```sh
pnpm --filter @certscore/mcp test
```

Immediately before submission, also run the current OpenAI plugin-package and skill validators available in the submission environment and resolve every portal scan result. Select **Scan Tools** again after every production tool-schema or bundled-skill change so the reviewed snapshot matches the live endpoint.

External owner action: in `https://platform.openai.com/plugins`, create a **With MCP** draft, choose a **Universal** MCP URL, submit `https://mcp.certscore.ai/mcp/light` with authentication set to **None**, and add the bundled provider-neutral skill to the same draft. Complete production endpoint testing, domain and publisher identity verification, listing metadata, tool safety review, and OpenAI review before publication. Claude or Cursor approval does not transfer.

OpenAI listing fields:

| Field | Value |
| --- | --- |
| Name | CertScore.ai Privacy Scanner |
| Version | `2.0.0` |
| Publisher | CertScore.ai, LLC |
| Contact email | `ben@certscore.ai` |
| Category | Security |
| Subtitle | GDPR, cookies & trackers |
| Description | Scan public websites for fast preliminary cookie/tracker evidence, then continue to persisted privacy findings, consent and policy signals, transport observations, and eligible bounded post-refusal evidence. |
| Website | `https://certscore.ai` |
| Support | `https://certscore.ai/contact-sales` |
| Privacy | `https://certscore.ai/privacy` |
| Terms | `https://certscore.ai/terms` |
| Demo recording | `https://certscore.ai/videos/openai-mcp-certscore-demo.mp4` |
| Brand color | `#0B5CAB` |
| MCP URL type | Universal |
| MCP URL | `https://mcp.certscore.ai/mcp/light` |
| Authentication | None |
| UI / CSP | No UI; CSP not applicable |

When the portal generates a domain-verification challenge, retain its exact public token and serve only that token from `https://mcp.certscore.ai/.well-known/openai-apps-challenge`. Do not return JSON or combine multiple challenge values. Keep the challenge response available through review, and follow any later portal instruction before changing or removing it.

Starter prompts:

1. `Scan https://ergoveritas.com/test1.html. Show the preliminary cookie/tracker preview, then continue to the final report.`
2. `Review https://ergoveritas.com/test2.html and provide cookie, CMP, and consent control evidence from the completed scan results.`
3. `Check https://ergoveritas.com/test3.html for eligible activity after a confirmed Reject action.`

OpenAI positive review cases:

1. **Fast preliminary cookie/tracker preview**
   - Prompt: `Run a fresh privacy scan of https://ergoveritas.com/test1.html. Show me any early cookie and tracker evidence as soon as it is available, then give me the completed report.`
   - Tools: `certscore_scan_site`, `certscore_get_scan_status` only while active, then `certscore_get_scan_bundle`.
   - Expected behavior: use `freshness=refresh`; retain the stable `scanId`; if `preConsentPreview` is returned, surface it promptly as preliminary evidence and continue the workflow without resubmitting the scan.
   - Expected result: distinguish captured counts from bounded returned identities, keep `trackingVendorCount` separate from `operationalVendors`, never report preview counts as final, then supersede the preview with the completed bundle's final returned tally, findings, limitations, provenance, and report URL.
2. **Pre-consent cookie and storage evidence**
   - Prompt: `Review https://ergoveritas.com/test2.html for observable pre-consent cookies and browser storage, using the latest eligible scan.`
   - Tools: `certscore_scan_site`, `certscore_get_scan_status` only while active, then `certscore_get_scan_bundle`.
   - Expected behavior: prefer `freshness=latest`, report new-versus-reused only from returned provenance, and present any `preConsentPreview` before waiting for completion.
   - Expected result: enumerate only returned cookie, storage, vendor, and consent-control observations; preserve unknown states and final coverage limitations rather than inferring unobserved behavior.
3. **Reject controls and before/after evidence**
   - Prompt: `Check https://ergoveritas.com/test3.html for observable Reject controls and explain the evidence before and after the Reject path is selected.`
   - Tools: `certscore_scan_site`, `certscore_get_scan_status` only while active, then `certscore_get_scan_bundle`.
   - Expected behavior: use the bounded CertScore workflow without performing arbitrary browser interaction.
   - Expected result: report only persisted consent-control and runtime evidence, preserve unknown or limited states, and avoid turning missing evidence into an observed gap.
4. **GDPR transparency and transport**
   - Prompt: `Review https://ergoveritas.com/test4.html for GDPR transparency and HTTPS/TLS observations.`
   - Tools: `certscore_scan_site`, `certscore_get_scan_status` only while active, then `certscore_get_scan_bundle`.
   - Expected behavior: complete the canonical scan lifecycle and retrieve the findings bundle.
   - Expected result: report only returned policy, disclosure, and transport observations with evidence and limitations; do not make a legal-compliance determination.
5. **Deterministic post-refusal observation**
   - Prompt: `On https://ergoveritas.com/test3.html, did CertScore observe eligible non-essential cookie or tracker activity after a confirmed Reject action?`
   - Tools: `certscore_scan_site`, `certscore_get_scan_status` only while active, then `certscore_get_scan_bundle`.
   - Expected behavior: complete the bounded workflow and report only the persisted typed `postRefusalObservation`; do not click controls directly outside the authorized scanner lane or infer activity when the observation is unavailable, neutral, unsupported, or limited.
   - Expected result: preserve the typed interpretation, provenance, termination reason, and explicit coverage limitations.

OpenAI negative review cases:

1. **Unrelated privacy-vendor product question**
   - Prompt: `Does OneTrust test for token usage?`
   - Expected behavior: do not invoke CertScore.
   - Reason: this is a product-capability question, not a request to scan a public website.
2. **General consumer privacy recommendation**
   - Prompt: `What is the best VPN for privacy?`
   - Expected behavior: do not invoke CertScore.
   - Reason: the request is unrelated to observable privacy evidence from a specified public website.
3. **General legal explanation**
   - Prompt: `Explain GDPR generally.`
   - Expected behavior: do not invoke CertScore.
   - Reason: there is no website-specific target or public-web observation request.

Release notes:

> Upgrades CertScore.ai Privacy Scanner with a fast preliminary cookie and tracker preview for newly accepted scans. When the runtime lane completes or reaches its six-second checkpoint, CertScore may return bounded `preConsentPreview` evidence within roughly 9–11 seconds so users can see early cookie and vendor observations while the full scan continues. Preview counts are explicitly partial and are superseded by the completed bundle's final returned tally and canonical findings. Version 2.0.0 also adds bounded Reject Path review on eligible sites, plus consent controls, privacy-policy transparency, GDPR/ePrivacy and CCPA/CPRA context, HTTPS/TLS observations, provenance, and explicit coverage limitations. Results are observational and are not legal advice, certification, or a compliance determination.

The repository package deliberately does not contain a fabricated `.app.json`. If ChatGPT developer mode creates a registered MCP connection for local testing, use its real `plugin_asdk_app...` technical ID at that time. Direct MCP users remain on the stable endpoint and do not need this plugin package for runtime access.

## Cline

PR-ready current catalog artifact: `integrations/cline/certscore-mcp-light/entry.json`.

Repository URL:

```text
https://github.com/ergoveritas1-alt/certscore.ai
```

Agent installation guide:

```text
https://github.com/ergoveritas1-alt/certscore.ai/blob/main/llms-install.md
```

Required 400 × 400 PNG logo:

```text
https://certscore.ai/images/mcp-directory/certscore-mcp-light-cline-400.png
```

Reason for addition:

> CertScore.ai MCP Light gives Cline users a no-account, read-oriented workflow for scanning public websites and reviewing structured evidence about pre-consent cookies and trackers, CMP and consent controls, privacy-policy and transparency signals, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS observations. It exposes three bounded tools, reuses eligible recent results to conserve public scan capacity, and clearly states that results are not legal advice, certification, or a compliance determination.

Suggested category: `Developer Tools` or `Web Services`.

Current submission route verified August 29, 2026: add `registry/mcps/certscore-mcp-light/entry.json` to `cline/marketplace`, run `npm run validate`, and open a pull request. The older `cline/mcp-marketplace` issue route remains online but is no longer the canonical package prepared here.

Clean Cline CLI installation was verified with an isolated configuration using `cline mcp install certscore-light --transport streamable-http https://mcp.certscore.ai/mcp/light --yes`. It produced the intended `streamableHttp` configuration with no headers, credentials, or warnings. The independent production contract check then initialized the same endpoint and listed exactly the three Light tools.

Submission status: **in review**. Pull request: https://github.com/cline/marketplace/pull/75

## Kilo

Listing name: `CertScore.ai MCP Light`.

PR-ready marketplace artifact: `integrations/kilo-code/certscore-mcp-light/MCP.yaml`.

Its remote installation content is:

```json
{
  "type": "streamable-http",
  "url": "https://mcp.certscore.ai/mcp/light"
}
```

The prepared artifact uses Kilo's required `MCP.yaml` fields, the `web-automation` category, and no prerequisites, parameters, headers, or credentials.

External owner action: copy the prepared artifact to `mcps/certscore-mcp-light/MCP.yaml` in a current fork of `Kilo-Org/kilo-marketplace`, run that repository's current checks, and submit a pull request. Reconcile any schema change made after this artifact was prepared. Do not add credentials or substitute the authenticated CertScore MCP endpoint.

Submission status: **in review**. Pull request: https://github.com/Kilo-Org/kilo-marketplace/pull/250. The current marketplace generator completed locally and included CertScore.ai MCP Light in the generated 127-entry catalog.

## Docker MCP Catalog

Status: blocked for submission.

The current Light distribution is a hosted Streamable HTTP endpoint, not a downloadable Docker image. Docker MCP Catalog inclusion requires a working Docker image or deployment artifact. Do not submit metadata that implies one exists.

Product-owner decision required: either keep Docker out of scope, or separately approve a container distribution design with security, maintenance, evidence-quality, AWS topology, and cost review. No Docker runtime or catalog manifest is included in this work.

## Final pre-submission checklist

- Deploy the discovery update and 400 × 400 icon through the repository-controlled AWS workflow.
- Confirm the public icon returns an image response and is exactly 400 × 400.
- Confirm `https://mcp.certscore.ai/healthz` reports hosted version `0.2.16`.
- Confirm the Light endpoint requires no authentication and lists exactly `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle`.
- Confirm the Claude package is `0.2.16`, the Cursor package is `1.0.1`, and the OpenAI package is `2.0.0`.
- Re-run the relevant official validator immediately before each submission.
- Use the exact Light endpoint; do not substitute the authenticated or anonymous legacy endpoint.
- Do not claim legal advice, certification, compliance determination, unlimited use, or a Docker image.
- Record any directory-assigned listing URL in `docs/mcp-light-directory-submissions.md` after publication.
