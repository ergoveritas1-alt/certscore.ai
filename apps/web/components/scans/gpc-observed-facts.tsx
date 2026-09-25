import React from "react";

export function GpcObservedFacts({ facts }: { facts: Array<{ label: string; value: string }> }) {
  if (!facts.length) return null;
  return <dl aria-label="Observed GPC results" className="grid gap-3 sm:grid-cols-2">
    {facts.map(fact => <div key={fact.label} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs text-zinc-500">{fact.label}</dt>
      <dd className="mt-1 text-sm font-semibold text-zinc-900">{fact.value}</dd>
    </div>)}
  </dl>;
}
