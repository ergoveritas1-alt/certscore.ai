import React from "react";
import { GpcRequestTable } from "./gpc-request-table";
import { describeGpcCollectionComparison } from "@certscore/contracts";
import type { GpcActivityComparison as Comparison } from "@certscore/contracts";

export function GpcActivityComparison({ comparison }: { comparison?: Comparison }) {
  if (!comparison) return null;
  return <>
    <GpcRequestTable comparison={comparison} />
    {comparison.collectionComparison ? <details className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-700">
      <summary className="cursor-pointer font-medium">Successful advertising collection · retained evidence</summary>
      <p className="mt-2">{describeGpcCollectionComparison(comparison.collectionComparison, false)}</p>
      {([['baseline', 'Without GPC'], ['gpc', 'With GPC']] as const).map(([side, label]) => <div key={side} className="mt-2">
        <p className="font-medium">{label}</p>
        <ul className="list-inside list-disc">{comparison.collectionComparison![side].rows.map(row =>
          <li key={row.evidenceId}>{row.label} · <code className="break-all">{row.evidenceId}</code> · +{row.observedAfterDocumentCommitMs} ms after document commit · {row.identifierActivity === 'not_established' ? 'identifier activity not established' : `${row.identifierActivity.replaceAll('_', ' ')}; ${row.identifierBasis!.replaceAll('_', ' ')}`}{row.processing === 'privacy_context_observed' ? ' · privacy declarations or conflicts observed' : ''}</li>)}</ul>
      </div>)}
    </details> : null}
  </>;
}
