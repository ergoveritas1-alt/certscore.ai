import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { CopyMcpValue } from "../../components/developers/mcp-light-actions";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { absoluteUrl, createPageMetadata, createPublicWebPageSchema } from "../../lib/seo";
import { museGuide as guide } from "./content";

const pageMetadata = createPageMetadata({
  title: "Website Privacy Scans in Muse",
  description: guide.description,
  path: "/muse",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  socialImage: {
    path: "/images/social/website-privacy-scanner.png",
    alt: "CertScore.ai website privacy scanner",
    width: 1200,
    height: 630
  }
});

export const metadata: Metadata = {
  ...pageMetadata,
  alternates: { ...pageMetadata.alternates, types: { "text/markdown": absoluteUrl("/muse.md") } }
};

const schemas = [
  {
    ...createPublicWebPageSchema({ title: guide.title, description: guide.description, path: "/muse" }),
    "@id": absoluteUrl("/muse#webpage"),
    inLanguage: "en",
    mainEntity: { "@id": absoluteUrl("/muse#howto") }
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": absoluteUrl("/muse#howto"),
    name: "Use CertScore.ai in Muse",
    description: guide.intro,
    inLanguage: "en",
    url: absoluteUrl("/muse#first-use"),
    step: [
      { "@type": "HowToStep", position: 1, name: "Save the Muse skill", text: guide.skillInstallSteps.join(" "), url: absoluteUrl("/muse#save-a-skill") },
      ...guide.scanSteps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 2,
        name: step.name,
        text: step.text,
        url: absoluteUrl(`/muse#scan-step-${index + 1}`)
      }))
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": absoluteUrl("/muse#faq"),
    mainEntity: guide.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } }))
  }
];

const sectionTitle = "text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl";
const linkClass = "font-semibold text-sky-700 underline underline-offset-4 hover:text-sky-900";
const anchorClass = "scroll-mt-28";

