import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@website-signal-risk-scanner/ui";
import { SocialFollowLinks } from "../../../components/releases/social-follow-links";
import {
  createReleaseArticleSchema,
  createReleaseMetadata,
  formatReleaseDate,
  getPublishedRelease,
  getPublishedReleases,
  releasePath
} from "../../../lib/releases";
import { createBreadcrumbSchema } from "../../../lib/seo";

type ReleasePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getPublishedReleases().map((release) => ({ slug: release.slug }));
}

export async function generateMetadata({ params }: ReleasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const release = getPublishedRelease(slug);
  return release ? createReleaseMetadata(release) : {};
}

export default async function ReleaseDetailPage({ params }: ReleasePageProps) {
  const { slug } = await params;
  const release = getPublishedRelease(slug);
  if (!release) notFound();

  const schemas = [
    createReleaseArticleSchema(release),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Releases", path: "/releases" },
      { name: release.headline, path: releasePath(release) }
    ])
  ];

  return (
    <main>
      <article>
      {schemas.map((schema) => (
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          key={JSON.stringify(schema)}
          type="application/ld+json"
        />
      ))}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">{release.category}</Badge>
            <time className="text-sm font-medium text-slate-500" dateTime={release.publicationDate}>
              {formatReleaseDate(release.publicationDate)}
            </time>
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            {release.headline}
          </h1>
          <p className="mt-6 max-w-3xl text-xl leading-9 text-slate-600">{release.shortDescription}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-12 px-6 py-14 sm:py-16">
        <section aria-label="Release introduction" className="space-y-5 text-base leading-8 text-slate-700">
          {release.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>

        {release.sections.map((section) => (
          <section className="scroll-mt-28" id={section.id} key={section.id}>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{section.heading}</h2>
            {section.paragraphs?.length ? (
              <div className="mt-5 space-y-4 text-base leading-8 text-slate-700">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            ) : null}
            {section.bullets?.length ? (
              <ul className="mt-5 grid gap-3 text-base leading-7 text-slate-700">
                {section.bullets.map((item) => (
                  <li className="flex gap-3" key={item}>
                    <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {section.steps?.length ? (
              <ol className="mt-5 grid gap-4 text-base leading-7 text-slate-700">
                {section.steps.map((item, index) => (
                  <li className="flex gap-4" key={item}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ))}

        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:p-8" aria-labelledby="try-release">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Try it</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950" id="try-release">
            {release.ctaHeading}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            {release.ctaDescription}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              data-analytics-feature="release_cta"
              data-analytics-id="release:mcp-light:product"
              href={release.primaryCta.href}
            >
              {release.primaryCta.label}
            </Link>
            {release.resourceLinks?.map((link) => (
              <Link
                className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                data-analytics-feature="release_resource"
                data-analytics-id={`release:${release.slug}:${link.href.replaceAll("/", "-")}`}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        <aside className="border-t border-slate-200 pt-8" aria-label="CertScore.ai social profiles">
          <SocialFollowLinks />
        </aside>
      </div>
      </article>
    </main>
  );
}
