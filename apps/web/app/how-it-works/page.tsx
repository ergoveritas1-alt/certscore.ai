import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How It Works",
  description:
    "See how CertScore.ai scans public websites, derives structured signals, and tracks changes between scans.",
  path: "/how-it-works"
});

const steps = [
  {
    title: "Crawl a bounded page set",
    description: "Each scan starts from the homepage, discovers links, and selects a limited number of pages based on the current plan."
  },
  {
    title: "Run technical checks",
    description: "The scanner runs automated accessibility checks, detects tracker activity, looks for common policy pages, and notes disclosure-related cues."
  },
  {
    title: "Store derived signals",
    description: "The system stores signal values, counts, timestamps, and change events. It does not store raw HTML, page content, screenshots or personal data."
  },
  {
    title: "Compare against the prior scan",
    description: "When a previous completed scan exists, CertScore.ai records added, removed, and changed signals so recent changes are easy to review."
  }
];

function StepBadge({ step, tone }: { step: string; tone: "sky" | "emerald" | "slate" }) {
  const className =
    tone === "sky"
      ? "bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-sky-700 ring-sky-200"
      : tone === "emerald"
        ? "bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(240,253,244,0.98)_100%)] text-emerald-700 ring-emerald-200"
        : "bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.98)_100%)] text-slate-700 ring-slate-200";

  return <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ring-1 ${className}`}>{step}</span>;
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">How it works</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">From scan run to signal history.</h1>
            <p className="text-lg text-slate-600">
              CertScore.ai is built around a narrow output model: scan metadata, structured signals, summaries, and changes over time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              >
                <Link href="/">Start a scan</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50"
              >
                <Link href="/pricing">Compare plans</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

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
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <StepBadge step={String(index + 1)} tone={index === 0 ? "sky" : index === 1 ? "emerald" : "slate"} />
                  <span>{step.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">{step.description}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