export default function MusePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <article className="mx-auto max-w-5xl px-6 py-16 [overflow-wrap:anywhere]">
        {schemas.map((schema) => <script key={schema["@type"]} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />)}
        <header className="space-y-6">
          <div className="flex flex-wrap gap-2"><Badge tone="info">MCP Light</Badge><Badge>No account or API key</Badge><Badge>Free within daily limits</Badge></div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900">{guide.title}</h1>
          <p className="max-w-3xl text-lg leading-8 text-slate-600">{guide.intro}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold" role="group" aria-label="Muse connects to MCP Light to retrieve a report">
            <span className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-slate-800">Muse</span>
            <span aria-hidden="true" className="text-xl text-sky-600">→</span>
            <span className="rounded-xl bg-sky-700 px-5 py-3 text-white">CertScore.ai MCP Light</span>
            <span aria-hidden="true" className="text-xl text-sky-600">→</span>
            <span className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-slate-800">Score + findings + evidence</span>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{guide.overview}</p>
          <p className="max-w-3xl text-xs leading-6 text-slate-500">{guide.legal}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a className="rounded-md bg-sky-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-800" href={guide.skillDownloadPath} download>Download the Muse skill <span aria-hidden="true">↓</span></a>
            <Link className={linkClass + " text-sm"} href="#first-use">Try a first scan</Link>
          </div>
          <p className="text-sm text-slate-500">{guide.skillVersion} · <a className={linkClass} href={guide.limitsUrl}>Usage limits</a> · <Link className={linkClass} href="/muse.md">Agent-readable guide</Link></p>
        </header>

        <nav aria-label="On this page" className="my-10 flex flex-wrap gap-x-5 gap-y-3 border-y border-slate-200 py-4 text-sm">
          {[["#save-a-skill", "Install the skill"], ["#first-use", "First scan"], ["#go-deeper", "Explore a report"], ["#repeat-use", "Recheck a fix"], ["#connection", "For agents"], ["#faq", "Questions"]].map(([href, label]) => <a className={linkClass} href={href} key={href}>{label}</a>)}
        </nav>

        <div className="space-y-12">
          <section id="save-a-skill" aria-labelledby="skill-title" className={anchorClass}>
            <Card className="border-sky-200 bg-white">
              <CardHeader><h2 id="skill-title" className="text-2xl font-semibold tracking-tight text-slate-900">Start with the Muse skill</h2></CardHeader>
              <CardContent className="space-y-5 text-sm leading-7 text-slate-600">
                <p>{guide.skill}</p>
                <div>
                  <a href={guide.skillDownloadPath} download className="inline-flex items-center gap-3 rounded-md bg-sky-700 px-5 py-3 font-semibold text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700"><span aria-hidden="true">↓</span>{guide.skillDownloadLabel}<span className="rounded bg-white/15 px-2 text-xs">ZIP</span></a>
                  <p className="mt-2 text-xs text-slate-500">{guide.skillVersion}</p>
                </div>
                <ol className="grid gap-4 sm:grid-cols-3" aria-label="Save the skill in Muse">
                  {guide.skillInstallSteps.map((step, index) => <li key={step} className="rounded-xl bg-sky-50 p-4"><span aria-hidden="true" className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-sky-800">{index + 1}</span>{step}</li>)}
                </ol>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><p className="font-semibold text-slate-900">After attaching the ZIP, ask Muse</p><CopyMcpValue label="skill installation prompt" value={guide.skillInstallPrompt} /></div>
                  <p>{guide.skillInstallPrompt}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="when-to-scan" aria-labelledby="when-title" className={anchorClass}>
            <h2 id="when-title" className={sectionTitle}>When to use CertScore.ai</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {guide.useCases.map(([label, text], index) => <li key={label} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-semibold text-sky-800">{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold text-slate-900">{label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></li>)}
            </ul>
            <p className="mb-3 mt-6 text-sm font-semibold text-slate-900">Ask Muse</p>
            <ul className="flex flex-wrap gap-2">{guide.examples.map((text) => <li key={text} className="rounded-2xl rounded-bl-sm border border-sky-100 bg-sky-50 px-4 py-2 text-sm text-sky-900">“{text}”</li>)}</ul>
          </section>

          <section id="first-use" aria-labelledby="first-use-title" className={anchorClass + " space-y-8"}>
            <h2 id="first-use-title" className={sectionTitle}>Ask for your first review</h2>
            <p className="text-sm leading-7 text-slate-600">With the skill saved, paste this into Muse. Try the public test page below, or replace it with a website you want to review.</p>
            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer font-semibold text-slate-900">Already use native MCP connectors? Connect directly</summary>
            <Card className="mt-5 border-0 shadow-none">
              <CardHeader><div className="flex items-center gap-3"><Badge tone="info">MCP</Badge><h3 id="connect" className={anchorClass + " text-xl font-semibold tracking-tight text-slate-900"}>Connect Muse</h3></div></CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
                <p>{guide.connectIntro}</p>
                <div className="rounded-2xl bg-slate-950 p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-sky-300">Paste into Muse</span><CopyMcpValue label="setup prompt" value={guide.connectPrompt} /></div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-slate-100"><code>{guide.connectPrompt}</code></pre>
                </div>
                <p>{guide.agentConnect}</p>
              </CardContent>
            </Card>
            </details>
            <Card className="border-slate-200 bg-white">
              <CardHeader><div className="flex items-center gap-3"><Badge tone="info">→</Badge><h3 id="ask-for-scan" className={anchorClass + " text-xl font-semibold tracking-tight text-slate-900"}>Ask for a scan</h3></div></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl rounded-bl-sm border border-sky-100 bg-sky-50 p-5"><p className="text-sm leading-7 text-sky-950">{guide.firstAsk}</p></div>
                <CopyMcpValue label="example scan prompt" value={guide.firstAsk} />
              </CardContent>
            </Card>
            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer font-semibold text-slate-900">For agents: the four-tool workflow</summary>
              <ol className="mt-5 grid gap-4 sm:grid-cols-2">
                {guide.scanSteps.map((step, index) => <li id={`scan-step-${index + 1}`} className={anchorClass + " rounded-2xl border border-slate-200 bg-white p-5"} key={step.tool}>
                  <div className="mb-4 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-700 text-sm font-semibold text-white">{index + 1}</span><span aria-hidden="true" className="text-2xl text-sky-600">{index === guide.scanSteps.length - 1 ? "✓" : "→"}</span></div>
                  <h4 className="font-semibold text-slate-900">{step.name}</h4><code className="mt-2 block font-mono text-xs leading-5 text-sky-800">{step.tool}</code><p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
                </li>)}
              </ol>
              <p className="mt-4 text-sm leading-7 text-slate-600">{guide.reuse}</p>
            </details>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Share the results</h3>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">{guide.reportItems.map(([label, text]) => <div key={label} className="rounded-xl border-l-4 border-sky-500 bg-white p-5"><dt className="font-semibold text-slate-900">{label}</dt><dd className="mt-2 text-sm leading-6 text-slate-600">{text}</dd></div>)}</dl>
              <p className="mt-4 text-sm leading-7 text-slate-600">{guide.reportRule}</p>
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{guide.rateLimit}</p>
            </div>
          </section>

          <section id="go-deeper" aria-labelledby="deeper-title" className={anchorClass}>
            <h2 id="deeper-title" className={sectionTitle}>Get more from the same scan</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{guide.followUpIntro}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">{guide.followUps.map(({ label, copyLabel, text, prompt }) => <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5" key={label}><Badge>Same scan</Badge><h3 className="mt-3 font-semibold text-slate-900">{label}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p><p className="my-4 rounded-xl bg-sky-50 p-3 text-sm leading-6 text-sky-950">“{prompt}”</p><div className="mt-auto"><CopyMcpValue label={copyLabel} value={prompt} /></div></div>)}</div>
          </section>

          <section id="repeat-use" aria-labelledby="repeat-title" className={anchorClass + " space-y-7"}>
            <h2 id="repeat-title" className={sectionTitle}>Use CertScore.ai after the first scan</h2>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Recheck after changes</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{guide.recheckIntro}</p>
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
                <ol className="grid gap-5 sm:grid-cols-4" aria-label="Scan, make changes, recheck, compare">
                  {guide.recheckFlow.map(([label, text], index) => <li className="relative" key={label}><p className="flex items-center gap-2 font-semibold text-sky-950"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs text-sky-800">{index + 1}</span>{label}</p><p className="mt-2 text-xs leading-6 text-sky-900">{text}</p></li>)}
                </ol>
              </div>
              <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-600">{guide.recheckSteps.map((step) => <li key={step}>{step}</li>)}</ol>
              <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5"><p className="mb-3 text-sm font-semibold text-sky-950">When the fix is live, ask Muse</p><p className="mb-4 text-sm leading-7 text-sky-950">{guide.recheckPrompt}</p><CopyMcpValue label="recheck prompt" value={guide.recheckPrompt} /></div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">When to scan again</h3>
              <dl className="mt-5 divide-y divide-slate-200">{guide.repeatPatterns.map(([label, text]) => <div className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]" key={label}><dt className="text-sm font-semibold text-slate-900">{label}</dt><dd className="text-sm leading-7 text-slate-600">{text}</dd></div>)}</dl>
              <p className="mt-4 text-sm leading-7 text-slate-600">{guide.scanPermission}</p>
            </div>
            <Card className="border-slate-200 bg-white"><CardHeader><h3 className="text-xl font-semibold tracking-tight text-slate-900">Connect to a workspace with Hosted MCP OAuth</h3></CardHeader><CardContent className="space-y-4 text-sm leading-7 text-slate-600"><p>{guide.oauth}</p><a href={guide.oauthUrl} className={linkClass}>Hosted MCP OAuth setup guide <span aria-hidden="true">→</span></a></CardContent></Card>
          </section>

          <section id="connection" aria-labelledby="connection-title" className={anchorClass}>
            <Card className="overflow-hidden border-slate-200 bg-white">
              <CardHeader><CardTitle id="connection-title">Connection details</CardTitle></CardHeader>
              <CardContent className="space-y-6 text-sm leading-6">
                <div className="rounded-2xl bg-slate-950 p-5 text-slate-100 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Remote MCP endpoint</p><CopyMcpValue label="endpoint" value={guide.endpoint} /></div>
                  <code className="block break-all text-base sm:text-lg">{guide.endpoint}</code>
                </div>
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {guide.details.map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-900">{label}</dt><dd className="mt-1 text-slate-600">{value}</dd></div>)}
                </dl>
                <p className="text-slate-600">Current limits: <a className={linkClass} href={guide.limitsUrl}>{guide.limitsUrl}</a></p>
                <div className="border-t border-slate-100 pt-5"><p className="mb-3 font-semibold text-slate-900">Four tools</p><ul className="grid gap-2 sm:grid-cols-2">{guide.scanSteps.map((step, index) => <li key={step.tool}><a href={`#scan-step-${index + 1}`} className="block rounded-lg bg-slate-50 p-3 font-mono text-xs text-sky-800 underline underline-offset-4">{step.tool}</a></li>)}</ul></div>
              </CardContent>
            </Card>
          </section>

          <section id="faq" aria-labelledby="faq-title" className={anchorClass}>
            <h2 className={sectionTitle} id="faq-title">Questions about CertScore.ai in Muse</h2>
            <dl className="mt-6 divide-y divide-slate-200">{guide.faqs.map(([question, answer]) => <div className="py-5" key={question}><dt className="font-semibold text-slate-900">{question}</dt><dd className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{answer}</dd></div>)}</dl>
          </section>

          <section id="quick-reference" aria-labelledby="quick-reference-title" className={anchorClass}>
            <h2 className={sectionTitle} id="quick-reference-title">Quick reference</h2>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">{guide.quickReference.map(([label, text]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><dt className="font-semibold text-slate-900">{label}</dt><dd className="mt-2 text-sm leading-7 text-slate-600">{text}</dd></div>)}</dl>
          </section>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
