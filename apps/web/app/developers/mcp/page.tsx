import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "../../../lib/seo";
import { ApiReadRatePolicyDetails, CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the CertScore.ai MCP server for website compliance review workflows using scan, status, finding, explanation, and latest-domain tools.";
const lightEndpoint = "https://mcp.certscore.ai/mcp/light";
const openAiMcpDemoPath = "/videos/openai-mcp-certscore-demo.mp4";
const codexSetupCommand = "codex mcp add certscore --url https://mcp.certscore.ai/mcp/light";
const firstRunPrompt = "Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. If certscore_scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll certscore_get_scan_status using scanId only. If certscore_scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry certscore_scan_site; do not call certscore_get_scan_status until a scanId exists. Once the scan reaches a terminal status, call certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.";
const verificationPrompt = "List the available CertScore tools and confirm that certscore_scan_site, certscore_get_scan_status, and certscore_get_scan_bundle are available. Then scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html and report whether the result was new or reused.";
const agentDisclaimer = "CertScore results are automated observations from a public-web scan. No-go, not-observed, and limited-coverage results are not proof of compliance, absence of risk, or legal status. Review the retained evidence and applicable context before relying on a finding.";

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
        <section aria-labelledby="route-choice" className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Start here</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950" id="route-choice">Which route should I choose?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Start anonymously in one minute. Upgrade only when you need more scans, production or team access, backend automation, history, or advanced tools.</p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border-2 border-sky-400 bg-sky-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Recommended for first-time users</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Light MCP — no authentication</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">No account, API key, bearer token, browser login, or OAuth. Scan public websites with the three core tools and a limited daily quota.</p>
              <Link className="mt-5 inline-flex rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="/mcp/light">Start with Light MCP</Link>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">For production and higher volume</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Authenticated MCP</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600"><strong>Hosted MCP — OAuth</strong> is the managed remote route. <strong>Local MCP — scoped API key</strong> is the stdio and backend route.</p>
              <a className="mt-5 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" href="#authenticated-mcp">Set up Authenticated MCP</a>
            </article>
          </div>
          <a
            className="mt-6 inline-flex items-center rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:border-sky-500 hover:text-sky-950"
            href="#openai-mcp-demo"
          >
            Watch the OpenAI MCP integration demo
          </a>
        </section>

        <section
          aria-labelledby="openai-mcp-demo-title"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          id="openai-mcp-demo"
        >
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">OpenAI integration path</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="openai-mcp-demo-title">
                See CertScore MCP tools run in ChatGPT
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                This silent 2:47 recording demonstrates the OpenAI MCP integration path: a user asks ChatGPT for a public-site scan,
                ChatGPT invokes CertScore tools, presents the evidence-backed observations and tool-call details, and opens the full
                CertScore report.
              </p>
              <a
                className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                href={openAiMcpDemoPath}
                rel="noreferrer"
                target="_blank"
              >
                Open the standalone MP4
              </a>
            </div>
            <video
              aria-label="CertScore OpenAI MCP integration demonstration"
              className="w-full rounded-lg bg-slate-950 shadow-sm"
              controls
              playsInline
              preload="metadata"
            >
              <source src={openAiMcpDemoPath} type="video/mp4" />
              Your browser does not support embedded video. Open the standalone MP4 using the link beside the player.
            </video>
          </div>
        </section>

        <Section eyebrow="Compare routes" title="Authentication is visible before setup">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[1240px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[14%]" /><col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Route</th><th className="px-4 py-3 font-semibold">Setup method</th><th className="px-4 py-3 font-semibold">Authentication</th><th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Quota</th><th className="px-4 py-3 font-semibold">Available tools</th><th className="px-4 py-3 font-semibold">Intended user</th><th className="px-4 py-3 font-semibold">Website / access limits</th><th className="px-4 py-3 font-semibold">Upgrade path</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Light MCP — no authentication</td><td className="px-4 py-3">One Codex command or remote Streamable HTTP URL</td><td className="px-4 py-3">None</td><td className="px-4 py-3">Not required</td><td className="px-4 py-3">Up to 50 new scans per UTC day across Light and 5 per rolling 10 minutes; eligible reuse is free</td><td className="px-4 py-3">certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle</td><td className="px-4 py-3">First-time users, testing, and discovery</td><td className="px-4 py-3">Public HTTP or HTTPS websites; core tools only</td><td className="px-4 py-3">Authenticate for volume, history, teams, or advanced tools</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Hosted MCP — OAuth</td><td className="px-4 py-3">Connect the hosted endpoint from an OAuth-capable client</td><td className="px-4 py-3">OAuth authorization code with PKCE</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on access</td><td className="px-4 py-3">Core plus approved history and diagnostic tools</td><td className="px-4 py-3">Production, teams, and managed remote clients</td><td className="px-4 py-3">Scopes control read and scan creation; creation may require support</td><td className="px-4 py-3">Request more scopes or volume from support</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Local MCP — scoped API key</td><td className="px-4 py-3">Install and run the local stdio server</td><td className="px-4 py-3">Scoped API key in the client environment</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on key access</td><td className="px-4 py-3">Tools permitted by the key scopes</td><td className="px-4 py-3">Backend, local, and controlled automation</td><td className="px-4 py-3">Protect and rotate keys; scan creation is support-gated</td><td className="px-4 py-3">Request more scopes, tools, or volume</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="read-rate-limits" eyebrow="Read protection" title="MCP scan-resource limits">
          <ApiReadRatePolicyDetails />
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">
            Hosted MCP applies the policy before composite tool fan-out, so an over-limit bundle is rejected before it starts its
            internal API reads. Local MCP receives the same protection from the underlying CertScore API.
          </p>
        </Section>

        <Section eyebrow="Beginner workflow" title="Light MCP — no authentication">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            First-time agents should use the Light endpoint. It uses Streamable HTTP and requires no signup, API key, bearer token, browser login, or OAuth,
            and exposes exactly <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_scan_site</code>,
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_get_scan_status</code>, and
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_get_scan_bundle</code>.
          </p>
          <CodeBlock>{`Light:
${lightEndpoint}

Transport: Streamable HTTP
Authentication: None
Tools: certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle`}</CodeBlock>
          <h3 className="mt-6 font-semibold text-slate-950">Codex setup</h3>
          <CodeBlock>{codexSetupCommand}</CodeBlock>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Light allows up to 50 genuinely new scans per UTC day across the public Light surface and 5 per rolling 10 minutes. Reused eligible results do not consume quota.
          </p>
        </Section>

        <Section eyebrow="First run" title="Paste one prompt">
          <CodeBlock>{firstRunPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            ErgoVeritas provides stable, owned canary pages suited to demonstrating the complete scan, status, and bundle flow. The
            canary intentionally contains test signals, so its findings are useful for exercising the API rather than evaluating a production site.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Light workflow" title="The canonical three-tool sequence">
          <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>Call <code>certscore_scan_site</code> with a public URL.</li>
            <li>If a retryable error has no <code>scanId</code>, wait <code>retryAfterSeconds</code> and retry <code>certscore_scan_site</code>.</li>
            <li>If the result is queued, running, or finalizing, retain <code>scanId</code>.</li>
            <li>Poll <code>certscore_get_scan_status</code> using <code>scanId</code> only. Never poll until <code>scanId</code> exists.</li>
            <li>Stop polling at a terminal status, then call <code>certscore_get_scan_bundle</code>.</li>
            <li>Use <code>detail=findings</code> for a compact finding review.</li>
            <li>Use <code>detail=evidence</code> for evidence digests and references.</li>
            <li>If truncated, follow <code>recommendedNextAction</code> or increase <code>maxBytes</code>.</li>
            <li>Summarize findings together with coverage limitations and the report URL.</li>
          </ol>
          <CodeBlock>{`certscore_scan_site
→ retry certscore_scan_site if a retryable error has no scanId
→ certscore_get_scan_status with scanId if still running
→ certscore_get_scan_bundle after terminal status`}</CodeBlock>
          <CodeBlock>{`Recommended bundle budgets:
summary   maxBytes=5000
findings  maxBytes=8000
evidence  maxBytes=8000
full      maxBytes=12000 or higher`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            A 5,000-byte response may intentionally omit optional sections while preserving a compact finding or evidence reference when
            available. Inspect <code>actualBytes</code>, <code>truncated</code>, <code>omittedSections</code>,
            <code>nextRecommendedMaxBytes</code>, and returned report or evidence content URLs.
          </p>
          <p className="max-w-3xl text-sm font-semibold leading-7 text-slate-800">
            Call <code>certscore_get_scan_status</code> only after <code>certscore_scan_site</code> returns a <code>scanId</code>. A retryable response without
            one must return to <code>certscore_scan_site</code>.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Verify" title="Confirm the Light connection">
          <CodeBlock>{verificationPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Success means the tool list contains exactly the three Light tools, no authorization page appears, and
            <code className="mx-1 rounded bg-white px-1">certscore_scan_site</code> returns a stable <code>scanId</code> plus an explicit
            new-or-reused decision. An eligible reused result reports that quota was not consumed.
          </p>
        </Section>

        <Section eyebrow="Troubleshooting" title="Light MCP — no authentication recovery">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {[
              ["OAuth appeared unexpectedly", <>Remove the connection and add the exact Light endpoint <code>{lightEndpoint}</code>. Do not configure a token.</>],
              ["No scanId was returned", <>Retry <code>certscore_scan_site</code> only when the error says <code>retryable: true</code>. Never poll status without <code>scanId</code>.</>],
              ["Rate limited", <>Wait for <code>retryAfterSeconds</code> or stop. Eligible recent-result reuse does not consume quota.</>],
              ["Result was reused", <>Report it as reused. The eligible prior result was returned and quota was not consumed.</>],
              ["Bundle was truncated", <>Follow <code>nextRecommendedMaxBytes</code>, increase <code>maxBytes</code>, or open a returned report or evidence URL.</>],
              ["Coverage was limited", <><code>completed_limited</code>, no-go, and not-observed are automated observations, not proof of compliance.</>]
            ].map(([title, guidance]) => (
              <div className="rounded-lg border border-slate-200 bg-white p-4" key={String(title)}>
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 leading-6 text-slate-600">{guidance}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Light-to-Authenticated migration" title="Upgrade when Light becomes a constraint">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Upgrade when you need a dedicated higher-volume allowance, production or team access, backend automation,
            scan history, advanced diagnostic tools, or support-managed scopes.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">What changes</h3><p className="mt-2 text-sm leading-6 text-slate-600">Use the full endpoint and authenticate with hosted OAuth or a local scoped API key. Quota and tool availability follow the granted access.</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">What stays compatible</h3><p className="mt-2 text-sm leading-6 text-slate-600">Core identifiers and canonical response fields—including <code>scanId</code>, status, score, risk, coverage, and timestamps—remain compatible.</p></div>
          </div>
          <p className="max-w-3xl text-sm font-semibold leading-7 text-slate-900">Need more scans or advanced tools? Upgrade to Authenticated MCP.</p>
        </Section>

        <div id="authenticated-mcp">
        <Section eyebrow="Authenticated remote setup" title="Hosted MCP — OAuth">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">Use this route for an OAuth-capable remote MCP client in production or team workflows. A CertScore account is required. The authorization flow grants only the approved scopes.</p>
          <CodeBlock>{`MCP endpoint:
https://mcp.certscore.ai/mcp

Protected-resource metadata:
https://mcp.certscore.ai/.well-known/oauth-protected-resource/mcp

Authorization-server metadata:
https://certscore.ai/.well-known/oauth-authorization-server`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Read access requests the OAuth scopes <code className="rounded bg-white px-1">scan:read</code> and
            <code className="ml-1 rounded bg-white px-1">mcp</code>. Active Trial workspaces connecting through Claude receive
            <code className="ml-1 rounded bg-white px-1">scan:create</code> automatically, with up to 20 genuinely new scans per hour
            and 100 per day per workspace. Eligible recent-result reuse does not consume that allowance. Other clients still require an explicit grant.
          </p>
        </Section>
        </div>

        <Section eyebrow="Authenticated local setup" title="Local MCP — scoped API key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">Use this route for local stdio clients, backend automation, or environments where you manage credentials directly. A CertScore account and a scoped key are required.</p>
          <CodeBlock>{`brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install --cask certscore-mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The cask installs a persistent local MCP command for users who prefer Homebrew-managed tools.
          </p>
        </Section>

        <Section eyebrow="Local MCP access" title="Local MCP — scoped API key permissions">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The local stdio MCP server works with a self-serve <code className="rounded bg-white px-1">cs_ro_</code> key carrying{" "}
            <code className="rounded bg-white px-1">pulse:read</code> and <code className="rounded bg-white px-1">mcp</code>. Sign in,
            verify your email, then request the key from <code className="rounded bg-white px-1">/api/v2/keys/request</code>.
            Stdio tools that create scans require <code className="rounded bg-white px-1">pulse:scan</code>; hosted OAuth uses
            <code className="ml-1 rounded bg-white px-1">scan:create</code>. Active Trial workspaces connecting through Claude receive
            the hosted scope automatically. Other clients and local keys remain grant-gated at{" "}
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

        <Section eyebrow="Local verification" title="Local MCP — scoped API key doctor check">
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

        <Section eyebrow="Local verification" title="Local MCP — scoped API key release checksum">
          <CodeBlock>{`curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/certscore-mcp-v{version}.tar.gz
curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/SHA256SUMS
sha256sum --check SHA256SUMS`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Release tarballs are built on Linux by GitHub Actions. The published SHA256SUMS file should match the cask checksum.
          </p>
        </Section>

        <Section eyebrow="Local client configuration" title="Local MCP — scoped API key installed command">
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

        <Section eyebrow="Local client configuration" title="Local MCP — scoped API key stdio config">
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

        <Section eyebrow="Advanced local troubleshooting" title="Local MCP — scoped API key checks">
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

        <Section eyebrow="Advanced local development" title="Local MCP — scoped API key repo setup">
          <CodeBlock>{`CERTSCORE_API_KEY=<token> pnpm mcp:certscore`}</CodeBlock>
        </Section>

        <Section eyebrow="Advanced local clients" title="Local MCP — scoped API key Claude Desktop config">
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

        <Section eyebrow="Advanced local clients" title="Local MCP — scoped API key contributor config">
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
          <CodeBlock>{`const scan = await certscore_get_scan({ scanId });
const status = await certscore_get_scan_status({ scanId });

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

        <Section eyebrow="Developer reference" title="Non-MCP integration options">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">The beginner MCP path ends above. Use these separate developer sections only when you are building a direct HTTP or TypeScript integration.</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[760px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[20%]" /><col className="w-[30%]" /><col className="w-[50%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr><th className="px-4 py-3 font-semibold">Integration</th><th className="px-4 py-3 font-semibold">Access</th><th className="px-4 py-3 font-semibold">Best for</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-semibold text-slate-900"><Link className="text-sky-700 hover:text-sky-900" href="/developers/quickstart">REST API</Link></td><td className="px-4 py-3">Language-neutral HTTP resources</td><td className="px-4 py-3">Backend jobs, webhooks, and language-neutral integrations</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900"><Link className="text-sky-700 hover:text-sky-900" href="/developers/sdk">TypeScript SDK</Link></td><td className="px-4 py-3">Typed resource clients and polling helpers</td><td className="px-4 py-3">Typed Node.js and TypeScript applications</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Workflow" title="Recommended agent sequence">
          <CodeBlock>{`1. certscore_scan_site with a public URL; it uses a 25-second total tool-call budget by default, including scan creation.
2. certscore_get_scan_status only when certscore_scan_site returns a non-terminal result containing scanId; poll with scanId only.
3. certscore_get_scan_bundle for canonical status, findings, bounded evidence, and pre-consent inventory.
4. certscore_get_report, certscore_get_evidence, certscore_list_findings, or cookie inventory only when a dedicated view is needed.
5. certscore_explain_finding for evidence summaries and caveats.
6. certscore_get_latest_domain_scan or certscore_get_latest_domain_pre_consent_cookies_trackers when the user asks for latest-domain data.`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">certscore_scan_site</code> reports whether it reused a result, the freshness decision,
            whether anonymous quota was consumed, the remaining daily allowance, its UTC reset time, and the recommended next tool.
          </p>
          <CodeBlock>{`{
  "executionMode": "reused_scan",
  "reused": true,
  "reusedScanAgeSeconds": 90,
  "freshnessDecision": "reused_existing_scan",
  "quotaConsumed": false,
  "anonymousQuotaLimit": 20,
  "anonymousQuotaRemaining": 7,
  "anonymousQuotaResetAt": "2026-07-16T00:00:00.000Z",
  "upgradeSupportEmail": "support@certscore.ai",
  "upgradeMessage": "For a higher-volume allowance, contact support@certscore.ai.",
  "recommendedNextTool": "certscore_get_scan_bundle"
}`}</CodeBlock>
          <CodeBlock>{`certscore_get_pre_consent_cookies_trackers({
  scanId: "00000000-0000-4000-8000-000000000123"
})

certscore_get_latest_domain_pre_consent_cookies_trackers({
  domain: "ergoveritas.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            MCP tools return compact public-safe JSON. They must not infer raw-signal findings or convert automated review signals into
            legal conclusions. CertScore.ai outputs are automated public-web observations for human and agentic review. They are not legal advice,
            certification, or a compliance determination. Group Cookies & Trackers rows by vendor, purpose, and host when the user wants
            a short review handoff.
          </p>
        </Section>

      </div>
    </DeveloperShell>
  );
}
