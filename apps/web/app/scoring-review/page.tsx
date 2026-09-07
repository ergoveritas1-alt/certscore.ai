import { SCORE_BASE, SCORE_FLOOR, SCORING_RULES, SCORING_FAMILIES, SCORING_POLICY_VERSION, scoringRuleDescription } from "../../lib/scans/scoring-policy";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Scoring policy review",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ScoringReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-700">CertScore · Local policy review</p>
          <h1 className="text-3xl font-semibold tracking-tight">Canonical scoring policy</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">This table is generated from the canonical scoring policy used by the scoring engine. Select any row or cell to propose a future change.</p>
          <div className="mt-5 rounded-xl bg-slate-950 px-5 py-4 text-sm text-white">
            <strong>Score = max({SCORE_FLOOR}, {SCORE_BASE} − eligible deductions after shared category caps)</strong>
            <p className="mt-1 text-slate-300">The lowest possible score is {SCORE_FLOOR}. Highlighted rows apply across assessed pages under this policy. Repeated evidence counts once across the site. “Homepage only” carries the homepage deduction into the full-site score.</p>
          </div>
        </header>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="border-b border-slate-200 px-5 py-4 text-left font-semibold">Canonical deductions <span className="ml-2 text-xs font-normal text-slate-500">Points subtracted · {SCORING_POLICY_VERSION}</span></caption>
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>{["Deduction type", "Single page", "Full site", "Shared category cap"].map(label => <th key={label} scope="col" className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {SCORING_RULES.map((rule, index) => (
                <tr key={rule.id} id={`deduction-${rule.anchor}`} className={`border-t border-slate-100 align-top hover:bg-sky-50 ${rule.siteWide ? "bg-sky-50/50" : ""}`}>
                  <th scope="row" className="w-[28%] px-5 py-4 font-medium"><span className="mr-2 text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span>{rule.label}</th>
                  <td className="w-[26%] px-5 py-4 leading-6">{scoringRuleDescription(rule)}</td>
                  <td className="w-[29%] px-5 py-4 leading-6 text-slate-600">{rule.siteWide ? `Site-wide: ${scoringRuleDescription(rule)}. ${rule.identity ? "Each eligible identity counts once." : "Applied once across assessed pages."}` : "Homepage only; applied once"}</td>
                  <td className="px-5 py-4 text-slate-600">{SCORING_FAMILIES[rule.family].label} · {SCORING_FAMILIES[rule.family].cap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mt-5 space-y-2 text-xs leading-5 text-slate-500">
          <p>Caps are shared across rows in the same category. Repeated page observations do not multiply flat deductions. Identity-based deductions count each eligible identity once across the site.</p>
          <p>Missing or unverified evidence does not itself create a deduction. An inventory “Review” label does not automatically deduct points.</p>
          <p>Source of truth: scoring-policy.ts. Evidence eligibility remains governed by canonical concern policy. Stored historical reports retain their recorded policy version.</p>
        </footer>
      </div>
    </main>
  );
}
