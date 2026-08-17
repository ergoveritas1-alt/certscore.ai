import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { PendingButtonLink } from "../../components/ui/pending-link";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

const title = "Compare website scanning approaches";
const description =
  "Compare static cookie inventory, CMP configuration review, and runtime public-web behavior observations for website review workflows.";

const comparisonPages = [
  {
    href: "/compare/privacy-scanner-vs-cookie-scanner",
    label: "Privacy scanner vs cookie scanner",
    summary: "Understand the difference between cookie inventory and broader behavior-oriented privacy review signals."
  },
  {
    href: "/compare/website-consent-audit-tools",
    label: "Website consent audit tools",
    summary: "Compare tools by whether they review banner controls, tracking timing, cookies, reject behavior, and evidence."
  },
  {
    href: "/compare/cmp-vs-runtime-consent-scanner",
    label: "CMP vs runtime consent scanner",
    summary: "See how consent platforms and runtime browser observations can complement each other."
  },
  {
    href: "/compare/cookiebot-alternative-runtime-testing",
    label: "Cookiebot runtime testing",
    summary: "Review how runtime testing can add evidence around tags, cookies, and third-party requests."
  },
  {
    href: "/compare/onetrust-runtime-consent-testing",
    label: "OneTrust runtime consent testing",
    summary: "Learn how runtime observations can support review of live behavior around CMP-managed choices."
  }
];

const approachCards = [
  {
    title: "Static cookie inventory",
    body: "Useful for identifying cookie names, domains, categories, and lifetimes, but it may not explain consent timing or request behavior."
  },
  {
    title: "CMP configuration review",
    body: "Useful for checking notices, categories, preference centers, and consent settings inside the consent platform."
  },
  {
    title: "Runtime behavior observations",
    body: "Useful for reviewing what appears to happen in the browser before and after consent choices using retained evidence for human and agentic review."
  }
];

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/compare"
  }),
  title: {
    absolute: `${title} | CertScore.ai`
  }
};

export default function CompareIndexPage() {
  const schema = [
    createPublicWebPageSchema({
      title,
      description,
      path: "/compare"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Compare", path: "/compare" }
    ])
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          type="application/ld+json"
        />
        <div className="max-w-3xl space-y-4">
          <Badge tone="neutral">Comparison</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="text-lg leading-8 text-slate-600">
            Static cookie inventory, CMP configuration review, and runtime website behavior observations answer different
            questions. CertScore.ai focuses on automated public-web observations that can surface review signals for
            teams to investigate.
          </p>
          <div className="flex flex-wrap gap-3">
            <PendingButtonLink
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              href="/"
              idleContent="Start a trial scan"
              pendingContent="Opening..."
            />
            <PendingButtonLink
              className="border-slate-200 bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100"
              href="/methodology"
              idleContent="Review methodology"
              pendingContent="Opening..."
              variant="secondary"
            />
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {approachCards.map((approach) => (
            <Card key={approach.title} className="border-slate-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">{approach.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">{approach.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 space-y-4">
          <div className="max-w-2xl space-y-2">
            <Badge tone="neutral">Comparison pages</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Review related approaches</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {comparisonPages.map((page) => (
              <Link
                key={page.href}
                className="group rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                href={page.href}
              >
                <p className="text-lg font-semibold text-slate-950 group-hover:text-sky-700">{page.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{page.summary}</p>
              </Link>
            ))}
          </div>
        </div>

        <Card className="mt-12 border-sky-100 bg-sky-50/70 shadow-none">
          <CardContent className="p-5">
            <p className="text-sm leading-6 text-slate-700">
              Automated observations are review signals. They should be reviewed with vendor configuration, consent
              settings, geography, and public disclosures before teams rely on them for operational decisions.
              CertScore.ai does not provide legal advice or certification.
            </p>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
