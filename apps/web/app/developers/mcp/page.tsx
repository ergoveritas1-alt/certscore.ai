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
        <Section eyebrow="External users" title="Current MCP access">
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

        <Section eyebrow="Timing" title="Scan timing fields">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            API v2 MCP tools return <code className="rounded bg-white px-1">startedAt</code>,{" "}
            <code className="rounded bg-white px-1">completedAt</code>, and{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds</code> when CertScore has enough timing evidence. Treat{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds: null</code> as unavailable rather than zero.
          </p>
          <CodeBlock>{`const scan = await get_scan({ scanId });
const status = await get_scan_status({ scanId });

// scan.scanTimeSeconds and status.scanTimeSeconds are numbers or null.`}</CodeBlock>
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

        <Section eyebrow="Deprecation" title="create_scan removal">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">create_scan</code> is a deprecated compatibility alias. It will be removed in{" "}
            <code className="rounded bg-white px-1">0.2.0</code>. Use <code className="rounded bg-white px-1">scan_site</code> for
            scan creation.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
