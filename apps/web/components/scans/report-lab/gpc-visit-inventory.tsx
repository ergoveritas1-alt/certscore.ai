import { gpcRequestCategories } from "../../../lib/scans/gpc-request-window";
import type { GpcResponseAssessment } from "@certscore/contracts";
import { gpcCookieInventory } from "../../../lib/scans/gpc-cookie-inventory";

/** Positive GPC-side identities only. Cookie purpose is a current registry lookup,
 * independent of the historical finding and its score. */
export function GpcVisitInventory({ assessment }: { assessment: GpcResponseAssessment }) {
  if (assessment.contractVersion === "certscore.gpc-response-assessment.v1") return null;
  const { cookies, trackers } = assessment.comparison.deltas;
  const services = new Map<string, Map<string, Set<string>>>();
  for (const value of [...trackers.shared, ...trackers.gpcOnly]) {
    const [vendor, product, purpose, extra] = value.split("|");
    if (extra !== undefined || !vendor || !product || !purpose) continue;
    const group = purpose === "advertising" || purpose === "marketing" ? "advertisingMarketing"
      : purpose === "analytics" || purpose === "session_replay" ? "analyticsReplay" : null;
    if (!group) continue;
    const vendors = services.get(group) ?? new Map<string, Set<string>>();
    const products = vendors.get(vendor) ?? new Set<string>();
    if (product !== "unspecified" && product !== vendor) products.add(product);
    vendors.set(vendor, products);
    services.set(group, vendors);
  }
  const rows = gpcCookieInventory(assessment);
  const flagged = rows.filter(row => row.essentiality === "non_essential");
  const flaggedNames = [...new Set(flagged.map(row => row.name))];
  if (!services.size && !cookies.gpcCount) return null;
  return <div className="space-y-2">
    {gpcRequestCategories.map(([key, label]) => {
      const vendors = services.get(key);
      if (!vendors) return null;
      const names = [...vendors].map(([vendor, products]) => products.size ? [...products].sort().join(", ") : vendor);
      return <p key={key}><strong className="font-medium text-zinc-800">{label}</strong> · {names.sort().join(", ")}</p>;
    })}
    {trackers.gpcCount > trackers.shared.length + trackers.gpcOnly.length ? <p>Showing retained service examples.</p> : null}
    {flagged.length > 0 ? <p><strong className="font-medium text-zinc-800">Cookie identities classified non-essential</strong> · {flaggedNames.slice(0, 4).join(", ")}{flaggedNames.length > 4 ? " …" : ""}</p> : null}
    {cookies.gpcCount > 0 ? <details className="rounded-md border border-zinc-200 px-3 py-2">
      <summary className="cursor-pointer text-zinc-800">{cookies.gpcCount} cookie {cookies.gpcCount === 1 ? "identity" : "identities"} in snapshots or write observations{flagged.length > 0 ? ` · ${rows.length < cookies.gpcCount ? "at least " : ""}${flagged.length} classified non-essential` : ""}</summary>
      {rows.length > 0 ? <div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-left text-xs">
        <caption className="pb-2 text-left text-zinc-600">Cookie identities and current registry classifications. A write attempt alone does not confirm storage.</caption>
        <thead><tr><th scope="col" className="p-1">Cookie</th><th scope="col" className="p-1">Purpose</th><th scope="col" className="p-1">Classification</th></tr></thead>
        <tbody>{[...flagged, ...rows.filter(row => row.essentiality !== "non_essential")].map(row => <tr key={row.key} className="border-t border-zinc-100">
          <th scope="row" className="break-all p-1 font-medium">{row.name}<span className="block font-normal text-zinc-500">{row.domain}{row.path}</span></th>
          <td className="p-1 capitalize">{row.category.replaceAll("_", " ")}</td><td className="p-1">{row.essentiality === "non_essential" ? "Non-essential" : row.inventoryEvidence}</td>
        </tr>)}</tbody>
      </table></div> : null}
      {rows.length < cookies.gpcCount ? <p className="mt-2">{rows.length} of {cookies.gpcCount} identities available for classification.</p> : null}
    </details> : null}
  </div>;
}
