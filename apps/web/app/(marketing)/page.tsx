import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HomepageFindingsOverview } from "../../components/marketing/homepage-findings-overview";
import { ScannerSolutionAnimation } from "../../components/marketing/scanner-solution-animation";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { getFindingReferenceItems } from "../../lib/marketing/finding-atlas";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const SAMPLE_REPORT_URL = "https://certscore.ai/scan/f20f885d-10d4-4a07-899f-f7ea5a1825d8";
const BOOK_DEMO_URL = "/contact-sales";
export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore.ai — Evidence-Based Website Risk Signal Scanner",
    description:
      "Scan websites to review pre-consent tracking, third-party requests, cookie and storage activity, public policy surfaces, and disclosure-alignment signals.",
    path: "/"
  }),
  title: {
    absolute: "CertScore.ai — Evidence-Based Website Risk Signal Scanner"
  }
};

const personas = [
  {
    title: "Developers validating tracking behavior",
    detail:
      "Run API-driven scans to confirm tags, pixels, cookies, and consent-state behavior without relying on manual QA alone."
  },
  {
    title: "Agencies auditing client or competitor sites",
    detail:
      "Run white-label-ready scans that surface observable website behavior without depending on manual inspection alone."
  },
  {
    title: "Digital policy analysts reviewing public privacy surfaces",
    detail:
      "Review pre-consent cookies, storage, tracking, public disclosures, collection surfaces, and consent-control accessibility without depending on brittle post-choice automation."
  },
  {
    title: "Teams reviewing third-party websites",
    detail:
      "Assess your sites, partners, and diligence targets with runtime evidence structured for enterprise review workflows."
  }
];

const scannerSolutions = [
  {
    href: "/solutions/gdpr-website-compliance-scanner",
    title: "GDPR website scanner",
    description:
      "Review consent, cookie, tracking, policy, and disclosure signals for GDPR/ePrivacy workflows.",
    animation: "trace" as const,
    meta: "GDPR / ePrivacy"
  },
  {
    href: "/solutions/cookie-consent-scanner",
    title: "Cookie consent scanner",
    description:
      "Check cookie timing, CMP behavior, third-party cookies before consent, and reject-path review signals.",
    animation: "waterfall" as const,
    meta: "Consent controls"
  },
  {
    href: "/solutions/privacy-policy-risk-scanner",
    title: "Privacy policy risk scanner",
    description:
      "Compare observable website behavior with privacy, cookie, vendor, and disclosure surfaces.",
    animation: "policy" as const,
    meta: "Policy surfaces"
  }
];

