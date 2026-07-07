import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the CertScore MCP server for website compliance review workflows using scan, status, finding, explanation, and latest-domain tools.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/mcp",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore MCP server"
});

export default function DeveloperMcpPage() {
  return (
    <DeveloperShell activePath="/developers/mcp" title="MCP server" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Remote server" title="Streamable HTTP endpoint">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore provides a remote MCP endpoint at <code className="rounded bg-white px-1">https://mcp.certscore.ai/mcp</code>.
            Remote clients authenticate through OAuth with PKCE. The endpoint exposes the same tool surface as the local stdio server.
            Read tools use OAuth by default; scan creation still requires the separate scan-creation scope and may remain support-gated.
          </p>
          <CodeBlock>{`MCP endpoint: https://mcp.certscore.ai/mcp
OAuth issuer: https://certscore.ai
Authorization metadata: https://certscore.ai/.well-known/oauth-authorization-server
Protected resource metadata: https://mcp.certscore.ai/.well-known/oauth-protected-resource`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Remote sessions are in-memory and expire after the configured service TTL. CertScore does not claim Anthropic directory
            approval or connector listing status until that review is complete.
          </p>
        </Section>

        <Section eyebrow="Claude" title="Connect in Claude">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Claude can connect directly to the hosted CertScore MCP server. You do not need to create an API key or paste OAuth
            credentials for the standard Claude connector flow.
          </p>
          <CodeBlock>{`1. In Claude, go to Settings > Connectors > Add custom connector.
2. Enter https://mcp.certscore.ai/mcp as the URL.
3. Leave the OAuth Client ID and Client Secret fields blank.
4. Save. Claude redirects you to certscore.ai to sign in or create a free account and approve access.
5. Once connected, ask Claude to use CertScore.`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore supports Dynamic Client Registration, so Claude registers itself automatically when those OAuth fields are blank.
            New connections receive <code className="rounded bg-white px-1">scan:read</code> and{" "}
            <code className="rounded bg-white px-1">mcp</code> by default, which is enough to look up existing scans, findings, and
            reports for any domain. Scan creation requires <code className="rounded bg-white px-1">scan:create</code>, which is granted
            on request to protect scan quota; email{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:developers@certscore.ai">
              developers@certscore.ai
            </a>{" "}
            to request access.
          </p>
          <CodeBlock>{`Try:
"Scan mozilla.org and summarize the privacy/cookie risk signals"
"What's the latest CertScore scan of example.com show?"`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            If you only need to query existing data from a non-Claude MCP client, use the self-serve read-only key path below.
          </p>
        </Section>

        <Section eyebrow="Directory review" title="Reviewer access for scan creation">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The remote connector works read-only by default. <code className="rounded bg-white px-1">scan:create</code> is grant-gated
            per OAuth client or organization to protect scan quota. Directory reviewers can connect the test account first, then
            CertScore support can grant <code className="rounded bg-white px-1">scan:create</code> to the registered OAuth client ID so
            the write tool is testable. If a submission portal does not provide a reviewer-notes field, contact{" "}
            <a
              className="font-semibold text-sky-700 hover:text-sky-900"
              href="mailto:support@certscore.ai?subject=CertScore%20MCP%20review%20scan%3Acreate%20grant"
            >
              support@certscore.ai
            </a>{" "}
            with subject <code className="rounded bg-white px-1">CertScore MCP review scan:create grant</code>.
          </p>
        </Section>

        <Section eyebrow="External users" title="Local stdio access">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The MCP server is distributed as a Homebrew-installable developer preview for macOS MCP clients. Install the
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore-mcp</code> command before connecting Claude Desktop,
            Cursor, Windsurf, or another stdio-compatible MCP client.
          </p>
        </Section>

        <Section eyebrow="Install" title="Homebrew setup">
          <CodeBlock>{`brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install --cask certscore-mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The cask installs a persistent local MCP command for users who prefer Homebrew-managed tools.
          </p>
        </Section>

        <Section eyebrow="Access" title="Use a scoped MCP key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            MCP read tools work with a self-serve <code className="rounded bg-white px-1">cs_ro_</code> key carrying{" "}
            <code className="rounded bg-white px-1">scan:read</code> and <code className="rounded bg-white px-1">mcp</code>. Sign in,
            verify your email, then request the key from <code className="rounded bg-white px-1">/api/v2/keys/request</code>.
            Tools that create scans require <code className="rounded bg-white px-1">scan:create</code> and remain support-gated at{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            .
          </p>
          <CodeBlock>{`Self-serve read-only MCP key:
1. Sign in at https://certscore.ai/login and verify your email.
2. POST https://certscore.ai/api/v2/keys/request from the signed-in browser session.
3. Use the returned cs_ro_ key as CERTSCORE_API_KEY.`}</CodeBlock>
        </Section>

        <Section eyebrow="Verify install" title="Run the doctor check">
          <CodeBlock>{`certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=<token> certscore-mcp doctor`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The doctor command checks the installed binary, Node.js runtime compatibility, the configured CertScore base URL, API v2
            health, and API key presence without printing the token. It does not create scans or inspect raw scanner artifacts.
          </p>
        </Section>

        <Section eyebrow="Verify download" title="Check the release checksum">
          <CodeBlock>{`curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/certscore-mcp-v{version}.tar.gz
curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/SHA256SUMS
sha256sum --check SHA256SUMS`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Release tarballs are built on Linux by GitHub Actions. The published SHA256SUMS file should match the cask checksum.
          </p>
        </Section>

        <Section eyebrow="MCP client config" title="Use the installed command">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The server runs over stdio and reads the API key from the MCP client environment. Keep the token scoped and rotate it if it
            is shared outside your workspace.
          </p>
        </Section>

        <Section eyebrow="Cursor and Windsurf" title="Generic stdio config">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Troubleshooting" title="Common install checks">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>If the command is not found, reinstall the cask or check that Homebrew&apos;s bin directory is on PATH.</li>
            <li>If the API key is missing, set CERTSCORE_API_KEY in the MCP client environment and rerun doctor.</li>
            <li>If a token is rejected by a tool call, rotate the key or request a scoped API/MCP key from support@certscore.ai.</li>
            <li>If API health is unreachable, check CERTSCORE_BASE_URL and verify that https://certscore.ai/api/v2/health loads.</li>
            <li>If Homebrew uses stale metadata, run brew update and reinstall the cask.</li>
            <li>If an old release is cached, run brew reinstall --cask certscore-mcp after updating the tap.</li>
          </ul>
        </Section>

        <Section eyebrow="Local development" title="Run the stdio server from this repo">
          <CodeBlock>{`CERTSCORE_API_KEY=<token> pnpm mcp:certscore`}</CodeBlock>
        </Section>

        <Section eyebrow="Local development" title="Run the remote MCP service from this repo">
          <CodeBlock>{`CERTSCORE_OAUTH_JWT_SECRET=<shared-secret> pnpm mcp:certscore:http`}</CodeBlock>
        </Section>

        <Section eyebrow="Predeploy" title="Verify remote readiness">
          <CodeBlock>{`CERTSCORE_OAUTH_JWT_SECRET=<shared-secret> \
MCP_PUBLIC_URL=https://mcp.certscore.ai \
OAUTH_ISSUER=https://certscore.ai \
CERTSCORE_MCP_HTTP_BEARER_TOKEN=<oauth-access-token> \
pnpm ops:check:mcp-http-deploy -- --live

CERTSCORE_MCP_HTTP_BEARER_TOKEN=<oauth-access-token> \
pnpm mcp:certscore:http:tools-diff -- --mcp-url=https://mcp.certscore.ai/mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            For connector-directory review, run the readiness check with <code className="rounded bg-white px-1">--require-scan-create</code>{" "}
            using an OAuth token minted by the production reviewer/test account after an active <code className="rounded bg-white px-1">scan:create</code> grant has been added. The
            tools-diff check compares the deployed Streamable HTTP tool list against the local stdio server schemas and annotations.
          </p>
        </Section>

        <Section eyebrow="Security" title="OAuth launch notes">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>Production access tokens are signed with a shared HS256 secret held only by the web app and MCP HTTP service.</li>
            <li>Revoking a scan-create grant blocks the next authorization or refresh; already-issued access tokens may carry the scope for up to one hour.</li>
            <li>Dynamic client registration is per-IP rate limited, and unused clients with no codes or refresh tokens are cleaned up after 30 days.</li>
            <li>Refresh tokens rotate on every use; reuse of an already-rotated token revokes the refresh-token family.</li>
          </ul>
        </Section>

        <Section eyebrow="Claude Desktop" title="Installed command config">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Cursor, Windsurf, and generic MCP clients" title="Local repo config for contributors">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "pnpm",
      "args": ["mcp:certscore"],
      "cwd": "/path/to/WC01",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Tools" title="Agent-facing tool surface">
          <p className="mb-4 max-w-3xl text-sm leading-7 text-slate-600">
            Several tools return or reference Pulse, CertScore&apos;s compact public report projection for agents. See{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="/developers/reference#what-is-pulse">
              What is Pulse?
            </a>{" "}
            for how it relates to scan resources and findings.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {mcpTools.map(([name, description]) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-mono text-sm font-semibold text-slate-950">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Choosing an integration" title="MCP vs REST API vs SDK">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ["MCP", "Best when an AI agent needs tools for scan creation, status checks, findings, and explanation flows."],
              ["REST API", "Best for language-neutral server integrations, webhooks, backend jobs, and direct OpenAPI-based clients."],
              ["TypeScript SDK", "Best for Node.js or TypeScript applications that want typed resource clients and built-in polling helpers."]
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Workflow" title="Recommended agent sequence">
          <CodeBlock>{`1. scan_site with a public URL.
2. get_scan_status when a job is pending.
3. get_scan after a stable scanId is available.
4. list_findings for compact structured review.
5. get_evidence when a reviewer or agent needs the larger bounded evidence packet.
6. get_pre_consent_cookies_trackers when the user asks for the Pre-consent Cookies & Trackers table as JSON.
7. explain_finding for evidence summaries and caveats.
8. get_latest_domain_scan or get_latest_domain_pre_consent_cookies_trackers when the user asks for latest-domain data.`}</CodeBlock>
          <CodeBlock>{`get_pre_consent_cookies_trackers({
  scanId: "00000000-0000-4000-8000-000000000123"
})

get_latest_domain_pre_consent_cookies_trackers({
  domain: "example.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            MCP tools return compact public-safe JSON. They must not infer raw-signal findings or convert automated review signals into
            legal conclusions. CertScore outputs are automated public-web observations for review. They are not legal advice,
            certification, or a compliance determination. Group Cookies & Trackers rows by vendor, purpose, and host when the user wants
            a short review handoff.
          </p>
        </Section>

        <Section eyebrow="Examples" title="Verified prompts for reviewers">
          <CodeBlock>{`Scan the latest report for caltech.edu and tell me what trackers were found before consent.

Explain the top finding from the CertScore scan of bbc.com in plain language. What's the actual privacy risk?

Export the full findings report for cnn.com as something I could send to our legal team.`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            These prompts exercise latest-domain lookup, pre-consent cookie/tracker retrieval, finding explanation, and bounded report
            export. The domains have completed public API-visible scans so reviewer demos can start with read-only tool calls and avoid
            cold-start scan timing.
          </p>
        </Section>

        <Section eyebrow="Compatibility" title="create_scan removed">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">create_scan</code> was a deprecated compatibility alias and is no longer advertised.
            Use <code className="rounded bg-white px-1">scan_site</code> for scan creation.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
