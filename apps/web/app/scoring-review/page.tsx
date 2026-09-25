import { CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS, CALIFORNIA_GPC_RESPONSE_POLICY_VERSION, CANONICAL_OVERALL_SCORE_VERSION } from "../../lib/scans/california-gpc-response-policy";
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
          <h1 className="text-3xl font-semibold tracking-tight">Canonical scoring policy</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">This table is generated from the canonical scoring policy used by the scoring engine. Select any row or cell to propose a future change.</p>
          <div className="mt-5 rounded-xl bg-slate-950 px-5 py-4 text-sm text-white">
            <strong>Score = max({SCORE_FLOOR}, {SCORE_BASE} − eligible deductions after shared category caps)</strong>
            <p className="mt-1 text-slate-300">The lowest possible score is {SCORE_FLOOR}. Highlighted rows apply across assessed pages under this policy. Repeated evidence counts once across the site. “Homepage only” carries the homepage deduction into the full-site score.</p>
          </div>
        </header>

        <section aria-labelledby="ccpa-scoring-heading" className="mb-7 rounded-xl border border-sky-200 bg-white p-5 sm:p-6">
          <h2 id="ccpa-scoring-heading" className="text-xl font-semibold tracking-tight">CCPA/CPRA interpretation</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">The current overall technical score combines GDPR/ePrivacy-based posture with eligible GPC and site-integrity deductions. It is not a separate CCPA/CPRA score or a determination of legal compliance. Changing the report’s review focus changes emphasis, not evidence or scoring.</p>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold text-slate-900">What deducts today</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">The eligible California GPC finding subtracts <strong className="text-slate-900">{CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS} points, once</strong>. The retained assessment must pass its versioned delivery and comparison checks. Qualifying advertising/marketing activity from the baseline must persist under GPC, with none of that qualifying activity suppressed.</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">A completed GPC observation alone does not establish a response or trigger a deduction. A reduction in tracking does not prove that GPC was legally honored. The California policy label does not establish the scan’s geographic origin.</p>
              <p className="mt-2 text-xs text-slate-500">Current GPC policy: {CALIFORNIA_GPC_RESPONSE_POLICY_VERSION}. Historical evidence keeps its recorded version.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">What stays score-neutral</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                <li>Indeterminate or insufficiently verified GPC comparisons.</li>
                <li>Analytics-only activity or no qualifying advertising/marketing activity in the baseline.</li>
                <li>Partial suppression, which remains a review signal under the current policy.</li>
                <li>Suppression of all qualifying baseline activity, which does not establish broader compliance.</li>
              </ul>
              <p className="mt-2 text-sm font-medium text-slate-900">No deduction does not mean passed. Missing evidence remains a coverage limitation.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Evidence-only CCPA/CPRA checks</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Observed Do Not Sell/Share, Your Privacy Choices and Cookie Settings surfaces remain distinct. Their presence and retained notice passages create no additional CCPA/CPRA deductions. Missing surface evidence is not automatically a failure.</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">The tracking inventory supports review; it does not independently establish sale or sharing. Runtime activity may still support existing technical deductions in the table below.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">What remains unassessed</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                <li>Successful execution of a sale/share opt-out. A cookie-banner Reject action is a separate observation.</li>
                <li>Legal adequacy of notice text and notice placement at collection points.</li>
                <li>Vendor-specific sale/sharing treatment and GPC honoring.</li>
              </ul>
              <p className="mt-2 text-sm leading-6 text-slate-600">A future CCPA/CPRA score needs its own approved evidence gates, deduction policy and calibration. No proposed weights are included in the current table.</p>
            </div>
          </div>
        </section>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="border-b border-slate-200 px-5 py-4 text-left font-semibold">Canonical deductions <span className="ml-2 text-xs font-normal text-slate-500">Points subtracted · {SCORING_POLICY_VERSION} · {CANONICAL_OVERALL_SCORE_VERSION}</span></caption>
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>{["Deduction type", "Single page", "Full site", "Shared category cap"].map(label => <th key={label} scope="col" className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {SCORING_RULES.map((rule, index) => (
                <tr key={rule.id} id={`deduction-${rule.anchor}`} className={`border-t border-slate-100 align-top hover:bg-sky-50 ${rule.siteWide ? "bg-sky-50/50" : ""}`}>
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
          <p>Missing or unverified evidence does not itself create a deduction. An inventory “Review” label does not automatically deduct points.</p>
          <p>Source of truth: scoring-policy.ts. Evidence eligibility remains governed by canonical concern policy. Stored historical reports retain their recorded policy version.</p>
        </footer>
      </div>
    </main>
  );
}
