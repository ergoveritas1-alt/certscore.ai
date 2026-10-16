import { CANONICAL_OVERALL_SCORE_VERSION } from "../../lib/scans/california-gpc-response-policy";
import { CALIFORNIA_REGULATORY_SCORE_RULES, CALIFORNIA_REGULATORY_SCORE_VERSION } from "../../lib/scans/california-regulatory-score";
import { SCORE_BASE, SCORE_FLOOR, SCORING_RULES, SCORING_FAMILIES, SCORING_POLICY_VERSION, scoringRuleDescription } from "../../lib/scans/scoring-policy";

export const metadata = {
  title: "Scoring policy review",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ScoringReviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-700">CertScore · Scoring policy</p>
          <h1 className="text-3xl font-semibold tracking-tight">EU and California scoring policies</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">The two review postures use separate scoring policies over the same retained visit. California-specific findings affect the California score; the established overall score uses GDPR/ePrivacy-weighted rules.</p>
          <div className="mt-5 rounded-xl bg-slate-950 px-5 py-4 text-sm text-white">
            <strong>EU/overall score = max({SCORE_FLOOR}, {SCORE_BASE} − eligible deductions after shared category caps)</strong>
            <p className="mt-1 text-slate-300">The California score has its own policy below. The EU/overall score has a floor of {SCORE_FLOOR}. Highlighted rows apply across assessed pages under that policy. Repeated evidence counts once across the site. “Homepage only” carries the homepage deduction into the full-site score.</p>
          </div>
        </header>

        <section aria-labelledby="ccpa-scoring-heading" className="mb-7 rounded-xl border border-sky-200 bg-white p-5 sm:p-6">
          <h2 id="ccpa-scoring-heading" className="text-xl font-semibold tracking-tight">CCPA/CPRA posture score</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">The California starting-page score uses its own versioned policy ({CALIFORNIA_REGULATORY_SCORE_VERSION}). It begins at 100 and deducts only for supported, reportable canonical findings. The shared privacy-notice gap can affect both postures. GPC is excluded from customer scoring. No score is shown when California assessment coverage is incomplete and no supported finding was retained.</p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold">California-specific deductions · starting page</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-4 py-2">Supported finding</th><th scope="col" className="px-4 py-2">Points</th><th scope="col" className="px-4 py-2">Evidence gate</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {CALIFORNIA_REGULATORY_SCORE_RULES.map(rule => <tr key={rule.policyKey}><th scope="row" className="px-4 py-3 font-medium">{rule.label}</th><td className="px-4 py-3">−{rule.points}</td><td className="px-4 py-3">Verified typed assessment → eligible concern policy → reportable unified finding</td></tr>)}
                <tr><th scope="row" className="px-4 py-3 font-medium">Privacy notice unavailable (shared)</th><td className="px-4 py-3">−10</td><td className="px-4 py-3">Canonical checklist gap from retained policy evidence</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">A complete named-choice inspection can support a bounded score of 100 when none of these findings is observed. Limited inspection with an eligible finding can produce a score marked limited; limited inspection without one remains unscored. Applicability, notice adequacy, alternative rights methods and vendor-specific sale/sharing treatment remain outside this score. A score is a risk signal, not a compliance grade.</p>
        </section>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="border-b border-slate-200 px-5 py-4 text-left font-semibold">Canonical deductions <span className="ml-2 text-xs font-normal text-slate-500">Points subtracted · {SCORING_POLICY_VERSION} · {CANONICAL_OVERALL_SCORE_VERSION}</span></caption>
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>{["Deduction type", "Single page", "Full site", "Shared category cap"].map(label => <th key={label} scope="col" className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {SCORING_RULES.map((rule, index) => (
                <tr key={rule.id} id={`deduction-${rule.family === "accessibility" ? rule.id : rule.anchor}`} className={`border-t border-slate-100 align-top hover:bg-sky-50 ${rule.siteWide ? "bg-sky-50/50" : ""}`}>
                  <th scope="row" className="w-[28%] px-5 py-4 font-medium"><span className="mr-2 text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span>{rule.label}</th>
                  <td className="w-[26%] px-5 py-4 leading-6">{scoringRuleDescription(rule)}</td>
                  <td className="w-[29%] px-5 py-4 leading-6 text-slate-600">{rule.siteWide ? `Site-wide: ${scoringRuleDescription(rule)}. ${rule.identity ? rule.family === "site_integrity" ? "Each verified page/link occurrence counts once; the cap applies once across the site." : "Each eligible identity counts once." : "Applied once across assessed pages."}` : "Homepage only; applied once"}</td>
                  <td className="px-5 py-4 text-slate-600">{SCORING_FAMILIES[rule.family].label} · {SCORING_FAMILIES[rule.family].cap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mt-5 space-y-2 text-xs leading-5 text-slate-500">
          <p>Caps are shared across rows in the same category. Repeated page observations do not multiply flat deductions. Identity-based deductions count each eligible identity once across the site.</p>
          <p>Accessibility deducts at most {SCORING_FAMILIES.accessibility.cap} points from the shared overall score. Each category charges once across assessed pages. Keyboard and reproduced focus barriers share one allowance. Overlapping image/link barriers charge the stronger category once; unresolved overlap receives the same conservative allowance.</p>
          <p>Obsolete transfer guidance deducts {SCORING_RULES.find(rule => rule.id === "outdated_transfer_framework_reference")?.points} points once across the site only when verified retained policy text presents it as current guidance. Historical or explicitly corrected references remain neutral. This is a disclosure-quality finding, not proof of unlawful transfers.</p>
          <p>Missing or unverified evidence does not itself create a deduction. An inventory “Review” label does not automatically deduct points.</p>
          <p>Sources of truth: scoring-policy.ts and california-regulatory-score.ts. Evidence eligibility remains governed by canonical concern policy. Stored historical reports retain their recorded policy version.</p>
        </footer>
      </div>
    </main>
  );
}
