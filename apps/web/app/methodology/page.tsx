import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MethodologyFeatureTour } from "../../components/marketing/methodology-feature-tour";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata, createPublicArticleSchema } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  description:
    "Learn how CertScore.ai uses browser-based observation, retained evidence, defined measurements, and repeatability checks to review public website privacy signals.",
  path: "/methodology",
  title: "Browser-Based Website Measurement Methodology"
});

const measurementAreas = [
  { title: "CMP detection", description: "Identify observed consent-management platforms and the consent interface presented during the visit." },
  { title: "Consent controls", description: "Inspect first-layer Accept, Reject, and Options visibility, with explicit limits when inspection is incomplete." },
  { title: "After Accept & Reject", description: "Review requests and storage after eligible actions, when available. Click completion and consent confirmation remain separate." },
  { title: "Cookies & browser storage", description: "Inspect retained cookies and storage, their purposes, ownership, and when they first appeared." },
  { title: "Services & network requests", description: "Explore vendors, service relationships, request destinations, and observed activity before consent." },
  { title: "Global Privacy Control", description: "Review the GPC observation path, verified signal delivery, and supported comparisons with the passive baseline." },
  { title: "TLS & transport security", description: "Check retained HTTPS, SSL/TLS certificate, redirect, mixed-content, and form-transport observations." },
  { title: "Forms & fields", description: "Review form types, field labels, required states, and checkboxes. View masked form captures when available." },
  { title: "Hidden outbound links", description: "Inspect retained links hidden by off-screen or zero-size styling, their destinations, and affected pages. Human review establishes context." },
  { title: "Policies & disclosures", description: "Review discovered privacy and cookie-policy surfaces, supported transparency observations, and retained excerpts where available." },
  { title: "Embeds & tracking techniques", description: "Review embedded frames and services, plus supported session-replay and fingerprinting signals." },
  { title: "Timing & geographic context", description: "Follow the page event timeline and review scan location, coverage, and timing to interpret each observation." }
];

const observationSteps = [
  { title: "Observe", description: "Visit a public website in an instrumented browser under defined test conditions." },
  { title: "Retain", description: "Capture technical evidence with timestamps, location, and observation context." },
  { title: "Review", description: "Explore supported findings and their evidence in a report your team can inspect." }
];

