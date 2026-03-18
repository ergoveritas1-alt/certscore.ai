import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HowItWorksCarousel } from "../../components/marketing/how-it-works-carousel";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How It Works",
  description:
    "See how CertScore.ai turns public website behavior, policy pages, tracker activity, consent flows, and accessibility issues into structured findings.",
  path: "/how-it-works"
});

const steps = [
  {
    title: "Start with the homepage, then expand where it matters",
    description: "Each scan begins with the homepage and then moves into the public pages most likely to drive policy, consent, tracker, and disclosure findings."
  },
  {
    title: "Collect runtime and disclosure evidence",
    description: "The scanner checks tracker activity, consent flows, accessibility issues, and public policy/disclosure pages in one pass."
  },
  {
    title: "Surface contradictions and failures",
    description: "The reporting layer highlights pre-consent tracking, broken reject flows, tracker inventory, and policy-to-behavior contradictions."
  },
  {
    title: "Track what changed between scans",
    description: "When a prior completed scan exists, CertScore.ai records added, removed, and changed signals so regressions stand out quickly."
  }
];

function StepBadge({ step, tone }: { step: string; tone: "sky" | "emerald" | "slate" }) {
  const className =
    tone === "sky"
      ? "bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-sky-700 ring-sky-200"
      : tone === "emerald"
        ? "bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(240,253,244,0.98)_100%)] text-emerald-700 ring-emerald-200"
        : "bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.98)_100%)] text-slate-700 ring-slate-200";

  return <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ${className}`}>{step}</span>;
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl space-y-4">
          <Badge tone="neutral">How it works</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">From homepage preview to contradiction and consent evidence.</h1>
          <p className="text-lg text-slate-600">
            CertScore.ai turns public website behavior into structured findings around privacy, consent, trackers, accessibility, and disclosure posture.
          </p>
          <div className="max-w-[30rem] pt-2">
            <DomainScanForm buttonLabel="Run a scan" inputLabel="Website domain" />
          </div>
        </div>
        </div>
      </section>

      <HowItWorksCarousel />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 lg:grid-cols-2">
          {steps.map((step, index) => (
            <Card key={step.title} className="relative overflow-hidden border-slate-200 bg-white shadow-none">
              <div
                aria-hidden="true"
                className={
                  index === 0
                    ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]"
                    : index === 1
                      ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(71,181,74,0.18)_0%,rgba(124,207,121,0.28)_100%)]"
                      : index === 2
                        ? "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(148,163,184,0.22)_0%,rgba(226,232,240,0.4)_100%)]"
                        : "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.14)_0%,rgba(71,181,74,0.18)_100%)]"
                }
              />
              <CardHeader className="space-y-0 px-5 pb-2 pt-4">
                <CardTitle className="flex items-start gap-3 text-lg leading-tight">
                  <StepBadge step={String(index + 1)} tone={index === 0 ? "sky" : index === 1 ? "emerald" : "slate"} />
                  <span className="pt-0.5">{step.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-0 text-sm leading-6 text-slate-600">{step.description}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
