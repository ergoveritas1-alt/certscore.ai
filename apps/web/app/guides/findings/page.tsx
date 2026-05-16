import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { FindingAtlasBrowser } from "../../../components/marketing/findings/finding-atlas-browser";
import { getFindingReferenceItems } from "../../../lib/marketing/finding-atlas";
import {
  absoluteUrl,
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../../lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Findings registry and detection methodology",
    description:
      "Reference CertScore finding IDs, evidence semantics, detection methodology, benchmark prevalence, related findings, and limitations.",
    path: "/guides/findings"
  }),
  title: {
    absolute: "Findings registry and detection methodology | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  const findings = getFindingReferenceItems();
  const schemas = [
    createPublicWebPageSchema({
      title: "Findings registry and detection methodology",
      description:
        "Reference CertScore finding IDs, evidence semantics, detection methodology, benchmark prevalence, related findings, and limitations.",
      path: "/guides/findings"
    }),
    createPublicArticleSchema({
      title: "Findings registry and detection methodology",
      description:
        "A canonical technical reference for CertScore findings, observed signals, retained evidence, confidence semantics, and review limitations.",
      path: "/guides/findings",
      type: "TechArticle",
      about: [
        "website scanning",
        "runtime evidence",
        "finding registry",
        "tracking signals",
        "cookies",
        "accessibility",
        "consent methodology"
      ]
    }),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "CertScore finding registry",
      itemListElement: findings.map((finding, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${absoluteUrl("/guides/findings")}#${finding.id}`,
        name: finding.title,
        identifier: finding.id,
        description: finding.observed
      }))
    },
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: "Findings registry", path: "/guides/findings" }
    ])
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          key={JSON.stringify(schema)}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="grid gap-8 lg:grid-cols-[0.8fr_0.5fr] lg:items-end">
        <div className="max-w-3xl space-y-4">
          <Badge tone="neutral">Technical reference</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            CertScore findings registry
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            Canonical finding IDs, categories, criticality, confidence semantics, observed signals, detection methodology, example evidence, benchmark prevalence, related findings, and review limitations.
          </p>
          <p className="text-sm leading-7 text-slate-500">
            CertScore uses findings, evidence, signals, and observations consistently: signals are raw runtime or page-surface events, evidence is retained support, observations are interpreted evidence context, and findings are promoted review items.
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-5 shadow-none">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cautious posture</p>
          <p className="text-sm leading-6 text-slate-600">
            Findings are runtime evidence and public-surface observations for review. The page avoids pass/fail legal conclusions: observed signals may surface possible concerns, but review is recommended before operational or legal reliance.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-sky-700">
            <Link href="/methodology" className="hover:text-sky-800">
              Full methodology
            </Link>
            <Link href="/how-it-works" className="hover:text-sky-800">
              Report workflow
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <FindingAtlasBrowser findings={findings} />
      </div>
    </section>
  );
}
