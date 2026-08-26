import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { CopyMcpValue, McpLightScanDemo } from "../../../components/developers/mcp-light-actions";
import { CodeBlock } from "../../developers/developer-pages";
import { createPageMetadata } from "../../../lib/seo";

const endpoint = "https://mcp.certscore.ai/mcp/light";
const openAiMcpDemoPath = "/videos/openai-mcp-certscore-demo.mp4";
const codexSetupCommand = "codex mcp add certscore --url https://mcp.certscore.ai/mcp/light";
const firstRunPrompt = "Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. If certscore_scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll certscore_get_scan_status using scanId only. If certscore_scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry certscore_scan_site; do not call certscore_get_scan_status until a scanId exists. Once the scan reaches a terminal status, call certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.";
const verificationPrompt = "List the available CertScore tools and confirm that certscore_scan_site, certscore_get_scan_status, and certscore_get_scan_bundle are available. Then scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html and report whether the result was new or reused.";
const agentDisclaimer = "CertScore results are automated observations from a public-web scan. No-go, not-observed, and limited-coverage results are not proof of compliance, absence of risk, or legal status. Review the retained evidence and applicable context before relying on a finding.";

export const metadata: Metadata = createPageMetadata({
  description: "Connect any MCP agent to CertScore.ai and scan public websites instantly with no account, API key, or OAuth. Includes up to 50 new scans per UTC day across Light.",
  path: "/mcp/light",
  robots: { follow: true, index: true },
  title: "CertScore.ai Light MCP — no-account website privacy scans"
});

const clients = [
  ["Claude", "Add a custom remote MCP connector and paste the Light endpoint."],
  ["ChatGPT", "Add the remote MCP server in developer mode and paste the Light endpoint."],
  ["Cursor", "Add a remote Streamable HTTP MCP server using the Light endpoint."],
  ["VS Code", "Add an HTTP MCP server and use the Light endpoint as its URL."],
  ["Codex", `Run: ${codexSetupCommand}`]
] as const;

const workflow = [
  "Call certscore_scan_site with a public URL.",
  "If a retryable error has no scanId, wait retryAfterSeconds and retry certscore_scan_site.",
  "If the result is queued, running, or finalizing, retain scanId.",
  "Poll certscore_get_scan_status using scanId only. Never poll until scanId exists.",
  "Stop polling when the scan reaches a terminal status, then call certscore_get_scan_bundle.",
  "Use detail=findings for a compact finding review.",
  "Use detail=evidence for evidence digests and references.",
  "If truncated, follow recommendedNextAction or increase maxBytes.",
  "Summarize findings together with coverage limitations and the report URL."
] as const;

