import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../layout/site-footer";
import { SiteHeader } from "../layout/site-header";
import { DomainScanForm } from "./domain-scan-form";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../lib/seo";

type LinkItem = {
  href: string;
  label: string;
};

type SignalCard = {
  body: string;
  title: string;
};

type RegulatoryPageConfig = {
  badge: string;
  description: string;
  disclaimer: string;
  evidenceRows: ReadonlyArray<readonly [string, string]>;
  evidenceTitle?: string;
  faqs: Array<{
    answer: string;
    question: string;
  }>;
  heroChips: string[];
  path: string;
  primaryCtaLocation: string;
  reviewContexts: Array<{
    body: string;
    links: LinkItem[];
    title: string;
  }>;
  schemaAbout: string[];
  signalCards: SignalCard[];
  steps: string[];
  summary: string;
  title: string;
};

function CtaButtons({ location }: { location: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        asChild
        className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
      >
        <Link href="#scan" data-analytics-cta-location={location} data-analytics-event="guide_cta_clicked">
          Start a trial scan &rarr;
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/findings">Browse findings</Link>
      </Button>
    </div>
  );
}

function ExternalLink({ href, label }: LinkItem) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" className="text-sm font-medium text-sky-700 hover:text-sky-800">
      {label}
    </a>
  );
}

export function RegulatoryPage({ config }: { config: RegulatoryPageConfig }) {
  const schemas = [
    createPublicWebPageSchema({
      title: config.title,
      description: config.description,
      path: config.path
    }),
    createPublicArticleSchema({
      title: config.title,
      description: config.description,
      path: config.path,
      type: "TechArticle",
      about: config.schemaAbout
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Regulatory pages", path: "/regulatory" },
      { name: config.badge, path: config.path }
    ]),
    createItemListSchema({
      name: `${config.badge} review signals`,
      description: `Public-web review signals CertScore surfaces for ${config.badge}.`,
      path: config.path,
      items: config.signalCards.map((card) => ({
        name: card.title,
        description: card.body,
        path: config.path
      }))
    }),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: config.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer
        }
      }))
    }
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {schemas.map((schema) => (
        <script key={JSON.stringify(schema)} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <Badge tone="neutral">{config.badge}</Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{config.title}</h1>
              <p className="text-lg leading-8 text-slate-600">{config.summary}</p>
            </div>
            <CtaButtons location={config.primaryCtaLocation} />
            <div className="flex flex-wrap gap-2">
              {config.heroChips.map((chip) => (
                <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {chip}
                </span>
              ))}
            </div>
            <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-950">{config.disclaimer}</p>
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-[0_22px_60px_rgba(2,6,23,0.28)]">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Production example, sanitized</p>
              <CardTitle className="text-xl text-white">{config.evidenceTitle ?? "Review evidence card"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {config.evidenceRows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3 border-b border-slate-800 pb-3 last:border-b-0 last:pb-0">
                  <span className="font-mono text-xs text-slate-500">{label}</span>
                  <span className="min-w-0 break-words font-medium text-slate-100">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="border border-slate-200 bg-white p-5 text-base leading-7 text-slate-700">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Direct answer</h2>
          <p className="mt-3">{config.description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Review signals</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">What CertScore can surface for review</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {config.signalCards.map((card) => (
            <Card key={card.title} className="border-slate-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950">{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-600">{card.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Regulatory context</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Context for human review</h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {config.reviewContexts.map((context) => (
              <Card key={context.title} className="border-slate-200 bg-slate-50 shadow-none">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">{context.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                  <p>{context.body}</p>
                  {context.links.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {context.links.map((link) => (
                        <ExternalLink key={link.href} href={link.href} label={link.label} />
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Methodology</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">From public page load to review queue</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {config.steps.map((step, index) => (
            <Card key={step} className="border-slate-200 bg-white shadow-none">
              <CardContent className="flex gap-4 p-5 text-sm leading-6 text-slate-600">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                  {index + 1}
                </span>
                <p>{step}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">FAQ</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{config.badge} FAQ</h2>
        </div>
        <div className="mt-8 grid gap-4">
          {config.faqs.map((faq) => (
            <details key={faq.question} className="border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-base font-semibold text-slate-950">{faq.question}</summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="scan" className="mx-auto max-w-6xl px-6 py-16">
        <div className="border border-slate-200 bg-white p-6">
          <DomainScanForm
            buttonLabel="Start a trial scan"
            helperText="Public website scans surface automated observations for review."
            inputLabel="Website domain"
            mode="preview"
            scanSource="unknown"
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
