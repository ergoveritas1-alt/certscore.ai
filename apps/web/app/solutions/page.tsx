import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

const solutions = [
  {
    title: "GDPR website compliance scanner",
    description: "Review public website consent, cookie, tracking, policy, and disclosure signals.",
    href: "/solutions/gdpr-website-compliance-scanner"
  },
  {
    title: "Cookie consent scanner",
    description: "Check cookie timing, CMP behavior, third-party cookies before consent, and reject-path signals.",
    href: "/solutions/cookie-consent-scanner"
  },
  {
    title: "Privacy policy risk scanner",
    description: "Compare public privacy disclosures with observable website behavior and vendor signals.",
    href: "/solutions/privacy-policy-risk-scanner"
  }
] as const;

export const metadata: Metadata = createPageMetadata({
  title: "CertScore.ai Solutions",
  description:
    "Browse CertScore.ai scanner pages for GDPR, cookie consent, and privacy policy risk review signals.",
  path: "/solutions"
});

export default function SolutionsPage() {
  const schemas = [
    createPublicWebPageSchema({
      title: "CertScore.ai Solutions",
      description:
        "Browse CertScore.ai scanner pages for GDPR, cookie consent, and privacy policy risk review signals.",
      path: "/solutions"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Solutions", path: "/solutions" }
    ]),
    createItemListSchema({
      name: "CertScore.ai scanner solutions",
      description: "Public CertScore.ai solution pages for website risk-signal scanning.",
      path: "/solutions",
      items: solutions.map((solution) => ({
        name: solution.title,
        description: solution.description,
        path: solution.href
      }))
    })
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          key={JSON.stringify(schema)}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Solutions</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore.ai scanner solutions</h1>
        <p className="text-lg leading-8 text-slate-600">
          Focused scanner pages for teams reviewing public website privacy, cookies, consent, policy, and disclosure signals.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {solutions.map((solution) => (
          <Link key={solution.href} href={solution.href} className="group block">
            <Card className="h-full border-slate-200 bg-white shadow-none transition group-hover:border-sky-200 group-hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">{solution.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-7 text-slate-600">{solution.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
