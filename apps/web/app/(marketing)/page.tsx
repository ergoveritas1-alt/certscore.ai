import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ApiReadRatePolicyNotice } from "../../components/api-read-rate-policy-notice";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HomepageHeroCopy, HomepageScanPreferencesProvider } from "../../components/marketing/homepage-scan-preferences";
import { SampleReportButton } from "../../components/marketing/sample-report-button";
import { HomepageFindingsOverview } from "../../components/marketing/homepage-findings-overview";
import { HomepageReviewWorkflows } from "../../components/marketing/homepage-review-workflows";
import { HOMEPAGE_REVIEW_WORKFLOWS } from "../../lib/marketing/homepage-review-workflows";
import { ReleaseCard } from "../../components/releases/release-card";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { getFindingReferenceItems } from "../../lib/marketing/finding-atlas";
import { getPublishedReleases } from "../../lib/releases";
import { absoluteUrl, createPageMetadata, SITE_NAME, SITE_ORGANIZATION_ID, SITE_URL } from "../../lib/seo";

const BOOK_DEMO_URL = "/contact-sales";
const WEBSITE_PRIVACY_DESCRIPTION =
  "CertScore.ai is an evidence-led website privacy scanner for DPOs, developers and web agencies reviewing GDPR/ePrivacy and CCPA concerns. Inspect cookies, trackers, consent behavior and privacy disclosures with retained evidence.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Website Privacy Scanner: Cookies & Consent | CertScore.ai",
    description: WEBSITE_PRIVACY_DESCRIPTION,
    path: "/"
  }),
  title: {
    absolute: "Website Privacy Scanner: Cookies & Consent | CertScore.ai"
  }
};

