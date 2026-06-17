import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

const pageTitle = "Regulatory Website Signal Pages | CertScore.ai";
const pageDescription =
  "Browse CertScore.ai public regulatory signal pages for GDPR/ePrivacy, accessibility, cookie, consent, disclosure, and privacy review workflows.";
const pagePath = "/regulatory";

const regulatoryPages = [
  {
    href: "/gdpr",
    title: "GDPR privacy scanner",
    description:
      "Runtime consent, cookie, tracking, session replay, fingerprinting, and disclosure-alignment signals for GDPR/ePrivacy review."
  },
  {
    href: "/ftc",
    title: "FTC disclosure scanner",
    description:
      "Disclosure, endorsement, review, promotional-claim, subscription-friction, privacy-claim, and runtime behavior signals for FTC-oriented review."
  },
  {
    href: "/accessibility",
    title: "ADA accessibility scanner",
    description:
      "Public-page ADA and WCAG-oriented accessibility signals, including contrast, labels, image alternatives, heading structure, forms, and repeated component patterns."
  },
  {
    href: "/guides/ada-website-compliance",
    title: "ADA website accessibility guide",
    description:
      "Accessibility signal guidance for public website review, including homepage checks and WCAG-oriented triage."
  },
  {
    href: "/guides/cookie-consent-laws",
    title: "Cookie consent laws guide",
    description:
      "Educational overview of cookie consent topics and the observable website behavior teams commonly review."
  },
  {
    href: "/guides/website-privacy-policy-requirements",
    title: "Privacy policy requirements guide",
    description:
      "Policy-topic and disclosure-surface review guidance for comparing public statements with observed website behavior."
  },
  {
    href: "/guides/website-disclosure-requirements",
    title: "Website disclosure requirements guide",
    description:
      "Disclosure signal guidance for endorsement, affiliate, testimonial, promotional, and public-claim review."
  }
];

export const metadata: Metadata = createPageMetadata({
  title: pageTitle,
  description: pageDescription,
  path: pagePath
});

export default function RegulatoryIndexPage() {
  const schemas = [
    createPublicWebPageSchema({
      title: pageTitle,
      description: pageDescription,
      path: pagePath
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Regulatory pages", path: pagePath }
    ]),
    createItemListSchema({
      name: "CertScore.ai regulatory signal pages",
      description: pageDescription,
      path: pagePath,
      items: regulatoryPages.map((page) => ({
        name: page.title,
        description: page.description,
        path: page.href
      }))
    })
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {schemas.map((schema) => (
        <script key={JSON.stringify(schema)} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Regulatory signals</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Public regulatory signal pages</h1>
            <p className="text-lg leading-8 text-slate-600">
              CertScore pages translate public website observations into review queues for privacy, cookie, consent, accessibility, and disclosure work. They are evidence guides, not legal advice or compliance determinations.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 md:grid-cols-2">
          {regulatoryPages.map((page) => (
            <Card key={page.href} className="border-slate-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">{page.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                <p>{page.description}</p>
                <Link href={page.href} className="inline-flex text-sm font-medium text-sky-700 hover:text-sky-800">
                  Open page
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
