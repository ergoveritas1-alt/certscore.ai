import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { PendingButtonLink } from "../../components/ui/pending-link";
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
      "Confirm that tags, pixels, and cookies behave the way the implementation intends on the live website."
  },
  {
    title: "Agencies auditing client or competitor sites",
    detail:
      "Run repeatable scans that show observable website behavior without depending on manual inspection alone."
  },
  {
    title: "Operators verifying consent flows",
    detail:
      "Check whether reject and accept paths actually change tracking activity after a visitor makes a choice."
  },
  {
    title: "Teams reviewing third-party websites",
    detail:
      "Evaluate public sites, vendors, partners, and diligence targets with evidence gathered from runtime scans."
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

const evidenceDetails = [
  {
    label: "First tracking request",
    value: "420ms after page load, before banner interaction"
  },
  {
    label: "Vendors observed",
    value: "Google Tag Manager, Meta"
  },
  {
    label: "Explanation",
    value: "Marketing and analytics requests started before the visitor made a consent choice."
  },
  {
    label: "Recommended fix",
    value: "Delay marketing tags until opt-in consent is recorded, then re-scan to verify the consent flow."
  }
];

const buyerQuestions = [
  "Did tracking start before consent?",
  "Did rejecting consent actually change behavior?",
  "Which vendors fired on page load?",
  "Are cookie, consent, disclosure, and accessibility signals changing over time?",
  "Is this site's public behavior worth deeper review?"
];

export default async function MarketingHomePage() {
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CertScore.ai",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "CertScore.ai scans public websites for observable tracking, cookie, consent, accessibility, and privacy risk signals."
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }} />
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
              See how websites actually handle tracking, cookies, and consent — not just what their policies claim.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Detect pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, and disclosure inconsistencies using automated runtime analysis.
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#2f63ea_0%,#2454db_100%)] text-white shadow-[0_16px_32px_rgba(47,99,234,0.18)] hover:brightness-[1.04] sm:w-auto"
                href="/#homepage-scan"
                idleContent="Scan a website"
                pendingContent="Opening..."
              />
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
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Evidence-based scanning for teams comparing live browser behavior with consent controls, cookie posture, and privacy disclosures.{" "}
              <Link href="/guides/findings" className="font-medium text-sky-700 hover:text-sky-800">
                Browse the finding atlas
              </Link>
              .
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
                  helperText="CertScore will queue the domain, run a browser-based scan, and open the saved scan record when it is accepted."
                  inputLabel="Website to analyze"
                  inputPlaceholder="example.com"
                  mode="full"
                  scanSource="homepage"
                />
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">Example finding</p>
                  <p className="mt-2 font-medium">Tracking detected before consent on example.com</p>
                  <p className="mt-1 text-slate-600">-&gt; 14 third-party requests fired before banner interaction</p>
                  <p className="text-slate-600">-&gt; Vendors: Google Tag Manager, Meta</p>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </section>

      <section id="sample-report" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <Badge tone="neutral">Evidence example</Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Tracking started before consent</h2>
              <p className="text-sm leading-6 text-slate-600">
                CertScore records timing, vendors, requests, and consent-flow outcomes so teams can review what happened in the browser.
              </p>
            </div>
            <Card className="border border-slate-200 bg-slate-50 shadow-none">
              <CardContent className="grid gap-4 p-6">
                {evidenceDetails.map((item) => (
                  <div key={item.label} className="grid gap-1 border-b border-slate-200 pb-4 last:border-0 last:pb-0 sm:grid-cols-[12rem_1fr]">
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="text-sm leading-6 text-slate-600">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="max-w-xl space-y-3">
              <Badge tone="neutral">Review questions</Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Use CertScore when you need to know:</h2>
              <p className="text-sm leading-6 text-slate-600">
                Turn public website behavior into reviewable questions for product, privacy, agency, and operations teams.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {buyerQuestions.map((question) => (
                <div key={question} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <SignalCheckIcon />
                  <p className="text-sm font-medium leading-6 text-slate-800">{question}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
