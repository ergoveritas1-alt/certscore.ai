import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PendingButtonLink } from "../../../components/ui/pending-link";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Pricing",
  description: "Compare monitored domains, scan credits, monitoring cadence, and evidence history for CertScore.ai.",
  path: "/pricing"
});

const comparisonRows = [
  { label: "Monitored domains", values: { starter: "1", pro: "10", agency: "50" } },
  { label: "Included scan credits/month", values: { starter: "50", pro: "500", agency: "3,000" } },
  {
    label: "Monitoring cadence",
    values: {
      starter: "Weekly monitoring",
      pro: "Daily monitoring available within credits",
      agency: "Scheduled portfolio monitoring"
    }
  },
  {
    label: "Manual re-scans",
    values: {
      starter: "Use included credits",
      pro: "Use included credits",
      agency: "Use included credits"
    }
  },
  { label: "History", values: { starter: "Basic scan history", pro: "Evidence history", agency: "Portfolio evidence history" } },
  { label: "High-frequency monitoring", values: { starter: "Custom add-on", pro: "Custom add-on", agency: "Custom add-on" } }
];

const marketingPlans = [
  {
    code: "free",
    label: "Free / Preview",
    priceLabel: "$0",
    description: "A lightweight homepage preview for a submitted public site.",
    domainsLabel: "1 submitted site",
    scanCreditsLabel: "Homepage preview",
    cadenceLabel: "Manual only",
    historyLabel: "Limited scan evidence"
  },
  {
    code: "starter",
    label: "Starter",
    priceLabel: "$39/mo",
    description: "Simple recurring review signals for one monitored domain.",
    domainsLabel: "1 monitored domain",
    scanCreditsLabel: "50 credits/month",
    cadenceLabel: "Weekly monitoring",
    historyLabel: "Basic scan history"
  },
  {
    code: "pro",
    label: "Pro",
    priceLabel: "$149/mo",
    description: "Deeper evidence history and daily monitoring options within credits.",
    domainsLabel: "10 monitored domains",
    scanCreditsLabel: "500 credits/month",
    cadenceLabel: "Daily available within credits",
    historyLabel: "Evidence history"
  },
  {
    code: "agency",
    label: "Agency / Portfolio",
    priceLabel: "$399/mo",
    description: "Portfolio monitoring for teams reviewing many public sites.",
    domainsLabel: "50 monitored domains",
    scanCreditsLabel: "3,000 credits/month",
    cadenceLabel: "Scheduled monitoring",
    historyLabel: "Portfolio evidence history"
  }
] as const;

