import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { CopyMcpValue, McpLightScanDemo } from "../../../components/developers/mcp-light-actions";
import { CodeBlock } from "../../developers/developer-pages";
import { createPageMetadata } from "../../../lib/seo";

const endpoint = "https://mcp.certscore.ai/mcp/light";
const codexSetupCommand = "codex mcp add certscore --url https://mcp.certscore.ai/mcp/light";
const firstRunPrompt = "Scan https://example.com. If the scan is still running, poll get_scan_status using the returned scanId. Then call get_scan_bundle with detail=findings and maxBytes=8000. Summarize the score, risk level, findings, evidence links, coverage limitations, and report URL. Treat results as automated public-web observations, not legal conclusions or compliance determinations.";
const verificationPrompt = "List the available CertScore tools. Confirm the server exposes scan_site, get_scan_status, and get_scan_bundle. Then scan https://example.com and report whether the result was new or reused.";
const agentDisclaimer = "CertScore results are automated observations from a public-web scan. No-go, not-observed, and limited-coverage results are not proof of compliance, absence of risk, or legal status. Review the retained evidence and applicable context before relying on a finding.";

export const metadata: Metadata = createPageMetadata({
  description: "Connect any MCP agent to CertScore.ai and scan public websites instantly with no account, API key, or OAuth. Includes 20 new scans per day.",
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
  "Call scan_site with a public URL.",
  "If the result is queued, running, or finalizing, retain scanId.",
  "Poll get_scan_status using scanId. Do not poll with jobId after scanId is available.",
  "Once terminal, call get_scan_bundle.",
  "Use detail=findings for a compact finding review.",
  "Use detail=evidence for evidence digests and references.",
  "If truncated, follow recommendedNextAction or increase maxBytes.",
  "Summarize findings together with coverage limitations and the report URL."
] as const;

export default function McpLightPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <Badge tone="neutral">Anonymous / no-auth Light MCP</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Give your agent a URL. Get a website privacy-risk scan.</h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600">No signup, API key, or OAuth. Connect once and let an MCP-capable agent scan public websites for privacy, cookie, tracker, consent, policy, and disclosure risk signals.</p>
            <div className="flex flex-wrap gap-3">
              <CopyMcpValue label="Codex command" value={codexSetupCommand} />
              <CopyMcpValue label="first-run prompt" value={firstRunPrompt} />
              <Link className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" href="#try">Try it now</Link>
            </div>
            <p className="text-sm text-slate-500">Streamable HTTP with no API key and no OAuth. Light allows 20 new scans per requester IP per UTC day; reused eligible results do not consume quota. Contact <a className="font-semibold text-sky-700" href="mailto:support@certscore.ai">support@certscore.ai</a> for higher volume.</p>
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

      <div className="mx-auto max-w-6xl space-y-14 px-6 py-14">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Codex quickstart</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">One command, no authentication</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Run this command, then paste the first-run prompt into Codex. The connection uses Streamable HTTP and should not open a browser, request OAuth, or ask for an API key.</p>
          <CodeBlock>{codexSetupCommand}</CodeBlock>
          <h3 className="mt-6 font-semibold text-slate-950">First-run prompt</h3>
          <CodeBlock>{firstRunPrompt}</CodeBlock>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Canonical workflow</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Exactly what the agent should do</h2>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {workflow.map((step, index) => (
              <li className="flex gap-3 text-sm leading-6 text-slate-700" key={step}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-800">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm leading-7 text-slate-600">Terminal statuses are <code>completed</code>, <code>completed_limited</code>, <code>failed</code>, <code>expired</code>, and <code>rate_limited</code>. A <code>completed_limited</code> or no-go result is a usable observation with explicit limitations, not a transport failure.</p>
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-6" id="try">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Live demonstration</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Scan a public website now</h2>
          <p className="mb-5 mt-2 text-sm leading-7 text-slate-600">This starts the same no-account scan available to Light agents and opens its shareable public report.</p>
          <McpLightScanDemo />
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Connect from your MCP client</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clients.map(([name, instruction]) => <article className="rounded-lg border border-slate-200 bg-white p-5" key={name}><h3 className="font-semibold text-slate-950">{name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{instruction}</p></article>)}
          </div>
          <CodeBlock>{`Transport: Streamable HTTP\nURL: ${endpoint}\nAuthentication: None`}</CodeBlock>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Bundle detail is explicit: <code>summary</code> returns the compact default, <code>findings</code> adds bounded finding detail,
            <code>evidence</code> adds retained-evidence summaries and references, and <code>full</code> adds the bounded public report.
            Use <code>maxBytes</code> to set a 5,000–200,000 byte budget; the response reports requested bytes, actual bytes, and any truncation reason.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">detail</th><th className="px-4 py-3 font-semibold">Recommended maxBytes</th><th className="px-4 py-3 font-semibold">Use</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {[["summary", "5000", "Canonical overview"], ["findings", "8000", "Compact finding review"], ["evidence", "8000", "Finding plus evidence digests and references"], ["full", "12000 or higher", "All available bounded sections"]].map(([detail, maxBytes, use]) => <tr key={detail}><td className="px-4 py-3 font-mono">{detail}</td><td className="px-4 py-3 font-mono">{maxBytes}</td><td className="px-4 py-3">{use}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">A 5,000-byte response may intentionally omit optional sections while still returning a compact finding or evidence reference when available. Inspect <code>actualBytes</code>, <code>truncated</code>, <code>omittedSections</code>, <code>nextRecommendedMaxBytes</code>, and the report or evidence content URLs before retrying.</p>
          <p className="mt-4 text-sm text-slate-600">
            Prefer a managed directory connection? Find CertScore.ai on{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-800" href="https://smithery.ai/server/ben-qe1c/certscore-ai" rel="noopener" target="_blank">Smithery</a>.
          </p>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Verify the connection</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Confirm the three-tool Light surface</h2>
          <CodeBlock>{verificationPrompt}</CodeBlock>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">Success means Codex lists exactly <code>scan_site</code>, <code>get_scan_status</code>, and <code>get_scan_bundle</code>; no OAuth prompt appears; and <code>scan_site</code> returns a stable <code>scanId</code> plus an explicit new-or-reused decision. A reused eligible result should show that quota was not consumed.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Codex troubleshooting</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Common first-run issues</h2>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li><strong>Unexpected OAuth:</strong> remove the connection and add it again with the exact URL <code>{endpoint}</code>. Do not configure a bearer token; the Light endpoint has no authentication.</li>
            <li><strong>Connection check:</strong> a successful Streamable HTTP connection completes initialization and lists the three Light tools without opening an authorization page.</li>
            <li><strong>Rate limited:</strong> follow <code>retryAfterSeconds</code> and <code>recommendedNextAction</code>, or reuse an eligible result. The daily allowance resets at the returned UTC time.</li>
            <li><strong>Truncated bundle:</strong> follow <code>nextRecommendedMaxBytes</code>, increase <code>maxBytes</code>, or open one of the returned content URLs.</li>
            <li><strong>Invalid URL:</strong> correct the <code>url</code> field using the structured <code>invalid_arguments</code> response, then retry <code>scan_site</code> with a public HTTP or HTTPS URL.</li>
            <li><strong>Limited result:</strong> <code>completed_limited</code> and no-go mean the scan reached a usable terminal state with bounded observations. Transport failures instead return <code>failed</code>, <code>expired</code>, or a connection error with retry guidance.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Which integration should I use?</h2>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Integration</th><th className="px-4 py-3 font-semibold">Access</th><th className="px-4 py-3 font-semibold">Best for</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-semibold text-slate-900">Light MCP</td><td className="px-4 py-3">No signup, API key, or OAuth; three tools; 20 new scans per requester IP per UTC day</td><td className="px-4 py-3">Evaluation and low-volume agent workflows</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">Authenticated MCP</td><td className="px-4 py-3">OAuth or scoped key; higher volume, history, and advanced diagnostic tools</td><td className="px-4 py-3">Production and repeated agent workflows</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">REST API</td><td className="px-4 py-3">Language-neutral HTTP resources</td><td className="px-4 py-3">Backend jobs, webhooks, and language-neutral integrations</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900">TypeScript SDK</td><td className="px-4 py-3">Typed resource clients and polling helpers</td><td className="px-4 py-3">Typed Node.js and TypeScript applications</td></tr>
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
          <h2 className="text-2xl font-semibold text-slate-950">Need more than Light mode?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">The authenticated CertScore.ai MCP adds higher-volume access, history, and the complete diagnostic toolset. Email support with your expected workflow and volume.</p>
          <div className="mt-5 flex flex-wrap gap-3"><a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="mailto:support@certscore.ai?subject=CertScore.ai%20MCP%20higher-volume%20access">Request higher volume</a><Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800" href="/developers/mcp">Read full MCP documentation</Link></div>
        </section>
        <p className="text-sm leading-6 text-slate-500">{agentDisclaimer}</p>
      </div>
      <SiteFooter />
    </main>
  );
}
