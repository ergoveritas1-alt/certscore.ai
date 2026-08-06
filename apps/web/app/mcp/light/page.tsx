import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { CopyMcpValue, McpLightScanDemo } from "../../../components/developers/mcp-light-actions";
import { CodeBlock } from "../../developers/developer-pages";
import { createPageMetadata } from "../../../lib/seo";

const endpoint = "https://mcp.certscore.ai/mcp/light";
const agentPrompt = `Scan these public URLs with CertScore Light. For each one, call scan_site. If status is queued, running, or finalizing, retain scanId and poll get_scan_status using only scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For completed or completed_limited scans, call get_scan_bundle with detail \"summary\". Report the canonical score, risk level, coverage, top findings, limitations, report URL, and next action. Never treat no-go, not-observed, or limited coverage as proof of compliance.`;

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
  ["Codex", "Add the remote MCP endpoint with authentication set to None. No browser authorization flow is expected." ]
] as const;

export default function McpLightPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <Badge tone="neutral">Zero-auth Light mode</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Give your agent a URL. Get a website privacy-risk scan.</h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600">No signup, API key, or OAuth. Connect once and let an MCP-capable agent scan public websites for privacy, cookie, tracker, consent, policy, and disclosure risk signals.</p>
            <div className="flex flex-wrap gap-3">
              <CopyMcpValue label="endpoint" value={endpoint} />
              <CopyMcpValue label="agent prompt" value={agentPrompt} />
              <Link className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" href="#try">Try it now</Link>
            </div>
            <p className="text-sm text-slate-500">20 new scans per requester IP per UTC day. Recent-result reuse is free. Contact <a className="font-semibold text-sky-700" href="mailto:support@certscore.ai">support@certscore.ai</a> for higher volume.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Remote MCP endpoint</p>
            <code className="break-all text-sm">{endpoint}</code>
            <div className="mt-6 grid gap-3 text-sm">
              {[["1", "scan_site"], ["2", "get_scan_status when needed"], ["3", "get_scan_bundle with detail summary"]].map(([step, text]) => <div className="flex gap-3" key={step}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 font-semibold text-slate-950">{step}</span><span>{text}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-6 py-14">
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
          <p className="mt-4 text-sm text-slate-600">
            Prefer a managed directory connection? Find CertScore.ai on{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-800" href="https://smithery.ai/server/ben-qe1c/certscore-ai" rel="noopener" target="_blank">Smithery</a>.
          </p>
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
        <p className="text-sm leading-6 text-slate-500">CertScore.ai outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.</p>
      </div>
      <SiteFooter />
    </main>
  );
}
