import Image from "next/image";
import Link from "next/link";
import type { ProductRelease } from "../../lib/releases";
import { formatReleaseDate, releasePath } from "../../lib/releases";

export function ReleaseCard({
  headingLevel = "h2",
  release,
  showImage = false
}: {
  headingLevel?: "h2" | "h3";
  release: ProductRelease;
  showImage?: boolean;
}) {
  const Heading = headingLevel;

  return (
    <article className="group h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-none transition hover:border-sky-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      {showImage && release.cardImage ? (
        <Link className="block overflow-hidden border-b border-slate-200 bg-slate-950" href={releasePath(release)} tabIndex={-1}>
          <Image
            alt={release.cardImage.alt}
            className="h-auto w-full transition duration-300 group-hover:scale-[1.01]"
            height={release.cardImage.height}
            sizes="(min-width: 1024px) 48rem, 100vw"
            src={release.cardImage.path}
            width={release.cardImage.width}
          />
        </Link>
      ) : null}
      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span>{release.category}</span>
          <span aria-hidden="true" className="text-slate-300">•</span>
          <time dateTime={release.publicationDate}>{formatReleaseDate(release.publicationDate)}</time>
        </div>
        <Heading className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          <Link className="transition group-hover:text-sky-700" href={releasePath(release)}>
            {release.headline}
          </Link>
        </Heading>
        <p className="mt-3 text-sm leading-7 text-slate-600">{release.shortDescription}</p>
        <Link className="mt-5 inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-900" href={releasePath(release)}>
          Read release <span aria-hidden="true" className="ml-1">→</span>
        </Link>
      </div>
    </article>
  );
}
