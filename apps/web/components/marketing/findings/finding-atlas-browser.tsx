"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type FindingReferenceItem
} from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingReferenceItem[];
  compact?: boolean;
};

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

function JsonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M8 7H5.8c-.8 0-1.3.5-1.3 1.3v2.2c0 .8-.5 1.5-1.2 1.5.7 0 1.2.7 1.2 1.5v2.2c0 .8.5 1.3 1.3 1.3H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 7h2.2c.8 0 1.3.5 1.3 1.3v2.2c0 .8.5 1.5 1.2 1.5-.7 0-1.2.7-1.2 1.5v2.2c0 .8-.5 1.3-1.3 1.3H16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 8.5h2M10.5 12h3M11 15.5h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
  finding
}: {
  finding: FindingReferenceItem;
}) {
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const sampleJson = useMemo(() => JSON.stringify(finding.sample, null, 2), [finding.sample]);

  return (
    <article id={finding.id} className="min-w-0">
      <div className="min-w-0 space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected finding</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{finding.title}</h2>
          <p className="text-base leading-7 text-slate-600">{finding.observed}</p>
        </div>

        {finding.userImpact ? (
          <section className="border border-sky-100 bg-sky-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">User-impact example</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{finding.userImpact}</p>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">Example evidence</h3>
            <button
              type="button"
              onClick={() => setIsJsonOpen((current) => !current)}
              aria-expanded={isJsonOpen}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
            >
              <JsonIcon />
              {isJsonOpen ? "Hide JSON" : "View JSON"}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {finding.exampleEvidence.map((example) => (
              <EvidenceBlock key={`${finding.id}-${example.title}`} title={example.title} code={example.code} />
            ))}
          </div>
          {isJsonOpen ? (
            <EvidenceBlock title="Full JSON evidence card" code={sampleJson} />
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Common causes</h3>
            <div className="mt-3">
              <BulletList items={finding.commonCauses} />
            </div>
          </section>
          <section className="border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Recommended review questions</h3>
            <div className="mt-3">
              <BulletList items={finding.reviewQuestions} />
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

export function FindingAtlasBrowser({ findings, compact = false }: FindingAtlasBrowserProps) {
  const [activeFindingId, setActiveFindingId] = useState("pre_consent_tracking_detected");
  const activeFinding = useMemo(
    () => findings.find((finding) => finding.id === activeFindingId) ?? findings[0],
    [activeFindingId, findings]
  );

  if (findings.length === 0 || !activeFinding) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="border border-slate-200 bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
            <div className="sticky top-20 min-w-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry index</p>
              <div className="mt-3 grid max-h-[14rem] gap-2 overflow-y-auto pr-1 lg:max-h-[34rem]">
                {findings.map((finding) => {
                  const isActive = finding.id === activeFinding.id;

                  return (
                    <button
                      key={finding.id}
                      type="button"
                      onClick={() => setActiveFindingId(finding.id)}
                      className={
                        isActive
                          ? "block w-full min-w-0 border border-slate-950 bg-slate-950 px-3 py-3 text-left text-white"
                          : "block w-full min-w-0 border border-slate-200 bg-white px-3 py-3 text-left text-slate-800 hover:border-sky-200 hover:bg-sky-50"
                      }
                    >
                      <span className="block break-words text-sm font-semibold leading-5">{finding.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="min-w-0 p-5 sm:p-6 lg:p-8">
            <FindingReferenceSection key={activeFinding.id} finding={activeFinding} />
          </div>
        </div>
      </section>

      {!compact ? (
        <section className="border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Related reading</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
              { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
              { href: "/guides/rtb-cookie-syncing", label: "Third-party cookies and RTB sync" },
              { href: "/guides/session-replay-risk", label: "Session replay risk" },
              { href: "/guides/wcag-website-checklist", label: "Accessibility signals" }
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
