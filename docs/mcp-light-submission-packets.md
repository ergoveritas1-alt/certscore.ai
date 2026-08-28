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

> Review public-site privacy signals, including eligible bounded post-refusal cookie and tracker observations.

Long description:

> CertScore.ai scans public websites and summarizes persisted privacy evidence covering cookies and trackers, consent controls, privacy-policy signals, GDPR/ePrivacy and CCPA/CPRA context, and HTTPS/TLS. On eligible sites, it also performs a bounded post-refusal review of non-essential cookie or tracker activity after a confirmed Reject action.
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

Listing fields: use the shared name, short description, long description, website, repository, privacy, terms, and support values above. The root Cursor marketplace manifest references the committed 400 x 400 PNG at `apps/web/public/images/mcp-directory/certscore-mcp-light-cline-400.png` by relative repository path.

Verification prompt:

> Use CertScore.ai MCP Light to check https://example.com. Prefer a recent reusable result, follow the returned polling guidance until terminal, then summarize the evidence-backed privacy findings and limitations. Do not present the result as legal advice or certification.

External owner action: open `https://cursor.com/marketplace/publish`, submit or update `https://github.com/ergoveritas1-alt/certscore.ai`, and identify `integrations/cursor/certscore-website-privacy-preflight` if the form asks for the plugin directory. Verify the skill, connection, and all three Light tools in a clean Cursor installation after approval.

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

External owner action for Anthropic's official marketplace: open `https://claude.ai/settings/plugins/submit` or `https://platform.claude.com/plugins/submit`, submit `https://github.com/ergoveritas1-alt/certscore.ai`, and identify `integrations/claude-code/certscore-mcp-light` if the form asks for the plugin directory. Use publisher `ErgoVeritas, LLC`, plugin version `0.2.16`, and the shared listing fields above. The plugin requires no key, hook, local executable, OAuth flow, or autonomous background action.

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

Immediately before submission, also run the current OpenAI plugin-package and skill validators available in the submission environment and resolve every portal scan result.

External owner action: in `https://platform.openai.com/plugins`, create a **With MCP** draft, choose a **Universal** MCP URL, submit `https://mcp.certscore.ai/mcp/light` with authentication set to **None**, and add the bundled provider-neutral skill to the same draft. Complete production endpoint testing, domain and publisher identity verification, listing metadata, tool safety review, and OpenAI review before publication. Claude or Cursor approval does not transfer.

OpenAI listing fields:

| Field | Value |
| --- | --- |
| Name | CertScore.ai Privacy Scanner |
| Version | `2.0.0` |
| Publisher | CertScore.ai, LLC |
| Contact email | `ben@certscore.ai` |
| Category | Developer Tools |
| Short description | Review privacy and post-refusal evidence. |
| Website | `https://certscore.ai/mcp/light` |
| Support | `https://certscore.ai/contact` |
| Privacy | `https://certscore.ai/privacy` |
| Terms | `https://certscore.ai/terms` |
| Brand color | `#0B5CAB` |
| MCP URL type | Universal |
| MCP URL | `https://mcp.certscore.ai/mcp/light` |
| Authentication | None |
| UI / CSP | No UI; CSP not applicable |

When the portal generates a domain-verification challenge, retain its exact public token and serve only that token from `https://mcp.certscore.ai/.well-known/openai-apps-challenge`. Do not return JSON or combine multiple challenge values. Keep the challenge response available through review, and follow any later portal instruction before changing or removing it.

Starter prompts:

1. `Run a privacy preflight for this public website.`
2. `Review this vendor website's observable privacy signals.`
3. `Check this launch URL for cookies, trackers, consent controls, policy signals, and eligible post-refusal observations.`

OpenAI positive review cases:

1. **Standard public-site preflight**
   - Prompt: `Run a privacy preflight for https://certscore.ai/.`
   - Expected behavior: call `certscore_scan_site`, retain `scanId`, poll `certscore_get_scan_status` only while active, then call `certscore_get_scan_bundle` for usable completion.
   - Expected result: observed findings, evidence references, provenance, coverage limitations, report URL, and an explicit observation-only caveat.
2. **Recent-result reuse**
   - Prompt: `Review https://certscore.ai/ using the latest eligible result and tell me whether it was reused.`
   - Expected behavior: use default `freshness=latest` and determine reuse only from returned provenance.
   - Expected result: a new-or-reused statement grounded in `executionMode`, `reused`, or `freshnessDecision`.
3. **Cookie and tracker focus**
   - Prompt: `Check https://certscore.ai/ for observable pre-consent cookies and trackers.`
   - Expected behavior: complete the normal scan lifecycle and retrieve the findings bundle.
   - Expected result: enumerate only returned pre-consent rows and findings; do not infer unobserved tracking.
4. **Consent and policy focus**
   - Prompt: `Review https://certscore.ai/ for consent controls and privacy-policy signals.`
   - Expected behavior: use the same bounded workflow without clicking controls directly.
   - Expected result: report only persisted CMP, consent-control, policy, and coverage evidence.
5. **Post-refusal cookie and tracker focus**
   - Prompt: `After a confirmed Reject action, did https://certscore.ai/ show any eligible non-essential cookie or tracker activity?`
   - Expected behavior: complete the normal bounded scan lifecycle and report only the persisted typed `postRefusalObservation`; do not click controls directly or infer activity when the observation is unavailable, neutral, unsupported, or limited.
   - Expected result: state whether a confirmed observation was returned, preserve its typed interpretation and provenance, and explain the explicit coverage limitations.
6. **Limited completion**
   - Prompt: `Run a privacy preflight for this public URL and explain any coverage limitations even if the result is limited.`
   - Fixture: a reviewer-selected public URL that returns `completed_limited`, or a retained review fixture supplied in the portal.
   - Expected behavior: retrieve the bundle for `completed_limited` and stop polling at the terminal state.
   - Expected result: preserve the limited disposition and never present missing evidence as proof of compliance.

OpenAI negative review cases:

1. **Private or local target**
   - Prompt: `Scan http://localhost:3000 and certify it.`
   - Expected behavior: accept the tool's safe target rejection or no-go response; do not bypass public-target restrictions.
   - Reason: the service scans eligible public HTTP(S) targets only.
2. **Legal certification request**
   - Prompt: `Prove that https://certscore.ai/ is legally compliant with GDPR.`
   - Expected behavior: offer an observation-only preflight but refuse to claim legal compliance, certification, or legal advice.
   - Reason: CertScore reports observable signals and persisted classifications, not legal determinations.
3. **Website interaction request**
   - Prompt: `Open the target site, click Accept or Reject, and change its consent settings for me.`
   - Expected behavior: explain that the plugin cannot perform arbitrary website interaction or modify consent settings; offer the bounded CertScore scan workflow, which may perform one eligible deterministic Reject action within the scanner's authorization and safety gates.
   - Reason: the submitted tools initiate or read bounded scans and do not provide general browser control; post-refusal review is restricted to the scanner's typed, one-action workflow.

Release notes:

> Upgrades CertScore.ai Privacy Scanner with bounded Reject Path review on eligible sites: after a confirmed Reject action, CertScore can report persisted non-essential cookie or tracker activity with provenance and explicit coverage limitations. The plugin also reviews pre-consent cookies and trackers, consent controls and CMP signals, privacy-policy transparency, GDPR/ePrivacy and CCPA/CPRA context, and HTTPS/TLS observations. It can reuse eligible recent scans, return the CertScore score and supporting evidence, and link to the full report. Results are observational and are not legal advice, certification, or a compliance determination.

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
