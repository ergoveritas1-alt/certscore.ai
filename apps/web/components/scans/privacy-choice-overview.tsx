import { buildPrivacyChoiceExperience, type PrivacyChoiceExperienceInput } from "../../lib/scans/privacy-choice-experience";
import { DeveloperRetestPackage } from "./developer-retest-package";
import { EvidenceJumpLink } from "./evidence-jump-link";

/** Summarizes existing canonical projections; does not determine findings. */
export function PrivacyChoiceOverview({ report }: { report: PrivacyChoiceExperienceInput }) {
  const result = buildPrivacyChoiceExperience(report);
  return <section aria-label="GPC and opt-out results" className="mt-6 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
    <h3 className="text-base font-semibold text-zinc-900">{result.title}</h3>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {result.facts.map(fact => <div key={fact.label} className="min-w-0">
        <dt className="text-xs font-medium text-zinc-500">{fact.label}</dt>
        <dd className="mt-1 text-sm font-semibold text-zinc-900">{fact.value}</dd>
        <dd className="mt-1 text-xs leading-5 text-zinc-600">{fact.detail}</dd>
      </div>)}
    </dl>
    <div className="mt-4 border-t border-zinc-200 pt-4 text-sm text-zinc-800">
      <p className="font-medium">{result.activity}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-600">{result.coverage} Collection alone does not establish sale/sharing purpose or a legal violation.</p>
      {result.recipients.length ? <p className="mt-2 text-xs text-zinc-600">Recipients in retained request references: {[...new Set(result.recipients.map(row => row.label))].join(", ")}.</p> : null}
      <EvidenceJumpLink targetId="gpc-evidence" className="mt-2 inline-block text-xs font-medium underline underline-offset-2">Inspect GPC evidence and comparison</EvidenceJumpLink>
    </div>
    <DeveloperRetestPackage text={result.packageText} />
  </section>;
}
