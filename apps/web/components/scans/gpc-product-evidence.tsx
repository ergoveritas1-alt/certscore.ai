import { describeGpcCmpStateComparison, type GpcCmpStateComparison, type GpcGuidance } from "@certscore/contracts";

/** Presentation only. Proof and diagnosis are shared canonical projections. */
export function GpcProductEvidence({ comparison, guidance }: { comparison?: GpcCmpStateComparison; guidance?: GpcGuidance }) {
  const onOff = (state: string) => state === "opted_out" ? "On" : "Off";
  return <div className="space-y-4 text-xs leading-5 text-zinc-600">
    {comparison ? <div>
      <table className="w-full border-collapse text-left text-xs">
        <caption className="mb-2 text-left font-semibold text-zinc-800">Site-recorded opt-out settings</caption>
        <thead><tr><th scope="col" className="p-2">Setting</th><th scope="col" className="p-2">Without GPC</th><th scope="col" className="p-2">With GPC</th></tr></thead>
        <tbody>{([['sale', 'Sale opt-out'], ['sharing', 'Sharing opt-out']] as const).map(([axis, label]) => <tr key={axis} className="border-t border-zinc-200">
          <th scope="row" className="p-2 font-medium">{label}</th><td className="p-2">{onOff(comparison.baseline[axis])}</td><td className="p-2">{onOff(comparison.gpc[axis])}</td>
        </tr>)}</tbody>
      </table>
      <details className="mt-2"><summary className="cursor-pointer font-medium">Snapshot evidence and timing</summary><p className="mt-2">{describeGpcCmpStateComparison(comparison)}</p></details>
    </div> : null}
    {guidance?.items.map(item => <details key={item.code} className="border-t border-zinc-200 pt-3">
      <summary className="cursor-pointer font-medium text-zinc-800">{item.observation}</summary>
      <div className="mt-2 space-y-2">
        {item.evidence.length ? <ul className="space-y-1">{item.evidence.map(e => <li key={e.evidenceId}>{e.recipient} · Request evidence <code className="break-all">{e.evidenceId}</code>{e.observedAtMs === undefined ? '' : ` · +${e.observedAtMs} ms from GPC visit start`}{e.priorCmpObservedAtMs === undefined ? '' : `; prior same-document CMP state +${e.priorCmpObservedAtMs} ms`}</li>)}</ul> : null}
        <p>Responsible role: {item.responsibleRole}.</p><p className="font-semibold">What to check</p>
        <ol className="list-decimal space-y-2 pl-4">{item.whatToCheck.map(step => <li key={step}>{step}</li>)}</ol>
        <p><strong>Retest:</strong> {item.retest}</p>
      </div>
    </details>)}
  </div>;
}
