import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the CertScore.ai MCP server for website compliance review workflows using scan, status, finding, explanation, and latest-domain tools.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/mcp",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore.ai MCP server"
});

export default function DeveloperMcpPage() {
  return (
    <DeveloperShell activePath="/developers/mcp" title="MCP server" description={description}>
      <div className="space-y-12">
        <Section eyebrow="External users" title="Current MCP access">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The MCP server is distributed as a Homebrew-installable developer preview for macOS MCP clients. Install the
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore-mcp</code> command before connecting Claude Desktop,
            Cursor, Windsurf, or another stdio-compatible MCP client.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            OAuth-capable clients can connect directly to the hosted Streamable HTTP endpoint at
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">https://mcp.certscore.ai/mcp</code>. The hosted endpoint uses
            OAuth authorization code flow with PKCE and does not require placing a long-lived API key in client configuration.
          </p>
        </Section>

        <Section eyebrow="No-account MCP" title="Connect without signup or OAuth">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Agents that cannot create an account or complete OAuth can use the unauthenticated Streamable HTTP MCP endpoint at
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">https://mcp.certscore.ai/mcp/anonymous</code>. It exposes the
            public-safe scan, status, findings, evidence, and latest-domain tools. New scans are limited to 10 per requester IP per UTC
            day; reusing an eligible recent result does not consume the quota.
          </p>
          <CodeBlock>{`Unauthenticated MCP endpoint:
https://mcp.certscore.ai/mcp/anonymous`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Use the hosted OAuth endpoint or a scoped API key for higher-volume workflows. The unauthenticated endpoint intentionally has
            no account, token, or OAuth setup step.
          </p>
        </Section>

        <Section eyebrow="No-account agent path" title="Run up to 10 scans per day without signup">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            If an agent cannot create an account or configure OAuth, use the public API v2 scan path instead. Send a JSON POST to{" "}
            <code className="rounded bg-white px-1">/api/v2/scans</code> without an Authorization header, then poll the returned
            status resource and retrieve findings or evidence. New anonymous scans are limited to 10 per requester IP per UTC day;
            recent-result reuse does not consume the quota.
          </p>
          <CodeBlock>{`curl -X POST https://certscore.ai/api/v2/scans \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","freshness":"latest","scanFrom":"eu_ie"}'`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            This account-free path is intended for discovery, evaluation, and low-volume agent workflows. Use the hosted OAuth MCP or
            a scoped API key for higher-volume use.
          </p>
        </Section>

        <Section eyebrow="Hosted MCP" title="Connect with OAuth and Streamable HTTP">
          <CodeBlock>{`MCP endpoint:
https://mcp.certscore.ai/mcp

Protected-resource metadata:
https://mcp.certscore.ai/.well-known/oauth-protected-resource

Authorization-server metadata:
https://certscore.ai/.well-known/oauth-authorization-server`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Read access requests the OAuth scopes <code className="rounded bg-white px-1">scan:read</code> and
            <code className="ml-1 rounded bg-white px-1">mcp</code>. Scan creation additionally requires the support-gated
            <code className="ml-1 rounded bg-white px-1">scan:create</code> scope.
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
            The local stdio MCP server works with a self-serve <code className="rounded bg-white px-1">cs_ro_</code> key carrying{" "}
            <code className="rounded bg-white px-1">pulse:read</code> and <code className="rounded bg-white px-1">mcp</code>. Sign in,
            verify your email, then request the key from <code className="rounded bg-white px-1">/api/v2/keys/request</code>.
            Stdio tools that create scans require <code className="rounded bg-white px-1">pulse:scan</code>; hosted OAuth uses
            <code className="ml-1 rounded bg-white px-1">scan:create</code>. Both remain support-gated at{" "}
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
CERTSCORE_API_KEY=<token> certscore-mcp doctor
CERTSCORE_API_KEY=<token> certscore-mcp doctor --check-auth`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The doctor command checks the installed binary, Node.js runtime compatibility, the configured CertScore.ai base URL, API v2
            health, and API key presence without printing the token. Add <code className="rounded bg-white px-1">--check-auth</code> to
            validate the credential against the API without creating a scan or inspecting raw scanner artifacts.
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
            <li>If Node.js is not found, make sure the MCP client inherits a PATH containing Node.js and Homebrew&apos;s bin directory.</li>
            <li>If the API key is missing, set CERTSCORE_API_KEY in the MCP client environment and rerun doctor --check-auth.</li>
            <li>If a token is rejected, run doctor --check-auth before rotating the key or requesting a scoped API/MCP key from support@certscore.ai.</li>
            <li>If API health is unreachable, check CERTSCORE_BASE_URL and verify that https://certscore.ai/api/v2/health loads.</li>
            <li>If Homebrew uses stale metadata, run brew update and reinstall the cask.</li>
            <li>If an old release is cached, run brew reinstall --cask certscore-mcp after updating the tap.</li>
          </ul>
        </Section>

        <Section eyebrow="Local development" title="Run the stdio server from this repo">
          <CodeBlock>{`CERTSCORE_API_KEY=<token> pnpm mcp:certscore`}</CodeBlock>
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
            Several tools return or reference Pulse, CertScore.ai&apos;s compact public report projection for agents. See{" "}
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

        <Section eyebrow="Timing" title="Scan timing fields">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            API v2 MCP tools return <code className="rounded bg-white px-1">startedAt</code>,{" "}
            <code className="rounded bg-white px-1">completedAt</code>, and{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds</code> when CertScore.ai has enough timing evidence. Treat{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds: null</code> as unavailable rather than zero.
          </p>
          <CodeBlock>{`const scan = await get_scan({ scanId });
const status = await get_scan_status({ scanId });

// scan.scanTimeSeconds and status.scanTimeSeconds are numbers or null.`}</CodeBlock>
        </Section>

        <Section eyebrow="Completed with limited coverage" title="No-go results remain structured">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scan, status, report, export, and explanation tools preserve
            <code className="mx-1 rounded bg-white px-1">completed_limited</code>,
            <code className="rounded bg-white px-1">resultDisposition: no_go</code>, the stable reason code, customer-safe copy,
            target-site versus scanner-limitation attribution, retry guidance, and a bounded evidence excerpt when retained.
          </p>
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
            legal conclusions. CertScore.ai outputs are automated public-web observations for review. They are not legal advice,
            certification, or a compliance determination. Group Cookies & Trackers rows by vendor, purpose, and host when the user wants
            a short review handoff.
          </p>
        </Section>

        <Section eyebrow="Deprecation" title="create_scan removal">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">create_scan</code> is a deprecated compatibility alias. It will be removed in{" "}
            a future breaking release after the <code className="rounded bg-white px-1">0.2.x</code> line. Use{" "}
            <code className="rounded bg-white px-1">scan_site</code> for new scan creation.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
