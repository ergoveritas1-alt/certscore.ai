import { SESSION_REPLAY_STUDY_LINK } from "../../lib/marketing/research-links";
import { SiteHeader } from "../layout/site-header";
import { SiteFooter } from "../layout/site-footer";
import { AiVisibilityContent } from "./ai-visibility-content";
import { HISTORICAL_BENCHMARK as archive } from "../../lib/marketing/historical-benchmark";
import { createPublicArticleSchema, createBreadcrumbSchema } from "../../lib/seo";

export function HistoricalBenchmarkPage({ title, description, path, ids }: {
  title: string; description: string; path: string; ids?: readonly string[];
}) {
  const rows = archive.rows.filter((row) => !ids || ids.includes(row.id));
  return <main className="min-h-screen bg-slate-50"><SiteHeader />
    <AiVisibilityContent badge="Historical calibration notes" title={title} intro={description} path={path}
      showEvidenceExamples={false}
      schema={[createPublicArticleSchema({ title, description, path }), createBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Benchmarks", path: "/benchmarks" }, { name: title, path }])]}
      evidence={<section aria-labelledby="provenance-heading" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-slate-700">
        {path === "/benchmarks/session-replay-risk-2026" ? <p className="mb-4"><a className="font-semibold text-sky-800 underline" href={SESSION_REPLAY_STUDY_LINK.href}>{SESSION_REPLAY_STUDY_LINK.label}</a> for the October 2026 analysis with explicit denominators and exclusions. The historical counts below remain separate.</p> : null}
        <h2 id="provenance-heading" className="text-xl font-semibold text-slate-950">Historical aggregate — provenance incomplete</h2>
        <p className="mt-3">These counts were recorded in the source on May 18, 2026. That is the aggregate’s source date, not a verified scan date range. The declared scope was {archive.declaredScope}, with an approximate denominator of {archive.declaredSampleSize.toLocaleString()} scan records and possible rank-band overlap.</p>
        <p className="mt-3">The complete deduplicated scan manifest, exact scan dates, regions, scanner versions, and exclusion accounting are not established by this published aggregate. Counts are preserved for transparency; we do not present them as current website prevalence, a representative study, or a reproducible research dataset.</p>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <div><dt className="font-semibold">Source recorded</dt><dd>May 18, 2026</dd></div>
          <div><dt className="font-semibold">Editorial review</dt><dd>September 20, 2026</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">Source revision</dt><dd className="break-all font-mono">{archive.sourceRevision}</dd></div>
        </dl>
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left">
          <caption className="pb-3 text-left font-semibold">Recorded counts; findings can overlap within a scan</caption>
          <thead><tr className="border-b border-amber-200"><th scope="col" className="p-2">Signal</th><th scope="col" className="p-2">Recorded count</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-amber-100"><th scope="row" className="p-2 font-normal">{row.label}</th><td className="p-2 tabular-nums">{row.count}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-4"><a className="font-semibold text-sky-800 underline" href="/resources/historical-benchmark-2026.json" download>Download the labeled historical aggregate (JSON)</a></p>
      </section>}
      sections={[
        { title: "What the signal categories mean", paragraphs: ["Pre-consent request activity and third-party cookie storage are related but distinct observations. A broad fingerprinting-related signal is not interchangeable with probable fingerprinting. Session recording presence does not prove that sensitive input was captured.", "These are historical classifications. Their counts do not establish legal violations or imply that current scanner rules would produce identical results."] },
        { title: "What a reproducible benchmark needs", paragraphs: ["A defined sampling frame and retained scan manifest; exact collection dates; region and browser conditions; scanner and rule versions; successful, failed, and excluded counts; a deduplication method; and bounded evidence for the measured findings.", "Any future study must report its own denominator and collection method. We will not silently carry these historical counts into a new study or treat repeated scans as unique sites."] },
        { title: "Use individual evidence for decisions", paragraphs: ["For a website you maintain, review the actual target, date, consent state, requests, storage, and coverage. A historical frequency is not a severity score and cannot decide whether that website’s behavior is appropriate."] }
      ]}
      relatedLinks={[{ href: "/guides/consent-report-example", label: "Retained report example" }, { href: "/guides/detect-tracking-before-consent", label: "Test pre-consent activity" }, { href: "/guides/rtb-cookie-syncing", label: "Understand RTB cookie syncing" }, { href: "/editorial-policy", label: "Editorial standards" }, { href: "/benchmarks", label: "All benchmark notes" }]} />
    <SiteFooter /></main>;
}