const planCardContent = {
  free: {
    badge: "Preview",
    badgeClassName: "bg-amber-100 text-amber-800 ring-amber-200",
    cardClassName:
      "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_42px_rgba(245,158,11,0.12)]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(245,158,11,0.22)_0%,rgba(251,191,36,0.34)_100%)]",
    glowClassName: "bg-amber-300/70",
    valueClassName: "text-amber-950",
    statCardClassName: "bg-white/90 ring-amber-100",
    summaryLabel: "Best for a first look",
    bullets: [
      "One submitted site or homepage preview",
      "Limited scan evidence for review",
      "Manual scan request only",
      "Automated findings are review signals"
    ],
    footerNote: "Use the preview to see public-web observations before adding monitoring.",
    ctaHref: "/",
    ctaLabel: "Run a free scan",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#f59e0b_0%,#fbbf24_58%,#fde68a_100%)] text-slate-950 shadow-[0_14px_32px_rgba(245,158,11,0.18)] hover:brightness-[1.03]"
  },
  starter: {
    badge: "Starter",
    badgeClassName: "bg-lime-100 text-lime-800 ring-lime-200",
    cardClassName:
      "border-lime-200 bg-[linear-gradient(180deg,rgba(250,253,244,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_42px_rgba(132,204,22,0.12)]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(132,204,22,0.2)_0%,rgba(190,242,100,0.34)_100%)]",
    glowClassName: "bg-lime-300/70",
    valueClassName: "text-lime-950",
    statCardClassName: "bg-white/90 ring-lime-100",
    summaryLabel: "Best for one monitored site",
    bullets: [
      "50 scan credits included each month",
      "Weekly monitoring for one domain",
      "Manual re-scans use included credits",
      "Basic scan history for follow-up review"
    ],
    footerNote: "Starter keeps monitoring predictable for a single public site.",
    ctaHref: "/monitor-site?source=pricing&plan=starter",
    ctaLabel: "Get started",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#65a30d_0%,#84cc16_58%,#bef264_100%)] text-slate-950 shadow-[0_14px_32px_rgba(132,204,22,0.18)] hover:brightness-[1.03]"
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
      "500 scan credits included each month",
      "Daily monitoring available within credits",
      "Manual re-scans use included credits",
      "Evidence history and benchmark context badges"
    ],
    footerNote: "Pro is the cleanest upgrade path for deeper page coverage and review history.",
    ctaHref: "/monitor-site?source=pricing&plan=pro",
    ctaLabel: "Get started",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
  },
  agency: {
    badge: "Portfolio",
    badgeClassName: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    cardClassName:
      "border-emerald-200 bg-[linear-gradient(180deg,rgba(249,253,250,1)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_24px_56px_rgba(71,181,74,0.15)]",
    accentClassName: "bg-[linear-gradient(90deg,rgba(71,181,74,0.2)_0%,rgba(124,207,121,0.32)_100%)]",
    glowClassName: "bg-emerald-300/80",
    valueClassName: "text-emerald-950",
    statCardClassName: "bg-white/90 ring-emerald-100",
    summaryLabel: "Built for portfolio monitoring",
    bullets: [
      "3,000 scan credits included each month",
      "Scheduled monitoring across a portfolio",
      "Manual re-scans use included credits",
      "Portfolio evidence history for client or stakeholder review"
    ],
    footerNote: "Agency is built for agencies, consultants, and teams reviewing many domains in parallel.",
    ctaHref: "/contact-sales?source=pricing&plan=agency",
    ctaLabel: "Contact sales",
    ctaClassName:
      "border-0 bg-[linear-gradient(135deg,#47b54a_0%,#63c864_58%,#8add89_100%)] text-slate-950 shadow-[0_14px_32px_rgba(71,181,74,0.18)] hover:brightness-[1.03]"
  }
} as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl space-y-4">
          <Badge tone="neutral">Simple limits aligned with scan volume.</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Pricing that scales with monitored sites and scan volume.</h1>
          <p className="text-lg text-slate-600">
            Start with lightweight public-site scans, then add recurring monitoring, deeper page coverage, and evidence history as your review needs grow.
          </p>
          <p className="text-sm leading-6 text-slate-600">
            Scan credits keep pricing aligned with actual monitoring depth. Automated findings are review signals, not legal advice or compliance
            determinations.
          </p>
          <div className="flex flex-wrap gap-3">
            <PendingButtonLink
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              href="/"
              idleContent="Run a free scan"
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

        <div className="mt-10 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {marketingPlans.map((plan) => {
            return (
              <Card
                key={plan.code}
                className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] transition-transform duration-200 hover:-translate-y-1 ${planCardContent[plan.code].cardClassName}`}
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
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{plan.domainsLabel}</span>
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
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Domains</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.domainsLabel}</p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Scan credits</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.scanCreditsLabel}</p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Monitoring</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.cadenceLabel}</p>
                      </div>
                      <div className={`rounded-[16px] px-2 py-2 ring-1 ${planCardContent[plan.code].statCardClassName}`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">History</p>
                        <p className="mt-1 font-medium text-slate-900">{plan.historyLabel}</p>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
          Monitoring requests are reviewed before activation. Submitting a request does not automatically activate monitoring.
        </p>

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
                  Enterprise is for larger teams that need custom domains, custom scan volume, onboarding help, priority support, security review, or tailored workflows.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Domains</p>
                  <p className="mt-1 font-medium text-slate-900">Custom volume</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Scan volume</p>
                  <p className="mt-1 font-medium text-slate-900">Custom credits</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Onboarding</p>
                  <p className="mt-1 font-medium text-slate-900">Hands-on</p>
                </div>
                <div className="rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Review needs</p>
                  <p className="mt-1 font-medium text-slate-900">Retention and security</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 md:justify-self-end">
              <p className="text-sm leading-6 text-slate-600 md:max-w-sm">
                Talk to us if you need high-frequency monitoring, portfolio-scale coverage, or a tailored rollout beyond the standard plans.
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

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200 bg-white shadow-none md:col-span-1">
            <CardContent className="space-y-3 p-5">
              <Badge tone="neutral">Scan credits</Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">What is a scan credit?</h2>
              <p className="text-sm leading-6 text-slate-600">
                A scan credit represents one automated scan of one public page or URL under standard scan mode. Monitoring checks and manual re-scans
                consume scan credits. This keeps pricing predictable for small sites while supporting deeper portfolio coverage when needed.
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-none md:col-span-2">
            <CardContent className="space-y-3 p-5">
              <Badge tone="neutral">Why scan-volume pricing?</Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Coverage needs vary by site and team.</h2>
              <p className="text-sm leading-6 text-slate-600">
                Website review needs vary. One team may want weekly homepage monitoring for a single site; another may need recurring checks across a
                portfolio. Scan credits let teams allocate usage across domains, pages, and monitoring frequency without forcing everyone into the same
                scan pattern.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 border-slate-200 bg-white shadow-none">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Need deeper coverage or more frequent monitoring?</h2>
              <p className="text-sm leading-6 text-slate-600">
                Add scan credits or talk to us about portfolio and high-frequency monitoring. Extra scan credit packs, additional domains, and higher-frequency
                monitoring are available for paid plans.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">High-frequency monitoring</p>
              <p className="text-sm leading-6 text-slate-600">
                Hourly or high-frequency monitoring is available for higher-volume use cases, but is not included by default on standard plans. Contact us
                for custom monitoring needs.
              </p>
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
                    <th className="px-6 py-4 font-medium">Starter</th>
                    <th className="px-6 py-4 font-medium">Pro</th>
                    <th className="px-6 py-4 font-medium">Agency / Portfolio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.label}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.starter}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.pro}</td>
                      <td className="px-6 py-4 text-slate-600">{row.values.agency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-6 text-slate-500">
          CertScore.ai provides automated public-web observations and evidence-backed review signals. It does not provide legal advice, certification, or
          compliance determinations.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
