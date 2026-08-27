import type { Metadata } from "next";
import { Badge } from "@website-signal-risk-scanner/ui";
import { ReleaseCard } from "../../components/releases/release-card";
import { getPublishedReleases, releasePath } from "../../lib/releases";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

const title = "CertScore.ai Releases";
const description =
  "Product updates, new website privacy-detection capabilities, integrations and developer tools from CertScore.ai.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/releases",
  title
});

export default function ReleasesPage() {
  const releases = getPublishedReleases();
  const schemas = [
    createPublicWebPageSchema({ description, path: "/releases", title }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Releases", path: "/releases" }
    ]),
    createItemListSchema({
      description,
      items: releases.map((release) => ({
        description: release.shortDescription,
        name: release.headline,
        path: releasePath(release)
      })),
      name: title,
      path: "/releases"
    })
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          key={JSON.stringify(schema)}
          type="application/ld+json"
        />
      ))}

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Releases</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
        <p className="text-lg leading-8 text-slate-600">{description}</p>
      </div>

      <div className="mt-10 grid gap-6">
        {releases.map((release) => (
          <ReleaseCard key={release.slug} release={release} showImage />
        ))}
      </div>
    </main>
  );
}
