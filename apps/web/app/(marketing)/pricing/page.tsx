import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { Button } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Pricing",
  description: "Compare scans, findings history, monitoring cadence, and domain coverage for CertScore.ai.",
  path: "/pricing"
});

const API_ACCESS_COMING_SOON_LABEL = "Coming soon";

const comparisonRows = [
  { label: "Domains", values: { individual: "1", pro: "20", team: "100" } },
  { label: "Coverage", values: { individual: "Public-site scan coverage", pro: "Public-site scan coverage", team: "Public-site scan coverage" } },
  {
    label: "Recurring scan cadence",
    values: {
      individual: "Setup options up to hourly",
      pro: "Setup options up to hourly",
      team: "Setup options up to hourly"
    }
  },
  { label: "Manual re-scan cooldown", values: { individual: "Every 1 minute per domain", pro: "Every 1 minute per domain", team: "Every 1 minute per domain" } },
  { label: "Scan history", values: { individual: "Included", pro: "Included", team: "Included" } },
  { label: "API access", values: { individual: "Not included", pro: "Not included", team: API_ACCESS_COMING_SOON_LABEL } }
];

const marketingPlans = [
  {
    code: "individual",
    label: "Individual",
    priceLabel: "$29/mo",
    description: "Evidence-led monitoring setup for one domain",
    coverageLabel: "Public-site scan coverage",
    maxDomains: 1,
    scanFrequency: "hourly",
    scanHistoryEnabled: true,
    apiAccessLabel: "Not included"
  },
  {
    code: "pro",
    label: "Pro",
    priceLabel: "$129/mo",
    description: "Structured findings setup across a growing portfolio",
    coverageLabel: "Public-site scan coverage",
    maxDomains: 20,
    scanFrequency: "hourly",
    scanHistoryEnabled: true,
    apiAccessLabel: "Not included"
  },
  {
    code: "team",
    label: "Ultra",
    priceLabel: "$289/mo",
    description: "Portfolio-scale scan review and change tracking setup",
    coverageLabel: "Public-site scan coverage",
    maxDomains: 100,
    scanFrequency: "hourly",
    scanHistoryEnabled: true,
    apiAccessLabel: API_ACCESS_COMING_SOON_LABEL
  }
] as const;