const definitions = [
  {
    term: "Pre-consent cookie",
    definition: "A cookie observed before the scanner records a visitor consent choice."
  },
  {
    term: "Tracker detection",
    definition: "A grouped technology observation supported by browser, network, cookie, storage, script, or related runtime evidence."
  },
  {
    term: "Advertising & Measurement",
    definition: "A functional category for technologies associated with advertising, advertising measurement, or audience measurement."
  },
  {
    term: "CMP observation",
    definition: "Evidence that a consent-management platform or consent interface was present during the tested visit."
  },
  {
    term: "Policy surface",
    definition: "A public page or document that presents privacy, cookie, consent, or related disclosure information."
  },
  {
    term: "Confirmed interaction",
    definition: "Evidence that a consent action produced a verified state transition, established independently of the click itself. Required before activity qualifies on the Reject Path."
  },
  {
    term: "Confirmed clean",
    definition: "No qualifying activity was retained during a completed observation window. A bounded statement about one observation, not a general claim about the site."
  },
  {
    term: "Limited coverage",
    definition: "An observation that was unavailable, unsupported, unsuccessful, stale, timed out, or unverifiable. It is explicit, score-neutral, and never equivalent to a clean result."
  },
  {
    term: "Score-neutral comparison",
    definition: "Evidence retained for interpretation rather than scoring, including the Accept Path baseline, unchanged stored values on their own, and every limited-coverage state."
  }
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(createPublicArticleSchema({
        title: "Real browser behavior. Evidence you can review.",
        description: "See cookies, services, privacy signals, and supporting evidence together in one browser-based website report.",
        path: "/methodology",
        type: "TechArticle"
      })) }} />
      <SiteHeader />

      <section className="relative isolate border-b border-sky-900 bg-[#071b32] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.2),transparent_65%)]" />
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">The CertScore.ai methodology</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Real browser behavior.<br /><span className="text-sky-300">Evidence you can review.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              What loads before consent? What happens after Reject? See cookies, services, privacy signals, and supporting evidence together in one browser-based website report.
            </p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              Each finding describes evidence observed during a visit to a public website. Read it with the report&apos;s scan time, region, and coverage; it is a point-in-time observation, not a legal determination or certification.
            </p>
            <div id="free-scan" className="[&_button[type=submit]]:!bg-sky-600 [&_button[type=submit]]:!bg-none [&_button[type=submit]]:!opacity-100 [&_button[type=submit]:hover]:!bg-sky-500 mt-8 scroll-mt-28 rounded-2xl border border-sky-300/25 bg-white/[0.05] p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">See the methodology in action. Start a free scan.</h2>
              <Suspense fallback={<p className="text-sm text-sky-200">Loading scan form…</p>}>
                <DomainScanForm buttonLabel="Run free scan" inputLabel="Website URL to scan" mode="full" scanSource="unknown" variant="homepage-hero" />
              </Suspense>
              <p className="mt-3 text-xs leading-5 text-slate-300">No credit card required. Public websites only. Existing scan allowances apply.</p>
            </div>
            <Link href="/sample-report" className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-sky-200 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
              Explore a sample report <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">From website to evidence</p>
            <ol className="mt-7">
              {observationSteps.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0">
                  {index < observationSteps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-5 top-11 w-px bg-sky-300/25" />}
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-300/10 font-mono text-sm text-sky-200">0{index + 1}</span>
                  <div className="pt-1">
                    <h2 className="text-xl font-semibold">{step.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <nav aria-label="Methodology sections" className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-7 gap-y-1 px-6 py-3 text-sm font-medium text-slate-600">
          {[["#feature-tour", "Explore the report"], ["#measurements", "What we measure"], ["#consent", "Accept & Reject"], ["#evidence", "Evidence & scope"], ["#definitions", "Key terms"]].map(([href, label]) => (
            <a key={href} href={href} className="py-2 underline-offset-4 hover:text-sky-700 hover:underline">{label}</a>
          ))}
        </div>
      </nav>

      <MethodologyFeatureTour />

      <section id="measurements" aria-labelledby="measurements-heading" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-14 sm:py-20">
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">What we measure</p>
            <h2 id="measurements-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">One visit. A detailed view of your website.</h2>
          </div>
          <p className="max-w-lg text-base leading-7 text-slate-600">Each scan captures observable technical signals under defined conditions. Every result belongs to that visit and its coverage.</p>
        </div>
        <div className="mt-9 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {measurementAreas.map((area, index) => (
            <div key={area.title} className="border-t border-slate-200 py-6">
              <span aria-hidden="true" className="font-mono text-xs text-sky-700">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-lg font-semibold text-slate-950">{area.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{area.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-3">
          <div><h3 className="font-semibold text-slate-950">Share the evidence</h3><p className="mt-2 text-sm leading-6 text-slate-600">Use report sharing and evidence exports to give your team a concrete starting point.</p><Link href="/sample-report" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline">Explore a sample report →</Link></div>
          <div><h3 className="font-semibold text-slate-950">Expand your review</h3><p className="mt-2 text-sm leading-6 text-slate-600">Explore full-site scanning and monitoring within your plan’s access and crawl limits.</p><Link href="/pricing" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline">Compare plans →</Link></div>
          <div><h3 className="font-semibold text-slate-950">Bring it into your workflow</h3><p className="mt-2 text-sm leading-6 text-slate-600">API, MCP, and browser-extension options support additional workflows. Start your free website scan here.</p><Link href="/developers" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline">Explore integrations →</Link></div>
        </div>
      </section>

      <section id="consent" aria-labelledby="consent-heading" className="scroll-mt-24 border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Separate sessions. Distinct observations.</p>
          <h2 id="consent-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">What happens after Accept or Reject?</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">Eligible controls are observed in separate, clean browser sessions. A completed click, a completed observation, and a confirmed consent decision remain separate facts.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-sky-200 bg-white p-6 sm:p-8">
              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">Accept Path</span>
              <h3 className="mt-4 text-xl font-semibold text-slate-950">A baseline for comparison</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">The Accept Path provides a score-neutral baseline for consent-dependent activity. The click itself does not establish that consent was registered; a verified state transition is a separate observation.</p>
            </article>
            <article className="rounded-2xl border border-teal-200 bg-white p-6 sm:p-8">
              <span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Reject Path</span>
              <h3 className="mt-4 text-xl font-semibold text-slate-950">Evidence after a verified refusal</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">The confirmed-refusal path requires an independently verified refusal-state transition and qualifying activity anchored after it. Requests already in flight at confirmation are excluded.</p>
            </article>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h3 className="text-base font-semibold text-slate-950">Reject-click tracking is a separate review signal</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">A completed authorized Reject click with directly observed, verified analytics, advertising, or session-replay requests may support a Reject-click tracking review signal even when registration is unverified. An unchanged stored cookie alone does not prove active tracking.</p>
          </div>
          <p className="mt-6 border-l-2 border-sky-500 pl-4 text-sm leading-7 text-slate-600">Unsupported, ambiguous, incomplete, stale, timed-out, or unverifiable interactions remain limited coverage. Missing evidence cannot become a clean result or a finding.</p>
        </div>
      </section>

      <section id="evidence" aria-labelledby="evidence-heading" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Evidence & scope</p>
            <h2 id="evidence-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Understand the finding.<br />Know its limits.</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">Findings are tied to retained observations. A score summarizes supported findings; it does not replace the evidence behind them.</p>
            <div className="mt-6 rounded-2xl bg-sky-50 p-5 text-sm leading-6 text-slate-700">CertScore is not a certification service. It records website behavior and evidence for review, not legal compliance determinations.</div>
          </div>
          <div className="space-y-7">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Retained context</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">Evidence may include cookies, network and runtime records, tracker or vendor observations, consent interfaces, policy surfaces, timestamps, and geographic context, so reported findings can be reviewed and audited.</p>
            </div>
            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Geographic measurement</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">Websites may return different content, consent interfaces, cookies, or third-party activity by location. CertScore can observe the same website from different locations while keeping its core measurement approach consistent.</p>
            </div>
            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Validation and repeatability</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">The measurement approach is evaluated through defined manual-validation studies and repeated browser observations. Each study describes its own sample and conditions, rather than a universal accuracy claim.</p>
            </div>
            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Technical observations, bounded conclusions</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">CertScore measures observable technical states and runtime outcomes for privacy engineering and assurance. Legal compliance, processing purpose, and operator intent may require additional context.</p>
              <Link className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline" href="/guides/consent-report-example">Read an annotated retained report →</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="definitions" aria-labelledby="definitions-heading" className="scroll-mt-24 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">The measurement glossary</p>
          <h2 id="definitions-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Clear terms. Shared understanding.</h2>
          <dl className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {definitions.map((item) => (
              <div key={item.term} className="grid gap-2 border-b border-slate-100 px-5 py-5 last:border-b-0 sm:grid-cols-[13rem_1fr] sm:gap-8 sm:px-7">
                <dt className="text-sm font-semibold text-slate-950">{item.term}</dt>
                <dd className="text-sm leading-6 text-slate-600">{item.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-sky-100 bg-sky-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">See what your website reveals.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Start with a free scan. Review the observations and their evidence.</p>
          </div>
          <a href="#free-scan" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-xl bg-sky-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700">Run a free scan <span aria-hidden="true">↑</span></a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
