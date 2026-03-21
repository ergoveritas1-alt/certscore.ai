import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { PendingButtonLink } from "../../components/ui/pending-link";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Signal Scanner",
  description:
    "Detect policy-to-behavior contradictions, pre-consent tracking, consent failures, third-party collection, and accessibility issues across your domain.",
  path: "/"
});

const featureCards = [
  {
    title: "Catch policy-vs-behavior conflicts",
    description: "Compare what the site claims in privacy and disclosure pages with what the runtime evidence shows."
  },
  {
    title: "Surface pre-consent tracking fast",
    description: "See which trackers fired before consent and whether reject actually changed behavior."
  },
  {
    title: "Track vendor and disclosure drift",
    description: "Monitor third-party collection, policy coverage, and accessibility/disclosure posture as the site changes."
  }
];

const personas = [
  {
    title: "Compliance consultants and web agencies",
    detail:
      "You audit client websites for privacy and consent-related risks on a recurring basis. You need structured scan evidence you can review with clients, not another manual checklist. CertScore gives you reproducible output across the domains you monitor."
  },
  {
    title: "In-house privacy and compliance teams",
    detail:
      "You need ongoing visibility into your compliance posture, not a one-time audit. CertScore tracks whether consent flows are working, whether vendors are collecting data before consent, and whether anything has drifted since the last review."
  },
  {
    title: "Due diligence and risk analysts",
    detail:
      "When evaluating a company or counterparty, public-facing privacy posture can be an early signal. CertScore gives you a fast, structured read on observable website signals before deeper review."
  },
  {
    title: "Developers responsible for compliance implementation",
    detail:
      "You own the implementation but don't always have visibility into what's firing on production. CertScore scans the live site the way a browser does — catching trackers that load before consent and flows that don't behave as configured."
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

const deeperInsights = [
  {
    eyebrow: "Shadow IT Discovery",
    title: "Detect unauthorized marketing tags injected by rogue third-party plugins.",
    description: "Catch scripts and vendors that appear outside the expected marketing stack before they quietly expand collection and attribution scope."
  },
  {
    eyebrow: "Consent Flow Breakage",
    title: 'Identify whether a "Privacy Request Form" or "Reject" button might be missing.',
    description: "Spot broken consent journeys where user controls are absent, incomplete, or fail to present the paths the site implies should exist."
  },
  {
    eyebrow: "SEO, GEO & Trust Indexing",
    title: "Correlate technical accessibility and privacy posture with potential algorithmic trust penalties.",
    description: "Use scan evidence as an early signal when weak consent, disclosure, or accessibility posture may be compounding reputation and discoverability risk."
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
  "Policy and disclosure posture across privacy, terms, cookie, refund, subscription, and accessibility surfaces",
  "Cookie-banner and consent evidence, including CMP detection, reject paths, and post-choice behavior",
  "Tracker and third-party collection inventory, including pre-consent activity and vendor-level evidence",
  "Policy vs behavior contradiction: the site’s public privacy and consent posture implied stricter tracking behavior than the runtime evidence supported."
];

const workflow = [
  {
    step: "1",
    title: "Start with a homepage preview",
    description: "Run a quick preview first, then expand into full domain coverage once you want deeper evidence and scan history."
  },
  {
    step: "2",
    title: "Collect runtime and policy evidence",
    description: "The scanner checks trackers, consent flows, accessibility signals, and public policy/disclosure pages."
  },
  {
    step: "3",
    title: "Review contradictions and changes",
    description: "See where the site’s behavior conflicts with its claims, then monitor what changed between scans."
  }
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

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <h1
              className="max-w-3xl pb-2 bg-clip-text text-4xl font-semibold leading-[1.02] tracking-tight text-transparent sm:text-5xl lg:text-6xl"
              style={{
                backgroundImage: "linear-gradient(180deg, #020617 0%, #0f172a 24%, #334155 62%, #94a3b8 100%)"
              }}
            >
              Scan websites for privacy, consent, accessibility, and regulatory compliance signals.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Automated telemetry for pre-consent tracking, consent flow failures, third-party data collection, and policy-to-behavior contradictions. Built for teams that need scan evidence, not checklists.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04] sm:w-auto"
                href="/preview"
                idleContent="Run a scan"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="w-full border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50 sm:w-auto"
                href="/how-it-works"
                idleContent="How it works"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <p className="text-sm text-slate-500">
              CertScore.ai provides automated telemetry on publicly observable website signals related to frameworks such as GDPR, WCAG accessibility standards, CCPA/CPRA, cookie consent systems, and privacy disclosures.
            </p>
          </div>

          <div className="space-y-4">
            <Card id="homepage-scan" className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle>Scan a homepage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DomainScanForm
                  buttonLabel="Start homepage scan"
                  helperText="The preview is lightweight and shows sample findings for the homepage before signup."
                  inputLabel="Website domain"
                  mode="preview"
                />
              </CardContent>
            </Card>

            <div className="rounded-[1.9rem] border border-slate-200 bg-white p-4 shadow-none">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">What happens next?</p>
                <p className="text-sm text-slate-600">Move from findings into workflow without losing the scan context.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {whatHappensNext.map((item, index) => (
                  <div
                    key={item.title}
                    className={
                      index === 0
                        ? "rounded-2xl border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.96)_0%,rgba(255,255,255,1)_100%)] px-4 py-3"
                        : index === 1
                          ? "rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,rgba(249,253,250,0.96)_0%,rgba(255,255,255,1)_100%)] px-4 py-3"
                          : "rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.step}</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-3">
          <Badge tone="neutral">What you can catch</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">The highest-value findings show up immediately.</h2>
          <p className="text-sm text-slate-600">
            CertScore.ai is strongest where policy, consent, trackers, and accessibility evidence intersect. The output is structured for review, prioritization, and change monitoring.
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

      <section id="sample-report" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-3">
            <Badge tone="neutral">Personas</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who will benefit from CertScore.ai?</h2>
            <p className="text-sm text-slate-600">
              CertScore.ai is most useful for teams that need repeatable, observable scan evidence instead of one-off manual review.
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

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <Badge tone="neutral">Signals</Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Monitor the specific surfaces that drive risk and change.</h2>
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
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">From homepage preview to ongoing domain monitoring.</h2>
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

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="space-y-3">
            <Badge tone="neutral">Deeper insights</Badge>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-950">Get deeper insights based on scanned signals.</h2>
            <p className="max-w-2xl text-sm text-slate-600">
              CertScore.ai can do more than surface obvious findings. It helps teams connect runtime evidence to hidden operational risk, broken user controls, and broader trust posture.
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {deeperInsights.map((item, index) => (
              <Card
                key={item.eyebrow}
                className={
                  index === 0
                    ? "relative overflow-hidden border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                    : index === 1
                      ? "relative overflow-hidden border border-emerald-100 bg-[linear-gradient(180deg,rgba(249,253,250,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                      : "relative overflow-hidden border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none"
                }
              >
                <div
                  aria-hidden="true"
                  className={
                    index === 0
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(245,158,11,0.72)_0%,rgba(251,191,36,0.5)_100%)]"
                      : index === 1
                        ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.78)_0%,rgba(124,207,121,0.48)_100%)]"
                        : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.8)_0%,rgba(103,199,240,0.46)_100%)]"
                  }
                />
                <CardHeader className="space-y-2 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.eyebrow}</p>
                  <CardTitle className="text-base leading-5 tracking-tight text-slate-950">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 text-[13px] leading-5 text-slate-600">{item.description}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
