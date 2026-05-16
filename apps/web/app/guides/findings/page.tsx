import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button } from "@website-signal-risk-scanner/ui";
import { FindingAtlasBrowser } from "../../../components/marketing/findings/finding-atlas-browser";
import { getTopFindingAtlasItems } from "../../../lib/marketing/finding-atlas";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../../lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Top website scan findings",
    description:
      "Review the top CertScore automated website findings with density metrics, mitigation guidance, metadata, and sample JSON evidence.",
    path: "/guides/findings"
  }),
  title: {
    absolute: "Top website scan findings | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  const findings = getTopFindingAtlasItems();
  const schemas = [
    createPublicWebPageSchema({
      title: "Top website scan findings",
      description:
        "Review the top CertScore automated website findings with density metrics, mitigation guidance, metadata, and sample JSON evidence.",
      path: "/guides/findings"
    }),
    createPublicArticleSchema({
      title: "Top website scan findings",
      description:
        "A practical evidence atlas for common public website scan findings, including density metrics and mitigation guidance.",
      path: "/guides/findings",
      type: "TechArticle",
      about: ["website scanning", "tracking", "cookies", "accessibility", "consent", "JSON evidence"]
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: "Top website scan findings", path: "/guides/findings" }
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
          <Badge tone="neutral">Evidence atlas</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Top website scan findings
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            A field guide to common CertScore automated findings: what they mean, how often they appear in recent scan samples, what to review, and what sample JSON evidence looks like.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-none">
          <p className="text-sm leading-6 text-slate-600">
            Findings are automated public-web observations for review. Density is directional market context, not a legal conclusion.
          </p>
          <Button
            asChild
            className="mt-4 border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
          >
            <Link data-analytics-cta-type="scan" data-analytics-event="finding_atlas_cta_clicked" href="/">
              Run a scan
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-10">
        <FindingAtlasBrowser findings={findings} />
      </div>
    </section>
  );
}
