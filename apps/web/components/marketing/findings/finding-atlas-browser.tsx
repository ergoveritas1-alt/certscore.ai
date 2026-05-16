"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@website-signal-risk-scanner/ui";
import {
  DETECTION_METHODOLOGY_SECTIONS,
  FINDING_REFERENCE_CATEGORIES,
  type FindingReferenceCategory,
  type FindingReferenceItem
} from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingReferenceItem[];
  compact?: boolean;
};

const criticalityClasses = {
  critical: "border-rose-200 bg-rose-50 text-rose-800",
  high: "border-amber-200 bg-amber-50 text-amber-900",
  medium: "border-sky-200 bg-sky-50 text-sky-800",
  low: "border-slate-200 bg-slate-50 text-slate-700"
} as const;

function formatDensity(value: number) {
  return `${value.toFixed(value < 1 ? 1 : 0)}%`;
}

function findRelatedTitle(findings: FindingReferenceItem[], id: string) {
  return findings.find((finding) => finding.id === id)?.title ?? id.replaceAll("_", " ");
}

function EvidenceBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="border border-slate-200 bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
        {title}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-slate-100">
        {code}
      </pre>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function FindingReferenceSection({
  finding,
  findings
}: {
  finding: FindingReferenceItem;
  findings: FindingReferenceItem[];
}) {
  return (
    <article id={finding.id} className="scroll-mt-24 border-t border-slate-200 py-8 first:border-t-0 first:pt-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full break-all font-mono text-xs text-slate-500">{finding.id}</span>
              <span className={`border px-2.5 py-1 text-xs font-semibold ${criticalityClasses[finding.criticality]}`}>
                {finding.criticality}
              </span>
              <span className="border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                {finding.category}
              </span>
              <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {finding.benchmarkBadge}
              </span>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{finding.title}</h3>
            <p className="text-sm leading-7 text-slate-600">{finding.observed}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-950">Confidence semantics</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{finding.confidenceSemantics}</p>
            </section>
            <section className="border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-950">Detection methodology</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{finding.detectionMethodology}</p>
            </section>
          </div>

          {finding.userImpact ? (
            <section className="border border-sky-100 bg-sky-50 p-4">
              <h4 className="text-sm font-semibold text-slate-950">User-impact example</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">{finding.userImpact}</p>
            </section>
          ) : null}

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-950">Example evidence</h4>
            <div className="grid gap-3 lg:grid-cols-2">
              {finding.exampleEvidence.map((example) => (
                <EvidenceBlock key={`${finding.id}-${example.title}`} title={example.title} code={example.code} />
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-950">Common causes</h4>
              <div className="mt-3">
                <BulletList items={finding.commonCauses} />
              </div>
            </section>
            <section className="border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-950">Recommended review questions</h4>
              <div className="mt-3">
                <BulletList items={finding.reviewQuestions} />
              </div>
            </section>
            <section className="border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-950">Limitations and false-positive considerations</h4>
              <div className="mt-3">
                <BulletList items={finding.limitations} />
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry metadata</h4>
            <dl className="mt-3 divide-y divide-slate-200 text-sm">
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-2">
                <dt className="text-slate-500">Finding ID</dt>
                <dd className="break-all font-mono text-xs text-slate-900">{finding.id}</dd>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-2">
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-slate-900">{finding.category}</dd>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-2">
                <dt className="text-slate-500">Runtime</dt>
                <dd className="font-medium text-slate-900">{finding.runtimeSection}</dd>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-2">
                <dt className="text-slate-500">Benchmark</dt>
                <dd className="font-medium text-slate-900">
                  {formatDensity(finding.benchmark.densityPct)} ({finding.benchmark.positiveCount}/{finding.benchmark.sampleSize})
                </dd>
              </div>
            </dl>
          </div>

          <div className="border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Related findings</h4>
            <div className="mt-3 flex flex-col gap-2">
              {finding.relatedFindingIds.map((relatedId) => (
                <Link
                  key={relatedId}
                  href={`#${relatedId}`}
                  className="border border-slate-200 px-3 py-2 text-sm font-medium text-sky-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                >
                  {findRelatedTitle(findings, relatedId)}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

export function FindingAtlasBrowser({ findings, compact = false }: FindingAtlasBrowserProps) {
  const [activeCategory, setActiveCategory] = useState<FindingReferenceCategory | "All">("All");
  const filteredFindings = useMemo(
    () => findings.filter((finding) => activeCategory === "All" || finding.category === activeCategory),
    [activeCategory, findings]
  );
  const categoryCounts = useMemo(() => {
    return new Map<FindingReferenceCategory, number>(
      FINDING_REFERENCE_CATEGORIES.map((category) => [
        category,
        findings.filter((finding) => finding.category === category).length
      ])
    );
  }, [findings]);

  if (findings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-10">
      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge tone="neutral">Canonical registry</Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                Findings registry and evidence methodology
              </h2>
              <p className="text-sm leading-7 text-slate-600">
                Each finding below has a stable ID, evidence semantics, detection notes, realistic mock evidence, related-finding links, benchmark context, and limitations for reviewer use.
              </p>
            </div>
            <div className="grid grid-cols-3 border border-slate-200 bg-white text-center sm:min-w-[21rem]">
              <div className="border-r border-slate-200 px-3 py-3">
                <p className="text-lg font-semibold text-slate-950">{findings.length}</p>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Findings</p>
              </div>
              <div className="border-r border-slate-200 px-3 py-3">
                <p className="text-lg font-semibold text-slate-950">{FINDING_REFERENCE_CATEGORIES.length}</p>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Categories</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-semibold text-slate-950">355</p>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Samples</p>
              </div>
            </div>
          </div>

          <nav aria-label="Finding categories" className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory("All")}
              className={
                activeCategory === "All"
                  ? "border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-medium text-white"
                  : "border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
              }
            >
              All ({findings.length})
            </button>
            {FINDING_REFERENCE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={
                  activeCategory === category
                    ? "border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-medium text-white"
                    : "border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
                }
              >
                {category} ({categoryCounts.get(category) ?? 0})
              </button>
            ))}
          </nav>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="min-w-0 border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <div className="sticky top-20 min-w-0 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry index</p>
              <div className="grid gap-2">
                {filteredFindings.map((finding) => (
                  <Link
                    key={finding.id}
                    href={`#${finding.id}`}
                    className="block w-full min-w-0 border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-200 hover:bg-sky-50"
                  >
                    <span className="block break-words text-sm font-semibold leading-5 text-slate-950">{finding.title}</span>
                    <span className="mt-1 block break-words font-mono text-[11px] leading-4 text-slate-500">{finding.id}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            {filteredFindings.map((finding) => (
              <FindingReferenceSection key={finding.id} finding={finding} findings={findings} />
            ))}
          </div>
        </div>
      </section>

      {!compact ? (
        <section className="space-y-4">
          <div className="max-w-3xl space-y-2">
            <Badge tone="neutral">Methodology reference</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">How detection works</h2>
            <p className="text-sm leading-7 text-slate-600">
              These sections describe the evidence architecture behind the highest-risk finding families. They use cautious terminology because observed signals can require implementation, policy, and legal review.
            </p>
          </div>
          <div className="grid gap-4">
            {DETECTION_METHODOLOGY_SECTIONS.map((section) => (
              <article key={section.id} id={section.id} className="scroll-mt-24 border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {section.categories.map((category) => (
                    <span key={category} className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {category}
                    </span>
                  ))}
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{section.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {section.evidenceExamples.map((example) => (
                    <EvidenceBlock key={`${section.id}-${example.title}`} title={example.title} code={example.code} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
