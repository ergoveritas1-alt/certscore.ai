import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@website-signal-risk-scanner/ui";
import {
  getGdprEprivacyChecklistReferenceItem,
  getGdprEprivacyChecklistReferenceItems,
  getGdprEprivacyChecklistReferencePath
} from "../../../../lib/marketing/gdpr-eprivacy-checklist-reference";
import { getFindingReferenceItems } from "../../../../lib/marketing/finding-atlas";
import {
  createBreadcrumbSchema,
  createDefinedTermSchema,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../../../lib/seo";

type GdprEprivacyChecklistRowPageProps = {
  params: Promise<{
    rowId: string;
  }>;
};

export function generateStaticParams() {
  return getGdprEprivacyChecklistReferenceItems().map((row) => ({
    rowId: row.id
  }));
}

export async function generateMetadata({ params }: GdprEprivacyChecklistRowPageProps): Promise<Metadata> {
  const { rowId } = await params;
  const row = getGdprEprivacyChecklistReferenceItem(rowId);

  if (!row) {
    return {
      title: "GDPR/ePrivacy checklist row not found | CertScore.ai",
      robots: {
        index: false,
        follow: false
      }
    };
  }

  return {
    title: `${row.label} GDPR/ePrivacy checklist reference | CertScore.ai`,
    description: `${row.explanation} Review retained evidence, status language, source-signal gaps, limitations, and related direct findings for this CertScore checklist row.`,
    alternates: {
      canonical: row.path
    }
  };
}

export default async function GdprEprivacyChecklistRowPage({ params }: GdprEprivacyChecklistRowPageProps) {
  const { rowId } = await params;
  const row = getGdprEprivacyChecklistReferenceItem(rowId);

  if (!row) {
    notFound();
  }

  const directFindings = getFindingReferenceItems().filter((finding) => row.findingIds.includes(finding.id));
  const schemas = [
    createPublicWebPageSchema({
      title: `${row.label} GDPR/ePrivacy checklist reference`,
      description: row.explanation,
      path: getGdprEprivacyChecklistReferencePath(row.id)
    }),
    createPublicArticleSchema({
      title: `${row.label} GDPR/ePrivacy checklist reference`,
      description:
        "A technical reference for a CertScore GDPR/ePrivacy evidence checklist row, including retained evidence, status language, limitations, and reviewer context.",
      path: getGdprEprivacyChecklistReferencePath(row.id),
      type: "TechArticle",
      about: [
        "GDPR/ePrivacy evidence checklist",
        row.category,
        row.label,
        "retained evidence",
        "coverage limitations"
      ]
    }),
    createDefinedTermSchema({
      category: row.category,
      description: row.explanation,
      inDefinedTermSetPath: "/findings",
      name: row.label,
      path: getGdprEprivacyChecklistReferencePath(row.id),
      termCode: row.id
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Findings and evidence checklist", path: "/findings" },
      { name: "GDPR/ePrivacy checklist", path: "/findings#gdpr-eprivacy-checklist-directory" },
      { name: row.label, path: getGdprEprivacyChecklistReferencePath(row.id) }
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
        <Badge tone="neutral">GDPR/ePrivacy checklist row</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{row.label}</h1>
        <p className="text-base leading-7 text-slate-600">{row.explanation}</p>
        <p className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          CertScore reports automated public-web observations for review. This reference describes evidence and coverage
          semantics only; it is not legal advice, certification, or a compliance determination.
        </p>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Checklist row ID</h2>
          <p className="mt-3 break-words font-mono text-sm text-slate-700">{row.id}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Top-finding ID</h2>
          <p className="mt-3 break-words font-mono text-sm text-slate-700">{row.regulatoryGapFindingId}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Default signal</h2>
          <p className="mt-3 text-sm font-semibold text-slate-800">{row.defaultStatus}</p>
        </div>
      </section>

      <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="what-certscore-checks">
        <h2 id="what-certscore-checks" className="text-xl font-semibold tracking-tight text-slate-950">
          What CertScore checks
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          This row belongs to <span className="font-semibold text-slate-800">{row.category}</span>. The report evaluates
          retained evidence from the public scan context and may use this row as direct checklist evidence or as the source
          for a regulatory gap top finding.
        </p>
      </section>

      <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="status-language">
        <h2 id="status-language" className="text-xl font-semibold tracking-tight text-slate-950">Possible statuses</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {row.statusReference.map((status) => (
            <div key={status.status} className="border border-slate-200 bg-slate-50 p-4">
              <dt className="text-sm font-semibold text-slate-950">{status.status}</dt>
              <dd className="mt-2 text-sm leading-6 text-slate-600">{status.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Retained evidence examples</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
            {row.retainedEvidenceExamples.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Missing or incomplete evidence</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
            {row.missingEvidenceExamples.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="reviewer-notes">
        <h2 id="reviewer-notes" className="text-xl font-semibold tracking-tight text-slate-950">Reviewer notes</h2>
        <ul className="mt-4 max-w-3xl space-y-2 text-sm leading-6 text-slate-600">
          {row.reviewerNotes.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="related-direct-findings">
        <h2 id="related-direct-findings" className="text-xl font-semibold tracking-tight text-slate-950">
          Related direct findings
        </h2>
        {directFindings.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {directFindings.map((finding) => (
              <Link
                key={finding.id}
                href={`/findings/${finding.id}`}
                className="group block border border-slate-200 bg-slate-50 p-4 hover:border-sky-200 hover:bg-sky-50"
              >
                <span className="block text-sm font-semibold leading-5 text-sky-700 group-hover:text-sky-800">
                  {finding.title}
                </span>
                <span className="mt-1 block font-mono text-[11px] leading-5 text-slate-500">{finding.id}</span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">{finding.observed}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            This checklist row can be driven directly by retained checklist coverage evidence even when no public direct-finding
            page maps to it.
          </p>
        )}
      </section>

      <div className="mt-8">
        <Link
          href="/findings#gdpr-eprivacy-checklist-directory"
          className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to checklist reference
        </Link>
      </div>
    </section>
  );
}