function PersonaIcon({ index }: { index: number }) {
  const toneClassName =
    index === 0
      ? "bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.98)_100%)] ring-slate-200"
      : index === 1 || index === 2
        ? "bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] ring-sky-200"
        : "bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(240,253,244,0.98)_100%)] ring-emerald-200";

  return (
    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ${toneClassName}`}>
      {index === 0 ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-700" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7.5h16" />
          <path d="M7 4.5h10v15H7z" />
          <path d="M10 11h4" />
          <path d="M10 15h4" />
        </svg>
      ) : index === 1 ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-700" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 11.5c0-3.9 3.1-7 7-7s7 3.1 7 7" />
          <path d="M8 11v4" />
          <path d="M16 11v4" />
          <path d="M8 15.5c0 1.7 1.8 3 4 3s4-1.3 4-3" />
        </svg>
      ) : index === 2 ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-700" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5 5 7v5c0 4.2 2.8 7.4 7 8.5 4.2-1.1 7-4.3 7-8.5V7l-7-3.5Z" />
          <path d="m9.5 12 1.7 1.7 3.3-3.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-700" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6.5h8" />
          <path d="M8 10.5h8" />
          <path d="M8 14.5h5" />
          <path d="M6 4.5h12v15H6z" />
        </svg>
      )}
    </span>
  );
}

export default async function MarketingHomePage() {
  const findings = getFindingReferenceItems();
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CertScore.ai",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "CertScore.ai scans public websites for observable tracking, cookie, consent, accessibility, and privacy risk signals."
  };
  const findingRegistrySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CertScore.ai finding reference pages",
    itemListElement: findings.map((finding, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/findings/${finding.id}`,
      name: finding.title,
      identifier: finding.id,
      description: finding.observed
    }))
  };
  const scannerSolutionsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CertScore.ai scanner solution pages",
    itemListElement: scannerSolutions.map((solution, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}${solution.href}`,
      name: solution.title,
      description: solution.description
    }))
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(findingRegistrySchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(scannerSolutionsSchema) }} />
      <SiteHeader />

      <section className="relative isolate overflow-hidden border-b border-sky-500/20 bg-[#020d20] text-white">
        <div className="absolute inset-x-0 -top-10 bottom-0 -z-20" aria-hidden="true">
          <Image alt="" className="object-cover object-[62%_center]" fill priority sizes="100vw" src="/marketing/hero/futuristic-tech-shield-and-network-fast.jpg" />
        </div>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(1,10,27,0.06)_0%,rgba(1,10,27,0.02)_48%,rgba(1,10,27,0.12)_100%)]" aria-hidden="true" />
        <div className="relative -top-5 mx-auto grid min-h-[595px] max-w-6xl gap-12 px-6 py-14 sm:py-20 lg:grid-cols-[minmax(0,650px)_minmax(0,1fr)] lg:items-center lg:gap-8 lg:py-16">
          <div className="relative z-20 max-w-[680px] space-y-8 lg:-translate-y-1">
            <h1 className="text-[2rem] font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.5rem]">
              <span className="block whitespace-nowrap">See what websites <span className="text-[#178cff]">reveal</span></span>
              <span className="block whitespace-nowrap">about privacy risk.</span>
            </h1>
            <div className="max-w-[650px]">
              <p className="text-base leading-8 text-slate-300 sm:text-xl">
                Scan for consent behavior, cookies, trackers, and privacy disclosures with evidence retained behind every finding.
              </p>
              <p className="mt-2 text-sm font-semibold text-sky-400">
                Built for GDPR and ePrivacy review
              </p>
            </div>
            <div id="homepage-scan" className="max-w-[650px] scroll-mt-24 pt-2">
              <DomainScanForm buttonLabel="Scan a website" inputLabel="Website URL to scan" inputPlaceholder="Enter website here:" mode="full" scanSource="homepage" variant="homepage-hero" />
            </div>
            <div className="flex flex-nowrap gap-x-6 overflow-x-auto pb-1 text-sm font-medium text-slate-100">
              <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13px]">
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0 text-sky-500" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9.25" /><path d="m8 12.2 2.5 2.5 5.5-6" />
                </svg>
                7-day trial
              </span>
              <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13px]">
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0 text-sky-500" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="1.25" /><path d="M3 9h18M7 14h3M3.5 3.5l17 17" />
                </svg>
                No credit card
              </span>
              <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13px]">
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0 text-sky-500" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9.25" /><path d="M12 6.8V12l3.4 2.1" />
                </svg>
                Results in ~ 10 to 40s
              </span>
              <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13px]">
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0 text-sky-500" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8.5 7-4 5 4 5" /><path d="m15.5 7 4 5-4 5" /><path d="m13.5 5-3 14" />
                </svg>
                API/SDK/MCP ready
              </span>
            </div>
            <div className="relative flex flex-col gap-3 sm:flex-row">
              <PendingButtonLink
                className="w-full border border-sky-400/50 bg-sky-500 text-white shadow-[0_12px_30px_rgba(14,165,233,0.22)] hover:bg-sky-400 focus-visible:ring-sky-300 sm:w-auto"
                data-analytics-cta-type="sample_report"
                data-analytics-event="hero_sample_report_clicked"
                href={SAMPLE_REPORT_URL}
                idleContent="See sample report"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="w-full border border-slate-500/70 bg-slate-900/45 text-white backdrop-blur-sm hover:border-sky-400/70 hover:bg-slate-800/70 focus-visible:ring-sky-300 sm:w-auto"
                data-analytics-event="hero_book_demo_clicked"
                href={BOOK_DEMO_URL}
                idleContent="Schedule demo"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-center lg:-mr-24 lg:-translate-y-3 lg:justify-end" aria-hidden="true">
            <Image alt="" className="h-auto w-full max-w-[476px] -translate-x-[15px] blur-[0.85px] opacity-[0.51] mix-blend-screen drop-shadow-[0_32px_45px_rgba(0,0,0,0.35)]" height={1190} sizes="(min-width: 1024px) 36vw, 92vw" src="/marketing/hero/scan-report-dashboard-with-privacy-details.jpg" width={1438} />
          </div>
        </div>
      </section>

      <HomepageFindingsOverview findings={findings} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge tone="neutral">Scanner solutions</Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Focused pages for the review workflow you need.
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Start with the scanner category closest to the question: GDPR, cookie consent, or privacy policy risk. Each page explains observable public-web signals for review, not legal conclusions.
              </p>
            </div>
            <Link href="/solutions" className="text-sm font-semibold text-slate-900 transition hover:text-sky-700">
              View all
            </Link>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {scannerSolutions.map((solution) => (
              <Link key={solution.href} href={solution.href} className="group block">
                <article className="h-full">
                  <div className="relative aspect-[340/300] overflow-hidden rounded-lg border border-slate-200 bg-[#0b2340] shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_48px_rgba(15,23,42,0.16)]">
                    <ScannerSolutionAnimation type={solution.animation} />
                  </div>
                  <div className="pt-4">
                    <p className="text-xs font-semibold text-slate-500">{solution.meta}</p>
                    <h3 className="mt-2 text-xl font-semibold leading-tight tracking-tight text-slate-950 group-hover:text-sky-700">
                      {solution.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{solution.description}</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Personas</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who CertScore.ai is built for</h2>
            <p className="text-sm text-slate-600">
              CertScore.ai is most useful for teams that need repeatable evidence about public website behavior.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {personas.map((item, index) => (
              <Card
                key={item.title}
                className={
                  index === 0
                    ? "relative overflow-hidden border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                    : index === 1
                      ? "relative overflow-hidden border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                    : index === 2
                      ? "relative overflow-hidden border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                      : "relative overflow-hidden border border-emerald-100 bg-[linear-gradient(180deg,rgba(249,253,250,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                }
              >
                <CardHeader>
                  <CardTitle className="flex items-start gap-3 text-lg">
                    <PersonaIcon index={index} />
                    <span>{item.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">{item.detail}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="overflow-hidden rounded-[2.25rem] bg-[linear-gradient(135deg,#081127_0%,#0b1a3f_45%,#132b63_100%)] px-6 py-10 shadow-[0_24px_60px_rgba(8,17,39,0.24)] sm:px-10 sm:py-12">
            <div className="max-w-4xl space-y-6">
              <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Get a clearer read on public-facing website signals.
              </h2>
              <p className="max-w-3xl text-lg leading-8 text-slate-300">
                Use CertScore.ai to observe pre-consent website behavior, detect tracking activity, review public policy surfaces, and monitor changes over time.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <PendingButtonLink
                  className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.24)] hover:brightness-[1.04] sm:w-auto"
                  data-analytics-event="hero_book_demo_clicked"
                  href={BOOK_DEMO_URL}
                  idleContent="Schedule demo"
                  pendingContent="Opening..."
                />
                <PendingButtonLink
                  className="w-full border border-white/12 bg-white/8 text-white hover:bg-white/12 sm:w-auto"
                  data-analytics-cta-type="sample_report"
                  data-analytics-event="hero_sample_report_clicked"
                  href={SAMPLE_REPORT_URL}
                  idleContent="See Sample Report"
                  pendingContent="Opening..."
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            CertScore.ai provides automated, evidence-based insights into website behavior. It is not legal advice, certification, or a compliance determination.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
