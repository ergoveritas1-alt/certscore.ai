import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
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
    href: "/solutions/gdpr-website-compliance-scanner",
    imageAlt:
      "Sample GDPR website scan report showing executive summary scores, third-party requests, pre-consent cookies, signal snapshot, policy surfaces, and scan timeline.",
    imageSrc: "/images/gdpr-website-scanner-solution.png",
    meta: "GDPR / ePrivacy"
  },
  {
    title: "Cookie consent scanner",
    description: "Check cookie timing, CMP behavior, third-party cookies before consent, and reject-path signals.",
    href: "/solutions/cookie-consent-scanner",
    imageAlt:
      "Pre-consent cookies and trackers table showing purpose mix, priority mix, vendor rows, first-seen timing, and GDPR ePrivacy checklist rating mix.",
    imageSrc: "/images/cookie-consent-scanner-solution.png",
    meta: "Consent controls"
  },
  {
    title: "Privacy policy risk scanner",
    description: "Compare public privacy disclosures with observable website behavior and vendor signals.",
    href: "/solutions/privacy-policy-risk-scanner",
    imageAlt:
      "Policy excerpt modal showing retained privacy policy source URL and matched controller contact disclosure evidence.",
    imageSrc: "/how-it-works/policy-detail.png",
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

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {solutions.map((solution) => (
          <Link key={solution.href} href={solution.href} className="group block">
            <article className="h-full">
              <div className="relative aspect-[1.24] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
                <Image
                  src={solution.imageSrc}
                  alt={solution.imageAlt}
                  fill
                  className="object-cover object-top transition duration-300 group-hover:scale-[1.02]"
                  sizes="(min-width: 1024px) 352px, (min-width: 768px) 45vw, 100vw"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(248,250,252,0.94)_100%)]"
                />
              </div>
              <div className="pt-4">
                <p className="text-xs font-semibold text-slate-500">{solution.meta}</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-slate-950 group-hover:text-sky-700">
                  {solution.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{solution.description}</p>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
