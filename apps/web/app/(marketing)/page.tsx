import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HomepageFindingsOverview } from "../../components/marketing/homepage-findings-overview";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { DEMO_PATH } from "../../lib/marketing/demo-url";
import { createHomepageFindingSummaries } from "../../lib/marketing/homepage-finding-summary";
import { getFindingReferenceItems } from "../../lib/marketing/finding-atlas";
import { createPageMetadata, SITE_NAME, SITE_URL } from "../../lib/seo";

const SAMPLE_REPORT_URL = "https://certscore.ai/scan/bc6e4dfa-8a25-43f8-822d-a10e89950799";
const HOMEPAGE_LEGAL_POSTURE = "It is not legal advice, certification, or a compliance determination.";
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
    artifact: "API / CI integration",
    title: "Catch tag regressions before release",
    detail:
      "Run repeatable scans in CI or before launch to see whether pixels, cookies, or consent controls changed before a release ships. Keep the API response and evidence timeline with the ticket."
  },
  {
    artifact: "White-label PDF",
    title: "Turn audits into client-ready evidence",
    detail:
      "Benchmark a prospect, compare competitors, or package a client review with screenshots, policy surfaces, and retained observations."
  },
  {
    artifact: "Evidence timeline",
    title: "Compare policy language to observed behavior",
    detail:
      "Review a site's published privacy language against observed pre-consent activity and cite retained evidence when a row needs follow-up."
  },
  {
    artifact: "Change monitoring",
    title: "Screen vendors with repeatable scans",
    detail:
      "Evaluate a vendor, publisher, or diligence target with timestamped scans that can be rerun as the site changes."
  }
];

const scannerSolutions = [
  {
    href: "/solutions/gdpr-website-compliance-scanner",
    title: "GDPR website scanner",
    description:
      "Review consent, cookie, tracking, policy, and disclosure signals for GDPR/ePrivacy workflows."
  },
  {
    href: "/solutions/cookie-consent-scanner",
    title: "Cookie consent scanner",
    description:
      "Check cookie timing, CMP behavior, third-party cookies before consent, and reject-path review signals."
  },
  {
    href: "/solutions/privacy-policy-risk-scanner",
    title: "Privacy policy risk scanner",
    description:
      "Compare observable website behavior with privacy, cookie, vendor, and disclosure surfaces."
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
  const findingReferenceItems = getFindingReferenceItems();
  const findings = createHomepageFindingSummaries(findingReferenceItems);
  const findingsCtaLabel = "See what a scan checks";
  const homepageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${SITE_URL}#organization`,
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/certscore-header-logo.png`
      },
      {
        "@id": `${SITE_URL}#website`,
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
        description: metadata.description,
        publisher: { "@id": `${SITE_URL}#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/scan?domain={domain}`
          },
          "query-input": "required name=domain"
        }
      },
      {
        "@id": `${SITE_URL}#software`,
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          `CertScore.ai scans public websites for evidence-based public website signals including pre-consent tracking, cookies, consent surfaces, accessibility, privacy, and disclosure review. ${HOMEPAGE_LEGAL_POSTURE}`,
        publisher: { "@id": `${SITE_URL}#organization` }
      },
      {
        "@id": `${SITE_URL}/findings#item-list`,
        "@type": "ItemList",
        name: "CertScore.ai finding reference pages",
        itemListElement: findings.map((finding, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/findings/${finding.id}`,
          name: finding.title,
          identifier: finding.id,
          description: finding.overview
        }))
      },
      {
        "@id": `${SITE_URL}/solutions#item-list`,
        "@type": "ItemList",
        name: "CertScore.ai scanner solution pages",
        itemListElement: scannerSolutions.map((solution, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}${solution.href}`,
          name: solution.title,
          description: solution.description
        }))
      }
    ]
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }} />
      <SiteHeader includeBaseStructuredData={false} />

      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.72)_24%,rgba(238,242,255,0.88)_58%,rgba(244,246,255,0.98)_100%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <h1
              className="max-w-3xl pb-2 bg-clip-text text-4xl font-semibold leading-[1.08] tracking-normal text-transparent sm:text-5xl sm:leading-[1.04] lg:text-6xl"
              style={{
                backgroundImage: "linear-gradient(180deg, #020617 0%, #0f172a 24%, #334155 62%, #94a3b8 100%)"
              }}
            >
              See how websites handle privacy, consent, tracking, and disclosure.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Evidence based analysis of pre-consent tracking, consent surfaces, cookie activity, transport security, and disclosure inconsistencies. Mapped to GDPR/ePrivacy.
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#2563eb_0%,#0f8bd7_100%)] text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] hover:brightness-[1.05] focus-visible:ring-sky-500 sm:w-auto"
                data-analytics-event="hero_book_demo_clicked"
                href={DEMO_PATH}
                idleContent="Schedule demo"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="w-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 sm:w-auto"
                data-analytics-cta-type="findings"
                data-analytics-event="hero_see_scan_checks_clicked"
                href="/findings"
                idleContent={findingsCtaLabel}
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <p className="max-w-2xl text-xs leading-5 text-slate-500">
              Built for policy analysts, developers,{" "}
              <Link href="/developers/mcp" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-sky-700">
                AI agents using MCP
              </Link>
              , and agency/enterprise teams managing regulatory compliance workflows, API integrations, and structured privacy-risk signals.
            </p>
          </div>

          <div className="space-y-4">
            <Card id="homepage-scan" className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle className="text-[1.625rem] leading-tight">Scan any website.</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DomainScanForm
                  buttonLabel="Scan a website"
                  inputLabel="Website to analyze"
                  inputPlaceholder="Enter website here"
                  mode="full"
                  sampleDomains={["caltech.edu", "nbcnews.com", "latimes.com", "nvidia.com"]}
                  scanSource="homepage"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <HomepageFindingsOverview findings={findings} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Scanner solutions</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Focused pages for the review workflow you need.
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              Start with the scanner category closest to the question: GDPR, cookie consent, or privacy policy risk. Each page explains observable public-web signals for review, not legal conclusions.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {scannerSolutions.map((solution) => (
              <Link key={solution.href} href={solution.href} className="group block">
                <Card className="h-full border-slate-200 bg-slate-50 shadow-none transition group-hover:border-sky-200 group-hover:bg-white group-hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                  <CardHeader>
                    <CardTitle className="text-xl text-slate-950">{solution.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7 text-slate-600">{solution.description}</p>
                  </CardContent>
                </Card>
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
                <CardContent className="space-y-4 text-sm text-slate-600">
                  <p>{item.detail}</p>
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.artifact}
                  </span>
                </CardContent>
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
                  href={DEMO_PATH}
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
