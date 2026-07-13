import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { ScannerSolutionAnimation } from "../../components/marketing/scanner-solution-animation";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

const solutions = [
  {
    title: "GDPR website scanner",
    description:
      "Review consent, cookie, tracking, policy, and disclosure signals for GDPR/ePrivacy workflows.",
    href: "/solutions/gdpr-website-compliance-scanner",
    animation: "trace" as const,
    meta: "GDPR / ePrivacy"
  },
  {
    title: "Cookie consent scanner",
    description:
      "Check cookie timing, CMP behavior, third-party cookies before consent, and reject-path review signals.",
    href: "/solutions/cookie-consent-scanner",
    animation: "waterfall" as const,
    meta: "Consent controls"
  },
  {
    title: "Privacy policy risk scanner",
    description:
      "Compare observable website behavior with privacy, cookie, vendor, and disclosure surfaces.",
    href: "/solutions/privacy-policy-risk-scanner",
    animation: "policy" as const,
    meta: "Policy surfaces"
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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {solutions.map((solution) => (
          <Link key={solution.href} href={solution.href} className="group block">
            <article className="h-full">
              <div className="relative aspect-[340/300] overflow-hidden rounded-lg border border-slate-200 bg-[#0b2340] shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_48px_rgba(15,23,42,0.16)]">
                <ScannerSolutionAnimation type={solution.animation} />
              </div>
              <div className="pt-4">
                <p className="text-xs font-semibold text-slate-500">{solution.meta}</p>
                <h2 className="mt-2 text-xl font-semibold leading-tight tracking-tight text-slate-950 group-hover:text-sky-700">
                  {solution.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{solution.description}</p>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
