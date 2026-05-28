import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HomepageFindingsOverview } from "../../components/marketing/homepage-findings-overview";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { getFindingReferenceItems } from "../../lib/marketing/finding-atlas";
import { getCertScoreGptUrl } from "../../lib/marketing/certscore-gpt";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const SAMPLE_REPORT_URL = "https://certscore.ai/scan/bc6e4dfa-8a25-43f8-822d-a10e89950799";
export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore.ai — Evidence-Based Website Risk Signal Scanner",
    description:
      "Scan websites to review pre-consent tracking, third-party requests, cookie activity, consent behavior, and policy-runtime consistency signals.",
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
    title: "Operators verifying consent flows",
    detail:
      "Review when cookies and trackers appear in milliseconds, including whether they load pre-consent or change after accept/reject choices."
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
  const certscoreGptUrl = getCertScoreGptUrl();
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
    name: "CertScore finding reference pages",
    itemListElement: findings.map((finding, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/findings/${finding.id}`,
      name: finding.title,
      identifier: finding.id,
      description: finding.observed
    }))
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(findingRegistrySchema) }} />
      <SiteHeader />

      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.72)_24%,rgba(238,242,255,0.88)_58%,rgba(244,246,255,0.98)_100%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <h1
              className="max-w-3xl pb-2 bg-clip-text text-4xl font-semibold leading-[1.08] tracking-normal text-transparent sm:text-5xl sm:leading-[1.04] lg:text-6xl"
              style={{
                backgroundImage: "linear-gradient(180deg, #020617 0%, #0f172a 24%, #334155 62%, #94a3b8 100%)"
              }}
            >
              See how websites handle consent, privacy and accessibility.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Automated runtime analysis surfacing pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity,
              accessibility issues, and disclosure inconsistencies — based on observed behavior, not policy claims. Findings are mapped to GDPR and CCPA.
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.18)] hover:brightness-[1.04] sm:w-auto"
                href="/#homepage-scan"
                idleContent="Scan a website"
                pendingContent="Opening..."
              />
              <a
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:w-auto"
                data-analytics-cta-location="homepage"
                data-analytics-destination-url={certscoreGptUrl}
                data-analytics-event="gpt_cta_clicked"
                href={certscoreGptUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Try CertScore GPT-API
              </a>
              <PendingButtonLink
                className="w-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 sm:w-auto"
                data-analytics-cta-type="sample_report"
                data-analytics-event="report_cta_clicked"
                href={SAMPLE_REPORT_URL}
                idleContent="See sample report"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <p className="max-w-2xl text-xs leading-5 text-slate-500">
              Built for enterprise teams managing regulatory compliance workflows, API integrations, and structured privacy-risk signals.
            </p>
          </div>

          <div className="space-y-4">
            <Card id="homepage-scan" className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle>Scan any website.</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DomainScanForm
                  buttonLabel="Scan a website"
                  emptySubmitDomain="kbdlab.io"
                  inputLabel="Website to analyze"
                  inputPlaceholder="kbdlab.io"
                  mode="full"
                  scanSource="homepage"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <HomepageFindingsOverview findings={findings} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Personas</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who CertScore is built for</h2>
            <p className="text-sm text-slate-600">
              CertScore is most useful for teams that need repeatable evidence about public website behavior.
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
                Use CertScore to observe website behavior, detect tracking activity, verify consent flows, and monitor changes over time.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <PendingButtonLink
                  className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.24)] hover:brightness-[1.04] sm:w-auto"
                  href="/#homepage-scan"
                  idleContent="Scan a website"
                  pendingContent="Opening..."
                />
                <PendingButtonLink
                  className="w-full border border-white/12 bg-white/8 text-white hover:bg-white/12 sm:w-auto"
                  data-analytics-cta-type="sample_report"
                  data-analytics-event="report_cta_clicked"
                  href={SAMPLE_REPORT_URL}
                  idleContent="See sample report"
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
            CertScore provides automated, evidence-based insights into website behavior. It is not legal advice, certification, or a compliance determination.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
