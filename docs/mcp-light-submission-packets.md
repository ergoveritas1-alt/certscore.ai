# CertScore.ai MCP Light submission packets

These packets are ready to copy after the repository changes and public icon have been deployed through the repository-controlled AWS release path. They do not authorize or perform an external submission.

## Shared listing fields

| Field | Value |
| --- | --- |
| Name | CertScore.ai MCP Light |
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

> Free website privacy scanner to detect pre-consent cookies and trackers, CMP and consent controls, privacy policy, GDPR/ePrivacy and CCPA, and HTTPS/TLS signals.

Long description:

> Free website privacy scanner and cookie checker for public websites. Detect pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations.
>
> Give CertScore.ai a public website to collect structured, evidence-backed privacy findings for launch review, vendor review, audit triage, or human compliance review. Results include a CertScore score and supporting evidence for human and agentic review; they are not legal advice, certification, or a compliance determination.

## GitHub MCP Registry

Submission artifact: `packages/certscore-mcp/server-light.json`.

Pre-publish checks from the repository root:

```sh
mcp-publisher validate packages/certscore-mcp/server-light.json
```

External owner action:

1. Merge and deploy the prepared metadata and assets.
2. Authenticate the `ai.certscore` namespace using an official MCP Registry-supported method.
3. Run the publisher against `packages/certscore-mcp/server-light.json`.
4. Confirm that the published record resolves to version `0.2.16`, the Light endpoint, and exactly three tools.

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

Listing fields: use the shared name, short description, long description, website, repository, privacy, terms, and support values above. Use `https://certscore.ai/certscore-mark-dark.png` as the primary square icon.

Verification prompt:

> Use CertScore.ai MCP Light to check https://example.com. Prefer a recent reusable result, follow the returned polling guidance until terminal, then summarize the evidence-backed privacy findings and limitations. Do not present the result as legal advice or certification.

External owner action: push the prepared package and root monorepo catalog, submit or update the public repository through Cursor Marketplace's current publishing flow, and verify the skill, connection, and all three Light tools in a clean Cursor installation.

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

External owner action: merge the prepared plugin, verify the commands from a clean Claude Code installation, and submit to any desired third-party Claude marketplace separately. The plugin requires no key, hook, local executable, OAuth flow, or autonomous background action.

## OpenAI / ChatGPT and Codex

Prepared plugin package: `integrations/openai/certscore-website-privacy-preflight`.

The package contains:

- `.codex-plugin/plugin.json` at OpenAI plugin version `1.0.0`;
- provider-neutral workflow instructions under `skills/website-privacy-preflight`;
- explicit dependency on the production Streamable HTTP endpoint;
- repository-test remote MCP wiring without credentials or placeholder connection IDs.

Validate the package from the repository root:

```sh
pnpm --filter @certscore/mcp test
```

Immediately before submission, also run the current OpenAI plugin-package and skill validators available in the submission environment and resolve every portal scan result.

External owner action: in the OpenAI plugin submission portal, create a **With MCP** draft, submit `https://mcp.certscore.ai/mcp/light`, and add the bundled provider-neutral skill to the same draft. Complete production endpoint testing, domain and publisher identity verification, listing metadata, tool safety review, and OpenAI review before publication. Claude or Cursor approval does not transfer.

The repository package deliberately does not contain a fabricated `.app.json`. If ChatGPT developer mode creates a registered MCP connection for local testing, use its real `plugin_asdk_app...` technical ID at that time. Direct MCP users remain on the stable endpoint and do not need this plugin package for runtime access.

## Cline

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

External owner action: open the `MCP Server Submission` issue form in Cline's official MCP marketplace repository. Provide the repository URL and 400 × 400 PNG above. The form requires confirmation that Cline can set up the server using only `README.md` and/or `llms-install.md`, and that the server is stable and ready for public use; check those boxes only after personally verifying both statements. Put the reason above in `Additional Information`.

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

## Docker MCP Catalog

Status: blocked for submission.

The current Light distribution is a hosted Streamable HTTP endpoint, not a downloadable Docker image. Docker MCP Catalog inclusion requires a working Docker image or deployment artifact. Do not submit metadata that implies one exists.

Product-owner decision required: either keep Docker out of scope, or separately approve a container distribution design with security, maintenance, evidence-quality, AWS topology, and cost review. No Docker runtime or catalog manifest is included in this work.

## Final pre-submission checklist

- Deploy the discovery update and 400 × 400 icon through the repository-controlled AWS workflow.
- Confirm the public icon returns an image response and is exactly 400 × 400.
- Confirm `https://mcp.certscore.ai/healthz` reports hosted version `0.2.16`.
- Confirm the Light endpoint requires no authentication and lists exactly `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle`.
- Confirm the Claude package is `0.2.16`, the Cursor package is `1.0.1`, and the OpenAI package is `1.0.0`.
- Re-run the relevant official validator immediately before each submission.
- Use the exact Light endpoint; do not substitute the authenticated or anonymous legacy endpoint.
- Do not claim legal advice, certification, compliance determination, unlimited use, or a Docker image.
- Record any directory-assigned listing URL in `docs/mcp-light-directory-submissions.md` after publication.
