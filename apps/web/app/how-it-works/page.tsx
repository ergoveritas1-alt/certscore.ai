import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { HowItWorksCarousel } from "../../components/marketing/how-it-works-carousel";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How It Works",
  description:
    "See how CertScore.ai turns public website behavior and visible website surfaces into structured findings.",
  path: "/how-it-works"
});

const steps = [
  {
    title: "Start with the homepage, then expand where it matters",
    description:
      "CertScore begins with the public-facing website and can extend into the pages and surfaces most relevant to consent, disclosures, accessibility, and user trust."
  },
  {
    title: "Collect runtime and disclosure evidence",
    description:
      "The scanner reviews runtime behavior, consent interactions, accessibility signals, and relevant public policy and disclosure surfaces in one pass."
  },
  {
    title: "Surface supported findings",
    description:
      "Observed signals are evaluated and promoted into findings when the retained evidence is strong enough to support review. This includes issues such as pre-consent tracking, broken reject flows, missing public surfaces, and policy-to-behavior contradictions."
  },
  {
    title: "Track what changed between scans",
    description:
      "Repeated scans help teams understand what changed, what improved, what regressed, and what new signals appeared over time."
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
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">From homepage scan to reviewable findings</h1>
          <p className="text-lg text-slate-600">
            CertScore turns public website behavior and visible website surfaces into structured findings across privacy, consent, accessibility, disclosures, and observable contradictions.
          </p>
          <div className="max-w-[30rem] pt-2">
            <DomainScanForm buttonLabel="Scan a website" inputLabel="Website domain" mode="preview" />
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
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-sky-700">
          <Link href="/guides/detect-tracking-before-consent" className="hover:text-sky-800">
            Detect tracking before consent
          </Link>
          <Link href="/guides/reject-consent-tracking-test" className="hover:text-sky-800">
            Reject consent tracking test
          </Link>
          <Link href="/guides/privacy-scanner-vs-cookie-scanner" className="hover:text-sky-800">
            Privacy scanner vs cookie scanner
          </Link>
          <Link href="/methodology" className="hover:text-sky-800">
            CertScore methodology
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