const planCardContent = {
  individual: {
    badge: "Solo",
    badgeClassName: "bg-amber-100 text-amber-800 ring-amber-200",
    cardClassName:
      "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_42px_rgba(245,158,11,0.12)]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(245,158,11,0.22)_0%,rgba(251,191,36,0.34)_100%)]",
    glowClassName: "bg-amber-300/70",
    valueClassName: "text-amber-950",
    statCardClassName: "bg-white/90 ring-amber-100",
    summaryLabel: "Best for one reviewed domain",
    bullets: [
      "Structured findings and evidence history for one domain",
      "Recurring scan cadence options up to hourly after setup is confirmed",
      "On-demand re-scans every 1 minute per domain",
      "Built for solo operators who only need one monitored domain"
    ],
    footerNote: "Individual matches Pro coverage and cadence, but is limited to one domain.",
    ctaHref: "/monitor-site?source=pricing&plan=individual",
    ctaLabel: "Request Individual setup",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#f59e0b_0%,#fbbf24_58%,#fde68a_100%)] text-slate-950 shadow-[0_14px_32px_rgba(245,158,11,0.18)] hover:brightness-[1.03]"
  },
  pro: {
    badge: "Most popular",
    badgeClassName: "bg-sky-100 text-sky-800 ring-sky-200",
    cardClassName:
      "border-sky-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_24px_56px_rgba(15,139,215,0.16)] md:-translate-y-1 md:scale-[1.01]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(15,139,215,0.2)_0%,rgba(103,199,240,0.34)_100%)]",
    glowClassName: "bg-sky-300/80",
    valueClassName: "text-sky-950",
    statCardClassName: "bg-white/90 ring-sky-100",
    summaryLabel: "Best value for most teams",
    bullets: [
      "Structured findings and evidence history across up to twenty domains",
      "Good fit for in-house teams monitoring up to twenty domains",
      "Recurring scan cadence options up to hourly after setup is confirmed"
    ],
    footerNote: "Pro is the cleanest upgrade path if you want to discuss recurring monitoring and richer scan history.",
    ctaHref: "/monitor-site?source=pricing&plan=pro",
    ctaLabel: "Request Pro setup",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
  },
  team: {
    badge: "Agencies",
    badgeClassName: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    cardClassName:
      "border-emerald-200 bg-[linear-gradient(180deg,rgba(249,253,250,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_24px_56px_rgba(71,181,74,0.15)]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(71,181,74,0.2)_0%,rgba(124,207,121,0.32)_100%)]",
    glowClassName: "bg-emerald-300/80",
    valueClassName: "text-emerald-950",
    statCardClassName: "bg-white/90 ring-emerald-100",
    summaryLabel: "Built for portfolio monitoring",
    bullets: [
      "Structured findings and evidence history at portfolio scale",
      "Best for agencies and consultants monitoring up to one hundred domains",
      "Recurring scan cadence options up to hourly after setup is confirmed"
    ],
    footerNote: "Ultra is built for agencies, consultants, and teams reviewing many domains in parallel.",
    ctaHref: "/monitor-site?source=pricing&plan=ultra",
    ctaLabel: "Request Ultra setup",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
  }
} as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-4">
          <Badge tone="neutral">Simple limits, aligned with the product.</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Pricing for scans, evidence review, and monitoring setup.</h1>
          <p className="text-lg text-slate-600">
            Start with a scan, then request broader domain coverage, change tracking, scan history, and monitoring setup as your review needs grow.
          </p>
          <div className="flex flex-wrap gap-3">
            <PendingButtonLink
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              href="/"
              idleContent="Scan a website"
              pendingContent="Opening..."
            />
            <PendingButtonLink
              className="border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50"
              href="/#sample-report"
              idleContent="See sample findings"
              pendingContent="Opening..."
              variant="secondary"
            />
          </div>
        </div>

        <div className="mt-10 grid gap-2.5 md:grid-cols-3">
          {marketingPlans.map((plan) => {
            return (
              <Card
                key={plan.code}
                className={`group relative flex h-full min-w-0 max-w-[20.5rem] flex-col overflow-hidden rounded-[22px] transition-transform duration-200 hover:-translate-y-1 ${planCardContent[plan.code].cardClassName}`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute -right-10 top-8 h-24 w-24 rounded-full blur-3xl ${planCardContent[plan.code].glowClassName}`}
                />
                <div
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-1 ${planCardContent[plan.code].accentClassName}`}
                />
                <CardHeader className="space-y-2.5 px-3.5 pb-0 pt-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ring-1 ${planCardContent[plan.code].badgeClassName}`}
                    >
                      {planCardContent[plan.code].badge}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {plan.maxDomains} {plan.maxDomains === 1 ? "domain" : "domains"}
                    </span>
                  </div>
                  <CardTitle className="space-y-2.5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        {planCardContent[plan.code].summaryLabel}
                      </p>
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-[1.15rem] text-slate-950">{plan.label}</span>
                        <div className="text-right">
                          <span className={`text-[1.8rem] font-semibold tracking-tight ${planCardContent[plan.code].valueClassName}`}>
                            {plan.priceLabel}
                          </span>
                          <p className="text-[11px] text-slate-500">monthly</p>
                        </div>
                      </div>
                    </div>
                    <p className="max-w-[14rem] text-[12px] font-normal leading-[1.35rem] text-slate-600">{plan.description}</p>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3.5 px-3.5 pb-3.5 pt-3.5">
                  <div className="space-y-3 text-[12px] text-slate-700">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Coverage</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.coverageLabel}</p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Recurring cadence</p>
                        <p className="mt-1 font-medium text-slate-900">
                          {plan.scanFrequency === "hourly" ? "Setup up to hourly" : "Monthly setup"}
                        </p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">History</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.scanHistoryEnabled ? "Included" : "Not included"}</p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">API access</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.apiAccessLabel}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {planCardContent[plan.code].bullets.map((bullet) => (
                        <div key={`${plan.code}-${bullet}`} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <p>{bullet}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-[12px] leading-[1.35rem] text-slate-600">{planCardContent[plan.code].footerNote}</p>
                    <PendingButtonLink
                      className={`w-full ${planCardContent[plan.code].ctaClassName}`}
                      href={planCardContent[plan.code].ctaHref}
                      idleContent={planCardContent[plan.code].ctaLabel}
                      pendingContent="Opening..."
                    />
                    <p className="text-[11px] leading-[1.25rem] text-slate-500">
                      Submitting a request does not activate monitoring. CertScore will follow up about setup options.
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="relative mt-5 overflow-hidden rounded-[28px] border-emerald-200 bg-[linear-gradient(135deg,rgba(247,253,248,1)_0%,rgba(255,255,255,0.98)_58%,rgba(240,253,244,0.98)_100%)] shadow-[0_24px_56px_rgba(71,181,74,0.12)]">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(71,181,74,0.24)_0%,rgba(15,139,215,0.2)_100%)]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 top-8 h-28 w-28 rounded-full bg-emerald-300/70 blur-3xl"
          />
          <CardContent className="grid gap-6 px-5 py-5 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200">
                  Enterprise custom
                </span>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Custom pricing</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Need a larger rollout or custom terms?</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  Enterprise Custom is for larger teams that need custom procurement, API access, onboarding help, or a tailored scanning footprint across many domains.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Domains</p>
                  <p className="mt-1 font-medium text-slate-900">Custom volume</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">API access</p>
                  <p className="mt-1 font-medium text-slate-900">{API_ACCESS_COMING_SOON_LABEL}</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Onboarding</p>
                  <p className="mt-1 font-medium text-slate-900">Hands-on</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Commercial terms</p>
                  <p className="mt-1 font-medium text-slate-900">Custom</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 md:justify-self-end">
              <p className="text-sm leading-6 text-slate-600 md:max-w-sm">
                Talk to us if you need procurement support, portfolio-scale monitoring setup, or a tailored rollout beyond the standard plans.
              </p>
              <PendingButtonLink
                className="w-full border-0 bg-[linear-gradient(135deg,#47b54a_0%,#63c864_58%,#8add89_100%)] text-slate-950 shadow-[0_14px_32px_rgba(71,181,74,0.18)] hover:brightness-[1.03] md:w-auto md:min-w-[180px]"
                data-analytics-cta-location="unknown"
                data-analytics-event="contact_clicked"
                href="/contact-sales"
                idleContent="Contact us"
                pendingContent="Opening..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-12 space-y-4">
          <div className="max-w-2xl space-y-2">
            <Badge tone="neutral">Comparison</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Plan details</h2>
          </div>
          <Card className="border-slate-200 bg-white shadow-none">
            <CardContent className="overflow-x-auto p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 font-medium">Individual</th>
                    <th className="px-6 py-4 font-medium">Pro</th>
                    <th className="px-6 py-4 font-medium">Ultra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.label}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.individual}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.pro}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.team}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
