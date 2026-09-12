import React from "react";
import type { ShadowReportData } from "./shadow-report-data";

type InventoryRow = ShadowReportData["inventory"][number];

function consentTiming(row: InventoryRow) {
  return typeof row.evidenceJson?.preConsent === "boolean"
    ? row.evidenceJson.preConsent ? "Yes" : "No"
    : "Not retained";
}

export function inventoryRequestEvidenceLabel(row: InventoryRow) {
  const detailCount = Array.isArray(row.evidenceJson?.requestDetails) ? row.evidenceJson.requestDetails.length : 0;
  if (typeof row.requestCount === "number") {
    return `${row.requestCount} request ${row.requestCount === 1 ? "event" : "events"}${detailCount ? ` · ${detailCount} retained ${detailCount === 1 ? "detail" : "details"}` : " · detailed records unavailable"}`;
  }
  if (detailCount) return `${detailCount} retained request ${detailCount === 1 ? "detail" : "details"} · total event count unavailable`;
  return row.type === "Embed / iframe" ? "Iframe observation; no linked request details retained" : "No request details or event count retained";
}

/** Human-readable summary only. Complete supporting records stay in the single
 * technical-evidence payload, rather than recursively duplicating this panel. */
export function InventoryRowSummary({ row }: { row: InventoryRow }) {
  const supporting = Array.isArray(row.evidenceJson?.supportingObservations)
    ? row.evidenceJson.supportingObservations as InventoryRow[] : [];
  const fields = [
    ["Service", row.name],
    ["Purpose", row.purpose],
    ["Priority", row.evidence],
    ["First observed", row.observed],
    ["Pre-consent", consentTiming(row)],
    ["Domains", row.domains],
    ["Site relationship", `${row.relationship} · entity ${row.entityRelationship.toLowerCase()}`],
    ["Controlling entity", row.controllingEntity],
  ];
  return <section className="space-y-3" aria-label="Resource summary">
    <h4 className="text-sm font-semibold text-zinc-900">Resource summary</h4>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([label, value]) => <div className="min-w-0" key={label}>
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-1 break-words text-zinc-700">{value}</dd>
      </div>)}
    </dl>
    {row.evidence === "Review" ? <p className="text-zinc-500">Requires review; this classification is not a confirmed tracking finding.</p> : null}
    <p className="text-zinc-600">{inventoryRequestEvidenceLabel(row)}</p>
    {supporting.length ? <div className="space-y-2 border-t border-zinc-200 pt-3">
      <h5 className="font-medium text-zinc-800">Supporting observations ({supporting.length})</h5>
      <ul className="space-y-1 text-zinc-600">
        {supporting.map((observation, index) => <li className="break-words" key={index}>
          {observation.type} · {observation.observed} · {observation.domains}
          {consentTiming(observation) === "Yes" ? " · before consent" : ""}
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
