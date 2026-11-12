import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HowItWorksCarousel } from "../../components/marketing/how-it-works-carousel";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How It Works",
  description:
    "Explore 24 CertScore.ai report highlights: cookies, trackers, consent, GPC, policy excerpts and detailed evidence for GDPR/ePrivacy and CCPA website review.",
  path: "/how-it-works"
});

const steps = [
  {
    title: "Start with a public website",
    description:
      "Run a free browser-based scan to begin your review. Choose the pages and scan options relevant to your next investigation; the walkthrough shows report capabilities across supported scan paths."
  },
  {
    title: "Collect runtime and disclosure evidence",
    description:
      "The scanner reviews runtime behavior, consent interactions, accessibility signals, and relevant public policy and disclosure surfaces in one scan. Where an eligible consent control can be actioned safely, Accept and Reject observations run in separate, clean browser sessions."
  },
  {
    title: "Investigate the finding and assign the fix",
    description:
      "Open the retained evidence and correction steps. A DPO can review disclosures and purposes while a developer or agency investigates consent settings, tag configuration and the affected page elements."
  },
  {
    title: "Retest after changes",
    description:
      "Run a new scan after a fix and review the updated observations against the earlier report. Keep the scan location, page and coverage in view when comparing results with your team or client."
  }
];

function StepBadge({ step, tone }: { step: string; tone: "sky" | "emerald" | "slate" }) {
  const className =
    tone === "sky"
      ? "bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-sky-700 ring-sky-200"
      : tone === "emerald"
        ? "bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(240,253,244,0.98)_100%)] text-emerald-700 ring-emerald-200"
        : "bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.98)_100%)] text-slate-700 ring-slate-200";

  return <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ${className}`}>{step}</span>;
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section id="free-scan" className="scroll-mt-24 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl space-y-4">
          <Badge tone="neutral">Evidence-led Website Privacy Scanner</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Website privacy scanner.<br />See the evidence.</h1>
          <p className="text-lg text-slate-600">
            See how CertScore.ai captures cookies, trackers, session-replay signals, privacy disclosures and consent behavior. Explore 24 report highlights built for developers, DPOs and web agencies reviewing GDPR/ePrivacy and CCPA concerns.
          </p>
          <div className="max-w-[30rem] pt-2">
            <DomainScanForm buttonLabel="Run a free scan" inputLabel="Website domain" mode="preview" />
          </div>
          <p className="text-sm text-slate-600">Start with a free browser-based scan, or explore the report below.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2 text-sm font-semibold text-sky-700">
            <a href="#walkthrough" className="underline underline-offset-4">Explore the 24 highlights ↓</a>
            <Link href="/sample-report" className="underline underline-offset-4">Open an interactive sample report</Link>
          </div>
        </div>
        </div>
      </section>

      <HowItWorksCarousel />
      <section id="forms" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <Badge tone="neutral">Forms &amp; fields</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">See what your website asks visitors to provide</h2>
          <p className="mt-4 text-base leading-8 text-slate-600">Review forms observed on scanned public pages, expand their retained fields, and open verified, masked form crops when screenshot capture succeeds. Use the field review cues alongside supporting privacy findings and your privacy notices to decide what needs investigation.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">Detection, screenshot availability and privacy assessment are separate. The scanner does not fill or submit forms, and incomplete coverage remains visible.</p>
          <Link className="mt-5 inline-block font-semibold text-sky-700 underline" href="/guides/website-form-scanning">Learn how to review forms and screenshots</Link>
        </div>
      </section>

      <section id="choice-paths" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <Badge tone="neutral">Choice paths</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">See what happens before and after a choice</h2>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
            <p>Your CMP manages consent choices. CertScore.ai checks observed website behavior. Where a control is eligible, Accept and Reject each run in a fresh browser session, with their own captured activity and coverage.</p>
            <p>For GDPR/ePrivacy review, inspect non-essential cookies and services observed before consent and after Reject. The report distinguishes the completed click, any consent-state confirmation and the retained observations. A cookie snapshot shows retained presence; request evidence supplies the activity and timing it actually captured.</p>
            <p>For CCPA review, inspect GPC delivery and response evidence, sale/sharing choices, collection notices and rights disclosures. A cookie Reject action and a sale/sharing opt-out are separate review questions.</p>
            <p>Unsupported controls and incomplete observations remain visible, so teams can identify what still needs manual investigation.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 lg:grid-cols-2">
          {steps.map((step, index) => (
            <Card key={step.title} className="relative overflow-hidden border-slate-200 bg-white shadow-none">
              <div
                aria-hidden="true"
                className={
                  index === 0
                    ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]"
                    : index === 1
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.18)_0%,rgba(124,207,121,0.28)_100%)]"
                      : index === 2
                        ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(148,163,184,0.22)_0%,rgba(226,232,240,0.4)_100%)]"
                        : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.14)_0%,rgba(71,181,74,0.18)_100%)]"
                }
              />
              <CardHeader className="space-y-0 px-5 pb-2 pt-4">
                <CardTitle className="flex items-start gap-3 text-lg leading-tight">
                  <StepBadge step={String(index + 1)} tone={index === 0 ? "sky" : index === 1 ? "emerald" : "slate"} />
                  <span className="pt-0.5">{step.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-0 text-sm leading-6 text-slate-600">{step.description}</CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-sky-700">
          <Link href="/guides/detect-tracking-before-consent" className="hover:text-sky-800">
            Detect tracking before consent
          </Link>
          <Link href="/guides/reject-consent-tracking-test" className="hover:text-sky-800">
            Reject consent tracking test
          </Link>
          <Link href="/compare/privacy-scanner-vs-cookie-scanner" className="hover:text-sky-800">
            Privacy scanner vs cookie scanner
          </Link>
          <Link href="/methodology" className="hover:text-sky-800">
            CertScore.ai methodology
          </Link>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-2">
          <div>
            <Badge tone="neutral">For DPOs &amp; web agencies</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Make the next review more concrete</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Use retained requests, policy passages and consent observations to brief the people who can investigate and fix the website. Support both a GDPR/ePrivacy review workflow and a CCPA review workflow, with accessibility and connection evidence alongside them.</p>
            <Link href="/contact-sales" className="mt-5 inline-block font-semibold text-sky-700 underline underline-offset-4">Discuss your agency or team workflow</Link>
          </div>
          <div>
            <Badge tone="neutral">For agents &amp; developers</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Bring scan evidence into your tools</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Connect an AI agent through MCP, integrate scans through the API, or build with the TypeScript SDK. Use structured results and supported evidence retrieval to bring website privacy review into your own workflow.</p>
            <div className="mt-5 flex flex-wrap gap-5 font-semibold text-sky-700">
              <Link href="/developers/mcp" className="underline underline-offset-4">MCP for agents</Link>
              <Link href="/developers/quickstart" className="underline underline-offset-4">API quickstart</Link>
              <Link href="/developers/sdk" className="underline underline-offset-4">TypeScript SDK</Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
