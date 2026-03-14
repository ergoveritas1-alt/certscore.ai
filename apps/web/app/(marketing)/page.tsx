import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Signal Scanner",
  description:
    "Scan your site for observable accessibility, privacy, and disclosure signals. View results, track changes, and keep scan history in one place.",
  path: "/"
});

const featureCards = [
  {
    title: "Observable signals only",
    description: "Checks focus on public-facing website signals such as accessibility issues, tracker activity, policy links, and disclosure cues."
  },
  {
    title: "Minimal stored data",
    description: "The app keeps derived signal values, aggregate counts, scan timestamps, and change events instead of raw page archives."
  },
  {
    title: "Track changes",
    description: "Each new scan is compared with the prior completed scan so added, removed, and changed signals are easy to review."
  }
];

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
  "Accessibility signals such as missing alt text, contrast failures, and ARIA issues",
  "Privacy signals such as tracker vendors, cookie banner presence, and consent-related behavior",
  "Disclosure signals such as privacy policy, terms, cookie policy, refund policy, and affiliate language detection"
];

const workflow = [
  {
    step: "1",
    title: "Add a website",
    description: "Connect a public website and choose when you want it scanned."
  },
  {
    step: "2",
    title: "Run a scan",
    description: "The scanner crawls a bounded page set, derives structured signal values, and stores only the resulting metadata."
  },
  {
    step: "3",
    title: "Review results",
    description: "Use Overview, Signals, Changes, and Scan History to inspect the latest scan in a minimal in-app workflow."
  }
];

export default function MarketingHomePage() {
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

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <h1
              className="max-w-3xl bg-clip-text text-4xl font-semibold leading-[0.95] tracking-tight text-transparent sm:text-5xl lg:text-6xl"
              style={{
                backgroundImage: "linear-gradient(180deg, #020617 0%, #0f172a 24%, #334155 62%, #94a3b8 100%)"
              }}
            >
              Detect compliance, privacy, trust, and accessibility signals across your website.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Automatically track disclosures, policies, and tracking infrastructure as they change over time.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                asChild
                className="w-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04] sm:w-auto"
              >
                <Link href="/pricing">View pricing</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="w-full border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50 sm:w-auto"
              >
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
            <p className="text-sm text-slate-500">
              CertScore.ai provides automated telemetry on publicly observable website signals related to frameworks such as GDPR, WCAG accessibility standards, CCPA/CPRA, cookie consent systems, and privacy disclosures.
            </p>
          </div>

          <Card className="border-slate-200 bg-slate-50 shadow-none">
            <CardHeader>
              <CardTitle>Run a web scan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Start with a homepage-only preview. Free accounts keep one website and one scan per month.
              </p>
              <DomainScanForm
                buttonLabel="Start homepage scan"
                helperText="The preview is lightweight and shows a small set of sample scan findings before signup."
                inputLabel="Website domain"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-3">
          <Badge tone="neutral">What the product does</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Everything your team needs to review scans and act on changes.</h2>
          <p className="text-sm text-slate-600">
            CertScore.ai keeps the latest scan, structured findings, recent changes, and scan history in one clear workflow. The service analyzes publicly available website behavior and may not capture all compliance-related factors. CertScore.ai does not store site content or personal data, provide legal advice, or certify compliance.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {featureCards.map((item, index) => {
            const FeatureIcon = index === 0 ? ObservableSignalsIcon : index === 1 ? MinimalStoredDataIcon : ChangeTrackingIcon;

            return (
              <Card
                key={item.title}
                className={
                  index === 0
                    ? "relative overflow-hidden border border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,252,255,0.98)_100%)] shadow-none"
                    : index === 1
                      ? "relative overflow-hidden border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(249,253,250,0.98)_100%)] shadow-none"
                      : "relative overflow-hidden border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(250,251,252,0.98)_100%)] shadow-none"
                }
              >
                <div
                  aria-hidden="true"
                  className={
                    index === 0
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]"
                      : index === 1
                        ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.18)_0%,rgba(124,207,121,0.28)_100%)]"
                        : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(148,163,184,0.22)_0%,rgba(226,232,240,0.4)_100%)]"
                  }
                />
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <FeatureIcon />
                    <span>{item.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">{item.description}</CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <Badge tone="neutral">Signals</Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Monitor a narrow, explicit signal set.</h2>
            </div>
            <div className="space-y-4 text-sm text-slate-600">
              {categories.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <SignalCheckIcon />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-3">
          <Badge tone="neutral">Workflow</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">How scanning works</h2>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {workflow.map((item, index) => (
            <div key={item.step} className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div
                  className={
                    index === 0
                      ? "flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-sm font-semibold text-sky-700 ring-1 ring-sky-200"
                      : index === 1
                        ? "flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(240,253,244,0.98)_100%)] text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"
                        : "flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.98)_100%)] text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                  }
                >
                  {item.step}
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Step</p>
              </div>
              <p className="mt-3 text-lg font-medium text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
