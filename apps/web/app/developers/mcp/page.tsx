import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the CertScore.ai MCP server for website compliance review workflows using scan, status, finding, explanation, and latest-domain tools.";
const lightEndpoint = "https://mcp.certscore.ai/mcp/light";
const authenticatedEndpoint = "https://mcp.certscore.ai/mcp";
const codexSetupCommand = "codex mcp add certscore --url https://mcp.certscore.ai/mcp/light";
const firstRunPrompt = "Scan https://www.mozilla.org. If scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll get_scan_status using scanId only. If scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry scan_site; do not call get_scan_status until a scanId exists. Once the scan reaches a terminal status, call get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.";
const verificationPrompt = "List the available CertScore tools and confirm that scan_site, get_scan_status, and get_scan_bundle are available. Then scan https://www.mozilla.org and report whether the result was new or reused.";
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
        <Section eyebrow="Start here" title="CertScore Light: anonymous, no-auth MCP">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            First-time agents should use the Light endpoint. It uses Streamable HTTP and requires no signup, API key, bearer token, browser login, or OAuth,
            and exposes exactly <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">scan_site</code>,
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">get_scan_status</code>, and
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">get_scan_bundle</code>.
          </p>
          <CodeBlock>{`Light:
${lightEndpoint}

Transport: Streamable HTTP
Authentication: None
Tools: scan_site, get_scan_status, get_scan_bundle`}</CodeBlock>
          <h3 className="mt-6 font-semibold text-slate-950">Codex setup</h3>
          <CodeBlock>{codexSetupCommand}</CodeBlock>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Light allows 20 new scans per requester IP per UTC day. Reused eligible results do not consume quota.
          </p>
        </Section>

        <Section eyebrow="First run" title="Paste one prompt">
          <CodeBlock>{firstRunPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Mozilla is a real, stable public site suited to demonstrating the complete scan, status, and bundle flow. A documentation
            placeholder such as <code>example.com</code> may produce a no-go, cached unavailable, or rate-limited result. Users may substitute
            any public HTTP or HTTPS URL.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Light workflow" title="The canonical three-tool sequence">
          <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>Call <code>scan_site</code> with a public URL.</li>
            <li>If a retryable error has no <code>scanId</code>, wait <code>retryAfterSeconds</code> and retry <code>scan_site</code>.</li>
            <li>If the result is queued, running, or finalizing, retain <code>scanId</code>.</li>
            <li>Poll <code>get_scan_status</code> using <code>scanId</code> only. Never poll until <code>scanId</code> exists.</li>
            <li>Stop polling at a terminal status, then call <code>get_scan_bundle</code>.</li>
            <li>Use <code>detail=findings</code> for a compact finding review.</li>
            <li>Use <code>detail=evidence</code> for evidence digests and references.</li>
            <li>If truncated, follow <code>recommendedNextAction</code> or increase <code>maxBytes</code>.</li>
            <li>Summarize findings together with coverage limitations and the report URL.</li>
          </ol>
          <CodeBlock>{`scan_site
→ retry scan_site if a retryable error has no scanId
→ get_scan_status with scanId if still running
→ get_scan_bundle after terminal status`}</CodeBlock>
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
            Call <code>get_scan_status</code> only after <code>scan_site</code> returns a <code>scanId</code>. A retryable response without
            one must return to <code>scan_site</code>.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Verify" title="Confirm the Light connection">
          <CodeBlock>{verificationPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Success means the tool list contains exactly the three Light tools, no authorization page appears, and
            <code className="mx-1 rounded bg-white px-1">scan_site</code> returns a stable <code>scanId</code> plus an explicit
            new-or-reused decision. An eligible reused result reports that quota was not consumed.
          </p>
        </Section>

        <Section eyebrow="Higher volume" title="Full/authenticated MCP">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Use the full endpoint for production, repeated, or advanced diagnostic workflows. It supports OAuth or a scoped key,
            higher volume, history, and the complete tool surface. Unlike Light, this endpoint is authenticated.
          </p>
          <CodeBlock>{`Full/authenticated:
${authenticatedEndpoint}

Transport: Streamable HTTP
Authentication: OAuth authorization code with PKCE`}</CodeBlock>
        </Section>

        <Section eyebrow="No-account agent path" title="Run up to 20 scans per day without signup">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            If an agent cannot create an account or configure OAuth, use the public API v2 scan path instead. Send a JSON POST to{" "}
            <code className="rounded bg-white px-1">/api/v2/scans</code> without an Authorization header, then poll the returned
            status resource and retrieve findings or evidence. New anonymous scans are limited to 20 per requester IP per UTC day;
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
https://mcp.certscore.ai/.well-known/oauth-protected-resource/mcp

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

        <Section eyebrow="Troubleshooting" title="Codex and local-client checks">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>If Codex suggests OAuth unexpectedly, remove the server and add it again with the exact Light URL <code>{lightEndpoint}</code>.</li>
            <li>Confirm no bearer token is configured. Light authentication is <code>None</code>; OAuth metadata belongs only to <code>{authenticatedEndpoint}</code>.</li>
            <li>A successful Streamable HTTP connection completes initialization and lists exactly the three Light tools without opening an authorization page.</li>
            <li>When <code>scanId</code> is missing, retry <code>scan_site</code> only if the error is retryable; never poll status without <code>scanId</code>.</li>
            <li>For <code>rate_limited</code>, follow <code>retryAfterSeconds</code> and <code>recommendedNextAction</code>, or reuse an eligible result.</li>
            <li>A reused eligible result does not consume quota; report it as reused rather than as a new scan.</li>
            <li>For a truncated bundle, follow <code>nextRecommendedMaxBytes</code>, raise <code>maxBytes</code>, or open a returned content URL.</li>
            <li>For <code>invalid_arguments</code>, correct the reported URL field and retry with a public HTTP or HTTPS URL.</li>
            <li><code>completed_limited</code>, no-go, not-observed, and limited coverage are observations only, not proof of compliance; <code>failed</code>, <code>expired</code>, and connection errors are failures.</li>
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

        <Section eyebrow="Choosing an integration" title="Which integration should I use?">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr><th className="px-4 py-3 font-semibold">Integration</th><th className="px-4 py-3 font-semibold">Access</th><th className="px-4 py-3 font-semibold">Best for</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-semibold text-slate-900">Light MCP</td><td className="px-4 py-3">No signup, API key, or OAuth; three tools; 20 new scans per requester IP per UTC day</td><td className="px-4 py-3">Evaluation and low-volume agent workflows</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">Authenticated MCP</td><td className="px-4 py-3">OAuth or scoped key; higher volume, history, and advanced diagnostic tools</td><td className="px-4 py-3">Production and repeated workflows</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">REST API</td><td className="px-4 py-3">Language-neutral HTTP resources</td><td className="px-4 py-3">Backend jobs, webhooks, and language-neutral integrations</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">TypeScript SDK</td><td className="px-4 py-3">Typed resource clients and polling helpers</td><td className="px-4 py-3">Typed Node.js and TypeScript applications</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Workflow" title="Recommended agent sequence">
          <CodeBlock>{`1. scan_site with a public URL; it waits up to 45 seconds by default.
2. get_scan_status only when scan_site returns a non-terminal job.
3. get_scan_bundle for canonical status, findings, bounded evidence, and pre-consent inventory.
4. get_report, get_evidence, list_findings, or cookie inventory only when a dedicated view is needed.
5. explain_finding for evidence summaries and caveats.
6. get_latest_domain_scan or get_latest_domain_pre_consent_cookies_trackers when the user asks for latest-domain data.`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">scan_site</code> reports whether it reused a result, the freshness decision,
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
  "recommendedNextTool": "get_scan_bundle"
}`}</CodeBlock>
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
