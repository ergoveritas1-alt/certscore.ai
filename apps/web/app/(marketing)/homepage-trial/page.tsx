import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { DomainScanForm } from "../../../components/marketing/domain-scan-form";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Homepage Trial",
  description: "A streamlined homepage concept for comparing a cleaner CertScore.ai marketing direction.",
  path: "/homepage-trial"
});

const proofPoints = [
  "Pre-consent tracking",
  "Reject flow failures",
  "Policy-to-behavior contradictions",
  "Change over time"
];

const coreCards = [
  {
    eyebrow: "Runtime evidence",
    title: "See what actually fires before consent.",
    description: "Catch tags, pixels, and third-party requests that appear before the user makes a choice."
  },
  {
    eyebrow: "Policy validation",
    title: "Compare site behavior against public claims.",
    description: "Identify when privacy, cookie, and disclosure language overstates what the website actually does."
  },
  {
    eyebrow: "Ongoing monitoring",
    title: "Track changes before they become risk.",
    description: "Re-scan the domain over time and review what shifted in consent, disclosures, and accessibility signals."
  }
];

const steps = [
  {
    label: "Step 1",
    title: "Run a live scan",
    description: "Enter a domain and start with the public site experience."
  },
  {
    label: "Step 2",
    title: "Review evidence",
    description: "See where trackers, consent flows, and disclosures fall out of sync."
  },
  {
    label: "Step 3",
    title: "Re-scan with confidence",
    description: "Verify fixes and monitor future drift without repeating manual checks."
  }
];

const audience = [
  "Compliance and privacy teams",
  "Web agencies and consultants",
  "Developers owning consent implementation",
  "Risk and diligence workflows"
];

function TrialMetric({
  value,
  label
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/60 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function ProductPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-slate-200/80 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.05)] backdrop-blur">
      {children}
    </div>
  );
}

export default function HomepageTrialPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_28%),linear-gradient(180deg,#eef6ff_0%,#f8fafc_24%,#ffffff_52%,#f8fafc_100%)]">
      <SiteHeader />

      <section className="relative border-b border-slate-200/70">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[linear-gradient(135deg,rgba(14,165,233,0.14)_0%,rgba(59,130,246,0.08)_24%,rgba(255,255,255,0)_68%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(96,165,250,0.28)_0%,rgba(96,165,250,0)_68%)] blur-2xl"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-14 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div className="max-w-2xl">
            <Badge tone="neutral" className="border-sky-100 bg-white/80 text-sky-700">
              Homepage Trial
            </Badge>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-[4.5rem]">
              Surface public website signals across consent, privacy, accessibility, and disclosures.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              CertScore helps teams surface pre-consent tracking, broken user controls, and policy-to-behavior contradictions with reviewable evidence from the live site.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PendingButtonLink
                className="border-0 bg-[linear-gradient(135deg,#2563eb_0%,#0ea5e9_54%,#7dd3fc_100%)] px-6 text-white shadow-[0_18px_35px_rgba(37,99,235,0.24)] hover:brightness-[1.04]"
                href="/preview"
                idleContent="Scan a website"
                pendingContent="Opening..."
              />
              <PendingButtonLink
                className="border-white/80 bg-white/80 px-6 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                href="/how-it-works"
                idleContent="See how it works"
                pendingContent="Opening..."
                variant="secondary"
              />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {proofPoints.map((item) => (
                <ProductPill key={item}>{item}</ProductPill>
              ))}
            </div>
            <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
              <TrialMetric value="Minutes" label="to get a first scan result" />
              <TrialMetric value="Live" label="checks against the public website" />
              <TrialMetric value="Repeatable" label="evidence for re-scan and review" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-x-10 top-8 h-40 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.16)_0%,rgba(37,99,235,0)_72%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Live website scan</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">Start with the homepage, then expand where it matters.</p>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                  Preview mode
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <DomainScanForm
                  buttonLabel="Scan a website"
                  helperText="Trial concept: faster entry point, less explanation, clearer action."
                  inputLabel="Website domain"
                  inputPlaceholder="Enter yoursite.com"
                  mode="preview"
                />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-5 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-200">Signal summary</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Latest scan</p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Consent</p>
                      <p className="mt-2 text-2xl font-semibold">Reject path failed</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">Observed tracking activity continued after a reject action.</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Policy</p>
                      <p className="mt-2 text-2xl font-semibold">Mismatch found</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">Observed runtime behavior did not match retained public privacy language.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Common findings</p>
                  <div className="mt-4 space-y-3">
                    {[
                      "Pre-consent analytics request observed",
                      "Cookie banner loaded after trackers",
                      "Accessibility issue on interactive control"
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
                        <p className="text-sm leading-6 text-slate-700">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Why this direction feels cleaner</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Fewer ideas per section. More visual hierarchy. Faster understanding.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {coreCards.map((card, index) => (
            <article
              key={card.title}
              className={
                index === 0
                  ? "rounded-[1.9rem] border border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(240,249,255,0.95)_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]"
                  : index === 1
                    ? "rounded-[1.9rem] border border-indigo-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(245,247,255,0.95)_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]"
                    : "rounded-[1.9rem] border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(240,253,250,0.95)_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{card.eyebrow}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{card.title}</h3>
              <p className="mt-4 text-base leading-7 text-slate-600">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white/75 backdrop-blur">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">How it works</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              One compact story from first scan to repeatable monitoring.
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-8 text-slate-600">
              This version removes duplicate explanation and keeps the homepage focused on the action, the output, and the outcome.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {audience.map((item) => (
                <div key={item} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            {steps.map((step) => (
              <div key={step.title} className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{step.label}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{step.title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="overflow-hidden rounded-[2.25rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#111c34_42%,#0f4c81_100%)] p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">Compare this version</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">A more streamlined homepage concept for CertScore.ai.</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">
                Use this page to compare the tighter hierarchy, shorter copy, and stronger call-to-action framing against the current homepage.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PendingButtonLink className="border-0 bg-white text-slate-950 hover:bg-slate-100" href="/homepage-trial" idleContent="Refresh trial page" pendingContent="Opening..." />
              <PendingButtonLink className="border-white/20 bg-white/10 text-white hover:bg-white/15" href="/" idleContent="View current homepage" pendingContent="Opening..." variant="secondary" />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
