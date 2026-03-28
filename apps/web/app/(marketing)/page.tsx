import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Signal Scanner",
  description:
    "Surface observable website signals across privacy, consent, accessibility, disclosures, and policy-to-behavior contradictions.",
  path: "/"
});

const featureCards = [
  {
    icon: "🛡",
    metric: "Signals",
    title: "Privacy & Tracking",
    description: "Detect tracking technologies, third-party requests, and data-collection signals visible from a public website scan."
  },
  {
    icon: "©",
    metric: "Choice",
    title: "Consent Health",
    description: "Evaluate whether consent controls appear when expected and whether observable tracking behavior appears to align with user choice."
  },
  {
    icon: "⚖",
    metric: "Review",
    title: "Disclosures & Regulatory Signals",
    description: "Surface public signals tied to privacy notices, contact paths, policy surfaces, accessibility posture, and framework-relevant disclosures."
  }
];

const personas = [
  {
    title: "Compliance consultants and web agencies",
    detail:
      "You review client websites for privacy, consent, disclosure, and accessibility risks on a recurring basis. CertScore gives you structured findings and reproducible evidence you can review with clients without relying on manual checklists alone."
  },
  {
    title: "In-house privacy and compliance teams",
    detail:
      "You need ongoing visibility into public website signals, not a one-time audit. CertScore helps track whether consent flows are working, whether vendors are collecting data before consent, and what has changed since the last review."
  },
  {
    title: "Due diligence and risk analysts",
    detail:
      "When evaluating a company or counterparty, public-facing website behavior and disclosures can be useful diligence signals. CertScore provides a structured read on observable privacy, disclosure, accessibility, and trust-related signals for deeper review."
  },
  {
    title: "Developers responsible for compliance implementation",
    detail:
      "You own the implementation but may not always see what is happening on the live site. CertScore scans public pages in a browser context to surface trackers that load before consent and flows that may not behave as intended."
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

function ObservableSignalsIcon() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-2xl bg-sky-50 ring-1 ring-sky-100" />
      <svg viewBox="0 0 36 36" className="relative h-6 w-6" aria-hidden="true">
        <circle cx="18" cy="18" r="8.5" fill="none" stroke="#20b8dd" strokeWidth="2.2" />
        <circle cx="18" cy="18" r="3" fill="#20b8dd" />
        <circle cx="10" cy="12" r="2.2" fill="#7c4dff" />
        <circle cx="25.5" cy="10.5" r="1.9" fill="#0f8bd7" opacity="0.9" />
        <circle cx="26" cy="25" r="2.2" fill="#67c7f0" />
      </svg>
    </div>
  );
}

function MinimalStoredDataIcon() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100" />
      <svg viewBox="0 0 36 36" className="relative h-6 w-6" aria-hidden="true">
        <ellipse cx="18" cy="10" rx="8.5" ry="4" fill="#47b54a" opacity="0.2" />
        <ellipse cx="18" cy="10" rx="8.5" ry="4" fill="none" stroke="#47b54a" strokeWidth="2.2" />
        <path d="M9.5 10v11c0 2.2 3.8 4 8.5 4s8.5-1.8 8.5-4V10" fill="none" stroke="#47b54a" strokeWidth="2.2" />
        <path d="M13.2 18.4l3.1 3.2 6.5-7.2" fill="none" stroke="#0f8bd7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ChangeTrackingIcon() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-2xl bg-slate-50 ring-1 ring-slate-200" />
      <svg viewBox="0 0 36 36" className="relative h-6 w-6" aria-hidden="true">
        <path d="M10 12.5h11.5" stroke="#0f8bd7" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 18h14.5" stroke="#20b8dd" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 23.5h9.5" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M24.8 10.2a7.3 7.3 0 1 1-4.6 13" fill="none" stroke="#7c4dff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="m18.6 21.2 1.1 3.7 3.7-1.1" fill="none" stroke="#7c4dff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function SignalCheckIcon() {
  return (
    <div className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] ring-1 ring-sky-200" />
      <svg viewBox="0 0 24 24" className="relative h-4.5 w-4.5" aria-hidden="true">
        <path d="m7.3 12.1 3 3.1 6.5-7" fill="none" stroke="#0f8bd7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const categories = [
  "Scan consent flows, cookie banners, and user-choice mechanisms for privacy and consumer-protection risk signals",
  "Surface trackers, third-party collection, and vendor-level evidence tied to privacy, data use, and disclosure posture",
  "Flag contradictions between what a site says about privacy, pricing, consent, or financial promotions and what runtime evidence shows",
  "Detect website signals relevant to FTC, CPPA, GDPR, COPPA, ADA, CFTC, and SEC frameworks"
];

