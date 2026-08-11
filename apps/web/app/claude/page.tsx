import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { CopyMcpValue } from "../../components/developers/mcp-light-actions";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const endpoint = "https://mcp.certscore.ai/mcp/light";
const firstRunPrompt =
  "Use CertScore to scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. Wait for the scan to finish, then summarize the score, risk level, findings, evidence links, coverage limitations, and report URL. Treat the result as an automated public-web observation, not a legal conclusion.";

export const metadata: Metadata = createPageMetadata({
  description:
    "Connect CertScore.ai to Claude and turn a plain-English prompt into an evidence-backed website privacy, cookie, consent, and disclosure review.",
  path: "/claude",
  robots: { follow: true, index: true },
  title: "Claude Website Risk Scanner — CertScore.ai"
});

const promptExamples = [
  "Scan my website for cookies and trackers observed before consent.",
  "Review this domain before vendor onboarding and summarize the evidence-backed concerns.",
  "Compare the privacy and consent signals from these three public websites.",
  "Find the most important accessibility, cookie, policy, and disclosure signals on this site."
] as const;

const audiences = [
  ["Agencies", "Turn client-site reviews into a repeatable workflow your team can run from a Claude conversation."],
  ["Privacy teams", "Get a fast public-web evidence pass before deeper policy, vendor, or consent review."],
  ["Developers", "Use a remote MCP server with clear tools, bounded results, and copyable setup instructions."]
] as const;

const faqs = [
  ["Do I need a CertScore account?", "No. The Light MCP route is designed for first-time setup and does not require an account, API key, bearer token, or OAuth."],
  ["What can Claude scan?", "CertScore scans public HTTP or HTTPS websites for observable accessibility, privacy, cookie, consent, policy, and disclosure risk signals."],
  ["What should I ask Claude first?", `Paste this prompt after connecting: ${firstRunPrompt}`],
  ["Are results legal or compliance determinations?", "No. Results are automated public-web observations with coverage limitations. Review retained evidence and applicable context before relying on a finding."]
] as const;

export default function ClaudeLandingPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CertScore.ai for Claude",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/claude`,
    description: metadata.description
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-sky-500/20 bg-[#031126] text-white">
        <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-44 left-1/3 h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16">
          <div>
            <Badge tone="info">Claude + MCP</Badge>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.06] tracking-[-0.04em] sm:text-6xl">
              Turn Claude into a website risk reviewer.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Ask a plain-English question. Get an evidence-backed review of public website behavior, including privacy, cookies, consent, accessibility, policy, and disclosure signals.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.22)] transition hover:bg-sky-300" href="/mcp/light#quickstart">
                Connect to Claude
              </Link>
              <Link className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/60 hover:bg-white/10" href="/mcp/light#try">
                Try a free scan
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">No account to start</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Public websites</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Evidence-linked results</span>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-sky-200/20 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(14,165,233,0.16)] backdrop-blur sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">First useful prompt</p>
                <p className="mt-1 text-sm text-slate-400">Paste after connecting CertScore to Claude</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">Ready</span>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-200">{firstRunPrompt}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopyMcpValue label="first-run prompt" value={firstRunPrompt} />
              <CopyMcpValue label="endpoint" value={endpoint} />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">The controlled canary URL makes the first connection easy to verify. Replace it with any public website afterward.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">A faster first pass</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">From “check this site” to a reviewable result.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">CertScore gives Claude a structured way to start the work, while keeping evidence, limitations, and report links visible in the response.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Connect once", "Use the no-auth Light MCP endpoint for the fastest first run."],
              ["02", "Ask naturally", "Describe the site or review you need in the same language you already use with Claude."],
              ["03", "Review evidence", "Get a bounded result with findings, references, coverage limits, and a report URL."]
            ].map(([number, title, detail]) => (
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6" key={number}>
                <span className="text-sm font-bold text-sky-700">{number}</span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="prompts-heading">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Prompt library</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950" id="prompts-heading">Useful questions to ask Claude</h2>
          </div>
          <Link className="text-sm font-semibold text-sky-700 hover:text-sky-900" href="/mcp/light#quickstart">See the full setup guide →</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {promptExamples.map((prompt) => (
            <article className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={prompt}>
              <p className="text-sm leading-6 text-slate-700">“{prompt}”</p>
              <CopyMcpValue label="prompt" value={prompt} />
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-sky-50/70">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {audiences.map(([title, detail]) => (
              <article className="rounded-2xl border border-sky-100 bg-white p-6" key={title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-800" aria-hidden="true">{title.slice(0, 1)}</div>
                <h2 className="mt-5 text-lg font-semibold text-slate-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="faq-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Before you connect</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950" id="faq-heading">Frequently asked questions</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
          {faqs.map(([question, answer]) => (
            <details className="py-5" key={question}>
              <summary className="cursor-pointer list-none pr-8 text-base font-semibold text-slate-950 marker:hidden">{question}</summary>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-[#031126] px-4 py-14 text-white sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Make the first call count</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Connect CertScore to Claude and scan a real site.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">Start with the no-auth route, use the copyable prompt above, and replace the canary URL with your own public website when you are ready.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300" href="/mcp/light#quickstart">Open the Claude setup guide</Link>
            <a className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10" href="mailto:support@certscore.ai?subject=CertScore.ai%20Claude%20setup">Ask for help</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