export default function McpLightPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section aria-labelledby="route-choice" className="border-b border-sky-200 bg-sky-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Start here</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950" id="route-choice">Which route should I choose?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Start anonymously in one minute. Upgrade only when you need more scans, team or backend access, history, or advanced tools.</p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border-2 border-sky-400 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Recommended first step</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Light MCP — no authentication</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">No account, API key, bearer token, browser login, or OAuth. Use it for first-time setup, testing, discovery, and low-volume public website scans.</p>
              <a className="mt-5 inline-flex rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="#quickstart">Start with Light MCP</a>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">When Light is not enough</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Authenticated MCP</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600"><strong>Hosted MCP — OAuth</strong> is for managed remote clients. <strong>Local MCP — scoped API key</strong> is for stdio, backend, and controlled local environments.</p>
              <Link className="mt-5 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" href="/developers/mcp#authenticated-mcp">Set up Authenticated MCP</Link>
            </article>
          </div>
        </div>
      </section>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <Badge tone="neutral">Light MCP — no authentication</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Give your agent a URL. Get a website privacy-risk scan.</h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600">No signup, API key, bearer token, browser login, or OAuth. Connect once and let an MCP-capable agent scan public websites for privacy, cookie, tracker, consent, policy, and disclosure risk signals.</p>
            <div className="flex flex-wrap gap-3">
              <CopyMcpValue label="Codex command" value={codexSetupCommand} />
              <CopyMcpValue label="first-run prompt" value={firstRunPrompt} />
              <Link className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" href="#try">Try it now</Link>
              <Link className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" href="#openai-mcp-demo">Watch the demo</Link>
            </div>
            <p className="text-sm text-slate-500">Streamable HTTP with no API key and no OAuth. Light allows up to 50 genuinely new scans per UTC day across the public Light surface and 5 per rolling 10 minutes; reused eligible results do not consume quota. Contact <a className="font-semibold text-sky-700" href="mailto:support@certscore.ai">support@certscore.ai</a> for higher volume.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Remote MCP endpoint</p>
            <code className="break-all text-sm">{endpoint}</code>
            <div className="mt-6 grid gap-3 text-sm">
              {[["1", "Run the Codex setup command"], ["2", "Paste the first-run prompt"], ["3", "Review the canonical result"]].map(([step, text]) => <div className="flex gap-3" key={step}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 font-semibold text-slate-950">{step}</span><span>{text}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="openai-mcp-demo-title" className="border-b border-slate-200 bg-slate-950" id="openai-mcp-demo">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:py-16 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
          <div className="order-2 lg:order-1">
            <video
              aria-label="OpenAI ChatGPT CertScore MCP integration demonstration"
              className="w-full rounded-xl bg-black shadow-2xl ring-1 ring-white/10"
              controls
              playsInline
              preload="metadata"
            >
              <source src={openAiMcpDemoPath} type="video/mp4" />
              Your browser does not support embedded video. <a className="underline" href={openAiMcpDemoPath}>Open the MP4 directly.</a>
            </video>
          </div>
          <div className="order-1 text-white lg:order-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">OpenAI MCP integration demo</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight" id="openai-mcp-demo-title">See Light MCP in action</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">Watch the OpenAI/ChatGPT flow from prompt to CertScore tool calls, public-safe scan observations, and the full report. It is the quickest way to understand what the Light route feels like in practice.</p>
            <a className="mt-6 inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-50" href={openAiMcpDemoPath} rel="noreferrer" target="_blank">Open the standalone MP4</a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-6 py-14">
        <section id="quickstart">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Codex quickstart</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Light MCP — no authentication</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Run this command, then paste the first-run prompt into Codex. The connection uses Streamable HTTP and should not open a browser, request OAuth, or ask for an API key.</p>
          <CodeBlock>{codexSetupCommand}</CodeBlock>
          <h3 className="mt-6 font-semibold text-slate-950">First-run prompt</h3>
          <CodeBlock>{firstRunPrompt}</CodeBlock>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">The ErgoVeritas canary page is a controlled, stable test site for demonstrating the complete scan, status, and bundle flow. Substitute your own public URL at any time.</p>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Canonical workflow</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Exactly what the agent should do</h2>
          <CodeBlock>{`certscore_scan_site
→ retry certscore_scan_site if a retryable error has no scanId
→ certscore_get_scan_status with scanId if still running
→ certscore_get_scan_bundle after terminal status`}</CodeBlock>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {workflow.map((step, index) => (
              <li className="flex gap-3 text-sm leading-6 text-slate-700" key={step}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-800">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm leading-7 text-slate-600">Terminal statuses are <code>completed</code>, <code>completed_limited</code>, <code>failed</code>, <code>expired</code>, and <code>rate_limited</code>. A <code>completed_limited</code> or no-go result is a usable observation with explicit limitations, not a transport failure.</p>
          <p className="mt-3 text-sm font-semibold text-slate-800"><code>certscore_get_scan_status</code> should only be called after <code>certscore_scan_site</code> returns a <code>scanId</code>.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-slate-950">What can happen?</h2>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[680px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[25%]" />
                <col className="w-[75%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Outcome</th><th className="px-4 py-3 font-semibold">What the agent should do</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-mono">completed</td><td className="px-4 py-3">Call <code>certscore_get_scan_bundle</code> and summarize the result.</td></tr>
                <tr><td className="px-4 py-3 font-mono">reused_scan</td><td className="px-4 py-3">Report that an eligible prior scan was reused and quota was not consumed. Keep this original creation decision separate from a later <code>scan_id_lookup</code>.</td></tr>
                <tr><td className="px-4 py-3 font-mono">queued / running / finalizing</td><td className="px-4 py-3">Retain <code>scanId</code> and poll <code>certscore_get_scan_status</code> using <code>scanId</code> only.</td></tr>
                <tr><td className="px-4 py-3 font-mono">completed_limited / no-go</td><td className="px-4 py-3">Explain the limitation and never treat it as proof of compliance or absence of risk.</td></tr>
                <tr><td className="px-4 py-3 font-mono">retryable error without scanId</td><td className="px-4 py-3">Wait <code>retryAfterSeconds</code> and retry <code>certscore_scan_site</code>; do not poll status.</td></tr>
                <tr><td className="px-4 py-3 font-mono">invalid URL</td><td className="px-4 py-3">Correct the public HTTP or HTTPS URL, then retry <code>certscore_scan_site</code>.</td></tr>
                <tr><td className="px-4 py-3 font-mono">rate_limited</td><td className="px-4 py-3">Wait for the recommended delay or stop; do not guess a polling action.</td></tr>
                <tr><td className="px-4 py-3 font-mono">truncated bundle</td><td className="px-4 py-3">Report <code>actualBytes</code>, <code>omittedSections</code>, <code>canonicalFindingsComplete</code>, and <code>nextRecommendedMaxBytes</code>. When canonical findings are complete, retry only for omitted envelope detail; otherwise increase <code>maxBytes</code> or follow a report or evidence URL.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-6" id="try">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Live demonstration</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Scan a public website now</h2>
          <p className="mb-5 mt-2 text-sm leading-7 text-slate-600">This starts the same no-account scan available to Light agents and opens its shareable public report.</p>
          <McpLightScanDemo />
          <p className="mt-5 border-t border-sky-200 pt-4 text-sm font-semibold text-sky-950">Need more scans or advanced tools? Upgrade to Authenticated MCP.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Connect from your MCP client</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clients.map(([name, instruction]) => <article className="rounded-lg border border-slate-200 bg-white p-5" key={name}><h3 className="font-semibold text-slate-950">{name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{instruction}</p></article>)}
          </div>
          <CodeBlock>{`Transport: Streamable HTTP\nURL: ${endpoint}\nAuthentication: None`}</CodeBlock>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Bundle detail is explicit: <code>summary</code> returns the compact default, <code>findings</code> adds bounded finding detail,
            <code>evidence</code> adds retained-evidence summaries and references, and <code>full</code> adds the bounded public report without repeating findings or transport sections already present at the top level.
            Use <code>maxBytes</code> to request a byte budget. Light applies a transport-safe 25,000-byte ceiling and reports the requested budget, effective budget, ceiling, actual bytes, complete-tier bytes, and any truncation reason.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[680px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[24%]" />
                <col className="w-[58%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">detail</th><th className="px-4 py-3 font-semibold">Recommended maxBytes</th><th className="px-4 py-3 font-semibold">Use</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {[["summary", "5000", "Canonical overview"], ["findings", "8000", "Compact finding review"], ["evidence", "8000", "Finding plus evidence digests and references"], ["full", "12000–25000", "All available bounded sections within the Light ceiling"]].map(([detail, maxBytes, use]) => <tr key={detail}><td className="px-4 py-3 font-mono">{detail}</td><td className="px-4 py-3 font-mono">{maxBytes}</td><td className="px-4 py-3">{use}</td></tr>)}
              </tbody>
            </table>
          </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">A 5,000-byte response preserves compact core findings before reducing optional inventory or duplicate envelope fields. At this tight tier, repeated per-finding URLs may be replaced by <code>evidenceUrlTemplate</code>; substitute the returned finding ID into that template using <code>contentUrls.findings</code> to reach the same canonical evidence endpoint. Short canonical <code>nextStep</code> actions are retained only when they fit without displacing a finding; use the finding URL or complete tier for longer actions. Inspect <code>canonicalFindingsComplete</code>, <code>requestedMaxBytes</code>, <code>effectiveMaxBytes</code>, <code>responseCeilingBytes</code>, <code>actualBytes</code>, <code>fullPayloadBytes</code>, <code>truncated</code>, <code>omittedSections</code>, <code>nextRecommendedMaxBytes</code>, and the report or evidence content URLs before retrying.</p>
          <p className="mt-4 text-sm text-slate-600">
            Prefer a managed directory connection? Find CertScore.ai on{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-800" href="https://smithery.ai/server/ben-qe1c/certscore-ai" rel="noopener" target="_blank">Smithery</a>.
          </p>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Verify the connection</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Confirm the three-tool Light surface</h2>
          <CodeBlock>{verificationPrompt}</CodeBlock>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">Success means Codex lists exactly <code>certscore_scan_site</code>, <code>certscore_get_scan_status</code>, and <code>certscore_get_scan_bundle</code>; no OAuth prompt appears; and <code>certscore_scan_site</code> returns a stable <code>scanId</code> plus an explicit new-or-reused decision. A reused eligible result should show that quota was not consumed.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Codex troubleshooting</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Common first-run issues</h2>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li><strong>Unexpected OAuth:</strong> remove the connection and add it again with the exact URL <code>{endpoint}</code>. Do not configure a bearer token; the Light endpoint has no authentication.</li>
            <li><strong>Connection check:</strong> a successful Streamable HTTP connection completes initialization and lists the three Light tools without opening an authorization page.</li>
            <li><strong>Missing scanId:</strong> retry <code>certscore_scan_site</code> only when the error says <code>retryable: true</code>; never poll <code>certscore_get_scan_status</code> without <code>scanId</code>.</li>
            <li><strong>Rate limited:</strong> follow <code>retryAfterSeconds</code> and <code>recommendedNextAction</code>, or reuse an eligible result. The daily allowance resets at the returned UTC time.</li>
            <li><strong>Provenance:</strong> <code>retrievalMode</code> describes the current tool call, while <code>creationDecision</code> says whether the original scan was new or reused only when retained. Never treat <code>scan_id_lookup</code> alone as proof of reuse; report <code>unknown</code> honestly. Use numeric <code>scanAgeSeconds</code> when available.</li>
            <li><strong>Truncated bundle:</strong> when <code>canonicalFindingsComplete</code> is true, retry only for omitted envelope detail. Otherwise follow <code>nextRecommendedMaxBytes</code> when it fits <code>responseCeilingBytes</code>, or open one of the returned canonical report or evidence content URLs.</li>
            <li><strong>Invalid URL:</strong> correct the <code>url</code> field using the structured <code>invalid_arguments</code> response, then retry <code>certscore_scan_site</code> with a public HTTP or HTTPS URL.</li>
            <li><strong>Limited result:</strong> <code>completed_limited</code>, no-go, not-observed, and limited coverage are observations only, never proof of compliance. Transport failures instead return <code>failed</code>, <code>expired</code>, or a connection error with retry guidance.</li>
          </ul>
        </section>

        <section aria-labelledby="comparison-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">At a glance</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="comparison-heading">Compare the three MCP setup routes</h2>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Route</th><th className="px-4 py-3 font-semibold">Setup method</th><th className="px-4 py-3 font-semibold">Authentication</th><th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Quota</th><th className="px-4 py-3 font-semibold">Available tools</th><th className="px-4 py-3 font-semibold">Intended user</th><th className="px-4 py-3 font-semibold">Website / access limits</th><th className="px-4 py-3 font-semibold">Upgrade path</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Light MCP — no authentication</td><td className="px-4 py-3">One Codex command or a remote Streamable HTTP URL</td><td className="px-4 py-3">None</td><td className="px-4 py-3">Not required</td><td className="px-4 py-3">Up to 50 new scans per UTC day across Light and 5 per rolling 10 minutes; eligible reuse is free</td><td className="px-4 py-3">certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle</td><td className="px-4 py-3">First-time users, testing, and discovery</td><td className="px-4 py-3">Public HTTP or HTTPS websites; core tools only</td><td className="px-4 py-3">Choose authenticated access for volume, history, teams, or advanced tools</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Hosted MCP — OAuth</td><td className="px-4 py-3">Connect the hosted MCP endpoint from an OAuth-capable client</td><td className="px-4 py-3">OAuth authorization code with PKCE</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on access</td><td className="px-4 py-3">Core tools plus approved history and diagnostic tools</td><td className="px-4 py-3">Production, team, and managed remote clients</td><td className="px-4 py-3">Scopes control read and scan creation; scan creation may require support</td><td className="px-4 py-3">Request additional scopes or volume from support</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Local MCP — scoped API key</td><td className="px-4 py-3">Install and run the local stdio server</td><td className="px-4 py-3">Scoped API key in the client environment</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on key access</td><td className="px-4 py-3">Tools permitted by the key scopes</td><td className="px-4 py-3">Backend, local, and controlled automation workflows</td><td className="px-4 py-3">Key scopes control read and scan creation; protect and rotate credentials</td><td className="px-4 py-3">Request scan:create-equivalent scope, advanced access, or more volume</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Five useful agent workflows</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              "Scan my website for cookies and trackers observed before consent.",
              "Compare the privacy-risk signals from these three public websites.",
              "Review this domain before vendor onboarding and summarize evidence-backed concerns.",
              "Identify the most important privacy, consent, policy, and disclosure risks on this site.",
              "Scan this list of public websites and create a concise review table with coverage limitations."
            ].map((prompt) => <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700" key={prompt}>{prompt}</div>)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Light-to-Authenticated migration</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Upgrade when Light becomes a constraint</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Upgrade when you need a dedicated higher-volume allowance, production or team access, backend automation, scan history, advanced diagnostic tools, or support-managed scopes.</p>
          <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4"><strong className="text-slate-950">What changes</strong><p className="mt-2 leading-6 text-slate-600">Use the full endpoint, authenticate with hosted OAuth or a local scoped API key, and receive the quota and tools granted to that access.</p></div>
            <div className="rounded-lg bg-slate-50 p-4"><strong className="text-slate-950">What stays compatible</strong><p className="mt-2 leading-6 text-slate-600">Core identifiers and canonical response fields—including <code>scanId</code>, status, score, risk, coverage, and timestamps—remain compatible.</p></div>
          </div>
          <p className="mt-5 text-sm font-semibold text-slate-950">Need more scans or advanced tools? Upgrade to Authenticated MCP.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/developers/mcp#authenticated-mcp">Set up Authenticated MCP</Link><a className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800" href="mailto:support@certscore.ai?subject=CertScore.ai%20MCP%20higher-volume%20access">Contact support</a></div>
        </section>
        <p className="text-sm leading-6 text-slate-500">{agentDisclaimer}</p>
      </div>
      <SiteFooter />
    </main>
  );
}