const whatHappensNext = [
  {
    step: "01",
    title: "Review and prioritize",
    description: "Review the scan and prioritize the findings that matter most."
  },
  {
    step: "02",
    title: "Remediate",
    description: "Update the live site to address the issues surfaced."
  },
  {
    step: "03",
    title: "Re-scan to verify",
    description: "Run the site again to verify the changes worked."
  },
  {
    step: "04",
    title: "Track drift",
    description: "Monitor the domain so new issues do not creep back in."
  }
];

export default async function MarketingHomePage() {
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CertScore.ai",
    url: SITE_URL,
    applicationCategory: "Website Monitoring Software",
    operatingSystem: "Web",
    description:
      "CertScore.ai scans websites for observable accessibility, privacy, and disclosure signals and tracks changes over time."
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }} />
      <SiteHeader />

      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.72)_24%,rgba(238,242,255,0.88)_58%,rgba(244,246,255,0.98)_100%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <h1
              className="max-w-3xl pb-2 bg-clip-text text-4xl font-semibold leading-[1.02] tracking-tight text-transparent sm:text-5xl lg:text-6xl"
              style={{
                backgroundImage: "linear-gradient(180deg, #020617 0%, #0f172a 24%, #334155 62%, #94a3b8 100%)"
              }}
            >
              Surface website evidence across privacy, consent, accessibility, and{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(180deg, #2f63ea 0%, #5b83ee 52%, #8ea5f2 100%)" }}
              >
                disclosures
              </span>{" "}
              .
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.18)] hover:brightness-[1.04] sm:w-auto"
                href="/preview"
                idleContent="Scan a website"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="w-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 sm:w-auto"
                href="/preview"
                idleContent="See sample findings"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              No legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context.
            </p>
          </div>

          <div className="space-y-4">
            <Card id="homepage-scan" className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle>Scan a homepage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DomainScanForm
                  buttonLabel="Scan a website"
                  helperText="Start with a lightweight homepage scan that previews the kinds of findings and observable signals CertScore can surface before signup."
                  inputLabel="Website domain"
                  mode="preview"
                />
              </CardContent>
            </Card>

          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white/70">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="text-sm font-medium tracking-wide text-slate-600 sm:text-[15px]">
            Pre-consent tracking • disclosure gaps • accessibility signals • contradictions • change tracking
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex rounded-full bg-[linear-gradient(180deg,rgba(241,245,249,0.98)_0%,rgba(226,232,240,0.98)_100%)] px-5 py-2.5 text-[12px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              What CertScore surfaces
            </div>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Observable website signals across privacy, consent, accessibility, and disclosures
            </h2>
          </div>
          <Link href="/preview" className="text-base font-semibold text-[#2f63ea] hover:text-[#2454db]">
            See sample findings →
          </Link>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {featureCards.map((item, index) => {
            return (
              <Card
                key={item.title}
                className={
                  index === 0
                    ? "relative h-full overflow-hidden rounded-[2rem] border border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,252,255,0.94)_100%)] shadow-[0_18px_48px_rgba(148,163,184,0.08)]"
                    : index === 1
                      ? "relative h-full overflow-hidden rounded-[2rem] border border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,252,255,0.94)_100%)] shadow-[0_18px_48px_rgba(148,163,184,0.08)]"
                      : "relative h-full overflow-hidden rounded-[2rem] border border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,252,255,0.94)_100%)] shadow-[0_18px_48px_rgba(148,163,184,0.08)]"
                }
              >
                <CardHeader className="space-y-5 p-6 pb-0">
                  <div className="text-[1.7rem] leading-none text-slate-500">{item.icon}</div>
                  <div className="space-y-3">
                    <p className="text-6xl font-light leading-none tracking-[-0.06em] text-slate-950">{item.metric}</p>
                    <CardTitle className="min-h-[3.75rem] text-[1.7rem] leading-none tracking-tight text-slate-950">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-5">
                  <p className="min-h-[12rem] text-lg leading-9 text-slate-500">{item.description}</p>
                  <div className="mt-8 h-1 rounded-full bg-[linear-gradient(90deg,#4f6edb_0%,#7ea2ff_100%)]" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="sample-report" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Personas</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who CertScore is built for</h2>
            <p className="text-sm text-slate-600">
              CertScore is most useful for teams that need repeatable, observable website evidence instead of one-off manual review.
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
                Use CertScore to automate scanning, surface reviewable evidence, and monitor changes across privacy, consent, accessibility, disclosure, and contradiction signals.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <PendingButtonLink
                  className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.24)] hover:brightness-[1.04] sm:w-auto"
                  href="/preview"
                  idleContent="Scan a website"
                  pendingContent="Opening..."
                />
                <PendingButtonLink
                  className="w-full border border-white/12 bg-white/8 text-white hover:bg-white/12 sm:w-auto"
                  href="/preview"
                  idleContent="See sample findings"
                  pendingContent="Opening..."
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
