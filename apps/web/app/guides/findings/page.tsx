import type { Metadata } from "next";
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
    title: "CertScore findings reference",
    description:
      "Review CertScore findings, evidence, signals, and observations surfaced from public-web runtime scans.",
    path: "/guides/findings"
  }),
  title: {
    absolute: "CertScore findings reference | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  const findings = getFindingReferenceItems();
  const schemas = [
    createPublicWebPageSchema({
      title: "CertScore findings reference",
      description:
        "Review CertScore findings, evidence, signals, and observations surfaced from public-web runtime scans.",
      path: "/guides/findings"
    }),
    createPublicArticleSchema({
      title: "CertScore findings reference",
      description:
        "A technical reference for CertScore findings, observed signals, retained evidence, and reviewer context.",
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
    <section className="mx-auto max-w-6xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          key={JSON.stringify(schema)}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Technical reference</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          CertScore findings reference
        </h1>
        <p className="text-lg leading-8 text-slate-600">
          CertScore uses findings, evidence, signals, and observations consistently: signals are raw runtime or page-surface events, evidence is retained support, observations are interpreted evidence context, and findings are promoted review items.
        </p>
        <p className="text-sm leading-7 text-slate-500">
          Findings are runtime evidence and public-surface observations for review. Observed signals may surface possible concerns, but review is recommended before operational or legal reliance.
        </p>
      </div>

      <div className="mt-10">
        <FindingAtlasBrowser findings={findings} />
      </div>
    </section>
  );
}
