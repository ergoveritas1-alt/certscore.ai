import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { CopyMcpValue } from "../../components/developers/mcp-light-actions";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const endpoint = "https://mcp.certscore.ai/mcp/light";
const firstRunPrompt =
  "Ask me for the public website URL I want to review, and wait for my reply. Then use CertScore to scan only that URL within the existing access limits, allowing an eligible recent result to be reused. Retrieve the completed report before summarizing findings, evidence links, coverage limitations, and the report URL. Say whether the result was new or reused. Treat preliminary observations as preliminary and explain blocked or incomplete coverage. Results are automated observations, not legal conclusions.";
const nextWebsitePrompt =
  "Ask me for a different public website URL to review next, and wait for my reply. Scan only that URL with CertScore, using the same scan settings where supported and staying within existing access limits. Allow an eligible recent result to be reused. Retrieve its completed report and summarize its findings, evidence links, coverage limitations, and report URL separately from the first website. Say whether the result was new or reused. Do not treat missing observations as proof that a site is compliant.";
const connectionCheckPrompt =
  "Use CertScore to scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. Wait for the scan to finish, then summarize the score, risk level, findings, evidence links, coverage limitations, and report URL. Treat the result as an automated public-web observation, not a legal conclusion.";

export const metadata: Metadata = createPageMetadata({
  description:
    "Connect CertScore.ai to Claude and turn a plain-English prompt into an evidence-backed website privacy, cookie, consent, and disclosure review.",
  path: "/claude",
  robots: { follow: true, index: true },
  title: "Claude Website Privacy Scanner"
});

const promptExamples = [
  "Scan my website for cookies and trackers observed before consent.",
  "Review this domain before vendor onboarding and summarize the evidence-backed concerns.",
  "Using the two completed reports already in this conversation, compare their observed privacy and consent signals. Keep scan dates, settings, and coverage differences visible; do not start new scans.",
  "Find the most important accessibility, cookie, policy, and disclosure signals on this site."
] as const;

const audiences = [
  ["Agencies", "Turn client-site reviews into a repeatable workflow your team can run from a Claude conversation."],
  ["Privacy teams", "Get a fast public-web evidence pass before deeper policy, vendor, or consent review."],
  ["Developers", "Use a remote MCP server with clear tools, bounded results, and copyable setup instructions."]
] as const;

const faqs = [
  ["Do I need a CertScore account?", "Light MCP does not require an account, API key, bearer token, or OAuth. It is for low-volume public scans with public reports. Hosted OAuth connects an eligible CertScore workspace for authorized scan history and report access; account and workspace requirements apply."],
  ["What can Claude scan?", "CertScore scans public HTTP or HTTPS websites for observable accessibility, privacy, cookie, consent, policy, and disclosure risk signals."],
  ["What should I ask Claude first?", `Paste this prompt after connecting: ${firstRunPrompt}`],
  ["How do I review a second website?", "After reviewing the first report, copy the next-website prompt and supply a different public URL when Claude asks. Each target is a separate scan request under the existing limits. Light access is not an unlimited bulk-scanning service."],
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
              <Link className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.22)] transition hover:bg-sky-300" href="#connect">
                Connect to Claude
              </Link>
              <Link className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300/60 hover:bg-white/10" href="#first-scan">
                Scan your website
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">No account to start</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Public websites</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Evidence-linked results</span>
            </div>
          </div>

          <div id="first-scan" className="scroll-mt-24 rounded-[1.5rem] border border-sky-200/20 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(14,165,233,0.16)] backdrop-blur sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Scan your own website</h2>
                <p className="mt-1 text-sm text-slate-400">Paste after connecting CertScore to Claude</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-200">{firstRunPrompt}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopyMcpValue label="website prompt" value={firstRunPrompt} />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">Claude will ask for your URL before scanning. Start with one public page and review its coverage before choosing another website.</p>
            <details className="mt-5 border-t border-white/10 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-sky-200">Optional: verify the connection with our canary</summary>
              <p className="mt-3 text-xs leading-6 text-slate-400">This controlled test page checks the connection. Its report describes the canary, not your website. This is a scan request under the existing limits.</p>
              <p className="my-3 break-words text-sm leading-7 text-slate-200">{connectionCheckPrompt}</p>
              <CopyMcpValue label="connection-check prompt" value={connectionCheckPrompt} />
            </details>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-20 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">A faster first pass</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">From “check this site” to a reviewable result.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">CertScore gives Claude a structured way to start the work, while keeping evidence, limitations, and report links visible in the response.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Connect once", "Use the no-auth Light MCP endpoint for the fastest first run."],
              ["02", "Supply your website URL", "Copy the website prompt above, paste it into Claude, then provide the public URL you want to review."],
              ["03", "Review evidence", "Get a bounded result with findings, references, coverage limits, and a report URL."]
            ].map(([number, title, detail]) => (
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6" key={number}>
                <span className="text-sm font-bold text-sky-700">{number}</span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <article className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">Light: start without an account</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">Add a custom remote MCP connector in Claude and paste this endpoint. Light requires no CertScore login or API key and provides low-volume public scans with public reports. Your Claude account must support custom connectors.</p>
              <code className="my-4 block break-all text-sm text-slate-800">{endpoint}</code>
              <CopyMcpValue label="Light endpoint" value={endpoint} />
              <Link className="mt-4 block text-sm font-semibold text-sky-700 underline underline-offset-4" href="/mcp/light">Light tools, workflow, and current limits</Link>
              <a className="mt-3 block text-sm font-semibold text-sky-700 underline underline-offset-4" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude’s custom connector instructions</a>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">Hosted OAuth: connect your workspace</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">Use authenticated access to retrieve reports and previous scans in your authorized CertScore workspace. An eligible account, active workspace membership, and a supported OAuth client are required. Existing access limits apply.</p>
              <Link className="mt-4 inline-block text-sm font-semibold text-sky-700 underline underline-offset-4" href="/developers/mcp#hosted-oauth-start">Set up workspace access</Link>
            </article>
          </div>
        </div>
      </section>

      <section id="next-website" aria-labelledby="next-website-heading" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">After your first report</p>
          <h2 id="next-website-heading" className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Review another client, brand, or vendor website</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">Keep the same conversation so both report links stay at hand. Copy this prompt when you are ready to supply a second website; each report retains its own scope and evidence.</p>
          <p className="my-5 rounded-xl border border-sky-100 bg-white p-5 text-sm leading-7 text-slate-700">{nextWebsitePrompt}</p>
          <CopyMcpValue label="next-website prompt" value={nextWebsitePrompt} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="prompts-heading">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Prompt library</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950" id="prompts-heading">Useful questions to ask Claude</h2>
          </div>
          <Link className="text-sm font-semibold text-sky-700 hover:text-sky-900" href="#connect">Choose your connection route →</Link>
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
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">Connect through Light or your eligible workspace, copy the website prompt, and give Claude the public URL you want to review.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300" href="#first-scan">Copy your first website prompt</Link>
            <a className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10" href="mailto:support@certscore.ai?subject=CertScore.ai%20Claude%20setup">Ask for help</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
