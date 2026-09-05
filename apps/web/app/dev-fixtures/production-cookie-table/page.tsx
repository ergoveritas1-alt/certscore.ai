import { notFound } from "next/navigation";
import Link from "next/link";
import { RuntimeInventoryTable } from "../../../components/scans/report-lab/shadow-scan-report";
import { SHADOW_REPORT, type ShadowReportData } from "../../../components/scans/report-lab/shadow-report-data";
import { runtimeGraphUiFixture } from "../../../components/scans/runtime-evidence-graph-ui-fixture";
import { loadAnonymousPersistedScanReportProjection } from "../../../server/scans/scan-report-projection";
import { buildTimelineReportModel } from "../../../components/scans/report-lab/timeline-report-model";
import { retainedPocketTacticsExample, retainedPferdeklinikExample } from "./retained-example";

export const dynamic = "force-dynamic";

export default async function ProductionCookieTablePreview({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const real = (await searchParams).example === "real";
  const horse = (await searchParams).example === "pferdeklinik";
  const pocket = (await searchParams).example === "pocket";
  let report: ShadowReportData;
  if (horse) {
    try {
      report = await retainedPferdeklinikExample();
    } catch {
      return <main className="p-8"><h1 className="text-lg font-semibold">Pferdeklinik · retained report preview</h1><p className="mt-2">The local report files are unavailable or could not be verified. No substitute evidence is shown.</p></main>;
    }
  } else if (pocket) {
    report = await retainedPocketTacticsExample();
  } else if (real) {
    const record = await loadAnonymousPersistedScanReportProjection({ scanId: "cebfe71f-5644-4b11-ba97-67dbbf5d16c9" });
    if (!record) return <main className="p-8">The retained public report is not available through the verified report loader. <Link href="?example=demo">Open the labelled relationship demo</Link>.</main>;
    report = buildTimelineReportModel(record);
  } else {
    const base = { ...SHADOW_REPORT.inventory[0]!, controllingEntity: "Not retained", transferMechanism: "Unknown", confidence: "Unknown", priority: "Review", category: "Review", serverLocation: "Not retained", requestNames: "Not retained", relationship: "Unknown", entityRelationship: "Unknown" };
    report = { ...SHADOW_REPORT, metrics: { ...SHADOW_REPORT.metrics, vendors: 3, domains: 2 }, runtimeEvidenceGraph: runtimeGraphUiFixture(), inventory: [
      { ...base, vendor: "Google", name: "Synthetic measurement request", purpose: "Analytics", domains: "metrics.fixture.test", observed: "40 ms", evidence: "Review", evidenceJson: { requestDetails: [{ hostname: "metrics.fixture.test", path: "/collect", method: "GET" }] } },
      { ...base, vendor: "Measurement cookie", name: "fixture_id", type: "Cookie", domains: "metrics.fixture.test", observed: "60 ms", purpose: "Unknown", evidence: "Review", evidenceJson: { cookieDetails: [{ evidenceRefs: ["cookie"] }] } },
      { ...base, vendor: "Unattributed resource", name: "Unresolved endpoint", domains: "unresolved.fixture.test", observed: "Timing unavailable", purpose: "Unknown", evidence: "Review", evidenceJson: {} },
    ] };
  }
  return <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-lg font-semibold text-slate-900">Cookies &amp; trackers · production-layout preview</h1><nav className="flex gap-4 text-sm text-sky-700"><Link href="?example=demo">Relationship demo</Link><Link href="?example=real">Real retained scan</Link></nav></div>
    {!pocket ? <p className="mt-2 text-sm text-slate-600">{horse ? `Fresh pferdeklinik-roentorf.de scan · September 5, 2026, 17:41 UTC · Frankfurt. Canonical inventory with 173 pre-consent resources and 241 retained links available for inspection. Coverage is partial; direct and inferred links are labelled separately. ${report.runtimeEvidenceGraph?.graphs.some(graph => graph.edges.length > 0) ? "Expand connected resources before the vendor to inspect retained relationships." : "This report has no retained parent–child relationship links; none have been invented."}` : real ? "Real retained amazon.de scan · September 4, 2026. This local report has no retained relationship graph; no links have been invented." : "Synthetic relationship demo. Expand connected resources before the vendor to see child rows directly in the main table. Linked rows are evidence occurrences, not extra inventory counts. This is not evidence from a real website."}</p> : null}
    {pocket ? <p className="mt-3 text-sm text-sky-900">Real Pocket Tactics capture · September 5, 2026, 05:52 UTC. Four selected parent scripts from 178 pre-consent resources / 257 retained links. Coverage is partial: 414 nodes and 19 edges exceeded capture limits; 19 request initiators unresolved. These are read-only evidence rows, not a re-scored inventory. Expand connected resources before the vendor.</p> : null}
    <RuntimeInventoryTable report={report} initiallyOpen />
  </main>;
}