const personas = [
  {
    title: "Developers validating tracking behavior",
    detail:
      "Inspect cookies, pixels and requests before consent and after eligible Accept or Reject clicks. Use the evidence to review tag triggers, CMP settings and vendor integrations, then retest."
  },
  {
    title: "Web agencies resolving client privacy issues",
    detail:
      "Build recurring website privacy reviews into your client service. Establish a baseline, turn findings into tasks, and share evidence from comparable rescans. Ask about portfolio and white-label options on Custom plans."
  },
  {
    title: "DPOs and privacy teams reviewing website behavior",
    detail:
      "Investigate GDPR/ePrivacy and CCPA concerns with dated evidence. Compare observed vendors and consent behavior with privacy disclosures, coordinate fixes with your agency, and review what changed."
  },
  {
    title: "Teams reviewing third-party websites",
    detail:
      "Assess your sites, partners, and diligence targets with runtime evidence structured for enterprise review workflows."
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
  const latestReleases = getPublishedReleases().slice(0, 3);
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${absoluteUrl("/")}#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    description: WEBSITE_PRIVACY_DESCRIPTION,
    url: absoluteUrl("/"),
    provider: { "@id": SITE_ORGANIZATION_ID }
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
    itemListElement: HOMEPAGE_REVIEW_WORKFLOWS.map((solution, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}${solution.href}`,
      name: solution.title,
      description: solution.description
    }))
  };

  return (
    <HomepageScanPreferencesProvider><main className="min-h-screen overflow-x-clip bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(findingRegistrySchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(scannerSolutionsSchema) }} />
      <SiteHeader />

      <section id="homepage-hero" className="relative isolate overflow-hidden border-b border-sky-500/20 bg-[#020d20] text-white">
        <div className="absolute inset-x-0 -top-10 bottom-0 -z-20" aria-hidden="true">
          <Image alt="" className="object-cover object-[62%_center]" fill priority unoptimized sizes="100vw" src="/marketing/hero/shield-report-compact.png" />
        </div>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(1,10,27,0.06)_0%,rgba(1,10,27,0.02)_48%,rgba(1,10,27,0.12)_100%)]" aria-hidden="true" />
        <div className="relative top-0 mx-auto grid min-h-[620px] max-w-6xl gap-8 px-4 py-10 sm:min-h-[640px] sm:px-6 sm:py-20 lg:-top-5 lg:min-h-[625px] lg:grid-cols-[minmax(0,650px)_minmax(0,1fr)] lg:items-center lg:gap-8 lg:py-16">
          <div className="relative z-20 max-w-[680px] space-y-8 lg:-translate-y-1">
            <p className="text-xs font-semibold leading-6 text-sky-300 sm:text-sm">Evidence-led CCPA &amp; GDPR/ePrivacy review</p>
            <h1 className="text-[2rem] font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.5rem]">
              <span className="block">Website privacy <span className="text-[#178cff]">scanner.</span></span>
              <span className="block sm:whitespace-nowrap">See the evidence.</span>
            </h1>
            <div id="homepage-scan" className="max-w-[650px] scroll-mt-24 pt-6 sm:pt-10">
              <div className="rounded-[1.4rem] border border-sky-300/30 bg-slate-950/35 p-2 shadow-[0_20px_45px_rgba(2,132,199,0.16)] backdrop-blur-sm sm:p-2.5">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">Enter a website URL to start</p>
                <DomainScanForm buttonLabel="Run free scan" inputLabel="Website URL to scan" mode="full" requestSource="homepage" scanSource="homepage" variant="homepage-hero" />
              </div>
              <div className="mt-10 sm:mt-12">
                <HomepageHeroCopy />
              </div>
              <div className="mt-7">
                <SampleReportButton
                  showArrow
                  className="group min-h-12 rounded-xl border border-sky-300/50 bg-sky-500 px-6 font-semibold text-white shadow-[0_8px_24px_rgba(14,165,233,0.16)] hover:bg-sky-400 focus-visible:ring-sky-300"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomepageFindingsOverview />

      <section aria-labelledby="independent-review-heading" className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Independent website review</Badge>
            <h2 id="independent-review-heading" className="text-3xl font-semibold tracking-tight text-slate-950">See what happens before and after a consent choice.</h2>
            <p className="text-sm leading-6 text-slate-600">Give your DPO, developer and agency a shared starting point for investigating website privacy concerns.</p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Card className="border-slate-200 bg-white shadow-none">
              <CardHeader><CardTitle className="text-xl">Your CMP manages choices. CertScore.ai checks observed behavior.</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                <p>Already use a cookie banner or consent management platform? Inspect cookies, trackers and requests before consent and after eligible Accept or Reject clicks. Retained evidence helps your team investigate tag configuration, vendor loading and unexpected activity.</p>
                <Link className="inline-block font-semibold text-sky-700 underline underline-offset-4" href="/guides/reject-consent-tracking-test">Review what happens after Reject</Link>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-none">
              <CardHeader><CardTitle className="text-xl">Public-page reviews. Nothing to install.</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                <p>Start with a public website URL. No site script, SDK installation or code access is needed for a public-page scan. CertScore.ai observes browser behavior from the selected scan origin and retains evidence with clear coverage limits.</p>
                <Link className="inline-block font-semibold text-sky-700 underline underline-offset-4" href="/sample-report">Explore the sample report layout</Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <HomepageReviewWorkflows />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Personas</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who CertScore.ai is built for</h2>
            <p className="text-sm text-slate-600">
              DPOs, developers and web agencies can use the same evidence-led workflow for GDPR/ePrivacy and CCPA reviews: establish a baseline, investigate a finding, assign a fix, and rescan under comparable conditions.
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

      {latestReleases.length > 0 ? (
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge tone="neutral">Product updates</Badge>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Latest from CertScore.ai</h2>
                <p className="text-sm leading-6 text-slate-600">
                  Meaningful product releases, privacy-detection capabilities, integrations, and developer tools.
                </p>
              </div>
              <Link className="text-sm font-semibold text-sky-700 transition hover:text-sky-900" href="/releases">
                View all releases <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {latestReleases.map((release) => <ReleaseCard headingLevel="h3" key={release.slug} release={release} />)}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="overflow-hidden rounded-[1.5rem] bg-[linear-gradient(135deg,#081127_0%,#0b1a3f_45%,#132b63_100%)] px-5 py-8 shadow-[0_24px_60px_rgba(8,17,39,0.24)] sm:rounded-[2.25rem] sm:px-10 sm:py-12">
            <div className="max-w-4xl space-y-6">
              <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Get a clearer read on website privacy diagnostics.
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
                <SampleReportButton
                  className="w-full border border-white/12 bg-white/8 text-white hover:bg-white/12 sm:w-auto"
                  label="See Sample Report"
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <ApiReadRatePolicyNotice className="mb-6" />
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            CertScore.ai provides automated, evidence-based insights into website behavior. It is not legal advice, certification, or a compliance determination.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main></HomepageScanPreferencesProvider>
  );
}
